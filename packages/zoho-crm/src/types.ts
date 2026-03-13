/**
 * Zoho CRM REST API v8 types.
 *
 * API base: https://www.zohoapis.com/crm/v8/
 * Auth: OAuth 2.0 Authorization Code flow (Server Based Application)
 * Access tokens expire after 1 hour; refresh tokens are long-lived.
 */

export interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
}

export interface ZohoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

export interface ZohoLead {
  id: string;
  First_Name?: string;
  Last_Name?: string;
  Phone?: string;
  Mobile?: string;
  Email?: string;
  Company?: string;
  Lead_Source?: string;
  Lead_Status?: string;
  Title?: string;
  City?: string;
  State?: string;
  Modified_Time: string;
  Created_Time: string;
}

export interface ZohoContact {
  id: string;
  First_Name?: string;
  Last_Name?: string;
  Phone?: string;
  Mobile?: string;
  Email?: string;
  Account_Name?: string;
  Title?: string;
  Mailing_City?: string;
  Mailing_State?: string;
  Modified_Time: string;
  Created_Time: string;
}

export interface ZohoSearchResponse<T> {
  data: T[];
  info: {
    count: number;
    more_records: boolean;
    page: number;
    per_page: number;
  };
}
