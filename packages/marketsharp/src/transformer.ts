import type { CreateLeadRequest } from '@niche-integrations/core';
import type { MarketSharpContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

function extractPhone(contact: MarketSharpContact): string | undefined {
  return normalizePhone(contact.phone) ?? normalizePhone(contact.phone2) ?? normalizePhone(contact.phone3);
}

export function transformToNicheLead(contact: MarketSharpContact): CreateLeadRequest {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || undefined;
  const phone = extractPhone(contact);

  const infoParts: string[] = [];
  if (contact.email) infoParts.push(`Email: ${contact.email}`);
  if (contact.address || contact.city || contact.state) {
    const location = [contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(', ');
    infoParts.push(`Address: ${location}`);
  }
  if (contact.leadSource) infoParts.push(`Lead Source: ${contact.leadSource}`);
  if (contact.status) infoParts.push(`Status: ${contact.status}`);
  if (contact.id) infoParts.push(`MarketSharp ID: ${contact.id}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'MARKETSHARP',
  };
}
