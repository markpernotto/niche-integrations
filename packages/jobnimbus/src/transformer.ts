import type { CreateLeadRequest } from '@niche-integrations/core';
import type { JobNimbusContact, JobNimbusPhone, JobNimbusEmail } from './types';

/**
 * Extract the first phone number from a JobNimbus contact.
 * JobNimbus phone can be a plain string or an array of {value, type} objects.
 */
function extractPhone(raw?: string | JobNimbusPhone[]): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return normalizePhone(raw);
  const first = raw.find((p) => p.value)?.value;
  return normalizePhone(first);
}

/**
 * Extract the first email from a JobNimbus contact.
 * JobNimbus email can be a plain string or an array of {value, type} objects.
 */
function extractEmail(raw?: string | JobNimbusEmail[]): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  return raw.find((e) => e.value)?.value;
}

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformToNicheLead(contact: JobNimbusContact): CreateLeadRequest {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || undefined;
  const phone = extractPhone(contact.phone);
  const email = extractEmail(contact.email);

  const infoParts: string[] = [];
  if (email) infoParts.push(`Email: ${email}`);
  if (contact.company) infoParts.push(`Company: ${contact.company}`);
  const location = [contact.city, contact.state_code].filter(Boolean).join(', ');
  if (location) infoParts.push(`Location: ${location}`);
  if (contact.status_name) infoParts.push(`Status: ${contact.status_name}`);
  if (contact.jnid) infoParts.push(`JobNimbus ID: ${contact.jnid}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'JOBNIMBUS',
  };
}
