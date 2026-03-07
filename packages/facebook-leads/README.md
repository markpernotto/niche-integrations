# Facebook Lead Ads Integration

Captures leads from Facebook/Instagram Lead Ad forms and creates them in Niche instantly.

## Setup

### 1. Create Facebook App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "Leads Retrieval" permission
4. Get your App ID, App Secret, and Access Token

### 2. Configure Webhooks

1. In your Facebook App settings, go to Webhooks
2. Add a webhook subscription:
   - **Callback URL**: `https://your-webhook-url.com/webhook` (use ngrok for development)
   - **Verify Token**: Set a token (e.g., `niche_verify_token`)
   - **Subscription Fields**: Subscribe to `leadgen` field

### 3. Configure Environment Variables

```bash
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_ACCESS_TOKEN=your_access_token
FACEBOOK_VERIFY_TOKEN=niche_verify_token
NICHE_BUSINESS_ID=your_niche_business_id
```

### 4. Start Integration Server

```bash
cd packages/facebook-leads
pnpm install
pnpm build
pnpm start
```

### 5. Expose with ngrok

```bash
ngrok http 6666
```

Use the ngrok URL in your Facebook webhook configuration.

## How It Works

1. User fills out a Facebook Lead Ad form
2. Facebook sends webhook notification to your endpoint
3. Integration fetches full lead data from Facebook Graph API
4. Lead is transformed and created in Niche

## Field Mapping

Facebook Lead Ads forms can have custom fields. Common mappings:

| Facebook Field | Niche Lead Field |
|---------------|------------------|
| `first_name` / `firstname` | `firstName` |
| `last_name` / `lastname` | `lastName` |
| `full_name` / `name` | `firstName` + `lastName` (parsed) |
| `email` | `email` |
| `phone_number` / `phone` | `phone` |
| `message` / `comments` | `message` |

All other fields are stored in `metadata`.

## Compliance Notes

- Facebook lead data expires after 90 days
- Must comply with Meta's data policies
- Ensure proper data handling and privacy compliance

## Testing

You can test webhooks using Facebook's webhook testing tool in the App Dashboard, or by creating a test Lead Ad campaign.
