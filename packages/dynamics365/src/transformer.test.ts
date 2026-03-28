/**
 * Unit tests for Dynamics 365 → Niche lead transformer.
 */

import { describe, it, expect } from 'vitest';
import { transformLeadToNiche, transformContactToNiche } from './transformer';
import type { DynamicsLead, DynamicsContact } from './types';

const baseLead: DynamicsLead = {
  leadid: 'lead-001',
  fullname: 'Jane Smith',
  telephone1: '5551234567',
  emailaddress1: 'jane@example.com',
  modifiedon: '2026-03-28T12:00:00Z',
};

const baseContact: DynamicsContact = {
  contactid: 'contact-001',
  fullname: 'Bob Jones',
  telephone1: '5559876543',
  emailaddress1: 'bob@example.com',
  modifiedon: '2026-03-28T12:00:00Z',
};

describe('transformLeadToNiche', () => {
  it('maps fullname, phone, email, and source', () => {
    const result = transformLeadToNiche(baseLead);
    expect(result.name).toBe('Jane Smith');
    expect(result.phone).toBe('+15551234567');
    expect(result.info).toContain('Email: jane@example.com');
    expect(result.source).toBe('DYNAMICS_365');
  });

  it('includes Dynamics Lead ID in info', () => {
    const result = transformLeadToNiche(baseLead);
    expect(result.info).toContain('Dynamics Lead ID: lead-001');
  });

  it('prefers mobilephone over telephone1', () => {
    const lead = { ...baseLead, mobilephone: '5550000001', telephone1: '5550000002' };
    const result = transformLeadToNiche(lead);
    expect(result.phone).toBe('+15550000001');
  });

  it('falls back to telephone1 when mobilephone absent', () => {
    const lead = { ...baseLead, mobilephone: undefined };
    const result = transformLeadToNiche(lead);
    expect(result.phone).toBe('+15551234567');
  });

  it('builds name from firstname + lastname when fullname absent', () => {
    const lead = { ...baseLead, fullname: undefined, firstname: 'Jane', lastname: 'Smith' };
    const result = transformLeadToNiche(lead);
    expect(result.name).toBe('Jane Smith');
  });

  it('falls back to "Unknown" when no name fields', () => {
    const lead = { ...baseLead, fullname: undefined, firstname: undefined, lastname: undefined };
    const result = transformLeadToNiche(lead);
    expect(result.name).toBe('Unknown');
  });

  it('normalizes 10-digit phone to E.164', () => {
    const result = transformLeadToNiche({ ...baseLead, telephone1: '5551234567' });
    expect(result.phone).toBe('+15551234567');
  });

  it('normalizes 11-digit phone starting with 1', () => {
    const result = transformLeadToNiche({ ...baseLead, telephone1: '15551234567' });
    expect(result.phone).toBe('+15551234567');
  });

  it('passes through international phone as-is', () => {
    const result = transformLeadToNiche({ ...baseLead, telephone1: '+447911123456' });
    expect(result.phone).toBe('+447911123456');
  });

  it('omits phone field when no phone present', () => {
    const lead = { ...baseLead, telephone1: undefined, mobilephone: undefined };
    const result = transformLeadToNiche(lead);
    expect(result.phone).toBeUndefined();
  });

  it('omits email from info when not present', () => {
    const lead = { ...baseLead, emailaddress1: undefined };
    const result = transformLeadToNiche(lead);
    expect(result.info).not.toContain('Email:');
  });
});

describe('transformContactToNiche', () => {
  it('maps fullname, phone, email, and source', () => {
    const result = transformContactToNiche(baseContact);
    expect(result.name).toBe('Bob Jones');
    expect(result.phone).toBe('+15559876543');
    expect(result.info).toContain('Email: bob@example.com');
    expect(result.source).toBe('DYNAMICS_365');
  });

  it('includes Dynamics Contact ID in info', () => {
    const result = transformContactToNiche(baseContact);
    expect(result.info).toContain('Dynamics Contact ID: contact-001');
  });

  it('prefers mobilephone over telephone1', () => {
    const contact = { ...baseContact, mobilephone: '5550000001', telephone1: '5550000002' };
    const result = transformContactToNiche(contact);
    expect(result.phone).toBe('+15550000001');
  });

  it('builds name from firstname + lastname when fullname absent', () => {
    const contact = { ...baseContact, fullname: undefined, firstname: 'Bob', lastname: 'Jones' };
    const result = transformContactToNiche(contact);
    expect(result.name).toBe('Bob Jones');
  });
});
