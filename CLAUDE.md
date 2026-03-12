# Niche Integrations — Project Context for Claude

## What This Project Is

A monorepo of integrations for the **Niche Partner API** (`https://app.nicheandleads.com/api/partner/v1/`).
Goal: win the Niche Integration Competition (deadline March 30, 2026 — $1,000 per qualifying integration).

Integrations built:
- **WordPress** — PHP plugin, direct API calls from WP (no relay server needed)
- **Facebook Lead Ads** — Node.js Express webhook server (port 6666)
- **HubSpot** — Node.js Express webhook server (port 7777)

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
    src/index.ts                     # Express webhook server, port 7777
  core/
    src/credentials.ts               # Shared OAuth credential helpers
    scripts/test-auth.js             # Manual API test script
```

## Pending Work

- **HubSpot** — integration needs to be tested and cleaned up (next session)

---

## Running the Node.js integrations

```bash
pnpm build:hubspot
pnpm start:hubspot    # port 7777

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
