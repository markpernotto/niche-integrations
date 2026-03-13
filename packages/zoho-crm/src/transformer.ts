import type { CreateLeadRequest } from '@niche-integrations/core';
import type { ZohoLead, ZohoContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformLeadToNiche(lead: ZohoLead): CreateLeadRequest {
  const name = [lead.First_Name, lead.Last_Name].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(lead.Phone) ?? normalizePhone(lead.Mobile);

  const infoParts: string[] = [];
  if (lead.Email) infoParts.push(`Email: ${lead.Email}`);
  if (lead.Company) infoParts.push(`Company: ${lead.Company}`);
  if (lead.Title) infoParts.push(`Title: ${lead.Title}`);
  if (lead.Lead_Source) infoParts.push(`Lead Source: ${lead.Lead_Source}`);
  if (lead.Lead_Status) infoParts.push(`Status: ${lead.Lead_Status}`);
  const location = [lead.City, lead.State].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Zoho Lead ID: ${lead.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'ZOHO_CRM',
  };
}

export function transformContactToNiche(contact: ZohoContact): CreateLeadRequest {
  const name = [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(contact.Phone) ?? normalizePhone(contact.Mobile);

  const infoParts: string[] = [];
  if (contact.Email) infoParts.push(`Email: ${contact.Email}`);
  if (contact.Account_Name) infoParts.push(`Company: ${contact.Account_Name}`);
  if (contact.Title) infoParts.push(`Title: ${contact.Title}`);
  const location = [contact.Mailing_City, contact.Mailing_State].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Zoho Contact ID: ${contact.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'ZOHO_CRM',
  };
}
