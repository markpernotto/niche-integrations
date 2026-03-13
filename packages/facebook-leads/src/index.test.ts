/**
 * Integration tests for the Facebook Lead Ads Express server.
 *
 * Tests the HTTP layer: health check, webhook verification (GET),
 * webhook signature verification (POST), and async lead processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Set env vars and create shared mock references before any module is loaded.
// vi.hoisted() runs before imports — the only safe place to do this.
// ---------------------------------------------------------------------------
const { mockCreateLead, FB_APP_SECRET, FB_VERIFY_TOKEN } = vi.hoisted(() => {
  const FB_APP_SECRET = 'test_fb_secret';
  const FB_VERIFY_TOKEN = 'test_verify_token';
  process.env.PORT = '0'; // random port — avoids conflicts with running dev servers
  process.env.FACEBOOK_APP_SECRET = FB_APP_SECRET;
  process.env.FACEBOOK_VERIFY_TOKEN = FB_VERIFY_TOKEN;
  process.env.FACEBOOK_ACCESS_TOKEN = 'test_fb_access_token';
  process.env.NICHE_BUSINESS_ID = 'biz-test-123';
  return {
    mockCreateLead: vi.fn().mockResolvedValue({ id: 'niche-lead-1' }),
    FB_APP_SECRET,
    FB_VERIFY_TOKEN,
  };
});

// Prevent dotenv from loading the real .env file during tests
vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = mockCreateLead;
  },
  getNicheConfigForIntegration: () => ({}),
}));

// Keep transformer logic real but stub the network call
vi.mock('./transformer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transformer')>();
  return {
    ...actual,
    fetchFacebookLeadData: vi.fn().mockResolvedValue({
      id: 'fb-lead-42',
      created_time: '2026-01-01T00:00:00+0000',
      field_data: [
        { name: 'full_name', values: ['Test User'] },
        { name: 'phone_number', values: ['5551234567'] },
        { name: 'email', values: ['test@example.com'] },
      ],
    }),
  };
});

import app from './index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fbSignature(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', FB_APP_SECRET).update(body).digest('hex');
}

function webhookPayload(leadgenId = 'lead-999', pageId = 'page-1') {
  return {
    object: 'leadgen',
    entry: [
      {
        id: pageId,
        time: 1700000000,
        changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, page_id: pageId, form_id: 'form-1', created_time: 1700000000 } }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('facebook-leads server', () => {
  beforeEach(() => {
    mockCreateLead.mockClear();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('facebook-leads-integration');
    });
  });

  describe('GET /webhook (verification)', () => {
    it('returns the challenge when verify token matches', async () => {
      const res = await request(app).get('/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': FB_VERIFY_TOKEN,
        'hub.challenge': 'abc123',
      });
      expect(res.status).toBe(200);
      expect(res.text).toBe('abc123');
    });

    it('returns 403 when verify token does not match', async () => {
      const res = await request(app).get('/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'abc123',
      });
      expect(res.status).toBe(403);
    });

    it('returns 403 when mode is not subscribe', async () => {
      const res = await request(app).get('/webhook').query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': FB_VERIFY_TOKEN,
        'hub.challenge': 'abc123',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhook (leadgen events)', () => {
    it('returns 403 when signature is missing', async () => {
      const body = JSON.stringify(webhookPayload());
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(403);
    });

    it('returns 403 when signature is wrong', async () => {
      const body = JSON.stringify(webhookPayload());
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', 'sha256=' + 'a'.repeat(64))
        .send(body);
      expect(res.status).toBe(403);
    });

    it('returns 200 immediately when signature is valid', async () => {
      const payload = webhookPayload();
      const body = JSON.stringify(payload);
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', fbSignature(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('returns 200 for an empty entry array (no-op)', async () => {
      const payload = { object: 'leadgen', entry: [] };
      const body = JSON.stringify(payload);
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', fbSignature(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('calls createLead for a valid lead event', async () => {
      const payload = webhookPayload('lead-abc-1');
      const body = JSON.stringify(payload);
      await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', fbSignature(body))
        .send(body);

      // Webhook processing is async (setImmediate) — poll until the call completes
      await vi.waitFor(() => {
        expect(mockCreateLead).toHaveBeenCalledOnce();
      }, { timeout: 2000 });

      const [businessId, lead] = mockCreateLead.mock.calls[0];
      expect(businessId).toBe('biz-test-123');
      expect(lead.source).toBe('FACEBOOK');
      expect(lead.name).toBe('Test User');
    });

    it('deduplicates the same leadgen_id within a request cycle', async () => {
      const payload = webhookPayload('lead-dedup-1');
      const body = JSON.stringify(payload);
      const sig = fbSignature(body);

      // First request — processes the lead
      await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sig)
        .send(body);

      await vi.waitFor(() => {
        expect(mockCreateLead).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });

      mockCreateLead.mockClear();

      // Second request with same leadgen_id — should be deduped (createLead NOT called again)
      await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sig)
        .send(body);

      // Give async processing time to run
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockCreateLead).not.toHaveBeenCalled();
    });
  });
});
