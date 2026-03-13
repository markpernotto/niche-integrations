import { describe, it, expect } from 'vitest';
import { transformToNicheLead, transformDealToNicheLead } from './transformer';
import type { HubSpotContact, HubSpotDeal } from './types';

function makeContact(overrides: Partial<HubSpotContact['properties']> = {}): HubSpotContact {
  return {
    id: 'hs-contact-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    properties: {
      firstname: 'Sam',
      lastname: 'Taylor',
      email: 'sam@example.com',
      phone: '5551234567',
      mobilephone: undefined,
      company: 'TechCorp',
      jobtitle: 'Engineer',
      city: 'Boston',
      state: 'MA',
      message: undefined,
      ...overrides,
    },
  };
}

function makeDeal(overrides: Partial<HubSpotDeal['properties']> = {}): HubSpotDeal {
  return {
    id: 'hs-deal-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    properties: {
      dealname: 'Big Deal',
      amount: '5000',
      dealstage: 'appointmentscheduled',
      hs_deal_stage_label: 'Appointment Scheduled',
      pipeline: 'default',
      closedate: '2026-06-01',
      ...overrides,
    },
  };
}

describe('HubSpot transformer', () => {
  describe('transformToNicheLead (contact)', () => {
    it('returns source HUBSPOT', () => {
      expect(transformToNicheLead(makeContact()).source).toBe('HUBSPOT');
    });

    it('combines first and last name', () => {
      expect(transformToNicheLead(makeContact()).name).toBe('Sam Taylor');
    });

    it('returns undefined name when both absent', () => {
      expect(
        transformToNicheLead(makeContact({ firstname: undefined, lastname: undefined })).name
      ).toBeUndefined();
    });

    it('normalizes 10-digit phone', () => {
      expect(transformToNicheLead(makeContact({ phone: '5551234567' })).phone).toBe('+15551234567');
    });

    it('falls back to mobilephone when phone absent', () => {
      expect(
        transformToNicheLead(makeContact({ phone: undefined, mobilephone: '5559876543' })).phone
      ).toBe('+15559876543');
    });

    it('returns undefined phone when both absent', () => {
      expect(
        transformToNicheLead(makeContact({ phone: undefined, mobilephone: undefined })).phone
      ).toBeUndefined();
    });

    it('includes email in info', () => {
      expect(transformToNicheLead(makeContact()).info).toContain('Email: sam@example.com');
    });

    it('includes company in info', () => {
      expect(transformToNicheLead(makeContact()).info).toContain('Company: TechCorp');
    });

    it('includes job title in info', () => {
      expect(transformToNicheLead(makeContact()).info).toContain('Title: Engineer');
    });

    it('includes location in info', () => {
      expect(transformToNicheLead(makeContact()).info).toContain('Location: Boston, MA');
    });

    it('includes message in info when present', () => {
      expect(
        transformToNicheLead(makeContact({ message: 'Hello there' })).info
      ).toContain('Message: Hello there');
    });

    it('always includes HubSpot Contact ID', () => {
      const contact = makeContact();
      contact.id = 'hs-c-77';
      expect(transformToNicheLead(contact).info).toContain('HubSpot Contact ID: hs-c-77');
    });
  });

  describe('transformDealToNicheLead', () => {
    it('returns source HUBSPOT', () => {
      expect(transformDealToNicheLead(makeDeal(), null).source).toBe('HUBSPOT');
    });

    it('uses contact name when contact available', () => {
      expect(transformDealToNicheLead(makeDeal(), makeContact()).name).toBe('Sam Taylor');
    });

    it('falls back to deal name when no contact', () => {
      expect(transformDealToNicheLead(makeDeal(), null).name).toBe('Big Deal');
    });

    it('uses contact phone', () => {
      expect(transformDealToNicheLead(makeDeal(), makeContact()).phone).toBe('+15551234567');
    });

    it('returns undefined phone when no contact', () => {
      expect(transformDealToNicheLead(makeDeal(), null).phone).toBeUndefined();
    });

    it('includes deal name in info', () => {
      expect(transformDealToNicheLead(makeDeal(), null).info).toContain('Deal: Big Deal');
    });

    it('includes stage label in info', () => {
      expect(transformDealToNicheLead(makeDeal(), null).info).toContain(
        'Stage: Appointment Scheduled'
      );
    });

    it('falls back to dealstage when label absent', () => {
      const result = transformDealToNicheLead(
        makeDeal({ hs_deal_stage_label: undefined }),
        null
      );
      expect(result.info).toContain('Stage: appointmentscheduled');
    });

    it('includes amount in info', () => {
      expect(transformDealToNicheLead(makeDeal(), null).info).toContain('Amount: $5000');
    });

    it('includes pipeline in info', () => {
      expect(transformDealToNicheLead(makeDeal(), null).info).toContain('Pipeline: default');
    });

    it('includes close date in info', () => {
      expect(transformDealToNicheLead(makeDeal(), null).info).toContain('Close Date: 2026-06-01');
    });

    it('always includes HubSpot Deal ID', () => {
      const deal = makeDeal();
      deal.id = 'hs-d-55';
      expect(transformDealToNicheLead(deal, null).info).toContain('HubSpot Deal ID: hs-d-55');
    });

    it('includes contact email in info when contact available', () => {
      expect(transformDealToNicheLead(makeDeal(), makeContact()).info).toContain(
        'Email: sam@example.com'
      );
    });
  });
});
