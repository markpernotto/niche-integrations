# WordPress Integration

Captures form submissions from WordPress sites and creates leads in Niche & Leads.

**→ For a full step-by-step (local WordPress, plugin, webhook, ngrok, test): see [WALKTHROUGH.md](./WALKTHROUGH.md).**

## Components

1. **WordPress Plugin** (`plugin/niche-lead-capture.php`) – Hooks into Contact Form 7, WPForms, or Gravity Forms. On form submit, POSTs data to your webhook URL. You configure **Webhook URL** and **Business ID** in Settings → Niche Lead Capture; the plugin never sees your API key.
2. **Webhook Server** (`src/webhook.ts`) – Express app that receives those POSTs, reads `NICHE_ACCESS_TOKEN` from the repo `.env`, calls the Niche API to create the lead, and returns success or error.

## Setup

### 1. Install WordPress Plugin

The plugin lives in this repo at **`packages/wordpress/plugin/niche-lead-capture.php`**. There is no pre-made zip; use one of these:

**Option A – Zip and upload in WordPress**

1. Create a folder named `niche-lead-capture`.
2. Copy `niche-lead-capture.php` from `packages/wordpress/plugin/` into that folder.
3. Zip the folder (so the zip contains `niche-lead-capture/niche-lead-capture.php`).
4. In WP admin: **Plugins → Add New → Upload Plugin** → choose the zip → **Install Now** → **Activate**.

**Option B – Copy into the site’s plugins directory**

1. In your WordPress install, go to `wp-content/plugins/`.
2. Create a folder `niche-lead-capture`.
3. Copy `niche-lead-capture.php` from `packages/wordpress/plugin/` into it (path: `wp-content/plugins/niche-lead-capture/niche-lead-capture.php`).
4. In WP admin: **Plugins** → find **Niche Lead Capture** → **Activate**.

### 2. Configure Plugin (set Webhook URL and Business ID)

In WP admin, go to **Settings → Niche Lead Capture**. You’ll see two fields:

- **Webhook URL** – Paste your ngrok URL **plus** `/webhook` (e.g. `https://abc123.ngrok-free.app/webhook`). This is where the plugin sends form submissions. Get the base URL from the terminal where you ran `ngrok http 3333`.
- **Business ID** – Your Niche & Leads business ID (from the N&L dashboard).

Click **Save Changes**. Your API key stays in the repo `.env`; the plugin never has an API key field.

### 3. Start Webhook Server

```bash
cd packages/wordpress
pnpm install
pnpm build
pnpm start
```

Or for development:
```bash
pnpm dev
```

### 4. Expose Webhook with ngrok

```bash
ngrok http 3333
```

Copy the **https** URL ngrok shows (e.g. `https://abc123.ngrok-free.app`), add `/webhook`, and paste that full URL into **Settings → Niche Lead Capture → Webhook URL** (see step 2 above).

## Supported Form Plugins

- **Gravity Forms** – uses field labels (Name, Email, Phone, Message).
- **Contact Form 7** – default field names (`your-name`, `your-email`, `your-message`, `your-phone`) are mapped automatically.
- **WPForms** – uses field labels (same as Gravity Forms).

See [WALKTHROUGH.md](./WALKTHROUGH.md#testing-with-gravity-forms-contact-form-7-and-wpforms) for minimal test forms and field naming for each.

## API Flow

```
Form submit → Form plugin → Our plugin (POST to Webhook URL) → Webhook server (uses .env API key) → Niche API (createLead) → Lead in N&L dashboard
```

## Testing

1. Submit a test form on your WordPress site
2. Check webhook server logs
3. Verify lead appears in Niche dashboard
