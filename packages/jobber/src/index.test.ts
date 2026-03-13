/**
 * Integration tests for the Jobber Express server.
 *
 * Tests: health check, sync auth guard, OAuth redirect.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-jobber';
  process.env.JOBBER_CLIENT_ID = 'jobber-client-id';
  process.env.JOBBER_CLIENT_SECRET = 'jobber-client-secret';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-jobber' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

// Mock auth so getTokens() returns null (unauthenticated)
vi.mock('./auth', () => ({
  buildAuthUrl: vi.fn().mockReturnValue('https://api.getjobber.com/api/oauth/authorize?redirect=test'),
  exchangeCode: vi.fn().mockResolvedValue(undefined),
  getValidAccessToken: vi.fn().mockResolvedValue('fake-access-token'),
  getTokens: vi.fn().mockReturnValue(null),
}));

import app from './index';

describe('jobber server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('jobber-sync');
    });

    it('reports jobberConfigured when credentials are set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.jobberConfigured).toBe(true);
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
    it('redirects to Jobber OAuth authorize URL', async () => {
      const res = await request(app).get('/auth');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('getjobber.com');
    });
  });
});
