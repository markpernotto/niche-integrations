import { describe, it, expect } from 'vitest';
import { transformPersonToNiche } from './transformer';
import type { PipedrivePerson } from './types';

function makePerson(overrides: Partial<PipedrivePerson> = {}): PipedrivePerson {
  return {
    id: 77,
    name: 'Tom Ford',
    phone: [{ value: '5551234567', primary: true }],
    email: [{ value: 'tom@example.com', primary: true }],
    org_name: 'Ford LLC',
    update_time: '2026-01-01T00:00:00Z',
    add_time: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Pipedrive transformer', () => {
  it('returns source PIPEDRIVE', () => {
    expect(transformPersonToNiche(makePerson()).source).toBe('PIPEDRIVE');
  });

  it('uses person name', () => {
    expect(transformPersonToNiche(makePerson()).name).toBe('Tom Ford');
  });

  it('returns undefined name when name absent', () => {
    expect(transformPersonToNiche(makePerson({ name: undefined })).name).toBeUndefined();
  });

  it('normalizes 10-digit primary phone', () => {
    expect(transformPersonToNiche(makePerson()).phone).toBe('+15551234567');
  });

  it('normalizes 11-digit phone starting with 1', () => {
    expect(
      transformPersonToNiche(makePerson({ phone: [{ value: '15559876543', primary: true }] }))
        .phone
    ).toBe('+15559876543');
  });

  it('falls back to first phone when no primary', () => {
    expect(
      transformPersonToNiche(
        makePerson({ phone: [{ value: '5557654321', primary: false }] })
      ).phone
    ).toBe('+15557654321');
  });

  it('returns undefined phone when phone array is empty', () => {
    expect(transformPersonToNiche(makePerson({ phone: [] })).phone).toBeUndefined();
  });

  it('includes primary email in info', () => {
    expect(transformPersonToNiche(makePerson()).info).toContain('Email: tom@example.com');
  });

  it('includes company in info', () => {
    expect(transformPersonToNiche(makePerson()).info).toContain('Company: Ford LLC');
  });

  it('includes Pipedrive Person ID in info', () => {
    expect(transformPersonToNiche(makePerson({ id: 123 })).info).toContain(
      'Pipedrive Person ID: 123'
    );
  });

  it('omits email when email array is empty', () => {
    expect(transformPersonToNiche(makePerson({ email: [] })).info).not.toContain('Email:');
  });

  it('omits company when org_name absent', () => {
    expect(transformPersonToNiche(makePerson({ org_name: undefined })).info).not.toContain(
      'Company:'
    );
  });
});
