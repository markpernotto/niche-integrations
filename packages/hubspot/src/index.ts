/**
 * HubSpot outbound integration — syncs Niche leads and calls to HubSpot.
 *
 * Direction: Niche → HubSpot
 *
 * What it does:
 *   - Polls Niche every 15 min for new/updated leads
 *   - Creates a HubSpot Contact + Deal for each new lead (deduplicates by phone/email)
 *   - Closes the HubSpot Deal when a lead is marked done=true in Niche
 *   - Polls Niche for completed calls and logs them as HubSpot Call engagements
 *   - Stores niche_lead_id as a custom property on every HubSpot Contact
 *
 * Setup:
 *   1. Set HUBSPOT_ACCESS_TOKEN (Private App token from HubSpot)
 *   2. Set NICHE_HUBSPOT_CLIENT_ID / NICHE_HUBSPOT_CLIENT_SECRET (Niche app with leads:read + calls:read)
 *   3. Set NICHE_BUSINESS_ID
 *   4. Optionally set HUBSPOT_PIPELINE_ID + HUBSPOT_DEAL_STAGE_ID + HUBSPOT_CLOSED_STAGE_ID
 *   5. Build and start: pnpm build:hubspot && pnpm start:hubspot
 *   6. Trigger initial sync: POST /sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import type { NicheLeadFull, NicheCall, NichePagedResponse } from './types';
import {
  nicheLeadToContactProps,
  nicheLeadToDealProps,
  nicheCallToEngagementProps,
  extractEmailFromInfo,
} from './transformer';
import {
  searchContactByPhone,
  searchContactByEmail,
  createContact,
  updateContact,
  createDeal,
  associateContactWithDeal,
  closeDeal,
  createCallEngagement,
  ensureNicheLeadIdProperty,
} from './hubspot';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN || '';
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const nicheClientId = process.env.NICHE_HUBSPOT_CLIENT_ID || '';
const nicheClientSecret = process.env.NICHE_HUBSPOT_CLIENT_SECRET || '';
const nicheBase = process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';
const PORT = parseInt(process.env.PORT || process.env.HUBSPOT_PORT || '7777', 10);

const POLL_INTERVAL_MS = parseInt(
  process.env.HUBSPOT_POLL_INTERVAL_MS || String(15 * 60 * 1000),
  10
);
const hubspotPipeline = process.env.HUBSPOT_PIPELINE_ID || undefined;
const hubspotDealStage = process.env.HUBSPOT_DEAL_STAGE_ID || undefined;
const hubspotClosedStage = process.env.HUBSPOT_CLOSED_STAGE_ID || 'closedwon';

// ---------------------------------------------------------------------------
// Niche auth — client_credentials for polling leads + calls
// ---------------------------------------------------------------------------
let nicheTokenCache: { value: string; expiresAt: number } | null = null;

async function getNicheToken(): Promise<string> {
  if (nicheTokenCache && Date.now() < nicheTokenCache.expiresAt) {
    return nicheTokenCache.value;
  }
  const res = await axios.post<{ access_token: string; expires_in: number }>(
    `${nicheBase}/api/partner/v1/oauth/token`,
    {
      grant_type: 'client_credentials',
      client_id: nicheClientId,
      client_secret: nicheClientSecret,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  nicheTokenCache = {
    value: res.data.access_token,
    expiresAt: Date.now() + (res.data.expires_in - 60) * 1000,
  };
  return nicheTokenCache.value;
}

// ---------------------------------------------------------------------------
// Niche API helpers — leads and calls
// ---------------------------------------------------------------------------
async function fetchNicheLeads(businessId: string): Promise<NicheLeadFull[]> {
  const token = await getNicheToken();
  const all: NicheLeadFull[] = [];
  let page = 1;

  while (true) {
    const res = await axios.get<NichePagedResponse<NicheLeadFull>>(
      `${nicheBase}/api/partner/v1/businesses/${businessId}/leads`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, page_size: 100 },
      }
    );
    const data = res.data;
    const items = Array.isArray(data) ? (data as NicheLeadFull[]) : (data.items ?? []);
    all.push(...items);
    const total = Array.isArray(data) ? items.length : (data.total ?? items.length);
    if (all.length >= total) break;
    page++;
  }

  return all;
}

async function fetchNicheCalls(businessId: string): Promise<NicheCall[]> {
  const token = await getNicheToken();
  const all: NicheCall[] = [];
  let page = 1;

  while (true) {
    const res = await axios.get<NichePagedResponse<NicheCall>>(
      `${nicheBase}/api/partner/v1/businesses/${businessId}/calls`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'COMPLETED', page, page_size: 100 },
      }
    );
    const data = res.data;
    const items = Array.isArray(data) ? (data as NicheCall[]) : (data.items ?? []);
    all.push(...items);
    const total = Array.isArray(data) ? items.length : (data.total ?? items.length);
    if (all.length >= total) break;
    page++;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Dedup + state tracking
// ---------------------------------------------------------------------------
const processedLeadIds = new Map<string, number>(); // nicheLeadId → timestamp
const closedLeadIds = new Set<string>(); // leads whose deals we've closed
const processedCallIds = new Map<string, number>(); // nicheCallId → timestamp

// In-session map of nicheLeadId → HubSpot { contactId, dealId }
const leadHubSpotMap = new Map<string, { contactId: string; dealId: string }>();

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [id, ts] of processedLeadIds) if (ts < cutoff) processedLeadIds.delete(id);
  for (const [id, ts] of processedCallIds) if (ts < cutoff) processedCallIds.delete(id);
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------
async function syncLead(lead: NicheLeadFull): Promise<'created' | 'closed' | 'skipped'> {
  // Closing a done lead takes priority over creating
  if (lead.done && leadHubSpotMap.has(lead.id) && !closedLeadIds.has(lead.id)) {
    const { dealId } = leadHubSpotMap.get(lead.id)!;
    try {
      await closeDeal(dealId, hubspotClosedStage, hubspotToken);
      closedLeadIds.add(lead.id);
      console.log(`[HubSpot] Deal ${dealId} closed for Niche lead ${lead.id}`);
      return 'closed';
    } catch (err) {
      console.error(`[HubSpot] Failed to close deal for lead ${lead.id}:`, err);
    }
  }

  if (processedLeadIds.has(lead.id)) return 'skipped';
  processedLeadIds.set(lead.id, Date.now());

  // Find or create HubSpot contact (dedup by phone then email)
  let contactId: string | undefined;

  if (lead.phone) {
    const existing = await searchContactByPhone(lead.phone, hubspotToken);
    if (existing) {
      contactId = existing.id;
      await updateContact(contactId, { niche_lead_id: lead.id }, hubspotToken);
    }
  }

  if (!contactId) {
    const email = extractEmailFromInfo(lead.info);
    if (email) {
      const existing = await searchContactByEmail(email, hubspotToken);
      if (existing) {
        contactId = existing.id;
        await updateContact(contactId, { niche_lead_id: lead.id }, hubspotToken);
      }
    }
  }

  if (!contactId) {
    const contactProps = nicheLeadToContactProps(lead);
    const contact = await createContact(contactProps, hubspotToken);
    contactId = contact.id;
  }

  // Create deal
  const dealProps = nicheLeadToDealProps(lead, hubspotPipeline, hubspotDealStage);
  const deal = await createDeal(dealProps, hubspotToken);
  await associateContactWithDeal(contactId, deal.id, hubspotToken);

  leadHubSpotMap.set(lead.id, { contactId, dealId: deal.id });
  console.log(
    `[HubSpot] Lead ${lead.id} → contact ${contactId}, deal ${deal.id} (${lead.name ?? 'unnamed'})`
  );
  return 'created';
}

async function syncCall(call: NicheCall): Promise<boolean> {
  if (processedCallIds.has(call.id)) return false;
  processedCallIds.set(call.id, Date.now());

  // Find associated HubSpot contact via our in-memory map
  const contactId =
    call.leadId && leadHubSpotMap.has(call.leadId)
      ? leadHubSpotMap.get(call.leadId)!.contactId
      : undefined;

  const props = nicheCallToEngagementProps(call);
  await createCallEngagement(props, contactId, hubspotToken);
  console.log(`[HubSpot] Call ${call.id} logged (lead ${call.leadId ?? 'unknown'})`);
  return true;
}

// ---------------------------------------------------------------------------
// Poll runner
// ---------------------------------------------------------------------------
async function runSync(): Promise<{ leads: number; calls: number }> {
  console.log('[HubSpot] Starting sync...');

  // Leads
  const leads = await fetchNicheLeads(nicheBusinessId);
  console.log(`[HubSpot] Found ${leads.length} lead(s) in Niche`);

  let syncedLeads = 0;
  for (const lead of leads) {
    try {
      const result = await syncLead(lead);
      if (result === 'created' || result === 'closed') syncedLeads++;
    } catch (err) {
      console.error(`[HubSpot] Error syncing lead ${lead.id}:`, err);
    }
  }

  // Calls
  const calls = await fetchNicheCalls(nicheBusinessId);
  console.log(`[HubSpot] Found ${calls.length} completed call(s) in Niche`);

  let syncedCalls = 0;
  for (const call of calls) {
    try {
      const ok = await syncCall(call);
      if (ok) syncedCalls++;
    } catch (err) {
      console.error(`[HubSpot] Error syncing call ${call.id}:`, err);
    }
  }

  console.log(`[HubSpot] Sync complete — leads: ${syncedLeads}, calls: ${syncedCalls}`);
  return { leads: syncedLeads, calls: syncedCalls };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hubspot-outbound-sync',
    businessId: nicheBusinessId || '(not set)',
    hubspotConfigured: !!hubspotToken,
    nicheConfigured: !!(nicheClientId && nicheClientSecret),
    pollIntervalMin: POLL_INTERVAL_MS / 60_000,
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!hubspotToken) {
    res.status(401).json({ error: 'HUBSPOT_ACCESS_TOKEN not set' });
    return;
  }
  if (!nicheClientId || !nicheClientSecret) {
    res.status(401).json({ error: 'NICHE_HUBSPOT_CLIENT_ID or NICHE_HUBSPOT_CLIENT_SECRET not set' });
    return;
  }
  try {
    const result = await runSync();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[HubSpot] Sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, async () => {
  console.log(`HubSpot outbound sync server running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Sync:   POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!hubspotToken) console.warn('  WARNING: HUBSPOT_ACCESS_TOKEN not set');
  if (!nicheClientId || !nicheClientSecret)
    console.warn('  WARNING: NICHE_HUBSPOT_CLIENT_ID / _CLIENT_SECRET not set');

  if (hubspotToken) {
    await ensureNicheLeadIdProperty(hubspotToken).catch((err) =>
      console.warn('[HubSpot] Custom property setup skipped:', err?.message)
    );

    setInterval(
      () => runSync().catch((err) => console.error('[HubSpot] Poll error:', err)),
      POLL_INTERVAL_MS
    );
    console.log(`  Polling every ${POLL_INTERVAL_MS / 60_000} min`);
  }
});

export default app;
