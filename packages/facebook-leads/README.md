# Facebook Lead Ads Integration

Captures leads from Facebook/Instagram Lead Ad forms and creates them in Niche instantly.

## How It Works

1. User submits a Facebook Lead Ad form
2. Facebook sends a webhook notification (`leadgen` event) to this server
3. Server responds `200 OK` immediately (within the 20-second window Facebook requires)
4. Server fetches full lead data from the Facebook Graph API using the `leadgen_id`
5. Lead is transformed to the Niche schema and POSTed to the Niche Partner API

## Setup

### 1. Create a Facebook App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app — select **Business** type (via "Other" → "Business")
3. Add the **Webhooks** product and subscribe to the `leadgen` field
4. Switch the app to **Live mode** (Development mode does not deliver real lead data)
5. Use the **Lead Ads Testing Tool** at developers.facebook.com/tools/lead-ads-testing to associate your Facebook Page with the app

### 2. Configure Environment Variables

```bash
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_ACCESS_TOKEN=your_page_access_token
FACEBOOK_VERIFY_TOKEN=niche_verify_token        # any string you choose
PAGE_ID_TO_BUSINESS_MAP={"PAGE_ID":"NICHE_BIZ_ID"}  # JSON map for multi-page support
NICHE_BUSINESS_ID=your_niche_business_id        # fallback if page not in map
NICHE_FACEBOOK_LEADS_CLIENT_ID=your_niche_client_id
NICHE_FACEBOOK_LEADS_CLIENT_SECRET=your_niche_client_secret
```

### 3. Build and Start

```bash
pnpm build:facebook-leads && pnpm start:facebook-leads
# Server runs on port 6666
```

### 4. Expose Webhook URL

Use ngrok or a hosted URL for the Facebook webhook callback:

```bash
ngrok http 6666
# Use the https URL as your Facebook webhook callback: https://<id>.ngrok.io/webhook
```

Set the verify token in Facebook's Webhooks settings to match `FACEBOOK_VERIFY_TOKEN`.

## Field Mapping

| Facebook Form Field | Niche Field | Notes |
|---|---|---|
| `full_name` / `first_name` + `last_name` | `name` | All variants handled |
| `phone_number` / `phone` | `phone` | Passed through as-is |
| `email` | `info` | Appended as `Email: value` |
| `street_address`, `city`, `state`, `zip` | `info` | Formatted as labeled lines |
| Custom questions | `info` | Appended as `Question Label: Answer` |
| — | `source` | Always `"FACEBOOK"` |

## Key Behaviors

- **Signature verification**: Validates `X-Hub-Signature-256` header using HMAC-SHA256 with your App Secret
- **20-second rule**: Returns `200 OK` immediately; lead processing happens asynchronously
- **Deduplication**: Processed `leadgen_id`s are tracked in memory with a 24-hour TTL to ignore Facebook retry attempts
- **Page routing**: `PAGE_ID_TO_BUSINESS_MAP` routes leads from different Facebook Pages to different Niche businesses; falls back to `NICHE_BUSINESS_ID`

> **Production note:** Deduplication uses in-memory storage and will reset on server restart. For production deployments handling high-volume campaigns, replace with Redis or a lightweight persistent store.

## Webhook Endpoints

- `GET /webhook` — Facebook verification challenge (handled automatically)
- `POST /webhook` — Receives `leadgen` events from Facebook
- `GET /health` — Health check
