import { describe, it, expect } from 'vitest';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import type { ZohoLead, ZohoContact } from './types';

function makeLead(overrides: Partial<ZohoLead> = {}): ZohoLead {
  return {
    id: 'z-lead-1',
    First_Name: 'Alice',
    Last_Name: 'Brown',
    Phone: '5551234567',
    Mobile: undefined,
    Email: 'alice@example.com',
    Company: 'BigCo',
    Title: 'VP Sales',
    Lead_Source: 'Cold Call',
    Lead_Status: 'New',
    City: 'Chicago',
    State: 'IL',
    Modified_Time: '2026-01-01T00:00:00Z',
    Created_Time: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContact(overrides: Partial<ZohoContact> = {}): ZohoContact {
  return {
    id: 'z-contact-1',
    First_Name: 'Bob',
    Last_Name: 'Green',
    Phone: '5559876543',
    Mobile: undefined,
    Email: 'bob@example.com',
    Account_Name: 'SmallCo',
    Title: 'Engineer',
    Mailing_City: 'Denver',
    Mailing_State: 'CO',
    Modified_Time: '2026-01-01T00:00:00Z',
    Created_Time: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Zoho CRM transformer', () => {
  describe('transformLeadToNiche', () => {
    it('returns source ZOHO_CRM', () => {
      expect(transformLeadToNiche(makeLead()).source).toBe('ZOHO_CRM');
    });

    it('combines first and last name', () => {
      expect(transformLeadToNiche(makeLead()).name).toBe('Alice Brown');
    });

    it('returns undefined name when both names absent', () => {
      expect(
        transformLeadToNiche(makeLead({ First_Name: undefined, Last_Name: undefined })).name
      ).toBeUndefined();
    });

    it('normalizes 10-digit phone', () => {
      expect(transformLeadToNiche(makeLead({ Phone: '5551234567' })).phone).toBe('+15551234567');
    });

    it('falls back to Mobile when Phone absent', () => {
      expect(
        transformLeadToNiche(makeLead({ Phone: undefined, Mobile: '5559999999' })).phone
      ).toBe('+15559999999');
    });

    it('includes email in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Email: alice@example.com');
    });

    it('includes company in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Company: BigCo');
    });

    it('includes location in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Location: Chicago, IL');
    });

    it('includes Lead Source in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Lead Source: Cold Call');
    });

    it('includes Status in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Status: New');
    });

    it('always includes Zoho Lead ID', () => {
      expect(transformLeadToNiche(makeLead({ id: 'zoho-99' })).info).toContain(
        'Zoho Lead ID: zoho-99'
      );
    });
  });

  describe('transformContactToNiche', () => {
    it('returns source ZOHO_CRM', () => {
      expect(transformContactToNiche(makeContact()).source).toBe('ZOHO_CRM');
    });

    it('combines first and last name', () => {
      expect(transformContactToNiche(makeContact()).name).toBe('Bob Green');
    });

    it('normalizes phone', () => {
      expect(transformContactToNiche(makeContact()).phone).toBe('+15559876543');
    });

    it('falls back to Mobile when Phone absent', () => {
      expect(
        transformContactToNiche(makeContact({ Phone: undefined, Mobile: '5551112222' })).phone
      ).toBe('+15551112222');
    });

    it('includes email in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Email: bob@example.com');
    });

    it('includes company in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Company: SmallCo');
    });

    it('includes mailing location in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Location: Denver, CO');
    });

    it('always includes Zoho Contact ID', () => {
      expect(transformContactToNiche(makeContact({ id: 'zoho-c-5' })).info).toContain(
        'Zoho Contact ID: zoho-c-5'
      );
    });
  });
});
