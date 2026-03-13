/**
 * Integration tests for the ActiveCampaign Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-activecampaign';
  process.env.ACTIVECAMPAIGN_API_KEY = '';    // explicitly empty — /sync returns 500
  process.env.ACTIVECAMPAIGN_BASE_URL = '';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-ac' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

import app from './index';

describe('activecampaign server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('activecampaign-sync');
    });

    it('reports configured: false when API key and base URL not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when ACTIVECAMPAIGN_API_KEY or BASE_URL not set', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/ACTIVECAMPAIGN_API_KEY|ACTIVECAMPAIGN_BASE_URL/);
    });
  });
});
