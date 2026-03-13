/**
 * Jobber OAuth 2.0 token management.
 *
 * Flow:
 *   1. User visits GET /auth → redirected to Jobber's OAuth consent screen
 *   2. Jobber redirects to GET /callback?code=... → we exchange for tokens
 *   3. Tokens stored in memory; access token auto-refreshed before expiry
 *
 * Jobber Developer Center: https://developer.getjobber.com
 * Register your app there to get JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET.
 * NOTE: Do NOT add a redirect URI in the Jobber dashboard — localhost is
 * supported automatically and must not be listed explicitly.
 */

import axios from 'axios';
import type { JobberTokens } from './types';

const JOBBER_AUTH_URL = 'https://api.getjobber.com/api/oauth/authorize';
const JOBBER_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';

let tokens: JobberTokens | null = null;

export function getTokens(): JobberTokens | null {
  return tokens;
}

export function setTokens(t: JobberTokens): void {
  tokens = t;
}

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return `${JOBBER_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<JobberTokens> {
  // Jobber token endpoint uses query params, not a form body
  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(JOBBER_TOKEN_URL, null, {
    params: {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
  });

  const t: JobberTokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: Date.now() + res.data.expires_in * 1000 - 60_000, // 1-min buffer
  };
  tokens = t;
  return t;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string
): Promise<JobberTokens> {
  if (!tokens?.refreshToken) throw new Error('No refresh token available');

  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(JOBBER_TOKEN_URL, null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
  });

  const t: JobberTokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: Date.now() + res.data.expires_in * 1000 - 60_000,
  };
  tokens = t;
  return t;
}

/** Returns a valid access token, refreshing if necessary. */
export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (!tokens) throw new Error('Not authenticated — visit /auth to connect Jobber');
  if (Date.now() >= tokens.expiresAt) {
    await refreshAccessToken(clientId, clientSecret);
  }
  return tokens!.accessToken;
}
