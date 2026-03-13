import { describe, it, expect } from 'vitest';
import { transformLeadToNiche } from './transformer';
import type { CloseLead } from './types';

function makeLead(overrides: Partial<CloseLead> = {}): CloseLead {
  return {
    id: 'lead_abc123',
    display_name: 'Test Company',
    contacts: [
      {
        id: 'cont_xyz',
        name: 'Bob Jones',
        phones: [{ phone: '5551234567' }],
        emails: [{ email: 'bob@example.com' }],
      },
    ],
    date_updated: '2026-01-01T00:00:00Z',
    date_created: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Close CRM transformer', () => {
  it('returns source CLOSE_CRM', () => {
    expect(transformLeadToNiche(makeLead()).source).toBe('CLOSE_CRM');
  });

  it('uses contact name', () => {
    expect(transformLeadToNiche(makeLead()).name).toBe('Bob Jones');
  });

  it('falls back to lead display_name when no contact', () => {
    expect(transformLeadToNiche(makeLead({ contacts: [] })).name).toBe('Test Company');
  });

  it('returns undefined name when no contact and no display_name', () => {
    expect(
      transformLeadToNiche(makeLead({ contacts: [], display_name: undefined })).name
    ).toBeUndefined();
  });

  it('normalizes 10-digit phone from contact', () => {
    expect(transformLeadToNiche(makeLead()).phone).toBe('+15551234567');
  });

  it('normalizes 11-digit phone', () => {
    const lead = makeLead({
      contacts: [{ id: 'c', name: 'X', phones: [{ phone: '15559876543' }], emails: [] }],
    });
    expect(transformLeadToNiche(lead).phone).toBe('+15559876543');
  });

  it('returns undefined phone when contact has no phones', () => {
    const lead = makeLead({
      contacts: [{ id: 'c', name: 'X', phones: [], emails: [] }],
    });
    expect(transformLeadToNiche(lead).phone).toBeUndefined();
  });

  it('includes email from contact in info', () => {
    expect(transformLeadToNiche(makeLead()).info).toContain('Email: bob@example.com');
  });

  it('includes Close Lead ID in info', () => {
    expect(transformLeadToNiche(makeLead()).info).toContain('Close Lead ID: lead_abc123');
  });

  it('includes Close Contact ID in info', () => {
    expect(transformLeadToNiche(makeLead()).info).toContain('Close Contact ID: cont_xyz');
  });

  it('omits email line when contact has no emails', () => {
    const lead = makeLead({
      contacts: [{ id: 'c', name: 'X', phones: [{ phone: '5551234567' }], emails: [] }],
    });
    expect(transformLeadToNiche(lead).info).not.toContain('Email:');
  });
});
