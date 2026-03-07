# Niche Integration Competition

This monorepo contains integrations for the [Niche Integration Competition](https://app.nicheandleads.com/competition).

## Overview

Building 5 integrations to connect Niche with external platforms:
- WordPress (EASY)
- Thumbtack (EASY) - with alternatives: Yelp, Google LSA, Angi
- HubSpot (MEDIUM)
- Facebook Lead Ads (MEDIUM)
- Zapier (MEDIUM)

## Setup

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your Niche Partner API credentials:

```bash
cp .env.example .env
```

Get your credentials from the [competition registration page](https://app.nicheandleads.com/competition).

## Project Structure

```
niche-integrations/
├── packages/
│   ├── core/           # Shared Niche API client
│   ├── wordpress/      # WordPress integration
│   ├── thumbtack/      # Thumbtack integration
│   ├── hubspot/        # HubSpot integration
│   ├── facebook-leads/ # Facebook Lead Ads integration
│   └── zapier/         # Zapier app
├── package.json
└── tsconfig.json
```

## Development

Each package can be developed independently:

```bash
# Work on a specific package
cd packages/core
pnpm build
pnpm test
```

## Competition Timeline

- **Starts**: February 10, 2026
- **Deadline**: March 30, 2026
- **Prize**: $1,000 per qualifying integration + bonus prizes

## Documentation

- [Niche Partner API Docs](https://docs.getniche.ai/niche-partner-api)
- [Competition Page](https://app.nicheandleads.com/competition)
