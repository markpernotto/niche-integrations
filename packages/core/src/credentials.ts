/**
 * Per-integration credential loading for Niche Partner API.
 *
 * Niche requires a unique client_id and client_secret for EACH integration.
 * Each integration reads its own prefixed env vars.
 */

import type { NicheClientConfig } from './client';

export type IntegrationName =
  | 'wordpress'
  | 'facebook-leads'
  | 'hubspot'
  | 'jobnimbus'
  | 'marketsharp'
  | 'jobber'
  | 'salesforce';

const ENV_PREFIXES: Record<IntegrationName, string> = {
  wordpress: 'NICHE_WORDPRESS',
  'facebook-leads': 'NICHE_FACEBOOK_LEADS',
  hubspot: 'NICHE_HUBSPOT',
  jobnimbus: 'NICHE_JOBNIMBUS',
  marketsharp: 'NICHE_MARKETSHARP',
  jobber: 'NICHE_JOBBER',
  salesforce: 'NICHE_SALESFORCE',
};

/**
 * Get NicheClient config for a specific integration.
 * Reads NICHE_{INTEGRATION}_CLIENT_ID and NICHE_{INTEGRATION}_CLIENT_SECRET.
 */
export function getNicheConfigForIntegration(integration: IntegrationName): NicheClientConfig {
  const prefix = ENV_PREFIXES[integration];
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];

  const baseURL = process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';
  const accessToken = process.env[`${prefix}_ACCESS_TOKEN`] || process.env.NICHE_ACCESS_TOKEN;

  return {
    clientId: clientId || undefined,
    clientSecret: clientSecret || undefined,
    accessToken: accessToken || undefined,
    baseURL,
  };
}
