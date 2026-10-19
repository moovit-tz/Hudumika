# eSign security recheck — 17 October 2026

**Remediation update:** the blockers from the second recheck have now been addressed in the working tree. See [the Claude Code review trail](ESIGN_CLAUDE_CODE_REVIEW_2026-10-17.md) for scoped files, migration 607, regression evidence and remaining production work. The recheck findings below are the historical evidence that motivated those fixes, not a fresh claim that the same code is still present. Final verification is recorded in the review trail.

## Second recheck — latest checkout

The latest six-suite run reports **39 passed, 1 failed (40 tests)**. The focused recheck rerun repeats the same failure (5 passed, 1 failed). Earlier entries below describe the first recheck and are historical.

Confirmed improvements: OTP attempt lockout now passes; creation responses omit recipient tokens; saved signatures are withheld without OTP; document bytes are withheld before required OTP; malformed signatures and false required checkboxes are rejected; certification with no credential is rejected.

**Remaining release blockers:**

- **Broken finalization audit events:** the signing route logs `finalizing` and `finalization_failed`, but migration 606 only adds values to `sign_envelope_status`. Direct inspection of the test database confirms these values are absent from `sign_event_type`. The real finalization regression returns HTTP 400 / PostgreSQL 22P02 after recording the recipient signature. Add a migration for the event enum and verify a successful completion and a forced PDF failure end to end. This is an incomplete migration, not simply an unapplied status migration.
- **OTP identity remains sender-controlled:** creation persists the supplied recipient `user_id` and phone; OTP is delivered to that supplied phone, while asset lookup uses `user_id`. OTP possession therefore does not independently establish ownership of the saved signature. Bind reusable assets to authenticated ownership or an independently verified account contact. This is source-confirmed; no real SMS was sent during this recheck.
- **Certifier validation remains partial:** signing rejects missing/revoked/expired credentials but does not require `verification_status === 'verified'`, bind the credential to the signer, or include tenant scope in the credential lookup. An existing unverified credential is not blocked by this guard.
- **Cryptographic failure still falls back to unsigned PDF:** `sign-pdf.service.ts` catches signing errors and returns unsigned bytes. The completion handler cannot distinguish these from successfully digitally signed bytes and logs a verified event. Require an explicit signing assurance result and truthful status, or fail closed where cryptographic signing is required.
- **Concurrency and recovery remain open:** public signing still lacks an atomic transaction/lock; no finalization retry/recovery path was found. Completion/stamping timestamps are set before artifact generation.

Other dependency, source-snapshot, OCR/privacy, key-management and deployment findings remain pending unless independently closed. No product code was changed in this recheck.

**Release decision: still NO-GO for production signing and notarial certification.** This recheck supersedes the original audit's claim that every finding remains unchanged; several fixes are now present.

## Verified improvements

The current security regression suite confirms rejection of unrelated tenant-member document access, removal of signing secrets from document detail responses, personal-stamp ownership bound to the caller, rejection of public draft access, withholding saved signatures before required OTP verification, required text/signature presence checks, terminal-state protections, and detection of short financial edits.

## Confirmed remaining blockers

1. **Critical — reusable signature disclosure with optional OTP.** A JUNIOR sender can create a recipient referencing another tenant user's identity, obtain the draft recipient token from creation, and retrieve that user's saved signature after the document becomes sent when OTP is disabled. The evidence test moves its disposable document to sent directly in the database to avoid sending actual invitations. Saved signatures must require independently verified ownership or explicit audited delegation; sender-selected identity is insufficient.
2. **High — document bytes available before required OTP.** An anonymous recipient-token GET still returns document data with `otp_verified: false`. Decide and enforce the intended confidentiality boundary before serving the document.
3. **High — false completion after PDF failure.** The signing handler persists completion before generating the final PDF, catches generation failures, and returns HTTP 200 with `completed: true` while the final file URL is null. Separately, the PDF service still returns an unsigned document after a cryptographic signing failure. Use a durable finalization state, atomic/idempotent transitions and retryable jobs; only announce completion after verified artifact persistence.
4. **High — incomplete payload and decision validation.** A malformed image data URL is accepted as a signature, and a required checkbox accepts the string `false`. Decode and validate images, validate each field by its type, and enforce explicit consent where required.
5. **High — unverified certification.** A recipient marked CERTIFIER with no directory credential can produce a `certified` event under a Commissioner for Oaths title. Require a valid, tenant-scoped, authorized credential and enforce its current status at signing.
6. **Deployment blocker — OTP migration missing locally.** The OTP attempt-limit regression fails because `sign_recipients.otp_attempts` does not exist. Migration `605_sign_otp_attempt_limit.sql` is present but not applied in the tested database. Apply through the normal migration runner and rerun the lockout test; code presence alone does not verify the fix.

## Earlier findings not closed by this recheck

Public signing still uses sequential state mutations without a transaction or row lock. Immutable source snapshotting, OTP verification expiry, dependency vulnerabilities, public OCR abuse/privacy controls, signing-key rotation/expiry, stale-job recovery, sensitive URL logging, production provider configuration, backups and deployment checks require the follow-up work described in [the original audit](ESIGN_SECURITY_PRODUCTION_AUDIT_2026-10-17.md). This was not a fresh external penetration test or a legal compliance certification.

## Verification

- Five existing integration suites: **33 passed, 1 failed** across 34 tests; the failed OTP test reports the missing column. A cleanup hook also exceeded its 20-second timeout, so the combined command exited nonzero.
- New `apps/api/src/tests/sign-security-recheck.test.ts`: **5 evidence tests passed**, meaning the five insecure behaviors above were successfully reproduced, not fixed. Disposable tenants were used. PDF generation was intentionally mocked to fail to exercise the real handler's failure path; no real signing invitations were sent.
- Full `npm run typecheck` passed: API and frontend TypeScript, workflow trigger consistency, design-system contract and encoding checks.
- No product/UI code changed during this recheck, and no new visual sign-off is claimed.

The added evidence tests should become secure-behavior regression tests when each corresponding vulnerability is repaired.
