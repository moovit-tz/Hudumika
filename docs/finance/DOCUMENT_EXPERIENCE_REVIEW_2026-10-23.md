# FinOps document experience review and recommended standard

23 October 2026. Review only: no product code changed, no business documents created or issued, no messages sent, no payments or status transitions performed. Browser walkthrough of all nine requested areas and their new-entry forms; source tracing of handlers, routes, rendering, branding and exports. Existing details inspected for invoices, credit notes, quotations, delivery orders, purchase orders and expense reports. The workspace has no supplier bills and no editable finance expenses in the reviewed list, so their saved-detail/output paths were assessed in source rather than invented as browser passes. Vendor directory/new form inspected; statement implementation traced. This is not a full financial, accessibility or security certification.

## Decision

Yes: standardise document navigation, form chrome, detail layout, action semantics, branding and output delivery. Reuse the existing FormPage, PageHeader, DocumentDetail components and document-branding service. Keep document-specific fields, approval rules, tax rules and workflows. A vendor is a master record with statements; an expense is a voucher; an expense claim is a report with receipt evidence. They should share an interaction language without being forced into invoice content.

## Current comparison

| Area | New entry | Saved view | Output / sharing today |
| --- | --- | --- | --- |
| Invoices | Full-page editor, but ordinary Create uses component mode at `/finance/invoices` | In-place document preview; `?id=` deep-link reader exists, but ordinary row selection does not update URL | Download is a real server PDF file; View / Print clones HTML into a separate print window; Email opens mailto; selected PDFs downloaded sequentially |
| Credit notes | Dedicated `/finance/credit-notes/new`, FormPage, Issue action | Shared DocumentDetail shell, selection held in state | Print / PDF opens server PDF through apiViewBlob; mailto email draft without attachment |
| Quotations | FormPage, local create/edit mode on list URL | Shared detail shell; local selected state | Server PDF tab under Print / PDF; CSV of loaded quote rows; real queued email summary through API (no PDF attachment in traced enqueue) |
| Delivery documents | Expands a multi-field form above list, retaining header/metrics/list | Shared detail shell, state-selected document | View / Print PDF opens server PDF; no equivalent standalone Download action |
| Purchase orders | FormPage, local mode on list URL | Bespoke detail rather than common shell | Download PDF actually calls apiViewBlob; Send to Vendor changes status only; form/detail still call PO fields Invoice Date, Invoice Items, Invoice Summary |
| Bills | FormPage, local view state; supplier/new query presets exist | Bespoke bill detail | Print button calls window.print on the current page; server renderBillPdf exists for filing but is not wired as a bill-download route/action |
| Vendors | FormPage selected by local showForm state | Dedicated `/finance/vendors/:id` and tab routes | Separate HTML Statement PDF / Print layout; Copy Profile Link copies authenticated internal URL |
| Expenses | Dedicated `/finance/expenses/new`, independent header/footer action layout | Finance expense details in component state; fleet rows navigate to vehicle source | CSV export; no comparable voucher PDF action in reviewed page. renderExpensePdf exists for filing but is not exposed here |
| Expense claims | Dedicated report `/new`; creates report then adds claims on detail | Dedicated `/finance/expense-reports/:id`; receipt verification and approval flow | No report PDF, print, download or export action found in page/API route |

All nine new-entry forms were opened without saving. Stable document URLs and browser-tab support are currently strongest for vendor profiles and expense reports. Existing invoice deep-link support should be retained and redirected compatibly when routes are added; it is incorrect to say there is no invoice deep linking at all.

## Confirmed issues and priorities

1. **P1 — misleading send behaviour.** `PurchaseOrders.tsx` handleSendPO PATCHes status and shows “sent to vendor”; purchase-orders.routes.ts status handler only updates purchase_orders. No email delivery is performed by this path. Rename to Mark as sent or implement an explicit recipient/review/send flow with an outbox and delivery status. Never show Delivered for merely queued mail.
2. **P1 — print/export interpolation.** VendorProfilePage builds HTML with vendor/company/ref values interpolated into document.write without escaping. Treat this as an HTML/script injection surface; replace string interpolation with escaped rendering or server PDF generation. Invoice, quotation and expense CSV writers escape quotes but do not neutralise spreadsheet formula-leading text. Test and fix formula injection for user-controlled text while preserving genuine numeric cells. These are source findings, not exploitation tests.
3. **P1 — output parity and currency.** Downloaded INV-ALE/0001 is a valid one-page A4 PDF with real company logo. Screen line amounts are converted TZS, while PDF line amounts are USD and document totals are TZS; screen rounds the grand total to 66,163 while PDF shows 66,162.60. This does not by itself prove an arithmetic error, but it is not the same presentation. Define document currency versus reporting currency, retain stored FX/rounding rules, and use the same amounts and precision in preview/print/download. Quotation editor/detail shows TZS amounts while metadata/selector says USD: useCurrency.fmt converts to company currency, shadowing a document formatter. Make reporting-currency equivalents explicit and secondary.
4. **P1 — inconsistent branding coverage.** See below. A billed document must use the issuing company's identity, not the FinOps app logo by default.
5. **P2 — button outcome mismatch and silent popup failure.** Purchase-order Download PDF invokes apiViewBlob. Browser click produced neither a download nor a visible PDF tab. apiViewBlob opens a tab after awaiting fetch and never checks window.open result. Popup blocking is a credible mechanism from source; the browser observation alone does not prove which blocker caused it. Separate preview/download/print, detect blocked windows, retain retry, and do not claim a completed download from a started fetch.
6. **P2 — local-only document state.** Invoice/quote/PO/bill/vendor-new/delivery views do not consistently write an identity/action URL. Refresh, copying URL, browser Back and open-in-new-tab do not preserve the selected state uniformly. Real anchors for document numbers are needed; row click can delegate to those routes.
7. **P2 — inconsistent creation and save lifecycle.** New/Create/Add labels; Save Bill/Create/Issue/Submit have different financial meanings. Standardise placement and lifecycle vocabulary, not the underlying accounting transitions. Delivery creation should be a dedicated form route. Preserve draft inputs during validation and warn before discarding edited drafts; test reload recovery rather than assuming it exists.
8. **P2 — batch/download and export scope.** Invoice batch handler suppresses per-document failures and triggers multiple browser downloads; quote CSV exports loaded rows, not a guaranteed full filtered dataset. Exports need explicit Selected / Current page / All filtered scope, counts, currency columns, and a failure summary. Use one ZIP for multiple originals or an explicitly named combined PDF. Do not open N automatic popup tabs.
9. **P2 — incomplete document types.** Expense vouchers, bill PDFs, claim reports and vendor statements need explicit first-class output contracts and permissions. Existing renderers do not mean the UI has a working download feature.
10. **P3 — presentation drift.** PO headings refer to invoices; detail headers differ; Claims is named Expense reports; delivery breadcrumbs say Delivery notes while screen covers multiple document types; receipt acceptance differs (expense: PDF/images; claim: PNG/JPEG up to700KB). Some differences may be deliberate policy, but must be labelled rather than silently made identical.

## Branding and PDF findings

- Shared `document-branding.service.ts` and `packages/types/src/document-templates.ts` already choose modern/compact/classic layouts, logo variants and accent. Invoice, credit note, quotation, PO and delivery PDFs use this path.
- DocumentKind currently includes invoice, credit_note, purchase_order, quotation and delivery_note only. Bill, expense voucher, claim report and vendor statement are outside that template catalogue.
- renderBillPdf calls company without a kind and does not pass branding into the render spec, so it falls back to classic/teal with no configured logo. renderTableSpec used by expense vouchers uses Helvetica and a hardcoded teal header rather than the shared branding/fonts.
- Vendor statement uses raw company.logoUrl, Arial, inline colours and TZS-only formatting. PO UI selects its logo using screen dark mode, whereas PDF logo variant follows template choice. A white paper output should be independent of screen dark mode.
- Invoice UI and server already share template identifiers, but the actual page renderers remain separate: HTML clone for View / Print and PDFKit for Download. This creates content/precision/layout drift. Preview should show the actual server artifact.
- PDF branding accepts embedded uploaded logo data, intentionally avoids fetching arbitrary tenant URLs. A URL-only logo can be visible in UI yet absent in generated PDF. Resolve authorised stored assets safely; do not reintroduce arbitrary server URL fetches.
- PDF font support explicitly loads Atlassian Sans; other selected platform fonts fall back to Helvetica. Do not promise every configurator font works in PDF without bundled embedding support.
- Generic commercial renderer repeats a short document identity after page breaks, but does not redraw full table column headings in its row-loop. Require repeated column headings, document number and Page n of N; verify long descriptions, large totals, long notes, Unicode, missing-logo fallback and multi-page output.

Downloaded invoice was rendered and visually inspected: `document-review-invoice-sample.png`. It is legible with a real logo and clear totals; the review does not claim every other PDF's visual layout was rendered. No need to fill an A4 page with empty content simply because a short invoice has whitespace.

## Proposed common behaviour (to implement)

| Action | Contract |
| --- | --- |
| New [type] | `/finance/[collection]/new`; shared FormPage/header, Cancel, Save draft where supported, explicit Issue/Submit action with permission/state gates |
| View | `/finance/[collection]/:id`; document number and status lead; shared detail shell; summary/lines/related records/activity in consistent places |
| Edit | `/finance/[collection]/:id/edit`; enforce editable states server-side, preserve related-record presets |
| Preview PDF | Dedicated authenticated preview surface showing the actual server PDF, not a separately calculated HTML imitation |
| Download PDF | Downloads one named file such as `Invoice_INV-0001.pdf`; no forced print dialog or popup; visible progress/error/retry |
| Print | Print the same PDF artifact; show actionable fallback if the browser requires manual PDF printing |
| Send | Review recipient and contents, then enqueue real mail with PDF attachment or explicitly labelled secure access link; show Queued/Sent/Failed from real evidence |
| Copy link | Clearly labelled internal authenticated link; external access is a distinct permission-controlled feature with expiry/revocation |
| Export data | CSV/XLSX for selected/all filtered data, explicit scope/count/currency/date semantics and safe spreadsheet text |
| Multiple documents | Real per-record links support Ctrl/Cmd-click; batch ZIP for separate PDFs, optional combined PDF, progress and per-record failure report |

These are proposed URLs/contracts, not claims that these routes exist today. Vendor `/new` and `/:id/edit` need explicit route precedence ahead of `/:id`. Finance-specific approvals, document numbering, credit posting, PO receipt and claim reimbursement remain their own domain rules. A claim should not acquire an Issue invoice action merely for consistency.

## Implementation order and acceptance

1. Correct misleading send/download labels; close HTML/CSV injection risks; specify stored currency/precision and common document identity.
2. Complete real stable routes and shared form/detail actions, retaining legacy query deep links. Use existing DS primitives; no second component library.
3. Extend existing document registry/rendering adapters to bills, vouchers, claims and statements. Use one authoritative artifact for preview/download/print/send. Preserve immutable issued documents and originals/signatures/stamped copies as distinct versions; choose a regeneration/snapshot policy rather than silently changing old legal documents when branding changes.
4. Add consistent exports and batch jobs with permission checks on every document. Sharing must not turn internal records public by default.
5. Verify all nine journeys at desktop/tablet/mobile: new/cancel/save validation/draft/issue, refresh and Back, two documents in two tabs, edited draft discard, PDF byte download + filename, parity of amounts/logo/currency, long multi-page content, blocked popup, failed fetch, mixed-success batch, forbidden/cross-tenant ids, email queue versus delivery, CSV formula strings, missing/large logo and dark/light templates. No real customer send or financial posting during routine UI smoke tests.

Baseline verification: **2 suites / 4 tests passed**, no skips, in39.84 seconds: document-templates.test.ts (3) and invoice-pdf-layout.test.ts (1), recorded in finance-document-review-tests.log. These check preferences, branding, isolation and large invoice layout; they are not acceptance of the proposed design. No redesign is implemented by this report.
