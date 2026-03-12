/**
 * Test Niche Partner API connectivity.
 * Run from repo root: pnpm test:auth
 *
 * Tests:
 *  1. GET /businesses  — list businesses (confirms token works)
 *  2. POST /businesses/{id}/leads — create a test lead (confirms write access)
 */

const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const baseURL = process.env.NICHE_API_BASE_URL || 'https://app.nicheandleads.com';
const token = process.env.NICHE_ACCESS_TOKEN;
const businessId = process.env.NICHE_BUSINESS_ID;

console.log('Niche API test');
console.log('  baseURL:', baseURL);
console.log('  token:', token ? `${token.slice(0, 16)}…` : '(missing)');
console.log('  businessId:', businessId || '(missing)');
console.log('');

if (!token) {
  console.error('Set NICHE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };

async function run() {
  // --- Test 1: GET /businesses ---
  console.log('Test 1: GET /businesses');
  try {
    const res = await axios.get(`${baseURL}/api/partner/v1/businesses/`, { headers });
    const items = res.data.items || res.data;
    console.log(`  ✓ OK — ${Array.isArray(items) ? items.length : '?'} business(es) found`);
    if (Array.isArray(items)) items.forEach(b => console.log(`    ${b.id}  ${b.name}`));
  } catch (err) {
    console.error('  ✗ FAILED:', err.response?.status, JSON.stringify(err.response?.data)?.slice(0, 100) || err.message);
  }

  console.log('');

  // --- Test 2: POST /businesses/{id}/leads ---
  if (!businessId || businessId.includes('your_business')) {
    console.log('Test 2: POST /leads — SKIPPED (NICHE_BUSINESS_ID not set)');
    return;
  }

  console.log(`Test 2: POST /businesses/${businessId}/leads`);
  try {
    const res = await axios.post(
      `${baseURL}/api/partner/v1/businesses/${businessId}/leads/`,
      { name: 'Test Lead', phone: '+15551234567', info: 'Automated test', source: 'WORDPRESS' },
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );
    console.log('  ✓ OK — lead created:', JSON.stringify(res.data));
  } catch (err) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data)?.slice(0, 200) || err.message;
    if (typeof err.response?.data === 'string' && err.response.data.includes('<!doctype')) {
      console.error('  ✗ FAILED — server returned HTML (SPA fallback). This is a Niche server-side bug.');
    } else {
      console.error(`  ✗ FAILED — HTTP ${status}: ${body}`);
    }
  }
}

run();
