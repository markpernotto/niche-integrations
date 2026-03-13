/**
 * Pipedrive REST API v1 types.
 *
 * API base: https://api.pipedrive.com/v1  (or https://<company>.pipedrive.com/api/v1)
 * Auth: OAuth 2.0 (access token in Authorization header)
 */

export interface PipedriveTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
  api_domain: string; // e.g. "yourcompany.pipedrive.com"
}

export interface PipedrivePhoneEmail {
  value: string;
  primary: boolean;
  label?: string;
}

export interface PipedrivePerson {
  id: number;
  name?: string;
  phone: PipedrivePhoneEmail[];
  email: PipedrivePhoneEmail[];
  /** ISO 8601 update timestamp */
  update_time: string;
  add_time: string;
  org_name?: string;
}

export interface PipedriveListResponse<T> {
  success: boolean;
  data: T[] | null;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
    };
  };
}
