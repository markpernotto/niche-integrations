# WordPress + Niche Lead Capture: Setup Walkthrough

This guide walks you through installing the Niche Lead Capture plugin in WordPress and getting form submissions to appear as leads in your Niche & Leads dashboard.

---

## How it works

The plugin calls the Niche API **directly from WordPress** — no relay server, no ngrok, no Node.js required.

```
[Visitor submits form]
  → [Form plugin saves submission]
  → [Niche Lead Capture plugin fires]
  → [Plugin calls Niche OAuth endpoint → gets token]
  → [Plugin POSTs lead to Niche API]
  → [Lead appears in Niche & Leads dashboard]
```

Credentials (Client ID, Client Secret, Business ID) are stored in the **WordPress database** via the plugin settings page — not in `.env`.

---

## What you'll need

- A WordPress site (local or hosted — [Local](https://localwp.com/) works great for testing)
- A **Niche app** with all scopes checked (`leads:write`, `leads:read`, `businesses:read`, `businesses:write`) — create one in the Niche dashboard and copy the Client ID and Client Secret
- Your **Niche Business ID** — from your Niche & Leads dashboard
- At least one form plugin: **Contact Form 7** (free), **WPForms**, or **Gravity Forms**

---

## Step 1: Install the plugin

**Option A — Manual install:**
1. Copy `packages/wordpress/plugin/niche-lead-capture.php` into your WordPress install at:
   ```
   wp-content/plugins/niche-lead-capture/niche-lead-capture.php
   ```
2. In WP Admin → **Plugins**, find **Niche Lead Capture** and click **Activate**.

**Option B — Zip upload:**
1. Create a folder named `niche-lead-capture`, put `niche-lead-capture.php` inside it, zip it.
2. WP Admin → **Plugins → Add New → Upload Plugin** → upload the zip → **Activate**.

---

## Step 2: Configure the plugin

1. Go to **WP Admin → Settings → Niche Lead Capture**.
2. Fill in:
   - **Client ID** — from your Niche app
   - **Client Secret** — from your Niche app
   - **Business ID** — your Niche business ID (the dropdown auto-populates once credentials are saved)
3. Click **Save Changes**.

That's it. No webhook URL, no ngrok, no server to run.

---

## Step 3: Install a form plugin and create a form

The plugin hooks into Contact Form 7, WPForms, and Gravity Forms automatically once activated. Install whichever you prefer and create a form with at least **Name**, **Email**, and/or **Phone** fields.

### Contact Form 7
- Hook: `wpcf7_before_send_mail` (fires regardless of mail delivery)
- Default field names (`your-name`, `your-email`, `your-phone`, `your-message`) are mapped automatically
- Add a Phone field with name `your-phone` if not already present

### WPForms
- Hook: `wpforms_process_complete`
- Field **labels** containing "name", "email", "phone", or "message" are mapped automatically

### Gravity Forms
- Hook: `gform_after_submission`
- Field **labels** containing "name", "email", "phone", or "message" are mapped automatically

**Minimum requirement:** at least Email or Phone must be present in the submission for the plugin to create a lead.

---

## Step 4: Submit a test form

1. Open the page with your form on the **front end** (not in the editor).
2. Submit a test entry with a name, email, and phone number.
3. Check **WP Admin → Tools → Site Health → Info → Logs** (or your server's PHP error log) for plugin output — it logs each API call and response.
4. Check your **Niche & Leads dashboard** — the lead should appear under the business you configured.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Lead doesn't appear | Client ID / Secret / Business ID not saved correctly — re-check plugin settings |
| `OAuth failed` in logs | Wrong Client ID or Secret, or Niche app missing required scopes |
| `not configured` in logs | One or more settings fields is empty |
| Lead created but no phone | Form field label doesn't contain "phone" — rename the field label |

---

## Quick reference

| Setting | Where |
|---|---|
| Client ID | Niche dashboard → your app → Client ID |
| Client Secret | Niche dashboard → your app → Client Secret |
| Business ID | Niche dashboard → business details |
| Plugin settings | WP Admin → Settings → Niche Lead Capture |

The plugin also includes a **shortcode** (`[niche_lead_form]`) and a **Gutenberg block** for embedding a standalone Niche lead form directly on any page — no third-party form plugin required for those.
