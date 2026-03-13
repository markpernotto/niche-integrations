# Niche Partner API — Integration Suite

A monorepo of integrations for the [Niche Partner API](https://app.nicheandleads.com), built for the Niche Integration Competition (deadline: March 30, 2026 — $1,000 per qualifying integration).

---

## Integrations

| Integration | Type | Auth | Status |
|---|---|---|---|
| **WordPress** | PHP plugin | OAuth2 client credentials | Complete |
| **Facebook Lead Ads** | Webhook receiver | App secret verification | Complete |
| **Jobber** | Polling sync | OAuth 2.0 (user) | Complete |
| **Salesforce** | Polling sync | OAuth 2.0 + PKCE | Complete |
| **Zoho CRM** | Polling sync | OAuth 2.0 (user) | Complete |
| **Freshsales** | Polling sync | API key | Complete |
| **HubSpot** | Webhook + polling | Access token | In progress |
| **JobNimbus** | Webhook receiver | API key | Scaffolded |
| **MarketSharp** | Polling sync | API key | Scaffolded |

All Node.js servers are deployed on **Railway** (one service per integration). See [docs/deployment.md](docs/deployment.md) for the full setup guide.

---

## Architecture

**WordPress** is a standalone PHP plugin — no server required. Users install it directly into their WordPress site via WP Admin.

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

See [docs/deployment.md](docs/deployment.md) for the full env var reference per integration.

---

## Running Locally

```bash
# Build + start individual integrations
pnpm build:jobber && pnpm start:jobber          # http://localhost:9003
pnpm build:salesforce && pnpm start:salesforce  # http://localhost:9004
pnpm build:zoho-crm && pnpm start:zoho-crm      # http://localhost:9005
pnpm build:freshsales && pnpm start:freshsales  # http://localhost:9006
pnpm build:facebook-leads && pnpm start:facebook-leads  # http://localhost:6666
pnpm build:hubspot && pnpm start:hubspot        # http://localhost:7777

# Build + start all
pnpm build && pnpm start:all
```

Every server exposes:
- `GET /health` — returns `{"status":"ok",...}` with service config summary
- `POST /sync` — manual sync trigger (polling integrations)
- `GET /auth` — start OAuth flow in browser (OAuth integrations)

---

## Project Structure

```
docs/
  deployment.md          # Railway setup, env vars, post-deploy checklist
packages/
  core/                  # Shared Niche API client + per-integration credential loading
  wordpress/             # PHP plugin — installs directly into WordPress
  facebook-leads/        # Webhook server for Facebook/Instagram Lead Ads
  hubspot/               # Webhook + polling sync for HubSpot contacts
  jobber/                # OAuth + GraphQL polling sync for Jobber clients
  salesforce/            # OAuth + PKCE + REST polling for Salesforce leads/contacts
  zoho-crm/              # OAuth + REST polling for Zoho CRM leads/contacts
  freshsales/            # API key + REST polling for Freshsales contacts
  jobnimbus/             # Webhook receiver for JobNimbus (scaffolded)
  marketsharp/           # Polling sync for MarketSharp (scaffolded)
```

---

## Testing

```bash
pnpm test         # run all tests once
pnpm test:watch   # watch mode
```

Tests use [Vitest](https://vitest.dev) and run from the repo root via [vitest.config.ts](vitest.config.ts).

### Unit tests — transformers (116 tests)

Pure function tests with no network calls or mocking:

| Package | Test file | What's tested |
|---|---|---|
| jobber | [transformer.test.ts](packages/jobber/src/transformer.test.ts) | Name building, phone normalization, info block |
| salesforce | [transformer.test.ts](packages/salesforce/src/transformer.test.ts) | Lead + contact transforms, mobile fallback |
| zoho-crm | [transformer.test.ts](packages/zoho-crm/src/transformer.test.ts) | Lead + contact transforms, mobile fallback |
| freshsales | [transformer.test.ts](packages/freshsales/src/transformer.test.ts) | Contact + lead, display_name fallback, work_number fallback |
| facebook-leads | [transformer.test.ts](packages/facebook-leads/src/transformer.test.ts) | Field extraction, name variants, info label formatting |
| hubspot | [transformer.test.ts](packages/hubspot/src/transformer.test.ts) | Contact transform, deal transform with/without associated contact |

All transformers are tested for: correct `source` value, name assembly, phone normalization (10-digit → E.164, 11-digit starting with 1 → E.164, formatted strings, international pass-through), field fallbacks, and `info` block content.

### Integration tests — HTTP routes (28 tests)

Supertest tests against each Express app with external dependencies (NicheClient, platform APIs) mocked:

| Package | Test file | What's tested |
|---|---|---|
| facebook-leads | [index.test.ts](packages/facebook-leads/src/index.test.ts) | Health, webhook GET verification (valid/invalid token), POST signature validation (valid/invalid/missing), async lead processing, deduplication |
| hubspot | [index.test.ts](packages/hubspot/src/index.test.ts) | Health, webhook signature validation, sync 401 when token unset |
| jobber | [index.test.ts](packages/jobber/src/index.test.ts) | Health, sync 401 when unauthenticated, OAuth redirect |
| salesforce | [index.test.ts](packages/salesforce/src/index.test.ts) | Health, sync 401 when unauthenticated, OAuth redirect |
| zoho-crm | [index.test.ts](packages/zoho-crm/src/index.test.ts) | Health, sync 401 when unauthenticated, OAuth redirect |
| freshsales | [index.test.ts](packages/freshsales/src/index.test.ts) | Health, sync 500 when unconfigured |

---

## Deployment

All Node.js services are deployed to Railway with auto-deploy on push to `main`.

Full setup instructions: [docs/deployment.md](docs/deployment.md)

---

## Competition

- **Deadline**: March 30, 2026
- **Prize**: $1,000 per qualifying integration
- **API Docs**: [Niche Partner API](https://app.nicheandleads.com/api/partner/v1/)
