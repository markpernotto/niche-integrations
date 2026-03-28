# Niche Partner API — Integration Suite

A monorepo of integrations for the [Niche Partner API](https://app.nicheandleads.com), built for the Niche Integration Competition (deadline: March 30, 2026).

---

## Integrations

| Integration | Type | Auth | Status |
|---|---|---|---|
| **WordPress** | PHP plugin | OAuth2 client credentials | ✅ Complete |
| **Facebook Lead Ads** | Webhook receiver | App secret verification | ✅ Complete |
| **Jobber** | Polling sync | OAuth 2.0 (user) | ✅ Complete |
| **Salesforce** | Polling sync | OAuth 2.0 + PKCE | ✅ Complete |
| **Zoho CRM** | Polling sync | OAuth 2.0 (user) | ✅ Complete |
| **Freshsales** | Polling sync | API key | ✅ Complete |
| **Close CRM** | Polling sync | API key (HTTP Basic) | ✅ Complete |
| **ActiveCampaign** | Polling sync | API key | ✅ Complete |
| **Pipedrive** | Polling sync | Personal API token | ✅ Complete |
| **HubSpot** | Outbound polling sync (Niche → HubSpot) | Private app token | ✅ Complete |
| **Microsoft Dynamics 365** | Polling sync | OAuth 2.0 client credentials (Entra ID) | ✅ Complete |

---

## Architecture

**WordPress** is a standalone PHP plugin — no server required. Install it directly into WordPress via WP Admin. It calls the Niche API directly from PHP using credentials stored in WordPress settings. See [packages/wordpress/WALKTHROUGH.md](packages/wordpress/WALKTHROUGH.md) for full setup instructions.

All other integrations are **Node.js Express servers** that:
1. Receive webhook events or poll the source platform on a schedule
2. Transform contacts/leads into the Niche lead schema (`name`, `phone`, `info`, `source`)
3. POST to the Niche Partner API: `POST /api/partner/v1/businesses/{businessId}/leads`

Each integration authenticates with the Niche API using **OAuth2 client credentials** (separate Niche app per integration).

---

## Niche Lead Schema

```typescript
{
  name: string,    // required — contact full name
  phone: string,   // required — digits only
  info: string,    // email, message, and other details concatenated
  source: string,  // "WORDPRESS" | "FACEBOOK_LEADS" | "JOBBER" | etc.
}
```

Email goes in `info`, not a top-level field. Do not send empty string fields — the API returns 500.

---

## Prerequisites

- Node.js 18+
- pnpm 8+ (`npm install -g pnpm`)

## Installation

```bash
pnpm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in credentials for the integrations you want to run:

```bash
cp .env.example .env
```

---

## Running Locally

```bash
# Build + start individual integrations
pnpm build:jobber && pnpm start:jobber                  # http://localhost:9003
pnpm build:salesforce && pnpm start:salesforce          # http://localhost:9004
pnpm build:zoho-crm && pnpm start:zoho-crm              # http://localhost:9005
pnpm build:freshsales && pnpm start:freshsales          # http://localhost:9006
pnpm build:close-crm && pnpm start:close-crm            # http://localhost:9008
pnpm build:activecampaign && pnpm start:activecampaign  # http://localhost:9010
pnpm build:pipedrive && pnpm start:pipedrive            # http://localhost:9011
pnpm build:hubspot && pnpm start:hubspot                # http://localhost:7777
pnpm build:facebook-leads && pnpm start:facebook-leads  # http://localhost:6666
pnpm build:dynamics365 && pnpm start:dynamics365        # http://localhost:9007

# Build + start all
pnpm build && pnpm start:all
```

Every Node.js server exposes:
- `GET /health` — returns `{"status":"ok",...}` with service config summary
- `POST /sync` — manual sync trigger (polling integrations)
- `GET /auth` — start OAuth flow in browser (OAuth integrations only)

---

## Project Structure

```
packages/
  core/             # Shared Niche API client + per-integration credential loading
  wordpress/        # PHP plugin — installs directly into WordPress
  facebook-leads/   # Webhook server for Facebook/Instagram Lead Ads
  hubspot/          # Outbound polling sync — Niche leads + calls → HubSpot contacts, deals, engagements
  jobber/           # OAuth + GraphQL polling sync for Jobber clients
  salesforce/       # OAuth + PKCE + REST polling for Salesforce leads/contacts
  zoho-crm/         # OAuth + REST polling for Zoho CRM leads/contacts
  freshsales/       # API key + REST polling for Freshsales contacts
  close-crm/        # API key + REST polling for Close CRM leads
  activecampaign/   # API key + REST polling for ActiveCampaign contacts
  pipedrive/        # Personal API token + REST polling for Pipedrive persons
  dynamics365/      # OAuth client credentials + OData polling for Dynamics 365
```

---

## Testing

```bash
pnpm test         # run all tests once
pnpm test:watch   # watch mode
```

Tests use [Vitest](https://vitest.dev) and run from the repo root via [vitest.config.ts](vitest.config.ts). **203 tests across 20 files.**

### Unit tests — transformers

Pure function tests with no network calls:

| Package | Test file |
|---|---|
| jobber | [transformer.test.ts](packages/jobber/src/transformer.test.ts) |
| salesforce | [transformer.test.ts](packages/salesforce/src/transformer.test.ts) |
| zoho-crm | [transformer.test.ts](packages/zoho-crm/src/transformer.test.ts) |
| freshsales | [transformer.test.ts](packages/freshsales/src/transformer.test.ts) |
| facebook-leads | [transformer.test.ts](packages/facebook-leads/src/transformer.test.ts) |
| hubspot | [transformer.test.ts](packages/hubspot/src/transformer.test.ts) |
| close-crm | [transformer.test.ts](packages/close-crm/src/transformer.test.ts) |
| activecampaign | [transformer.test.ts](packages/activecampaign/src/transformer.test.ts) |
| pipedrive | [transformer.test.ts](packages/pipedrive/src/transformer.test.ts) |
| dynamics365 | [transformer.test.ts](packages/dynamics365/src/transformer.test.ts) |

All transformers are tested for: correct `source` value, name assembly, phone normalization (10-digit → E.164, formatted strings, international pass-through), field fallbacks, and `info` block content.

### Integration tests — HTTP routes

Supertest tests against each Express app with external dependencies mocked:

| Package | Test file |
|---|---|
| facebook-leads | [index.test.ts](packages/facebook-leads/src/index.test.ts) |
| hubspot | [index.test.ts](packages/hubspot/src/index.test.ts) |
| jobber | [index.test.ts](packages/jobber/src/index.test.ts) |
| salesforce | [index.test.ts](packages/salesforce/src/index.test.ts) |
| zoho-crm | [index.test.ts](packages/zoho-crm/src/index.test.ts) |
| freshsales | [index.test.ts](packages/freshsales/src/index.test.ts) |
| close-crm | [index.test.ts](packages/close-crm/src/index.test.ts) |
| activecampaign | [index.test.ts](packages/activecampaign/src/index.test.ts) |
| pipedrive | [index.test.ts](packages/pipedrive/src/index.test.ts) |
| dynamics365 | [index.test.ts](packages/dynamics365/src/index.test.ts) |
