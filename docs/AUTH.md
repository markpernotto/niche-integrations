# How we obtain and use the Niche auth token

## Where the token is obtained

**File:** `packages/core/src/client.ts`

1. **OAuth (client_id + client_secret)**  
   - **`authenticate()`** (lines ~129–168):  
     - `POST {NICHE_API_BASE_URL}/api/partner/v1/oauth/token`  
     - Body: `{ grant_type: "client_credentials", client_id, client_secret }`  
     - Response: `{ access_token, expires_in }`  
     - We store `access_token` and use it as `Authorization: Bearer <token>`.  
   - **`ensureAuthenticated()`** (lines ~174–185):  
     - Called before every API request.  
     - If we have a static token (no client credentials), we skip.  
     - Otherwise, if there’s no token or it’s expired, we call `authenticate()`.

2. **Static token (API key)**  
   - If `NICHE_ACCESS_TOKEN` is set (and no client credentials), we use that as the Bearer token directly. We never call the token endpoint.

## Where the token is sent

**Same file:** `packages/core/src/client.ts`

- **Request interceptor** (lines ~72–86):  
  - Before each API request we call `ensureAuthenticated()`, then set  
    `Authorization: Bearer ${this.accessToken}`  
  on the outgoing request.

## Config / env

- **OAuth:** `NICHE_CLIENT_ID`, `NICHE_CLIENT_SECRET` (and optionally `NICHE_API_BASE_URL`).  
- **Static token:** `NICHE_ACCESS_TOKEN` (and optionally `NICHE_API_BASE_URL`).  
- All read from `process.env` (e.g. via root `.env`). No user-id is used.

## Test auth only

```bash
pnpm test:auth
```

Uses the same token endpoint and env vars (see `packages/core/scripts/test-auth.js`). No webhook or WordPress involved.
