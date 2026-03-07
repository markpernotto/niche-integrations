/**
 * Test Niche Partner API OAuth flow only.
 * Run from repo root: pnpm test:auth  (WordPress) or INTEGRATION=facebook-leads pnpm test:auth
 *
 * Loads .env from repo root. Each integration uses NICHE_<INTEGRATION>_CLIENT_ID / _CLIENT_SECRET.
 */

const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

// Load root .env (scripts/ is inside packages/core)
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const baseURL = process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';

const integration = process.env.INTEGRATION || 'wordpress';
const envKeys = {
  wordpress: { id: 'NICHE_WORDPRESS_CLIENT_ID', secret: 'NICHE_WORDPRESS_CLIENT_SECRET' },
  'facebook-leads': { id: 'NICHE_FACEBOOK_LEADS_CLIENT_ID', secret: 'NICHE_FACEBOOK_LEADS_CLIENT_SECRET' },
};
const keys = envKeys[integration] || envKeys.wordpress;

const clientId = process.env[keys.id];
const clientSecret = process.env[keys.secret];
const tokenUrl = `${baseURL}/api/partner/v1/oauth/token`;

console.log('Niche auth test');
console.log('  baseURL:', baseURL);
console.log('  token URL:', tokenUrl);
console.log('  NICHE_CLIENT_ID:', clientId ? `${clientId.slice(0, 8)}…` : '(missing)');
console.log('  NICHE_CLIENT_SECRET:', clientSecret ? '***' : '(missing)');
console.log('');

if (!clientId || !clientSecret) {
  console.error(`Set ${keys.id} and ${keys.secret} in repo root .env (integration: ${integration})`);
  process.exit(1);
}

async function run() {
  try {
    console.log('POST', tokenUrl);
    const res = await axios.post(
      tokenUrl,
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('  status:', res.status);
    console.log('  expires_in:', res.data.expires_in);
    console.log('  access_token:', res.data.access_token ? `${res.data.access_token.slice(0, 20)}…` : '(none)');
    console.log('');
    console.log('Auth OK. Token received.');
  } catch (err) {
    console.error('Auth FAILED');
    if (err.response) {
      console.error('  status:', err.response.status);
      console.error('  data:', JSON.stringify(err.response.data, null, 2));
      if (err.response.status >= 500) {
        console.error('  5xx = Niche server error; you may need to contact support.');
      }
    } else {
      console.error('  ', err.message);
    }
    process.exit(1);
  }
}

run();
