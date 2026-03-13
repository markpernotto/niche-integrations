/**
 * Salesforce REST API types.
 *
 * Salesforce uses REST API at {instance_url}/services/data/v59.0/
 * Auth: OAuth 2.0 Authorization Code flow (Connected App)
 * Access tokens expire after ~2 hours; refresh tokens are long-lived.
 */

export interface SalesforceTokenResponse {
  access_token: string;
  refresh_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
  id: string;
}

export interface SalesforceTokens {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  expiresAt: number; // unix ms
}

export interface SalesforceLead {
  Id: string;
  FirstName?: string;
  LastName: string;
  Company?: string;
  Phone?: string;
  MobilePhone?: string;
  Email?: string;
  LeadSource?: string;
  Status?: string;
  Title?: string;
  Street?: string;
  City?: string;
  State?: string;
  CreatedDate: string;
  LastModifiedDate: string;
}

export interface SalesforceContact {
  Id: string;
  FirstName?: string;
  LastName: string;
  AccountName?: string; // from Account.Name relationship
  Phone?: string;
  MobilePhone?: string;
  Email?: string;
  Title?: string;
  MailingCity?: string;
  MailingState?: string;
  CreatedDate: string;
  LastModifiedDate: string;
}

export interface SalesforceQueryResponse<T> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}
