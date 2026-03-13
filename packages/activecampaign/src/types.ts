/**
 * ActiveCampaign REST API v3 types.
 *
 * API base: https://<account>.api-us1.com/api/3
 * Auth: API key via header "Api-Token: <api_key>"
 */

export interface ActiveCampaignContact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  /** ISO 8601 — last updated timestamp */
  udate: string;
  cdate: string;
}

export interface ActiveCampaignListContactsResponse {
  contacts: ActiveCampaignContact[];
  meta: {
    total: string;
  };
}
