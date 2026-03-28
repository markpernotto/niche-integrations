/**
 * Integration tests for the HubSpot outbound Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-hs';
  process.env.HUBSPOT_ACCESS_TOKEN = '';
  process.env.NICHE_HUBSPOT_CLIENT_ID = '';
  process.env.NICHE_HUBSPOT_CLIENT_SECRET = '';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('./hubspot', () => ({
  searchContactByPhone: vi.fn(),
  searchContactByEmail: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  createDeal: vi.fn(),
  associateContactWithDeal: vi.fn(),
  closeDeal: vi.fn(),
  createCallEngagement: vi.fn(),
  ensureNicheLeadIdProperty: vi.fn().mockResolvedValue(undefined),
}));

import app from './index';

describe('hubspot outbound server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('hubspot-outbound-sync');
    });

    it('reports hubspotConfigured: false when token not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.hubspotConfigured).toBe(false);
    });

    it('reports nicheConfigured: false when credentials not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.nicheConfigured).toBe(false);
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
