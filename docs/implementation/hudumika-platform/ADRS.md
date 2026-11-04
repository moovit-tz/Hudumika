# Architecture Decision Records — Platform Integration

## ADR-001: LexCore is the canonical fork, not Ngao

**Status:** Accepted
**Date:** 2026-11-02

**Context:** LexCore and Ngao share 99.96% of their code (only 5 files differ out of ~130). Both contain ALL models for both legal and privacy domains.

**Decision:** Port LexCore's code as the single shared backend.

**Rationale:**
1. LexCore has a proper `setErrorHandler` with Prisma error code handling; Ngao leaks raw errors.
2. LexCore's Flutterwave webhook verification uses the correct static-hash comparison; Ngao uses HMAC (wrong — Flutterwave doesn't HMAC-sign webhooks), so every legitimate webhook would be rejected.
3. LexCore's config schema includes `FLUTTERWAVE_SECRET_HASH`; Ngao's doesn't.
4. Ngao's billing routes still say "LexCore Starter" — it was never rebranded.

**Consequence:** One backend, two app shells. The product distinction (law firm ERP vs PDPC compliance tool) lives in navigation, entitlements, and branding — not in the data model.

---

## ADR-002: Two app shells for one legal/privacy domain

**Status:** Accepted
**Date:** 2026-11-02

**Context:** The 37 Prisma models include both legal (matters, court cases, trust, KYC) and privacy (assessments, ROPA, incidents, DSR) models, all in one schema.

**Decision:** Register two app IDs (`lexcore`, `ngao`) with distinct nav configs and entitlement gates, but shared API routes and database tables.

**Rationale:**
- A law firm cares about matters, court diary, timesheets, trust accounting.
- A DPO cares about gap assessments, ROPA, breach response, vendor oversight, training.
- Both may want document signing, alerts, and org settings.
- The database is the same — a tenant that subscribes to both gets one set of tables, two app entry points.

**Consequence:** Entitlement keys `lexcore` and `ngao` gate access independently. API routes are under `/v1/legal/` (shared), with app-shell-specific nav determining which features are visible.

---

## ADR-003: Tuma int PKs → Hudumika UUID PKs

**Status:** Accepted
**Date:** 2026-11-02

**Context:** Tuma uses integer autoincrement primary keys (Prisma default). Hudumika uses UUID v4 PKs throughout (Kysely `defaultTo(sql'gen_random_uuid()')`).

**Decision:** All new Tuma-domain tables in Hudumika use UUID PKs, matching the platform convention.

**Rationale:**
- Consistency with Hudumika's existing 676+ migrations.
- UUIDs prevent enumeration attacks (Tuma's int PKs leak information about record count).
- No data migration from Tuma's production DB is in scope — we're porting the design, not importing records.

**Consequence:** Foreign key references change shape. Tuma's `senderId: Int` becomes `sender_id: UUID REFERENCES users(id)`. All Tuma API responses use UUIDs.

---

## ADR-004: Tuma's separate User/Admin tables → unified users table

**Status:** Accepted
**Date:** 2026-11-02

**Context:** Tuma has `User` (agents with SUPER_AGENT/AGENT/TRIP_AGENT roles) and `Admin` (platform staff with ADMIN/OPS/OWNER roles) as separate tables with separate auth middleware.

**Decision:** Use Hudumika's single `users` table with role-based access.

**Rationale:**
- Hudumika already has a mature RBAC system with fine-grained permissions.
- Two user tables means two auth paths, two activity logs, two token invalidation systems — all of which Hudumika already solved once.
- Tuma's Admin.companyId (unique, one admin per company) maps to a user with an OWNER role and a tenant_id.

**Consequence:** Tuma's 6 roles map to Hudumika user roles. The permission catalog (26 permissions from `permission-catalog.js`) is imported as entitlement/feature keys.

---

## ADR-005: Float system is Tuma-domain-specific, not a platform feature

**Status:** Accepted
**Date:** 2026-11-02

**Context:** Tuma's float system (prepaid agent balance, commission deduction, pool sharing) is central to its business model but has no analogue in legal, privacy, customs, or other Hudumika apps.

**Decision:** Build float as Tuma-domain tables (`tuma_float_accounts`, `tuma_float_transactions`, etc.) under the `tuma` app's ownership. Do not promote to a platform-wide "wallet" feature.

**Rationale:**
- Float is a parcel-logistics-specific concept (agents pre-pay to receive parcels).
- Hudumika already has Petti (petty cash wallet) with a different model (deposit/request/approve/disburse).
- Forcing float into Petti's model would distort both.
- If a future "platform wallet" is needed, it's a separate decision with its own ADR.

**Consequence:** Float tables get `tuma_` prefix. Float routes live under `/v1/tuma/float/`. Float settings, transactions, and ledger are Tuma-scoped.

---

## ADR-006: Trust money segregation is non-negotiable

**Status:** Accepted
**Date:** 2026-11-02

**Context:** LexCore's `TrustAccount` and `TrustTransaction` model client trust/escrow funds. Tanzania's Advocates Act requires trust money to be kept in a separate bank account, with an auditable ledger, and never commingled with a firm's business cash.

**Decision:** Trust accounts and transactions are their own tables with a hash-chained ledger. Trust movements post to a dedicated GL account (LIABILITY). Trust payments require maker-checker approval (workflow engine).

**Rationale:**
- Legal requirement — a trust shortfall is a disciplinary offence.
- The hash chain (`hashPrev`, `hashSelf`) provides tamper evidence.
- Hudumika's GL already supports liability accounts; trust is wired to it but never blended with revenue/expense accounts.

**Consequence:** Trust is a first-class entity, not a sub-ledger of FinOps invoicing. The maker-checker for trust payments uses Hudumika's existing workflow infrastructure (Studio workflows or a lightweight approval table).

---

## ADR-007: Legal invoices are separate from FinOps sales invoices

**Status:** Accepted
**Date:** 2026-11-02

**Context:** LexCore's `LegalInvoice` has fields FinOps's `sales_invoices` doesn't: WHT (withholding tax) at the line level, line types (TIME/DISBURSEMENT/FIXED_FEE), and matter linkage.

**Decision:** Create `legal_invoices` and `legal_invoice_lines` as separate tables. Both types of invoice post to the same GL, but the domain tables are distinct.

**Rationale:**
- A legal invoice is generated from a pre-billing report (unbilled time + disbursements per matter). This is fundamentally different from a sales invoice for goods/services.
- Extending `sales_invoices` with legal-specific nullable columns would be schema pollution.
- Both invoice types share the same fiscal receipt submission (TRA VFD) and the same GL posting logic — the shared layer is finance, not the invoice entity.

**Consequence:** Legal invoices have their own CRUD routes. The GL posting helper accepts either invoice type.

---

## ADR-008: Tuma booking offices extend Hudumika's location model

**Status:** Accepted
**Date:** 2026-11-02

**Context:** Tuma has Country → Region → District → BookingOffice. Hudumika has basic country data and some HuduFreight location references, but no structured district/office hierarchy.

**Decision:** Add `tuma_districts` and `tuma_booking_offices` as new tables. Reuse Hudumika's existing country reference. Consider `tuma_regions` or reuse HuduFreight's region concept if structurally compatible.

**Rationale:**
- Tuma's geography is Tanzania-specific (regions = Dar es Salaam, Dodoma, Arusha, etc.).
- HuduFreight tracks routes differently (port-to-port, container yards).
- Forcing Tuma's district/office hierarchy into HuduFreight's model would distort both.

**Consequence:** Location tables get `tuma_` prefix. The country FK resolves to the platform's country table.
