#!/usr/bin/env node
/**
 * Facebook Lead Ads integration — interactive setup helper
 *
 * Run: pnpm setup:facebook-leads
 *
 * What it does:
 *  1. Checks required env vars are present
 *  2. Fetches an OAuth token from Niche using your credentials
 *  3. Lists your Niche businesses so you can pick the right ID
 *  4. Prints the exact PAGE_ID_TO_BUSINESS_MAP line to paste into .env
 */

const path = require('path');
const dotenv = require('dotenv');
const https = require('https');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const BASE_URL = process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';
const CLIENT_ID = process.env.NICHE_FACEBOOK_LEADS_CLIENT_ID;
const CLIENT_SECRET = process.env.NICHE_FACEBOOK_LEADS_CLIENT_SECRET;
const PAGE_ID_MAP_RAW = process.env.PAGE_ID_TO_BUSINESS_MAP;

// ---------------------------------------------------------------------------
// Minimal fetch wrapper (no extra deps beyond what's already installed)
// ---------------------------------------------------------------------------
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function section(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Niche × Facebook Lead Ads — Setup & Discovery       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // --- Step 1: Check env vars ---
  section('Step 1: Check environment variables');
  let hasErrors = false;

  if (!CLIENT_ID) {
    fail('NICHE_FACEBOOK_LEADS_CLIENT_ID is not set in .env');
    hasErrors = true;
  } else {
    ok(`NICHE_FACEBOOK_LEADS_CLIENT_ID = ${CLIENT_ID}`);
  }

  if (!CLIENT_SECRET) {
    fail('NICHE_FACEBOOK_LEADS_CLIENT_SECRET is not set in .env');
    hasErrors = true;
  } else {
    ok(`NICHE_FACEBOOK_LEADS_CLIENT_SECRET = ${CLIENT_SECRET.slice(0, 8)}…`);
  }

  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbSecret = process.env.FACEBOOK_APP_SECRET;
  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;

  if (!fbToken) {
    fail('FACEBOOK_ACCESS_TOKEN is not set (needed to fetch lead data from Graph API)');
    hasErrors = true;
  } else {
    ok(`FACEBOOK_ACCESS_TOKEN = ${fbToken.slice(0, 12)}…`);
  }

  if (!fbSecret) {
    info('FACEBOOK_APP_SECRET not set — webhook signature verification will be skipped');
  } else {
    ok(`FACEBOOK_APP_SECRET = ${fbSecret.slice(0, 8)}…`);
  }

  if (!verifyToken) {
    info('FACEBOOK_VERIFY_TOKEN not set — will default to "niche_verify_token"');
  } else {
    ok(`FACEBOOK_VERIFY_TOKEN = ${verifyToken}`);
  }

  if (hasErrors) {
    console.log('\nFix the missing values above in your .env file, then re-run this script.\n');
    process.exit(1);
  }

  // --- Step 2: Get OAuth token ---
  section('Step 2: Authenticate with Niche API');

  let accessToken;
  let grantedScope = '';
  try {
    // Try with explicit scopes first; some Niche apps 500 on this if not configured upfront
    let res = await postJson(`${BASE_URL}/api/partner/v1/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'leads:write leads:read businesses:read businesses:write',
    });

    // Fall back to no-scope request if the API errored (known Niche quirk)
    if (res.status !== 200 || !res.data.access_token) {
      res = await postJson(`${BASE_URL}/api/partner/v1/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
    }

    if (res.status !== 200 || !res.data.access_token) {
      fail(`OAuth failed — HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
      info('Check that your NICHE_FACEBOOK_LEADS_CLIENT_ID and CLIENT_SECRET are correct.');
      process.exit(1);
    }

    accessToken = res.data.access_token;
    grantedScope = res.data.scope || '';
    ok(`Token obtained (expires in ${res.data.expires_in}s)`);

    const hasWrite = grantedScope.includes('leads:write');
    if (grantedScope) {
      if (hasWrite) {
        ok(`Scopes granted: ${grantedScope}`);
      } else {
        fail(`Scopes granted: ${grantedScope}`);
        info('Missing leads:write — leads cannot be created with this app.');
        info('Fix: create a NEW Niche app with all scopes checked before saving:');
        info('  leads:write  leads:read  businesses:read  businesses:write');
        info('Then update NICHE_FACEBOOK_LEADS_CLIENT_ID / CLIENT_SECRET in .env.');
      }
    }
  } catch (err) {
    fail(`Network error: ${err.message}`);
    process.exit(1);
  }

  // --- Step 3: List businesses ---
  section('Step 3: Fetch your Niche businesses');

  let businesses = [];
  try {
    const res = await getJson(`${BASE_URL}/api/partner/v1/businesses`, accessToken);

    if (res.status !== 200) {
      fail(`GET /businesses failed — HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
      if (res.status === 403) {
        info('This usually means your Niche app was not created with businesses:read scope.');
        info('Create a new app in the Niche dashboard with all required scopes checked.');
      }
      process.exit(1);
    }

    businesses = res.data.items || res.data;
    if (!Array.isArray(businesses) || businesses.length === 0) {
      info('No businesses found. Create a business in the Niche dashboard first.');
      process.exit(0);
    }

    ok(`Found ${businesses.length} business(es):\n`);
    businesses.forEach((b, i) => {
      console.log(`    [${i + 1}] ${b.name || '(unnamed)'}`);
      console.log(`        ID: ${b.id}`);
    });
  } catch (err) {
    fail(`Network error: ${err.message}`);
    process.exit(1);
  }

  // --- Step 4: Show .env config instructions ---
  section('Step 4: Configure your .env');

  const firstBiz = businesses[0];

  // Check current PAGE_ID_TO_BUSINESS_MAP
  let pageMapConfigured = false;
  let pageMapPlaceholder = false;
  if (PAGE_ID_MAP_RAW) {
    try {
      const parsed = JSON.parse(PAGE_ID_MAP_RAW);
      const values = Object.values(parsed);
      pageMapPlaceholder = values.some(
        (v) => typeof v === 'string' && v.includes('your_business')
      );
      pageMapConfigured = !pageMapPlaceholder && values.length > 0;
    } catch {
      /* malformed JSON */
    }
  }

  if (pageMapConfigured) {
    ok('PAGE_ID_TO_BUSINESS_MAP is already configured.');
  } else {
    if (pageMapPlaceholder) {
      fail('PAGE_ID_TO_BUSINESS_MAP still has a placeholder value.');
    } else {
      info('PAGE_ID_TO_BUSINESS_MAP is not set.');
    }

    console.log('\n  To route Facebook page leads to a Niche business, add this to your .env:');
    console.log('\n  ┌─ .env ──────────────────────────────────────────────────────────');
    if (businesses.length === 1) {
      console.log(`  │  PAGE_ID_TO_BUSINESS_MAP={"YOUR_FB_PAGE_ID":"${firstBiz.id}"}`);
    } else {
      const example = {};
      businesses.forEach((b) => { example['YOUR_FB_PAGE_ID_' + b.name.replace(/\s+/g, '_').toUpperCase()] = b.id; });
      console.log(`  │  PAGE_ID_TO_BUSINESS_MAP=${JSON.stringify(example)}`);
    }
    console.log('  └──────────────────────────────────────────────────────────────────');
    console.log('\n  Replace YOUR_FB_PAGE_ID with the Page ID from your Facebook Page settings.');
    console.log('  (Facebook Page → About → Page ID, or Page Settings → Page Info)\n');
  }

  // Fallback business ID
  const currentFallback = process.env.NICHE_BUSINESS_ID;
  if (!currentFallback || currentFallback.includes('your_business')) {
    console.log('  Also set the fallback in .env (used when no page ID match is found):');
    console.log(`\n  ┌─ .env ───────────────────────────────`);
    console.log(`  │  NICHE_BUSINESS_ID=${firstBiz.id}`);
    console.log(`  └──────────────────────────────────────\n`);
  } else {
    ok(`NICHE_BUSINESS_ID is set (${currentFallback})`);
  }

  // --- Step 5: Webhook setup reminder ---
  section('Step 5: Webhook setup checklist');

  console.log(`
  Once your server is running (pnpm build:facebook-leads && pnpm start:facebook-leads):

  1. Expose it publicly:
       ngrok http 6666
       → copy the https://xxxx.ngrok.io URL

  2. In your Facebook App (developers.facebook.com):
       Products → Webhooks → Edit Subscription
       Callback URL:  https://xxxx.ngrok.io/webhook
       Verify Token:  ${verifyToken || 'niche_verify_token'}
       Subscriptions: leadgen

  3. Subscribe your Facebook Page to the app's webhook.

  4. Test with the Lead Ads Testing tool in your Facebook App dashboard.
`);

  console.log('Setup complete.\n');
}

run().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
