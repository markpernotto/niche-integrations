# WordPress + Niche & Leads: Step-by-Step Walkthrough

This guide walks you through installing WordPress locally, the Niche Lead Capture plugin, and the webhook server so you can see form submissions become leads in your Niche & Leads dashboard. It also explains **how it works** so you can talk about it clearly.

---

## How it works (the big picture)

You have **two pieces** that work together:

1. **WordPress plugin** – Hooks into your form plugin (Contact Form 7, WPForms, or Gravity Forms). When someone submits a form, the plugin sends that data to a **URL you configure** (your webhook).
2. **Webhook server** – A small Node.js app in this repo. It receives form data from WordPress, uses your **Niche API key** (from `.env`) to call the Niche API, creates the lead, and responds to WordPress.

So the flow is:

```
[Visitor submits form] 
  → [Form plugin saves it] 
  → [Our plugin sends it to your webhook URL] 
  → [Webhook server calls Niche API with your key] 
  → [Lead appears in Niche & Leads dashboard]
```

**Where does the API key go?**  
The API key lives in the **project’s `.env` file** and is used **only by the webhook server**. The WordPress plugin **never** sees or stores your API key. In the plugin you only configure:

- **Webhook URL** – where the plugin sends form data (your webhook server, e.g. via ngrok).
- **Business ID** – your Niche & Leads business ID (from the N&L dashboard).

Keeping the key in `.env` on the machine running the webhook means it stays out of WordPress and the browser.

---

## What you’ll need before starting

- **Node.js 18+** and **pnpm** (repo uses these).
- **WordPress** – Separate from this repo. Use a **local** install (e.g. [Local](https://localwp.com/), Docker, MAMP) or a hosted site. You can test everything locally; you **do not** need to publish the WP site.
- **Niche & Leads API key** – you have this.
- **Niche Business ID** – from your [Niche & Leads dashboard](https://app.nicheandleads.com) (exact location may vary; often under account/settings or business details).
- **ngrok** – [ngrok](https://ngrok.com/) (or similar) to expose your local webhook server so WordPress (local or hosted) can POST to it. ngrok requires a free account: [sign up](https://dashboard.ngrok.com/signup), then [get your authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) and run `ngrok config add-authtoken YOUR_TOKEN`.

**WordPress vs this repo:**  
WordPress runs on its own (local or hosted). This repo has the **plugin** (you install it into WP) and the **webhook server** (you run it from here). Local WordPress + local webhook + ngrok is enough to test end‑to‑end; no publishing required.

---

## Step-by-step

### Step 1: Set up the project and API key

1. In the repo root, copy `.env.example` to `.env` (if you haven’t already).
2. Add your API key:
   ```bash
   NICHE_ACCESS_TOKEN=your_niche_api_key_here
   ```
3. Install and build the WordPress integration:
   ```bash
   pnpm install
   pnpm build:wordpress
   ```
   This builds the core Niche client and the webhook server. The webhook server reads `NICHE_ACCESS_TOKEN` from `.env`.

---

### Step 2: Run the webhook server

1. Start the server:
   ```bash
   pnpm start:wordpress
   ```
   Or from `packages/wordpress`: `pnpm start`.

2. It listens on **port 3333**. You should see:
   - Health check: `http://localhost:3333/health`
   - Webhook: `http://localhost:3333/webhook`

3. Quick check:
   ```bash
   curl http://localhost:3333/health
   ```
   You should get `{"status":"ok","service":"wordpress-webhook"}`.

Keep this terminal running. The plugin will send form submissions to this server.

---

### Step 3: Expose the webhook with ngrok

WordPress runs locally (or on another host). It can’t reach `http://localhost:3333` directly, so we expose it via ngrok.

1. **One-time setup:** ngrok requires a free account. Sign up at [dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup), then copy your authtoken from [get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) and run:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```

2. In a **new** terminal:
   ```bash
   ngrok http 3333
   ```

3. ngrok will show a public URL, e.g. `https://abc123.ngrok-free.app`.

4. Your **Webhook URL** for the plugin is that base + `/webhook`:
   ```
   https://abc123.ngrok-free.app/webhook
   ```
   Copy this; you’ll paste it into the plugin settings.

5. Leave ngrok running. If you restart it, the URL will change and you’ll need to update the plugin setting.

---

### Step 4: Install and set up WordPress locally

1. Install WordPress using Local, Docker, MAMP, etc., and finish the normal WP setup (site title, admin user, etc.).

2. Install a **form plugin** and create a form:
   - **Contact Form 7** (free), **WPForms**, or **Gravity Forms**.
   - Create a form that includes at least **email** or **phone** (both preferred). Our plugin maps common field names (e.g. “email”, “phone”, “name”) to Niche.

3. Publish the form on a page and note the page URL so you can test later.

**Form plugins in detail:** See the section [Testing with Gravity Forms, Contact Form 7, and WPForms](#testing-with-gravity-forms-contact-form-7-and-wpforms) below for field naming and a minimal form in each.

---

### Step 5: Install the Niche Lead Capture plugin

1. Copy the plugin files into WordPress:
   - From this repo, copy the contents of `packages/wordpress/plugin/` into:
     ```
     wp-content/plugins/niche-lead-capture/
     ```
   - The main file must be at:
     ```
     wp-content/plugins/niche-lead-capture/niche-lead-capture.php
     ```

   **Alternatively (zip install):** Create a folder named `niche-lead-capture`, put `niche-lead-capture.php` from `plugin/` inside it, zip that folder, then use **Plugins → Add New → Upload Plugin** and install the zip. The zip should contain `niche-lead-capture/niche-lead-capture.php`.

2. In WP admin, go to **Plugins**, find **Niche Lead Capture**, and **Activate** it.

---

### Step 6: Configure the plugin (Webhook URL + Business ID)

1. Go to **Settings → Niche Lead Capture**.

2. **Webhook URL**  
   Paste the URL from Step 3, e.g.:
   ```
   https://abc123.ngrok-free.app/webhook
   ```
   This is where the plugin sends form data. No API key goes here.

3. **Business ID**  
   Enter your Niche & Leads **Business ID** (from the N&L dashboard). The webhook server sends this when creating leads so they’re attached to the right business.

4. Click **Save Changes**.

You do **not** enter your API key on this page. The key stays in `.env` and is used only by the webhook server.

---

### Step 7: Submit a test form and confirm in N&L

1. Open the page with your form on the **front end** (not in the editor).

2. Submit a test submission (use a real email format and optionally a phone number).

3. **Check the webhook server terminal**  
   You should see the incoming request. Any errors (e.g. missing Business ID, invalid API key) will show there.

4. **Check your Niche & Leads dashboard**  
   The new lead should appear for the business you configured.

If the lead doesn’t show up, check the webhook logs first. Common issues:
- **400** – Missing `businessId` or neither email nor phone. Confirm plugin settings and form fields.
- **401 / 403** – API key or Niche API base URL wrong in `.env`.
- **No request in logs** – WordPress can’t reach the webhook. Check ngrok is running, the Webhook URL in the plugin is correct (including `https` and `/webhook`), and your environment allows outbound HTTPS.

---

## Testing with Gravity Forms, Contact Form 7, and WPForms

The plugin supports all three. It hooks into each form plugin’s submit action and maps field **labels** (or in CF7, **field names**) to `name`, `email`, `phone`, and `message`. The webhook requires **at least email or phone** to create a lead.

You can use one or all of these on the same site (e.g. **http://niche-and-leads-integration.local/**). Install the form plugin(s), create a form with the fields below, add it to a page, and submit; the same Niche Lead Capture settings apply to all.

### Gravity Forms (you have a license)

- **Hook:** `gform_after_submission` – our plugin runs after GF saves the entry.
- **Field labels** (what you name the field in the GF editor) are what get mapped. Use labels that contain:
  - **Name** (or “Full name”) → sent as `name`
  - **Email** → sent as `email`
  - **Phone** (or “Tel”) → sent as `phone`
  - **Message** (or “Comment”) → sent as `message`
- **Minimal test form:** Add fields with labels “Name”, “Email”, “Phone”, “Message”. Put the form on a page and submit. At least Email or Phone must be filled.

### Contact Form 7 (free from WordPress.org)

- **Hook:** `wpcf7_mail_sent` – our plugin runs after CF7 sends (or would send) the mail.
- **Default template** uses field names `your-name`, `your-email`, `your-message` (and optionally `your-phone`). The plugin maps those to `name`, `email`, `message`, `phone` before sending to the webhook, so the default template works as-is.
- **Minimal test form:** Use the default template (Name, Email, Subject, Message) or add a **Phone** field with name `your-phone`. At least Email or Phone must be present.

### WPForms (free or paid)

- **Hook:** `wpforms_process_complete` – our plugin runs after WPForms processes the submission.
- **Field labels** are mapped the same way as Gravity Forms: labels containing “name”, “email”, “phone”, “message” (or “comment”) go to the right place.
- **Minimal test form:** Add fields with labels like “Name”, “Email”, “Phone”, “Message”. At least Email or Phone must be filled.

### Summary

| Form plugin   | What we use        | Minimal required      |
|---------------|--------------------|------------------------|
| Gravity Forms | Field **labels**   | Email or Phone (Name/Message optional) |
| Contact Form 7| Field **names** (default: your-name, your-email, your-message, your-phone) | Email or Phone |
| WPForms       | Field **labels**   | Email or Phone (Name/Message optional) |

Same Niche Lead Capture settings (Webhook URL + Business ID) work for all. You can switch between forms or use multiple on the same site to compare behavior.

---

## Quick reference

| Item | Where it lives |
|------|----------------|
| **API key** | Repo `.env` → `NICHE_ACCESS_TOKEN`. Used by the webhook server only. |
| **Webhook URL** | Plugin settings. Points to your webhook (e.g. `https://….ngrok-free.app/webhook`). |
| **Business ID** | Plugin settings. From Niche & Leads dashboard. |

| Step | Action |
|------|--------|
| 1 | `.env` + `pnpm build:wordpress` |
| 2 | `pnpm start:wordpress` (keep running) |
| 3 | `ngrok http 3333` → copy `https://…/webhook` |
| 4 | Local WP + form plugin + form with email/phone |
| 5 | Install & activate Niche Lead Capture plugin |
| 6 | Settings → Niche Lead Capture: Webhook URL + Business ID |
| 7 | Submit form → check webhook logs → check N&L dashboard |

---

## Flow you can describe to others

- **Form** → form plugin → **our plugin** sends data to **your webhook URL**.
- **Webhook server** (this repo) receives it, uses **API key from `.env`** to call the Niche API, creates the lead.
- **Lead** shows up in the **Niche & Leads dashboard** for the **Business ID** you configured.
- The **API key never goes into WordPress**; only the Webhook URL and Business ID do.

That’s the full path from form submit to N&L dashboard.
