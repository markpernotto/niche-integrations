/**
 * Facebook Lead Ads integration - captures leads from Facebook/Instagram Lead Ads
 *
 * Key requirements from spec:
 * - Return 200 OK within 20 seconds (process async)
 * - Deduplicate leadgen_ids for 24h
 * - Route page_id → businessId via env-configured JSON map
 * - Payload: { name, phone, info, source: "FACEBOOK" }
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import { FacebookLeadgenWebhook } from './types';
import { fetchFacebookLeadData, transformToNicheLead } from './transformer';

const app = express();

// Capture raw body for webhook signature verification
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.text({ type: 'application/x-www-form-urlencoded' }));

const nicheClient = new NicheClient(getNicheConfigForIntegration('facebook-leads'));
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || '';
const facebookAccessToken = process.env.FACEBOOK_ACCESS_TOKEN || '';

// ---------------------------------------------------------------------------
// Page ID → Business ID routing
// ---------------------------------------------------------------------------
function loadPageIdMap(): Record<string, string> {
  const raw = process.env.PAGE_ID_TO_BUSINESS_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, string>;
  } catch (e) {
    console.error('Failed to parse PAGE_ID_TO_BUSINESS_MAP:', e);
  }
  return {};
}

const pageIdToBusinessMap = loadPageIdMap();
// Fallback: single business ID for simple setups
const fallbackBusinessId = process.env.NICHE_BUSINESS_ID || '';

function resolveBusinessId(pageId: string | undefined): string | undefined {
  if (pageId && pageIdToBusinessMap[pageId]) {
    return pageIdToBusinessMap[pageId];
  }
  return fallbackBusinessId || undefined;
}

// ---------------------------------------------------------------------------
// Idempotency: in-memory dedup with 24h TTL
// ---------------------------------------------------------------------------
const processedLeads = new Map<string, number>();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isDuplicate(leadgenId: string): boolean {
  const now = Date.now();
  // Periodically clean expired entries (every check, cheap enough for competition)
  for (const [key, ts] of processedLeads) {
    if (now - ts > DEDUP_TTL_MS) processedLeads.delete(key);
  }
  if (processedLeads.has(leadgenId)) return true;
  processedLeads.set(leadgenId, now);
  return false;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (with length guard for timingSafeEqual)
// ---------------------------------------------------------------------------
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  appSecret: string
): boolean {
  if (!appSecret) {
    console.warn('FACEBOOK_APP_SECRET not set, skipping signature verification');
    return true;
  }
  if (!signature || typeof signature !== 'string') {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  // Length guard: timingSafeEqual throws if buffers differ in length
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'facebook-leads-integration',
    configured: !!facebookAccessToken,
    pagesConfigured: Object.keys(pageIdToBusinessMap).length,
  });
});

// ---------------------------------------------------------------------------
// Facebook webhook verification (GET)
// ---------------------------------------------------------------------------
app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || 'niche_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ---------------------------------------------------------------------------
// Facebook webhook for leadgen events (POST)
// MUST return 200 immediately, process async (20-second rule)
// ---------------------------------------------------------------------------
app.post('/webhook', (req: Request & { rawBody?: Buffer }, res: Response): void => {
  // Verify webhook signature using raw body
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody =
    req.rawBody != null ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature, facebookAppSecret)) {
    console.error('Invalid webhook signature');
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  const webhook: FacebookLeadgenWebhook = req.body;
  if (!webhook || !Array.isArray(webhook.entry)) {
    res.status(200).send('OK');
    return;
  }

  // Return 200 immediately — process leads async (20-second rule)
  res.status(200).send('OK');

  // Fire-and-forget async processing
  setImmediate(() => {
    processWebhook(webhook).catch((err) => {
      console.error('Error in async webhook processing:', err);
    });
  });
});

/**
 * Async lead processing — runs after 200 has been sent
 */
async function processWebhook(webhook: FacebookLeadgenWebhook): Promise<void> {
  for (const entry of webhook.entry) {
    if (!entry.changes || !Array.isArray(entry.changes)) continue;

    // entry.id is the page ID
    const pageId = String(entry.id);

    for (const change of entry.changes) {
      if (change.field !== 'leadgen') continue;

      const leadgenId = change.value.leadgen_id;

      // Idempotency check
      if (isDuplicate(leadgenId)) {
        console.log(`Skipping duplicate leadgen_id: ${leadgenId}`);
        continue;
      }

      const businessId = resolveBusinessId(pageId);
      if (!businessId) {
        console.error(`No business ID mapped for page ${pageId} and no fallback configured`);
        continue;
      }

      if (!facebookAccessToken) {
        console.error('FACEBOOK_ACCESS_TOKEN not configured');
        continue;
      }

      try {
        // Fetch full lead data from Facebook Graph API
        const leadData = await fetchFacebookLeadData(leadgenId, facebookAccessToken);

        // Transform to Niche lead format
        const nicheLead = transformToNicheLead(leadData);

        // Create lead in Niche
        const created = await nicheClient.createLead(businessId, nicheLead);

        console.log(
          `Created Niche lead ${created.id} from Facebook lead ${leadgenId} (page ${pageId} → business ${businessId})`
        );
      } catch (error) {
        console.error(`Error processing Facebook lead ${leadgenId}:`, error);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 6666;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Facebook Lead Ads integration server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
    console.log(`Pages configured: ${Object.keys(pageIdToBusinessMap).length}`);

    if (!facebookAccessToken) {
      console.log('\n⚠️  WARNING: FACEBOOK_ACCESS_TOKEN not set.');
    }
    if (!facebookAppSecret) {
      console.log('\n⚠️  WARNING: FACEBOOK_APP_SECRET not set.');
    }
    if (Object.keys(pageIdToBusinessMap).length === 0 && !fallbackBusinessId) {
      console.log('\n⚠️  WARNING: No PAGE_ID_TO_BUSINESS_MAP or NICHE_BUSINESS_ID configured.');
    }
  });
}

export default app;
