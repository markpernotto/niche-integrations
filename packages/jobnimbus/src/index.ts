/**
 * JobNimbus integration - receives webhook events when contacts are created/updated
 * and syncs them to Niche as leads.
 *
 * Setup in JobNimbus:
 *   Company → Integrations → Webhooks → New Webhook
 *   - Set URL to: https://<your-server>/webhook
 *   - Select events: "New contact created", "Contact updated"
 *
 * JobNimbus sends the full record object as the POST body.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import type { JobNimbusRecord, JobNimbusContact } from './types';
import { transformToNicheLead } from './transformer';

const app = express();
app.use(express.json());

const nicheClient = new NicheClient(getNicheConfigForIntegration('jobnimbus'));
const nicheBusinessId = process.env.NICHE_BUSINESS_ID || '';
const PORT = parseInt(process.env.PORT || process.env.JOBNIMBUS_PORT || '8888', 10);

// ---------------------------------------------------------------------------
// In-memory dedup (jnid, 24-hour TTL)
// ---------------------------------------------------------------------------
const processedIds = new Map<string, number>();

function isDuplicate(jnid: string): boolean {
  const now = Date.now();
  if (processedIds.has(jnid)) return true;
  processedIds.set(jnid, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Process a single JobNimbus record
// ---------------------------------------------------------------------------
async function processRecord(record: JobNimbusRecord): Promise<void> {
  if (record.record_type !== 'contact') {
    console.log(`[JobNimbus] Skipping non-contact record type: ${record.record_type}`);
    return;
  }

  const contact = record as JobNimbusContact;

  if (isDuplicate(contact.jnid)) {
    console.log(`[JobNimbus] Skipping duplicate contact ${contact.jnid}`);
    return;
  }

  console.log(`[JobNimbus] Processing contact ${contact.jnid}`);

  const lead = transformToNicheLead(contact);

  if (!lead.phone && !lead.info?.includes('Email:')) {
    console.warn(`[JobNimbus] Contact ${contact.jnid} has no phone or email — skipping`);
    return;
  }

  await nicheClient.createLead(nicheBusinessId, lead);
  console.log(`[JobNimbus] Lead created for contact ${contact.jnid}`);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'jobnimbus-webhook',
    businessId: nicheBusinessId || '(not set)',
  });
});

app.post('/webhook', (req: Request, res: Response) => {
  // Respond immediately — JobNimbus expects a fast response
  res.status(200).json({ received: true });

  const record: JobNimbusRecord = req.body;

  setImmediate(async () => {
    try {
      await processRecord(record);
    } catch (err) {
      console.error(`[JobNimbus] Error processing record:`, err);
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`JobNimbus webhook server running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Webhook: http://localhost:${PORT}/webhook`);
  if (!nicheBusinessId) console.warn('  WARNING: NICHE_BUSINESS_ID not set');
});

export default app;
