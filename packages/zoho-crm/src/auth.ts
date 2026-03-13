/**
 * Zoho CRM OAuth 2.0 token management.
 *
 * Flow:
 *   1. User visits GET /auth → redirected to Zoho's OAuth consent screen
 *   2. Zoho redirects to GET /callback?code=... → exchange for tokens
 *   3. Tokens stored in memory; access token auto-refreshed before expiry
 *
 * Setup (one-time):
 *   1. Sign up for Zoho CRM Developer Edition at https://www.zoho.com/crm/developer/developer-edition.html
 *   2. Go to https://api-console.zoho.com/ → Add Client → Server Based Applications
 *   3. Set Authorized Redirect URIs: http://localhost:9005/callback
 *   4. Copy Consumer Key → ZOHO_CLIENT_ID in .env
 *   5. Copy Consumer Secret → ZOHO_CLIENT_SECRET in .env
 */

import axios from 'axios';
import type { ZohoTokens, ZohoTokenResponse } from './types';

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/auth';
const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';

// Scopes required: read leads and contacts
const SCOPES = 'ZohoCRM.modules.leads.READ,ZohoCRM.modules.contacts.READ';

let tokens: ZohoTokens | null = null;

export function getTokens(): ZohoTokens | null {
  return tokens;
}

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent',
  });
  return `${ZOHO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<ZohoTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await axios.post<ZohoTokenResponse>(ZOHO_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.data.refresh_token) {
    throw new Error('No refresh_token in Zoho response — ensure access_type=offline and prompt=consent were sent');
  }

  tokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: Date.now() + res.data.expires_in * 1000 - 60_000,
  };
  return tokens;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string
): Promise<ZohoTokens> {
  if (!tokens?.refreshToken) throw new Error('No refresh token available');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post<ZohoTokenResponse>(ZOHO_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  tokens = {
    accessToken: res.data.access_token,
    refreshToken: tokens.refreshToken, // Zoho does not rotate refresh tokens
    expiresAt: Date.now() + res.data.expires_in * 1000 - 60_000,
  };
  return tokens;
}

/** Returns a valid access token, refreshing if necessary. */
export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (!tokens) throw new Error('Not authenticated — visit /auth to connect Zoho CRM');
  if (Date.now() >= tokens.expiresAt) {
    await refreshAccessToken(clientId, clientSecret);
  }
  return tokens!.accessToken;
}
