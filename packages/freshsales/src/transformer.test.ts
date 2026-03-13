import { describe, it, expect } from 'vitest';
import { transformContactToNiche, transformLeadToNiche } from './transformer';
import type { FreshsalesContact, FreshsalesLead } from './types';

function makeContact(overrides: Partial<FreshsalesContact> = {}): FreshsalesContact {
  return {
    id: 101,
    first_name: 'Carol',
    last_name: 'White',
    display_name: 'Carol White',
    email: 'carol@example.com',
    mobile_number: '5551234567',
    work_number: undefined,
    job_title: 'CTO',
    city: 'Seattle',
    state: 'WA',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLead(overrides: Partial<FreshsalesLead> = {}): FreshsalesLead {
  return {
    id: 202,
    first_name: 'Dan',
    last_name: 'Black',
    display_name: 'Dan Black',
    email: 'dan@example.com',
    mobile_number: '5559876543',
    work_number: undefined,
    job_title: 'Owner',
    city: 'Portland',
    state: 'OR',
    company: { name: 'Portland Co' },
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Freshsales transformer', () => {
  describe('transformContactToNiche', () => {
    it('returns source FRESHSALES', () => {
      expect(transformContactToNiche(makeContact()).source).toBe('FRESHSALES');
    });

    it('combines first and last name', () => {
      expect(transformContactToNiche(makeContact()).name).toBe('Carol White');
    });

    it('falls back to display_name when no first/last', () => {
      const result = transformContactToNiche(
        makeContact({ first_name: undefined, last_name: undefined, display_name: 'Display Name' })
      );
      expect(result.name).toBe('Display Name');
    });

    it('returns undefined name when all name fields absent', () => {
      const result = transformContactToNiche(
        makeContact({ first_name: undefined, last_name: undefined, display_name: undefined })
      );
      expect(result.name).toBeUndefined();
    });

    it('normalizes mobile_number', () => {
      expect(transformContactToNiche(makeContact()).phone).toBe('+15551234567');
    });

    it('falls back to work_number when mobile absent', () => {
      expect(
        transformContactToNiche(makeContact({ mobile_number: undefined, work_number: '5559999999' }))
          .phone
      ).toBe('+15559999999');
    });

    it('includes email in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Email: carol@example.com');
    });

    it('includes job title in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Title: CTO');
    });

    it('includes location in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Location: Seattle, WA');
    });

    it('always includes Freshsales Contact ID', () => {
      expect(transformContactToNiche(makeContact({ id: 999 })).info).toContain(
        'Freshsales Contact ID: 999'
      );
    });
  });

  describe('transformLeadToNiche', () => {
    it('returns source FRESHSALES', () => {
      expect(transformLeadToNiche(makeLead()).source).toBe('FRESHSALES');
    });

    it('combines first and last name', () => {
      expect(transformLeadToNiche(makeLead()).name).toBe('Dan Black');
    });

    it('falls back to display_name', () => {
      const result = transformLeadToNiche(
        makeLead({ first_name: undefined, last_name: undefined, display_name: 'Lead Display' })
      );
      expect(result.name).toBe('Lead Display');
    });

    it('normalizes mobile_number', () => {
      expect(transformLeadToNiche(makeLead()).phone).toBe('+15559876543');
    });

    it('includes email in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Email: dan@example.com');
    });

    it('includes company in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Company: Portland Co');
    });

    it('includes location in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Location: Portland, OR');
    });

    it('always includes Freshsales Lead ID', () => {
      expect(transformLeadToNiche(makeLead({ id: 777 })).info).toContain(
        'Freshsales Lead ID: 777'
      );
    });

    it('omits company when absent', () => {
      const result = transformLeadToNiche(makeLead({ company: undefined }));
      expect(result.info).not.toContain('Company:');
    });
  });
});
