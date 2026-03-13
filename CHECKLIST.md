# Niche Integration Competition — Master Checklist

**Deadline:** March 30, 2026 — $1,000 per qualifying integration
**Goal:** As many confirmed working integrations as possible

---

## Competition Context

| Person | Integration | Status |
|---|---|---|
| Us | Everything below | See sections |
| Competitor | HubSpot | In progress — do not pursue unless they drop it |
| Competitor | Zapier | In progress — do not pursue |
| Unknown | WordPress | Claimed? — **assume we're submitting ours if unclaimed** |

---

## ✅ Code Complete — Needs Railway Deploy + Final Verification

These are confirmed working locally. Each needs a Railway service + production OAuth re-auth.

### 1. WordPress
- **Type:** PHP plugin (no server — installed directly in WP)
- **Code:** `packages/wordpress/plugin/niche-lead-capture.php`
- **Local test:** Confirmed working
- **Railway:** N/A — plugin is installed in WP, not deployed as a service
- **Remaining:**
  - [ ] WordPress plugin installed and active on a live WP site
  - [ ] Niche credentials configured in WP Admin → Settings → Niche Lead Capture
  - [ ] Test: submit a Contact Form 7 form → verify lead in Niche dashboard
  - [ ] **Submit to competition**
- **Notes:** Credentials stored in WP database (wp_options), NOT .env

---

### 2. Facebook Lead Ads
- **Type:** Webhook receiver (port 6666)
- **Code:** `packages/facebook-leads/`
- **Local test:** Confirmed working
- **Railway:** ✅ Online (`@niche-integrations/fa...`)
- **Remaining:**
  - [ ] FB App Dashboard → Webhooks → confirm callback URL points to Railway URL
  - [ ] Verify page subscription still active (Lead Ads Testing Tool)
  - [ ] Test: create lead in Lead Ads Testing Tool → verify in Niche dashboard
  - [ ] **Submit to competition**
- **Notes:** `FACEBOOK_ACCESS_TOKEN` expires — regenerate via Graph API Explorer if leads stop working

---

### 3. Jobber
- **Type:** OAuth 2.0 + GraphQL polling (port 9003)
- **Code:** `packages/jobber/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)
- **Railway:** ✅ Online (`@niche-integrations/jo...`)
- **Remaining:**
  - [ ] Jobber Developer Portal → confirm Railway callback URL is in allowed redirect URIs
  - [ ] Visit `https://<railway-url>/auth` → approve Jobber OAuth (if not already done)
  - [ ] Test: `POST https://<railway-url>/sync` → verify in Niche dashboard
  - [ ] **Submit to competition**

---

### 4. Salesforce
- **Type:** OAuth 2.0 + PKCE + REST API polling (port 9004)
- **Code:** `packages/salesforce/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)
- **Railway:** ✅ Online (`@niche-integrations/sal...`)
- **Remaining:**
  - [ ] Salesforce → External Client App → confirm Railway callback URL is added
  - [ ] Visit `https://<railway-url>/auth` → approve Salesforce OAuth (if not already done)
  - [ ] Test: `POST https://<railway-url>/sync` → verify in Niche dashboard
  - [ ] **Submit to competition**

---

### 5. Zoho CRM
- **Type:** OAuth 2.0 + REST API polling (port 9005)
- **Code:** `packages/zoho-crm/`
- **Local test:** Confirmed working (`{"ok":true,"synced":20}`)
- **Railway:** ✅ Online (`@niche-integrations/zo...`)
- **Remaining:**
  - [ ] Zoho API Console → confirm Railway callback URL is added as authorized redirect URI
  - [ ] Visit `https://<railway-url>/auth` → approve Zoho OAuth (if not already done)
  - [ ] Test: `POST https://<railway-url>/sync` → verify in Niche dashboard
  - [ ] **Submit to competition**

---

### 6. Freshsales
- **Type:** API key auth + REST API polling (port 9006)
- **Code:** `packages/freshsales/`
- **Local test:** Confirmed working (`{"ok":true,"synced":11}`)
- **Railway:** ✅ Online (`@niche-integrations/fre...`)
- **Remaining:**
  - [ ] Test: `POST https://<railway-url>/sync` → verify in Niche dashboard
  - [ ] **Submit to competition**
- **Notes:** No OAuth — API key only, no re-auth needed

---

## 🏗️ Scaffolded — Code Exists, Blocked on Account Access

### JobNimbus
- **Code:** `packages/jobnimbus/` (webhook receiver scaffolded)
- **Blocker:** Need a JobNimbus account to test
- **What's left:** Get account access → wire up actual webhook payload format → test
- **Priority:** Medium — if you can get a free trial or demo account, this is close

### MarketSharp
- **Code:** `packages/marketsharp/` (polling server scaffolded)
- **Blocker:** Requires sales demo / paid account — no self-serve signup
- **What's left:** Account access → verify API endpoints → test
- **Priority:** Low — hard to get access quickly

---

## 🏗️ Code Complete — Needs Account + Credentials + Railway Deploy

### 7. Close CRM (Port 9008)
- **Type:** API key auth + REST API polling
- **Code:** `packages/close-crm/`
- **Remaining:**
  - [ ] Email `support@close.com` requesting a free developer org
  - [ ] In Close: Settings → API Keys → generate key → `CLOSE_CRM_API_KEY` in .env
  - [ ] Create Niche app → `NICHE_CLOSE_CRM_CLIENT_ID` / `_CLIENT_SECRET`
  - [ ] `pnpm build:close-crm && pnpm start:close-crm` → `POST /sync` → verify in Niche
  - [ ] Deploy to Railway → verify production sync
  - [ ] **Submit to competition**

### 8. Keap / Infusionsoft (Port 9009)
- **Type:** OAuth 2.0 + REST API polling
- **Code:** `packages/keap/`
- **Remaining:**
  - [ ] Sign up for sandbox at `https://developer.infusionsoft.com` → Create App
  - [ ] Set redirect URI: `http://localhost:9009/callback`
  - [ ] `KEAP_CLIENT_ID` / `KEAP_CLIENT_SECRET` in .env
  - [ ] Create Niche app → `NICHE_KEAP_CLIENT_ID` / `_CLIENT_SECRET`
  - [ ] `pnpm build:keap && pnpm start:keap` → visit `/auth` → `POST /sync` → verify
  - [ ] Deploy to Railway → re-auth with Railway URL → verify production sync
  - [ ] **Submit to competition**

### 9. ActiveCampaign (Port 9010)
- **Type:** API key auth + REST API polling
- **Code:** `packages/activecampaign/`
- **Remaining:**
  - [ ] Sign up for free 2-year dev sandbox at `https://developers.activecampaign.com`
  - [ ] Settings → Developer → copy API Key + API URL
  - [ ] `ACTIVECAMPAIGN_API_KEY` + `ACTIVECAMPAIGN_BASE_URL` in .env
  - [ ] Create Niche app → `NICHE_ACTIVECAMPAIGN_CLIENT_ID` / `_CLIENT_SECRET`
  - [ ] `pnpm build:activecampaign && pnpm start:activecampaign` → `POST /sync` → verify
  - [ ] Deploy to Railway → verify production sync
  - [ ] **Submit to competition**

### 10. Pipedrive (Port 9011)
- **Type:** OAuth 2.0 + REST API polling
- **Code:** `packages/pipedrive/`
- **Remaining:**
  - [ ] Sign up for developer sandbox at `https://pipedrive.com/developer-sandbox-sign-up`
  - [ ] Developer hub → create app → set callback URL to `http://localhost:9011/callback`
  - [ ] `PIPEDRIVE_CLIENT_ID` / `PIPEDRIVE_CLIENT_SECRET` in .env
  - [ ] Create Niche app → `NICHE_PIPEDRIVE_CLIENT_ID` / `_CLIENT_SECRET`
  - [ ] `pnpm build:pipedrive && pnpm start:pipedrive` → visit `/auth` → `POST /sync` → verify
  - [ ] Deploy to Railway → re-auth with Railway URL → verify production sync
  - [ ] **Submit to competition**

---

## 🔨 Ready to Build — Needs Account First

### Priority 1: Microsoft Dynamics 365 (Port 9007)
- **Difficulty:** Hard
- **Account:** Free Power Apps Developer Plan → `https://aka.ms/PowerAppsDevPlan`
- **Auth:** OAuth 2.0 client credentials via Microsoft Entra ID (Azure AD app registration required)
- **API:** OData v4 REST — `GET /api/data/v9.2/leads?$filter=modifiedon gt <timestamp>`
- **Phone/email:** Yes — `telephone1`, `mobilephone`, `emailaddress1` on both leads and contacts
- **Pattern:** Same polling pattern as Jobber/Salesforce
- **Why first:** Large enterprise user base, strong competition submission

---

## 🚫 Blocked / Skipped — Do Not Pursue

| Integration | Reason |
|---|---|
| **HubSpot** | Someone else is building it — don't duplicate effort |
| **Zapier** | Someone else is building it |
| **Housecall Pro** | API requires MAX plan ($329/mo) — not worth it unless you're already on that plan |
| **Angi (HomeAdvisor)** | Requires active contractor account + SPID + manual setup by Angi CRM team. No sandbox, no self-serve. Inbound-only webhooks. |
| **Google Local Services Ads** | Requires active LSA advertiser account + business verification. No sandbox. |
| **CompanyCam** | API does not expose customer phone or email — cannot create valid Niche leads |
| **LeadPerfection** | No public read API (inbound POST only). No free sandbox. Needs paid account + vendor cooperation. |
| **MarketSharp** | No self-serve access — requires sales demo + paid account |
| **ServiceTitan** | Apply to developer program at developer.servicetitan.io — no immediate path |

---

## 📊 Score Tracker

| # | Integration | Code | Local Test | Railway | Submitted |
|---|---|---|---|---|---|
| 1 | WordPress | ✅ | ✅ | N/A | ⬜ |
| 2 | Facebook Lead Ads | ✅ | ✅ | ✅ Online | ⬜ |
| 3 | Jobber | ✅ | ✅ | ✅ Online | ⬜ |
| 4 | Salesforce | ✅ | ✅ | ✅ Online | ⬜ |
| 5 | Zoho CRM | ✅ | ✅ | ✅ Online | ⬜ |
| 6 | Freshsales | ✅ | ✅ | ✅ Online | ⬜ |
| 7 | Close CRM | ✅ | ⬜ | ⬜ | ⬜ |
| 8 | Keap | ✅ | ⬜ | ⬜ | ⬜ |
| 9 | ActiveCampaign | ✅ | ⬜ | ⬜ | ⬜ |
| 10 | Pipedrive | ✅ | ⬜ | ⬜ | ⬜ |
| 11 | Microsoft Dynamics 365 | ⬜ | ⬜ | ⬜ | ⬜ |
| — | HubSpot | ✅ (partial) | ⬜ | ⬜ | 🚫 (someone else) |
| — | JobNimbus | 🚧 | ⬜ | ⬜ | ⬜ (blocked) |

**Potential max payout: $11,000** (if all 11 qualify)
**Code written: 10 of 11** — 5 Railway-verified, 4 need account signup + test, 1 not started (Dynamics)

---

## 🚀 Immediate Next Actions

1. **Production-verify the 5 Railway services** — visit each `/auth` URL to re-auth, then `POST /sync`, confirm lead in Niche dashboard. Do this ASAP.
2. **Get accounts for the 4 new integrations** (code is ready, just need credentials):
   - **Close CRM**: Email `support@close.com` — ask for free developer org
   - **ActiveCampaign**: Sign up at `https://developers.activecampaign.com` (instant)
   - **Keap**: Sign up at `https://developer.infusionsoft.com` (instant)
   - **Pipedrive**: Sign up at `https://pipedrive.com/developer-sandbox-sign-up` (instant)
3. **For each new integration**: add env vars to `.env`, create Niche app, run `pnpm build:<name> && pnpm start:<name>`, trigger `POST /sync`, verify lead in Niche, deploy to Railway.
4. **Submit all verified integrations to the competition.**
5. **Sign up for Power Apps Developer Plan** and tackle Microsoft Dynamics 365 last (it's the hardest).
