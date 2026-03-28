/**
 * Pipedrive personal API token management.
 *
 * Authentication: personal API token passed as `api_token` query param.
 * Token is found in Pipedrive account → Settings → Personal preferences → API.
 * It never expires unless manually regenerated.
 */

export function isConfigured(apiToken: string): boolean {
  return !!apiToken;
}
