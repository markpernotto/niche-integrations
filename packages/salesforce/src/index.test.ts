/**
 * Integration tests for the Salesforce Express server.
 *
 * Tests: health check, sync auth guard, OAuth redirect.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-sf';
  process.env.SALESFORCE_CLIENT_ID = 'sf-client-id';
  process.env.SALESFORCE_CLIENT_SECRET = 'sf-client-secret';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-sf' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

vi.mock('./auth', () => ({
  buildAuthUrl: vi.fn().mockReturnValue('https://login.salesforce.com/services/oauth2/authorize?test=1'),
  exchangeCode: vi.fn().mockResolvedValue(undefined),
  getValidAccessToken: vi.fn().mockResolvedValue('fake-sf-token'),
  getTokens: vi.fn().mockReturnValue(null),
}));

import app from './index';

describe('salesforce server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('salesforce-sync');
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
    it('redirects to Salesforce OAuth authorize URL', async () => {
      const res = await request(app).get('/auth');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('salesforce.com');
    });
  });
});
