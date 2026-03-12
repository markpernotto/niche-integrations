/**
 * HubSpot integration - receives webhook events when contacts are created/updated
 * and syncs them to Niche as leads.
 *
 * HubSpot webhook flow:
 * 1. HubSpot POSTs an array of events to this server
 * 2. We verify the X-HubSpot-Signature header (HMAC-SHA256)
 * 3. For contact.creation (and optionally contact.propertyChange) events,
 *    we fetch the full contact from HubSpot CRM API
 * 4. Transform and POST to Niche
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { HubSpotWebhookEvent } from './types';
import { fetchHubSpotContact, transformToNicheLead } from './transformer';

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
const PORT = parseInt(process.env.HUBSPOT_PORT || '7777', 10);

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
// In-memory dedup (eventId)
// ---------------------------------------------------------------------------
const processedEventIds = new Map<number, number>();

function isDuplicate(eventId: number): boolean {
  const now = Date.now();
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.set(eventId, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedEventIds) {
    if (ts < cutoff) processedEventIds.delete(id);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Process a single HubSpot contact event
// ---------------------------------------------------------------------------
async function processEvent(event: HubSpotWebhookEvent): Promise<void> {
  const { subscriptionType, objectId, eventId } = event;

  if (!subscriptionType.startsWith('contact.')) return;
  if (isDuplicate(eventId)) {
    console.log(`[HubSpot] Skipping duplicate event ${eventId}`);
    return;
  }

  console.log(`[HubSpot] Processing ${subscriptionType} for contact ${objectId}`);

  const contact = await fetchHubSpotContact(objectId, hubspotAccessToken);
  const lead = transformToNicheLead(contact);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[HubSpot] Contact ${objectId} has no phone or email — skipping`);
    return;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[HubSpot] Lead created for contact ${objectId}`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hubspot-webhook',
    businessId: nicheBusinessId || '(not set)',
    hubspotConfigured: !!hubspotAccessToken && !!hubspotClientSecret,
  });
});

app.post('/webhook', (req: Request & { rawBody?: Buffer }, res: Response) => {
  if (!verifyHubSpotSignature(req)) {
    console.warn('[HubSpot] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Respond immediately
  res.status(200).json({ received: true });

  const events: HubSpotWebhookEvent[] = Array.isArray(req.body) ? req.body : [req.body];

  setImmediate(async () => {
    for (const event of events) {
      try {
        await processEvent(event);
      } catch (err) {
        console.error(`[HubSpot] Error processing event ${event.eventId}:`, err);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`HubSpot webhook server running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Webhook: http://localhost:${PORT}/webhook`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!hubspotAccessToken) console.warn('  WARNING: HUBSPOT_ACCESS_TOKEN not set');
  if (!hubspotClientSecret) console.warn('  WARNING: HUBSPOT_CLIENT_SECRET not set (signature verification disabled)');
});

export default app;
