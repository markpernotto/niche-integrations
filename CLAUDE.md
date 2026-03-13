# Niche Integrations — Project Context for Claude

## What This Project Is

A monorepo of integrations for the **Niche Partner API** (`https://app.nicheandleads.com/api/partner/v1/`).
Goal: win the Niche Integration Competition (deadline March 30, 2026 — $1,000 per qualifying integration).

Integrations built:
- **WordPress** — PHP plugin, direct API calls from WP (no relay server needed)
- **Facebook Lead Ads** — Node.js Express webhook server (port 6666)
- **HubSpot** — Node.js Express webhook server (port 7777) — webhook relay + polling (paused, someone else has this)
- **Jobber** — Node.js Express server (port 9003) — OAuth 2.0 + GraphQL polling, confirmed working end-to-end
- **Salesforce** — Node.js Express server (port 9004) — OAuth 2.0 + PKCE + REST API polling, confirmed working end-to-end

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
    src/index.ts                     # Express webhook server + polling, port 7777
  jobber/
    src/index.ts                     # Express server — OAuth flow + GraphQL polling, port 9003
    src/auth.ts                      # Jobber OAuth 2.0 token management
    src/transformer.ts               # JobberClient → Niche lead
    src/types.ts                     # Jobber type definitions
  jobnimbus/
    src/index.ts                     # Webhook receiver, port 8888 (scaffolded, needs account)
  marketsharp/
    src/index.ts                     # Polling server, port 9001 (scaffolded, needs account)
  salesforce/
    src/index.ts                     # Express server — OAuth 2.0 + PKCE + REST API polling, port 9004
    src/auth.ts                      # Salesforce OAuth 2.0 + PKCE token management
    src/transformer.ts               # SalesforceLead/Contact → Niche lead
    src/types.ts                     # Salesforce type definitions
  core/
    src/credentials.ts               # Shared OAuth credential helpers
    scripts/test-auth.js             # Manual API test script
```

---

## Jobber Integration

**Status:** Complete and confirmed working (`{"ok":true,"synced":1}`).

### One-time OAuth setup
1. Create a Jobber developer account at [developer.getjobber.com](https://developer.getjobber.com) — **must be a different email** than your Jobber customer account
2. Create an app — do **NOT** add a redirect URI (localhost is supported automatically and must not be listed)
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
   - Callback URL: `http://localhost:9004/callback`
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

## Pending Work

- **JobNimbus** — code scaffolded (`packages/jobnimbus/`), waiting on account access
- **MarketSharp** — code scaffolded (`packages/marketsharp/`), needs sales demo / account
- **HubSpot** — paused (someone else has it); polling + deals code is in place if we revisit
- **Housecall Pro** — not started; MED difficulty, similar pattern to Jobber
- **ServiceTitan** — not started; apply to developer program at developer.servicetitan.io

---

## Running the Node.js integrations

```bash
# Build + start individual integrations
pnpm build:jobber && pnpm start:jobber          # port 9003
pnpm build:salesforce && pnpm start:salesforce  # port 9004
pnpm build:hubspot && pnpm start:hubspot        # port 7777

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
