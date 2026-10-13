# Onsite — Provider Operation Map

Last updated: 2026-10-12

Honest accounting of which Onsite operations hit a real external API and which are local-only or seam stubs.

## Legend

| Symbol | Meaning |
|--------|---------|
| **REAL** | Calls a live external API. Works when credentials are connected. |
| **SEAM** | Adapter exists, correct API paths/payloads are coded, but cannot be tested without live provider credentials. |
| **LOCAL** | Operates entirely within the platform database; no external call. |

---

## Domain Registrar Operations

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Check availability | `GET /domains/registrar-check` | **SEAM** (4 registrars) | Namecheap XML API, Cloudflare REST, GoDaddy REST, Gandi REST. Falls back to RDAP (LOCAL) when no registrar connected. |
| Register domain | `POST /domains/request` | **SEAM** | Calls `registrar.register()` when connected; records as pending otherwise. |
| Transfer domain | `POST /domains/transfer` | **SEAM** | Calls `registrar.transfer()` when connected + EPP code provided. |
| Renew domain | `POST /domains/:id/renew` | **SEAM** | Calls `registrar.renew()`. |
| Get registrar info | `GET /domains/:id/registrar-info` | **SEAM** | Calls `registrar.getInfo()`, syncs expiry/nameservers locally. |
| Set nameservers | `POST /domains/:id/nameservers` | **SEAM** | Calls `registrar.setNameservers()` when connected; updates local record either way. |
| Unlock domain | `POST /domains/:id/unlock` | **SEAM** | Calls `registrar.unlock()`. |
| RDAP availability lookup | `GET /domains/search-lookup` | **REAL** | Queries RDAP registry servers directly (no credentials needed). |
| DNS zone management | `GET/POST/PUT/DELETE /dns/*` | **LOCAL** | Internal zone records stored in `onsite_dns_zones`/`onsite_dns_records`. |
| DNS import from Hostinger | `POST /provider-connections/:id/hostinger-dns/import` | **SEAM** | Calls Hostinger DNS API to read live records. |
| DNS publish to Hostinger | `POST /provider-connections/:id/hostinger-dns/publish` | **SEAM** | Pushes local zone records to Hostinger DNS API. |

## Hosting Operations (Hostinger)

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Get WordPress info | `GET /websites/:id/wordpress` | **SEAM** | Reads site inventory + WP endpoint from Hostinger API. |
| Install WordPress | `POST /websites/:id/wordpress/install` | **SEAM** | POSTs install payload to Hostinger. |
| Update WordPress | `POST /websites/:id/wordpress/update` | **SEAM** | Triggers WP core update via Hostinger API. |
| List plugins | `GET /websites/:id/wordpress/plugins` | **SEAM** | Reads plugin list from Hostinger. |
| Install plugin | `POST /websites/:id/wordpress/plugins` | **SEAM** | Sends slug to Hostinger plugin install endpoint. |
| Remove plugin | `DELETE /websites/:id/wordpress/plugins/:slug` | **SEAM** | Calls Hostinger plugin delete endpoint. |
| List databases | `GET /websites/:id/databases` | **SEAM** | Reads database list from Hostinger. |
| Create database | `POST /websites/:id/databases` | **SEAM** | Creates DB via Hostinger API. |
| Delete database | `DELETE /websites/:id/databases/:name` | **SEAM** | Deletes DB via Hostinger API. |
| Get SSH info | `GET /websites/:id/ssh` | **SEAM** | Reads SSH host/port/username from site inventory. |
| List SSH keys | `GET /websites/:id/ssh` (included) | **SEAM** | Reads SSH key list from Hostinger. |
| Add SSH key | `POST /websites/:id/ssh/keys` | **SEAM** | Posts public key to Hostinger. |
| Remove SSH key | `DELETE /websites/:id/ssh/keys/:keyId` | **SEAM** | Deletes key via Hostinger API. |
| Reset SSH password | `POST /websites/:id/ssh/reset-password` | **SEAM** | Calls Hostinger password reset endpoint. |
| Traffic analytics | `GET /websites/:id/analytics` | **SEAM** | Reads analytics from Hostinger. |

## CI/CD Operations

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Trigger deployment | `POST /deployments/:id/trigger` | **SEAM** (4 providers) | CircleCI, GitHub Actions, Cloudflare Pages, DigitalOcean App Platform. |
| Poll deployment status | job: `onsite-deployment-sync` | **SEAM** | Polls provider-specific status API every 30s during active deployments. |
| Verify provider connection | `POST /provider-connections/:id/verify` | **SEAM** | Calls provider's "who am I" endpoint to validate credentials. |

## Email Operations

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Create email domain | `POST /email-domains` | **LOCAL** | Records domain + provider in `onsite_email_domains`. |
| Verify email DNS | `POST /email-domains/:id/verify` | **REAL** | Queries MX, SPF, DKIM, DMARC via DNS resolution. |
| Create mailbox | `POST /email-domains/:id/mailboxes` | **LOCAL + REAL** | Stores in `onsite_email_mailboxes`. When provider=platform and type=mailbox with a linked user, auto-provisions a `user_email_accounts` row with IMAP/SMTP settings for the Email app. |
| Delete mailbox | `DELETE /email-domains/:id/mailboxes/:id` | **LOCAL + REAL** | Removes record. When the deleted mailbox was provisioned to the Email app, deprovisions (disables IMAP, resets send_protocol). |
| Mailbox status | `GET /mailbox-status` | **LOCAL** | Reads workspace's Gmail/Outlook OAuth connection status. |

## Backup & Restore

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Create snapshot | job: `onsite-backup` | **LOCAL** | Serialises all 14+ onsite tables + email tables to JSON. |
| Restore snapshot | `POST /backups/:id/restore` | **LOCAL** | Upserts from JSON snapshot (FK-ordered). |

## SSL

| Operation | Route | Status | Notes |
|-----------|-------|--------|-------|
| Check SSL status | `POST /ssl/check` | **REAL** | TLS handshake to port 443, reads certificate expiry/issuer. |
| SSL record management | CRUD on `onsite_ssl_certificates` | **LOCAL** | Tracks certificate metadata; does not provision certificates. |

---

## What "SEAM" means in practice

Every SEAM operation has:
1. A real adapter class with correct API base URL, authentication header, request/response mapping.
2. Error handling that surfaces the provider's error message.
3. A resolver (`resolveRegistrar`, `resolveHostingProvider`, `resolveCIProvider`) that decrypts the tenant's stored credentials and returns the correct adapter.
4. An audit event emitted on mutation.

What it does NOT have:
- Live testing against a real provider account (no test credentials exist in this environment).
- Provider-specific edge case handling beyond what the API documentation covers (e.g., Namecheap sandbox vs production mode switching, Hostinger rate limiting).

To promote a SEAM to REAL: connect a provider in Onsite Settings, verify the connection succeeds, then exercise the operation. The code path is identical — the only difference is whether credentials resolve.
