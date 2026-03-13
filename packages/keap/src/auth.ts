/**
 * Keap (Infusionsoft) OAuth 2.0 token management.
 *
 * Authorization endpoint: https://accounts.infusionsoft.com/app/oauth/authorize
 * Token endpoint:         https://api.infusionsoft.com/token
 * Scopes:                 full (Keap uses a single "full" scope)
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import type { KeapTokens } from './types';

const TOKEN_FILE = path.join(__dirname, '..', '.keap-tokens.json');

const AUTH_URL = 'https://accounts.infusionsoft.com/app/oauth/authorize';
const TOKEN_URL = 'https://api.infusionsoft.com/token';

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'full',
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

  saveTokens({
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
  });
}

async function refreshTokens(clientId: string, clientSecret: string): Promise<KeapTokens> {
  const current = loadTokens();
  if (!current) throw new Error('No tokens stored — visit /auth first');

  const res = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
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

  const tokens: KeapTokens = {
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token || current.refresh_token,
    expires_at: Date.now() + res.data.expires_in * 1000 - 60_000,
  };
  saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  let tokens = loadTokens();
  if (!tokens) throw new Error('Not authenticated — visit /auth first');

  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshTokens(clientId, clientSecret);
  }
  return tokens.access_token;
}

function saveTokens(tokens: KeapTokens): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

export function loadTokens(): KeapTokens | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as KeapTokens;
  } catch {
    return null;
  }
}
