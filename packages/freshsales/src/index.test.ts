/**
 * Integration tests for the Freshsales Express server.
 *
 * Tests: health check, sync config guard (API key + domain required).
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.PORT = '0';
  process.env.NICHE_BUSINESS_ID = 'biz-test-freshsales';
  process.env.FRESHSALES_API_KEY = '';   // explicitly empty — /sync returns 500
  process.env.FRESHSALES_DOMAIN = '';
});

vi.mock('dotenv', () => ({ config: vi.fn() }));

vi.mock('@niche-integrations/core', () => ({
  NicheClient: class {
    createLead = vi.fn().mockResolvedValue({ id: 'niche-lead-freshsales' });
  },
  getNicheConfigForIntegration: () => ({}),
}));

import app from './index';

describe('freshsales server', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('freshsales-sync');
    });

    it('reports configured: false when API key and domain are not set', async () => {
      const res = await request(app).get('/health');
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /sync', () => {
    it('returns 500 when FRESHSALES_API_KEY or FRESHSALES_DOMAIN is not set', async () => {
      const res = await request(app).post('/sync');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/FRESHSALES_API_KEY|FRESHSALES_DOMAIN/);
    });
  });
});
