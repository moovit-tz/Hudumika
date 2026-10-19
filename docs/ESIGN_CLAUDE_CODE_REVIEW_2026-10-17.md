# eSign remediation — Claude Code review trail

**Coordination: ready for Claude Code review.** Codex finished the scoped security repair and verification on 18 October 2026. Review `sign.routes.ts`, `db/client.ts`, `sign-pdf.service.ts`, `sign-signature-image.ts`, security/signature regression tests, `SignPublicPage.tsx`, shared sign types and migration 607 against the manifest. Do not reset them to the original audit state. Catalogue/industry/creation-hub changes belong to the other session, except the three compile-prop fixes noted below. A concurrent reset removed passing repairs during this task; the repairs were restored without resetting other work. The user requested coordination through this document.

Date: 17 October 2026. Base at start: `82dc8097`. Review the named paths against that commit; no commit or deployment was performed by this remediation task.

## Scope and decisions

This addresses the five blockers in the second recheck: missing finalization audit enums, saved-asset identity binding, incomplete certifier checks, unsigned fallback, and concurrent signing/recovery. It is not a claim that every finding in the original production audit is closed.

| Finding | Change | Review paths |
| --- | --- | --- |
| Finalization enum failure | Add the missing event values through a new migration, preserving applied migration 606 | `apps/api/src/db/migrations/607_sign_finalization_security.sql` |
| Sender-selected identity used as authority | Public tokens/OTP no longer authorize saved personal signatures or company stamps. Use the full authentication middleware for cookie or bearer sessions and match the recipient to that account. Persist `authenticated_signer_id` from the verified session, never the request payload | `apps/api/src/routes/sign.routes.ts`, `apps/api/src/db/client.ts`, `packages/types/src/sign.ts` |
| Company-stamp authority inferred from a tag | Require an authenticated, authorized signer for stamp fields; PDF stamp resolution uses the persisted authenticated account and tenant-scoped user lookup | `apps/api/src/routes/sign.routes.ts`, `apps/api/src/services/sign-pdf.service.ts` |
| Weak notary/certifier checks | Require verified, unexpired credentials in the document tenant and bind the credential holder to the authenticated signer; certification-stamp fields require CERTIFIER role | `apps/api/src/routes/sign.routes.ts` |
| Cryptographic signing failure returns unsigned bytes | Remove unsigned fallback: PDF cryptographic signing errors propagate to failed finalization | `apps/api/src/services/sign-pdf.service.ts` |
| Image-header-only validation | Decode and normalize PNG/JPEG with the existing sharp dependency, strict base64, bounded encoded size and pixel count; reject truncated/oversized images and SVG rather than storing an unrenderable signature | `apps/api/src/services/sign-signature-image.ts`, `apps/api/src/routes/sign.routes.ts` |
| Concurrent signing/decline | Transaction and document row lock, then reread recipient state; signature, field values and audit events commit together. Success responses are returned after commit rather than manually sent inside the transaction | `apps/api/src/routes/sign.routes.ts` |
| Recovery and premature completion | Shared finalization function; timestamps and completed state only after artifact persistence. Authenticated, entitled owner/admin `POST /v1/sign/envelopes/:id/retry-finalization` recovers failed/stale finalization; repeated completed retries do not upload again | `apps/api/src/routes/sign.routes.ts` |

## Regression coverage

`apps/api/src/tests/sign-security-recheck.test.ts` covers pre-OTP privacy, malformed signatures, checkbox enforcement, forced PDF failure and concurrent sign-versus-decline. `apps/api/src/tests/sign-security-remediation.test.ts` separately covers sender-selected assets even after OTP, authenticated owner asset access, duplicate signing, owner/admin recovery authorization and idempotency, cross-tenant retry rejection, unverified/foreign credentials, authenticated credential-holder binding, and company-stamp bearer-token rejection. Keeping the additional coverage separate also makes concurrent accidental resets easier to detect.

`apps/api/src/tests/signature-reference.test.ts` now uses an ephemeral test-only PKCS#12 identity to exercise the real signed-PDF output. A separate negative test requires failure when the signing identity is unavailable. No production identity is modified.

The security suites now use a valid generated PNG fixture: the old one had a PNG header but failed real decoding. The added truncated-PNG regression verifies that header bytes alone do not authorize signing. Cookie/CSRF tests exercise the current browser session mechanism, not just bearer test tokens.

Run:

```powershell
npm run db:migrate
npm run typecheck
npm run test -w apps/api -- src/tests/sign-security-audit.test.ts src/tests/sign-security-recheck.test.ts src/tests/sign-security-remediation.test.ts src/tests/sign-editor.test.ts src/tests/sign-documents.test.ts src/tests/signature-reference.test.ts src/tests/signing-certificate-roundtrip.test.ts --hookTimeout 60000
```

Migration 607 was applied successfully to the local database through the normal runner. Integration fixtures use disposable tenants; the recovery test mocks storage/PDF output, while the separate PDF test performs actual cryptographic signing. No real invitations or SMS messages are sent.

## Reviewer attention and remaining production work

- Finalization currently holds a transaction/document lock through PDF generation and storage. This deliberately prioritizes consistency. Review timeouts and storage latency under load; a durable worker/outbox with a fenced lease is a future improvement. A process crash rolls back the database transaction; an upload completed before rollback can leave an orphan artifact for storage cleanup.
- Failed finalization has an authenticated backend retry endpoint; this change does not add a retry button or scheduled recovery worker.
- External ordinary signers still draw/upload their own signatures. Saved employee assets, company stamps and certification require an authenticated account. `SignPublicPage.tsx` now uses the existing `apiFetch` helper so signed-in requests carry the session, refreshes document data after OTP, and withholds the signed-PDF download until completion. Pending finalization is described truthfully. It also stops claiming a legal timestamp guarantee. No layout redesign was made.
- Credential verification remains an administrative assertion in the directory, not a fabricated government/notary registry integration. This change does not establish jurisdiction-specific legal validity.
- Instructions drift: AGENTS.md describes `apiFetch` as attaching a localStorage bearer token. The current implementation uses `credentials: 'include'`, refresh cookies and CSRF headers; API authentication uses cookie-priority `extractToken`. The repair follows the actual shared authentication/cookie helpers and includes a cookie-session/CSRF regression. Do not regress this to a parallel localStorage token path.
- Existing historical `authenticated_signer_id` values remain null rather than backfilling unproven identity from sender-selected tags.
- The original audit's source snapshotting, dependency advisories, OCR/provider/privacy, signing-key lifecycle, logging and deployment/backup findings remain separate release work.

Other sessions edited document-catalogue and creation-hub files during this task. Those files are outside this remediation scope; do not include them in its review/commit unintentionally. The older recheck report also had an existing working-tree edit at task start.

Final compile integration exceptions: in `LawDepotCreationHub.tsx`, only the unsupported icon name `spinner` → `refresh` is this task's change. In `SignDocumentLibrary.tsx`, only two unsupported active badge variants `white` → `secondary` are this task's changes. The surrounding layout/catalogue work belongs to the other session. These three minimal fixes were required after the full API check passed and the frontend compiler rejected those props.

## Final verification

- Migration 607: applied locally through `npm run db:migrate`.
- Final restored/expanded run: **7 files passed, 48 tests passed, exit 0** (55.69 seconds) with the existing runner's CLI `--hookTimeout 60000`. The preceding run passed all 48 assertions but failed its document-library cleanup hook at the default 20 seconds. No assertions or global runner configuration were weakened. Initial complete verification before the concurrent reset also passed 45 tests.
- After adding cookie-session/CSRF and full image-decoding coverage, the final targeted security run passed **3 suites / 26 tests / exit 0** (52.92 seconds). Together with the 24 editor/document/PDF tests in the full run, this is **50 distinct passing tests**. Expected forced-PDF-failure logs come from deliberate failure-path mocks.
- Final `npm run typecheck`: **passed / exit 0**, including API and frontend TypeScript, 106 workflow-trigger checks, 19 design-system contract checks and encoding validation. An earlier run caught the three unsupported UI props from the other session; those were corrected using the existing component API. The image-validation module also passed its direct strict TypeScript check. Completed 18 October 2026 after the environment resumed from an overnight pause.
- Browser check attempted on a disposable public signing document. The workspace lock screen prevents visual verification; no lock was bypassed. The fixture was removed and the browser returned to `/sign`. No visual sign-off is claimed.
- `git diff --check`: passed.
- `docs/ESIGN_SECURITY_REMEDIATION_MANIFEST_2026-10-17.json` lists hashes of the scoped security paths, including the separate new test and migration, so subsequent resets can be identified. Recompute after review edits; the manifest is a source snapshot, not a deployment attestation.


## Creation flow coordination - 18 October 2026 (active Codex implementation)
The human requested template/upload/blank entry, AI-assisted setup, rich editing and exports. Please coordinate here before overwriting the creation flow. Active implementation: `SignCompose.tsx` + `SignCompose.css` (dedicated page, shared RichTextEditor), `SignCreationWorkspace.tsx`, `LawDepotCreationHub.tsx`; backend `sign-documents.routes.ts`, `sign-rich-document.service.ts`, `sign-document.service.ts`, `ai.routes.ts`; shared definition `editor_html`. New real AI endpoint `/v1/ai/document-draft`; do not use email-only compose-draft for legal documents or silently substitute boilerplate on AI failure. All content writes enforce tenant AND creator. Rich HTML is sanitized server-side; PDF includes local embedded images without server-side remote URL fetching. Existing controlled templates keep decision-based editing. Concurrent `AiDocumentGeneratorModal.tsx` and `SignDocumentStudio.tsx` were detected while implementing; please do not wire a second editor/modal path over the page flow. Repository instructions require dedicated pages for multi-step creation. Verification in progress.

Creation flow implementation status: rich content API persists in definition.editor_html (no schema migration); server sanitizer strips scripts/event attributes and remote images. Embedded PNG/JPEG is decoded with sharp for PDF export. Rich PDF is also the source handed to signing. Template/upload/blank choices use /sign/editor; blank setup and rich editing use mode=blank/compose. Rich company templates open directly in compose, controlled legal templates keep questionnaire editing and offer an explicit Full Text Editor copy. Exports implemented: PDF, HTML, TXT. Word import uses existing office-convert integration and fails explicitly if SOFFICE_BIN is missing. AI uses real provider credentials via new /v1/ai/document-draft, never email compose-draft or a simulated fallback. Full npm run typecheck passed (including 106 triggers,19 design checks,encoding); document and rich-content suites passed 15 tests before adding one image-rendering test. Browser verification currently blocked by workspace lock. Concurrent unused Studio/AI modal files retained, with only API/type errors repaired; do not wire them over SignCompose.

Latest verification: 4 rich-content tests passed, including embedded image PDF rendering and rejecting malformed image bytes. Together with the 12 document tests, 16 distinct tests pass. Final frontend typecheck passed before the final language handoff adjustment; repeating the frontend check. Visual review remains pending workspace unlock.

Browser verification completed after unlock: blank setup renders title/type/industry/jurisdiction/language/requirements; sample draft saved and reloaded at draft 7332e5f3-9f9d-4441-9410-4f2f509825d3. PDF, HTML and TXT downloads succeeded. Prepare for signing loads the generated one-page PDF and retains stamping/certified-copy fields. Uploading the generated sample PDF also opens the signing editor. Selecting Service agreement opens its questionnaire and Full Text Editor transfers the clause text. At 390px and 320px, compose scrollWidth equals clientWidth (374/374 and 304/304). Live AI generation returned a provider failure; no simulated draft was substituted. Added a redacted provider reason to the UI error for diagnosis. Final full npm run typecheck passed again including triggers/design/encoding. Shared RichTextEditor code-block toolbar option restored after it was removed by the concurrent session.

AI blocker confirmed by live provider response: "Your credit balance is too low to access the Anthropic API." Requires billing action or a different configured provider; no credentials or billing settings changed. Browser screenshot: document-creation-verified.png in the Codex visualization artifacts directory.
