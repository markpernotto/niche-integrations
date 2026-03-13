/**
 * Keap (Infusionsoft) integration - syncs Keap Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * OAuth setup (one-time):
 *   1. Create a developer sandbox at https://developer.infusionsoft.com
 *      (sign up → Create App → choose "Sandbox" environment)
 *   2. Set Redirect URI: http://localhost:9009/callback (local) + https://<railway-url>/callback (prod)
 *   3. Copy Client ID → KEAP_CLIENT_ID in .env
 *   4. Copy Client Secret → KEAP_CLIENT_SECRET in .env
 *   5. Create a Niche app with all scopes → NICHE_KEAP_CLIENT_ID / _CLIENT_SECRET in .env
 *   6. Build and start: pnpm build:keap && pnpm start:keap
 *   7. Visit http://localhost:9009/auth in browser → approve in Keap
 *   8. Trigger initial sync: POST http://localhost:9009/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { KeapContact, KeapListResponse } from './types';
import { transformContactToNiche } from './transformer';
import { buildAuthUrl, exchangeCode, getValidAccessToken, loadTokens } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('keap'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.KEAP_PORT || '9009', 10);

const clientId = process.env.KEAP_CLIENT_ID || '';
const clientSecret = process.env.KEAP_CLIENT_SECRET || '';
const redirectUri = process.env.KEAP_REDIRECT_URI || `http://localhost:${PORT}/callback`;

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
    // next is a full URL — extract page_token if present, or just break (use offset pagination)
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
    authenticated: !!loadTokens(),
    configured: !!(clientId && clientSecret),
  });
});

app.get('/auth', (_req: Request, res: Response) => {
  if (!clientId) {
    res.status(500).send('KEAP_CLIENT_ID not set');
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
    console.log('[Keap] OAuth successful — tokens stored');
    res.send(
      '<h2>Keap connected!</h2><p>You can close this tab. Run <code>POST /sync</code> to do an initial sync.</p>'
    );
  } catch (err) {
    console.error('[Keap] OAuth callback error:', err);
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
  console.log(`  Auth:     http://localhost:${PORT}/auth  (visit in browser to connect)`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!clientId) console.warn('  WARNING: KEAP_CLIENT_ID not set');
  if (!clientSecret) console.warn('  WARNING: KEAP_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
