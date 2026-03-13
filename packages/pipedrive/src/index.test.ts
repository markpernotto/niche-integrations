/**
 * Integration tests for the Pipedrive Express server.
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-pipedrive';
  process.env.PIPEDRIVE_CLIENT_ID = 'pd-client-id';
  process.env.PIPEDRIVE_CLIENT_SECRET = 'pd-client-secret';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-pipedrive' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

// loadTokens returns null — /sync must return 401
vi.mock('./auth', () => ({
  buildAuthUrl: vi.fn(
    (clientId: string, redirectUri: string) =>
      `https://oauth.pipedrive.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`
  ),
  exchangeCode: vi.fn(),
  getValidAccessToken: vi.fn(),
  loadTokens: vi.fn(() => null),
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

    it('reports authenticated: false when no tokens', async () => {
      const res = await request(app).get('/health');
      expect(res.body.authenticated).toBe(false);
    });

    it('reports configured: true when client ID and secret set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(true);
    });
  });

  describe('GET /auth', () => {
    it('redirects to Pipedrive OAuth', async () => {
      const res = await request(app).get('/auth').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('oauth.pipedrive.com');
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
