import { describe, it, expect } from 'vitest';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import type { SalesforceLead, SalesforceContact } from './types';

function makeLead(overrides: Partial<SalesforceLead> = {}): SalesforceLead {
  return {
    Id: 'lead-1',
    FirstName: 'John',
    LastName: 'Smith',
    Phone: '5551234567',
    MobilePhone: undefined,
    Email: 'john@example.com',
    Company: 'Acme',
    Title: 'Manager',
    LeadSource: 'Web',
    Status: 'Open',
    City: 'Dallas',
    State: 'TX',
    CreatedDate: '2026-01-01T00:00:00Z',
    LastModifiedDate: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContact(overrides: Partial<SalesforceContact> = {}): SalesforceContact {
  return {
    Id: 'contact-1',
    FirstName: 'Jane',
    LastName: 'Doe',
    Phone: '5559876543',
    MobilePhone: undefined,
    Email: 'jane@example.com',
    AccountName: 'Corp Inc',
    Title: 'Director',
    MailingCity: 'Austin',
    MailingState: 'TX',
    CreatedDate: '2026-01-01T00:00:00Z',
    LastModifiedDate: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Salesforce transformer', () => {
  describe('transformLeadToNiche', () => {
    it('returns source SALESFORCE', () => {
      expect(transformLeadToNiche(makeLead()).source).toBe('SALESFORCE');
    });

    it('combines first and last name', () => {
      expect(transformLeadToNiche(makeLead()).name).toBe('John Smith');
    });

    it('returns undefined name when both names absent', () => {
      expect(
        transformLeadToNiche(makeLead({ FirstName: undefined, LastName: undefined })).name
      ).toBeUndefined();
    });

    it('normalizes 10-digit phone', () => {
      expect(transformLeadToNiche(makeLead({ Phone: '5551234567' })).phone).toBe('+15551234567');
    });

    it('falls back to MobilePhone when Phone absent', () => {
      expect(
        transformLeadToNiche(makeLead({ Phone: undefined, MobilePhone: '5559876543' })).phone
      ).toBe('+15559876543');
    });

    it('includes email in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Email: john@example.com');
    });

    it('includes company in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Company: Acme');
    });

    it('includes location in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Location: Dallas, TX');
    });

    it('includes LeadSource in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Lead Source: Web');
    });

    it('includes Status in info', () => {
      expect(transformLeadToNiche(makeLead()).info).toContain('Status: Open');
    });

    it('always includes Salesforce Lead ID', () => {
      expect(transformLeadToNiche(makeLead({ Id: 'sf-lead-42' })).info).toContain(
        'Salesforce Lead ID: sf-lead-42'
      );
    });

    it('omits optional fields when absent', () => {
      const result = transformLeadToNiche(
        makeLead({
          Email: undefined,
          Company: undefined,
          Title: undefined,
          LeadSource: undefined,
          Status: undefined,
          City: undefined,
          State: undefined,
        })
      );
      expect(result.info).not.toContain('Email:');
      expect(result.info).not.toContain('Company:');
      expect(result.info).not.toContain('Location:');
    });
  });

  describe('transformContactToNiche', () => {
    it('returns source SALESFORCE', () => {
      expect(transformContactToNiche(makeContact()).source).toBe('SALESFORCE');
    });

    it('combines first and last name', () => {
      expect(transformContactToNiche(makeContact()).name).toBe('Jane Doe');
    });

    it('normalizes phone', () => {
      expect(transformContactToNiche(makeContact({ Phone: '5559876543' })).phone).toBe(
        '+15559876543'
      );
    });

    it('falls back to MobilePhone when Phone absent', () => {
      expect(
        transformContactToNiche(makeContact({ Phone: undefined, MobilePhone: '5551112222' })).phone
      ).toBe('+15551112222');
    });

    it('includes email in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Email: jane@example.com');
    });

    it('includes company in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Company: Corp Inc');
    });

    it('includes location in info', () => {
      expect(transformContactToNiche(makeContact()).info).toContain('Location: Austin, TX');
    });

    it('always includes Salesforce Contact ID', () => {
      expect(transformContactToNiche(makeContact({ Id: 'sf-cont-7' })).info).toContain(
        'Salesforce Contact ID: sf-cont-7'
      );
    });
  });
});
