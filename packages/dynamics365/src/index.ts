/**
 * Microsoft Dynamics 365 integration — syncs Leads and Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup (one-time):
 *   1. Sign up for Power Apps Developer Plan at https://aka.ms/PowerAppsDevPlan
 *      (this provisions a free Dynamics 365 environment)
 *   2. In Azure Portal → Entra ID → App registrations → New registration
 *      - Name: "Niche Integration"
 *      - Supported account types: "Accounts in this organizational directory only"
 *      - No redirect URI needed (client credentials flow)
 *   3. After creating the app:
 *      - Copy Directory (tenant) ID → DYNAMICS_TENANT_ID in .env
 *      - Copy Application (client) ID → DYNAMICS_CLIENT_ID in .env
 *      - Certificates & secrets → New client secret → copy value → DYNAMICS_CLIENT_SECRET in .env
 *   4. Grant API permissions:
 *      - Add permission → Dynamics CRM → Application permissions → user_impersonation
 *        (or use "APIs my organization uses" → search "Dynamics CRM")
 *      - Grant admin consent
 *   5. In Dynamics 365 admin center, create an Application User:
 *      - Settings → Security → Users → switch to "Application Users" view → New
 *      - Set Application ID to your Azure app's client ID
 *      - Assign security role: "System Administrator" or "Basic User" + appropriate entity permissions
 *   6. Set DYNAMICS_INSTANCE_URL to your environment URL (e.g. https://yourorg.crm.dynamics.com)
 *   7. Create a Niche app with all scopes → NICHE_DYNAMICS365_CLIENT_ID / _CLIENT_SECRET in .env
 *   8. Build and start: pnpm build:dynamics365 && pnpm start:dynamics365
 *   9. Trigger initial sync: POST http://localhost:9007/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { DynamicsLead, DynamicsContact, DynamicsODataResponse } from './types';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import { getAccessToken, isConfigured } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('dynamics365'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.DYNAMICS_PORT || '9007', 10);

const tenantId = process.env.DYNAMICS_TENANT_ID || '';
const clientId = process.env.DYNAMICS_CLIENT_ID || '';
const clientSecret = process.env.DYNAMICS_CLIENT_SECRET || '';
const instanceUrl = (process.env.DYNAMICS_INSTANCE_URL || '').replace(/\/$/, '');

const SYNC_LOOKBACK_HOURS = parseInt(process.env.DYNAMICS_SYNC_LOOKBACK_HOURS || '25', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (record ID + type, 24-hour TTL)
// ---------------------------------------------------------------------------
const processedIds = new Map<string, number>();

function isDuplicate(id: string): boolean {
  if (processedIds.has(id)) return true;
  processedIds.set(id, Date.now());
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Dynamics 365 OData API helpers
// ---------------------------------------------------------------------------
const ODATA_BASE = `${instanceUrl}/api/data/v9.2`;

async function fetchLeadsSince(sinceIso: string): Promise<DynamicsLead[]> {
  const token = await getAccessToken(tenantId, clientId, clientSecret, instanceUrl);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Prefer: 'odata.maxpagesize=100',
  };

  const all: DynamicsLead[] = [];
  let url: string | undefined =
    `${ODATA_BASE}/leads` +
    `?$select=leadid,fullname,firstname,lastname,telephone1,mobilephone,emailaddress1,modifiedon` +
    `&$filter=modifiedon gt ${sinceIso}` +
    `&$orderby=modifiedon desc`;

  while (url) {
    const res = await axios.get<DynamicsODataResponse<DynamicsLead>>(url, { headers });
    all.push(...res.data.value);
    url = res.data['@odata.nextLink'];
  }

  return all;
}

async function fetchContactsSince(sinceIso: string): Promise<DynamicsContact[]> {
  const token = await getAccessToken(tenantId, clientId, clientSecret, instanceUrl);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Prefer: 'odata.maxpagesize=100',
  };

  const all: DynamicsContact[] = [];
  let url: string | undefined =
    `${ODATA_BASE}/contacts` +
    `?$select=contactid,fullname,firstname,lastname,telephone1,mobilephone,emailaddress1,modifiedon` +
    `&$filter=modifiedon gt ${sinceIso}` +
    `&$orderby=modifiedon desc`;

  while (url) {
    const res = await axios.get<DynamicsODataResponse<DynamicsContact>>(url, { headers });
    all.push(...res.data.value);
    url = res.data['@odata.nextLink'];
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log(`[Dynamics365] Syncing records modified since ${sinceIso}`);

  const [leads, contacts] = await Promise.all([
    fetchLeadsSince(sinceIso),
    fetchContactsSince(sinceIso),
  ]);

  console.log(`[Dynamics365] Found ${leads.length} lead(s), ${contacts.length} contact(s)`);

  let synced = 0;

  for (const lead of leads) {
    const dedupKey = `lead:${lead.leadid}`;
    if (isDuplicate(dedupKey)) {
      console.log(`[Dynamics365] Skipping duplicate lead ${lead.leadid}`);
      continue;
    }
    const nicheLead = transformLeadToNiche(lead);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Dynamics365] Lead ${lead.leadid} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Dynamics365] Lead created for Dynamics lead ${lead.leadid} (${nicheLead.name})`);
      synced++;
    } catch (err) {
      console.error(`[Dynamics365] Error processing lead ${lead.leadid}:`, err);
    }
  }

  for (const contact of contacts) {
    const dedupKey = `contact:${contact.contactid}`;
    if (isDuplicate(dedupKey)) {
      console.log(`[Dynamics365] Skipping duplicate contact ${contact.contactid}`);
      continue;
    }
    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Dynamics365] Contact ${contact.contactid} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Dynamics365] Lead created for Dynamics contact ${contact.contactid} (${nicheLead.name})`);
      synced++;
    } catch (err) {
      console.error(`[Dynamics365] Error processing contact ${contact.contactid}:`, err);
    }
  }

  console.log(`[Dynamics365] Sync complete — ${synced} synced`);
  return synced;
}

// ---------------------------------------------------------------------------
// Nightly sync — runs at midnight local time
// ---------------------------------------------------------------------------
function scheduleNightlySync(): void {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    runSync().catch((err) => console.error('[Dynamics365] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Dynamics365] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(
    `[Dynamics365] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'dynamics365-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: isConfigured(tenantId, clientId, clientSecret, instanceUrl),
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!isConfigured(tenantId, clientId, clientSecret, instanceUrl)) {
    res.status(500).json({
      error: 'Dynamics 365 not configured — set DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET, DYNAMICS_INSTANCE_URL',
    });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Dynamics365] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Dynamics 365 sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!tenantId) console.warn('  WARNING: DYNAMICS_TENANT_ID not set');
  if (!clientId) console.warn('  WARNING: DYNAMICS_CLIENT_ID not set');
  if (!clientSecret) console.warn('  WARNING: DYNAMICS_CLIENT_SECRET not set');
  if (!instanceUrl) console.warn('  WARNING: DYNAMICS_INSTANCE_URL not set');
  scheduleNightlySync();
});

export default app;
