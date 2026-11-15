# Pulse — marketing suite

Pulse (`/pulse`, API `/v1/pulse`) is Hudumika's marketing app. It builds on what the platform already has instead of copying it:

| Pulse uses | From |
|---|---|
| People | Contacts, CRM leads, Customers (no separate marketing list) |
| Email delivery | `MailService` → `email_outbox` (retries, the workspace's own mail server) |
| SMS delivery | `SmsService` → `sms_messages` (gateways, STOP opt-outs) |
| WhatsApp | `WhatsAppIntegration` — Meta-approved templates only |
| Website forms, landing pages, A/B pages | CMS |
| Automation hand-off | Studio triggers `pulse.campaign_launched`, `pulse.journey_step_reached`, `cms.form_submitted` |
| Writing help | The workspace's own AI settings (Admin ▸ Integrations ▸ AI) |

## Areas

- **Audiences** — live segments over contacts, leads or customers; rules include Pulse engagement and "company is a target account".
- **Consent** — one record per channel and address. Unsubscribes, bounces and SMS STOP replies are never sent to. Re-subscribing someone needs a written reason.
- **Campaigns** — email (subject A/B test), SMS, WhatsApp. Per-person open/click tracking, one-click unsubscribe (RFC 8058).
- **Journeys** — per-person sequences: triggers (audience, CRM/finance/form event, birthday, manual), steps (email, SMS, wait, if/else, CRM task, lead stage, notify, Studio, exit), quiet hours, goals.
- **Website forms** — map a CMS form's fields; submissions become contacts (and optionally leads); consent only when the person picks the "yes" answer.
- **Attribution** — leads, won deals and payments credited to the first/last touch (Pulse click or tagged form) in 90 days, matched by email/phone. Browsing is not tracked.
- **Social** — Facebook Pages, Instagram business, LinkedIn company pages, X: compose, schedule, post, public metrics.
- **Ads** — Google Ads and Meta: campaigns, daily spend/clicks/conversions, pause/resume, daily budget, matched audiences (opted-in people only, SHA-256 hashed).
- **Target accounts** — account-based marketing: companies scored 0–100 hourly from real activity; owners are told when one goes hot.

## Switching on the external networks (platform operator)

All optional. Without them the feature says plainly that it isn't available — nothing is simulated.

| Feature | Server environment | Notes |
|---|---|---|
| Facebook & Instagram posting, Meta ads | `META_APP_ID`, `META_APP_SECRET` | Meta app review for `pages_manage_posts`, `instagram_content_publish`, `ads_management` |
| LinkedIn company pages | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Needs the Community Management API product approved |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | Posting needs a paid X API tier |
| Google Ads | `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_API_VERSION` (default `v21`) | Developer token is approved by Google, usually over weeks; check the API version is current |
| WhatsApp campaigns | existing `META_WA_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID` | Templates must be approved by Meta |

OAuth return URLs to register with each network: `{PUBLIC_APP_URL}/pulse/social/callback/{meta|linkedin|x}` and `{PUBLIC_APP_URL}/pulse/ads/callback/{google|meta}`.

## Migrations

770–773, 780, 790, 900, 901 (Pulse numbers jumped to 900 to stay clear of concurrent work in the 78x–79x range).

## Not included

Abandoned-cart emails (no online checkout exists to detect a cart), heatmaps/session recording, webinars, a design editor, SEO rank tracking (the CMS covers on-page SEO), a social comment inbox, and creating new ads (done in each ad platform's own tools). LinkedIn post statistics need an analytics API approval most apps don't have, so Pulse shows none rather than guessing.

## Tests

`apps/api/src/tests/pulse-*.test.ts` — campaigns, journeys, attribution, social, ads & accounts. External networks are stubbed with their documented response shapes.
