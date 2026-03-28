import { describe, it, expect } from 'vitest';
import {
  extractEmailFromInfo,
  splitName,
  nicheLeadToContactProps,
  nicheLeadToDealProps,
  nicheCallToEngagementProps,
} from './transformer';
import type { NicheLeadFull, NicheCall } from './types';

const baseLead: NicheLeadFull = {
  id: 'niche-lead-1',
  name: 'Jane Smith',
  phone: '+15555550100',
  info: 'Email: jane@example.com\nMessage: Roof repair needed',
  source: 'FACEBOOK',
};

describe('extractEmailFromInfo', () => {
  it('extracts email from standard format', () => {
    expect(extractEmailFromInfo('Email: jane@example.com')).toBe('jane@example.com');
  });

  it('is case-insensitive', () => {
    expect(extractEmailFromInfo('email: jane@example.com')).toBe('jane@example.com');
  });

  it('returns undefined when no email present', () => {
    expect(extractEmailFromInfo('No email here')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(extractEmailFromInfo(undefined)).toBeUndefined();
  });
});

describe('splitName', () => {
  it('splits first and last name', () => {
    expect(splitName('John Smith')).toEqual({ firstname: 'John', lastname: 'Smith' });
  });

  it('handles single name', () => {
    expect(splitName('Madonna')).toEqual({ firstname: 'Madonna' });
  });

  it('handles multi-word last name', () => {
    expect(splitName('Mary Jane Watson')).toEqual({ firstname: 'Mary', lastname: 'Jane Watson' });
  });

  it('returns empty object for undefined', () => {
    expect(splitName(undefined)).toEqual({});
  });
});

describe('nicheLeadToContactProps', () => {
  it('maps name, phone, email, and niche_lead_id', () => {
    const props = nicheLeadToContactProps(baseLead);
    expect(props.firstname).toBe('Jane');
    expect(props.lastname).toBe('Smith');
    expect(props.phone).toBe('+15555550100');
    expect(props.email).toBe('jane@example.com');
    expect(props.niche_lead_id).toBe('niche-lead-1');
  });

  it('omits email when not in info', () => {
    const props = nicheLeadToContactProps({ ...baseLead, info: 'No email here' });
    expect(props.email).toBeUndefined();
  });

  it('omits phone when not present', () => {
    const props = nicheLeadToContactProps({ ...baseLead, phone: undefined });
    expect(props.phone).toBeUndefined();
  });
});

describe('nicheLeadToDealProps', () => {
  it('builds deal name from lead name', () => {
    const props = nicheLeadToDealProps(baseLead);
    expect(props.dealname).toBe('Jane Smith — Niche Lead');
  });

  it('uses lead ID in deal name when no name', () => {
    const props = nicheLeadToDealProps({ ...baseLead, name: undefined });
    expect(props.dealname).toBe('Niche Lead niche-lead-1');
  });

  it('includes pipeline and stage when provided', () => {
    const props = nicheLeadToDealProps(baseLead, 'default', 'appointmentscheduled');
    expect(props.pipeline).toBe('default');
    expect(props.dealstage).toBe('appointmentscheduled');
  });

  it('omits pipeline and stage when not provided', () => {
    const props = nicheLeadToDealProps(baseLead);
    expect(props.pipeline).toBeUndefined();
    expect(props.dealstage).toBeUndefined();
  });

  it('does not include niche_lead_id (contact carries it)', () => {
    expect(nicheLeadToDealProps(baseLead)).not.toHaveProperty('niche_lead_id');
  });
});

describe('nicheCallToEngagementProps', () => {
  const baseCall: NicheCall = {
    id: 'call-1',
    type: 'INBOUND',
    status: 'COMPLETED',
    start: '2026-03-28T10:00:00.000Z',
    duration: 120,
    summary: 'Discussed roofing project',
    leadId: 'niche-lead-1',
  };

  it('sets call title, direction, and status', () => {
    const props = nicheCallToEngagementProps(baseCall);
    expect(props.hs_call_title).toBe('Niche INBOUND Call');
    expect(props.hs_call_direction).toBe('INBOUND');
    expect(props.hs_call_status).toBe('COMPLETED');
  });

  it('converts duration from seconds to milliseconds', () => {
    const props = nicheCallToEngagementProps(baseCall);
    expect(props.hs_call_duration).toBe('120000');
  });

  it('sets call body from summary', () => {
    const props = nicheCallToEngagementProps(baseCall);
    expect(props.hs_call_body).toBe('Discussed roofing project');
  });

  it('combines summary and transcript in body', () => {
    const props = nicheCallToEngagementProps({ ...baseCall, transcript: 'Full transcript here' });
    expect(props.hs_call_body).toContain('Discussed roofing project');
    expect(props.hs_call_body).toContain('Full transcript here');
  });

  it('defaults direction to INBOUND when type is missing', () => {
    const props = nicheCallToEngagementProps({ ...baseCall, type: undefined });
    expect(props.hs_call_direction).toBe('INBOUND');
    expect(props.hs_call_title).toBe('Niche INBOUND Call');
  });

  it('sets recording URL when present', () => {
    const props = nicheCallToEngagementProps({
      ...baseCall,
      recordingUrl: 'https://example.com/recording.mp3',
    });
    expect(props.hs_call_recording_url).toBe('https://example.com/recording.mp3');
  });

  it('omits duration when not present', () => {
    const props = nicheCallToEngagementProps({ ...baseCall, duration: undefined });
    expect(props.hs_call_duration).toBeUndefined();
  });

  it('uses start as hs_timestamp', () => {
    const props = nicheCallToEngagementProps(baseCall);
    expect(props.hs_timestamp).toBe('2026-03-28T10:00:00.000Z');
  });
});
