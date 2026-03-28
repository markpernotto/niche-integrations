/**
 * Keap REST API v2 types.
 *
 * API base: https://api.infusionsoft.com/crm/rest/v2
 * Auth: OAuth 2.0 (access token in Authorization: Bearer header)
 * Sandbox: https://developer.infusionsoft.com
 */

export interface KeapTokens {
  access_token: string;
  expires_at: number; // ms since epoch
}

export interface KeapPhoneNumber {
  number: string;
  type?: string;
  extension?: string;
}

export interface KeapEmailAddress {
  email: string;
  field?: string;
}

export interface KeapContact {
  id: number;
  given_name?: string;
  family_name?: string;
  /** Primary email */
  email_addresses?: KeapEmailAddress[];
  phone_numbers?: KeapPhoneNumber[];
  company?: {
    id?: number;
    company_name?: string;
  };
  /** ISO 8601 */
  last_updated: string;
  date_created: string;
}

export interface KeapListResponse<T> {
  contacts?: T[];
  next?: string;
  count?: number;
}
