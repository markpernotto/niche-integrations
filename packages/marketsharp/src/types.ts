/**
 * MarketSharp API types.
 *
 * MarketSharp (Momentum API) is a pull-based integration — we poll their REST
 * API for new/updated contacts rather than receiving webhooks.
 *
 * Base URL: https://restapi.marketsharpm.com
 * Auth: Bearer <MS_API_KEY>
 */

export interface MarketSharpContact {
  id?: string;
  companyId?: string;
  firstName?: string;
  lastName?: string;
  /** Primary phone */
  phone?: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** ISO date string */
  createdDate?: string;
  /** ISO date string */
  lastUpdated?: string;
  leadSource?: string;
  status?: string;
  /** The form/campaign ID that captured this lead */
  formId?: string;
}

export interface MarketSharpContactsResponse {
  contacts: MarketSharpContact[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
}

/** Payload shape when MarketSharp POSTs a webhook (if configured) */
export interface MarketSharpWebhookPayload {
  event?: string; // e.g. "contact.created"
  contact?: MarketSharpContact;
}
