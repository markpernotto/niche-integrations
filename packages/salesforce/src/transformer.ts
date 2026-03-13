import type { CreateLeadRequest } from '@niche-integrations/core';
import type { SalesforceLead, SalesforceContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformLeadToNiche(lead: SalesforceLead): CreateLeadRequest {
  const name = [lead.FirstName, lead.LastName].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(lead.Phone) ?? normalizePhone(lead.MobilePhone);

  const infoParts: string[] = [];
  if (lead.Email) infoParts.push(`Email: ${lead.Email}`);
  if (lead.Company) infoParts.push(`Company: ${lead.Company}`);
  if (lead.Title) infoParts.push(`Title: ${lead.Title}`);
  if (lead.LeadSource) infoParts.push(`Lead Source: ${lead.LeadSource}`);
  if (lead.Status) infoParts.push(`Status: ${lead.Status}`);
  const location = [lead.City, lead.State].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Salesforce Lead ID: ${lead.Id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'SALESFORCE',
  };
}

export function transformContactToNiche(contact: SalesforceContact): CreateLeadRequest {
  const name = [contact.FirstName, contact.LastName].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(contact.Phone) ?? normalizePhone(contact.MobilePhone);

  const infoParts: string[] = [];
  if (contact.Email) infoParts.push(`Email: ${contact.Email}`);
  if (contact.AccountName) infoParts.push(`Company: ${contact.AccountName}`);
  if (contact.Title) infoParts.push(`Title: ${contact.Title}`);
  const location = [contact.MailingCity, contact.MailingState].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  infoParts.push(`Salesforce Contact ID: ${contact.Id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'SALESFORCE',
  };
}
