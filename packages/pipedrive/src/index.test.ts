/**
 * Integration tests for the Pipedrive Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-pipedrive';
  // No PIPEDRIVE_API_TOKEN set — so isConfigured returns false
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-pipedrive' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./auth', () => ({
  isConfigured: vi.fn(() => false),
}));

import app from './index';

describe('pipedrive server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('pipedrive-sync');
    });

    it('reports configured: false when API token not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when API token not configured', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/PIPEDRIVE_API_TOKEN/);
    });
  });
});
