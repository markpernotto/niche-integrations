import type { CreateLeadRequest } from '@niche-integrations/core';
import type { AccuLynxJob } from './types';

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export function transformToNicheLead(job: AccuLynxJob): CreateLeadRequest {
  const contact = job.contact ?? {};

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
    || job.name
    || undefined;

  const phone = normalizePhone(contact.phone);

  const infoParts: string[] = [];
  if (contact.email) infoParts.push(`Email: ${contact.email}`);
  if (contact.city || contact.state) {
    infoParts.push(`Location: ${[contact.city, contact.state].filter(Boolean).join(', ')}`);
  }
  if (job.tradeType) infoParts.push(`Trade: ${job.tradeType}`);
  if (job.milestone) infoParts.push(`Milestone: ${job.milestone}`);
  if (job.status) infoParts.push(`Status: ${job.status}`);
  if (job.repName) infoParts.push(`Rep: ${job.repName}`);
  if (job.id) infoParts.push(`AccuLynx Job ID: ${job.id}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'ACCULYNX',
  };
}
