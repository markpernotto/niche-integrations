/**
 * Facebook Lead Ads integration - captures leads from Facebook/Instagram Lead Ads
 */

import path from 'path';
import { config } from 'dotenv';

// Load root .env when running from package (e.g. pnpm start in packages/facebook-leads)
config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { NicheClient, getNicheConfigForIntegration } from '@niche-integrations/core';
import { FacebookLeadgenWebhook } from './types';
import { fetchFacebookLeadData, transformToNicheLead } from './transformer';

const app = express();
// Capture raw body for webhook signature verification (Meta signs the exact bytes sent)
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

/**
 * Verify Facebook webhook signature
 */
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

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'facebook-leads-integration',
    configured: !!facebookAccessToken,
  });
});

/**
 * Facebook webhook verification endpoint
 * GET /webhook
 */
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

/**
 * Facebook webhook endpoint for leadgen events
 * POST /webhook
 */
app.post('/webhook', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    // Verify webhook signature using raw body (Meta signs the exact bytes sent)
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody =
      req.rawBody != null ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature, facebookAppSecret)) {
      console.error('Invalid webhook signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const webhook: FacebookLeadgenWebhook = req.body;
    if (!webhook || !Array.isArray(webhook.entry)) {
      return res.status(200).send('OK');
    }

    // Process each entry
    for (const entry of webhook.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (change.field === 'leadgen') {
          const leadgenId = change.value.leadgen_id;
          const businessId = process.env.NICHE_BUSINESS_ID;

          if (!businessId) {
            console.error('NICHE_BUSINESS_ID not configured');
            return res.status(500).json({ error: 'Business ID not configured' });
          }

          if (!facebookAccessToken) {
            console.error('FACEBOOK_ACCESS_TOKEN not configured');
            return res.status(500).json({ error: 'Facebook access token not configured' });
          }

          try {
            // Fetch full lead data from Facebook Graph API
            const leadData = await fetchFacebookLeadData(leadgenId, facebookAccessToken);

            // Transform to Niche lead format
            const nicheLead = transformToNicheLead(leadData, 'facebook-lead-ads');

            // Create lead in Niche
            const created = await nicheClient.createLead(businessId, nicheLead);

            console.log(`Created Niche lead ${created.id} from Facebook lead ${leadgenId}`);
          } catch (error) {
            console.error(`Error processing Facebook lead ${leadgenId}:`, error);
            // Continue processing other leads even if one fails
          }
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling Facebook webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 6666;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Facebook Lead Ads integration server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
    
    if (!facebookAccessToken) {
      console.log('\n⚠️  WARNING: FACEBOOK_ACCESS_TOKEN not set.');
      console.log('Get your access token from Meta for Developers.');
    }
    
    if (!facebookAppSecret) {
      console.log('\n⚠️  WARNING: FACEBOOK_APP_SECRET not set.');
      console.log('Webhook signature verification will be skipped.');
    }
  });
}

export default app;
