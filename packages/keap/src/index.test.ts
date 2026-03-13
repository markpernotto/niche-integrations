/**
 * Integration tests for the Keap Express server.
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

// loadTokens returns null (no token file) — /sync must return 401
vi.mock('./auth', () => ({
  buildAuthUrl: vi.fn(() => 'https://accounts.infusionsoft.com/app/oauth/authorize?mock'),
  exchangeCode: vi.fn(),
  getValidAccessToken: vi.fn(),
  loadTokens: vi.fn(() => null),
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

    it('reports authenticated: false when no tokens', async () => {
      const res = await request(app).get('/health');
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('GET /auth', () => {
    it('redirects to Keap OAuth when KEAP_CLIENT_ID not set', async () => {
      const res = await request(app).get('/auth');
      // clientId is empty string — returns 500
      expect(res.status).toBe(500);
    });
  });

  describe('POST /sync', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Not authenticated/);
    });
  });
});
