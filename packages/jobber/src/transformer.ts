import type { CreateLeadRequest } from '@niche-integrations/core';
import type { JobberClient } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformToNicheLead(client: JobberClient): CreateLeadRequest {
  const name =
    [client.firstName, client.lastName].filter(Boolean).join(' ').trim() ||
    client.companyName ||
    undefined;

  const primaryPhone = client.phones.find((p) => p.primary) ?? client.phones[0];
  const phone = normalizePhone(primaryPhone?.number);

  const primaryEmail = client.emails.find((e) => e.primary) ?? client.emails[0];

  const infoParts: string[] = [];
  if (primaryEmail?.address) infoParts.push(`Email: ${primaryEmail.address}`);
  if (client.companyName && (client.firstName || client.lastName)) {
    infoParts.push(`Company: ${client.companyName}`);
  }
  const addr = client.billingAddress;
  if (addr) {
    const location = [addr.city, addr.province].filter(Boolean).join(', ');
    if (location) infoParts.push(`Location: ${location}`);
  }
  if (client.isLead) infoParts.push('Type: Lead');
  infoParts.push(`Jobber ID: ${client.id}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'JOBBER',
  };
}
