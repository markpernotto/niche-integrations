/**
 * Pipedrive REST API v1 types.
 *
 * API base: https://api.pipedrive.com/v1
 * Auth: personal API token passed as `api_token` query param
 */

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
