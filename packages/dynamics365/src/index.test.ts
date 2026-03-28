/**
 * Integration tests for the Dynamics 365 Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-dynamics365';
  // No DYNAMICS_* vars set — so isConfigured returns false
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-dynamics' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./auth', () => ({
  getAccessToken: vi.fn(),
  isConfigured: vi.fn(() => false),
}));

import app from './index';

describe('dynamics365 server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('dynamics365-sync');
    });

    it('reports configured: false when env vars not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when not configured', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/DYNAMICS_TENANT_ID/);
    });
  });
});
