/**
 * Keap (Infusionsoft) integration - syncs Keap Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup (one-time):
 *   1. Go to https://developer.infusionsoft.com → your app → API Keys → Add Key
 *   2. Copy Client ID → KEAP_CLIENT_ID in .env
 *   3. Copy Client Secret → KEAP_CLIENT_SECRET in .env
 *      (No redirect URI or browser OAuth needed — service account auth)
 *   4. Create a Niche app with all scopes → NICHE_KEAP_CLIENT_ID / _CLIENT_SECRET in .env
 *   5. Build and start: pnpm build:keap && pnpm start:keap
 *   6. Trigger sync: POST http://localhost:9009/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { KeapContact, KeapListResponse } from './types';
import { transformContactToNiche } from './transformer';
import { getValidAccessToken, isConfigured } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('keap'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.KEAP_PORT || '9009', 10);

const clientId = process.env.KEAP_CLIENT_ID || '';
const clientSecret = process.env.KEAP_CLIENT_SECRET || '';

const KEAP_API_BASE = 'https://api.infusionsoft.com/crm/rest/v2';
const SYNC_LOOKBACK_HOURS = parseInt(process.env.KEAP_SYNC_LOOKBACK_HOURS || '25', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (Keap contact ID, 24-hour TTL)
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
// Keap REST API helpers
// ---------------------------------------------------------------------------
async function fetchContactsSince(sinceIso: string): Promise<KeapContact[]> {
  const accessToken = await getValidAccessToken(clientId, clientSecret);
  const all: KeapContact[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const params: Record<string, string | number> = {
      since: sinceIso,
      limit: 200,
      order_by: 'last_updated',
      order_direction: 'DESCENDING',
    };
    if (nextPageToken) params.page_token = nextPageToken;

    const res = await axios.get<KeapListResponse<KeapContact>>(
      `${KEAP_API_BASE}/contacts`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      }
    );

    const contacts = res.data.contacts ?? [];
    all.push(...contacts);

    if (!res.data.next) break;
    try {
      const url = new URL(res.data.next);
      nextPageToken = url.searchParams.get('page_token') ?? undefined;
      if (!nextPageToken) break;
    } catch {
      break;
    }
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log(`[Keap] Syncing contacts updated since ${sinceIso}`);

  const contacts = await fetchContactsSince(sinceIso);
  console.log(`[Keap] Found ${contacts.length} contact(s)`);

  let synced = 0;
  for (const contact of contacts) {
    if (isDuplicate(String(contact.id))) {
      console.log(`[Keap] Skipping duplicate contact ${contact.id}`);
      continue;
    }

    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Keap] Contact ${contact.id} has no phone or email — skipping`);
      continue;
    }

    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Keap] Lead created for contact ${contact.id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Keap] Error processing contact ${contact.id}:`, err);
    }
  }

  console.log(`[Keap] Sync complete — ${synced} synced`);
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
    runSync().catch((err) => console.error('[Keap] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Keap] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(`[Keap] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'keap-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: isConfigured(clientId, clientSecret),
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!isConfigured(clientId, clientSecret)) {
    res.status(500).json({ error: 'KEAP_CLIENT_ID or KEAP_CLIENT_SECRET not set' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Keap] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Keap sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!clientId) console.warn('  WARNING: KEAP_CLIENT_ID not set');
  if (!clientSecret) console.warn('  WARNING: KEAP_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
