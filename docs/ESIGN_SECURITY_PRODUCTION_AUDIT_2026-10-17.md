# eSign security and production-readiness audit

Date: 17 October 2026. Scope: the current local checkout in `D:/Apps/Hudumika`, including uncommitted eSign changes.

**Release decision: NO-GO for production signing, notarial certification, and sensitive contracts until the critical/high findings below are resolved.** Earlier UI and workflow tests were not a security sign-off.

## Scope and limits

Reviewed authenticated and public signing routes, reusable documents/templates, personal/company stamping, OTP, certificate/seal services, verification/OCR/forensics, PDF processing, notifications, expiry/reminder/anchor jobs, environment guards, and production dependency advisories. Executed real Fastify/Postgres tests using disposable tenants. No real contracts were signed, no actual invitations were sent, no production infrastructure was changed, and no secret values were printed.

This is a source and local integration audit, not an external penetration test or a legal compliance certification. Live production TLS, reverse-proxy headers, deployed RBAC/RLS, backup restoration, provider delivery, and production load remain unverified. Production-code changes were not made during this audit; the new audit tests deliberately document existing insecure behavior.

## Findings and required fixes

### ES-01 — Critical: unrelated tenant members can retrieve signing credentials

Evidence: `apps/api/src/routes/sign.routes.ts:597` restricts envelope detail by owner/admin only while status is `draft`. After sending, another tenant member can fetch the envelope. `services/sign-notify.service.ts:171` returns recipients using `selectAll()`, including their bearer signing tokens, OTP metadata and signature data where present. Signed-PDF downloads similarly check only tenant membership.

Reproduced: a same-tenant JUNIOR user unrelated to the document receives another recipient's signing token. With OTP disabled, that token grants the public signing capability.

Pending: a creator/admin/explicit-recipient authorization matrix on all detail, list and download paths; role-specific response schemas; never disclose other recipients' bearer tokens, OTP hashes or reusable signature assets. Recheck CUSTOMER-role access independently. UUID unpredictability does not repair missing authorization.

### ES-02 — Critical: arbitrary personal signature application

Evidence: `apps/api/src/routes/sign-stamps.routes.ts:291` accepts `owner_user_id` and passes it to `services/stamp.service.ts:57`. The service uses that ID to select a personal signature without requiring it to equal the authenticated caller or checking an explicit delegation.

Reproduced: JUNIOR can call `/v1/sign/stamps/apply` with another employee's user ID and receive a PDF stamped with that employee's saved signature.

Pending: bind personal stamp ownership to the authenticated user; implement explicit, audited delegation if required. Test cross-user and cross-tenant rejection separately. Company stamp role checks do not protect this personal-signature path.

### ES-03 — Critical: draft content and reusable signature assets exposed before identity verification

Evidence: public token GET at `sign.routes.ts:1385` does not require `sent` status, signing order or OTP verification before returning document bytes. It resolves a saved personal signature and sometimes the company stamp based on sender-supplied recipient identity. Response fields at lines 1500–1510 expose those images. The completed branch returns the full envelope rather than a public allow-list.

Reproduced: a draft with OTP required returns document content and the saved personal signature while `otp_verified` is false.

Pending: public state/identity gate before sensitive content; authenticated, verified ownership before offering saved signatures/stamps; allow-listed completed response; remove raw reusable signature disclosure from bearer-only flows. Sender-entered email/user ID is not proof of the signer's identity.

### ES-04 — High: missing server-side signature, required-field and consent validation

Evidence: `/public/:token/sign` at `sign.routes.ts:1609` casts a request body instead of validating it, then writes `status='signed'` and arbitrary field values. Required fields, checked consent, supported image data, field types and complete answer sets are not enforced here.

Reproduced: `{}` signs a document with a required unanswered text field and no signature image.

Pending: validate the submission against the stored recipient's fields and current document version; reject absent required answers, invalid signatures and foreign/duplicate field IDs; persist explicit consent text/version/time and document digest. UI validation cannot be the enforcement boundary.

### ES-05 — High: signed/completed state can be changed through public routes

Evidence: `/public/:token/decline` at line 1840 has no lifecycle or already-signed guard and changes the envelope to `needs_rerouting`. Public GET changes a recipient to `viewed` whenever `viewed_at` is empty, regardless of its existing status.

Reproduced: decline changes a completed envelope to `needs_rerouting`; GET changes a signed recipient with no viewed timestamp back to `viewed`. That can reopen the signature submission guard on an otherwise still-sent envelope.

Pending: explicit terminal-state transition rules, conditional updates, idempotency and immutable signing evidence. Viewing must never downgrade a signed/declined recipient. Revoke or restrict tokens according to lifecycle and access policy.

### ES-06 — High: signing/finalization is not atomic

Evidence: the public signing handler reads recipient/envelope state, updates signature and fields, logs events, checks all recipients, and completes the envelope through separate `dbPlatform` operations. Only the authenticated send handler has a row lock (`sign.routes.ts:806`).

Risk established by code review, not a concurrent stress reproduction: duplicate requests can pass the same initial checks and duplicate events/finalization; signing can race with void/decline or another signer. Partial writes can survive later errors.

Pending: transactionally lock envelope and recipient, recheck all conditions under lock, make signature submission idempotent, and enqueue one durable finalization task using a unique key/guard. Add concurrent signing, sign-vs-void and repeated-submission tests.

### ES-07 — High: completion and cryptographic signing fail open

Evidence: envelope becomes `completed`/`stamp_applied=true` before PDF generation (`sign.routes.ts:1716`); errors are logged and success still returned (`:1827`). `sign-pdf.service.ts:265` returns an unsigned PDF on cryptographic-signature failure. Invalid/missing source files can produce a fallback page (`:245`) instead of failing finalization.

Reproduced: simulated PDF generation failure still returns `completed=true` with no stamped PDF. The existing signature-reference fixture also exercises the unsigned fallback intentionally; this is not evidence of production cryptographic readiness.

Pending: `finalizing`/`failed` states, durable retry/recovery, and separate explicit outcomes for visual execution, artifact persistence, cryptographic signature and seal issuance. Fail closed where cryptographic signing is required. Never substitute a different source document silently.

### ES-08 — High: Cloud source is not frozen at invitation time

Evidence: `sign-pdf.service.ts:99` reads the current `cloud_files.storage_key` at finalization. Send does not persist an immutable source snapshot/digest; document version recording on create is limited to inline `document_data`.

Risk: a mutable Cloud source can change between review, invitation, signatures and final PDF generation. A valid signature over the final PDF does not establish that every person reviewed those same bytes.

Pending: immutable document/version snapshot when sending, recorded source digest, acknowledgement of that digest by each signer, and a new envelope/version whenever wording changes. Test replacement of the Cloud file after invitation.

### ES-09 — High: OTP guessing and assurance lifecycle need hardening

Evidence: requesting OTP has a 5-per-5-minute token limit, but verify-OTP at line 1586 has no token-specific attempt limit or lockout. The global default is 1200 requests/minute/IP. OTP generation uses `Math.random()` at line 1564; successful verification sets a persistent timestamp which is only checked for existence at signing.

Reproduced: eight incorrect guesses against one token are accepted for comparison with no token lockout.

Pending: cryptographic random generation; bounded per-token attempts across all API instances, resend cooldowns, invalidate after exhaustion, short-lived scoped verification session, and consistent state/expiry checks on request/verify/sign routes. Hashing alone does not protect the online guessing surface.

### ES-10 — High: notary/commissioner credentials are optional assertions

Evidence: credential validation at line 1642 runs only when `certifier_id` is present; missing directory rows fail open. Free-form title/roll number can accompany a CERTIFIER role. A CERTIFIER completion produces a `certified` event regardless of an independently verified professional identity.

Reproduced: a recipient with no directory credential is accepted as a Commissioner for Oaths and emits `certified`.

Pending: define permitted assurance tiers; require current verified credentials, matching signer identity, jurisdiction/execution eligibility and attestation evidence for the notarial tier. Prevent arbitrary preparers granting that tier. Add oath/appearance/session and witness-order evidence appropriate to the approved policy. Resolve the governing jurisdiction from the document: the public signer disclosure currently derives it from the tenant country, which can disagree with a template’s selected jurisdiction. Obtain qualified review of the EAC execution rules and all three language versions before describing templates as legally approved.

### ES-11 — High: short content changes can receive a reassuring comparison outcome

Evidence: `sign-seal-verify.service.ts:143–158` ignores each text insertion/deletion shorter than four characters; line 279 maps no findings to `SEAL_VERIFIED_SCAN_VARIATION_ONLY`. Visual comparison covers at most five pages and tolerates differences below its anomaly threshold; it is not an exact safeguard for a changed digit.

Reproduced: `Pay USD 100 on 1 May.` versus `Pay USD 900 on 9 May.` produces no substantive text findings. This test proves the text comparison defect; a full AI/OCR end-to-end false-green result was not invoked.

Pending: never discard changes to numbers, dates, currency, identifiers, negation or party names solely by length. Require complete page coverage and report OCR confidence/uncertainty. Use `inconclusive` instead of a reassuring verdict when evidence is insufficient. Add financial and date-tampering fixtures beyond page five.

### ES-12 — High: vulnerable production dependency chains

`npm audit --omit=dev --json` reported **14 vulnerabilities: 2 critical, 3 high, 8 moderate, 1 low** across the workspace production graph. This is not a claim of 14 independently exploitable eSign routes.

Confirmed eSign paths: `opentimestamps@0.4.9 -> request@2.88.2 -> form-data`; and direct `node-forge@1.4.0`, also used by `@signpdf/signer-p12@3.3.0`. The request node's aggregate severity includes transitive advisories; the request SSRF advisory itself is moderate. The form-data boundary issue is critical. The node-forge advisory currently lists no patched version; native RSA validation in the certificate roundtrip is a useful mitigation but not a blanket clearance of the entire dependency.

Primary advisory records:
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/advisories/GHSA-fjxv-7rqg-78g4
- https://github.com/advisories/GHSA-p8p7-x288-28g6

Pending: dependency reachability analysis, safe upgrades/replacements, compensating controls where no patch exists, then rescan. The dependency-audit workflow currently has `continue-on-error: true`, so its findings are informative rather than a release-blocking CI gate. Do not run forced automatic major-version fixes without reviewing the signing/anchoring behavior.

### ES-13 — High: public OCR/comparison resource and privacy controls are incomplete

Evidence: unauthenticated `/verify/ocr` and `/verify/compare` (`sign.routes.ts:2013,2029`) accept uploads and invoke/queue resource-intensive processing, subject mainly to the general HTTP/global-rate limit. OCR sends full inline document bytes to Google Gemini (`sign-seal-verify.service.ts`); AI assistance also sends document content. The comparison path stores uploads against a tenant's forensic queue.

Pending: dedicated abuse controls, per-IP/token and cost budgets, concurrency limits, media signature validation, page/pixel limits and sandboxed parsers; malware policy for inline uploads as well as Cloud files. Review anonymous comparison result disclosure and access to stored content excerpts. Document the external AI processing, retention/residency and tenant opt-in policy. Confirm actual provider agreements/configuration; no third-party privacy compliance was certified here.

### ES-14 — Medium: signing-key/certificate lifecycle needs deployment hardening

Evidence: seal signing keys are cached in-process indefinitely (`sign-seal-crypto.service.ts:71`); rotation only updates that process's cache. Another API instance can continue using a retired key until restart. P12 validity is checked on import, but `platform-signing-cert.service.ts:176` does not recheck validity when loading an active identity later. Self-signed fallback is stored under the API's local `uploads/platform` path.

Pending: cross-instance cache invalidation/bounded freshness, safe revoke/rotate drill, validity monitoring and checks on every signing operation, stable secured storage across instances, and a defined trusted-certificate policy. Validate platform key/P12 backup and restore, key separation and access logging. Do not present self-issued identity as independently trusted certification.

### ES-15 — Medium: stranded jobs and partial work need recovery

Evidence: forensic jobs are claimed atomically (`sign-forensic-verify.job.ts:35`, a positive control), but the sweep only selects `queued`; no stale `processing` lease recovery is present. Cleanup only handles `completed`/`failed`, and swallows object deletion failure before deleting the job record. Anchor submission performs the external operation before a conditional update; competing workers can still submit duplicate external work.

Pending: durable leases/heartbeats, stale-work recovery, bounded retries/dead-letter state, storage-delete retries and reconciliation, alerting on stuck/failing work, and tested graceful shutdown. Add the same durable recovery to PDF finalization and seal issuance.

### ES-16 — Medium: bearer URL logging and sensitive draft retention

Evidence: default Fastify request logging records the full public token path; the audit test output demonstrates this using disposable tokens. Logger redaction at `index.ts:262` masks headers but not these URL path credentials. Sensitive editor drafts persist in IndexedDB (`draftStore.ts`).

Pending: redact signing tokens in application/proxy/APM logs; no-store and explicit referrer policy for signing/verification responses; retention and logout/account-switch cleanup policy for local drafts and reusable signature assets; retention/access controls for audit logs and forensic evidence. Prove headers and cleanup in the deployed browser/proxy topology.

## Existing controls that were observed

- 256-bit randomly generated recipient tokens and unique database constraints.
- Tenant-filtered authenticated mutations, with RLS/withTenant as a second boundary; cross-tenant editor and generated-document tests pass.
- Owner/admin guards for draft editing, sending, voiding and version access.
- Signature field geometry and foreign-reference validation in the authenticated editor; source template content survives save/import.
- OTP send throttling, expiry on the actual sign operation, and sequential-order checks, though the gaps above remain.
- Company stamp configuration role gates; forensic case administration role gates; SuperAdmin seal-key controls.
- AES-GCM encrypted secret store and native RSA certificate verification roundtrip.
- Email sendNow records a durable outbox entry and failed deliveries can retry; it is inaccurate to describe all email delivery as an untracked fire-and-forget call.
- Production startup rejects known development credential defaults when APP_ENV is actually `production`.
- `.github/workflows/ci.yml` includes clean database migration, API tests and workspace build steps; the current remote run/branch protection was not inspected.

These controls do not cancel the demonstrated access-control or signing-integrity issues.

## Local configuration observed (not the production deployment)

- APP_ENV is `development`.
- No explicit PUBLIC_APP_URL; the resolved public URL is local. Development marks it trusted; production has a localhost guard for QR generation, but invitation generation does not enforce that trusted flag.
- S3 bucket is not configured; storage defaults to local disk. This can be acceptable only with a deliberate, secured persistence/backup plan; it is not proof that production storage is missing.
- SMS_WEBHOOK_SECRET is not configured; authenticated production SMS callback handling is disabled by the existing startup warning.
- No real email/SMS/WhatsApp delivery, OCR billing/privacy configuration, certificate trust-chain or reverse-proxy deployment was validated. Provider settings may be database-backed; absence of an environment variable alone was not used to declare a provider unavailable.

## Verification and evidence

- The five-file targeted run passed 31 tests before adding the final personal-stamp reproduction: 23 functional/cryptographic tests plus 8 audit reproductions.
- `apps/api/src/tests/sign-security-audit.test.ts` deliberately asserts the observed insecure behavior. A green audit reproduction means the issue exists, not that the application is secure. Convert these to secure-behavior regression tests while implementing fixes.
- Final audit reproduction run: **9/9 reproduced** after correcting a test-only partial mock so the stamp renderer remained real. The final personal-signature test receives a real stamped PDF from the API as an unrelated JUNIOR user. Together with the earlier functional run, 32 distinct tests were exercised: 23 functional checks and 9 security-gap reproductions.
- Web `tsc --noEmit` passed. Encoding checks passed. Full monorepo/API-wide compilation remains a separate release gate.
- Dependency scan used the installed workspace lockfile and the registry advisory service. Exploit reachability of individual dependency advisories was not penetration-tested.
- A one-page PDF successfully rasterized through the current server PDF rendering service in an isolated process. Large/adversarial documents and worker resource isolation remain untested.
- The full monorepo production build, API-wide typecheck, load/soak tests and external penetration tests were not completed as part of this scoped review. They remain release gates.

## Ordered production exit checklist

1. Close ES-01/02/03 before using real confidential documents or stored signatures.
2. Close ES-04/05/06/07/08; exercise concurrent signing, duplicate submissions, void/decline races and storage/key failures.
3. Close ES-09/10/11; prove recipient identity, professional assurance policy and reliable content-comparison verdicts.
4. Resolve/accept documented residual risk for ES-12/13 after advisory reachability review and abuse/privacy controls.
5. Close ES-14/15/16; rehearse rotation/revocation, job recovery, token log redaction and data retention.
6. Stage with production APP_ENV, HTTPS public origin, trusted proxy config, real provider credentials, hardened document processing and persistent storage.
7. Perform a real invitation -> OTP -> signer/witness/notary as applicable -> immutable PDF -> verification -> download flow with designated test recipients and verified delivery receipts.
8. Complete restore drills for Postgres, document objects and signing keys; define RPO/RTO and incident/key-compromise response.
9. Run full clean builds/CI, role/tenant/public-link abuse tests, multi-instance tests, load/soak tests and an external security review. Establish alerts for failed finalization, invalid seals, stuck jobs and OTP abuse.
10. Obtain documented legal/content/translation approval for each supported jurisdiction and execution tier. This audit does not replace that approval.
