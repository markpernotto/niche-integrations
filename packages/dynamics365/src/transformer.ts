/**
 * Transforms Dynamics 365 Lead and Contact records into Niche lead payloads.
 */

import type { NicheLead } from '@niche-integrations/core';
import type { DynamicsLead, DynamicsContact } from './types';

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw; // international or unrecognized — pass through
}

function buildName(fullname?: string, firstname?: string, lastname?: string): string {
  if (fullname?.trim()) return fullname.trim();
  const parts = [firstname, lastname].filter(Boolean);
  return parts.join(' ').trim() || 'Unknown';
}

export function transformLeadToNiche(lead: DynamicsLead): NicheLead {
  const phone = normalizePhone(lead.mobilephone || lead.telephone1);
  const name = buildName(lead.fullname, lead.firstname, lead.lastname);

  const infoParts: string[] = [];
  if (lead.emailaddress1) infoParts.push(`Email: ${lead.emailaddress1}`);
  infoParts.push(`Dynamics Lead ID: ${lead.leadid}`);

  return {
    name,
    ...(phone ? { phone } : {}),
    info: infoParts.join(' | '),
    source: 'DYNAMICS_365',
  };
}

export function transformContactToNiche(contact: DynamicsContact): NicheLead {
  const phone = normalizePhone(contact.mobilephone || contact.telephone1);
  const name = buildName(contact.fullname, contact.firstname, contact.lastname);

  const infoParts: string[] = [];
  if (contact.emailaddress1) infoParts.push(`Email: ${contact.emailaddress1}`);
  infoParts.push(`Dynamics Contact ID: ${contact.contactid}`);

  return {
    name,
    ...(phone ? { phone } : {}),
    info: infoParts.join(' | '),
    source: 'DYNAMICS_365',
  };
}
