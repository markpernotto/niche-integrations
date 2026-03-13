/**
 * Freshsales integration - syncs Freshsales Contacts and Leads to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup (one-time):
 *   1. Sign up for Freshsales free plan at https://www.freshworks.com/crm/signup/
 *   2. Go to Settings (gear icon) → API Settings
 *   3. Copy your API key → FRESHSALES_API_KEY in .env
 *   4. Copy your domain (e.g. "mycompany") → FRESHSALES_DOMAIN in .env
 *      (the part before .myfreshworks.com)
 *   5. Create a Niche app with all scopes → NICHE_FRESHSALES_CLIENT_ID / _CLIENT_SECRET in .env
 *   6. Build and start: pnpm build:freshsales && pnpm start:freshsales
 *   7. Trigger sync: POST http://localhost:9006/sync
 *
 * No OAuth flow needed — API key auth is used directly.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { FreshsalesContact, FreshsalesLead, FreshsalesListResponse } from './types';
import { transformContactToNiche, transformLeadToNiche } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('freshsales'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.FRESHSALES_PORT || '9006', 10);

const apiKey = process.env.FRESHSALES_API_KEY || '';
const domain = process.env.FRESHSALES_DOMAIN || '';

const SYNC_LOOKBACK_HOURS = parseInt(process.env.FRESHSALES_SYNC_LOOKBACK_HOURS || '25', 10);

function apiBase(): string {
  // Normalize domain — accept any of these formats:
  //   "mycompany"                            → https://mycompany.myfreshworks.com/crm/sales/api
  //   "mycompany.myfreshworks.com"           → same
  //   "mycompany.myfreshworks.com/crm/sales" → same (strip path, add /api)
  //   "https://mycompany.myfreshworks.com"   → same
  let host = domain.replace(/^https?:\/\//, '').split('/')[0];
  if (!host.includes('.')) host = `${host}.myfreshworks.com`;
  return `https://${host}/crm/sales/api`;
}

function authHeader(): string {
  return `Token token=${apiKey}`;
}

// ---------------------------------------------------------------------------
// In-memory dedup (Freshsales record ID + type, 24-hour TTL)
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
// Freshsales REST API helpers
// ---------------------------------------------------------------------------

/** Fetch the first available view ID for a module (e.g. 'contacts'). */
async function getDefaultViewId(module: string): Promise<number> {
  const res = await axios.get<{ filters: { id: number; name: string }[] }>(
    `${apiBase()}/${module}/filters`,
    { headers: { Authorization: authHeader() } }
  );
  const filters = res.data.filters;
  if (!filters?.length) throw new Error(`No views found for module: ${module}`);
  // Prefer "All <Module>" view, fall back to first available
  const all = filters.find((f) => f.name.toLowerCase().startsWith('all')) ?? filters[0];
  console.log(`[Freshsales] Using view "${all.name}" (id=${all.id}) for ${module}`);
  return all.id;
}

async function fetchAll<T extends { updated_at: string }>(
  module: string,
  itemsKey: keyof FreshsalesListResponse<T>,
  sinceIso: string
): Promise<T[]> {
  const viewId = await getDefaultViewId(module);
  const all: T[] = [];
  let page = 1;
  const sinceMs = new Date(sinceIso).getTime();

  while (true) {
    const res = await axios.get<FreshsalesListResponse<T>>(
      `${apiBase()}/${module}/view/${viewId}`,
      {
        headers: { Authorization: authHeader() },
        params: { page, per_page: 100, sort: 'updated_at', sort_type: 'desc' },
      }
    );

    const items = res.data[itemsKey] as T[] | undefined;
    if (!items || items.length === 0) break;

    // Sorting desc (newest first) — stop as soon as we hit a record older than our cutoff
    let done = false;
    for (const item of items) {
      if (new Date(item.updated_at).getTime() >= sinceMs) {
        all.push(item);
      } else {
        done = true;
        break;
      }
    }
    if (done) break;

    if (page >= res.data.meta.total_pages) break;
    page++;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function syncContacts(since: Date): Promise<number> {
  const sinceIso = since.toISOString();
  let contacts: FreshsalesContact[];
  try {
    contacts = await fetchAll<FreshsalesContact>('contacts', 'contacts', sinceIso);
  } catch (err: any) {
    if (err?.response?.status === 403) {
      console.warn('[Freshsales] Contacts endpoint returned 403 — module not available on this plan, skipping');
      return 0;
    }
    throw err;
  }
  console.log(`[Freshsales] Found ${contacts.length} Contact(s)`);

  let synced = 0;
  for (const contact of contacts) {
    if (isDuplicate(`contact:${contact.id}`)) {
      console.log(`[Freshsales] Skipping duplicate Contact ${contact.id}`);
      continue;
    }
    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Freshsales] Contact ${contact.id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Freshsales] Lead created for Contact ${contact.id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Freshsales] Error processing Contact ${contact.id}:`, err);
    }
  }
  return synced;
}

async function syncLeads(since: Date): Promise<number> {
  const sinceIso = since.toISOString();
  let leads: FreshsalesLead[];
  try {
    leads = await fetchAll<FreshsalesLead>('leads', 'leads', sinceIso);
  } catch (err: any) {
    if (err?.response?.status === 403) {
      console.warn('[Freshsales] Leads endpoint returned 403 — module not available on this plan, skipping');
      return 0;
    }
    throw err;
  }
  console.log(`[Freshsales] Found ${leads.length} Lead(s)`);

  let synced = 0;
  for (const lead of leads) {
    if (isDuplicate(`lead:${lead.id}`)) {
      console.log(`[Freshsales] Skipping duplicate Lead ${lead.id}`);
      continue;
    }
    const nicheLead = transformLeadToNiche(lead);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Freshsales] Lead ${lead.id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Freshsales] Lead created for Lead ${lead.id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Freshsales] Error processing Lead ${lead.id}:`, err);
    }
  }
  return synced;
}

async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  console.log(`[Freshsales] Syncing records modified since ${since.toISOString()}`);

  const [contactsSynced, leadsSynced] = await Promise.all([
    syncContacts(since),
    syncLeads(since),
  ]);

  const total = contactsSynced + leadsSynced;
  console.log(`[Freshsales] Sync complete — ${contactsSynced} contacts + ${leadsSynced} leads = ${total} total`);
  return total;
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
    runSync().catch((err) => console.error('[Freshsales] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Freshsales] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(`[Freshsales] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'freshsales-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: !!(apiKey && domain),
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!apiKey || !domain) {
    res.status(500).json({ error: 'FRESHSALES_API_KEY or FRESHSALES_DOMAIN not set' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Freshsales] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Freshsales sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!apiKey) console.warn('  WARNING: FRESHSALES_API_KEY not set');
  if (!domain) console.warn('  WARNING: FRESHSALES_DOMAIN not set');
  scheduleNightlySync();
});

export default app;
