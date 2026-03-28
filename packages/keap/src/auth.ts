/**
 * Keap service account token management.
 *
 * Keap's developer portal issues API Keys (client_id + client_secret) as
 * service account credentials. These use the OAuth 2.0 client_credentials
 * grant — no user browser flow or redirect URI needed.
 *
 * Token endpoint: https://api.infusionsoft.com/token
 */

import axios from 'axios';
import type { KeapTokens } from './types';

const TOKEN_URL = 'https://api.infusionsoft.com/token';

let cached: KeapTokens | null = null;

export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (cached && Date.now() < cached.expires_at) {
    return cached.access_token;
  }

  const res = await axios.post<{
    access_token: string;
    expires_in: number;
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'full',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cached = {
    access_token: res.data.access_token,
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
  };

  return cached.access_token;
}

/** Returns true if credentials are configured (token will be fetched on demand). */
export function isConfigured(clientId: string, clientSecret: string): boolean {
  return !!(clientId && clientSecret);
}
