/**
 * Integration tests for the Keap Express server.
 * Keap uses service account (client_credentials) — no OAuth browser flow.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-keap';
  process.env.KEAP_CLIENT_ID = '';
  process.env.KEAP_CLIENT_SECRET = '';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-keap' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./auth', () => ({
  getValidAccessToken: vi.fn(),
  isConfigured: vi.fn(() => false),
}));

import app from './index';

describe('keap server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('keap-sync');
    });

    it('reports configured: false when credentials not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when credentials not configured', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/KEAP_CLIENT_ID|KEAP_CLIENT_SECRET/);
    });
  });
});
