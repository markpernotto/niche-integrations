import axios from 'axios';
import type { HubSpotContact, HubSpotContactProperties, HubSpotDeal } from './types';
import type { CreateLeadRequest } from '@niche-integrations/core';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const CONTACT_PROPERTIES = 'firstname,lastname,email,phone,mobilephone,company,jobtitle,city,state,message';
const DEAL_PROPERTIES = 'dealname,amount,dealstage,pipeline,closedate,hs_deal_stage_label';

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

// ---------------------------------------------------------------------------
// Single contact fetch (used by webhook path)
// ---------------------------------------------------------------------------
export async function fetchHubSpotContact(contactId: number | string, accessToken: string): Promise<HubSpotContact> {
  const res = await axios.get(
    `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${contactId}?properties=${CONTACT_PROPERTIES}`,
    { headers: authHeaders(accessToken) }
  );
  return res.data as HubSpotContact;
}

// ---------------------------------------------------------------------------
// Paginated contact search (used by polling path)
// ---------------------------------------------------------------------------
export async function fetchContactsUpdatedSince(since: Date, accessToken: string): Promise<HubSpotContact[]> {
  const all: HubSpotContact[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{
          propertyName: 'lastmodifieddate',
          operator: 'GT',
          value: since.getTime().toString(),
        }],
      }],
      properties: CONTACT_PROPERTIES.split(','),
      limit: 100,
    };
    if (after) body.after = after;

    const res = await axios.post(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`,
      body,
      { headers: authHeaders(accessToken) }
    );

    all.push(...(res.data.results as HubSpotContact[]));
    after = res.data.paging?.next?.after;
  } while (after);

  return all;
}

// ---------------------------------------------------------------------------
// Paginated deal search (used by polling path)
// ---------------------------------------------------------------------------
export async function fetchDealsUpdatedSince(since: Date, accessToken: string): Promise<HubSpotDeal[]> {
  const all: HubSpotDeal[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{
          propertyName: 'hs_lastmodifieddate',
          operator: 'GT',
          value: since.getTime().toString(),
        }],
      }],
      properties: DEAL_PROPERTIES.split(','),
      limit: 100,
    };
    if (after) body.after = after;

    const res = await axios.post(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals/search`,
      body,
      { headers: authHeaders(accessToken) }
    );

    all.push(...(res.data.results as HubSpotDeal[]));
    after = res.data.paging?.next?.after;
  } while (after);

  return all;
}

// ---------------------------------------------------------------------------
// Fetch the first associated contact for a deal (for phone/email)
// ---------------------------------------------------------------------------
export async function fetchDealAssociatedContact(
  dealId: string,
  accessToken: string
): Promise<HubSpotContact | null> {
  try {
    const assocRes = await axios.get(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals/${dealId}/associations/contacts`,
      { headers: authHeaders(accessToken) }
    );
    const results: Array<{ id: string }> = assocRes.data.results ?? [];
    if (results.length === 0) return null;

    const contact = await fetchHubSpotContact(results[0].id, accessToken);
    return contact;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------
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
  infoParts.push(`HubSpot Contact ID: ${contact.id}`);

  return {
    name: name || undefined,
    phone: phone || undefined,
    info: infoParts.length > 0 ? infoParts.join('\n') : undefined,
    source: 'HUBSPOT',
  };
}

export function transformDealToNicheLead(
  deal: HubSpotDeal,
  contact: HubSpotContact | null
): CreateLeadRequest {
  const dp = deal.properties;
  const cp = contact?.properties;

  const name =
    (cp && [cp.firstname, cp.lastname].filter(Boolean).join(' ').trim()) ||
    dp.dealname ||
    undefined;

  const phone = normalizePhone(cp?.phone || cp?.mobilephone);

  const infoParts: string[] = [];
  if (cp?.email) infoParts.push(`Email: ${cp.email}`);
  if (dp.dealname) infoParts.push(`Deal: ${dp.dealname}`);
  if (dp.hs_deal_stage_label || dp.dealstage) infoParts.push(`Stage: ${dp.hs_deal_stage_label || dp.dealstage}`);
  if (dp.amount) infoParts.push(`Amount: $${dp.amount}`);
  if (dp.pipeline) infoParts.push(`Pipeline: ${dp.pipeline}`);
  if (dp.closedate) infoParts.push(`Close Date: ${dp.closedate}`);
  infoParts.push(`HubSpot Deal ID: ${deal.id}`);

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
