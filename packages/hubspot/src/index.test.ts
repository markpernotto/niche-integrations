/**
 * Integration tests for the HubSpot Express server.
 *
 * Tests: health check, webhook signature verification, sync endpoint auth guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

const { mockCreateLead, HS_CLIENT_SECRET } = vi.hoisted(() => {
  const HS_CLIENT_SECRET = 'test_hs_secret';
  process.env.PORT = '0';
  process.env.HUBSPOT_CLIENT_SECRET = HS_CLIENT_SECRET;
  process.env.HUBSPOT_ACCESS_TOKEN = ''; // explicitly empty — /sync should return 401
  process.env.NICHE_BUSINESS_ID = 'biz-test-hs';
  return {
    mockCreateLead: vi.fn().mockResolvedValue({ id: 'niche-lead-hs-1' }),
    HS_CLIENT_SECRET,
  };
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = mockCreateLead;
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./transformer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transformer')>();
  return {
    ...actual,
    fetchHubSpotContact: vi.fn().mockResolvedValue({
      id: 'hs-contact-mock',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      properties: {
        firstname: 'Mock',
        lastname: 'User',
        email: 'mock@example.com',
        phone: '5551234567',
      },
    }),
    fetchContactsUpdatedSince: vi.fn().mockResolvedValue([]),
    fetchDealsUpdatedSince: vi.fn().mockResolvedValue([]),
    fetchDealAssociatedContact: vi.fn().mockResolvedValue(null),
  };
});

import app from './index';

// HubSpot v1 signature: SHA256(clientSecret + requestBody)
function hsSignature(body: string): string {
  return crypto.createHash('sha256').update(HS_CLIENT_SECRET + body).digest('hex');
}

function contactEvent(objectId = 99, eventId = 1001) {
  return [
    {
      eventId,
      subscriptionId: 1,
      portalId: 123,
      appId: 456,
      occurredAt: Date.now(),
      subscriptionType: 'contact.creation',
      attemptNumber: 0,
      objectId,
    },
  ];
}

describe('hubspot server', () => {
  beforeEach(() => {
    mockCreateLead.mockClear();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('hubspot-sync');
    });
  });

  describe('POST /webhook', () => {
    it('returns 401 when signature is missing', async () => {
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .send(contactEvent());
      expect(res.status).toBe(401);
    });

    it('returns 401 when signature is wrong', async () => {
      const body = JSON.stringify(contactEvent());
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hubspot-signature', 'a'.repeat(64))
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 200 when signature is valid', async () => {
      const events = contactEvent(200, 2002);
      const body = JSON.stringify(events);
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hubspot-signature', hsSignature(body))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('POST /sync', () => {
    it('returns 401 when HUBSPOT_ACCESS_TOKEN is not set', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/HUBSPOT_ACCESS_TOKEN/);
    });
  });
});
