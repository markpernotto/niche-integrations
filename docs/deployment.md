# Deployment Guide — Niche Integrations

## Overview

Each integration is a separate Node.js Express server deployed as its own Railway service.
All services share the same GitHub repo — Railway rebuilds a service automatically on every push to `main`.

---

## Railway Service Settings (one-time setup per service)

| Setting | Value |
|---|---|
| **Root Directory** | `/` (repo root — required for pnpm workspace) |
| **Build Command** | `pnpm install --frozen-lockfile && pnpm build:<service>` |
| **Start Command** | `node packages/<service>/dist/index.js` |

### Per-service commands

| Service | Build Command | Start Command |
|---|---|---|
| facebook-leads | `pnpm install --frozen-lockfile && pnpm build:facebook-leads` | `node packages/facebook-leads/dist/index.js` |
| jobber | `pnpm install --frozen-lockfile && pnpm build:jobber` | `node packages/jobber/dist/index.js` |
| zoho-crm | `pnpm install --frozen-lockfile && pnpm build:zoho-crm` | `node packages/zoho-crm/dist/index.js` |
| freshsales | `pnpm install --frozen-lockfile && pnpm build:freshsales` | `node packages/freshsales/dist/index.js` |
| salesforce | `pnpm install --frozen-lockfile && pnpm build:salesforce` | `node packages/salesforce/dist/index.js` |
| hubspot | `pnpm install --frozen-lockfile && pnpm build:hubspot` | `node packages/hubspot/dist/index.js` |
| jobnimbus | `pnpm install --frozen-lockfile && pnpm build:jobnimbus` | `node packages/jobnimbus/dist/index.js` |
| marketsharp | `pnpm install --frozen-lockfile && pnpm build:marketsharp` | `node packages/marketsharp/dist/index.js` |

---

## Environment Variables per Service

### Shared Niche vars (every service needs these)
```
NICHE_BUSINESS_ID=                  # Your test Niche business ID
NICHE_API_BASE_URL=https://app.nicheandleads.com
```

Each service also needs its own Niche OAuth app credentials (create a separate app in the
Niche dashboard for each integration, with all scopes checked):

```
NICHE_<SERVICE>_CLIENT_ID=
NICHE_<SERVICE>_CLIENT_SECRET=
```

Where `<SERVICE>` is: `FACEBOOK_LEADS`, `JOBBER`, `ZOHO_CRM`, `FRESHSALES`, `SALESFORCE`,
`HUBSPOT`, `JOBNIMBUS`, `MARKETSHARP`

### facebook-leads
```
NICHE_FACEBOOK_LEADS_CLIENT_ID=
NICHE_FACEBOOK_LEADS_CLIENT_SECRET=
FACEBOOK_APP_SECRET=
FACEBOOK_ACCESS_TOKEN=              # Expires — regenerate via Graph API Explorer if leads stop working
FACEBOOK_VERIFY_TOKEN=              # Any string you choose, must match what's set in FB App Dashboard
PAGE_ID_TO_BUSINESS_MAP=            # Optional: {"<page_id>":"<niche_business_id>"} for multi-page routing
                                    # Falls back to NICHE_BUSINESS_ID if not set
```

### jobber
```
NICHE_JOBBER_CLIENT_ID=
NICHE_JOBBER_CLIENT_SECRET=
JOBBER_CLIENT_ID=
JOBBER_CLIENT_SECRET=
JOBBER_REDIRECT_URI=https://<jobber-railway-url>/callback
```

### zoho-crm
```
NICHE_ZOHO_CRM_CLIENT_ID=
NICHE_ZOHO_CRM_CLIENT_SECRET=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REDIRECT_URI=https://<zoho-railway-url>/callback
```

### freshsales
```
NICHE_FRESHSALES_CLIENT_ID=
NICHE_FRESHSALES_CLIENT_SECRET=
FRESHSALES_API_KEY=
FRESHSALES_DOMAIN=                  # e.g. yourcompany.myfreshworks.com
```

### salesforce
```
NICHE_SALESFORCE_CLIENT_ID=
NICHE_SALESFORCE_CLIENT_SECRET=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
SALESFORCE_REDIRECT_URI=https://<salesforce-railway-url>/callback
```

### hubspot
```
NICHE_HUBSPOT_CLIENT_ID=
NICHE_HUBSPOT_CLIENT_SECRET=
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_CLIENT_SECRET=
```

---

## Post-Deploy Checklist

### All services — sanity check first
Hit the health endpoint before doing anything else. Should return `{"status":"ok",...}`.
```
GET https://<service-railway-url>/health
```

---

### facebook-leads (webhook-based)
- [ ] Facebook App Dashboard → Webhooks → update callback URL to `https://<fb-railway-url>/webhook`
- [ ] Verify your Facebook Page is still subscribed to the app (Lead Ads Testing Tool)
- [ ] **Test:** Create a test lead in the [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing)
- [ ] Verify lead appears in your Niche business dashboard

> **Note:** `FACEBOOK_ACCESS_TOKEN` expires periodically. If lead fetches fail with
> "Session has expired", regenerate via Graph API Explorer and update the Railway env var.

---

### jobber (OAuth)
- [ ] [Jobber Developer Portal](https://developer.getjobber.com) → your app → add `https://<jobber-railway-url>/callback` to allowed redirect URIs
- [ ] Set `JOBBER_REDIRECT_URI` in Railway env vars
- [ ] Visit `https://<jobber-railway-url>/auth` in browser → approve Jobber access
- [ ] **Test:** `POST https://<jobber-railway-url>/sync`
- [ ] Verify leads appear in your Niche business dashboard

---

### zoho-crm (OAuth)
- [ ] [Zoho API Console](https://api-console.zoho.com) → your app → add `https://<zoho-railway-url>/callback` as authorized redirect URI
- [ ] Set `ZOHO_REDIRECT_URI` in Railway env vars
- [ ] Visit `https://<zoho-railway-url>/auth` in browser → approve Zoho access
- [ ] **Test:** `POST https://<zoho-railway-url>/sync`
- [ ] Verify leads appear in your Niche business dashboard

---

### freshsales (API key — no OAuth)
- [ ] Env vars only — no URL registration needed
- [ ] **Test:** `POST https://<freshsales-railway-url>/sync`
- [ ] Verify leads appear in your Niche business dashboard

---

### salesforce (OAuth)
- [ ] Salesforce Setup → Apps → App Manager → your Connected App → add `https://<salesforce-railway-url>/callback` to Callback URLs
- [ ] Set `SALESFORCE_REDIRECT_URI` in Railway env vars
- [ ] Visit `https://<salesforce-railway-url>/auth` in browser → approve Salesforce access
- [ ] **Test:** `POST https://<salesforce-railway-url>/sync`
- [ ] Verify leads appear in your Niche business dashboard

---

### hubspot (webhook + polling)
- [ ] HubSpot → Settings → Integrations → Private Apps → Webhooks → update URL to `https://<hubspot-railway-url>/webhook`
- [ ] **Test webhook:** trigger a contact creation in HubSpot
- [ ] **Test manual sync:** `POST https://<hubspot-railway-url>/sync`
- [ ] Verify leads appear in your Niche business dashboard

---

## Niche App Setup Checklist (per integration)

Create a **separate** Niche app for each integration:

1. Niche dashboard → Developer / Integrations → New App
2. Name it (e.g. "Jobber Integration")
3. **Check ALL scope boxes before saving:** `leads:write`, `leads:read`, `businesses:read`, `businesses:write`
4. Copy `client_id` and `client_secret` into Railway env vars as `NICHE_<SERVICE>_CLIENT_ID` / `NICHE_<SERVICE>_CLIENT_SECRET`

> **Important:** Scopes cannot be added after the app is created. If you get a 403 scope error,
> create a new app — do not try to edit the existing one.

---

## Ongoing Deployments

No Railway interaction needed for normal code changes:

```
# Make changes locally
git add .
git commit -m "your message"
git push
# Railway auto-detects the push and redeploys all affected services
```
