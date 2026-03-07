# Per-Integration Credentials

Niche requires a **unique `client_id` and `client_secret` for each integration** you build. This document explains the setup.

## Env Var Pattern

Each integration reads its own prefixed environment variables:

| Integration    | Env Vars                                                       |
|----------------|----------------------------------------------------------------|
| WordPress      | `NICHE_WORDPRESS_CLIENT_ID`, `NICHE_WORDPRESS_CLIENT_SECRET`   |
| Facebook Leads | `NICHE_FACEBOOK_LEADS_CLIENT_ID`, `NICHE_FACEBOOK_LEADS_CLIENT_SECRET` |

Set these in the repo root `.env`. Optional: `NICHE_<PREFIX>_ACCESS_TOKEN` to skip OAuth; or shared `NICHE_ACCESS_TOKEN`.

## Testing Credentials

```bash
# Test WordPress credentials (default)
pnpm test:auth
pnpm test:auth:wordpress

# Test Facebook Leads credentials
pnpm test:auth:facebook
```

## Adding a New Integration

1. Register the integration in Niche (get `client_id` and `client_secret`).
2. Add the integration to `packages/core/src/credentials.ts`:
   - Add to `IntegrationName` type
   - Add to `ENV_PREFIXES`
3. Add env vars to `.env.example`.
4. Use `getNicheConfigForIntegration('your-integration')` when creating `NicheClient`.
