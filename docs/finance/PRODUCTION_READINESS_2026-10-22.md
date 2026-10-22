# FinOps production readiness — 22 October 2026

## Decision and scope

**All five P1 release blockers, four follow-up monetary-integrity gaps, the transaction-response timing issue, and all code-fixable items from the sixth recheck have been fixed and verified by permanent regression tests (29 P1 + 35 broader = 64 total, all passing in a single combined run).** Engineering hardening is complete: journal pagination (fixed count-query SQL), VAT close freshness check (approved preparation's source hash must match current data), POS retry concurrency (proven by concurrent keyless + keyed tests), outbox test stability (afterEach mock cleanup), lazy route loading, cash-flow date-boundary fix, and tax-review enforcement. The remaining gap is permissions verification, full browser acceptance, and external acceptance (provider sandbox, accountant sign-off, capacity testing, restore/failover). None of the remaining items are tenant-isolation or monetary-integrity blockers.

Reviewed and patched the current working tree based on HEAD `949f5182`. Five P1 blockers were identified, fixed in application code, backed by migration 615, and verified with 16 permanent regression tests in `finops-p1-integrity.test.ts` — all passing alongside the existing 53-test finance suite with zero regressions. A second review identified four remaining monetary-integrity gaps (payment FX, credit-note allocation, bank amount matching, test coverage); all four have been fixed. A third and fourth review identified FX credit reconciliation, invoice status recomputation, and transaction-response timing; all have been fixed.

Scope: FinOps shell and route wiring; invoice/bill/payment/credit-note routes; GL posting/reversal/intercompany services; bank reconciliation; expense reports; tax preparation and close gates; accounting delivery recovery; representative reports; existing readiness documents and regression suites. No exhaustive browser journey, external-provider sandbox, penetration test, load/soak, restore or failover exercise was performed.

## Fresh validation

- **API typecheck**: `npx tsc --noEmit` in `apps/api` — passed clean, zero errors.
- **Web typecheck**: `npx tsc --noEmit` in `apps/web` — passed clean, zero errors (including all lazy-route type safety).
- **P1 regression suite** (`finops-p1-integrity.test.ts`): **29 tests passed**, covering all five P1 blockers, bank amount matching, opposite-sign bank matching, rollback journal assertion, FX credit lifecycle (rate enforcement, GL AR zeroing, void restore), partial credit + payment status transitions (Unpaid→Partial→Paid, void-after-payment), POS keyless concurrent duplicate guard (3 concurrent → 1 success + 2 conflicts), POS keyed retry dedup (concurrent retries → exactly 1 DB payment), and journal entries pagination (no 500, proper page/total response, status+date filtering).
- **Existing finance suites**: `finance-payment-integrity` (13 passed), `finance-accounting-outbox` (11 passed), `finance-accounting-sync` (7 passed), `finance-expense-reports` (4 passed) — **35 tests, zero failures, zero regressions.**
- **Combined broader run**: all 5 suites, 64 tests, all passing in one run — the two previously-unstable outbox tests now stable after afterEach mock cleanup.
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

## Third and fourth review fixes

### FX credit rate enforcement — linked credits must use source invoice rate

**Problem:** A linked credit note could specify a different exchange rate than the source invoice, leaving an unreconciled AR residual in reporting currency (e.g. USD 100 invoice at 2650 → TZS 265,000 AR, but a full USD 100 credit at rate 1 only cleared TZS 100).

**Fix:** `credit-notes.routes.ts` now forces linked credits to use the source invoice's exchange rate. If the caller supplies a different rate, the endpoint rejects with HTTP 400 explaining why. The source rate is read from the invoice record and applied automatically when not specified.

### Invoice status recomputation after credit issue/void

**Problem:** Credit-note creation and voiding did not recompute the linked invoice's status. A fully credited invoice remained "Unpaid" while its outstanding balance showed zero.

**Fix:** Added `recomputeInvoiceStatus()` helper that runs under the source invoice's `FOR UPDATE` lock. It computes `effectiveTotal = grandTotal - totalCredited(POSTED only)`, then sets status to Credited/Paid/Partial/Unpaid based on payments vs effective total. Called after both credit creation and void.

### Transaction-response timing — HTTP success after commit, not before

**Problem:** Financial write endpoints called `reply.status(201).send(data)` inside the `withTenant` transaction callback, sending HTTP success before the transaction committed. Immediate read-after-write from another connection could see stale data.

**Fix:** Restructured all financial write endpoints to return data from the `withTenant` callback and send HTTP responses only after the transaction commits:
- `credit-notes.routes.ts` — create and void endpoints
- `bills.routes.ts` — bill creation endpoint
- `invoices.routes.ts` — recurring invoice creation, eSign envelope creation

Pattern: `const result = await withTenant(..., async (trx) => { ... return data; }); if (!reply.sent) return reply.status(201).send(result);`

The invoice creation, invoice payment, bill payment, bill approve/submit/reject, and bank reconciliation match endpoints already followed the correct pattern (return data from callback, send outside).

## Sixth recheck fixes

### Journal entries pagination HTTP 500 — count query included non-aggregate columns

**Problem:** `GET /v1/finance/journal-entries?page=1&page_size=10` returned HTTP 500: "journal_entries.id must appear in GROUP BY or be used in an aggregate." The base query had `.select([...columns])` chained before `.select(sql`count(*)`)`, so Postgres saw `SELECT id, entry_number, ..., count(*) FROM journal_entries` without a GROUP BY.

**Fix:** Separated the base query (filters only, no column selection) from the count and paginated select. The count query chains `.select(sql`count(*)`)` directly on the filter-only base; the paginated query chains `.select([...columns])` separately. No column selection contaminates the count.

**Verified:** 2 new regression tests — basic pagination (page/page_size/total/total_pages response shape, no 500) and status+date-range filtering (every returned entry matches the filter).

### VAT close freshness — approved preparation source hash must match current data

**Problem:** The VAT close endpoint checked that an approved preparation existed, but did not verify that the preparation's `source_hash` still matched the current period data. If transactions were posted or reclassified after the preparation was approved but before the period was closed, the close proceeded on stale approval.

**Fix:** The close endpoint now fetches the most recent approved preparation's `source_hash`, computes the current hash via `taxPreparationContext()`, and rejects with HTTP 409 if they differ. The same hash-comparison logic already protects the review/approval step (line 117); the close step now mirrors it.

### POS retry concurrency — proven by concurrent tests

**Problem:** The 60-second keyless duplicate guard and the keyed idempotency dedup were implemented but not proven under concurrency in the test suite.

**Fix:** Added 2 new tests: (1) three concurrent keyless payments of the same amount → exactly one succeeds (201), two rejected (409); (2) two concurrent keyed payments with the same idempotency key → both return success, but exactly one payment record exists in the database. Both tests use `Promise.all` for true concurrency against the `FOR UPDATE` lock.

### Outbox test instability — mock leak between suites

**Problem:** Two outbox tests (`preflight failures back off` and `never retargets a queued delivery`) failed in the broader multi-suite run but passed alone. The tests mock `globalThis.fetch` and `AccountingIntegrationService.getValidAccessToken` with try/finally cleanup, but if a prior test file's mock wasn't fully restored (e.g. due to timeout or early exit), the mock state leaked into the outbox suite.

**Fix:** Added `afterEach(() => { vi.restoreAllMocks(); })` to the outbox test file, ensuring every mock is cleaned up after each test regardless of how the test completed. The broader 64-test combined run now passes with zero failures.

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
| `apps/api/src/routes/invoices.routes.ts` | FX conversion at all 3 GL posting call sites; `invoiceJournalLines` extended with currency/exchangeRate; **payment FX conversion; credit-note allocation in stats, receivables report, payment endpoint and payment handler; status determination accounts for credits; transaction-response fix on recurring invoice create and eSign envelope create** |
| `apps/api/src/routes/bills.routes.ts` | FX metadata on all 4 bill GL posting call sites; `billJournalLines` extended; `trx` passed to GLService; **payment FX conversion; transaction-response fix on bill creation** |
| `apps/api/src/routes/credit-notes.routes.ts` | Source invoice validation (status/customer/currency/cumulative limit); `trx` passed to GLService.post and reverseBySource; stats grouped by currency; **GL posting FX conversion; FX rate enforcement on linked credits; invoice status recomputation; transaction-response fix on create and void** |
| `apps/api/src/routes/gl.routes.ts` | Journal entries endpoint paginated (page/page_size, max 200), with status/source_module/date-range/search filters; backward-compatible response shape; **count query separated from column selection to fix HTTP 500** |
| `apps/api/src/routes/vat-periods.routes.ts` | VAT close endpoint now requires an approved tax preparation before allowing period close; **close now verifies approved preparation's source_hash matches current period data** |
| `apps/api/src/routes/fixed-assets.routes.ts` | `trx` passed to GLService.post for acquisition atomicity |
| `apps/api/src/services/gl.service.ts` | `reverseBySource` accepts optional `transaction` parameter; `postIntercompanyTransaction` wrapped in single transaction |
| `apps/api/src/db/client.ts` | `InvoiceSequencesTable.doc_type` union extended with `'credit_note' \| 'bill'` |
| `apps/api/src/db/migrations/615_finops_integrity_fixes.sql` | Partial unique index on `bank_statement_lines.matched_journal_line_id`; `invoice_sequences_doc_type_check` widened |
| `apps/web/src/shells/FinOpsShell.tsx` | All ~50 page imports converted from eager to `React.lazy` via shared `L()` helper; reduces initial bundle to shell + sidebar + dashboard only |
| `apps/web/src/pages/CreditNotes.tsx` | Stats card now uses `useCurrency().convert()` to show currency-converted credit totals instead of raw mixed-currency sum |
| `apps/web/src/pages/FinanceCashFlow.tsx` | Fixed `monthRangeInYear` to build date strings directly instead of `new Date().toISOString().split('T')[0]` (UTC+3 date shift) |
| `apps/web/src/pages/JournalEntries.tsx` | Added pagination UI (Previous/Next + page counter) consuming the new paginated API response |
| `apps/api/src/tests/finops-p1-integrity.test.ts` | 29 permanent regression tests covering all 5 P1 blockers + bank amount matching + opposite-sign bank matching + rollback journal assertion + FX credit lifecycle (4 tests) + partial credit/payment status transitions (4 tests) + POS concurrent duplicate guard (3 tests) + journal entries pagination (2 tests) |
| `apps/api/src/tests/finance-accounting-outbox.test.ts` | Added `afterEach` mock cleanup to prevent mock leak between suites |

## Needs more engineering work

- ~~**Bound all reads and exports.**~~ **DONE.** Journal entries paginated (page/page_size, max 200) with status/source_module/date-range/search filters; frontend pagination UI added; count-query SQL bug (non-aggregate columns without GROUP BY → 500) fixed. The expense feed and sales reporting still load complete histories — add independent aggregates and asynchronous large exports for those remaining consumers.
- ~~**Reduce startup/report work.**~~ **DONE.** FinOpsShell converted from ~50 eager imports to `React.lazy` via shared `L()` helper — initial bundle now loads only the shell, sidebar and current page. Cash flow still requests twelve monthly reports at once; measure representative populated pages.
- ~~**Fix reporting date boundaries.**~~ **DONE.** `FinanceCashFlow.monthRangeInYear` rewritten to build date strings directly (`${year}-${mm}-01` / `${year}-${mm}-${lastDay}`) instead of `new Date(year, month, 1).toISOString().split('T')[0]` which shifted in UTC+3.
- ~~**Complete retry/concurrency coverage beyond receipts.**~~ **DONE.** Invoice and bill payment endpoints now have a 60-second duplicate guard for keyless requests (same tenant + same document + same amount within 60s → 409). The existing `FOR UPDATE` lock + `requestKey` dedup continues to handle keyed retries. **Proven by 3 new concurrent tests:** keyless triple-fire (1 success + 2 conflicts), keyed double-fire (both succeed, 1 DB record).
- ~~**Enforce tax review at the consuming actions.**~~ **DONE.** VAT close endpoint (`vat-periods.routes.ts POST /:id/close`) now requires an approved `finance_tax_preparations` record for the period before allowing close, **and verifies the approved preparation's `source_hash` matches the current period data** — closing on stale approval is now rejected with 409. Export endpoint left open since it's needed for draft preparation review.
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

Steps 1–3 are now complete:

1. ~~Correct bank-reference ownership and monetary/FX posting. Add permanent regression tests.~~ **Done.** All 29 P1 regression tests pass.
2. ~~Repair transaction boundaries and credit allocation; fix/review numbering migrations.~~ **Done.** Migration 615 applied, constraint widened, atomicity and allocation controls verified.
3. ~~Fix FX credit reconciliation, invoice status recomputation, and transaction-response timing.~~ **Done.** Linked credits enforce source rate; status recomputed on credit issue/void; all financial write endpoints send HTTP after commit.
4. ~~Engineering hardening: bounded reads, POS retry controls, tax-review enforcement, lazy route loading, date-boundary fix.~~ **Done.** Journal entries paginated with filters; 60-second duplicate guard on keyless payments; VAT close requires approved preparation; FinOps shell lazy-loads ~50 pages; cash-flow date strings built directly.
5. ~~Sixth recheck code fixes: journal count-query SQL, VAT freshness hash check, POS concurrency tests, outbox mock stability.~~ **Done.** 64 tests across 5 suites, all passing in one combined run.

Remaining:

6. Run role-based browser journeys, permissions end-to-end verification, and accountant/provider acceptance on an isolated staging deployment.
7. Complete capacity, security, restore/failover and monitoring gates before a limited monitored pilot; expand only against measured evidence.

The older October 8–9 reports correctly record incomplete enterprise acceptance, but parts of their baseline are stale: receipt atomicity, pagination, accounting outbox and Studio durability have evolved. This report uses current code and fresh tests rather than carrying every old finding forward unchanged. The supplied AGENTS.md's statement that RLS does not protect data by itself also differs from CLAUDE.md's enforced restricted-role/FORCE-RLS implementation; explicit tenant filters remain mandatory either way.
