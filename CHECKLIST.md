# Niche Integration Competition — Master Checklist

**Deadline:** March 30, 2026
**Submission:** GitHub repo

---

## Competition Context

| Person | Integration | Status |
|---|---|---|
| Us | Everything below | See sections |
| Competitor | HubSpot | Likely claimed — built ours anyway as backup |
| Competitor | Zapier | Claimed — do not pursue |
| Competitor | WordPress | Likely claimed — built ours anyway as backup |

---

## ✅ Confirmed Working — Ready to Submit

### 1. WordPress
- **Type:** PHP plugin (no server — installed directly in WP)
- **Code:** `packages/wordpress/plugin/niche-lead-capture.php`
- **Local test:** Confirmed working
- **Notes:** Credentials stored in WP database (wp_options), NOT .env. Likely claimed by another competitor.

---

### 2. Facebook Lead Ads
- **Type:** Webhook receiver (port 6666)
- **Code:** `packages/facebook-leads/`
- **Local test:** Confirmed working

---

### 3. Jobber
- **Type:** OAuth 2.0 + GraphQL polling (port 9003)
- **Code:** `packages/jobber/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)

---

### 4. Salesforce
- **Type:** OAuth 2.0 + PKCE + REST API polling (port 9004)
- **Code:** `packages/salesforce/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)

---

### 5. Zoho CRM
- **Type:** OAuth 2.0 + REST API polling (port 9005)
- **Code:** `packages/zoho-crm/`
- **Local test:** Confirmed working (`{"ok":true,"synced":20}`)

---

### 6. Freshsales
- **Type:** API key auth + REST API polling (port 9006)
- **Code:** `packages/freshsales/`
- **Local test:** Confirmed working (`{"ok":true,"synced":11}`)

---

### 7. Close CRM
- **Type:** API key auth + REST API polling (port 9008)
- **Code:** `packages/close-crm/`
- **Local test:** Confirmed working

---

### 8. ActiveCampaign
- **Type:** API key auth + REST API polling (port 9010)
- **Code:** `packages/activecampaign/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)

---

### 9. Pipedrive
- **Type:** Personal API token + REST API polling (port 9011)
- **Code:** `packages/pipedrive/`
- **Local test:** Confirmed working (`{"ok":true,"synced":1}`)

---

### 10. HubSpot
- **Type:** Niche → HubSpot outbound sync — Private app token + polling (port 7777)
- **Code:** `packages/hubspot/`
- **Local test:** Confirmed working (`{"ok":true,"leads":53,"calls":1}`)
- **Notes:** Syncs Niche leads → HubSpot Contacts + Deals. Syncs completed Niche calls → HubSpot Call engagements. Deduplicates contacts by phone/email. Closes deals when lead marked done. Likely claimed by another competitor — built ours anyway.

---

## 🚫 Blocked / Skipped

| Integration | Reason |
|---|---|
| **Zapier** | Claimed by another competitor |
| **Housecall Pro** | API requires MAX plan ($329/mo) |
| **Angi (HomeAdvisor)** | Requires active contractor account + manual setup by Angi team |
| **Google Local Services Ads** | Requires active advertiser account + business verification |
| **CompanyCam** | API does not expose customer phone or email |
| **LeadPerfection** | No public read API (inbound POST only) |
| **MarketSharp** | No self-serve access — requires sales demo + paid account |
| **ServiceTitan** | Must apply to developer program — no immediate path |
| **Sunbit / GreenSky / GoodLeap** | Financing platforms — merchant/partner API access only, no self-serve sandbox |
| **Siro** | HARD difficulty — requires Siro customer relationship |
| **Hover** | API access appears Enterprise-only; unclear if free trial grants developer access |

---

## 📊 Score Tracker

| # | Integration | Code | Local Test | Submitted |
|---|---|---|---|---|
| 1 | WordPress | ✅ | ✅ | ⬜ |
| 2 | Facebook Lead Ads | ✅ | ✅ | ⬜ |
| 3 | Jobber | ✅ | ✅ | ⬜ |
| 4 | Salesforce | ✅ | ✅ | ⬜ |
| 5 | Zoho CRM | ✅ | ✅ | ⬜ |
| 6 | Freshsales | ✅ | ✅ | ⬜ |
| 7 | Close CRM | ✅ | ✅ | ⬜ |
| 8 | ActiveCampaign | ✅ | ✅ | ⬜ |
| 9 | Pipedrive | ✅ | ✅ | ⬜ |
| 10 | HubSpot | ✅ | ✅ | ⬜ |
| 11 | Microsoft Dynamics 365 | ✅ | ✅ | ⬜ |

**11 integrations ready to submit.**
