/**
 * Zoho CRM integration - syncs Zoho Leads and Contacts to Niche leads.
 *
 * Sync modes:
 *   - Nightly: runs automatically at midnight (default lookback: 25 hours)
 *   - Manual:  POST /sync to trigger immediately
 *
 * OAuth setup (one-time):
 *   1. Sign up for Zoho CRM Developer Edition:
 *      https://www.zoho.com/crm/developer/developer-edition.html
 *   2. Go to https://api-console.zoho.com/ → Add Client → Server Based Applications
 *   3. Set Authorized Redirect URI: http://localhost:9005/callback
 *   4. Copy Consumer Key → ZOHO_CLIENT_ID in .env
 *   5. Copy Consumer Secret → ZOHO_CLIENT_SECRET in .env
 *   6. Create a Niche app with all scopes → NICHE_ZOHO_CRM_CLIENT_ID / _CLIENT_SECRET in .env
 *   7. Build and start: pnpm build:zoho-crm && pnpm start:zoho-crm
 *   8. Visit http://localhost:9005/auth in browser → approve in Zoho
 *   9. Trigger initial sync: POST http://localhost:9005/sync
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { ZohoLead, ZohoContact, ZohoSearchResponse } from './types';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import { buildAuthUrl, exchangeCode, getValidAccessToken, getTokens } from './auth';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('zoho-crm'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.ZOHO_PORT || '9005', 10);

const zohoClientId = process.env.ZOHO_CLIENT_ID || '';
const zohoClientSecret = process.env.ZOHO_CLIENT_SECRET || '';
const redirectUri = process.env.ZOHO_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v8';
const SYNC_LOOKBACK_HOURS = parseInt(process.env.ZOHO_SYNC_LOOKBACK_HOURS || '25', 10);

// Lead fields to fetch
const LEAD_FIELDS = 'id,First_Name,Last_Name,Phone,Mobile,Email,Company,Lead_Source,Lead_Status,Title,City,State,Modified_Time,Created_Time';
const CONTACT_FIELDS = 'id,First_Name,Last_Name,Phone,Mobile,Email,Account_Name,Title,Mailing_City,Mailing_State,Modified_Time,Created_Time';

// ---------------------------------------------------------------------------
// In-memory dedup (Zoho record ID, 24-hour TTL)
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
// Zoho CRM REST API helpers
// ---------------------------------------------------------------------------
async function zohoSearch<T>(module: string, sinceIso: string, fields: string): Promise<T[]> {
  const accessToken = await getValidAccessToken(zohoClientId, zohoClientSecret);
  const criteria = `(Modified_Time:greater_than:${sinceIso})`;
  const all: T[] = [];
  let page = 1;

  while (true) {
    const res = await axios.get<ZohoSearchResponse<T>>(`${ZOHO_API_BASE}/${module}/search`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      params: { criteria, fields, page, per_page: 200 },
    });

    all.push(...res.data.data);

    if (!res.data.info.more_records) break;
    page++;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------
async function syncLeads(since: Date): Promise<number> {
  const sinceIso = since.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  let leads: ZohoLead[];
  try {
    leads = await zohoSearch<ZohoLead>('Leads', sinceIso, LEAD_FIELDS);
  } catch (err: any) {
    // Zoho returns 204 (no content) when there are no matching records
    if (err?.response?.status === 204) {
      console.log('[Zoho CRM] No Leads modified since', since.toISOString());
      return 0;
    }
    throw err;
  }
  console.log(`[Zoho CRM] Found ${leads.length} Lead(s)`);

  let synced = 0;
  for (const lead of leads) {
    if (isDuplicate(lead.id)) {
      console.log(`[Zoho CRM] Skipping duplicate Lead ${lead.id}`);
      continue;
    }
    const nicheLead = transformLeadToNiche(lead);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Zoho CRM] Lead ${lead.id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Zoho CRM] Lead created for Zoho Lead ${lead.id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Zoho CRM] Error processing Lead ${lead.id}:`, err);
    }
  }
  return synced;
}

async function syncContacts(since: Date): Promise<number> {
  const sinceIso = since.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  let contacts: ZohoContact[];
  try {
    contacts = await zohoSearch<ZohoContact>('Contacts', sinceIso, CONTACT_FIELDS);
  } catch (err: any) {
    if (err?.response?.status === 204) {
      console.log('[Zoho CRM] No Contacts modified since', since.toISOString());
      return 0;
    }
    throw err;
  }
  console.log(`[Zoho CRM] Found ${contacts.length} Contact(s)`);

  let synced = 0;
  for (const contact of contacts) {
    if (isDuplicate(contact.id)) {
      console.log(`[Zoho CRM] Skipping duplicate Contact ${contact.id}`);
      continue;
    }
    const nicheLead = transformContactToNiche(contact);
    if (!nicheLead.phone && !nicheLead.info?.includes('Email:')) {
      console.warn(`[Zoho CRM] Contact ${contact.id} has no phone or email — skipping`);
      continue;
    }
    try {
      await nicheClient.createLead(nicheBusinessId, nicheLead);
      console.log(`[Zoho CRM] Lead created for Zoho Contact ${contact.id} (${nicheLead.name ?? 'unnamed'})`);
      synced++;
    } catch (err) {
      console.error(`[Zoho CRM] Error processing Contact ${contact.id}:`, err);
    }
  }
  return synced;
}

async function runSync(lookbackHours = SYNC_LOOKBACK_HOURS): Promise<number> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  console.log(`[Zoho CRM] Syncing records modified since ${since.toISOString()}`);

  const [leadsSynced, contactsSynced] = await Promise.all([
    syncLeads(since),
    syncContacts(since),
  ]);

  const total = leadsSynced + contactsSynced;
  console.log(`[Zoho CRM] Sync complete — ${leadsSynced} leads + ${contactsSynced} contacts = ${total} total`);
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
    runSync().catch((err) => console.error('[Zoho CRM] Nightly sync error:', err));
    setInterval(
      () => runSync().catch((err) => console.error('[Zoho CRM] Nightly sync error:', err)),
      24 * 60 * 60 * 1000
    );
  }, msUntilMidnight);

  console.log(`[Zoho CRM] Nightly sync scheduled — first run in ${Math.round(msUntilMidnight / 3600000)}h`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'zoho-crm-sync',
    businessId: nicheBusinessId || '(not set)',
    authenticated: !!getTokens(),
    zohoConfigured: !!(zohoClientId && zohoClientSecret),
  });
});

app.get('/auth', (_req: Request, res: Response) => {
  if (!zohoClientId) {
    res.status(500).send('ZOHO_CLIENT_ID not set');
    return;
  }
  res.redirect(buildAuthUrl(zohoClientId, redirectUri));
});

app.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code parameter');
    return;
  }
  try {
    await exchangeCode(code, zohoClientId, zohoClientSecret, redirectUri);
    console.log('[Zoho CRM] OAuth successful — tokens stored');
    res.send('<h2>Zoho CRM connected!</h2><p>You can close this tab. Run <code>POST /sync</code> to do an initial sync.</p>');
  } catch (err) {
    console.error('[Zoho CRM] OAuth callback error:', err);
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
    console.error('[Zoho CRM] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Zoho CRM sync server running on port ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Auth:     http://localhost:${PORT}/auth  (visit in browser to connect)`);
  console.log(`  Sync:     POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!zohoClientId) console.warn('  WARNING: ZOHO_CLIENT_ID not set');
  if (!zohoClientSecret) console.warn('  WARNING: ZOHO_CLIENT_SECRET not set');
  scheduleNightlySync();
});

export default app;
