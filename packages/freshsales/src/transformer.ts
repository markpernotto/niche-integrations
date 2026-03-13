import type { CreateLeadRequest } from '@niche-integrations/core';
import type { FreshsalesContact, FreshsalesLead } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformContactToNiche(contact: FreshsalesContact): CreateLeadRequest {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
    contact.display_name ||
    undefined;
  const phone = normalizePhone(contact.mobile_number) ?? normalizePhone(contact.work_number);

  const infoParts: string[] = [];
  if (contact.email) infoParts.push(`Email: ${contact.email}`);
  if (contact.job_title) infoParts.push(`Title: ${contact.job_title}`);
  const location = [contact.city, contact.state].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Freshsales Contact ID: ${contact.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'FRESHSALES',
  };
}

export function transformLeadToNiche(lead: FreshsalesLead): CreateLeadRequest {
  const name =
    [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() ||
    lead.display_name ||
    undefined;
  const phone = normalizePhone(lead.mobile_number) ?? normalizePhone(lead.work_number);

  const infoParts: string[] = [];
  if (lead.email) infoParts.push(`Email: ${lead.email}`);
  if (lead.company?.name) infoParts.push(`Company: ${lead.company.name}`);
  if (lead.job_title) infoParts.push(`Title: ${lead.job_title}`);
  const location = [lead.city, lead.state].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Freshsales Lead ID: ${lead.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'FRESHSALES',
  };
}
