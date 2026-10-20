# Document composer readiness review — 2026-10-19

Scope: the rich document composer shown in the supplied screenshot (`/sign/editor?mode=compose`), its company-template form, generated-document routes, HTML sanitizer, PDF rendering and handoff to the signing editor. This review does not certify every Hudumika backend or a deployed production environment.

## Result

The local document flows and security regressions tested below pass. Full production sign-off remains pending export-fidelity work and deployment verification. No production settings were changed and no real signing invitations were sent.

## Changes

- Replaced editor glyph buttons, link prompts, feedback and the template overlay with shared Hudumika components; removed private button sizing and colors that overrode the design-system controls.
- Added container-responsive layouts for the actual editor width, including 375px content areas: wrapping header actions, two-column metadata, compact signing actions and a wrapping formatting toolbar with grouped menus. Paper remains readable in dark mode. Typography/page selectors are explicitly labelled as preview settings.
- Added accessible editor/title names, preserved the caret when using toolbar/dialog controls, escaped link labels and limited inserted links to HTTP, HTTPS and email.
- Tracked metadata changes as unsaved; restored language and template jurisdiction. Templates now retain their document type and an existing custom category.
- Created complete rich drafts in one request, using server-sanitized HTML as the source of text. Rejected empty sanitized content and oversized text.
- Added optional optimistic save checks and row locking to reject stale composer saves. The legacy plain-text update route rejects rich drafts, preventing stale HTML from overriding revised text in PDFs.
- Exported HTML/Word-compatible content and saved templates from the sanitized server response, rather than unsanitized editor DOM.
- Added heading, strike, italic, alignment, ordered-list and basic table support to PDF export. Malformed embedded images return a recoverable 422 instead of an unhandled error. Image count, decoded resolution, table-column and content-size limits bound export work.
- Preserved the Tanzania Mainland country code in the PDF handoff to signing.
- Removed unsupported “verified archive” and “official binding instrument” claims from unsigned draft UI and local exports.

## Verification

- `npm run typecheck` passed, including trigger, design-system and encoding checks.
- `npm run build` passed for all workspaces.
- 61 distinct tests passed across 8 suites, with no skipped tests in these runs:
  - `sign-rich-document.test.ts`: 11.
  - `sign-documents.test.ts`, `sign-editor.test.ts`, `signature-reference.test.ts`, `signing-certificate-roundtrip.test.ts`: 24 combined.
  - `sign-security-audit.test.ts`, `sign-security-recheck.test.ts`, `sign-security-remediation.test.ts`: 26 combined.
- Integration tests used disposable tenants and the real local database. They cover save/reload, sanitized content, cross-tenant and same-tenant ownership, stale saves, PDF bytes, PDF source metadata, signing authorization, OTP restrictions, required fields, signing/decline races and failed-finalization recovery.
- PDF extraction checked heading text, separate table cells and ordered-list numbers. This is content verification, not pixel-perfect layout equivalence.
- Browser checks rendered the actual composer component in a temporary local harness at desktop and 375px content widths, in light/dark themes. Link insertion escaped literal markup; the template dialog displayed the current category/type. Harness files were removed.
- The live application was locked. An authenticated browser save/export/signing run through the actual app shell was not completed. API integration tests exercised the corresponding server routes.

## Remaining production gates

1. **Export fidelity:** the PDF renderer uses A4 and standard embedded typography. Preview font, font size and paper size are view settings, not persisted print settings. Exact CSS spacing, indentation, table styling, cell spans and images inside tables are not fully supported. Nested tables and images inside tables fail export explicitly. Add a faithful renderer or restrict the authoring contract before claiming WYSIWYG production export.
2. **Word format:** the current `.doc` download is HTML compatible with Word, not a native binary Word/DOCX export. Validate it in supported Office clients or implement a native format before promising native Office output.
3. **Deployment integrations:** actual AI-provider availability/credits, email/SMS delivery, durable object storage, public signing URL, production certificate trust and retention/recovery were not exercised with live provider accounts. Signing recovery tests intentionally mock a PDF failure; certificate roundtrip uses a test certificate. These do not certify production service configuration.
4. **Operational validation:** run an authenticated save → reload → export → prepare → controlled test signature flow on staging; confirm production migrations, backups/restore, TLS and service configuration. This is outside the local readiness evidence collected here.

No integrations, legal assurances or production readiness were fabricated. Unrelated changes already present in the shared checkout were retained.

Follow-up UI refinement: consolidated repeated toolbar controls into Style, Alignment, Lists and Insert menus; shortened Save/Sign labels; used icon actions for templates, export and AI; consolidated five download implementations; verified no horizontal overflow at desktop and 375px content widths. The full production build passed (types, UI package, API and Vite web bundle). Vite reported existing shared-import/chunk warnings.
