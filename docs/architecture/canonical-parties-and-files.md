# Canonical parties and files

**Status:** Accepted, incremental rollout  
**Date:** 2026-09-23

## Decision

Hudumika uses one tenant-scoped Party identity for each external person or organization and one Cloud file identity for each stored object. Applications own contextual records and point to these identities. Internal employees remain `users`/HR records and are displayed by reference.

The pre-existing platform `organizations` table is not reused as the tenant directory: it intentionally represents cross-tenant organization-portal identity. Tenant A's Acme and Tenant B's Acme remain isolated unless a separate, verified platform-linking workflow explicitly connects them.

## Current ownership audit

| Area | Existing state | Classification | Canonical direction |
|---|---|---|---|
| Users / HR | `users` plus HR tables | Canonical | Remains internal identity source |
| Contacts | `contacts`, multi-email/phone tables, labels | Partial / reusable | Compatibility view over PERSON Party |
| Customers / partners | `customers` mixes organization identity and commercial context | Duplicated / partial | ORGANIZATION Party plus app context |
| Platform organizations | Cross-tenant org login identity | Canonical for org portal only | Kept separate |
| CRM leads | Copies company and person strings | Provisional / duplicated | Nullable person/org Party references, snapshots retained |
| Suppliers | Independent identity fields | Legacy | Later compatibility reference to ORGANIZATION Party |
| Employees in Contacts | Read from `users` directory | Reusable | No employee duplication |
| Cloud | `cloud_files`, versions, permissions, object storage | Canonical | Remains file owner |
| App attachments | Mix of Cloud ids, legacy attachment tables and entity tags | Partial / duplicated | `resource_file_links` with compatibility adapters |
| Activity | `domain_events` plus app-specific logs | Partial / reusable | Permission-aware aggregation, not frontend fan-out |

## Security invariants

- Every new row has `tenant_id`, explicit query filters, RLS and forced RLS.
- Private/explicit contacts are server-filtered; knowing a UUID does not grant access.
- Generic file links never grant file access. The Cloud drive permission check remains authoritative.
- Merge, link and backfill operations are transactional and preserve legacy identifiers.
- User-entered external identities never cross-link tenants automatically.
- Legal/financial records may retain immutable display snapshots even when their Party changes.

## Compatibility rollout

1. Migration 504 adds Parties, people, organizations, channels, affiliations, relationships, shares, external references and resource-file links.
2. Existing Contacts and Customers are backfilled without changing their public ids.
3. Contact create/update/archive/restore/merge dual-writes canonical identity.
4. Cloud upload and legacy link/unlink dual-write resource links.
5. New applications use `PersonPicker` / `OrganizationPicker`; older free-text and FK fields remain until individually migrated.
6. CRM, Supplier, Finance, Support, Projects, eSign and ClearOS references migrate in bounded follow-up slices with their historical snapshots preserved.

This intentionally avoids a big-bang rewrite: the shared infrastructure is live, while each domain can migrate without breaking its existing API or records.

## Hardening pass (migration 505)

Fixes from the review of the first rollout. These now hold and are covered by `party-hardening.test.ts`:

- **File links cascade.** `resource_file_links.file_id` is `ON DELETE CASCADE`; it was `RESTRICT`, which made every linked file undeletable (Trash empty, manual delete, auto-expiry, retention release).
- **Sync is done in the database, not by each app.** Triggers keep the canonical tables in step for every writer (routes, seeds, imports, jobs): customers ⇄ ORGANIZATION party (party id = customer id), leads → contact/organization party (oldest match wins on a name clash), and `cloud_files.entity_type/entity_id` ⇄ `resource_file_links` (re-tagging moves the ATTACHMENT link).
- **One visibility rule.** `lib/party-visibility.ts` decides who can see a party and is used by `/v1/parties` *and* Contacts (a contact is a person party with the same id). PRIVATE, TEAM (shared HR team with the owner), DEPARTMENT (same `users.department_id`), EXPLICIT_SHARE (user, team or department shares) and TENANT are all resolved. Contact lists, smart groups, exports, birthdays, duplicates, bulk actions and every `/:id` route hide a contact the caller may not see (404) — knowing the UUID grants nothing.
- **Parties API.** Gated on having at least one app that uses parties (Contacts, CRM, Finance, ClearOS) and never for CUSTOMER logins. Adds PATCH, archive/restore, shares, and merge. A person created through the API also appears in Contacts and an organization in Customers. Merging an organization that is a customer is refused (merge it from Customers); a merged duplicate stays as a tombstone with `merged_into_id`.
- **Channel visibility.** A channel more restrictive than its party is shown only to the owner/creator; relationships and affiliations that point at parties the caller cannot see are dropped.
- **RLS policies** use the repo's `NULLIF(current_setting(...))` form; search escapes `%`/`_`.

Known remaining slices: Suppliers, Finance, Support, Projects, eSign and ClearOS still hold their own free-text/FK references; `PartyPicker` is available but not yet adopted by those apps' forms.

## Follow-up (migrations 506–507)

- **Edit rights.** `partyEditableSql` is the single "may change" rule: owner/creator, TENANT visibility, teammates/dept-mates for TEAM/DEPARTMENT parties, and EDIT/MANAGE shares to a user, team or department. VIEW shares never grant edit — enforced on `/v1/parties` *and* on the Contacts `/:id` routes (403).
- **Sharing UI.** Contact detail ▸ Access opens `PartyShareDialog` (people / teams / departments, View / Edit / Manage) over `GET /v1/parties/principals` and `PUT /v1/parties/:id/shares`.
- **Suppliers** are ORGANIZATION parties (id = supplier id) kept in sync by trigger; renames/archive through the Party API reach the supplier; supplier merges are refused (bills/orders reference the id). `suppliers.party_id` is `ON DELETE SET NULL` because `suppliers.tenant_id` has no FK. Support tickets need nothing: they reference customers, whose party id is the customer id.
- **A company that is both a customer and a supplier has two parties** until someone links them with a reviewed relationship — never an automatic name match.
- **Adoption.** `PartyPicker` (with `createAs`, and Customer/Supplier hints) is used by the CRM lead form; leads accept `organization_party_id` / `contact_party_id`, validated as existing and visible to the user.
- **Migration numbering.** The runner orders by full filename, so clashing prefixes are safe; `party-sharing-suppliers.test.ts` allow-lists the existing clashes and fails on any new one.

## Same company in two roles, and other apps (migration 508)

- **Customer that is also a supplier.** Each record keeps its own party (its id is referenced by invoices, bills, orders). A manager can confirm two organizations are the *same company* (`party_relationships` type `SAME_ORGANIZATION`, ordered by id) or mark them *not the same* (`NOT_SAME_ORGANIZATION`, stops the suggestion). Suggestions come from same tax ID, same registration number, same name once Ltd/Limited/Co/Company/Inc/LLC/PLC is ignored, or a shared email/phone — candidates only, never auto-linked. A linked company shows once in pickers with both roles; nothing is merged and no id changes. UI: Contacts ▸ Merge & fix ▸ "Companies that may be the same". API: `GET /v1/parties/link-suggestions`, `POST /v1/parties/links`, `/links/dismiss`, `/links/remove`.
- **Cross-app view.** `GET /v1/parties/:id/references` counts where a party is used (contacts, customer/supplier records, invoices, credit notes, quotations, shipments, support tickets, projects, bills, purchase orders, leads, eSign recipients, files), including both sides of a confirmed link.
- **Audit of the "other apps holding names".**
  - *Finance / ClearOS / Support / Projects*: invoices, credit notes, delivery documents, bills, purchase orders, shipments, tickets and projects **already carry the customer/supplier id** (= the party id); their name columns are deliberate historical snapshots (a legal document must not change when a customer is renamed) — nothing to migrate.
  - *eSign*: recipients had only name/email. `sign_recipients.party_id` is now set automatically **only** when exactly one ACTIVE, workspace-wide PERSON party owns that email (private or ambiguous → left NULL). The recipient's own name/email remain the legal snapshot. Employees (`user_id` set) stay users.
  - *Not entities, left as text*: landed-cost calculators (`customer_name` on quotes for prospects), vendor-bill legacy rows without a supplier id.
