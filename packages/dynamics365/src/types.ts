/**
 * Microsoft Dynamics 365 REST API (OData v4) types.
 *
 * API base: https://{instance}.crm.dynamics.com/api/data/v9.2/
 * Auth: OAuth 2.0 client credentials via Microsoft Entra ID
 */

export interface DynamicsLead {
  leadid: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  telephone1?: string;  // business phone
  mobilephone?: string;
  emailaddress1?: string;
  modifiedon: string;   // ISO 8601
}

export interface DynamicsContact {
  contactid: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  telephone1?: string;  // business phone
  mobilephone?: string;
  emailaddress1?: string;
  modifiedon: string;   // ISO 8601
}

export interface DynamicsODataResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}
