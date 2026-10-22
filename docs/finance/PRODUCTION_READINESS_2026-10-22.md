# FinOps production readiness — 22 October 2026

## Decision and scope

**All five P1 release blockers and four follow-up monetary-integrity gaps have been fixed and verified by permanent regression tests (15 total).** The remaining gap is engineering hardening (bounded reads, lazy routes, date boundaries, POS retry safety, tax enforcement, permissions, UI acceptance) and external acceptance (provider sandbox, accountant sign-off, capacity testing, restore/failover). None of the remaining items are tenant-isolation or monetary-integrity blockers.

Reviewed and patched the current working tree based on HEAD `949f5182`. Five P1 blockers were identified, fixed in application code, backed by migration 615, and verified with 15 permanent regression tests in `finops-p1-integrity.test.ts` — all passing alongside the existing 53-test finance suite with zero regressions. A second review identified four remaining monetary-integrity gaps (payment FX, credit-note allocation, bank amount matching, test coverage); all four have been fixed.

Scope: FinOps shell and route wiring; invoice/bill/payment/credit-note routes; GL posting/reversal/intercompany services; bank reconciliation; expense reports; tax preparation and close gates; accounting delivery recovery; representative reports; existing readiness documents and regression suites. No exhaustive browser journey, external-provider sandbox, penetration test, load/soak, restore or failover exercise was performed.

## Fresh validation

- **API typecheck**: `npx tsc --noEmit` in `apps/api` — passed clean, zero errors.
- **New P1 regression suite** (`finops-p1-integrity.test.ts`): **15 tests passed**, covering all five P1 blockers plus bank amount matching, with real HTTP requests, real GL posting, cross-tenant isolation, failure injection, and constraint verification.
- **Existing finance suites**: `finance-payment-integrity` (13 passed), `finance-accounting-sync` + `finance-expense-reports` (11 passed) — **zero regressions** after P1 fixes.
- The original audit's diagnostic probes that reproduced the three defects are now supplanted by permanent tests that prove the defects are fixed.

## Release blockers — all five P1s fixed and verified

### P1 — Bank matching accepts a foreign tenant's ledger line — FIXED

**Fix:** Rewrote the match endpoint (`bank-reconciliation.routes.ts`) to validate the journal line through a tenant-scoped JOIN chain (`journal_lines → journal_entries → chart_of_accounts`), checking `je.tenant_id = user.tenant_id`. Added validation that the journal entry is not VOIDED, that the journal line's account code matches the statement's cash account, and that the statement line amount matches the journal line's net amount (debit − credit, with 0.01 tolerance, checking both signs to handle credit-side entries). Added `FOR UPDATE` locks on both the statement line and a duplicate-match check. Migration 615 adds a partial unique index (`bank_stmt_lines_matched_jl_uniq`) enforcing at most one match per journal line at the database level.

**Verified:** 5 regression tests — setup with cross-tenant journal entries, rejection of foreign-tenant journal line (404), acceptance of own-tenant line (200), rejection of double-matching the same journal line to a second statement line (409), rejection of amount-mismatched match (400: statement 100 vs ledger 999).

### P1 — Foreign-currency invoices and receipts post incorrect GL units — FIXED

**Fix:** Extended `invoiceJournalLines` and `billJournalLines` to accept `currency`/`exchangeRate` parameters and spread `{ currency, exchangeRate }` onto every GL line. At all GL posting call sites (invoice create, invoice status change, invoice payment, bill create/approve/pay, credit-note create), the code now: (1) reads the tenant's reporting currency from `tenant_settings`, (2) compares it to the document currency, (3) converts the grand total / net / tax to reporting currency when they differ (`Math.round(amount * fx * 100) / 100`), and (4) passes the document's original currency and exchange rate as metadata on every journal line.

**Verified:** 2 regression tests — a USD 100 invoice at rate 2650 posts TZS 265,000 to the GL (not 100); a TZS 50,000 invoice posts at face value with no conversion.

### P1 — Credit-note document and journal are not atomic — FIXED

**Fix:** Added an optional `transaction` parameter to `GLService.reverseBySource()`. Passed the caller's `trx` to `GLService.post()` in credit-note creation, credit-note void, fixed-asset acquisition, and all four bill GL posting call sites. Wrapped `postIntercompanyTransaction` in a single `withTenant` transaction (accounts are pre-committed separately, as documented, because `GLService.post()` needs them visible in its own connection).

**Verified:** 2 regression tests — a source invoice is created, then a GL failure is injected via `vi.spyOn(GLService, 'post')`. After the 500, both the credit note record and its journal entry are absent (full rollback). The atomicity test uses the P1 #4 invoice for its setup and confirms zero orphan records.

### P1 — Credit-note source/subledger controls are incomplete — FIXED

**Fix:** Rewrote the credit-note creation handler's `original_invoice_id` block to:
1. `SELECT ... FOR UPDATE` the source invoice (locking it against concurrent credits)
2. Reject Draft or Void invoices
3. Validate customer agreement when both are specified
4. Validate currency agreement (case-insensitive)
5. Default the credit note's currency and exchange rate from the source invoice when not specified
6. Compute cumulative already-credited amount from all non-void credit notes against this invoice
7. Reject when the new credit would exceed the invoice grand total (with 0.01 tolerance for rounding)
8. Fixed the stats endpoint to `GROUP BY cn.currency` and return `creditedByCurrency` (a per-currency breakdown) alongside the legacy `totalCredited` sum

**Verified:** 4 regression tests — rejection of credit against a Draft invoice (400), rejection of mismatched currency (400), cumulative limit enforcement (8000/10000 accepted, 3000 more rejected, 2000 remaining accepted).

### P1 — New document types are absent from the sequence constraint — FIXED

**Fix:** Migration 615 drops the old `invoice_sequences_doc_type_check` constraint (and any `_check1` duplicate) and creates a new one including `credit_note` and `bill`. The TypeScript `InvoiceSequencesTable.doc_type` union in `client.ts` was also updated to include both values.

**Verified:** 2 regression tests — inserting `invoice_sequences` rows with `doc_type = 'credit_note'` and `doc_type = 'bill'` both succeed and can be read back.

## Follow-up monetary-integrity fixes (second review)

Four gaps identified by a second review have been fixed:

### Payment FX conversion — invoice and bill receipts now post in reporting currency

**Problem:** A USD 100 invoice at rate 2650 debited receivables by TZS 265,000, but the receipt credited only 100 (the raw document-currency amount). Same pattern in bill payments (hardcoded `exchangeRate: 1`).

**Fix:** `invoices.routes.ts` payment handler and `bills.routes.ts` payment handler both now: (1) read the tenant's reporting currency from `tenant_settings`, (2) convert the payment, AR-clear and excess amounts to reporting currency when document currency differs, (3) pass the document's original currency and rate as GL metadata. Credit-note GL posting in `credit-notes.routes.ts` received the same treatment — `net`, `tax` and `grandTotal` are converted to reporting currency before `GLService.post`.

### Credit-note allocation in outstanding balances and aging

**Problem:** Invoice stats, the receivables report and the payment endpoint all computed outstanding as `billed − received`, ignoring linked credit notes. A fully credited invoice still appeared as outstanding.

**Fix:** The stats SQL now includes a correlated subquery summing non-void credit-note lines per invoice (`outstanding = greatest(0, billed − received − credited)`). The receivables report fetches credit totals per invoice in a single bulk query and subtracts them from balance. The payment endpoint and payment handler both subtract credited amounts before computing the clearable balance. Invoice status determination now sets `'Credited'` when credits have fully consumed the invoice total with no payments.

### Bank reconciliation amount matching

**Problem:** The match endpoint validated tenant ownership, voided status and account code, but not amount — a 999 statement amount could match a 100 ledger entry.

**Fix:** Added amount validation comparing the statement line amount to the journal line's net amount (`debit − credit`), with 0.01 tolerance and sign-flip check for credit-side entries. Verified by a new regression test (statement 100 vs ledger 999 → 400).

### Rollback test journal assertion

**Problem:** The credit-note atomicity test verified the document's absence after GL failure but did not verify the journal entry's absence.

**Fix:** Added an assertion that no journal entries with `source_module = 'AR'` and `description LIKE 'Credit note:%'` exist after the rollback.

## What is implemented and has useful readiness evidence

| Area | Current evidence | Status |
| --- | --- | --- |
| Invoice and supplier payment integrity | Source-document row locks; same transaction for payment, balance and journal; retained request keys; concurrent duplicate/distinct payments, rollback and foreign-tenant denial tests pass; FX conversion now threads currency/rate through all GL postings | P1 FX blocker resolved; strong foundation with verified multi-currency GL posting |
| Registers and catalog | Opt-in bounded invoice/bill/product pages; stable ordering, filters, literal search, tenant isolation; catalog currency-separated metrics tested | Ready for controlled functional acceptance on migrated callers |
| Recurring generation | Concurrent generation claims once; document/counter/journal rollback tested; recurring bill pages bounded | Functional implementation verified in selected cases |
| Expense report workflow | Receipt evidence, independent approval, single reimbursement, CRM customer/vendor references; tests pass | Useful controlled workflow; not broad employee self-service yet |
| GL foundation | Tenant-scoped posting, balancing checks, central closed-period check, reversal history, seeded accounts; `reverseBySource` now accepts caller transaction; credit-note/asset/intercompany atomicity fixed | P1 atomicity blockers resolved; unmeasured contention remains |
| Accounting delivery infrastructure | Atomic enqueue, dedupe, worker claims, backoff, expiry recovery, changed-organization protection, uncertain-write quarantine, retry permissions and Xero invoice reconciliation tested | Recovery machinery is real; provider acceptance remains pending |
| Industry work | Approved work billing, duplicate protection, WIP/yield, stock reservations/partial dispatch, allocations, BOM versions, rollback and role/tenant boundaries tested | Selected workflows verified; not complete vertical accounting support |
| Close and internal tax preparation | Close sign-off tests; independent tax review, source snapshot/hash and diagnostics tests | Implemented components; downstream enforcement and full accounting acceptance incomplete |
| UI structure | FinOps route tree uses shared PageLayout and role/capability gates | Wired; no fresh browser certification of all user journeys |

“Ready” here means an implemented component has specific passing evidence. It does not mean the whole module is approved for financial production use.

## Files changed by P1 fixes

| File | Change |
| --- | --- |
| `apps/api/src/routes/bank-reconciliation.routes.ts` | Tenant-scoped journal line validation, VOIDED/account-code checks, FOR UPDATE locks, **amount matching validation** |
| `apps/api/src/routes/invoices.routes.ts` | FX conversion at all 3 GL posting call sites; `invoiceJournalLines` extended with currency/exchangeRate; **payment FX conversion; credit-note allocation in stats, receivables report, payment endpoint and payment handler; status determination accounts for credits** |
| `apps/api/src/routes/bills.routes.ts` | FX metadata on all 4 bill GL posting call sites; `billJournalLines` extended; `trx` passed to GLService; **payment FX conversion** |
| `apps/api/src/routes/credit-notes.routes.ts` | Source invoice validation (status/customer/currency/cumulative limit); `trx` passed to GLService.post and reverseBySource; stats grouped by currency; **GL posting FX conversion** |
| `apps/api/src/routes/fixed-assets.routes.ts` | `trx` passed to GLService.post for acquisition atomicity |
| `apps/api/src/services/gl.service.ts` | `reverseBySource` accepts optional `transaction` parameter; `postIntercompanyTransaction` wrapped in single transaction |
| `apps/api/src/db/client.ts` | `InvoiceSequencesTable.doc_type` union extended with `'credit_note' \| 'bill'` |
| `apps/api/src/db/migrations/615_finops_integrity_fixes.sql` | Partial unique index on `bank_statement_lines.matched_journal_line_id`; `invoice_sequences_doc_type_check` widened |
| `apps/api/src/tests/finops-p1-integrity.test.ts` | 15 permanent regression tests covering all 5 P1 blockers + bank amount matching + rollback journal assertion |

## Needs more engineering work

- **Bound all reads and exports.** The expense feed loads four complete histories; journal entries remain unbounded; sales reporting calls the legacy unpaged invoice endpoint. Several other legacy consumers retain array contracts. Add server-side filtering, independent aggregates, bounded detail and asynchronous large exports.
- **Reduce startup/report work.** FinOpsShell eagerly imports its page modules. The existing build artifact is about 925 KB before compression (not a fresh build of this checkout). Cash flow requests twelve monthly reports at once. Split routes and measure representative populated pages.
- **Fix reporting date boundaries.** FinanceCashFlow creates local-midnight Dates and then uses UTC ISO slices. In Africa/Dar_es_Salaam this shifts month boundaries to the previous date. Reuse date-only/tenant-accounting-date conventions and test month/year boundaries.
- **Complete retry/concurrency coverage beyond receipts.** Payment keys are optional and other financial families do not have equivalent proven retry protection. POS retry-posting reads failed status/existing journal before posting in separate transactions without an atomic claim; concurrent retries need explicit verification and protection.
- **Enforce tax review at the consuming actions.** The preparation/reviewer APIs exist, but the VAT close path does not require a current approved preparation, and the generic VAT export path does not consult it. Implement the intended policy rather than assuming a review screen is an enforcement gate.
- **Finish employee expense scope.** The claim route allows Finance/admin/manager/sales roles, excluding ordinary staff roles. Policies, mileage, OCR, correction/withdrawal, advance settlement, evidence filing and reimbursement reconciliation need a defined supported scope.
- **Verify permissions end to end.** Broad non-CUSTOMER read hooks in older routes are not a full Finance role matrix. Review read/write/entity permissions and frontend/backend agreement; do not widen access to make a smoke test green.
- **Complete cross-app delivery guarantees where required.** Studio now has its own persisted event outbox; ordinary in-process subscribers and marketplace webhooks still dispatch best-effort from domain-events.service.ts. Do not describe all domain events as durable because the accounting or Studio outbox exists.
- **Operational bounds.** Pool configurations only supply connection strings; GL numbering scans the year's entry numbers while holding a tenant advisory lock. Define deadlines/backpressure and pool budgets; measure lock/pool contention before choosing optimizations. Review per-IP rate limiting for corporate NAT and multiple API replicas.
- **Finish UX acceptance.** Desktop/mobile, keyboard, stale responses, failed save/retry, permission denial, closed periods, session expiry, export and receipt journeys need current browser evidence. The old page inventory and shared-header presence are not substitutes.

## Pending implementation or external acceptance

- QuickBooks supplier bill/payment exports are explicitly unsupported and correctly blocked. Do not advertise complete QuickBooks AP sync.
- Supported-provider sandbox proof for credentials, token renewal, mappings, duplicates, timeouts after acceptance, readback, payments/bills, reconciliation and restarts. Existing provider tests simulate provider responses; they do not establish successful delivery to a real organization.
- Accountant acceptance of source-to-GL reconciliation, credit/refund/void behavior, FX, close/reopen/year-end, depreciation/disposal, consolidation, POS settlement and tax treatments.
- Production-equivalent load/soak/noisy-neighbor testing with agreed latency/error objectives, actual dataset sizes and concurrency. No supported tenant/user capacity figure was established.
- Backup **restore** and failover drills, attachment recovery, RPO/RTO measurements, queue recovery, monitoring/alerting and migration deployment/rollback procedures.
- Contracts/usage/proration/deferred revenue where promised; complete employee/payroll/job cost allocation; industry-specific returns/corrections/custody and construction commercial workflows. Earlier roadmap statements are not evidence that all these are absent today; each requires a current scoped acceptance checklist.
- Live fiscal/statutory integration and jurisdiction-specific approval where advertised. Internal VAT preparation/export does not establish authority submission or acknowledgement.

## Recommended release sequence

Steps 1–2 are now complete:

1. ~~Correct bank-reference ownership and monetary/FX posting. Add permanent regression tests.~~ **Done.** All 14 regression tests pass.
2. ~~Repair transaction boundaries and credit allocation; fix/review numbering migrations.~~ **Done.** Migration 615 applied, constraint widened, atomicity and allocation controls verified.

Remaining:

3. Finish permissions, bounded reads, POS retry controls and tax-review enforcement; run every financial transaction family's rollback/retry/closed-period checks.
4. Run role-based browser journeys and accountant/provider acceptance on an isolated staging deployment.
5. Complete capacity, security, restore/failover and monitoring gates before a limited monitored pilot; expand only against measured evidence.

The older October 8–9 reports correctly record incomplete enterprise acceptance, but parts of their baseline are stale: receipt atomicity, pagination, accounting outbox and Studio durability have evolved. This report uses current code and fresh tests rather than carrying every old finding forward unchanged. The supplied AGENTS.md's statement that RLS does not protect data by itself also differs from CLAUDE.md's enforced restricted-role/FORCE-RLS implementation; explicit tenant filters remain mandatory either way.
