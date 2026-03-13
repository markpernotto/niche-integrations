import type { CreateLeadRequest } from '@niche-integrations/core';
import type { CloseLead, CloseContact } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformLeadToNiche(lead: CloseLead): CreateLeadRequest {
  // Pull contact details from the first embedded contact
  const contact: CloseContact | undefined = lead.contacts?.[0];

  const name = contact?.name || lead.display_name || undefined;

  const phoneRaw = contact?.phones?.[0]?.phone;
  const phone = normalizePhone(phoneRaw);

  const infoParts: string[] = [];
  const email = contact?.emails?.[0]?.email;
  if (email) infoParts.push(`Email: ${email}`);
  infoParts.push(`Close Lead ID: ${lead.id}`);
  if (contact?.id) infoParts.push(`Close Contact ID: ${contact.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'CLOSE_CRM',
  };
}
