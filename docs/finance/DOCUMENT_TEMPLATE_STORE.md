# Document template Store — 9 October 2026

Implemented:
- Company settings and platform Identity settings offer vertical logos for light and dark backgrounds alongside existing horizontal logos.
- Tenant branding whitelist, browser branding hook, company hydration and save payloads carry the new fields. Explicit removal of vertical variants survives hydration.
- Platform logo removal now persists; uploads update browser state only after API success. Company save failures surface instead of reporting success.
- Store > Document Templates offers Modern, Compact and Classic invoice layouts. Administrator selection persists in tenant settings using the existing authenticated settings PATCH, row locking and audit event. Backend rejects unsupported document/layout values.
- Invoice viewing and the existing print clone use the selected layout. Modern prefers the vertical light logo; Compact prefers the dark variant; Classic prefers the horizontal mark, with company-local fallbacks.
- Existing invoice monetary calculation, payments, fiscal receipt and terms remain unchanged.

Validation:
- API and web TypeScript checks; design-system 19 checks; encoding; Studio trigger consistency 94 events.
- Browser: Store renders at mobile width; Compact selection survives reload. The original Modern preference was restored after checking.

Pending:
- Industry-specific additions beyond the existing document fields and layouts.
- Industry-specific document sections and acceptance checks.
- Actual populated invoice print pagination and logo upload/removal round trips, including large image limits.
- Store preview cards are schematic, not populated accounting documents.

The supplied Fuse screenshots informed the spacious, compact dark-header and classic variants. Linked demos were unavailable to the browser retrieval tool. No external template code or dependencies were imported.

## Continued implementation — 9 October 2026

- Store now offers separate tenant preferences for invoices, credit notes, purchase orders, quotations and delivery notes. Document kinds, layout IDs and logo fallback rules share one typed definition in `packages/types/src/document-templates.ts`.
- Credit-note, purchase-order and quotation PDF endpoints use their existing route authentication/entitlement hooks and server renderers. Quotation customer ownership is checked before rendering. Their page Print/PDF buttons now open these PDFs rather than interpolating record data into HTML print windows.
- Shared PDF branding decodes bounded embedded uploads with the existing Sharp dependency; it does not fetch arbitrary logo URLs. Missing/unsupported images retain the company name. Modern and Compact prefer their vertical light/dark marks; Classic prefers the horizontal mark.
- Delivery-note PDFs retain goods/quantity/transport/status/signature sections. Long goods lists wrap, paginate and repeat table headers; release and delivery order headers are preserved.
- Invoice server PDFs now use the same currency-aware totals helpers as accounting, include stored payment terms, and use the selected template. Existing stamped/archived PDFs are not rewritten.
- Focused integration tests passed: independent settings merge, invalid template rejection, administrator-only selection, tenant isolation, customer quotation isolation, populated commercial PDFs, 90 delivery lines across multiple pages, and a USD shipping invoice with a non-1 exchange rate. A second test checks embedded logo decoding and rejects external/invalid image sources.
- Mobile and desktop DOM measurements show no horizontal overflow (381 and 1440 pixels). Schematic previews adapt party and quantity labels to the document type.

Limits: PDF documents embed the bundled Atlassian Sans regular/bold faces when selected globally (the default). Other font selections retain Helvetica until their assets are bundled. Previews are schematic. Third-party/remote logo URLs fall back to text in server PDFs; upload an embedded PNG, JPEG or SVG through company branding. Broader industry acceptance, live integrations and enterprise operational gates remain tracked separately.

Final checks: full `npm run typecheck` completed successfully (API/web TypeScript, 94 trigger checks, 19 design-system checks and encoding). The targeted tests also passed tenant branding upload/removal persistence checks.

## Industry invoice context — 9 October 2026

Invoice PDFs now resolve the linked industry work inside the tenant transaction and print its industry label, reference and name. Quantity cells include stored units and allow wrapped text. Internal job specifications, costs and budgets are not exposed. Unlinked invoices retain their existing layout. The populated PDF integration check verifies consulting work, hour units and exclusion of private specifications. Full repository checks and the two document integration tests passed. At this stage PDF font embedding was pending; the next section records its implementation.

## Bundled PDF typography — 9 October 2026

The shared commercial-document renderer reads the public platform design-token sentinel through the existing platform connection. Atlassian Sans, the design-system default, now embeds distinct static 400 and 700 faces generated from the existing variable font. Invoices, credit notes, purchase orders, quotations and delivery notes use these faces. Other fonts retain the existing Helvetica fallback; no remote fonts or URLs are fetched. Release/order documents and ledger reports retain their prior typography. API builds copy source assets into dist/assets. The temporary fontTools generation tool is build tooling only, stored in ignored node_modules/.cache; no product dependency was added.

Three document integration checks passed, including embedded PDF font names, accented company names and Swahili text extraction. Asset copying was checked directly. Archived/stamped documents are not regenerated.

Final verification for typography: full repository checks passed (API/web types, trigger contract, design-system contract, encoding); all three document tests passed; the API production build passed and copied both font assets. The rendered preview at document-font-preview.png was visually inspected.

Deployment distinction: importing the compiled renderer through tsx resolves packaged font assets successfully. Plain Node import fails because the existing @hudumika/types package exports ./src/index.ts whose relative .js modules are not emitted there. This predates font packaging and remains a production runtime gate; build success does not certify plain Node startup.

## Invoice View / Print blank output — 9 October 2026

Root cause: copied application styles included FinancePos.css print rules hiding every body descendant unless it was a POS receipt; the standalone invoice had no receipt class. POS hiding is now scoped to documents containing a receipt, and thermal page settings use a named receipt page. The invoice clone explicitly owns A4 printing, inherits design/font/accent tokens, and uses legible light document neutrals even when the app is dark. Missing invoice content and blocked popups surface an explanation instead of failing silently.

Regression command: node scripts/check-invoice-print.mjs (local Vite server required). It exercises the real View / Print helper with POS CSS loaded, checks visible printed content, parses the generated PDF for item/amount text, checks A4 width and verifies receipt printing isolation. The live local admin demo invoice INV-0012 was inspected through its More → View / Print action; the in-app browser does not expose its external popup, so PDF output verification uses the isolated browser regression fixture.

## Invoice download and authenticated payment link — 9 October 2026

Invoice More actions now include Download PDF and Payment link. Download uses the existing server document renderer and selected tenant template. The link opens a responsive summary with current total, paid amount, balance and PDF download. Draft and credited invoices cannot create links. Customer portal routing supports the same link.

The link requires authentication. The API checks tenant isolation and resolves CUSTOMER ownership before returning either the summary or PDF. Responses use Cache-Control: no-store. Automatic approval review rejected the initial anonymous invoice/PDF proposal because anyone holding its URL could read financial data; the implementation retains authentication instead.

Selcom and Azam Pay are explicitly shown as not connected. Gateway implementation still needs confirmed provider contracts and merchant configuration, server-side checkout creation, verified callbacks, idempotent settlement posting, reconciliation and sandbox acceptance. Existing manual payment recording remains available.

Verification: invoice-payment-link.test.ts passed against disposable tenant records, covering link creation, draft rejection, anonymous denial, customer ownership, cross-tenant denial, current balance and real PDF bytes. A populated local invoice and link dialog were checked in the browser. Payment summary widths of 1280px and 390px have no horizontal overflow.

Final checks: API and web TypeScript passed. The chained trigger check initially could not start because Windows returned ENOMEM; rerunning the remaining checks passed all 94 trigger contracts, 19 design-system checks and encoding. Scoped diff whitespace checks passed. Repository instructions describing api.ts as a localhost URL plus localStorage bearer helper are stale: the current shared helper uses a same-origin/environment base, session cookies and CSRF protection; this implementation uses that existing helper.
