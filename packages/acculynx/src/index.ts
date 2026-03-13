/**
 * AccuLynx integration - receives webhook events when jobs are created/updated
 * and syncs them to Niche as leads.
 *
 * AccuLynx uses a webhook subscription model — you register your endpoint via
 * their API and they POST events to it.
 *
 * Setup:
 *   1. Enable AppConnections add-on: Account → Add-On Features and Integrations
 *   2. Generate API key: Settings → API Keys
 *   3. Fill in ACCULYNX_API_KEY and NICHE_ACCULYNX_CLIENT_ID/SECRET in .env
 *   4. Register webhook subscription (run once):
 *        POST https://api.acculynx.com/webhooks/v2/subscriptions
 *        Authorization: Bearer <ACCULYNX_API_KEY>
 *        { "topic": "job.milestone.changed", "url": "https://<your-host>/webhook" }
 *   5. Repeat for "job.status.changed" if desired
 *
 * AccuLynx rate limits: 30 req/s per IP, 10 req/s per API key.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { AccuLynxWebhookEvent } from './types';
import { transformToNicheLead } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('acculynx'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.ACCULYNX_PORT || '9002', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (job id, 24-hour TTL)
// ---------------------------------------------------------------------------
const processedIds = new Map<string, number>();

function isDuplicate(jobId: string): boolean {
  const now = Date.now();
  if (processedIds.has(jobId)) return true;
  processedIds.set(jobId, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Process a webhook event
// ---------------------------------------------------------------------------
async function processEvent(event: AccuLynxWebhookEvent): Promise<void> {
  const job = event.data;
  if (!job?.id) {
    console.warn('[AccuLynx] Received event with no job data — skipping');
    return;
  }

  // Only process on first milestone/status change per job to avoid duplicates
  if (isDuplicate(job.id)) {
    console.log(`[AccuLynx] Skipping already-processed job ${job.id}`);
    return;
  }

  console.log(`[AccuLynx] Processing job ${job.id} (topic: ${event.topic})`);

  const lead = transformToNicheLead(job);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[AccuLynx] Job ${job.id} has no phone or email — skipping`);
    return;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[AccuLynx] Lead created for job ${job.id}`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'acculynx-webhook',
    businessId: nicheBusinessId || '(not set)',
  });
});

app.post('/webhook', (req: Request, res: Response) => {
  // AccuLynx expects a fast response
  res.status(200).json({ received: true });

  const event: AccuLynxWebhookEvent = req.body;

  setImmediate(async () => {
    try {
      await processEvent(event);
    } catch (err) {
      console.error('[AccuLynx] Error processing event:', err);
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`AccuLynx webhook server running on port ${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Webhook: http://localhost:${PORT}/webhook`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
});

export default app;
