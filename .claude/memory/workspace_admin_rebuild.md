---
name: workspace-admin-rebuild
description: "Tenant Workspace admin (Settings/Utilities/Reports/Subscription) was audited and rebuilt to be fully API-connected — recurring \"save-without-rehydrate\" bug pattern and new backend systems added"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9bf459c6-d26c-4db4-8d42-19b5459154ec
  modified: 2026-07-27T07:38:37.554Z
---

Audited and fixed `/workspace/*` (apps/web/src/shells/AdminShell.tsx: Settings.tsx, Utilities.tsx, Reports.tsx, Subscription.tsx) end-to-end — the tenant-level admin console, distinct from the platform SuperAdmin console at `/admin`.

**Recurring bug pattern found**: `Settings.tsx`'s `SettingsCtx` fetches `GET /v1/settings` async into `s`, but ~25 of ~30 sections seeded local form state with plain `useState(hardcoded defaults)`, which only reads its initializer once — so saves genuinely persisted to Postgres but never showed back up on reload. Fixed via a new `useSettingsFields(key, defaults)` hook (ref-guarded one-time hydration from `s[key]`) applied across the file. **Why it matters**: if a future page in this app has a "Save" button that shows a checkmark but the form resets to defaults on reload, check for this exact pattern first — it's not a persistence bug, it's a missing-rehydration bug.

Also found 3 separate, mutually contradictory "which modules are enabled" toggle UIs (Settings.tsx ModulesSection, Subscription.tsx ModulesTab, both fake/local-only; Utilities.tsx had the one real implementation via `useEntitlements()` + `PATCH /v1/settings {'enabled-apps':...}`). Consolidated all three onto the real one. **How to apply**: [[antigravity_review_pattern]] already tracks "fabricated data, hand-rolled dropdowns" as a recurring issue class in this codebase — add "duplicate/contradictory settings UIs for the same underlying toggle" to that pattern list.

**New backend systems built this session** (all real, live-verified via curl, no fabricated success states):
- Real TOTP 2FA (`apps/api/src/lib/totp.ts`, RFC 6238, no external dep) — gates `/auth/login` for real (returns `{requires_2fa:true}` then requires a valid code), routes under `/v1/security/2fa/*`.
- Real per-session revocation — JWT gained a `device_id` claim (the `hr_devices` row from login), checked live every request in `middleware/auth.ts`; self-service list/revoke under `/v1/security/sessions*`.
- Real subscription billing — `payment_methods`, `subscription_invoices`, `invoice_sequences` tables; routes under `/v1/billing/*`; invoice amounts computed from real `packages.price_per_seat × active seat count`.
- Real platform-support tickets (`platform_support_tickets/messages`, `/v1/platform-support/*`) — tenant-admin ↔ Hudumika-the-platform, distinct from `support_tickets` (tenant's own customer helpdesk).
- Real atomic document numbering (`apps/api/src/lib/doc-numbering.ts`, `invoice_sequences` table) replacing `INV-${Date.now()}`/`PO-${Date.now()}` fallbacks — wired into `invoices.routes.ts` and `purchase-orders.routes.ts`.
- Fixed a real latent bug: `EmailIntegration.sendEmail` read `settings.email.smtp_host`/`email_protocol` etc., but Settings.tsx's EmailSection saved `settings.email.host`/`protocol` — completely different key names, so tenant SMTP config was NEVER actually used by the real email-sending path even when "saved". Aligned the reader to the writer's field names.
- Real SMS integration (`apps/api/src/integrations/sms.ts`, Africa's Talking + Twilio) replacing a `console.log`-only mock in `messaging.service.ts`.
- Notification thresholds (`demurrage_alert_days`, `sla_reminder_hours`) and freight settings (`free_time_days`, `auto_risk_flags`) wired into `shipment.service.ts`'s real risk-flag engine — previously saved to Postgres but never read by anything.

**Explicit scope boundary** (stated to the user, not silently skipped): Settings.tsx's 14-provider Payment Gateways screen now persists/rehydrates for real and has a genuine live "Test Connection" for 5 providers with simple key-based REST APIs (Stripe/Paystack/Flutterwave/Razorpay/PayPal) — but there's no real live *payment processing* through any of the 14, since that needs real merchant credentials nobody has. Subscription "Pay Now" uses the pre-existing house-style `PaymentsIntegration.simulateCharge` (real Luhn/expiry/CVC validation, honestly-labeled simulation, same pattern already used by onboarding).

**How to apply**: if asked to audit another app in this platform for "is this actually functional," use this same methodology — grep the target page's own save/fetch calls, then grep the corresponding API route file for whether anything ever *reads* what gets saved. A generic JSONB settings PATCH endpoint (like `settings.routes.ts`) will make ANY key "succeed" whether or not it's real, so a successful save is not evidence the feature is real.
