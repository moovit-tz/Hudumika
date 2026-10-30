# Phase 0 — Baseline Inventory & Gap Matrix

Produced 28 October 2026 for the Hudumika commercial plan implementation brief.

## 1. Current Package Catalog (as of migration 275 + 366 + 393 + 489 + 504)

| Code | Name | Status | $/seat/mo | Annual/seat | max_users | items/mo | storage | AI credits | BYOK |
|------|------|--------|-----------|-------------|-----------|----------|---------|------------|------|
| starter | HuduStarter | **active** | $6 | $25.20/yr ($2.10/mo) | 300 | 100 | 10 GB | per packages row | N |
| growth | HuduPlus | **active** | $18 | $84/yr ($7/mo) | 300 | 500 | 50 GB | per packages row | N |
| enterprise | Hudu Advanced | **active** | custom | custom | 0 (unlimited) | unlimited | unlimited | per packages row | Y |
| free | HuduFree | dormant | $0 | $0 | 1 | 25 | 1 GB | — | N |
| scale | (legacy) | deactivated | — | — | — | — | — | — | — |
| onsite-standalone | (legacy) | deactivated | — | — | — | — | — | — | — |
| agency-managed | (agency) | special | — | — | — | — | — | — | — |
| operations | (legacy) | type only | — | — | — | — | — | — | — |
| finance | (legacy) | type only | — | — | — | — | — | — | — |
| professional | (legacy) | type only | — | — | — | — | — | — | — |

**Currency**: All prices are USD throughout. `subscription_invoices.currency` defaults to `'USD'`.

**Add-ons** (package_addons table):
- `onsite` — $9/mo, $75.60/yr, grants `onsite` feature key
- `ondi.governance` — separate add-on (migration 387)

## 2. Proposed Commercial Catalog

| Public package | Monthly TZS | Annual TZS | Included users | Locations |
|----------------|------------:|----------:|---------------:|----------:|
| Starter | 29,900 | 299,000 | 2 | 1 |
| Business | 99,000 | 990,000 | ~8 | ~3 |
| Scale | 299,000 | 2,990,000 | ~25 | ~10 |

Only these three are public. Enterprise exists as negotiated overrides on Scale.

## 3. Requirement → Source → Behavior → Gap Matrix

### 3.1 Package Model & Pricing

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 1 | Three public packages (Starter/Business/Scale) in TZS | `packages` table, mig 275 | 3 active USD packages: starter, growth, enterprise. Codes don't match proposed names. | Code mismatch: proposed "Business" ≈ current "growth", proposed "Scale" is a recycled deactivated code. No TZS pricing columns. | Add `currency`, `price_flat_monthly`, `price_flat_annual` columns. Map starter→Starter, growth→Business, create new Scale. Keep enterprise for negotiated contracts. | New migration adds columns + updates/inserts rows. Existing tenants on `growth` become `business` (or alias). |
| 2 | Flat price with included seats (not pure per-seat) | `packages.price_per_seat`, `subscription-billing.service.ts:computePlanAmount()` | Pure per-seat: `price_per_seat × seat_count`. No concept of "included seats." | Fundamental model change: proposed is flat + overage, not per-seat. 29,900 TZS includes 2 users; extra users cost extra. | Add `included_seats` column. Modify `computePlanAmount()` to: flat price for ≤included_seats, then extra_seat_price per seat above. | Billing service change + migration. Existing per-seat invoices must not be retroactively recalculated. |
| 3 | Annual billing (12-month periods) | `packages.annual_price` exists; `periodBounds()` in billing service | `periodBounds()` always returns calendar-month start/end. No annual period logic. `subscription_invoices` has no `billing_cycle` column. `tenants` table has no `billing_cycle`. | No annual period tracking anywhere in the recurring billing pipeline. Annual price exists on the catalog but is only used at signup (`onboarding.service.ts:258`). | Add `billing_cycle` to `tenants` + `subscription_invoices`. Extend `periodBounds()` for annual periods. Handle leap year, month-end. | Migration adds columns. Backfill existing tenants as `monthly`. |
| 4 | Price snapshots for historical invoices | None | Changing a package's price in the catalog immediately affects future `generatePeriodInvoice()` calls. No snapshot/version mechanism. | If a SuperAdmin changes prices, every tenant's next invoice silently uses the new price. No grandfathering. | Add `price_snapshot` jsonb to `subscription_invoices` or a separate `package_price_versions` table with effective dates. | Migration + billing service changes. |
| 5 | Location limits per plan | None | No `max_locations` column on `packages`. No enforcement anywhere. Grep for `max_locations` returns zero hits. | Completely missing. | Add `max_locations` to `packages`. Add enforcement in location creation routes/services. | Migration + route-level checks. |
| 6 | Seat limits enforced on APIs/invites/imports | `packages.max_users` exists | `max_users` exists on the catalog (300 for starter/growth) but **not enforced** — no check in user invitation, bulk import, or team management routes. Only the client-side seat count display references it. | Enforcement gap. The limit exists in data but no server code checks it. | Add `checkSeatLimit()` middleware or service check to invitation, user creation, and import endpoints. | Code change only, no migration. |
| 7 | TZS currency throughout | All USD | `subscription_invoices.currency` defaults 'USD'. `computePlanAmount()` uses USD prices. `Subscription.tsx` shows USD with TZS equivalent via FX conversion. | No native TZS billing. Display-only TZS via FX conversion exists. | Either: (a) add TZS price columns and bill in TZS natively, or (b) bill in TZS using live FX from USD base. Option (a) is what the brief proposes. | Migration adds TZS columns or replaces USD prices. |

### 3.2 Subscription Lifecycle

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 8 | Upgrade/downgrade between plans | `tenants.plan` column only | Only mechanism is a direct UPDATE of `tenants.plan`. No proration, no lifecycle events, no downgrade protection. | No upgrade/downgrade API, no proration logic, no "pending downgrade at period end" state. | Build plan-change service with proration rules, effective-date logic, and event logging. | New route + service. Migration for plan_change_history table. |
| 9 | Grace period for failed payments | `subscription_invoices.dunning_stage` (0-4), `subscription-billing.job.ts` | 4-stage dunning ladder: stage 1 at +1 day, stage 2 at +7, stage 3 at +14, stage 4 at +21. Auto-charge via Petti wallet at stages 1-2. Stage 4 = billing lock. | Dunning exists and works. **No gap for the mechanism itself.** Policy gap: what happens between stages? Is there a grace period before any restriction? Brief says "approved policies" needed. | Reuse dunning. Add configurable grace days before first restriction. | Policy decision, minor code change. |
| 10 | Never delete data on downgrade | None | No downgrade logic exists at all, so no deletion either. | Absence of risk (no downgrade code to be dangerous), but also absence of the feature. When building downgrade, must ensure read-only access to over-limit data, never deletion. | Design constraint for the upgrade/downgrade service. | N/A |
| 11 | Renewal / expiry states | `subscription_invoices.status`: due/paid/overdue/cancelled | Monthly invoices auto-generated by daily job. No explicit "renewal" event or "expired subscription" state beyond dunning stage 4. | No explicit renewal event. No annual renewal. No subscription expiry date on tenants. | Add `subscription_expires_at` to tenants (for annual). Add renewal invoice generation for annual subscribers. | Migration + job extension. |

### 3.3 Entitlements & Feature Gating

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 12 | Starter: basic finance/POS/inventory, CRM, invoices, tasks, reporting | `package_features` table, mig 060/213/529 | **All packages grant all feature keys.** Migration 060 seeded every base feature to every tier. 213 added 9 more apps to every package. No tier differentiation. | Every plan gets everything. Proposed Starter should only get basic modules. | Remove advanced feature grants from starter/Starter package_features rows. Keep `finance.core` but remove `finance.accounting.advanced`, etc. | Migration removes specific (package_code, feature_key) rows. |
| 13 | Business: advanced finance, purchasing, HR, manufacturing, automation | Same as above | Same — all granted to all. | Need to differentiate Business from Starter by granting advanced features to Business but not Starter. | Add/keep the right grants for Business (≈ current growth's grant set, minus the ones that should be Scale-only). | Migration adjusts rows. |
| 14 | Scale: everything including consolidation, advanced controls, higher API | Same | Same | Scale should have everything. Currently all tiers do, so Scale's grants stay as-is. The work is *removing* from Starter/Business. | Keep Scale's grants complete. | No migration for Scale specifically. |
| 15 | Feature keys exist for every differentiable module | `ALL_FEATURE_KEYS` in `packages/types/src/entitlements.ts` | 40+ keys exist covering most apps and finance sub-features. | Possible gaps: no separate keys for "basic reporting" vs "advanced reporting", "basic automation" vs "advanced automation". Need to audit against the proposed tier matrix. | Add any missing feature keys. | Types change + migration to seed grants. |
| 16 | Commercial availability flag | None | Features are either entitlement-gated or always-on. No concept of "commercially available" vs "exists but not sellable." | Missing entirely. A feature can be technically built but not ready for a paying customer. | Add `commercially_available` boolean to `app_status` or a new `feature_availability` table. | Migration. |

### 3.4 Billing Infrastructure

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 17 | Monthly invoicing with real payment | `subscription-billing.service.ts`, `billing.routes.ts`, `subscription-billing.job.ts` | Daily job generates monthly period invoices. Pay flow: Petti wallet = real deduction; configured Flutterwave gateway = hosted checkout redirect; no gateway + non-prod = simulated. | **Works for monthly USD.** Needs TZS support and annual period support. | Extend, don't replace. | Code changes to billing service. |
| 18 | Payment via mobile money (M-Pesa, Airtel, Mixx) | `payment-gateway.ts` (Flutterwave v3 adapter) | Flutterwave's hosted checkout supports mobile money natively (it's a payment method selection on their hosted page). `StepPackage.tsx` already shows M-Pesa/Airtel/Mixx logos. | Flutterwave already handles mobile money — **no gap in the adapter**. The gap is that `PaymentGateway.isConfigured()` returns false without `FLW_SECRET_KEY`, and onboarding throws 501 if it IS configured. | Wire the real Flutterwave flow for production. Onboarding's 501 throw is a deliberate staging gate, not a bug. | Configuration, not code. |
| 19 | Webhook verification & idempotency | `billing-webhooks.routes.ts` | Flutterwave signature verification + `billing_webhook_events` dedup table. Cross-tenant invoice lookup by tx_ref. On processing error: deletes dedup row so redelivery works. | **Solid.** One concern: deleting the dedup row on error means a partial-success (e.g. invoice settled but notification failed) could re-settle. | Review the error-recovery path for partial success scenarios. | Minor code audit. |
| 20 | Subscription vs provider vs implementation invoices distinguishable | `subscription_invoices.kind` ('period'/'proration') | Only subscription invoices exist. No provider consumption or implementation-service invoice types. | Missing invoice types for external services and professional services. | Extend `kind` enum or create separate tables for provider/service invoices. | Future Phase 2/4 work. |

### 3.5 Usage & Quotas

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 21 | Monthly item limits enforced | `lib/usage.ts`, `tenant_usage_counters` | Per-tenant monthly counter incremented by onResponse hook. `checkAppUsageLimit()` checks against `packages.monthly_item_limit`. Unmetered prefixes for auth/settings/etc. | **Works.** Existing enforcement is real and server-side. | Reuse as-is. Update limits in package catalog to match proposed tiers. | Catalog data change only. |
| 22 | Storage quotas enforced | `lib/storage-quota.ts` | Plan base + add-on storage. `BILLING_LOCK_STAGE = 4` blocks uploads at dunning stage 4. | **Works.** | Reuse. Update storage limits in catalog. | Catalog data change. |
| 23 | AI credit allowances | `lib/ai-credits.ts`, `agent_credit_ledger`, mig 489 | Monthly allowance from `packages.monthly_ai_credits`. BYOK gating: enterprise only. Flat 1 credit/call. | **Works but conflict with proposed model.** Brief says external services should be a TZS balance, not opaque credits. Historical BYOK restriction conflicts with the proposal. | Phase 2 work: migrate AI credits to TZS-denominated external services balance. Grandfathering policy needed. | Requires deliberate transition plan. |
| 24 | Seat who-counts policy | No explicit policy | `useSeatCount()` calls `/v1/settings` which returns active user count. No definition of what "counts as a seat" — all users count equally. | No policy for: customer portal users, machine identities, deactivated users. Brief says "do not charge customer portal users or machine identities." | Add seat-counting logic that excludes CUSTOMER-role users and API keys from the billable seat count. | Code change in settings route + billing service. |

### 3.6 External Services Balance (Phase 2 — inventory only)

| # | Requirement | Existing Source | Observed Behavior | Gap | Reuse/Change | Migration Impact |
|---|------------|----------------|-------------------|-----|-------------|-----------------|
| 25 | TZS prepaid balance for external services | `agent_credit_ledger` (mig 489) | AI-only, count-based (not TZS), monthly reset. Not a general-purpose ledger. | **Not reusable as-is.** Need a new TZS-denominated, append-only ledger with reservation/capture semantics. | New tables and service. Preserve `agent_credit_ledger` history during transition. | Phase 2 migration. |
| 26 | Provider credential ownership tracking | Encrypted credential store exists for OAuth (OneDrive, Google, etc.) | Per-tenant encrypted secrets for OAuth flows. No "customer-owned vs platform-managed" distinction. | No ownership field on credentials. | Add ownership tracking. | Phase 3 migration. |

## 4. Decisions Ledger — Policies Requiring Owner Decision

These cannot be inferred from code or the brief. Represented as unpublished configuration / explicit release blockers.

| # | Decision | Options | Impact if Unresolved | Default Until Decided |
|---|----------|---------|---------------------|----------------------|
| D1 | Exact Business/Scale seat limits | Brief says "about 8" and "about 25" | Can't enforce limits or price overages | Use 8 and 25 as placeholders, flag as draft |
| D2 | Exact Business/Scale location limits | Brief says "about 3" and "about 10" | Can't enforce | Use 3 and 10 as placeholders |
| D3 | Extra seat/location prices (overage beyond included) | Not specified | Can't bill overages | Block at limit (no overage billing) until decided |
| D4 | TZS pricing: tax-inclusive or tax-exclusive? | Tax included vs excluded from 29,900/99,000/299,000 | Affects displayed price, invoice math, compliance | Treat as tax-inclusive (brief says "Tax: Included" in billing UI) |
| D5 | Annual renewal policy | Auto-renew with 30-day notice? Manual renewal? | Affects annual billing job logic | Auto-renew with configurable notice period |
| D6 | Upgrade proration method | Credit remaining days proportionally? Immediate full-month charge? | Affects plan change billing | Credit remaining period proportionally |
| D7 | Downgrade timing | Immediate or at period end? | Affects when features are restricted | Downgrade takes effect at current period end |
| D8 | Trial/grace period before first charge | 0 days / 7 days / 14 days / 30 days? | Affects onboarding conversion | No free trial (brief doesn't mention one); existing dunning provides payment grace |
| D9 | Currency/FX policy | Bill in TZS natively? Or USD with TZS display? | Fundamental billing architecture | Bill in TZS natively per brief |
| D10 | Retail rounding for TZS | Round to nearest 100 TZS? Nearest TZS? | Display and billing precision | Round to whole TZS (no decimals, TZS has no subunit in practice) |
| D11 | AI BYOK transition | Grandfather existing enterprise BYOK? Migrate to TZS-denominated? | Existing enterprise tenants may lose BYOK access | Preserve existing BYOK grants until explicit migration |
| D12 | Module boundaries: which features are Starter vs Business vs Scale | Brief gives categories but not feature-key-level mapping | Can't narrow package_features grants | Document proposed mapping, implement after approval |
| D13 | Annual discount percentage | Brief shows ~10× monthly (≈17% discount). Current DB has 30% discount. | Pricing inconsistency | Use brief's prices (annual = 10× monthly) |
| D14 | Negotiated Scale overrides mechanism | Per-tenant price override? Contract table? | Enterprise/Scale custom deals can't be tracked | Use existing `platform_transactions` + tenant-level overrides |

## 5. Migration / Backfill Plan

### Phase 1 Migration (new sequential migration)

```
-- 1. Schema changes to packages table
ALTER TABLE packages ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS included_seats INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS max_locations INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_flat_monthly NUMERIC(12,2);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_flat_annual NUMERIC(12,2);

-- 2. Schema changes to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) DEFAULT 'monthly';

-- 3. Schema changes to subscription_invoices
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) DEFAULT 'monthly';
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS price_snapshot JSONB;

-- 4. Insert new TZS packages (proposed names, keeping legacy codes alive)
-- Starter: reuse 'starter' code, update with TZS pricing
-- Business: reuse 'growth' code OR create 'business' code
-- Scale: create new 'scale' code (was deactivated)

-- 5. Backfill existing tenants: billing_cycle = 'monthly'
-- 6. Preserve existing contracts: don't change any tenant's current plan code
```

### Code Changes Required

1. **subscription-billing.service.ts**: `periodBounds()` — handle annual periods; `computePlanAmount()` — handle flat + included seats model; `generatePeriodInvoice()` — store price snapshot
2. **billing.routes.ts**: No structural changes, just currency awareness
3. **entitlements.routes.ts / middleware/entitlement.ts**: No changes for Phase 1 (feature differentiation is a separate migration of package_features rows)
4. **usage.ts**: No changes (limits come from packages table)
5. **Subscription.tsx**: TZS native display, annual billing UI, plan change UI
6. **StepPackage.tsx**: TZS prices, updated package names
7. **New route**: Plan upgrade/downgrade endpoint
8. **New enforcement**: Seat limit check on user invitation/creation, location limit check on location creation

## 6. Acceptance Matrix

| Test | Phase | Automated | Manual |
|------|-------|-----------|--------|
| Exact configured prices/periods match catalog | 1 | API test: GET /v1/packages returns correct TZS prices | — |
| Duplicate job/callback safety | 1 | Existing: billing-webhooks dedup test | — |
| Annual renewal generates correct invoice | 1 | API test: annual tenant, advance clock, verify invoice | — |
| Pending/failed payment dunning | 1 | Existing dunning tests + new annual dunning | — |
| Quota race (concurrent seat additions) | 1 | Concurrent invitation test | — |
| Cross-tenant denial | 1 | RLS test: tenant A can't see tenant B's invoices | Existing RLS enforcement |
| Legacy contract preservation | 1 | Verify: existing tenants' plan codes unchanged after migration | — |
| Mobile/keyboard onboarding journey | 1 | — | Browser test at 375px width |
| Per-seat × included seats math | 1 | Unit test: flat price for ≤included, overage above | — |
| Location limit enforcement | 1 | API test: create locations up to and past limit | — |
| Price snapshot on historical invoice | 1 | Verify: changing catalog price doesn't alter past invoices | — |

## 7. First-Launch Scope (What's Sellable After Phase 1)

**Sellable**: Three public TZS packages with monthly billing, seat and location limits, item and storage quotas, payment via Flutterwave (mobile money + card).

**Not sellable until Phase 2+**: External services balance, provider metering, AI consumption billing.

**Not sellable until Phase 3+**: BYOK management, provider credential ownership, per-provider billing.

**Release blockers (must be resolved before any public pricing)**:
1. Decisions D1-D4 (exact limits, overage prices, tax treatment) — can't publish prices without these
2. Annual billing implementation — brief's annual prices are a core selling point
3. Seat limit enforcement — can't sell "2 included users" if there's no enforcement
4. Feature differentiation — can't sell "basic" vs "advanced" if all plans grant everything

**Not a blocker** (existing and working):
- Monthly invoicing pipeline
- Flutterwave payment gateway adapter (mobile money included)
- Dunning ladder (4-stage)
- Usage metering (item counts)
- Storage quotas
- Webhook verification & idempotency
