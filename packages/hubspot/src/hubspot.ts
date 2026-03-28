/**
 * HubSpot CRM API client.
 * All writes use the Private App access token (Bearer auth).
 * Retries with exponential backoff on 5xx / 429.
 */

import axios from 'axios';
import type {
  HubSpotContactProps,
  HubSpotDealProps,
  HubSpotCallProps,
  HubSpotObject,
} from './types';

const HS_BASE = 'https://api.hubapi.com';

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const retryable =
        axios.isAxiosError(err) &&
        (!err.response || err.response.status >= 500 || err.response.status === 429);
      if (!retryable) throw err;
      const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchContactByPhone(
  phone: string,
  token: string
): Promise<HubSpotObject | null> {
  const res = await withRetry(() =>
    axios.post(
      `${HS_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [
          { filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] },
        ],
        properties: ['firstname', 'lastname', 'phone', 'email', 'niche_lead_id'],
        limit: 1,
      },
      { headers: headers(token) }
    )
  );
  return (res.data.results as HubSpotObject[])?.[0] ?? null;
}

export async function searchContactByEmail(
  email: string,
  token: string
): Promise<HubSpotObject | null> {
  const res = await withRetry(() =>
    axios.post(
      `${HS_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [
          { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] },
        ],
        properties: ['firstname', 'lastname', 'phone', 'email', 'niche_lead_id'],
        limit: 1,
      },
      { headers: headers(token) }
    )
  );
  return (res.data.results as HubSpotObject[])?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createContact(
  props: HubSpotContactProps,
  token: string
): Promise<HubSpotObject> {
  const res = await withRetry(() =>
    axios.post(
      `${HS_BASE}/crm/v3/objects/contacts`,
      { properties: props },
      { headers: headers(token) }
    )
  );
  return res.data as HubSpotObject;
}

export async function updateContact(
  contactId: string,
  props: Partial<HubSpotContactProps>,
  token: string
): Promise<void> {
  await withRetry(() =>
    axios.patch(
      `${HS_BASE}/crm/v3/objects/contacts/${contactId}`,
      { properties: props },
      { headers: headers(token) }
    )
  );
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export async function createDeal(
  props: HubSpotDealProps,
  token: string
): Promise<HubSpotObject> {
  const res = await withRetry(() =>
    axios.post(
      `${HS_BASE}/crm/v3/objects/deals`,
      { properties: props },
      { headers: headers(token) }
    )
  );
  return res.data as HubSpotObject;
}

export async function associateContactWithDeal(
  contactId: string,
  dealId: string,
  token: string
): Promise<void> {
  await withRetry(() =>
    axios.put(
      `${HS_BASE}/crm/v4/objects/contacts/${contactId}/associations/default/deals/${dealId}`,
      [],
      { headers: headers(token) }
    )
  );
}

export async function closeDeal(
  dealId: string,
  closedStageId: string,
  token: string
): Promise<void> {
  await withRetry(() =>
    axios.patch(
      `${HS_BASE}/crm/v3/objects/deals/${dealId}`,
      { properties: { dealstage: closedStageId } },
      { headers: headers(token) }
    )
  );
}

// ---------------------------------------------------------------------------
// Call engagements
// ---------------------------------------------------------------------------

export async function createCallEngagement(
  props: HubSpotCallProps,
  contactId: string | undefined,
  token: string
): Promise<HubSpotObject> {
  const res = await withRetry(() =>
    axios.post(
      `${HS_BASE}/crm/v3/objects/calls`,
      { properties: props },
      { headers: headers(token) }
    )
  );
  const callObj = res.data as HubSpotObject;

  if (contactId) {
    await withRetry(() =>
      axios.put(
        `${HS_BASE}/crm/v4/objects/calls/${callObj.id}/associations/default/contacts/${contactId}`,
        [],
        { headers: headers(token) }
      )
    ).catch((err: unknown) => {
      const msg = axios.isAxiosError(err) ? err.message : String(err);
      console.warn(`[HubSpot] Failed to associate call ${callObj.id} with contact ${contactId}:`, msg);
    });
  }

  return callObj;
}

// ---------------------------------------------------------------------------
// Custom property setup
// ---------------------------------------------------------------------------

/**
 * Ensure the niche_lead_id custom contact property exists in HubSpot.
 * Creates it if missing — safe to call on every startup.
 */
export async function ensureNicheLeadIdProperty(token: string): Promise<void> {
  try {
    await axios.get(`${HS_BASE}/crm/v3/properties/contacts/niche_lead_id`, {
      headers: headers(token),
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      await axios
        .post(
          `${HS_BASE}/crm/v3/properties/contacts`,
          {
            name: 'niche_lead_id',
            label: 'Niche Lead ID',
            type: 'string',
            fieldType: 'text',
            groupName: 'contactinformation',
          },
          { headers: headers(token) }
        )
        .catch((createErr: unknown) => {
          const msg = axios.isAxiosError(createErr) ? createErr.message : String(createErr);
          console.warn('[HubSpot] Could not create niche_lead_id property:', msg);
        });
      console.log('[HubSpot] Created custom contact property: niche_lead_id');
    }
    // Non-404 errors are ignored — property likely already exists
  }
}
