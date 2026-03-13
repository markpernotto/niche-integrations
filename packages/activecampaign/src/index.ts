/**
 * ActiveCampaign integration - syncs ActiveCampaign Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup (one-time):
 *   1. Sign up for a free 2-year developer sandbox at https://developers.activecampaign.com
 *   2. In your account, go to Settings → Developer
 *   3. Copy your API URL (e.g. https://youraccountname.api-us1.com) → ACTIVECAMPAIGN_BASE_URL in .env
 *   4. Copy your API Key → ACTIVECAMPAIGN_API_KEY in .env
 *   5. Create a Niche app with all scopes → NICHE_ACTIVECAMPAIGN_CLIENT_ID / _CLIENT_SECRET in .env
 *   6. Build and start: pnpm build:activecampaign && pnpm start:activecampaign
 *   7. Trigger sync: POST http://localhost:9010/sync
 *
 * No OAuth flow needed — API key auth is used directly.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type {
  ActiveCampaignContact,
  ActiveCampaignListContactsResponse,
} from './types';
import { transformContactToNiche } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('activecampaign'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.ACTIVECAMPAIGN_PORT || '9010', 10);

const apiKey = process.env.ACTIVECAMPAIGN_API_KEY || '';
const baseUrl = (process.env.ACTIVECAMPAIGN_BASE_URL || '').replace(/\/$/, '');

const SYNC_LOOKBACK_HOURS = parseInt(process.env.ACTIVECAMPAIGN_SYNC_LOOKBACK_HOURS || '25', 10);

function authHeaders() {
  return { 'Api-Token': apiKey };
}

// ---------------------------------------------------------------------------
// In-memory dedup (AC contact ID, 24-hour TTL)
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
// ActiveCampaign REST API helpers
// ---------------------------------------------------------------------------
async function fetchContactsSince(sinceIso: string): Promise<ActiveCampaignContact[]> {
  const all: ActiveCampaignContact[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await axios.get<ActiveCampaignListContactsResponse>(
      `${baseUrl}/api/3/contacts`,
      {
        headers: authHeaders(),
        params: {
          updated_after: sinceIso,
          limit,
          offset,
          orders: { 'contact.udate': 'DESC' },
        },
      }
    );

    const contacts = res.data.contacts ?? [];
    all.push(...contacts);

    if (contacts.length < limit) break;
    offset += limit;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log(`[ActiveCampaign] Syncing contacts updated since ${sinceIso}`);

  const contacts = await fetchContactsSince(sinceIso);
  console.log(`[ActiveCampaign] Found ${contacts.length} contact(s)`);

  let synced = 0;
  for (const contact of contacts) {
    if (isDuplicate(contact.id)) {
      console.log(`[ActiveCampaign] Skipping duplicate contact ${contact.id}`);
      continue;
    }

    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[ActiveCampaign] Contact ${contact.id} has no phone or email — skipping`);
      continue;
    }

    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(
        `[ActiveCampaign] Lead created for contact ${contact.id} (${nicheLead.name ?? 'unnamed'})`
      );
      synced++;
    } catch (err) {
      console.error(`[ActiveCampaign] Error processing contact ${contact.id}:`, err);
    }
  }

  console.log(`[ActiveCampaign] Sync complete — ${synced} synced`);
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
    runSync().catch((err) => console.error('[ActiveCampaign] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[ActiveCampaign] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(
    `[ActiveCampaign] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'activecampaign-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: !!(apiKey && baseUrl),
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!apiKey || !baseUrl) {
    res.status(500).json({ error: 'ACTIVECAMPAIGN_API_KEY or ACTIVECAMPAIGN_BASE_URL not set' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[ActiveCampaign] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`ActiveCampaign sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!apiKey) console.warn('  WARNING: ACTIVECAMPAIGN_API_KEY not set');
  if (!baseUrl) console.warn('  WARNING: ACTIVECAMPAIGN_BASE_URL not set');
  scheduleNightlySync();
});

export default app;
