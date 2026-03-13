/**
 * HubSpot integration - syncs HubSpot contacts and deals to Niche leads.
 *
 * Sync modes:
 *   - Webhook: HubSpot POSTs contact.creation / contact.propertyChange events
 *   - Polling:  every 15 min, pulls contacts + deals updated since last run
 *   - Manual:   POST /sync to trigger immediately
 *
 * Setup:
 *   1. Set HUBSPOT_ACCESS_TOKEN (private app token from HubSpot)
 *   2. Set HUBSPOT_CLIENT_SECRET (for webhook signature verification)
 *   3. In HubSpot: Apps → Webhooks → subscribe to contact.creation + contact.propertyChange
 *   4. Point webhook URL to http://<your-host>:7777/webhook
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { HubSpotWebhookEvent } from './types';
import {
  fetchHubSpotContact,
  fetchContactsUpdatedSince,
  fetchDealsUpdatedSince,
  fetchDealAssociatedContact,
  transformToNicheLead,
  transformDealToNicheLead,
} from './transformer';

const app = express();

app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

const nicheClient = new NicheClient(getNicheConfigForIntegration('hubspot'));
const hubspotClientSecret = process.env.HUBSPOT_CLIENT_SECRET || '';
const hubspotAccessToken = process.env.HUBSPOT_ACCESS_TOKEN || '';
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.HUBSPOT_PORT || '7777', 10);

// How far back to look on each poll
const POLL_LOOKBACK_MS = parseInt(process.env.HUBSPOT_LOOKBACK_MS || String(25 * 60 * 60 * 1000), 10);
const POLL_INTERVAL_MS = parseInt(process.env.HUBSPOT_POLL_INTERVAL_MS || String(15 * 60 * 1000), 10);

// ---------------------------------------------------------------------------
// Signature verification
// HubSpot v1: SHA256(clientSecret + requestBody)
// ---------------------------------------------------------------------------
function verifyHubSpotSignature(req: Request & { rawBody?: Buffer }): boolean {
  if (!hubspotClientSecret) return true; // skip in dev if not set

  const signature = req.headers['x-hubspot-signature'] as string | undefined;
  if (!signature) return false;

  const body = req.rawBody ? req.rawBody.toString('utf8') : '';
  const expected = crypto
    .createHash('sha256')
    .update(hubspotClientSecret + body)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Dedup — event-level (webhook) and object-level (polling)
// ---------------------------------------------------------------------------
const processedEventIds = new Map<number, number>();
const processedContactIds = new Map<string, number>();
const processedDealIds = new Map<string, number>();

function isEventDuplicate(eventId: number): boolean {
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.set(eventId, Date.now());
  return false;
}

function isContactDuplicate(contactId: string): boolean {
  if (processedContactIds.has(contactId)) return true;
  processedContactIds.set(contactId, Date.now());
  return false;
}

function isDealDuplicate(dealId: string): boolean {
  if (processedDealIds.has(dealId)) return true;
  processedDealIds.set(dealId, Date.now());
  return false;
}

const TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, ts] of processedEventIds) if (ts < cutoff) processedEventIds.delete(id);
  for (const [id, ts] of processedContactIds) if (ts < cutoff) processedContactIds.delete(id);
  for (const [id, ts] of processedDealIds) if (ts < cutoff) processedDealIds.delete(id);
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Process a single contact (shared by webhook + polling paths)
// ---------------------------------------------------------------------------
async function processContact(contactId: string | number): Promise<boolean> {
  const id = String(contactId);
  if (isContactDuplicate(id)) {
    console.log(`[HubSpot] Skipping duplicate contact ${id}`);
    return false;
  }

  const contact = await fetchHubSpotContact(id, hubspotAccessToken);
  const lead = transformToNicheLead(contact);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[HubSpot] Contact ${id} has no phone or email — skipping`);
    return false;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[HubSpot] Lead created for contact ${id} (${lead.name ?? 'unnamed'})`);
  return true;
}

// ---------------------------------------------------------------------------
// Process a single deal
// ---------------------------------------------------------------------------
async function processDeal(dealId: string): Promise<boolean> {
  if (isDealDuplicate(dealId)) {
    console.log(`[HubSpot] Skipping duplicate deal ${dealId}`);
    return false;
  }

  const deals = await fetchDealsUpdatedSince(new Date(0), hubspotAccessToken); // we already have the deal obj
  // Actually we need the deal object — fetch inline
  const { default: axios } = await import('axios');
  const res = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,pipeline,closedate,hs_deal_stage_label`,
    { headers: { Authorization: `Bearer ${hubspotAccessToken}` } }
  );
  const deal = res.data;

  const contact = await fetchDealAssociatedContact(dealId, hubspotAccessToken);
  const lead = transformDealToNicheLead(deal, contact);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[HubSpot] Deal ${dealId} has no phone or email — skipping`);
    return false;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[HubSpot] Lead created for deal ${dealId} (${lead.name ?? 'unnamed'})`);
  return true;
}

// ---------------------------------------------------------------------------
// Polling sync — contacts + deals
// ---------------------------------------------------------------------------
async function runSync(lookbackMs = POLL_LOOKBACK_MS): Promise<{ contacts: number; deals: number }> {
  const since = new Date(Date.now() - lookbackMs);
  console.log(`[HubSpot] Polling contacts + deals updated since ${since.toISOString()}`);

  // Contacts
  const contacts = await fetchContactsUpdatedSince(since, hubspotAccessToken);
  console.log(`[HubSpot] Found ${contacts.length} contact(s)`);
  let syncedContacts = 0;
  for (const c of contacts) {
    try {
      const ok = await processContact(c.id);
      if (ok) syncedContacts++;
    } catch (err) {
      console.error(`[HubSpot] Error processing contact ${c.id}:`, err);
    }
  }

  // Deals
  const deals = await fetchDealsUpdatedSince(since, hubspotAccessToken);
  console.log(`[HubSpot] Found ${deals.length} deal(s)`);
  let syncedDeals = 0;
  for (const d of deals) {
    try {
      if (isDealDuplicate(d.id)) {
        console.log(`[HubSpot] Skipping duplicate deal ${d.id}`);
        continue;
      }
      // Mark as processed
      processedDealIds.set(d.id, Date.now());

      const contact = await fetchDealAssociatedContact(d.id, hubspotAccessToken);
      const lead = transformDealToNicheLead(d, contact);

      if (!lead.phone && !lead.info?.includes('Email:')) {
        console.warn(`[HubSpot] Deal ${d.id} has no phone or email — skipping`);
        continue;
      }

      await nicheClient.createLead(nicheBusinessId, lead);
      console.log(`[HubSpot] Lead created for deal ${d.id} (${lead.name ?? 'unnamed'})`);
      syncedDeals++;
    } catch (err) {
      console.error(`[HubSpot] Error processing deal ${d.id}:`, err);
    }
  }

  return { contacts: syncedContacts, deals: syncedDeals };
}

// ---------------------------------------------------------------------------
// Webhook: process a single contact event
// ---------------------------------------------------------------------------
async function processWebhookEvent(event: HubSpotWebhookEvent): Promise<void> {
  const { subscriptionType, objectId, eventId } = event;

  if (!subscriptionType.startsWith('contact.')) return;
  if (isEventDuplicate(eventId)) {
    console.log(`[HubSpot] Skipping duplicate event ${eventId}`);
    return;
  }

  console.log(`[HubSpot] Webhook: ${subscriptionType} for contact ${objectId}`);
  await processContact(objectId);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hubspot-sync',
    businessId: nicheBusinessId || '(not set)',
    hubspotConfigured: !!hubspotAccessToken && !!hubspotClientSecret,
    pollIntervalMin: POLL_INTERVAL_MS / 60000,
  });
});

app.post('/webhook', (req: Request & { rawBody?: Buffer }, res: Response) => {
  if (!verifyHubSpotSignature(req)) {
    console.warn('[HubSpot] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  res.status(200).json({ received: true });

  const events: HubSpotWebhookEvent[] = Array.isArray(req.body) ? req.body : [req.body];

  setImmediate(async () => {
    for (const event of events) {
      try {
        await processWebhookEvent(event);
      } catch (err) {
        console.error(`[HubSpot] Error processing event ${event.eventId}:`, err);
      }
    }
  });
});

app.post('/sync', async (_req: Request, res: Response) => {
  if (!hubspotAccessToken) {
    res.status(401).json({ error: 'HUBSPOT_ACCESS_TOKEN not set' });
    return;
  }
  try {
    const result = await runSync();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[HubSpot] Manual sync error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start + schedule polling
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`HubSpot sync server running on port ${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Webhook: POST http://localhost:${PORT}/webhook`);
  console.log(`  Sync:    POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!hubspotAccessToken) console.warn('  WARNING: HUBSPOT_ACCESS_TOKEN not set');
  if (!hubspotClientSecret) console.warn('  WARNING: HUBSPOT_CLIENT_SECRET not set (signature verification disabled)');

  if (hubspotAccessToken) {
    setInterval(
      () => runSync().catch((err) => console.error('[HubSpot] Polling error:', err)),
      POLL_INTERVAL_MS
    );
    console.log(`  Polling: every ${POLL_INTERVAL_MS / 60000} min`);
  }
});

export default app;
