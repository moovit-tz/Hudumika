# Finance enterprise readiness review

Date: 2026-10-08
Target: multiple corporations with 5,000 employees each.

## Decision

Not approved for an unrestricted enterprise production rollout. There is a substantial functional foundation, but verified financial correctness, operational resilience and capacity are not established. A completion percentage would be misleading without an agreed acceptance checklist and measured workload. This is a repository review and focused regression run, not an exhaustive line-by-line security certification or load test.

A 5,000-employee company is not 5,000 concurrent finance users. Thousands of such tenants could mean millions of identities. Employee claims, approvers, payroll imports, invoice volumes, concurrent sessions, document sizes and retention must be specified separately. No capacity figure is justified by a successful GET request.

## Evidence and scope

- Existing inventory covers 49 Finance page modules and their literal API calls, native controls and imported hooks. This is not coverage of every dynamic endpoint or shared component.
- Previous read sweep: 50 registered GET endpoints, 47 success responses, three explicit permission/parameter responses, no internal errors. The sweep assertion allows 4xx and does not validate complete payload semantics.
- Inspected invoice/bill payment handlers, unified payment feed, invoice report/list, expense aggregation, central ledger posting, expense-report permissions, API rate limiter, DB pools and invoice UI handlers.
- Existing selected DB tests exercise tenant isolation, job billing reservations, WIP, stock reservation, rollback, approvals, reimbursement, CRM ownership, VAT review and close sign-off.
- No load, failover, disaster-recovery or external-provider acceptance exercise performed. Prior browser checks cover selected layouts and navigation, not every finance transaction.

## Implementation checkpoint — 2026-10-08

Implemented in the current checkout (not a production certification):

- Invoice and supplier payment writes now lock their source document and pass the same transaction to GL posting. Payment, balance, credit/WHT and ledger changes roll back together.
- Migration 572 adds nullable persisted payment request keys with tenant/document-scoped unique indexes. Three Finance payment entry points send retained retry keys. Existing API clients must adopt the header too; cross-session recovery and every other transaction family are not yet covered.
- Reused keys reject changed amount, method, note, supplied date and supplier reference. Bill currency is validated against the bill. Only issued invoices/posted bills accept payments. Supplier payments cannot exceed the remaining bill balance; advances use separate flows. Consistent currency precision still needs review.
- Shared EntityPicker ignores stale responses and cancels pending debounce callbacks on selection, close and unmount, reducing customer/vendor search races.
- Invoice deletion and payment failures now surface to users. Payment forms wait for server confirmation; successful posting and failed history refresh are reported separately.
- Payments read access has an explicit Finance/customer role allowlist. Customer receipts use the resolved CRM customer ID; an unlinked customer receives an empty feed. Invoice/bill statistics and receivables reports also require Finance roles.
- Payment events are inserted atomically and dispatched after commit, once per successful keyed request. Provider accounting sync also starts after commit. A durable queue with crash recovery, retries and dead-letter handling is still pending, and other domain emitters keep their existing behavior.
- Receivables report line retrieval is batched and limited to returned invoice numbers, replacing per-invoice queries. Other unbounded feeds and large-export handling remain pending.
- Invoice payment entry uses the document currency and per-line currencies for its balance, and rejects amounts above the balance instead of silently clamping them. Legacy invoice displays/print templates still need a complete currency review.
- Payments metrics separate currencies instead of summing unlike amounts as TZS; rows show original currency. Payment amount/method/note controls use shared components and the amount/date layout stacks on mobile.

Verification: seven real-database disposable-tenant tests pass for concurrent duplicate requests, rollback after ledger posting, no event delivery on rollback, one event on retry, linked/unlinked customer reads and non-Finance role rejection, distinct concurrent payments, draft/cross-tenant rejection and date/retry validation, report totals and aggregate access restrictions. The read-only Finance endpoint sweep passed separately. API and web typechecking pass, all 92 trigger contracts pass, the 19 design-system checks pass, and encoding checks pass. Payment form browser checks covered desktop and 381px mobile; the shared CRM picker opened/searched/cancelled without creating records. Two direct checks of the actual invoice calculation function cover USD documents and USD lines on TZS documents. These checks do not prove thousands-of-tenants capacity or compliance acceptance.

The findings below describe the audit baseline. Apply this checkpoint when reading their current status; partially corrected findings remain release blockers until their full acceptance criteria are met.

## Highest-priority findings

| Priority | Finding and evidence | Required correction and acceptance |
| --- | --- | --- |
| P0 | Receipt and supplier-payment handlers run inside withTenant but call GLService.post without their transaction. GLService.post opens its own withTenant when no transaction is supplied. invoices.routes.ts payment handler and bills.routes.ts payment handler. | Make document/payment/GL/credit/WHT/audit changes one atomic transaction. Inject failures after GL posting and prove everything rolls back. |
| P0 | These payment handlers read the document without forUpdate and expose no request idempotency key. Posting's tenant advisory lock occurs after payment insertion/totals computation and does not make the preceding reads safe. | Lock before calculating balances; enforce unique operation identities; validate payable document states, currency and overpayment policy. Test simultaneous payments, duplicate delivery and client retries. |
| P0 | Invoice payment and deletion UI changes local state before success, then swallows failures. Billing.tsx handleRecordPayment/handleDeleteInvoice. | Await confirmation, show failures, refresh canonical data and prevent repeated submissions. Test network loss and permission/period-lock rejection. |
| P1 | Invoices list fetches all headers and all their lines; search filters in JavaScript. Payments feed loads all receipts and supplier payments then sorts in memory. Expense feed loads four complete histories. | Server pagination/filtering and indexed stable ordering; bounded detail payloads and separate aggregate endpoints. Preserve API consumers with a deliberate migration. |
| P1 | Invoice receivables report uses Promise.all over rows, querying invoice lines once per row. On one transactional connection these queries still form an N+1 backlog. | Batch line retrieval or SQL aggregation; enqueue large exports; test query counts and real-volume plans. |
| P1 | Global rate limit is keyed by request.ip, normally 1,200 requests/minute, with no Redis store configured in that registration. | Design authenticated identity/tenant quotas plus IP abuse protection and shared enforcement across replicas. Test corporate NAT, trusted-proxy configuration and rate limits without weakening auth. |
| P1 | Ledger postings serialize on one advisory lock per tenant. DB pool configuration supplies connection strings but no explicit capacity/timeouts. | Benchmark contention; define pool budgets across replicas, acquisition/query deadlines and backpressure. Preserve numbering/period integrity during optimization. |
| P1 | Invoice payment sync starts in the business transaction without durable retry evidence at that call site; domain event failures are logged through catch. | Verify durable outbox semantics, await atomic event insertion and dispatch after commit; verify retry/deduplication/dead-letter recovery for each provider. |
| P1 | General payment feed only checks authentication and Finance entitlement; CUSTOMER is scoped, other roles are not explicitly allowlisted there. Customer scope uses user.sub despite checking resolveCustomerId. | Verify and test the intended role matrix; use the canonical resolved CRM customer identity for customer-scoped reads, or remove unsupported customer access. Do not widen permissions to make UI requests succeed. |
| P1 | Expense-report route allowlist excludes employee roles outside ADMIN/FINANCE/MANAGER/SALES groups. | Define an employee self-service permission and owner-scoped policy with independent approval; test ordinary employees, delegates, leavers and entity boundaries. |
| P1 | Financial amounts use JavaScript Number in posting/totals and a balancing tolerance. | Agree currency precision and rounding policy, validate finite/range values everywhere and test fractional amounts, large balances and FX. Consider decimal/minor-unit arithmetic consistently; DB numeric storage alone does not prove application precision. |
| P2 | Native controls and legacy modal/form patterns remain in invoices, quotations, purchasing, bills, products and accounting pages. Failed optional fleet queries are swallowed by the expense aggregation. | Review each control against the shared DS, test keyboard/mobile/error states and avoid treating data-load failures as valid zero/empty finance results. |

These are code-supported risks. The payment regression suite now reproduces failure injection and duplicate delivery; it does not establish that a production incident occurred. Findings do not imply every posting path is broken: newer expense/job services already pass their transaction and have meaningful rollback tests.

## Remaining product work

- Accountant-accepted close/reopen/year-end transitions with complete immutable history and correction flows.
- Reviewed tax export gates, jurisdiction-specific validation and confirmed authority/provider acknowledgement where supported.
- Expense policies, mileage, OCR, withdrawal/correction, reimbursement reconciliation, advance settlement and Cloud evidence ownership.
- Payroll/NexusHR cost allocations and complete foreign-currency job reporting.
- Contracts, usage billing, proration, deferred revenue, renewals and failed-payment recovery.
- Verified customer/vendor self-service boundaries and disputes.
- Remaining industry-specific corrections/returns/custody and production features from INDUSTRY_IMPLEMENTATION.md; construction remains a separate unfinished profile.
- Resolve Finance quotations requesting CRM leads without authorized access.

## Enterprise release gates

1. Financial correctness: all transaction families pass posting, reversal, failure injection, concurrency, idempotency and closed-period tests; balances reconcile to subledgers and source documents.
2. Security: endpoint/field/entity permission matrix, cross-tenant foreign-ID tests, least privilege, audit evidence and independent security review with no unresolved critical/high issues.
3. Scale: realistic datasets and agreed concurrency per tenant; test month-end reports, payroll/claim imports, exports and noisy neighbors. Proposed targets to agree: interactive reads p95 <= 500ms, writes p95 <= 1s, heavy reports asynchronous. These are targets, not measurements.
4. Operations: production topology, monitored DB/queue pools, secrets handling, migration/rollback plan, alerts and traceability; demonstrate backup restore and failover against agreed RPO/RTO.
5. Integrations/compliance: accountant sign-off and supported-provider sandbox acceptance; no government/provider claim without real end-to-end evidence.
6. UX: complete role-specific desktop/mobile journeys, visible errors, accessible focus/labels and consistent shared components.

## Delivery sequence

A. Correct payment atomicity, locking, retries, permissions and invoice failure UX; add failure/concurrency tests.
B. Bound all registers and reports, remove N+1 reads, instrument pool/lock contention and implement durable integration recovery.
C. Complete employee/close/correction and tax-review workflows, then provider acceptance.
D. Run load/soak/noisy-neighbor, restore/failover and security acceptance, then a monitored pilot tenant.

Estimate only after the gates are sized and team capacity is known. This is multiple engineering and validation phases, not a UI cleanup or a defensible promise of a few days. No code changes were made during this review; the report records pending work.

## Fresh verification in this review

Four selected database test files passed: 17 tests, 127.49 seconds. The read-API sweep exercised 50 endpoints with 47 successful responses and no 5xx. This does not test the identified legacy payment concurrency/partial-commit risks or establish capacity.

## Repository instruction drift

AGENTS.md says no tests exist and apiFetch hardcodes localhost:3001. The current repository has real Vitest database tests, and api.ts uses a same-origin default with optional VITE_API_URL. This review follows the current code rather than those stale statements.


### Continuation — invoice editor persistence (8 October 2026)

- Removed optimistic invoice creation/editing and swallowed API errors. The editor waits for the mutation, preserves failed input, shows an accessible error, and prevents concurrent save clicks.
- Submitted status and document currency explicitly; canonical persisted header/ID now drive the detail view. Copy opens an editable draft rather than an unsaved list record, preserving customer and document currency.
- Replaced editor action controls with design-system Buttons. Renamed “Save & Send” to “Issue invoice”: this endpoint does not send customer email.
- Added client and issued-invoice charge validation before submission.
- Verification: web incremental typecheck passed; scoped diff whitespace check passed; browser confirmed empty issuance stays in the editor with an error and mobile actions fit at 390px. No financial records were created during browser verification.
- Server pagination remains pending: the current invoice page derives whole-ledger metrics, numbering, exports and detail selection from the full list. These dependencies need a coordinated bounded-list contract and separate aggregates before switching the page to pagination. No pagination implementation is claimed in this checkpoint.


### Continuation — invoice query foundation (8 October 2026)

- Added opt-in server pagination to `GET /v1/invoices`: `page`, `page_size` (maximum 100), stable invoice-number/UUID sorting, filtered totals and page metadata. Requests without `page` retain the array response and original creation-date ordering.
- Moved search into SQL; client name, invoice number and BL/AWB are searched with literal wildcard escaping. Added validated status, mode, customer UUID and inclusive invoice-date filters. Invalid ranges/pages return 400.
- Page line loading joins the parent invoice with an explicit tenant constraint. Header queries retain `withTenant` and explicit tenant predicates.
- `/stats` now aggregates counts/receipts in SQL rather than transferring every header to Node. Added `currency_totals` alongside legacy fields; the legacy combined receipt field remains for compatibility and must not be used as a multi-currency money summary.
- Shared pagination response interface lives in `packages/types/src/finance.ts`.
- Eight Finance regression tests pass, including paging boundaries, disjoint stable pages, empty pages, literal percent search, filters, legacy array compatibility and SQL currency-count aggregation. Existing payment rollback/retry/access tests also pass.
- The Billing UI still uses the legacy full list. Outstanding/billed summaries, numbering, off-page detail resolution and export selection must be migrated together before switching it; this checkpoint does not claim the UI now fetches bounded pages or that high-volume performance has been accepted.


### Continuation — bounded invoice UI (8 October 2026)

- Billing now requests 25 invoice headers plus their lines per page. Status/mode/date/customer/search/sort filters run server-side with a debounce and stale-response cleanup. Pagination and Retry use shared design-system Buttons.
- Whole-ledger summary counts come from `/stats`, independent of list filters. SQL now computes document-currency billed/outstanding/overdue totals with per-line currency conversion and rounding. The screen explicitly labels monetary summary cards TZS; USD invoices remain separately denominated in table rows. Multi-currency summary selection remains a future improvement.
- New numbers are allocated by the existing server document-number service; the editor displays “Assigned on save”. No page-derived maximum is used. UUID details load directly; display-number details use a bounded exact invoice-number filter.
- Detail state survives page refreshes. Save/delete/payment refresh bounded lists and summary data. Page/filter changes clear export selection; exports are explicitly selected visible rows. Removed misleading mixed-currency page-footer sums.
- Corrected five FinanceDashboard Badge variants from unsupported `danger` to design-system `error` after the web typecheck exposed them.
- Verification: eight Finance regression tests passed after aggregate changes. Browser verified BL/AWB search returns one match without changing ledger summary cards, display-number detail link opens the invoice, mobile pagination/footer fit at 390px, and USD rows show USD rather than TZS. API typecheck from the previous checkpoint completed successfully.
- Still pending: paging other Finance feeds, async large exports, performance/load acceptance, and the broader enterprise controls listed above. Legacy invoice detail/print templates retain their group-specific currency layouts and need a separate migration.

Final verification for the bounded invoice UI: API and web incremental typechecks, 19 design-system contract checks, encoding and scoped whitespace checks all passed.


### Continuation — supplier bill query foundation (8 October 2026)

- `GET /v1/bills` supports opt-in pages (maximum 100 headers), stable UUID tie-break sorting by dates/amount/supplier, supplier UUID filtering, and literal SQL searches including shipment and PO references. Invalid filters return 400; unpaged clients retain their array response.
- OVERDUE filters select posted/partial bills with due dates before the current UTC date; no financial status is rewritten in storage. Tenant-specific accounting timezone/date policy still needs standardization.
- Bill statistics use grouped SQL aggregates and return currency-separated totals alongside legacy fields. Legacy combined money fields remain only for compatibility; they are unsuitable for multi-currency summaries.
- Bill list reads now require the same Finance-role allowlist as its statistics. CUSTOMER remains denied by the existing domain hook.
- API incremental typecheck passed. Pagination tests cover pages, amount ordering, reference searches, literal percent text, invalid parameters and legacy response compatibility; aggregate currency counts and non-Finance list denial are included.
- Bills UI migration is still pending: recurring bills and payment history currently load full feeds and its summary cards derive values from that full data. This checkpoint does not claim that the Bills screen now fetches bounded pages.


### Continuation — bounded Bills UI and payable integrity (8 October 2026)

- Bills requests 25 headers per page with server search/status/supplier/sort filters, stale-response protection and shared Button pagination. Whole-ledger cards use SQL statistics independently of page filters; monetary summaries explicitly show TZS. Rows retain their document currency.
- Bill detail/edit fetches the full record on demand. Corrected the API `items` versus UI `lines` mapping, preventing an edit from silently losing existing charges. Posting/voiding preserves loaded lines. Save waits for the server, blocks duplicate clicks and retains failed input.
- Removed the screen-wide payment-history download. Payment history is fetched for the selected bill; payment refreshes use its canonical detail response.
- All bill GET routes now require a Finance role, including detail, recurring templates and payment history. Detail payments explicitly filter tenant ID.
- Unknown withholding-tax references now reject the entire bill before insertion instead of silently removing the selected treatment. Supplier IDs require UUID shape and tenant ownership for bill creation/edit/post and recurring template creation/edit; blocked suppliers cannot schedule new templates.
- Verification: 11 database regression tests passed, covering payment concurrency/retries/rollback, permission denial, both paginated feeds, full bill charges, invalid withholding-tax references and unowned suppliers/recurring templates. All 19 design-system contract checks, encoding and scoped whitespace checks passed.
- Earlier browser checks verified the empty Bills screen, pagination and footer at desktop and 390px mobile. The final browser session encountered CDP timeouts; its viewport override was reset. No browser financial transactions were performed.
- Remaining: recurring-template and supplier/PO picker feeds remain unbounded; per-bill payment history needs paging for unusually large histories. Accounting timezone policy must replace the current UTC/database-date discrepancy. Summary currency selection, large exports and legacy invoice print currency layouts still need work. These fixes do not complete the wider enterprise gates above (durable delivery, capacity/load, restore/failover, security and accounting/provider acceptance).


### Continuation — recurring generation transaction boundary

- Recurring AP/AR generation now locks templates with `FOR UPDATE SKIP LOCKED` in stable ID order, so overlapping workers do not generate the same selected occurrence. Manual generation remains an explicit advance operation; a later manual call can generate the following occurrence.
- Document headers/lines, journals, activity and template counters commit or roll back in the same transaction. Provider synchronization starts after commit. Template updates explicitly constrain tenant ID, and legacy unowned supplier references are skipped.
- Durable provider delivery/retries are still pending: post-commit best-effort calls cannot guarantee recovery after a crash.
- Final web incremental typecheck passed; the Studio trigger registry passed (92 registered/emitted). All 13 Finance regression tests passed, including recurring bill/invoice concurrency and rollback. The API typecheck from that checkpoint subsequently passed.


### Continuation — accounting connector safety (8 October 2026)

- Accounting sync serializes each tenant/provider connection and skips documents/payments with confirmed successful exports. Provider ordering is stable to avoid overlapping connection-lock cycles. This prevents ordinary concurrent/repeated creates; it does not close a crash between external acceptance and local commit.
- Provider exports require a returned external ID before recording success. Uncertain write/contact outcomes are recorded with `RECONCILIATION_REQUIRED:` and excluded from subsequent automatic submissions. A provider error/timeout after a possible write requires operator reconciliation, not a blind retry. A durable outbox and supported reconciliation/retry UI are still pending.
- QuickBooks supplier bill/payment export is disabled with a visible failed-sync reason: the existing adapter used Customer contact resolution and invoice Payment payloads for supplier transactions. No fabricated Vendor/BillPayment implementation is claimed. These flows require verified provider adapters and sandbox acceptance.
- Xero invoice/bill payloads now explicitly send `CurrencyCode`, following https://developer.xero.com/documentation/api/accounting/invoices.
- Invoice exports now reuse the canonical document-currency total rather than summing unlike line currencies. Extracted the existing total functions into `services/invoice-totals.ts`, preserving route exports for existing callers. Corrected net/tax FX rounding to reconcile with the same per-line gross calculation.
- Added explicit tenant predicates for source document/payment reads. Integration status/log GET now requires the existing Finance-role allowlist. Provider HTTP calls time out after 15 seconds instead of retaining a connection indefinitely.
- Verification: combined payment/recurring and connector suites passed 18 tests before the final uncertainty follow-up; two focused rounding tests passed. Final connector/currency/uncertainty and rounding run passed nine tests (seven connector plus two calculation tests). Focused TypeScript verification of the final accounting service and shared total module passed. The final full API incremental typecheck passed. No requests were transmitted to actual accounting providers: integration tests mock HTTP.
- Remaining connector gaps: durable delivery and per-provider idempotency/reconciliation, org-change mapping lifecycle, configured account/tax mapping, verified QuickBooks AP support, external sandbox acceptance, and complete line/tax/currency fidelity. A connected status alone is not proof these flows are production ready.

Final checkpoint: the prior whole-API incremental compile completed successfully. After the final edits, focused service typechecking passed; the final project compile passed. Trigger validation passed with 94 registered/emitted events, and design-system/encoding/whitespace checks passed. A standalone route check omitted Fastify plugin type augmentation and is not a valid substitute for the full project check.


### Continuation — durable accounting delivery foundation

- Applied migration 575: tenant-scoped, forced-RLS accounting outbox with unique provider/org/entity identity, bounded due indexes and explicit PENDING/RUNNING/SUCCESS/RETRY/RECONCILE/FAILED states. Shared API task types and Kysely registration added.
- Issuance/post/approval and recurring generation enqueue inside their financial transaction. Payment handlers now capture the inserted payment UUID and enqueue that UUID (the previous call passed the source document UUID, so the payment lookup found nothing). The document is enqueued too so an unsynced parent can be delivered first. Duplicate keyed payments do not create new tasks.
- Added an every-minute scheduler in both existing BullMQ and interval fallback paths. Workers enumerate at most 50 due IDs on the platform connection, then claim/deliver/update through explicitly tenant-scoped transactions. Competing workers use row locks/guarded leases.
- Preflight failures back off exponentially up to five attempts; unsupported exports terminate. Uncertain write/network/commit outcomes require reconciliation. Expired worker leases recover a confirmed sync result or quarantine the task, never blindly resend. Tasks snapshot provider organization and refuse changed/disconnected destinations. This intentionally favors avoiding duplicate financial writes over automatic recovery of every uncertain case.
- Added paginated GET /v1/accounting-integrations/deliveries and restricted POST /deliveries/:id/retry. Only failed preflight work is retryable; uncertain deliveries and unsupported exports remain blocked. A manual retry requires the original connected provider organization and records actor/prior-attempt details in the source document activity log within the same transaction.
- Final combined database regression run: 32 tests passed across payment/recurring, connector, totals and outbox suites, including audit, enqueue failure rollback and provider-org guards. Shared types build, 19 design-system contracts, encoding and 94 trigger checks passed. The final full API incremental typecheck passed, including the delivery endpoint/audit additions. Scoped whitespace checks passed; an unrelated existing LockScreen.tsx trailing blank line was left untouched. No actual provider requests were made: HTTP is mocked.
- Remaining: delivery-register UI and operator reconciliation workflow, verified provider-specific idempotency/readback, organization mapping lifecycle, alerts/metrics/retention, load/worker fairness acceptance and supported provider sandbox acceptance. Existing domain-event subscribers are not converted to this accounting outbox and still need their own durable delivery design. Existing historical records are not backfilled automatically.

### Continuation — delivery UI, verified readback and accounting dates (8 October 2026)

- Added /finance/integrations/deliveries inside PageLayout with a sidebar entry, shared design-system controls, 25-row pagination, provider/status filters, visible failures and Finance-role-gated retries. Stale responses are ignored; errors retain an explicit retry path. Browser verified the empty register/filter at desktop and 390px with page width equal to viewport; viewport override was reset.
- Added restricted Xero invoice reconciliation: enter an existing provider invoice ID, perform read-only provider lookup and require matching number, customer mapping, currency, total, ACCREC type and authorized/paid state. Original organization, source ownership/state, provider lock and prior external-ID assignment are checked; source is locked against edits. Success log, source audit and task status commit together. No blind resend or user-declared success. Bills/payments and QuickBooks reconciliation are still pending. Official endpoint reference: https://developer.xero.com/documentation/api/accounting/invoices.
- Reused workspace localization.tz for Bills overdue filters/aggregates and recurring AP/AR generation. Unconfigured workspaces retain UTC. Job enumeration selects a timezone superset; actual generation checks each tenant's date. Date advancement uses UTC date-only arithmetic rather than host-local DST. This does not migrate every legacy date calculation or change daily job cadence.
- Recurring Bills now fetch 25 templates per page with stable ordering, SQL whole-ledger counts and currency-separated monthly commitments. Removed the incorrect mixed-currency dollar total. Mutation refreshes retain bounded requests; legacy array API remains compatible. Recurring toolbar creates a recurring template and no longer displays an ineffective bill-search box.
- Verified: 33 combined connector/outbox/payment/totals tests; two timezone tests; one recurring pagination/currency/isolation test. Final full API and web incremental checks passed, including the recurring toolbar adjustment. All 94 trigger checks passed. Design-system and encoding checks passed. Browser verified recurring empty state, correct creation action and pagination at desktop/390px with no page-level horizontal overflow; populated pages and currency totals are covered by database tests. No provider HTTP calls were made outside mocks.
- Live sandbox acceptance is blocked locally: QuickBooks and Xero client ID/secret configuration presence checks were all false (values were never printed). No production-equivalent capacity, restore or failover environment was established in this run. RELEASE_ACCEPTANCE.md records the required evidence and safe isolated exercises; it is a checklist, not completed acceptance.
- Remaining: supported QuickBooks AP adapters and provider sandbox acceptance; bill/payment reconciliation and org mapping lifecycle; durable per-consumer cross-app event delivery; remaining recurring AR/picker/history/large-export feeds; wider date/currency/industry acceptance; metrics/alerts/retention and measured load/restore/failover/security/compliance gates. This checkpoint does not certify a 5,000-employee enterprise deployment.


### Continuation — bounded payments, recurring invoices, credit notes and quotations (8 October 2026)

- `GET /v1/payments` now supports opt-in server pagination (`page`/`page_size`, max 100), SQL-level search (document number, party name, method), direction/currency/method filtering, stable sort with UUID tie-break, and a legacy array fallback for unpaged clients. The previous implementation loaded all invoice_payments and bill_payments into memory, merged them, and sorted client-side. A `UNION ALL` CTE now handles both directions in one SQL query with filtering and pagination applied to the union rather than to each table separately then merged.
- Added `GET /v1/payments/stats` — SQL-aggregated money-in/money-out totals by currency and this-month receipt count, replacing the previous approach of deriving summary metrics from the full in-memory payment list. Summary cards are now independent of the paginated list page.
- `FinancePayments.tsx` now requests 25 payments per page with server search/direction/currency filters, stale-response protection and `PaginationBar` controls. Summary cards read from `/stats` independently. The `DataTable` component (client-side pagination on a full array) was replaced with a server-paginated table. Invoice picker for the "Record payment" form uses `page=1&page_size=100` instead of the unbounded legacy array path.
- `GET /v1/invoices/recurring` now supports opt-in pagination (`page`/`page_size`), search (name, client name), state and frequency filters. Legacy array response retained when `page` is omitted.
- `GET /v1/credit-notes` now supports opt-in pagination (`page`/`page_size`), search (credit note number, client name, reason), customer/invoice/status filters. Line items are batch-fetched for the returned page only, not for the whole ledger. Legacy array response retained.
- `GET /v1/quotations` now supports opt-in pagination via `quotationService.list()` (`page`/`page_size`), search (quote number, title, customer name), with existing status and customer_id filters. Legacy array response retained.
- `RecurringInvoices.tsx` now fetches paginated recurring templates from the server with search and state filters applied server-side. `PaginationBar` displayed when total exceeds page size. Stale-response protection via `loadIdRef`. Filter and search changes reset to page 1.
- `CreditNotes.tsx` now fetches paginated credit notes with search and status filters applied server-side. Added `SearchToolbar` with a status quick filter replacing the old filterless plain table. `PaginationBar` for navigation. Renamed draft-form `total` to `draftTotal` to avoid collision with pagination state.
- `Quotations.tsx` now fetches paginated quotations with search and status filters applied server-side. Status tab clicks and search changes reset page to 1. `PaginationBar` below the table. Metrics cards updated to show `totalQuotes` from the server total rather than `quotes.length`.
- Verification: web and API incremental typechecks passed clean. Existing finance regression tests hit a pre-existing Vitest infrastructure error (opentimestamps import) unrelated to changes.
- Remaining: remaining picker/history/large-export feeds (journal entries, expenses, products); UI callers of `/v1/invoices` without `page` param (FinanceSalesReport, CustomerDetailPage, CustomerDashboard, CustomerInvoices); QuickBooks AP adapters; bill/payment reconciliation; durable cross-app event delivery; load/capacity/security/compliance gates.


### Continuation — catalog pagination and currency-safe metrics (9 October 2026)

- `/v1/products` now supports opt-in bounded pages (maximum 100), SQL search/category/status filters and stable name/price/category/date ordering with an ID tie-break. The legacy array contract remains for unmigrated callers. Search treats `%`, `_` and backslashes literally. Customer pricing overrides are fetched only for the returned product IDs, and a supplied customer must belong to the tenant.
- `/v1/products/stats` aggregates whole-catalog counts, categories, stock indicators and monetary summaries in SQL. Average unit prices and stock sale values remain separated by currency; stock sale value is explicitly a catalog selling-price estimate, not accounting inventory valuation.
- ProductsServices requests 20 rows per page, applies filters/sort on the server, ignores stale responses, clamps pages after deletion and refreshes list/metrics after confirmed mutations. Metrics remain independent of the current page. New invoice catalog search requests 25 rows rather than downloading the full catalog.
- Fixed shared SearchToolbar mobile layout: search gets its own full-width row and filters/actions wrap. This corrects a browser-observed zero-width input and hidden status filter in the catalog.
- Verification: database regression passes for 30-row page boundaries, stable order, literal-percent search, filters, size limits, legacy compatibility, tenant isolation, contracted customer pricing and foreign-customer denial, plus TZS/USD aggregate separation. API and web typechecks pass. The combined root command reached an environment-only Node OS lookup failure in trigger validation; rerunning that check outside the restricted shell passed all 94 triggers. All 19 design-system checks, encoding and scoped whitespace checks pass.
- Browser: populated 117-item catalog at mobile and desktop; page 2 shows 21–40, search resets to 1–1, and mobile document width equals viewport width. Shared filter controls remain visible. No financial or catalog mutation was performed. Screenshot: catalog-mobile.jpg.
- Still pending: journal/expense feeds, large exports and remaining legacy product/invoice consumers; durable cross-app consumer delivery; provider adapters/reconciliation and live sandbox acceptance; production monitoring/load/restore/failover/security/compliance evidence. This work does not certify enterprise capacity.
