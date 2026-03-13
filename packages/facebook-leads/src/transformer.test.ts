import { describe, it, expect } from 'vitest';
import { transformToNicheLead } from './transformer';
import type { FacebookLeadData } from './types';

function makeLeadData(fields: Array<{ name: string; values: string[] }>, overrides: Partial<FacebookLeadData> = {}): FacebookLeadData {
  return {
    id: 'fb-lead-1',
    created_time: '2026-01-01T00:00:00+0000',
    field_data: fields,
    ...overrides,
  };
}

describe('Facebook transformer', () => {
  it('returns source FACEBOOK', () => {
    const result = transformToNicheLead(makeLeadData([]));
    expect(result.source).toBe('FACEBOOK');
  });

  describe('name extraction', () => {
    it('builds name from first_name and last_name fields', () => {
      const result = transformToNicheLead(
        makeLeadData([
          { name: 'first_name', values: ['Eva'] },
          { name: 'last_name', values: ['Green'] },
        ])
      );
      expect(result.name).toBe('Eva Green');
    });

    it('builds name from firstname and lastname variants', () => {
      const result = transformToNicheLead(
        makeLeadData([
          { name: 'firstname', values: ['Tom'] },
          { name: 'lastname', values: ['Jones'] },
        ])
      );
      expect(result.name).toBe('Tom Jones');
    });

    it('falls back to full_name field', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'full_name', values: ['Maria Garcia'] }])
      );
      expect(result.name).toBe('Maria Garcia');
    });

    it('falls back to name field', () => {
      const result = transformToNicheLead(makeLeadData([{ name: 'name', values: ['Pat Lee'] }]));
      expect(result.name).toBe('Pat Lee');
    });

    it('returns undefined when no name fields present', () => {
      const result = transformToNicheLead(makeLeadData([{ name: 'email', values: ['x@x.com'] }]));
      expect(result.name).toBeUndefined();
    });
  });

  describe('phone extraction', () => {
    it('extracts phone_number field', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'phone_number', values: ['5551234567'] }])
      );
      expect(result.phone).toBe('5551234567');
    });

    it('extracts phone field', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'phone', values: ['5559876543'] }])
      );
      expect(result.phone).toBe('5559876543');
    });

    it('returns undefined when no phone fields', () => {
      const result = transformToNicheLead(makeLeadData([{ name: 'email', values: ['x@x.com'] }]));
      expect(result.phone).toBeUndefined();
    });
  });

  describe('info block', () => {
    it('includes email in info', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'email', values: ['user@example.com'] }])
      );
      expect(result.info).toContain('Email: user@example.com');
    });

    it('capitalizes field labels', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'zip_code', values: ['90210'] }])
      );
      expect(result.info).toContain('Zip Code: 90210');
    });

    it('excludes name and phone fields from info', () => {
      const result = transformToNicheLead(
        makeLeadData([
          { name: 'first_name', values: ['Eva'] },
          { name: 'last_name', values: ['Green'] },
          { name: 'phone_number', values: ['5551234567'] },
          { name: 'email', values: ['eva@example.com'] },
        ])
      );
      expect(result.info).not.toContain('First Name:');
      expect(result.info).not.toContain('Last Name:');
      expect(result.info).not.toContain('Phone Number:');
    });

    it('always includes Facebook Lead ID', () => {
      const result = transformToNicheLead(makeLeadData([], { id: 'fb-99' }));
      expect(result.info).toContain('Facebook Lead ID: fb-99');
    });

    it('includes created_time in info', () => {
      const result = transformToNicheLead(makeLeadData([], { created_time: '2026-01-15T12:00:00+0000' }));
      expect(result.info).toContain('Created: 2026-01-15T12:00:00+0000');
    });

    it('skips fields with empty values', () => {
      const result = transformToNicheLead(
        makeLeadData([{ name: 'custom_field', values: [] }])
      );
      expect(result.info).not.toContain('Custom Field:');
    });
  });
});
