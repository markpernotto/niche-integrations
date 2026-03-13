import type { CreateLeadRequest } from '@niche-integrations/core';
import type { KeapContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformContactToNiche(contact: KeapContact): CreateLeadRequest {
  const name =
    [contact.given_name, contact.family_name].filter(Boolean).join(' ').trim() || undefined;

  const phoneRaw = contact.phone_numbers?.[0]?.number;
  const phone = normalizePhone(phoneRaw);

  const infoParts: string[] = [];
  const email = contact.email_addresses?.[0]?.email;
  if (email) infoParts.push(`Email: ${email}`);
  if (contact.company?.company_name) infoParts.push(`Company: ${contact.company.company_name}`);
  infoParts.push(`Keap Contact ID: ${contact.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'KEAP',
  };
}
