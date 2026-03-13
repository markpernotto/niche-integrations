/**
 * Freshsales REST API v2 types.
 *
 * API base: https://<domain>.myfreshworks.com/crm/sales/api/
 * Auth: API key via token auth header: "Token token=<api_key>"
 * No OAuth needed — API key is permanent and per-user.
 */

export interface FreshsalesContact {
  id: number;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  mobile_number?: string;
  work_number?: string;
  job_title?: string;
  city?: string;
  state?: string;
  lead_source_id?: number;
  updated_at: string;
  created_at: string;
}

export interface FreshsalesLead {
  id: number;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  mobile_number?: string;
  work_number?: string;
  job_title?: string;
  city?: string;
  state?: string;
  company?: {
    name?: string;
  };
  updated_at: string;
  created_at: string;
}

export interface FreshsalesListResponse<T> {
  contacts?: T[];
  leads?: T[];
  meta: {
    total_pages: number;
    total_count: number;
    per_page: number;
    current_page: number;
  };
}
