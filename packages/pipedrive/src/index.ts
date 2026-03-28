/**
 * Pipedrive integration - syncs Pipedrive Persons to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * Setup:
 *   1. In Pipedrive: Settings → Personal preferences → API → copy token
 *   2. Set PIPEDRIVE_API_TOKEN in .env
 *   3. Create a Niche app with all scopes → NICHE_PIPEDRIVE_CLIENT_ID / _CLIENT_SECRET in .env
 *   4. Build and start: pnpm build:pipedrive && pnpm start:pipedrive
 *   5. Trigger initial sync: POST http://localhost:9011/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { PipedrivePerson, PipedriveListResponse } from './types';
import { transformPersonToNiche } from './transformer';
import { isConfigured } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('pipedrive'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.PIPEDRIVE_PORT || '9011', 10);

const apiToken = process.env.PIPEDRIVE_API_TOKEN || '';
const API_BASE = 'https://api.pipedrive.com/v1';

const SYNC_LOOKBACK_HOURS = parseInt(process.env.PIPEDRIVE_SYNC_LOOKBACK_HOURS || '25', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (Pipedrive person ID, 24-hour TTL)
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
// Pipedrive REST API helpers
// ---------------------------------------------------------------------------
async function fetchPersonsSince(sinceIso: string): Promise<PipedrivePerson[]> {
  const all: PipedrivePerson[] = [];
  let start = 0;
  const limit = 100;
  const sinceMs = new Date(sinceIso).getTime();

  while (true) {
    const res = await axios.get<PipedriveListResponse<PipedrivePerson>>(
      `${API_BASE}/persons`,
      {
        params: {
          api_token: apiToken,
          since: sinceIso,
          limit,
          start,
          sort: 'update_time DESC',
        },
      }
    );

    const persons = res.data.data ?? [];
    for (const p of persons) {
      if (new Date(p.update_time).getTime() >= sinceMs) {
        all.push(p);
      }
    }

    if (!res.data.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log(`[Pipedrive] Syncing persons updated since ${sinceIso}`);

  const persons = await fetchPersonsSince(sinceIso);
  console.log(`[Pipedrive] Found ${persons.length} person(s)`);

  let synced = 0;
  for (const person of persons) {
    if (isDuplicate(String(person.id))) {
      console.log(`[Pipedrive] Skipping duplicate person ${person.id}`);
      continue;
    }

    const nicheLead = transformPersonToNiche(person);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Pipedrive] Person ${person.id} has no phone or email — skipping`);
      continue;
    }

    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(
        `[Pipedrive] Lead created for person ${person.id} (${nicheLead.name ?? 'unnamed'})`
      );
      synced++;
    } catch (err) {
      console.error(`[Pipedrive] Error processing person ${person.id}:`, err);
    }
  }

  console.log(`[Pipedrive] Sync complete — ${synced} synced`);
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
    runSync().catch((err) => console.error('[Pipedrive] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Pipedrive] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(
    `[Pipedrive] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'pipedrive-sync',
    businessId: nicheBusinessId || '(not set)',
    configured: isConfigured(apiToken),
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!isConfigured(apiToken)) {
    res.status(500).json({ error: 'PIPEDRIVE_API_TOKEN not set' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Pipedrive] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Pipedrive sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!apiToken) console.warn('  WARNING: PIPEDRIVE_API_TOKEN not set');
  scheduleNightlySync();
});

export default app;
