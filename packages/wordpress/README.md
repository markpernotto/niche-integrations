# WordPress Integration

Captures form submissions from WordPress sites and creates leads directly in Niche & Leads — no relay server or ngrok required.

**→ For a full step-by-step setup guide, see [WALKTHROUGH.md](./WALKTHROUGH.md).**

## How it works

The plugin calls the Niche API **directly from PHP**. Credentials are stored in WordPress (not in `.env`).

```
Form submit → Form plugin → Niche Lead Capture plugin → Niche API → Lead in dashboard
```

## Quick setup

1. Install `plugin/niche-lead-capture.php` into WordPress and activate it
2. Go to **WP Admin → Settings → Niche Lead Capture**
3. Enter your Niche **Client ID**, **Client Secret**, and **Business ID**
4. Submit a form — lead appears in Niche dashboard

See [WALKTHROUGH.md](./WALKTHROUGH.md) for detailed instructions including form plugin setup and troubleshooting.

## Supported form plugins

- **Contact Form 7** — default field names mapped automatically
- **WPForms** — field labels mapped automatically
- **Gravity Forms** — field labels mapped automatically

Also includes a `[niche_lead_form]` shortcode and Gutenberg block for standalone lead forms.
