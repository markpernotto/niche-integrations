import { describe, it, expect } from 'vitest';
import { transformContactToNiche } from './transformer';
import type { KeapContact } from './types';

function makeContact(overrides: Partial<KeapContact> = {}): KeapContact {
  return {
    id: 55,
    given_name: 'Jane',
    family_name: 'Doe',
    email_addresses: [{ email: 'jane@example.com', field: 'EMAIL1' }],
    phone_numbers: [{ number: '5551234567', type: 'WORK' }],
    company: { company_name: 'Acme Inc' },
    last_updated: '2026-01-01T00:00:00Z',
    date_created: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Keap transformer', () => {
  it('returns source KEAP', () => {
    expect(transformContactToNiche(makeContact()).source).toBe('KEAP');
  });

  it('combines given and family name', () => {
    expect(transformContactToNiche(makeContact()).name).toBe('Jane Doe');
  });

  it('uses given name only when family name absent', () => {
    expect(transformContactToNiche(makeContact({ family_name: undefined })).name).toBe('Jane');
  });

  it('returns undefined name when both name fields absent', () => {
    expect(
      transformContactToNiche(makeContact({ given_name: undefined, family_name: undefined })).name
    ).toBeUndefined();
  });

  it('normalizes 10-digit phone', () => {
    expect(transformContactToNiche(makeContact()).phone).toBe('+15551234567');
  });

  it('normalizes 11-digit phone starting with 1', () => {
    expect(
      transformContactToNiche(makeContact({ phone_numbers: [{ number: '15559876543' }] })).phone
    ).toBe('+15559876543');
  });

  it('returns undefined phone when phone_numbers empty', () => {
    expect(transformContactToNiche(makeContact({ phone_numbers: [] })).phone).toBeUndefined();
  });

  it('includes email in info', () => {
    expect(transformContactToNiche(makeContact()).info).toContain('Email: jane@example.com');
  });

  it('includes company in info', () => {
    expect(transformContactToNiche(makeContact()).info).toContain('Company: Acme Inc');
  });

  it('includes Keap Contact ID in info', () => {
    expect(transformContactToNiche(makeContact({ id: 999 })).info).toContain(
      'Keap Contact ID: 999'
    );
  });

  it('omits email line when email_addresses empty', () => {
    expect(
      transformContactToNiche(makeContact({ email_addresses: [] })).info
    ).not.toContain('Email:');
  });

  it('omits company line when absent', () => {
    expect(
      transformContactToNiche(makeContact({ company: undefined })).info
    ).not.toContain('Company:');
  });
});
