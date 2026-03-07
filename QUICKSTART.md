# Quick Start Guide

## Prerequisites

- Node.js 18+
- pnpm 8+
- Niche Partner API credentials (see [REGISTRATION.md](./REGISTRATION.md))

## Initial Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables template
cp .env.example .env

# Edit .env and add your Niche API credentials per integration:
# - WordPress: NICHE_WORDPRESS_CLIENT_ID, NICHE_WORDPRESS_CLIENT_SECRET
# - Facebook Leads: NICHE_FACEBOOK_LEADS_CLIENT_ID, NICHE_FACEBOOK_LEADS_CLIENT_SECRET
```

**Test auth only (no servers):**
```bash
pnpm test:auth              # WordPress
pnpm test:auth:facebook      # Facebook Leads
```
Hits the Niche token endpoint and logs success or the raw error. Useful to verify credentials before running integrations.

## Build

```bash
# Build all packages
pnpm build

# Or build a single integration
pnpm build:wordpress
pnpm build:facebook-leads
```

## Run integrations

### Run all (WordPress + Facebook Leads)

```bash
pnpm start:all
```

- WordPress webhook: http://localhost:3333 (use ngrok to expose: `ngrok http 3333`)
- Facebook Lead Ads: http://localhost:6666 (use ngrok: `ngrok http 6666`)

### Run individually

**WordPress**
```bash
pnpm start:wordpress
# Server on http://localhost:3333
```

**Facebook Lead Ads**
```bash
pnpm start:facebook-leads
# Set FACEBOOK_ACCESS_TOKEN, FACEBOOK_APP_SECRET, NICHE_BUSINESS_ID in .env
# Server on http://localhost:6666
```

## Development Workflow

1. **Make changes** to integration code
2. **Build** the package: `cd packages/[package-name] && pnpm build` or `pnpm build:[integration]`
3. **Test** locally with ngrok for webhooks
4. **Deploy** when ready

## Next Steps

1. Register for the competition (see [REGISTRATION.md](./REGISTRATION.md))
2. Get your API credentials per integration (WordPress, Facebook Leads)
3. Set up each integration following its README
4. Test thoroughly
5. Submit your integrations before March 30, 2026!
