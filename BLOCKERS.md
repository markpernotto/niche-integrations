# Integration Blockers

Integrations we investigated but could not complete, and why.

---

## Zapier
**Blocker:** Claimed by another competitor — not pursued.

Additionally, the Niche API has no webhook subscription management endpoints (`POST /v1/webhooks`, `DELETE /v1/webhooks`). Zapier's platform requires REST hooks (dynamic subscribe/unsubscribe) to work properly. The only way to build a Zapier integration against Niche today would be a polling trigger, which is a degraded experience and may not meet Zapier's certification requirements.

---

## JobNimbus
**Blocker:** No self-serve developer account.

JobNimbus does not offer a public sandbox or trial that grants API access. Developer access requires contacting their team and being an active customer or approved partner. We scaffolded the integration but removed it before submission.

---

## MarketSharp
**Blocker:** No self-serve API access — requires sales demo and a paid account.

MarketSharp is a contractor-focused CRM with no public developer portal. API credentials are only available to paying customers after onboarding. We scaffolded the integration but removed it before submission.

---

## Housecall Pro
**Blocker:** API access requires the MAX plan (~$329/month).

Housecall Pro's REST API is gated behind their highest-tier subscription. Lower plans (including free trials) do not include API access.

---

## Angi (HomeAdvisor)
**Blocker:** Requires an active Angi contractor account + manual setup by the Angi support team.

There is no self-service developer integration path. Obtaining a SPID and webhook subscription requires direct coordination with Angi. Not feasible without an active contractor relationship.

---

## Google Local Services Ads
**Blocker:** Requires an active LSA advertiser account and business verification.

The Google Local Services Ads API is not a public developer API — it requires a verified, active advertiser account in the LSA program. No sandbox or developer access exists outside of that.

---

## CompanyCam
**Blocker:** API does not expose customer phone or email.

CompanyCam's API is project/photo-focused. It exposes project details, photos, and company data but does not surface customer contact information (phone is required by the Niche lead schema). A valid Niche lead cannot be constructed from CompanyCam data.

---

## LeadPerfection
**Blocker:** No public read API.

LeadPerfection only supports inbound data (POST leads into their system). There is no endpoint to read leads or contacts out. A no-account, no-sandbox situation identical to MarketSharp.

---

## ServiceTitan
**Blocker:** Closed developer program — application required.

ServiceTitan requires applying to their developer program at `developer.servicetitan.io`. There is no immediate self-serve path to API credentials.

---

## Sunbit / GreenSky / GoodLeap
**Blocker:** Financing platform APIs — merchant/partner access only.

These are consumer financing platforms. Their APIs are designed for merchants and lending partners, not for reading customer lead data. No self-serve developer sandbox exists.

---

## Siro
**Blocker:** Requires an existing Siro customer relationship.

Siro is a sales coaching/call recording tool. API access is only available to paying customers. No free trial or developer sandbox.

---

## Hover
**Blocker:** API access appears to be Enterprise-only.

Hover offers property measurement and 3D modeling tools. Their API documentation is sparse and access appears to require an Enterprise account or a direct partnership arrangement. No self-serve developer access was found.
