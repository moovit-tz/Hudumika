# eSign security recheck — 17 October 2026

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
