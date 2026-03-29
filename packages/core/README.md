# @niche-integrations/core

Shared Niche Partner API client and utilities for all integrations.

## Features

- OAuth2 client credentials authentication
- Type-safe API methods for leads, businesses, and organizations
- Automatic token refresh
- Rate limiting with token bucket (default 2 req/s; configurable via `NICHE_RATE_LIMIT_PER_SECOND`)
- 429 handling: honor `Retry-After`, then retry once (no hammering)
- Error handling

## Usage

```typescript
import { NicheClient } from '@niche-integrations/core';

// Initialize client (reads from env vars by default)
const client = new NicheClient({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
});

// Or use static token
const client = new NicheClient({
  accessToken: 'your_access_token',
});

// Create a lead
const lead = await client.createLead('business-id', {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  source: 'wordpress',
  message: 'Interested in your services',
});

// List businesses
const businesses = await client.getBusinesses();

// List leads
const leads = await client.listLeads('business-id', {
  limit: 10,
  offset: 0,
});
```

## Auth flow / where we obtain the token

Token logic lives in `packages/core/src/client.ts`. `authenticate()` exchanges `client_id` + `client_secret` for a bearer token via `POST /oauth/token`. `ensureAuthenticated()` is called before every request and refreshes the token if expired. Test with `pnpm test:auth`.

## Environment Variables

- `NICHE_CLIENT_ID` - OAuth client ID
- `NICHE_CLIENT_SECRET` - OAuth client secret
- `NICHE_ACCESS_TOKEN` - Static access token (alternative to OAuth)
- `NICHE_API_BASE_URL` - API base URL (default: https://app.nicheandleads.com)
- `NICHE_RATE_LIMIT_PER_SECOND` - Max requests per second (default: 2). Use a higher value only if the API allows it.
