import axios from 'axios';
import type { HubSpotContact, HubSpotContactProperties } from './types';
import type { CreateLeadRequest } from '@niche-integrations/core';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const CONTACT_PROPERTIES = 'firstname,lastname,email,phone,mobilephone,company,jobtitle,city,state,message';

export async function fetchHubSpotContact(contactId: number, accessToken: string): Promise<HubSpotContact> {
  const res = await axios.get(
    `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${contactId}?properties=${CONTACT_PROPERTIES}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.data as HubSpotContact;
}

export function transformToNicheLead(contact: HubSpotContact): CreateLeadRequest {
  const p: HubSpotContactProperties = contact.properties;

  const name = [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || undefined;
  const phone = normalizePhone(p.phone || p.mobilephone);

  const infoParts: string[] = [];
  if (p.email) infoParts.push(`Email: ${p.email}`);
  if (p.company) infoParts.push(`Company: ${p.company}`);
  if (p.jobtitle) infoParts.push(`Title: ${p.jobtitle}`);
  if (p.city || p.state) infoParts.push(`Location: ${[p.city, p.state].filter(Boolean).join(', ')}`);
  if (p.message) infoParts.push(`Message: ${p.message}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'HUBSPOT',
  };
}

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}
