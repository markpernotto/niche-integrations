/**
 * Microsoft Dynamics 365 OAuth 2.0 client credentials token management.
 *
 * Token endpoint: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 * Scope:          https://{instance}.crm.dynamics.com/.default
 *
 * No user interaction required — client credentials flow runs entirely server-side.
 */

import axios from 'axios';

interface CachedToken {
  access_token: string;
  expires_at: number; // ms since epoch
}

let cached: CachedToken | null = null;

export async function getAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  instanceUrl: string
): Promise<string> {
  if (cached && Date.now() < cached.expires_at) {
    return cached.access_token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  // Scope must end with /.default and match the Dynamics instance URL exactly
  const scope = `${instanceUrl.replace(/\/$/, '')}/.default`;

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cached = {
    access_token: res.data.access_token,
    // Subtract 60s buffer so we refresh before actual expiry
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
  };

  return cached.access_token;
}

export function isConfigured(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  instanceUrl: string
): boolean {
  return !!(tenantId && clientId && clientSecret && instanceUrl);
}
