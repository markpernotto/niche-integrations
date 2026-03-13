/**
 * Pipedrive OAuth 2.0 token management.
 *
 * Authorization endpoint: https://oauth.pipedrive.com/oauth/authorize
 * Token endpoint:         https://oauth.pipedrive.com/oauth/token
 * Scopes:                 contacts:read,leads:read (adjust per app settings)
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import type { PipedriveTokens } from './types';

const TOKEN_FILE = path.join(__dirname, '..', '.pipedrive-tokens.json');

const AUTH_URL = 'https://oauth.pipedrive.com/oauth/authorize';
const TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token';

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<void> {
  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    api_domain: string;
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const tokens: PipedriveTokens = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
    api_domain: res.data.api_domain,
  };
  saveTokens(tokens);
}

async function refreshTokens(
  clientId: string,
  clientSecret: string
): Promise<PipedriveTokens> {
  const current = loadTokens();
  if (!current) throw new Error('No tokens stored — visit /auth first');

  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    api_domain: string;
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
    }),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  const tokens: PipedriveTokens = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token || current.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
    api_domain: res.data.api_domain || current.api_domain,
  };
  saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<{ token: string; apiDomain: string }> {
  let tokens = loadTokens();
  if (!tokens) throw new Error('Not authenticated — visit /auth first');

  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshTokens(clientId, clientSecret);
  }
  return { token: tokens.access_token, apiDomain: tokens.api_domain };
}

function saveTokens(tokens: PipedriveTokens): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

export function loadTokens(): PipedriveTokens | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as PipedriveTokens;
  } catch {
    return null;
  }
}
