import { describe, it, expect } from 'vitest';
import { transformContactToNiche } from './transformer';
import type { ActiveCampaignContact } from './types';

function makeContact(overrides: Partial<ActiveCampaignContact> = {}): ActiveCampaignContact {
  return {
    id: '42',
    firstName: 'Alice',
    lastName: 'Smith',
    phone: '5551234567',
    email: 'alice@example.com',
    udate: '2026-01-01T00:00:00Z',
    cdate: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ActiveCampaign transformer', () => {
  it('returns source ACTIVECAMPAIGN', () => {
    expect(transformContactToNiche(makeContact()).source).toBe('ACTIVECAMPAIGN');
  });

  it('combines first and last name', () => {
    expect(transformContactToNiche(makeContact()).name).toBe('Alice Smith');
  });

  it('uses first name only when last name absent', () => {
    expect(transformContactToNiche(makeContact({ lastName: undefined })).name).toBe('Alice');
  });

  it('returns undefined name when both name fields absent', () => {
    expect(
      transformContactToNiche(makeContact({ firstName: undefined, lastName: undefined })).name
    ).toBeUndefined();
  });

  it('normalizes 10-digit phone', () => {
    expect(transformContactToNiche(makeContact()).phone).toBe('+15551234567');
  });

  it('normalizes 11-digit phone starting with 1', () => {
    expect(transformContactToNiche(makeContact({ phone: '15551234567' })).phone).toBe(
      '+15551234567'
    );
  });

  it('passes through international phone as-is', () => {
    expect(transformContactToNiche(makeContact({ phone: '+447911123456' })).phone).toBe(
      '+447911123456'
    );
  });

  it('returns undefined phone when phone absent', () => {
    expect(transformContactToNiche(makeContact({ phone: undefined })).phone).toBeUndefined();
  });

  it('includes email in info', () => {
    expect(transformContactToNiche(makeContact()).info).toContain('Email: alice@example.com');
  });

  it('includes ActiveCampaign Contact ID in info', () => {
    expect(transformContactToNiche(makeContact({ id: '99' })).info).toContain(
      'ActiveCampaign Contact ID: 99'
    );
  });

  it('omits email line when email absent', () => {
    const result = transformContactToNiche(makeContact({ email: undefined }));
    expect(result.info).not.toContain('Email:');
  });
});
