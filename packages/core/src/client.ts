/**
 * Niche Partner API Client
 * Handles OAuth authentication and provides type-safe API methods
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  OAuthTokenResponse,
  NicheLead,
  NicheBusiness,
  NicheOrganization,
  CreateLeadRequest,
  UpdateLeadRequest,
  ListLeadsParams,
  NicheApiError,
} from './types';
import { RateLimiter, sleep } from './utils';

const DEFAULT_RATE_LIMIT_PER_SECOND = 2;
const MAX_429_RETRIES = 1;
const DEFAULT_429_DELAY_MS = 5000;

function parseRetryAfter(value: string | string[] | undefined): number | undefined {
  if (value == null) return undefined;
  const s = Array.isArray(value) ? value[0] : value;
  if (!s || typeof s !== 'string') return undefined;
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  return undefined;
}

export interface NicheClientConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  baseURL?: string;
  rateLimitPerSecond?: number;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _niche429Retries?: number;
  }
}

export class NicheClient {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly rateLimiter?: RateLimiter;

  constructor(config: NicheClientConfig = {}) {
    // Load from environment if not provided
    this.clientId = config.clientId || process.env.NICHE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.NICHE_CLIENT_SECRET;
    const staticToken = config.accessToken || process.env.NICHE_ACCESS_TOKEN;
    const baseURL =
      config.baseURL || process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';

    if (staticToken) {
      this.accessToken = staticToken;
    }

    // Rate limit: conservative default, configurable via env (respectful of API limits)
    const rateLimit =
      config.rateLimitPerSecond ??
      (process.env.NICHE_RATE_LIMIT_PER_SECOND
        ? parseInt(process.env.NICHE_RATE_LIMIT_PER_SECOND, 10)
        : undefined) ??
      DEFAULT_RATE_LIMIT_PER_SECOND;
    const limit =
      Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : DEFAULT_RATE_LIMIT_PER_SECOND;
    this.rateLimiter = new RateLimiter(limit, limit);

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      // Wait for rate limiter if needed
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      // Ensure we have a valid token
      await this.ensureAuthenticated();

      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }

      return config;
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const config = error.config;

        // Handle 429 - rate limited: honor Retry-After, then retry once (respectful)
        if (error.response?.status === 429 && config) {
          const retries = config._niche429Retries ?? 0;
          if (retries < MAX_429_RETRIES) {
            const h = error.response?.headers as
              | Record<string, string | string[] | undefined>
              | undefined;
            const retryAfter = h?.['retry-after'] ?? h?.['Retry-After'];
            const delayMs = parseRetryAfter(retryAfter) ?? DEFAULT_429_DELAY_MS;
            await sleep(delayMs);
            config._niche429Retries = retries + 1;
            return this.axiosInstance.request(config);
          }
        }

        // Handle 401 - token expired, try to refresh
        if (error.response?.status === 401 && this.clientId && this.clientSecret && config) {
          await this.authenticate();
          return this.axiosInstance.request(config);
        }

        // Format error
        const apiError: NicheApiError = {
          error: (error.response?.data as { error?: string })?.error || 'Unknown error',
          message:
            (error.response?.data as { message?: string })?.message ||
            error.message ||
            'An error occurred',
          statusCode: error.response?.status,
        };

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Authenticate using client credentials flow
   */
  async authenticate(): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('NICHE_CLIENT_ID and NICHE_CLIENT_SECRET must be provided');
    }

    const tokenUrl = `${this.axiosInstance.defaults.baseURL}/api/partner/v1/oauth/token`;
    // Log auth attempt (never log secret or token)
    console.error(
      '[NicheClient] POST',
      tokenUrl,
      '| client_id:',
      this.clientId ? `${this.clientId.slice(0, 8)}…` : '(missing)'
    );

    try {
      const response = await axios.post<OAuthTokenResponse>(
        tokenUrl,
        {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
      this.tokenExpiresAt = Date.now() + expiresIn * 1000;
      console.error('[NicheClient] Token received, expires_in:', expiresIn);

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = error.response?.data as Record<string, unknown> | undefined;
        const msg = (body?.message as string) ?? (body?.error as string) ?? error.message;
        console.error('[NicheClient] Token request failed:', status, JSON.stringify(body ?? {}));
        throw new Error(`Authentication failed: ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    // If we have a static token, use it
    if (this.accessToken && !this.clientId) {
      return;
    }

    // Check if token is expired or missing
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt - 60000) {
      // Refresh 1 minute before expiry
      await this.authenticate();
    }
  }

  /**
   * Get list of organizations
   */
  async getOrganizations(): Promise<NicheOrganization[]> {
    const response = await this.axiosInstance.get<NicheOrganization[]>(
      '/api/partner/v1/organizations/'
    );
    return response.data;
  }

  /**
   * Get list of businesses
   */
  async getBusinesses(): Promise<NicheBusiness[]> {
    const response = await this.axiosInstance.get<NicheBusiness[]>('/api/partner/v1/businesses/');
    return response.data;
  }

  /**
   * Get a specific business by ID
   */
  async getBusiness(businessId: string): Promise<NicheBusiness> {
    const response = await this.axiosInstance.get<NicheBusiness>(
      `/api/partner/v1/businesses/${businessId}`
    );
    return response.data;
  }

  /**
   * Create a new lead
   */
  async createLead(businessId: string, leadData: CreateLeadRequest): Promise<NicheLead> {
    const response = await this.axiosInstance.post<NicheLead>(
      `/api/partner/v1/businesses/${businessId}/leads/`,
      leadData
    );
    return response.data;
  }

  /**
   * Update an existing lead
   */
  async updateLead(
    businessId: string,
    leadId: string,
    leadData: UpdateLeadRequest
  ): Promise<NicheLead> {
    const response = await this.axiosInstance.patch<NicheLead>(
      `/api/partner/v1/businesses/${businessId}/leads/${leadId}`,
      leadData
    );
    return response.data;
  }

  /**
   * Get a specific lead
   */
  async getLead(businessId: string, leadId: string): Promise<NicheLead> {
    const response = await this.axiosInstance.get<NicheLead>(
      `/api/partner/v1/businesses/${businessId}/leads/${leadId}`
    );
    return response.data;
  }

  /**
   * List leads for a business
   */
  async listLeads(businessId: string, params?: ListLeadsParams): Promise<NicheLead[]> {
    const response = await this.axiosInstance.get<NicheLead[]>(
      `/api/partner/v1/businesses/${businessId}/leads/`,
      { params }
    );
    return response.data;
  }

  /**
   * List all leads across organization
   */
  async listOrganizationLeads(params?: ListLeadsParams): Promise<NicheLead[]> {
    const response = await this.axiosInstance.get<NicheLead[]>(
      '/api/partner/v1/organizations/leads/',
      { params }
    );
    return response.data;
  }
}
