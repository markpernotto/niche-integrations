/**
 * Integration tests for the Zoho CRM Express server.
 *
 * Tests: health check, sync auth guard, OAuth redirect.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-zoho';
  process.env.ZOHO_CLIENT_ID = 'zoho-client-id';
  process.env.ZOHO_CLIENT_SECRET = 'zoho-client-secret';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-zoho' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./auth', () => ({
  buildAuthUrl: vi.fn().mockReturnValue('https://accounts.zoho.com/oauth/v2/auth?test=1'),
  exchangeCode: vi.fn().mockResolvedValue(undefined),
  getValidAccessToken: vi.fn().mockResolvedValue('fake-zoho-token'),
  getTokens: vi.fn().mockReturnValue(null),
}));

import app from './index';

describe('zoho-crm server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('zoho-crm-sync');
    });
  });

  describe('POST /sync', () => {
    it('returns 401 when not authenticated via OAuth', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/auth/i);
    });
  });

  describe('GET /auth', () => {
    it('redirects to Zoho OAuth authorize URL', async () => {
      const res = await request(app).get('/auth');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('zoho.com');
    });
  });
});
