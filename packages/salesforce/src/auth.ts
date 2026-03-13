/**
 * Salesforce OAuth 2.0 token management with PKCE.
 *
 * Uses PKCE (Proof Key for Code Exchange) — required by Salesforce External Client Apps.
 *
 * Flow:
 *   1. User visits GET /auth → generates code_verifier/challenge, redirects to Salesforce
 *   2. Salesforce redirects to GET /callback?code=... → exchange code + verifier for tokens
 *   3. Tokens stored in memory; access token auto-refreshed before expiry
 */

import crypto from 'crypto';
import axios from 'axios';
import type { SalesforceTokens, SalesforceTokenResponse } from './types';

const SF_AUTH_URL = 'https://login.salesforce.com/services/oauth2/authorize';
const SF_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token';

let tokens: SalesforceTokens | null = null;
let pendingCodeVerifier: string | null = null;

export function getTokens(): SalesforceTokens | null {
  return tokens;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  pendingCodeVerifier = verifier;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'api refresh_token offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${SF_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<SalesforceTokens> {
  if (!pendingCodeVerifier) throw new Error('No pending code verifier — restart the auth flow');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: pendingCodeVerifier,
  });
  pendingCodeVerifier = null;

  const res = await axios.post<SalesforceTokenResponse>(SF_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  tokens = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    instanceUrl: res.data.instance_url,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000 - 60_000,
  };
  return tokens;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string
): Promise<SalesforceTokens> {
  if (!tokens?.refreshToken) throw new Error('No refresh token available');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post<SalesforceTokenResponse>(SF_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  tokens = {
    accessToken: res.data.access_token,
    refreshToken: tokens.refreshToken,
    instanceUrl: res.data.instance_url || tokens.instanceUrl,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000 - 60_000,
  };
  return tokens;
}

/** Returns a valid access token, refreshing if necessary. */
export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (!tokens) throw new Error('Not authenticated — visit /auth to connect Salesforce');
  if (Date.now() >= tokens.expiresAt) {
    await refreshAccessToken(clientId, clientSecret);
  }
  return tokens!.accessToken;
}
