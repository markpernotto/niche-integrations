/**
 * Type definitions for Niche Partner API
 */

export interface NicheLead {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface NicheBusiness {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NicheOrganization {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

export interface NicheApiError {
  error: string;
  message: string;
  statusCode?: number;
}

export interface CreateLeadRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateLeadRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ListLeadsParams {
  limit?: number;
  offset?: number;
  source?: string;
  businessId?: string;
}
