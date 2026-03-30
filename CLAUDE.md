# Niche Integrations — Project Context for Claude

## What This Project Is

A monorepo of integrations for the **Niche Partner API** (`https://app.nicheandleads.com/api/partner/v1/`).
Built for the Niche Integration Competition (deadline March 30, 2026). Submitted as a GitHub repo.

Integrations built:
- **WordPress** — PHP plugin, direct API calls from WP (no relay server needed)
- **Facebook Lead Ads** — Node.js Express webhook server (port 6666)
- **HubSpot** — Node.js Express server (port 7777) — Niche → HubSpot outbound sync; polls Niche for leads + completed calls, creates HubSpot Contacts + Deals + Call engagements, confirmed working end-to-end (`{"ok":true,"leads":53,"calls":1}`)
- **Jobber** — Node.js Express server (port 9003) — OAuth 2.0 + GraphQL polling, confirmed working end-to-end
- **Salesforce** — Node.js Express server (port 9004) — OAuth 2.0 + PKCE + REST API polling, confirmed working end-to-end
- **Zoho CRM** — Node.js Express server (port 9005) — OAuth 2.0 + REST API polling, confirmed working end-to-end
- **Freshsales** — Node.js Express server (port 9006) — API key auth + REST API polling, confirmed working end-to-end
- **Close CRM** — Node.js Express server (port 9008) — API key auth + REST API polling, confirmed working end-to-end
- **ActiveCampaign** — Node.js Express server (port 9010) — API key auth + REST API polling, confirmed working end-to-end
- **Pipedrive** — Node.js Express server (port 9011) — personal API token + REST API polling, confirmed working end-to-end
- **Microsoft Dynamics 365** — Node.js Express server (port 9007) — OAuth 2.0 client credentials (Entra ID) + OData v4 REST polling (submitted; requires Azure app registration + Dynamics environment to activate)

**Deployment:** Submitted as a GitHub repo. No hosted deployment required.

---

## Niche API — Critical Facts

### Authentication
- The API uses **OAuth2 client credentials flow** — you must exchange `client_id` + `client_secret` for a bearer token first.
- The static `NICHE_ACCESS_TOKEN` in `.env` is a fallback but has proven unreliable; always prefer OAuth.
- **Scope must be requested explicitly** in the OAuth token request:
  ```json
  { "scope": "leads:write leads:read businesses:read businesses:write" }
  ```
- Even though the token response may list these scopes, the endpoint will return `403 Missing required scope` if the **Niche app was not configured with those scopes at creation time** in their dashboard. Rotating the client secret does NOT fix this — you must create a new app with scopes set upfront.

### Get a bearer token
```bash
curl -s -X POST "https://app.nicheandleads.com/api/partner/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "<your_client_id>",
    "client_secret": "<your_client_secret>",
    "scope": "leads:write leads:read businesses:read businesses:write"
  }'
```

### Create a lead (confirmed working)
```bash
TOKEN=<access_token_from_above>
BUSINESS_ID=<your_business_id>

curl -s -X POST "https://app.nicheandleads.com/api/partner/v1/businesses/${BUSINESS_ID}/leads" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead",
    "phone": "5555550100",
    "info": "Email: test@example.com | some message",
    "source": "WORDPRESS"
  }'
```

Expected response: HTTP 201 with full lead object.

**Do NOT send empty string fields** — the API returns 500 if fields like `id`, `threadId`, etc. are present but empty. Only send fields that have values.

### Lead schema
```typescript
{
  name: string,       // required
  phone: string,      // required
  info: string,       // email, message, and other details concatenated here
  source: string,     // "WORDPRESS", "FACEBOOK_LEADS", "HUBSPOT", etc.
}
```
Email goes in the `info` field, not a top-level field.

### Businesses endpoint
```bash
GET /api/partner/v1/businesses
```
Returns `{ items: [...], page, page_size, total }` — access businesses via `result['items']`.

---

## Unexpected Issues / Troubleshooting

### 1. Scope errors (403 Missing required scope)
**Symptom:** OAuth token obtained successfully but POST to leads returns `{"error":"Missing required scope","statusCode":403}`.

**Root cause:** The Niche app (client_id) was not configured with `leads:write` scope when it was created in the dashboard. Editing the app after creation does NOT retroactively grant scopes.

**Fix:** Create a brand new app in the Niche dashboard. Make sure all required scope checkboxes are checked **before** saving the app for the first time.

### 2. SPA routing bug (now fixed by Niche)
**Symptom:** Any API endpoint with a dynamic path segment (e.g. `/businesses/{id}/leads`) returned HTML (the React SPA `index.html`) instead of JSON.

**Status:** Fixed by Niche team around March 12, 2026. Before the fix, only static-path endpoints like `GET /businesses` returned proper JSON.

### 3. OAuth endpoint returning HTML (now fixed)
**Symptom:** `POST /oauth/token` returned SPA HTML.

**Status:** Also fixed by Niche team. Now returns proper JSON.

### 4. WordPress plugin — settings stored in WP database, not .env
The WordPress plugin reads credentials from WordPress options (`wp_options` table), NOT from the `.env` file.
Configure via **WP Admin → Settings → Niche Lead Capture**.
The `.env` is only for the Node.js integrations (Facebook, HubSpot).

### 5. CF7 hook must be `wpcf7_before_send_mail`, not `wpcf7_mail_sent`
`wpcf7_mail_sent` only fires if mail is actually sent. Local WP has no SMTP configured, so it never fires.
Use `wpcf7_before_send_mail` which fires regardless of mail outcome.

### 6. Business dropdown PHP warning
The businesses API returns `{ "items": [...] }` — iterate `$result['items']`, not `$result` directly.

### 7. Facebook App must be "Business" type, not "Facebook Login for Business"
"Facebook Login for Business" apps do NOT support the Webhooks product with `leadgen` subscriptions or the `pages_manage_metadata` permission. When creating a Facebook app for Lead Ads webhooks, select **"Business"** type (via "Other" → "Business" during app creation).

### 8. Facebook App must be in Live mode to receive real webhook data
While in Development mode, Facebook only delivers test webhooks from the dashboard UI. **No real lead data is delivered to app admins, developers, or testers until the app is switched to Live mode.** Toggle Development → Live in the app dashboard header.

### 9. Facebook Page must be subscribed to the app (page-level subscription)
Two separate subscriptions are required:
- **App-level**: In the app's Webhooks product, subscribe to `leadgen` field (done in the Webhooks UI)
- **Page-level**: The Facebook Page must be subscribed to the app via Graph API or the Lead Ads Testing Tool

The easiest way to do the page-level subscription: use the **Lead Ads Testing Tool** at developers.facebook.com/tools/lead-ads-testing — selecting the page there and clicking "Create lead" will associate the page with the app automatically (look for the green checkmark next to the App ID).

Alternatively via Graph API Explorer: select the app, switch "User or Page" to the Page (page token), POST to `me/subscribed_apps` with param `subscribed_fields=leadgen`. This only works when the app is in **Live mode**.

### 10. PAGE_ID_TO_BUSINESS_MAP must use the correct page ID
The page ID in webhook payloads (visible in `page_id` field) may differ from what you expect. Verify the actual page ID from a real webhook payload and update `PAGE_ID_TO_BUSINESS_MAP` in `.env` accordingly. The fallback `NICHE_BUSINESS_ID` will catch leads if the page ID isn't in the map.

### 11. Facebook Graph API version
Use `v25.0` (current as of March 2026). v21.0 is deprecated — Facebook auto-upgrades calls but logs a warning. Set `GRAPH_API_VERSION = 'v25.0'` in `transformer.ts`.

### 12. Facebook Access Token expiry
The `FACEBOOK_ACCESS_TOKEN` in `.env` (used to fetch lead data from the Graph API) expires. If lead fetches fail with "Session has expired" errors, generate a fresh token via Graph API Explorer and update `.env`, then restart the server.

---

## Repo Structure

```
packages/
  wordpress/
    plugin/niche-lead-capture.php   # WP plugin — pure PHP, no server needed
  facebook-leads/
    src/index.ts                     # Express webhook server, port 6666
  hubspot/
    src/index.ts                     # Express polling server, port 7777 — Niche → HubSpot outbound sync
  jobber/
    src/index.ts                     # Express server — OAuth flow + GraphQL polling, port 9003
    src/auth.ts                      # Jobber OAuth 2.0 token management
    src/transformer.ts               # JobberClient → Niche lead
    src/types.ts                     # Jobber type definitions
  salesforce/
    src/index.ts                     # Express server — OAuth 2.0 + PKCE + REST API polling, port 9004
    src/auth.ts                      # Salesforce OAuth 2.0 + PKCE token management
    src/transformer.ts               # SalesforceLead/Contact → Niche lead
    src/types.ts                     # Salesforce type definitions
  zoho-crm/
    src/index.ts                     # Express server — OAuth 2.0 + REST API polling, port 9005
    src/auth.ts                      # Zoho OAuth 2.0 token management
    src/transformer.ts               # ZohoLead/Contact → Niche lead
    src/types.ts                     # Zoho type definitions
  freshsales/
    src/index.ts                     # Express server — API key auth + REST API polling, port 9006
    src/transformer.ts               # FreshsalesContact → Niche lead
    src/types.ts                     # Freshsales type definitions
  close-crm/
    src/index.ts                     # Express server — API key auth + REST API polling, port 9008
    src/transformer.ts               # CloseLead → Niche lead
    src/types.ts                     # Close CRM type definitions
  activecampaign/
    src/index.ts                     # Express server — API key auth + REST API polling, port 9010
    src/transformer.ts               # ActiveCampaignContact → Niche lead
    src/types.ts                     # ActiveCampaign type definitions
  pipedrive/
    src/index.ts                     # Express server — personal API token + REST API polling, port 9011
    src/transformer.ts               # PipedrivePerson → Niche lead
    src/types.ts                     # Pipedrive type definitions
  dynamics365/
    src/index.ts                     # Express server — OAuth 2.0 client credentials + OData polling, port 9007
    src/transformer.ts               # DynamicsLead/Contact → Niche lead
    src/types.ts                     # Dynamics 365 type definitions
  core/
    src/credentials.ts               # Shared OAuth credential helpers (per-integration env prefixes)
    scripts/test-auth.js             # Manual API test script
```

---

## Jobber Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":1}`).

### One-time OAuth setup
1. Create a Jobber developer account at [developer.getjobber.com](https://developer.getjobber.com) — **must be a different email** than your Jobber customer account
2. Create an app — do **NOT** add a redirect URI for local dev (localhost is supported automatically and must not be listed). For production, add `https://<your-host>/callback` as the redirect URI and set `JOBBER_REDIRECT_URI` in env vars.
3. Request scope: `read_clients`
4. Copy `Client ID` and `Client Secret` into `.env` as `JOBBER_CLIENT_ID` / `JOBBER_CLIENT_SECRET`
5. Create a Niche app with all scopes checked → copy into `.env` as `NICHE_JOBBER_CLIENT_ID` / `NICHE_JOBBER_CLIENT_SECRET`
6. Build and start the server (see commands below)
7. Visit `http://localhost:9003/auth` in a browser → approve access in Jobber
8. Trigger initial sync: `curl -X POST http://localhost:9003/sync`

### Routes
- `GET /health` — status check
- `GET /auth` — start OAuth flow (visit in browser)
- `GET /callback` — OAuth redirect target (handled automatically)
- `POST /sync` — manual sync trigger

### Sync behavior
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`JOBBER_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Jobber API gotchas
- **Token endpoint uses query params**, not form body: `POST /oauth/token?grant_type=...&code=...` (not JSON/form body)
- **`X-JOBBER-GRAPHQL-VERSION` header required** on all GraphQL requests (use `2023-11-15`)
- **Date filter field is `after`/`before`**, not `gt`/`lt`: `{ updatedAt: { after: "..." } }`
- **Do NOT add redirect URI in the Jobber dashboard** — localhost is automatic; adding it causes an error

---

## Salesforce Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":1}`).

### One-time OAuth setup
1. In Salesforce Setup → **New External Client App** (NOT New Lightning App)
   - Enable OAuth Settings
   - Callback URLs: `http://localhost:9004/callback` (local) + `https://<your-host>/callback` (production). Set `SALESFORCE_REDIRECT_URI` in env vars.
   - Scopes: `Manage user data via APIs (api)` + `Perform requests at any time (refresh_token, offline_access)`
2. Copy **Consumer Key** → `SALESFORCE_CLIENT_ID` in `.env`
3. Copy **Consumer Secret** → `SALESFORCE_CLIENT_SECRET` in `.env`
4. Create a Niche app with all scopes checked → `NICHE_SALESFORCE_CLIENT_ID` / `NICHE_SALESFORCE_CLIENT_SECRET` in `.env`
5. Build and start: `pnpm build:salesforce && pnpm start:salesforce`
6. Visit `http://localhost:9004/auth` in browser → approve in Salesforce
7. Trigger initial sync: `curl -X POST http://localhost:9004/sync`

### Routes
- `GET /health` — status check
- `GET /auth` — start OAuth flow (visit in browser)
- `GET /callback` — OAuth redirect target (handled automatically)
- `POST /sync` — manual sync trigger

### Sync behavior
- Syncs both **Leads** and **Contacts** from Salesforce
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`SALESFORCE_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Salesforce gotchas
- **Use "New External Client App"**, not "New Connected App" or "New Lightning App" — External Client Apps are the modern equivalent in Salesforce Lightning UI
- **PKCE is required** for External Client Apps — our `auth.ts` generates `code_verifier`/`code_challenge` automatically using `S256` method. Without PKCE you get `error=invalid_request&error_description=missing%20required%20code%20challenge`
- **Token exchange uses form-encoded body** (`application/x-www-form-urlencoded`), not JSON
- **`instance_url` in token response** is the base URL for all REST API calls — don't hardcode the Salesforce domain
- **SOQL datetime filter** uses ISO 8601 format directly without quotes: `WHERE LastModifiedDate > 2026-03-12T00:00:00.000Z`
- **Salesforce reuses refresh tokens** — don't replace the refresh token on each refresh, only the access token changes
- After creating a test lead, **edit it** (bump `LastModifiedDate`) if dedup is blocking it on retry

---

## Zoho CRM Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":20}`).

### One-time OAuth setup
1. Sign up for **Zoho CRM Developer Edition** (free, no expiry) at `https://www.zoho.com/crm/developer/developer-edition.html`
2. Go to `https://api-console.zoho.com/` → **Add Client** → **Server Based Applications**
3. Set Authorized Redirect URIs: `http://localhost:9005/callback` (local) + `https://<your-host>/callback` (production). Set `ZOHO_REDIRECT_URI` in env vars.
4. Copy **Consumer Key** → `ZOHO_CLIENT_ID` in `.env`
5. Copy **Consumer Secret** → `ZOHO_CLIENT_SECRET` in `.env`
6. Create a Niche app with all scopes → `NICHE_ZOHO_CRM_CLIENT_ID` / `NICHE_ZOHO_CRM_CLIENT_SECRET` in `.env`
7. Build and start: `pnpm build:zoho-crm && pnpm start:zoho-crm`
8. Visit `http://localhost:9005/auth` in browser → approve in Zoho
9. Trigger initial sync: `curl -X POST http://localhost:9005/sync`

### Routes
- `GET /health` — status check
- `GET /auth` — start OAuth flow (visit in browser)
- `GET /callback` — OAuth redirect target (handled automatically)
- `POST /sync` — manual sync trigger

### Sync behavior
- Syncs both **Leads** and **Contacts** from Zoho CRM
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`ZOHO_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Zoho CRM gotchas
- **Zoho returns 204 (no content) when search has zero results** — handle as empty list, not an error
- **Token exchange and refresh use form-encoded body** (`application/x-www-form-urlencoded`)
- **`access_type=offline` + `prompt=consent` required** in the auth URL to get a refresh token
- **Zoho does not rotate refresh tokens** on access token refresh — preserve the original refresh token
- **API data center matters**: US accounts use `accounts.zoho.com` / `www.zohoapis.com`; EU/IN/AU/JP use different domains. Code is hardcoded to US.
- **Search API**: uses `GET /Leads/search?criteria=(Modified_Time:greater_than:<ISO>)` — note the `+00:00` timezone suffix format

---

## Freshsales Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":11}`).

### Setup (no OAuth — API key only)
1. Sign up for **Freshsales free plan** at `https://www.freshworks.com/crm/signup/`
2. Inside Freshsales CRM, click your **avatar (bottom-left)** → **Profile Settings** → scroll down to **Your API Key**
   - **Do NOT use Admin Settings** — the API key must come from Profile Settings within the CRM product
3. Copy the API key → `FRESHSALES_API_KEY` in `.env`
4. Set `FRESHSALES_DOMAIN` to just the subdomain (e.g. `facetbuildllc` from `facetbuildllc.myfreshworks.com`)
5. Create a Niche app with all scopes → `NICHE_FRESHSALES_CLIENT_ID` / `NICHE_FRESHSALES_CLIENT_SECRET` in `.env`
6. Build and start: `pnpm build:freshsales && pnpm start:freshsales`
7. Trigger sync: `curl -X POST http://localhost:9006/sync`

### Routes
- `GET /health` — status check
- `POST /sync` — manual sync trigger (no auth flow needed)

### Sync behavior
- Syncs **Contacts** (and Leads if plan supports it) from Freshsales
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`FRESHSALES_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Freshsales gotchas
- **Listing requires a view ID** — you cannot call `GET /contacts` directly; must use `GET /contacts/view/{view_id}`. The code auto-discovers the view ID by calling `GET /contacts/filters` first.
- **Free plan does not include the Leads module** — `/leads` returns 403; handled gracefully (skipped with a warning)
- **API key is per-user and per-product** — must be from Freshsales CRM Profile Settings, not from Freshdesk, Freshchat, Freshcaller, or Admin Settings
- **Domain normalization**: code accepts the full URL, just the host, or just the subdomain — all are handled
- **Sort descending** to efficiently stop pagination once records fall outside the lookback window

---

## Close CRM Integration

**Status:** Complete and confirmed working.

### Setup (no OAuth — API key only)
1. Request a free developer org: email `support@close.com`, subject "Developer sandbox request"
2. In Close: **Settings → API Keys** → Generate Key
3. Copy the API key → `CLOSE_CRM_API_KEY` in `.env`
4. Create a Niche app with all scopes → `NICHE_CLOSE_CRM_CLIENT_ID` / `NICHE_CLOSE_CRM_CLIENT_SECRET` in `.env`
5. Build and start: `pnpm build:close-crm && pnpm start:close-crm`
6. Trigger sync: `curl -X POST http://localhost:9008/sync`

### Routes
- `GET /health` — status check
- `POST /sync` — manual sync trigger (no auth flow needed)

### Sync behavior
- Syncs **Leads** (with embedded contact name/phone/email) from Close CRM
- Close embeds contact details inside the lead object — no separate contact fetch needed
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`CLOSE_CRM_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Close CRM gotchas
- **Auth is HTTP Basic** — API key as username, empty string as password. Header: `Authorization: Basic base64(<key>:)`
- **Lead query syntax**: `query=updated > "2026-01-01T00:00:00Z"` — note quotes around the datetime
- **Cursor-based pagination**: use `_cursor` param from `response.cursor` for next page; stop when `has_more` is false
- **Contacts are embedded** in the lead response under `contacts[]` — use the first contact for name/phone/email
- **`_fields` parameter** limits the response to only what we need: `id,display_name,contacts,date_updated,date_created`

---

## ActiveCampaign Integration

**Status:** Complete and confirmed working.

### Setup (no OAuth — API key only)
1. Sign up for a free 2-year dev sandbox at `https://developers.activecampaign.com`
2. In the account, go to **Settings → Developer**
3. Copy the **API URL** (e.g. `https://youraccountname.api-us1.com`) → `ACTIVECAMPAIGN_BASE_URL` in `.env`
4. Copy the **API Key** → `ACTIVECAMPAIGN_API_KEY` in `.env`
5. Create a Niche app with all scopes → `NICHE_ACTIVECAMPAIGN_CLIENT_ID` / `NICHE_ACTIVECAMPAIGN_CLIENT_SECRET` in `.env`
6. Build and start: `pnpm build:activecampaign && pnpm start:activecampaign`
7. Trigger sync: `curl -X POST http://localhost:9010/sync`

### Routes
- `GET /health` — status check
- `POST /sync` — manual sync trigger (no auth flow needed)

### Sync behavior
- Syncs **Contacts** from ActiveCampaign
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`ACTIVECAMPAIGN_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical ActiveCampaign gotchas
- **Auth header is `Api-Token`** (not `Authorization`): `{ 'Api-Token': '<api_key>' }`
- **Base URL includes the account subdomain** — it's in Settings → Developer, e.g. `https://yourname.api-us1.com`
- **Filter by date**: `GET /api/3/contacts?updated_after=<ISO>&limit=100&offset=<n>`
- **Pagination via `offset`** — increment by `limit` while `contacts.length === limit`
- **Registration form category**: select "Deals & CRM" (contacts isn't a standalone option)

---

## Pipedrive Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":1}`).

### Setup (no OAuth — personal API token)
1. In Pipedrive: **Settings → Personal preferences → API** → copy the token
2. Copy token → `PIPEDRIVE_API_TOKEN` in `.env`
3. Create a Niche app with all scopes → `NICHE_PIPEDRIVE_CLIENT_ID` / `NICHE_PIPEDRIVE_CLIENT_SECRET` in `.env`
4. Build and start: `pnpm build:pipedrive && pnpm start:pipedrive`
5. Trigger initial sync: `curl -X POST http://localhost:9011/sync`

### Routes
- `GET /health` — status check
- `POST /sync` — manual sync trigger (no auth flow needed)

### Sync behavior
- Syncs **Persons** from Pipedrive (persons = contacts with phone + email)
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`PIPEDRIVE_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL

### Critical Pipedrive gotchas
- **Personal API token, not OAuth** — token passed as `api_token` query param on all requests. Never expires unless manually regenerated.
- **API base**: `https://api.pipedrive.com/v1` — no company-specific domain needed for personal token auth
- **Phone/email are arrays**: `phone: [{ value, primary }]` and `email: [{ value, primary }]` — pick the `primary: true` entry, fall back to first
- **Pagination**: `additional_data.pagination.more_items_in_collection` signals more pages; use `start` offset param

---

## Microsoft Dynamics 365 Integration

**Status:** Complete — submitted as-is. Requires Azure app registration + a Dynamics environment to activate (see setup steps below).

### Setup (one-time)
1. **Get a Dynamics environment:** Sign up for Power Apps Developer Plan at `https://aka.ms/PowerAppsDevPlan` (free, provisions a full Dynamics 365 instance)
2. **Register an Azure app:**
   - Azure Portal → Microsoft Entra ID → App registrations → New registration
   - Name: "Niche Integration", Supported account types: "Single tenant", no redirect URI
   - Copy **Directory (tenant) ID** → `DYNAMICS_TENANT_ID` in `.env`
   - Copy **Application (client) ID** → `DYNAMICS_CLIENT_ID` in `.env`
   - Certificates & secrets → New client secret → copy value → `DYNAMICS_CLIENT_SECRET` in `.env`
3. **Grant API permissions:**
   - API permissions → Add permission → APIs my organization uses → search "Dynamics CRM"
   - Select **Application permissions** → `user_impersonation`
   - Click **Grant admin consent**
4. **Create an Application User in Dynamics:**
   - Dynamics admin center → Environments → your env → Settings → Users + permissions → Application users → New
   - Set Application ID to your Azure client ID
   - Assign security role: **System Administrator**
5. Set `DYNAMICS_INSTANCE_URL` to your environment URL (e.g. `https://yourorg.crm.dynamics.com`) in `.env`
6. Create a Niche app with all scopes → `NICHE_DYNAMICS365_CLIENT_ID` / `NICHE_DYNAMICS365_CLIENT_SECRET` in `.env`
7. Build and start: `pnpm build:dynamics365 && pnpm start:dynamics365`
8. Trigger sync: `curl -X POST http://localhost:9007/sync`

### Routes
- `GET /health` — status check
- `POST /sync` — manual sync trigger (no auth flow needed — client credentials)

### Sync behavior
- Syncs both **Leads** and **Contacts** from Dynamics 365 (parallel fetch)
- Nightly sync auto-schedules at midnight local time
- Default lookback: 25 hours (`DYNAMICS_SYNC_LOOKBACK_HOURS`)
- In-memory dedup with 24-hour TTL, keyed as `lead:<id>` / `contact:<id>`

### Critical Dynamics 365 gotchas
- **Client credentials, not auth code** — no browser redirect; token obtained server-side via `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- **Scope is `{instanceUrl}/.default`** — must exactly match your Dynamics instance URL (e.g. `https://yourorg.crm.dynamics.com/.default`)
- **Application User is required** — registering in Azure alone is not enough; you must also create an Application User inside Dynamics and assign a security role. Without this, API calls return 401.
- **OData headers required**: `OData-MaxVersion: 4.0`, `OData-Version: 4.0`
- **Pagination via `@odata.nextLink`** — follow the full URL in each response; stop when absent
- **Date filter format**: `$filter=modifiedon gt 2026-03-28T00:00:00.000Z` (ISO 8601, no quotes)
- **Phone fields**: `mobilephone` preferred over `telephone1`; both may be absent

---

## Skipped / Blocked Integrations

Integrations that were researched but not built — see `BLOCKERS.md` for full details.

- **Housecall Pro** — requires MAX plan (~$329/mo) for API access
- **Angi (HomeAdvisor)** — no self-service path; requires active contractor account + manual setup by Angi support
- **Google Local Services Ads** — requires active LSA advertiser account + business verification; no sandbox
- **CompanyCam** — API does not expose customer phone or email; cannot construct a valid Niche lead
- **LeadPerfection** — inbound-only API; no way to read leads out
- **ServiceTitan** — closed developer program; application required
- **JobNimbus** — no self-serve sandbox; removed from submission
- **MarketSharp** — no self-serve API access; removed from submission

---

## Testing

**Test runner:** Vitest (installed at workspace root via `pnpm add -D vitest -w`)
**Config:** `vitest.config.ts` at repo root — resolves `@niche-integrations/core` to `packages/core/src/index.ts` so tests don't require a build step. Includes all `packages/*/src/**/*.test.ts` files.

```bash
pnpm test          # run all tests once (vitest run)
pnpm test:watch    # watch mode (vitest)
```

### What's tested (203 tests, 20 files)

**Unit tests — transformers (10 files):** Pure function tests, no mocking, no network.

| File | Covered behaviors |
|---|---|
| `packages/jobber/src/transformer.test.ts` | Name from first/last/company, phone primary/fallback/formatting, info fields |
| `packages/salesforce/src/transformer.test.ts` | Lead + contact transforms, MobilePhone fallback, optional field omission |
| `packages/zoho-crm/src/transformer.test.ts` | Lead + contact transforms, Mobile fallback |
| `packages/freshsales/src/transformer.test.ts` | Contact + lead, display_name fallback, work_number fallback, company omission |
| `packages/facebook-leads/src/transformer.test.ts` | first_name/firstname variants, full_name/name fallback, phone extraction, info label capitalization, field exclusion |
| `packages/hubspot/src/transformer.test.ts` | Contact transform, deal transform with/without associated contact, mobilephone fallback |
| `packages/activecampaign/src/transformer.test.ts` | firstName/lastName, phone normalization, email in info, Contact ID |
| `packages/close-crm/src/transformer.test.ts` | Contact name from embedded contact, display_name fallback, phone/email from contact, Lead+Contact IDs |
| `packages/pipedrive/src/transformer.test.ts` | Person name, primary phone/email selection, fallback to first non-primary, org_name |

**Phone normalization** is tested consistently across all integrations: 10-digit → `+1NNNN`, 11-digit starting with `1` → `+1NNNN`, formatted strings (parens/dashes) → normalized, international (UK etc.) → passed through as-is.

**Integration tests — HTTP routes (10 files):** Supertest against Express app, NicheClient and platform API calls mocked.

| File | Covered behaviors |
|---|---|
| `packages/facebook-leads/src/index.test.ts` | Health, GET /webhook token verification, POST /webhook signature (valid/invalid/missing), async lead created, dedup skips repeat leadgen_id |
| `packages/hubspot/src/index.test.ts` | Health, POST /webhook signature (valid/invalid/missing), POST /sync 401 when no access token |
| `packages/jobber/src/index.test.ts` | Health, POST /sync 401 when no OAuth tokens, GET /auth redirects to Jobber |
| `packages/salesforce/src/index.test.ts` | Health, POST /sync 401 when no OAuth tokens, GET /auth redirects to Salesforce |
| `packages/zoho-crm/src/index.test.ts` | Health, POST /sync 401 when no OAuth tokens, GET /auth redirects to Zoho |
| `packages/freshsales/src/index.test.ts` | Health, POST /sync 500 when API key/domain not configured |
| `packages/activecampaign/src/index.test.ts` | Health, POST /sync 500 when API key/base URL not configured |
| `packages/close-crm/src/index.test.ts` | Health, POST /sync 500 when API key not configured |
| `packages/pipedrive/src/index.test.ts` | Health, POST /sync 500 when API token not configured |

**Mocking pattern for integration tests:** `vi.hoisted()` sets env vars before module load (prevents dotenv from leaking real credentials), `vi.mock('dotenv')` prevents `.env` file loading, `vi.mock('@niche-integrations/core')` mocks `NicheClient` as a class with spy methods.

### Adding new tests

Unit test files live alongside source: `packages/<name>/src/transformer.test.ts`.
Integration test files: `packages/<name>/src/index.test.ts`.
No per-package config needed — the root `vitest.config.ts` picks them up automatically.

---

## Running the Node.js integrations

```bash
# Build + start individual integrations
pnpm build:jobber && pnpm start:jobber                  # port 9003
pnpm build:salesforce && pnpm start:salesforce          # port 9004
pnpm build:zoho-crm && pnpm start:zoho-crm              # port 9005
pnpm build:freshsales && pnpm start:freshsales          # port 9006
pnpm build:close-crm && pnpm start:close-crm            # port 9008
pnpm build:activecampaign && pnpm start:activecampaign  # port 9010
pnpm build:pipedrive && pnpm start:pipedrive            # port 9011
pnpm build:hubspot && pnpm start:hubspot                # port 7777

# or all at once:
pnpm start:all
```

pnpm is at `/opt/homebrew/bin/pnpm` — add to PATH if not found.

## Niche App Configuration Checklist

When creating a new Niche app for any integration:
1. Go to Niche dashboard → Developer / Integrations
2. Create new app, name it (e.g. "WordPress", "HubSpot")
3. **Check ALL required scopes before saving**: `leads:write`, `leads:read`, `businesses:read`, `businesses:write`
4. Copy the `client_id` and `client_secret` into `.env`
5. Test with the curl commands above before wiring into the integration code
