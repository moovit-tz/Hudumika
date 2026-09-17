# Hudumika app production-status audit — 2026-09-17

## Decision

Hudumika is **not ready for an unrestricted production launch as one platform**.
The strongest current evidence supports a controlled pilot for selected apps, but
no app should be labelled fully production-ready while the shared platform gates
below remain open. Project OS is a hard application-level blocker.

This report maps the current 31 `WorkspaceApp` shells to the live evidence in
`AUDIT_REGISTER.md`. “Pilot-ready” means its principal journey has been exercised
against the real API/database and it has no known app-specific release blocker.
It does not override the shared platform gates.

## Shared gates affecting every app

- Open high-risk data work: non-tenant table classification (`HUD-0004`), mixed
  `tenant_id` types (`HUD-0007`), and developer/analytics isolation confirmation
  (`HUD-0008`).
- Regression coverage remains sparse relative to 196 route files and roughly 468
  pages (`HUD-0005`/`HUD-0011`), despite the repository now containing API tests.
- Lint is non-functional (`HUD-0022`); dependency-vulnerability ownership remains
  open (`HUD-0012`).
- Accessibility, responsive/mobile, realistic-volume performance, broad
  concurrency/idempotency, and all third-party integrations have not received a
  complete platform-wide pass.
- Today, `npm run typecheck` passed (API, web, trigger check, design-system check).
  `npm run build` exceeded a 180-second audit window, so the prior verified build
  remains historical evidence rather than a fresh pass.
- Studio's trigger checker passed but warned that dynamic CMS emissions
  `entry.${action}`, `page.${action}`, and `post.${action}` are not literal trigger
  registry entries.

## Per-app status

| App / shell | Status | Ready now | Pending before production |
|---|---|---|---|
| Workspace Admin | Conditional | Tenant/workspace administration exists; RBAC route sweep closed. | Full admin-flow browser/E2E pass, accessibility/mobile, audit-log and destructive-action regression coverage. |
| Hudumika AI | Pilot-ready | Tool-calling tenancy, conversation ownership, personal/shared memory, cross-tenant isolation and API-key masking were adversarially verified (`HUD-0126`). | Provider outage/rate-limit/load testing, prompt-injection/red-team suite, broader automated regression. |
| Bliss | Pilot-ready | Team chat clean (`HUD-0119`); calls/meetings disclosure and guest-session bugs fixed (`HUD-0120`); escalations clean (`HUD-0121`). | WebRTC/TURN production topology, reconnect/load tests, browser matrix and external guest abuse testing. |
| Calendar | Hold | Public booking works; double-booking race fixed (`HUD-0075`, `HUD-0122`). | **Known HIGH functional gap:** guest invitations are not production-complete (`HUD-0124`); external calendar sync/provider certification and concurrency coverage. |
| CargoTracker | Pilot-ready | Freight rate-shopping, booking, quote, confirmation and shipment conversion traced clean (`HUD-0056`). | Carrier/external-provider contract tests, volume/performance and full UI/browser pass. |
| ClearOS | Pilot-ready | Shipment workflow through FinOps/GL/payment traced; schema bug fixed (`HUD-0043`); declaration anchoring verified (`HUD-0108`). | Broader customs/TRA integrations, remaining workflow variants, load/mobile/accessibility and automated journey coverage. |
| Drive / Cloud | Pilot-ready | Upload/download/public-share byte integrity, attribution and access log traced clean (`HUD-0047`). | Object-store/AV/Office-conversion failure modes, quota/load testing, large-file/resume and browser coverage. |
| OneSite / CMS | Conditional | Collaboration auth bypass fixed (`HUD-0128`); content models/capabilities clean (`HUD-0129`); forms and seven error-leak/404 bugs fixed (`HUD-0130`). | Resolve/confirm CMS dynamic Studio event registration warnings; full publish/release rollback, webhook reliability, browser/accessibility and regression suite. |
| ComplyOS | Conditional | Renewal crash and workflow dead-end fixed (`HUD-0055`); legal-marketplace role gate fixed (`HUD-0025`). | Government/sanctions/agency integrations need production credentials and contract tests; dead marketplace tables and broader compliance workflows need closure. |
| Contacts | Pilot-ready | Nested labels/smart groups verified in browser (`HUD-0102`); Google/Microsoft OAuth sync adversarially checked (`HUD-0116`); role gap fixed. | Real provider certification/refresh-token lifecycle, large address-book sync and conflict testing. |
| CRM | Pilot-ready | Lead-to-deal, scoring/custom fields, smart views, labels, email and tenant boundaries were traced clean (`HUD-0048`, `0065`, `0105`, `0106`, `0115`). | Destructive-delete policy decision, high-volume pipeline performance and broader UI automation. |
| Developer Platform | **Hold** | Critical cross-account/tenant bypass and broken feature were fixed (`HUD-0117`). | **Known HIGH fabricated verification data** and **MEDIUM broken usage metering** remain; analytics/developer isolation is still open (`HUD-0008`). |
| Email | Pilot-ready | Compose/send/schedule, threads, drafts, attachments, OAuth safeguards and role boundaries were exercised clean (`HUD-0078`; `HUD-0034` fixed). | Real SMTP/IMAP/OAuth provider matrix, bounce/retry/deliverability, scale and browser regression. |
| FinOps | Pilot-ready with finance sign-off | AP, AR, GL, payroll posting, tax, reconciliation, FX, budgets, period close, assets, dividends and reversals have extensive live traces; found defects were fixed (`HUD-0043`, `0044`, `0060`–`0081`). | Formal accountant reconciliation/sign-off, statutory/provider certification, concurrency/rounding at scale and automated financial golden tests. |
| HuduBI | Pilot-ready | Data-quality engine and widget/entity resolution traced; UUID/error leaks fixed (`HUD-0086`, `0096`, `0127`). | Analytics-table isolation closure (`HUD-0008`), large-dataset query budgets/caching and metric-definition business sign-off. |
| Inventory | **Hold** | Warehouse/item/receipt/issue/count flows execute. | **Known MEDIUM-HIGH accounting gap:** receipts and count corrections do not post to GL; PO receipt does not update stock (`HUD-0054`). Product/accounting decisions and regression tests required. |
| Lens | Internal-only | Internal project/engineering tool is present. | Audit records describe it as an internal tool and do not contain a production golden path; clarify product status, ownership, tenancy classification and complete security/functional testing. |
| NexusHR | Pilot-ready with HR sign-off | Recruitment/e-sign, payroll-to-GL, leave, attendance, overtime, discipline, benefits, training and onboarding/offboarding were traced; discovered issues fixed (`HUD-0044`, `0051`, `0063`, `0072`–`0091`). | Labour-law/privacy review, biometric-device/provider certification, payroll statutory sign-off, scale and regression automation. |
| Notes | Pilot-ready | ACLs, optimistic locking, versions and legal hold traced clean; 404 crash class fixed (`HUD-0079`, `0123`). | Search/load/offline behavior, retention/legal-policy sign-off and UI automation. |
| Ondi | Pilot-ready with identity sign-off | OIDC, SAML, login methods, recovery, join workflows, JIT roles and session revocation were heavily adversarially tested; discovered gaps fixed (`HUD-0066`, `0103`–`0114`). | External IdP certification matrix, disaster recovery/key rotation, sustained auth load and independent security review. |
| Onsite / AgencyHost | Pilot-ready | Hosting/DNS/server provisioning and agency cross-tenant workflows traced; role, SSRF and provider-validation defects fixed (`HUD-0050`, `0085`, `0095`, `0118`). | Real registrar/cloud/DNS provider certification, provisioning rollback/DR, secret rotation, uptime and load tests. |
| Petti | Pilot-ready with finance sign-off | Wallet, deposit, named approval, withdrawal, disbursement and GL posting traced clean (`HUD-0052`). | Approved-but-undisbursable withdrawal has no cancel/void path (LOW); gateway certification, reconciliation and automated finance tests. |
| Projects / Project OS | **Blocked** | UI and 34 API routes exist. | **Confirmed module-wide schema drift:** representative portfolio, phase, dashboard, resource and approval endpoints fail (`HUD-0032`). Repair schema/service contract and rerun every core journey before any pilot. |
| SEAL | Pilot-ready with customs sign-off | Bonded lot/declaration/duty/release, billing, reefer, yard, equipment, sensors and automation traced; auth and update bugs fixed (`HUD-0046`, `0092`–`0101`). | Customs/legal certification, hardware integration tests, high-volume warehouse concurrency and full regression suite. |
| Sign | Pilot-ready with legal sign-off | Envelope lifecycle, public verification, custody forensics, matters and jurisdiction engine traced clean; ownership/stamp/version gaps fixed (`HUD-0045`, `0080`, `0083`). | Independent legal/cryptographic review, certificate/HSM/anchor operations, long-term validation and browser/accessibility coverage. |
| SMS | Conditional | Forged opt-out webhook and phone-normalization bypass fixed (`HUD-0125`). | Africa's Talking/Twilio production signature/provider certification, delivery callback/retry/idempotency and opt-out compliance audit. |
| Store | Pilot-ready | Marketplace submission/install authorization issue fixed; marketplace journey traced (`HUD-0070`). | Commercial/moderation policy, package-supply-chain scanning, billing/refund and malicious-app review process. |
| Studio | Pilot-ready | Real event-bus automation executed end-to-end; task action crash fixed (`HUD-0053`). | Resolve CMS dynamic-event warning, action idempotency/retry/loop controls, failure recovery and scale testing. |
| SuperAdmin | Conditional | Superadmin route family is role-gated; raw-SQL query builder with OTP/read-only DB backstop passed adversarial checks (`HUD-0109`); package management tested (`HUD-0107`). | Independent privileged-access review, break-glass/key rotation, immutable audit/export, destructive-operation recovery and operator runbooks. |
| Tasks | Conditional | Task ACL/collaboration/dependency routes were reviewed; task side of `HUD-0124` was exercised and status behavior fixed. | Shared Calendar guest-invite HIGH gap affects the combined journey; recurrence/reminder worker reliability, concurrency and browser/accessibility coverage. |
| HuduFreight / Tracking | Pilot-ready | Fleet dispatch, border crossing and trip billing traced clean (`HUD-0059`); GPSWOX/WhatsApp webhook auth tested (`HUD-0110`); RBAC gaps fixed. | Real telematics/carrier credentials, stale/offline device behavior, route/map scale, mobile driver workflow and provider SLAs. |

## Recommended release sequence

1. Block production globally until Project OS is either repaired or removed from
   customer entitlements/navigation, and close the Inventory GL and Calendar
   guest-invite gaps.
2. Close the three shared high-risk data items (`HUD-0004`, `0007`, `0008`), make
   lint operational, complete dependency/security review, and obtain a fresh
   green build plus migration rehearsal.
3. Pilot the strongest apps first: CRM, Notes, AI, Bliss, Contacts, CargoTracker,
   Drive, Studio, and HuduBI; use a limited tenant cohort and feature flags.
4. Release regulated/financial apps only after domain sign-off: FinOps/Petti by
   accounting, NexusHR by payroll/privacy/legal, SEAL/ClearOS/ComplyOS by customs
   and compliance, Sign by legal/security.
5. Certify each external provider in a staging environment with production-like
   credentials, retries, webhooks and failure injection before enabling the
   corresponding integration in production.

## Evidence and caveats

- Primary evidence: `docs/production-readiness/AUDIT_REGISTER.md` and
  `FINAL_PRODUCTION_READINESS_REPORT.md`.
- Inventory basis: 31 current `WorkspaceApp` shell IDs under
  `apps/web/src/shells`.
- The older AGENTS statement that no automated tests exist has drifted from the
  repository: API and web test files and Vitest scripts now exist. Coverage is
  still far too narrow to make the earlier production-risk conclusion obsolete.
- “Pilot-ready” is deliberately narrower than “production-ready.” No row in this
  report waives the shared gates at the top.
