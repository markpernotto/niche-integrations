/**
 * Jobber integration - syncs Jobber clients to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (configurable via JOBBER_SYNC_CRON)
 *   - Manual:  POST /sync to trigger immediately
 *
 * OAuth setup (one-time):
 *   1. Create app at https://developer.getjobber.com
 *      - Do NOT add a redirect URI — localhost is supported automatically
 *      - Request scopes: read_clients
 *   2. Fill JOBBER_CLIENT_ID + JOBBER_CLIENT_SECRET in .env
 *   3. Start server, visit http://localhost:<PORT>/auth in browser
 *   4. Approve access in Jobber → redirected back → tokens stored
 *   5. Trigger first sync: POST http://localhost:<PORT>/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { JobberClientsResponse, JobberClient } from './types';
import { transformToNicheLead } from './transformer';
import {
  buildAuthUrl,
  exchangeCode,
  getValidAccessToken,
  getTokens,
} from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('jobber'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.JOBBER_PORT || '9003', 10);

const jobberClientId = process.env.JOBBER_CLIENT_ID || '';
const jobberClientSecret = process.env.JOBBER_CLIENT_SECRET || '';
const redirectUri = `http://localhost:${PORT}/callback`;

const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

// How far back to look on each nightly sync
const SYNC_LOOKBACK_HOURS = parseInt(process.env.JOBBER_SYNC_LOOKBACK_HOURS || '25', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (client id, 24-hour TTL)
// ---------------------------------------------------------------------------
const processedIds = new Map<string, number>();

function isDuplicate(id: string): boolean {
  const now = Date.now();
  if (processedIds.has(id)) return true;
  processedIds.set(id, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// GraphQL: fetch clients updated since a given date
// ---------------------------------------------------------------------------
const CLIENTS_QUERY = `
  query GetClients($filter: ClientFilterAttributes, $first: Int, $after: String) {
    clients(filter: $filter, first: $first, after: $after) {
      nodes {
        id
        firstName
        lastName
        companyName
        phones { number primary }
        emails { address primary }
        billingAddress { street city province postalCode }
        isLead
        createdAt
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function fetchClients(since: Date): Promise<JobberClient[]> {
  const accessToken = await getValidAccessToken(jobberClientId, jobberClientSecret);
  const all: JobberClient[] = [];
  let cursor: string | undefined;

  do {
    const res = await axios.post<JobberClientsResponse>(
      JOBBER_GRAPHQL_URL,
      {
        query: CLIENTS_QUERY,
        variables: {
          filter: { updatedAt: { after: since.toISOString() } },
          first: 50,
          after: cursor ?? null,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-JOBBER-GRAPHQL-VERSION': '2023-11-15',
        },
      }
    );

    if (res.data.errors?.length) {
      throw new Error(res.data.errors.map((e) => e.message).join(', '));
    }

    const page = res.data.data.clients;
    all.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
  } while (cursor);

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function processClient(client: JobberClient): Promise<void> {
  if (isDuplicate(client.id)) {
    console.log(`[Jobber] Skipping duplicate client ${client.id}`);
    return;
  }

  const lead = transformToNicheLead(client);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[Jobber] Client ${client.id} has no phone or email — skipping`);
    return;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[Jobber] Lead created for client ${client.id} (${lead.name ?? 'unnamed'})`);
}

async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  console.log(`[Jobber] Syncing clients updated since ${since.toISOString()}`);

  const clients = await fetchClients(since);
  console.log(`[Jobber] Found ${clients.length} client(s)`);

  let synced = 0;
  for (const client of clients) {
    try {
      await processClient(client);
      synced++;
    } catch (err) {
      console.error(`[Jobber] Error processing client ${client.id}:`, err);
    }
  }
  return synced;
}

// ---------------------------------------------------------------------------
// Nightly sync — runs at midnight local time
// ---------------------------------------------------------------------------
function scheduleNightlySync(): void {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // next midnight
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    runSync().catch((err) => console.error('[Jobber] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Jobber] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(`[Jobber] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'jobber-sync',
    businessId: nicheBusinessId || '(not set)',
    authenticated: !!getTokens(),
    jobberConfigured: !!(jobberClientId && jobberClientSecret),
  });
});

// Step 1: start OAuth flow
app.get('/auth', (_req: Request, res: Response) => {
  if (!jobberClientId) {
    res.status(500).send('JOBBER_CLIENT_ID not set');
    return;
  }
  res.redirect(buildAuthUrl(jobberClientId, redirectUri));
});

// Step 2: OAuth callback
app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }

  try {
    await exchangeCode(code, jobberClientId, jobberClientSecret, redirectUri);
    console.log('[Jobber] OAuth successful — tokens stored');
    res.send('<h2>Jobber connected!</h2><p>You can close this tab. Run <code>POST /sync</code> to do an initial sync.</p>');
  } catch (err) {
    console.error('[Jobber] OAuth callback error:', err);
    res.status(500).send(`OAuth error: ${err}`);
  }
});

// Manual sync trigger
app.post('/sync', async (_req: Request, res: Response) => {
  if (!getTokens()) {
    res.status(401).json({ error: 'Not authenticated — visit /auth first' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Jobber] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Jobber sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Auth:     http://localhost:${PORT}/auth  (visit in browser to connect)`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!jobberClientId) console.warn('  WARNING: JOBBER_CLIENT_ID not set');
  if (!jobberClientSecret) console.warn('  WARNING: JOBBER_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
