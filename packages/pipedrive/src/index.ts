/**
 * Pipedrive integration - syncs Pipedrive Persons to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * OAuth setup (one-time):
 *   1. Sign up for a Pipedrive developer sandbox at https://pipedrive.com/developer-sandbox-sign-up
 *   2. In the Pipedrive developer hub, create a new app
 *   3. Set Callback URL: http://localhost:9011/callback (local) or https://<railway-url>/callback (prod)
 *   4. Copy Client ID → PIPEDRIVE_CLIENT_ID in .env
 *   5. Copy Client Secret → PIPEDRIVE_CLIENT_SECRET in .env
 *   6. Create a Niche app with all scopes → NICHE_PIPEDRIVE_CLIENT_ID / _CLIENT_SECRET in .env
 *   7. Build and start: pnpm build:pipedrive && pnpm start:pipedrive
 *   8. Visit http://localhost:9011/auth in browser → approve in Pipedrive
 *   9. Trigger initial sync: POST http://localhost:9011/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { PipedrivePerson, PipedriveListResponse } from './types';
import { transformPersonToNiche } from './transformer';
import { buildAuthUrl, exchangeCode, getValidAccessToken, loadTokens } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('pipedrive'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.PIPEDRIVE_PORT || '9011', 10);

const clientId = process.env.PIPEDRIVE_CLIENT_ID || '';
const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET || '';
const redirectUri =
  process.env.PIPEDRIVE_REDIRECT_URI || `http://localhost:${PORT}/callback`;

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
  const { token, apiDomain } = await getValidAccessToken(clientId, clientSecret);
  const apiBase = `https://${apiDomain}/v1`;
  const all: PipedrivePerson[] = [];
  let start = 0;
  const limit = 100;
  const sinceMs = new Date(sinceIso).getTime();

  while (true) {
    const res = await axios.get<PipedriveListResponse<PipedrivePerson>>(
      `${apiBase}/persons`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
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
    authenticated: !!loadTokens(),
    configured: !!(clientId && clientSecret),
  });
});

app.get('/auth', (_req: Request, res: Response) => {
  if (!clientId) {
    res.status(500).send('PIPEDRIVE_CLIENT_ID not set');
    return;
  }
  res.redirect(buildAuthUrl(clientId, redirectUri));
});

app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }
  try {
    await exchangeCode(code, clientId, clientSecret, redirectUri);
    console.log('[Pipedrive] OAuth successful — tokens stored');
    res.send(
      '<h2>Pipedrive connected!</h2><p>You can close this tab. Run <code>POST /sync</code> to do an initial sync.</p>'
    );
  } catch (err) {
    console.error('[Pipedrive] OAuth callback error:', err);
    res.status(500).send(`OAuth error: ${err}`);
  }
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!loadTokens()) {
    res.status(401).json({ error: 'Not authenticated — visit /auth first' });
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
  console.log(`  Auth:     http://localhost:${PORT}/auth  (visit in browser to connect)`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!clientId) console.warn('  WARNING: PIPEDRIVE_CLIENT_ID not set');
  if (!clientSecret) console.warn('  WARNING: PIPEDRIVE_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
