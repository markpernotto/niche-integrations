/**
 * Integration tests for the Close CRM Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-close-crm';
  process.env.CLOSE_CRM_API_KEY = '';    // explicitly empty — /sync returns 500
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-close' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

import app from './index';

describe('close-crm server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('close-crm-sync');
    });

    it('reports configured: false when API key not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when CLOSE_CRM_API_KEY not set', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/CLOSE_CRM_API_KEY/);
    });
  });
});
