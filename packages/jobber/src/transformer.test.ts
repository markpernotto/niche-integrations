import { describe, it, expect } from 'vitest';
import { transformToNicheLead } from './transformer';
import type { JobberClient } from './types';

function makeClient(overrides: Partial<JobberClient> = {}): JobberClient {
  return {
    id: 'client-1',
    firstName: 'Jane',
    lastName: 'Doe',
    companyName: undefined,
    phones: [{ number: '5551234567', primary: true }],
    emails: [{ address: 'jane@example.com', primary: true }],
    billingAddress: undefined,
    isLead: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Jobber transformer', () => {
  it('returns source JOBBER', () => {
    const result = transformToNicheLead(makeClient());
    expect(result.source).toBe('JOBBER');
  });

  describe('name building', () => {
    it('combines first and last name', () => {
      const result = transformToNicheLead(makeClient({ firstName: 'Jane', lastName: 'Doe' }));
      expect(result.name).toBe('Jane Doe');
    });

    it('uses first name only when last is absent', () => {
      const result = transformToNicheLead(makeClient({ firstName: 'Jane', lastName: undefined }));
      expect(result.name).toBe('Jane');
    });

    it('falls back to companyName when no personal name', () => {
      const result = transformToNicheLead(
        makeClient({ firstName: undefined, lastName: undefined, companyName: 'Acme Corp' })
      );
      expect(result.name).toBe('Acme Corp');
    });

    it('returns undefined when no name available', () => {
      const result = transformToNicheLead(
        makeClient({ firstName: undefined, lastName: undefined, companyName: undefined })
      );
      expect(result.name).toBeUndefined();
    });
  });

  describe('phone normalization', () => {
    it('normalizes 10-digit phone to E.164', () => {
      const result = transformToNicheLead(
        makeClient({ phones: [{ number: '5551234567', primary: true }] })
      );
      expect(result.phone).toBe('+15551234567');
    });

    it('normalizes 11-digit phone starting with 1', () => {
      const result = transformToNicheLead(
        makeClient({ phones: [{ number: '15551234567', primary: true }] })
      );
      expect(result.phone).toBe('+15551234567');
    });

    it('normalizes phone with formatting characters', () => {
      const result = transformToNicheLead(
        makeClient({ phones: [{ number: '(555) 123-4567', primary: true }] })
      );
      expect(result.phone).toBe('+15551234567');
    });

    it('passes through non-North-American numbers', () => {
      const result = transformToNicheLead(
        makeClient({ phones: [{ number: '+447911123456', primary: true }] })
      );
      expect(result.phone).toBe('+447911123456');
    });

    it('uses primary phone when multiple exist', () => {
      const result = transformToNicheLead(
        makeClient({
          phones: [
            { number: '4441111111', primary: false },
            { number: '5551234567', primary: true },
          ],
        })
      );
      expect(result.phone).toBe('+15551234567');
    });

    it('falls back to first phone when none is primary', () => {
      const result = transformToNicheLead(
        makeClient({
          phones: [
            { number: '5551234567', primary: false },
            { number: '5559876543', primary: false },
          ],
        })
      );
      expect(result.phone).toBe('+15551234567');
    });

    it('returns undefined when phones array is empty', () => {
      const result = transformToNicheLead(makeClient({ phones: [] }));
      expect(result.phone).toBeUndefined();
    });
  });

  describe('info block', () => {
    it('includes email in info', () => {
      const result = transformToNicheLead(makeClient());
      expect(result.info).toContain('Email: jane@example.com');
    });

    it('includes company in info when client has both name and company', () => {
      const result = transformToNicheLead(
        makeClient({ firstName: 'Jane', lastName: 'Doe', companyName: 'Acme' })
      );
      expect(result.info).toContain('Company: Acme');
    });

    it('does not include company when client has no personal name (company IS the name)', () => {
      const result = transformToNicheLead(
        makeClient({ firstName: undefined, lastName: undefined, companyName: 'Acme' })
      );
      expect(result.info).not.toContain('Company: Acme');
    });

    it('includes location when billing address city and province exist', () => {
      const result = transformToNicheLead(
        makeClient({ billingAddress: { city: 'Austin', province: 'TX' } })
      );
      expect(result.info).toContain('Location: Austin, TX');
    });

    it('includes Type: Lead when isLead is true', () => {
      const result = transformToNicheLead(makeClient({ isLead: true }));
      expect(result.info).toContain('Type: Lead');
    });

    it('always includes Jobber ID', () => {
      const result = transformToNicheLead(makeClient({ id: 'abc-123' }));
      expect(result.info).toContain('Jobber ID: abc-123');
    });
  });
});
