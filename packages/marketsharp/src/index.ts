/**
 * MarketSharp integration - polls MarketSharp for new/updated contacts
 * and syncs them to Niche as leads.
 *
 * MarketSharp is primarily a push-from-us API (no reliable outbound webhooks),
 * so we poll on a configurable interval (default: 15 min) and also expose a
 * /webhook endpoint for if/when they add outbound webhook support.
 *
 * Setup:
 *   1. Generate API key: MarketSharp Admin → Admin → "API maintenance" → "Create New API Key"
 *   2. Note your Company ID from the MarketSharp dashboard URL or admin settings
 *   3. Fill in MARKETSHARP_API_KEY and MARKETSHARP_COMPANY_ID in .env
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import axios from 'axios';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { MarketSharpContact, MarketSharpContactsResponse, MarketSharpWebhookPayload } from './types';
import { transformToNicheLead } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('marketsharp'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.MARKETSHARP_PORT || '9001', 10);

const msApiKey = process.env.MARKETSHARP_API_KEY || '';
const msCompanyId = process.env.MARKETSHARP_COMPANY_ID || '';
const MS_API_BASE = 'https://restapi.marketsharpm.com';
// How far back to look on each poll (ms). Default: 15 min.
const POLL_INTERVAL_MS = parseInt(process.env.MARKETSHARP_POLL_INTERVAL_MS || String(15 * 60 * 1000), 10);

// ---------------------------------------------------------------------------
// In-memory dedup (contact id, 24-hour TTL)
// ---------------------------------------------------------------------------
const processedIds = new Set<string>();
const processedTimestamps = new Map<string, number>();

function isDuplicate(id: string): boolean {
  return processedIds.has(id);
}

function markProcessed(id: string): void {
  processedIds.add(id);
  processedTimestamps.set(id, Date.now());
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedTimestamps) {
    if (ts < cutoff) {
      processedIds.delete(id);
      processedTimestamps.delete(id);
    }
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Fetch and sync contacts from MarketSharp
// ---------------------------------------------------------------------------
async function fetchContactsSince(since: Date): Promise<MarketSharpContact[]> {
  const res = await axios.get<MarketSharpContactsResponse>(
    `${MS_API_BASE}/api/v1/companies/${msCompanyId}/contacts`,
    {
      headers: { Authorization: `Bearer ${msApiKey}` },
      params: { updatedSince: since.toISOString(), pageSize: 100 },
    }
  );
  return res.data.contacts ?? [];
}

async function processContact(contact: MarketSharpContact): Promise<void> {
  const id = contact.id;
  if (!id) return;
  if (isDuplicate(id)) {
    console.log(`[MarketSharp] Skipping duplicate contact ${id}`);
    return;
  }

  console.log(`[MarketSharp] Processing contact ${id}`);
  const lead = transformToNicheLead(contact);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[MarketSharp] Contact ${id} has no phone or email — skipping`);
    return;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  markProcessed(id);
  console.log(`[MarketSharp] Lead created for contact ${id}`);
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------
let lastPollTime = new Date(Date.now() - POLL_INTERVAL_MS);

async function poll(): Promise<void> {
  if (!msApiKey || !msCompanyId) return;

  const since = lastPollTime;
  lastPollTime = new Date();

  try {
    const contacts = await fetchContactsSince(since);
    console.log(`[MarketSharp] Poll found ${contacts.length} contact(s) updated since ${since.toISOString()}`);
    for (const contact of contacts) {
      await processContact(contact);
    }
  } catch (err) {
    console.error('[MarketSharp] Poll error:', err);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'marketsharp-poller',
    businessId: nicheBusinessId || '(not set)',
    msConfigured: !!(msApiKey && msCompanyId),
    pollIntervalMs: POLL_INTERVAL_MS,
  });
});

// Webhook endpoint — for future use if MarketSharp adds outbound webhooks,
// or if a third-party integration pushes contacts to us.
app.post('/webhook', (req: Request, res: Response) => {
  res.status(200).json({ received: true });

  const payload: MarketSharpWebhookPayload = req.body;
  const contact = payload.contact ?? (req.body as MarketSharpContact);

  setImmediate(async () => {
    try {
      await processContact(contact);
    } catch (err) {
      console.error('[MarketSharp] Webhook processing error:', err);
    }
  });
});

// Manual trigger endpoint — useful for testing
app.post('/sync', async (_req: Request, res: Response) => {
  try {
    await poll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`MarketSharp integration running on port ${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Webhook: http://localhost:${PORT}/webhook`);
  console.log(`  Sync:    POST http://localhost:${PORT}/sync`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
  if (!msApiKey) console.warn('  WARNING: MARKETSHARP_API_KEY not set — polling disabled');
  if (!msCompanyId) console.warn('  WARNING: MARKETSHARP_COMPANY_ID not set — polling disabled');
});

// Start polling
setInterval(poll, POLL_INTERVAL_MS);
// Initial poll after 5s startup delay
setTimeout(poll, 5000);

export default app;
