/**
 * Close CRM integration - syncs Close Leads (with embedded contacts) to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup (one-time):
 *   1. Request a free developer org from Close: email support@close.com
 *      Subject: "Developer sandbox request" — they typically respond within 1 business day
 *   2. In Close, go to Settings → API Keys → Generate API Key
 *   3. Copy the API key → CLOSE_CRM_API_KEY in .env
 *   4. Create a Niche app with all scopes → NICHE_CLOSE_CRM_CLIENT_ID / _CLIENT_SECRET in .env
 *   5. Build and start: pnpm build:close-crm && pnpm start:close-crm
 *   6. Trigger sync: POST http://localhost:9008/sync
 *
 * No OAuth flow needed — API key (HTTP Basic auth) is used directly.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { CloseLead, CloseLeadListResponse } from './types';
import { transformLeadToNiche } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('close-crm'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.CLOSE_CRM_PORT || '9008', 10);

const apiKey = process.env.CLOSE_CRM_API_KEY || '';

const CLOSE_API_BASE = 'https://api.close.com/api/v1';
const SYNC_LOOKBACK_HOURS = parseInt(process.env.CLOSE_CRM_SYNC_LOOKBACK_HOURS || '25', 10);

function authHeader() {
  // Close uses HTTP Basic auth: API key as username, empty password
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

// ---------------------------------------------------------------------------
// In-memory dedup (Close lead ID, 24-hour TTL)
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
// Close CRM REST API helpers
// ---------------------------------------------------------------------------
async function fetchLeadsSince(sinceIso: string): Promise<CloseLead[]> {
  const all: CloseLead[] = [];
  let cursor: string | undefined;

  while (true) {
    const params: Record<string, string | number> = {
      query: `updated > "${sinceIso}"`,
      _fields: 'id,display_name,contacts,date_updated,date_created',
      _limit: 100,
    };
    if (cursor) params._cursor = cursor;

    const res = await axios.get<CloseLeadListResponse>(`${CLOSE_API_BASE}/lead/`, {
      headers: authHeader(),
      params,
    });

    all.push(...res.data.data);

    if (!res.data.has_more || !res.data.cursor) break;
    cursor = res.data.cursor;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log(`[Close CRM] Syncing leads updated since ${sinceIso}`);

  const leads = await fetchLeadsSince(sinceIso);
  console.log(`[Close CRM] Found ${leads.length} lead(s)`);

  let synced = 0;
  for (const lead of leads) {
    if (isDuplicate(lead.id)) {
      console.log(`[Close CRM] Skipping duplicate lead ${lead.id}`);
      continue;
    }

    const nicheLead = transformLeadToNiche(lead);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Close CRM] Lead ${lead.id} has no phone or email — skipping`);
      continue;
    }

    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(
        `[Close CRM] Lead created for Close lead ${lead.id} (${nicheLead.name ?? 'unnamed'})`
      );
      synced++;
    } catch (err) {
      console.error(`[Close CRM] Error processing lead ${lead.id}:`, err);
    }
  }

  console.log(`[Close CRM] Sync complete — ${synced} synced`);
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
    runSync().catch((err) => console.error('[Close CRM] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Close CRM] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(
    `[Close CRM] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'close-crm-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: !!apiKey,
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!apiKey) {
    res.status(500).json({ error: 'CLOSE_CRM_API_KEY not set' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Close CRM] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Close CRM sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!apiKey) console.warn('  WARNING: CLOSE_CRM_API_KEY not set');
  scheduleNightlySync();
});

export default app;
