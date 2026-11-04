# Commercial Model — Hudumika Platform Integration

**Last updated:** 2026-11-02

## Catalogue structure

### General-purpose tiers (existing)

| Code | Currency | Included seats | Active |
|---|---|---|---|
| starter | USD | per-seat | yes |
| professional | USD | per-seat | yes |
| finance | USD | per-seat | yes |
| scale | USD | per-seat | yes |
| enterprise | USD | per-seat | yes |
| starter-tzs | TZS | 2 flat | **no** (draft) |
| business-tzs | TZS | 8 flat | **no** (draft) |
| scale-tzs | TZS | 25 flat | **no** (draft) |

### Industry solution tiers (new, migration 663)

| Code | Industry | Currency | Included seats | Active |
|---|---|---|---|---|
| legal-tzs | Legal Services | TZS | 10 flat | **no** (draft) |
| logistics-tzs | Logistics & Courier | TZS | 15 flat | **no** (draft) |
| automotive-tzs | Automotive | TZS | 10 flat | **no** (draft) |
| privacy-tzs | Privacy & Data Protection | TZS | 5 flat | **no** (draft) |

**All prices are illustrative placeholders — NOT approved production inputs.** Per strategy §6 rule 11: "Prices, annual discounts, legal terms and tax rules from the HTML are not approved production inputs." Each industry package is `is_active = false` and requires SuperAdmin activation after real commercial terms are supplied.

## Feature key registry

### New app base keys

| Key | App | Granted at tier |
|---|---|---|
| `tuma` | Tuma (parcel logistics) | professional+ / business-tzs+ |
| `lexcore` | LexCore (legal) | professional+ / business-tzs+ |
| `ngao` | Ngao (privacy) | professional+ / business-tzs+ |
| `gereji` | Gereji (automotive) | professional+ / business-tzs+ |

### Sub-feature keys (advanced capabilities)

| Key | Description | Granted at tier |
|---|---|---|
| `tuma.dispatch` | Dispatch & route management | scale+ / scale-tzs |
| `tuma.settlement` | Agent float settlement | scale+ / scale-tzs |
| `lexcore.trust` | Trust account management | scale+ / scale-tzs |
| `lexcore.conflicts` | Conflict screening & KYC | scale+ / scale-tzs |
| `ngao.dpia` | Data protection impact assessments | scale+ / scale-tzs |
| `ngao.incidents` | Incident & breach management | scale+ / scale-tzs |
| `gereji.warranty` | Warranty claim tracking | scale+ / scale-tzs |

## Entitlement resolution

Access decision = `package_features` grant ∪ `tenant_addons` grant → `requireEntitlement()` middleware.

1. `middleware/entitlement.ts` checks if the tenant's current `package_code` grants the feature key via `package_features`.
2. If not, it checks `tenant_addons` for an active add-on granting that key.
3. If not, it checks `agency_managed_onsite_grants` for agency-managed tenants.
4. Unknown keys always fail (deny by default).

Industry packages are just regular `packages` rows with their own `package_features` grants — the entitlement middleware does not need industry-specific logic.

## Industry composition

`industry_registry` (migration 642) defines available industries. `industry_app_capabilities` maps each industry to its apps:

- **capability_key = 'core'** — essential for the industry workflow
- **capability_key = 'optional'** — recommended add-on

The `default_package_code` column on `industry_registry` (migration 663) links each industry to its draft package so the signup flow can auto-assign the right tier.

### Industry → app mapping

| Industry | Core apps | Optional apps |
|---|---|---|
| Legal Services | LexCore, FinOps | Ngao, Sign, Contacts, Calendar, Drive, Tasks |
| Privacy & Data Protection | Ngao | ComplyOS, Sign, Contacts, Drive |
| Logistics & Courier | Tuma | CargoTracker, FinOps, Contacts, SMS |
| Automotive | Gereji | FinOps, Inventory, Contacts |

## Commercial rules applied

Per strategy §6:

1. ✅ Business base charged once per contracted scope (one `packages` row per tenant).
2. ✅ Industry packs include dependencies — overlapping grants (finops, contacts, etc.) resolved as union.
3. ✅ Named users counted once (existing seat licensing model unchanged).
4. ✅ Unknown capabilities denied by default (`requireEntitlement()` middleware).
5. ✅ Price versions are immutable snapshots (`subscription_invoices.price_snapshot`, migration 635).
6. ✅ Existing subscribers keep contractual access (no existing `package_features` rows modified).
7. ✅ All new packages inserted as `is_active = false` (draft).

## Migrations

| Migration | Purpose |
|---|---|
| 659 | Base + sub-feature keys for professional/finance/scale/enterprise; app_status rows; industry_registry entries |
| 661 | industry_app_capabilities mapping for 4 industries |
| 662 | TZS tier grants (business-tzs, scale-tzs) |
| 663 | Industry solution draft packages; commercially_available flags; feature grants; default_package_code link |
