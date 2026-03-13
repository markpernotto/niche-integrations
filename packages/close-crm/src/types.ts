/**
 * Close CRM REST API v1 types.
 *
 * API base: https://api.close.com/api/v1
 * Auth: HTTP Basic auth — API key as username, empty password
 *       (or Bearer token for OAuth)
 */

export interface ClosePhoneEmail {
  type?: string;
  phone?: string;
  email?: string;
}

export interface CloseLead {
  id: string;
  display_name?: string;
  /** Contacts embedded in leads */
  contacts?: CloseContact[];
  /** ISO 8601 */
  date_updated: string;
  date_created: string;
}

export interface CloseContact {
  id: string;
  name?: string;
  phones?: ClosePhoneEmail[];
  emails?: ClosePhoneEmail[];
  /** ISO 8601 */
  date_updated?: string;
  date_created?: string;
}

export interface CloseLeadListResponse {
  data: CloseLead[];
  has_more: boolean;
  total_results?: number;
  cursor?: string;
}
