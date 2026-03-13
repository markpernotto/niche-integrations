/**
 * Salesforce integration - syncs Salesforce Leads and Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * OAuth setup (one-time in Salesforce):
 *   1. Setup → App Manager → New Connected App
 *   2. Enable OAuth Settings
 *   3. Callback URL: http://localhost:9004/callback
 *   4. Scopes: api, refresh_token, offline_access
 *   5. Save → wait ~10 min for Salesforce to propagate the app
 *   6. Copy Consumer Key → SALESFORCE_CLIENT_ID in .env
 *   7. Copy Consumer Secret → SALESFORCE_CLIENT_SECRET in .env
 *   8. Create a Niche app with all scopes → NICHE_SALESFORCE_CLIENT_ID / _CLIENT_SECRET in .env
 *   9. Build and start the server (pnpm build:salesforce && pnpm start:salesforce)
 *  10. Visit http://localhost:9004/auth in browser → approve in Salesforce
 *  11. Trigger initial sync: POST http://localhost:9004/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { SalesforceQueryResponse, SalesforceLead, SalesforceContact } from './types';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import { buildAuthUrl, exchangeCode, getValidAccessToken, getTokens } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('salesforce'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.SALESFORCE_PORT || '9004', 10);

const sfClientId = process.env.SALESFORCE_CLIENT_ID || '';
const sfClientSecret = process.env.SALESFORCE_CLIENT_SECRET || '';
const redirectUri = process.env.SALESFORCE_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const SF_API_VERSION = 'v59.0';
const SYNC_LOOKBACK_HOURS = parseInt(process.env.SALESFORCE_SYNC_LOOKBACK_HOURS || '25', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (Salesforce record ID, 24-hour TTL)
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
// Salesforce REST API helpers
// ---------------------------------------------------------------------------
async function sfQuery<T>(soql: string): Promise<T[]> {
  const tokens = getTokens();
  if (!tokens) throw new Error('Not authenticated');

  const accessToken = await getValidAccessToken(sfClientId, sfClientSecret);
  const baseUrl = `${tokens.instanceUrl}/services/data/${SF_API_VERSION}`;
  const all: T[] = [];

  let url: string | undefined = `${baseUrl}/query?q=${encodeURIComponent(soql)}`;

  while (url) {
    const currentUrl: string = url;
    const result = await axios.get<SalesforceQueryResponse<T>>(currentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    all.push(...result.data.records);
    url = result.data.nextRecordsUrl
      ? `${tokens.instanceUrl}${result.data.nextRecordsUrl}`
      : undefined;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function syncLeads(since: Date): Promise<number> {
  const sinceStr = since.toISOString();
  const soql = `SELECT Id, FirstName, LastName, Company, Phone, MobilePhone, Email, LeadSource, Status, Title, City, State, CreatedDate, LastModifiedDate FROM Lead WHERE LastModifiedDate > ${sinceStr} ORDER BY LastModifiedDate ASC`;

  const leads = await sfQuery<SalesforceLead>(soql);
  console.log(`[Salesforce] Found ${leads.length} Lead(s)`);

  let synced = 0;
  for (const lead of leads) {
    if (isDuplicate(lead.Id)) {
      console.log(`[Salesforce] Skipping duplicate Lead ${lead.Id}`);
      continue;
    }
    const nicheLead = transformLeadToNiche(lead);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Salesforce] Lead ${lead.Id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Salesforce] Lead created for SF Lead ${lead.Id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Salesforce] Error processing Lead ${lead.Id}:`, err);
    }
  }
  return synced;
}

async function syncContacts(since: Date): Promise<number> {
  const sinceStr = since.toISOString();
  const soql = `SELECT Id, FirstName, LastName, Account.Name, Phone, MobilePhone, Email, Title, MailingCity, MailingState, CreatedDate, LastModifiedDate FROM Contact WHERE LastModifiedDate > ${sinceStr} ORDER BY LastModifiedDate ASC`;

  const contacts = await sfQuery<SalesforceContact & { Account?: { Name?: string } }>(soql);
  console.log(`[Salesforce] Found ${contacts.length} Contact(s)`);

  let synced = 0;
  for (const raw of contacts) {
    // Flatten Account.Name relationship field
    const contact: SalesforceContact = { ...raw, AccountName: raw.Account?.Name };

    if (isDuplicate(contact.Id)) {
      console.log(`[Salesforce] Skipping duplicate Contact ${contact.Id}`);
      continue;
    }
    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Salesforce] Contact ${contact.Id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Salesforce] Lead created for SF Contact ${contact.Id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Salesforce] Error processing Contact ${contact.Id}:`, err);
    }
  }
  return synced;
}

async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  console.log(`[Salesforce] Syncing records modified since ${since.toISOString()}`);

  const [leadsSynced, contactsSynced] = await Promise.all([
    syncLeads(since),
    syncContacts(since),
  ]);

  const total = leadsSynced + contactsSynced;
  console.log(`[Salesforce] Sync complete — ${leadsSynced} leads + ${contactsSynced} contacts = ${total} total`);
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
    runSync().catch((err) => console.error('[Salesforce] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Salesforce] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(`[Salesforce] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'salesforce-sync',
    businessId: nicheBusinessId || '(not set)',
    authenticated: !!getTokens(),
    salesforceConfigured: !!(sfClientId && sfClientSecret),
  });
});

app.get('/auth', (_req: Request, res: Response) => {
  if (!sfClientId) {
    res.status(500).send('SALESFORCE_CLIENT_ID not set');
    return;
  }
  res.redirect(buildAuthUrl(sfClientId, redirectUri));
});

app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }
  try {
    await exchangeCode(code, sfClientId, sfClientSecret, redirectUri);
    console.log('[Salesforce] OAuth successful — tokens stored');
    res.send('<h2>Salesforce connected!</h2><p>You can close this tab. Run <code>POST /sync</code> to do an initial sync.</p>');
  } catch (err) {
    console.error('[Salesforce] OAuth callback error:', err);
    res.status(500).send(`OAuth error: ${err}`);
  }
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!getTokens()) {
    res.status(401).json({ error: 'Not authenticated — visit /auth first' });
    return;
  }
  try {
    const synced = await runSync();
    res.json({ ok: true, synced });
  } catch (err) {
    console.error('[Salesforce] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Salesforce sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Auth:     http://localhost:${PORT}/auth  (visit in browser to connect)`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!sfClientId) console.warn('  WARNING: SALESFORCE_CLIENT_ID not set');
  if (!sfClientSecret) console.warn('  WARNING: SALESFORCE_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
