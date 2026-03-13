import type { CreateLeadRequest } from '@niche-integrations/core';
import type { PipedrivePerson } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

function pickPrimary(items: { value: string; primary: boolean }[]): string | undefined {
  if (!items?.length) return undefined;
  const primary = items.find((i) => i.primary);
  return (primary ?? items[0]).value || undefined;
}

export function transformPersonToNiche(person: PipedrivePerson): CreateLeadRequest {
  const name = person.name || undefined;
  const phone = normalizePhone(pickPrimary(person.phone));

  const infoParts: string[] = [];
  const email = pickPrimary(person.email);
  if (email) infoParts.push(`Email: ${email}`);
  if (person.org_name) infoParts.push(`Company: ${person.org_name}`);
  infoParts.push(`Pipedrive Person ID: ${person.id}`);

  return {
    name,
    phone,
    info: infoParts.join('\n'),
    source: 'PIPEDRIVE',
  };
}
