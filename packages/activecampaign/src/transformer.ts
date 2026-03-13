import type { CreateLeadRequest } from '@niche-integrations/core';
import type { ActiveCampaignContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformContactToNiche(contact: ActiveCampaignContact): CreateLeadRequest {
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(contact.phone);

  const infoParts: string[] = [];
  if (contact.email) infoParts.push(`Email: ${contact.email}`);
  infoParts.push(`ActiveCampaign Contact ID: ${contact.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'ACTIVECAMPAIGN',
  };
}
