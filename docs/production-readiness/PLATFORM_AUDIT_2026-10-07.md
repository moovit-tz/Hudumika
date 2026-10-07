# Platform audit — 7 October 2026

Status: significant security and shared-UI repairs implemented; release blockers and broader screen-by-screen work remain. This report records observed evidence, not a compliance certification or a claim that every screen has been manually verified. Do not approve a production release from this report alone.

## Scope and method

Repository-wide UI inventory, design-system checks, production build, API integration tests against the local database, dependency advisories, tenant isolation, authentication, logging, workflow events and shared accessibility controls. Follow-up browser checks cover representative shared components and app layouts. Existing findings remain available in `AUDIT_REGISTER.md`; this report does not silently close that register.

Security review follows [OWASP ASVS](https://owasp.org/projects/asvs/). Accessibility review uses WCAG AA requirements; 44px controls are a Hudumika usability target, not a claim that WCAG 2.1 AA mandates that size.

## Baseline evidence

| Check | Observed result |
| --- | --- |
| UI inventory | 562 page files, 428 PageHeader references, 2,401 shared UI imports |
| Migration signals | 21,752 inline styles; 1,652 hardcoded colors; 1,344 native tooltips; 15 direct fetches; zero native selects |
| Style preflight | 327/562 clean; 728 non-palette colors, 646 raw radii, 27 gradients, three duplicate CTAs |
| Production build | Passed all workspaces; large bundle warnings remain |
| TypeScript baseline | API and web passed; trigger validation failed on `file.shared` payload |
| API baseline | 33 files: 31 passed, two failed; 405 tests: 399 passed, three failed, three skipped; one setup failure |
| Encoding | Passed |
| Production dependency audit | 43 advisory entries: four critical, 19 high, 19 moderate, one low; see dependency JSON |

Inventory counts are review signals. Charts, legal reports, PDF export templates and full-screen tools require semantic review before replacing styles. Shared imports alone do not prove design-system compliance.

## Implementation order and findings

| Priority | Finding | Implementation / acceptance criteria | Status |
| --- | --- | --- | --- |
| P0 | Retention policies lack tenant RLS; eight tables lack FORCE RLS | New migration 560, fail-closed policy, privileged read restricted to null-tenant defaults; rerun live isolation tests | Implemented; seven RLS regression checks pass |
| P1 | Spoofed `x-api-key` header changes global rate-limit bucket | Key global limiter by trusted request IP; retain authentication and capability scope checks | Implemented |
| P1 | Secret headers not explicitly redacted in request logging | Redact authorization, cookies, API keys, CSRF token and response session cookies | Implemented |
| P1 | Eight audit actor writes use nonexistent JWT `id` | Use verified JWT `sub` in SEAL and reference routes | Implemented |
| P1 | Production dependency vulnerabilities | Trace affected runtime paths, apply compatible updates, separately validate major migrations and unavailable fixes | Open |
| P2 | Shared filter clear control nests an interactive element inside a button | Independent native clear button with accessible name and keyboard focus | Implemented; Studio select/clear verified in browser |
| P2 | `file.shared` trigger rejects actual permission-change event shape | Preserve legacy shared payload and accept added/removed/changed permission lists | Implemented; trigger check passes |
| P2 | Finance document filing test cannot create purchase orders | Explicitly enable procurement in test tenant; preserve production capability gate | Implemented; three focused checks and full suite pass |
| P2 | Cross-app styles and navigation drift | Review inventory by shell, migrate actual defects through shared tokens/components; verify desktop and mobile | Open |
| P2 | Large production chunks | Inspect app boundaries and lazy loading; measure rather than indiscriminately splitting shared modules | Open |
| P2 | Privacy input validation and explicit tenant scoping | Validate audit pagination, dates, sensitivity and subject IDs; bound retention input; insert text arrays correctly | Implemented; three privacy regressions pass |

## Database execution

Migration 560 was applied transactionally and recorded in `_migrations`. Migration 559 was already pending when the audit started; it was deliberately not applied as part of an unrelated security repair. Deployment must follow the normal ordered migration procedure and validate SEAL entitlements separately.

## Documentation drift

The initial AGENTS.md said no automated tests exist, but the repository contained 33 API test files. It also described a localhost-only API base URL, while the frontend already supported environment/production routing. Both descriptions were corrected. The environment schema's restricted-role comment describes a dormant cutover although `db` now uses the app role. CLAUDE.md's claim that every tenant table forces RLS was disproved by the baseline tests; migration 560 addresses the observed gap. These discrepancies must not be treated as evidence of production readiness.

The initial title guidance required two typefaces and contradicted the live CSS. During this audit the user explicitly replaced that rule: all title words must use the font selected in the design system while keeping the accent colour. CLAUDE.md and DESIGN_SYSTEM.md now document the new rule. AGENTS.md now records the patched React Router v7 declarative-mode dependency.

Another session committed development API proxy changes while this audit was running. Those changes were preserved; this audit did not create a commit or restore unrelated work.

## Additional repairs implemented

- API usage recording runs inside `withTenant`, with failures logged rather than silently lost.
- Notifications and Email label cascades include explicit tenant predicates.
- SMS and GPS callbacks fail closed in production without provider secrets; Meta callbacks require a valid configured signature.
- Request logs omit query strings and redact credentials. Database-error responses and production exceptions avoid exposing SQL details or internal exception messages.
- SMTP validates the server certificate. The Onsite SSL diagnostic probe deliberately retains its inspection-only exception for invalid certificates.
- Certificate round-trip verification uses Node's native RSA verifier instead of node-forge's affected verification path. A genuine signed PDF and incorrect-password rejection are tested. This mitigation does **not** erase node-forge's package advisory.
- Scheduler jobs, AIS initialization and per-tenant marketplace template installation start only after the API successfully binds its port. Test app registration no longer installs templates for every existing tenant.
- Existing Fastify and its plugins, JWT support, Kysely, Nodemailer, React Router and CSV parser were upgraded together and compatibility checked. Bodyless test requests no longer incorrectly declare a JSON body.
- Eleven real Cloud, Email and FinOps events were added to Studio's registry. Dynamic CMS names are excluded from literal-name scanning. The validator now reports incomplete coverage honestly rather than printing an unconditional all-clear.
- Page titles use shared font, weight and responsive size tokens. Plain and accent text use the same selected font and normal style. Welcome and legal/support headings inherit the product font too.
- Tooltip-wrapped native icon buttons receive an accessible name before hover content is mounted. Existing explicit names remain intact.
- The workspace right rail has named app, assistant and settings controls and uses the primary foreground pair.
- Bliss has named icon controls, named selection checkboxes and a separate keyboard-operable conversation action. Email's message action no longer contains its star/select actions as nested button roles.

## Verification results

| Check | Result / limit |
| --- | --- |
| Full API suite after dependency upgrades | 35 files, 407 checks passed; no skipped checks |
| Additional privacy regression file | Three checks passed: bad filters, bad policy inputs, valid override isolated from another tenant |
| Previously failing integration files | Seven files, 144 checks passed after correcting bodyless request headers |
| Certificate round trip | Genuine generated certificate/PDF verification and wrong-password rejection passed |
| Tenant schema and live probe | Seven checks passed, including ENABLE/FORCE/policy coverage and bogus-tenant reads |
| Trigger registry | 92 registered, 92 emitted; payload, template and registry checks pass |
| Shared design-system contract | 13 checks passed, including the single-font coloured-title contract |
| Encoding / whitespace | Encoding and `git diff --check` pass |
| TypeScript | Final API and web `tsc --noEmit` checks pass |
| Production build | Full workspace build passed; final frontend rebuild passes without circular-chunk warnings. Large chunks remain (maximum approximately 938kB, compressed approximately 282kB) |
| Typography browser proof | Studio at 390px and 1280px: matching Atlassian Sans, 700 weight, normal style; accent retained; no document horizontal overflow |
| Production asset browser check | Public `/sign/verify` at 1280px and 390px loads without console errors; selected font is loaded, both title parts match, no horizontal overflow; mobile Verify control approximately 45px high |

The root typecheck's trigger subprocess required an unrestricted rerun because Windows sandbox account lookup failed with ENOMEM. Both compilers had completed successfully; the separately rerun trigger check passed. Raw request logs are excluded from version control; retained JSON files contain dependency/inventory/coverage evidence rather than customer records.

## App coverage and remaining UI work

All 562 page files were inventoried and shared components/configuration were reviewed. Browser observations are saved in `browser-observations-2026-10-07.json`; some early observations were taken before route content loaded and are explicitly partial.

| Apps / surfaces | Browser coverage in this pass | Next acceptance checks |
| --- | --- | --- |
| Studio | Loaded desktop and mobile; filters and clear; typography | Builder keyboard flows, workflow CRUD, all run states |
| SMS, eSign, Onsite, NexusHR | Loaded 390px root shell observations | Forms, permission failures, tables, empty/error/loading and footer reachability on every regular route |
| CRM | Loaded 390px overview; first earlier observation was partial | Lead/deal detail, funnel drilldowns, keyboard and permission flows |
| ComplyOS, Contacts, Store, Petti | Loaded 390px root observations | Wizards, detail screens, destructive-action confirmations and responsive data views |
| Ondi, HuduFreight, Admin/workspace, SEAL, Notes, CMS | Loaded desktop root observations | Mobile detail routes, form recovery and navigation consistency |
| Bliss | Loaded mobile inbox; identified and repaired accessibility defects | Thread composer, attachments, detail actions and screen-reader announcements |
| Email | Loaded mobile inbox; identified and repaired interactive-role nesting | Compose/reply/settings, mailbox actions, keyboard selection and pagination |
| Calendar, Tasks | Desktop full-screen roots | Full-screen footer exemption is expected; mobile and keyboard task/calendar flows still need review |
| Cloud, CargoTracker, FinOps, HuduBI, Projects | Partial asynchronous root observations | Repeat after loaded-data states before marking browser review complete |
| Lens, ClearOS, Developer, other admin screens | Source inventory / shared infrastructure; no complete browser walkthrough claimed | Complete route-by-route desktop/mobile review and role matrix |

Style inventory findings are **not closed** by the shared fixes. Inline chart coordinates, PDF/export templates, logos and intentional full-screen surfaces are not automatically migrated. Review ordinary-page deviations first, then migrate each confirmed defect to the existing UI primitive and verify its real interaction. No claim is made that every UI component or route is production ready.

## Release blockers and implementation sequence

1. **Dependency risk:** the final production audit contains 14 entries: two critical, three high, eight moderate and one low (43 at baseline). Critical entries remain in OpenTimestamps → deprecated request/form-data. The SDK's current published release still uses this chain. node-forge and its signing wrapper retain high advisories; native RSA verification mitigates the observed verifier path only. A verified maintained SDK/fork or protocol-compatible replacement must preserve real proofs and pass historical-proof, pending-confirmation, malformed-input and network-boundary checks. Do not force npm's suggested `opentimestamps@0.0.0` downgrade. An ineffective override was removed rather than represented as a fix.
2. **Complete UI migration:** use the inventory and coverage matrix above as a per-shell queue. For each regular route verify shared PageHeader/PageLayout, selected font, tokens, controls, semantic labels, touch targets, focus order, keyboard operation, form errors, 390/768/1280px overflow and reachable footer. Preserve documented full-screen and report-export exceptions.
3. **Backend review depth:** classifiers reported 12 suspect unscoped writes, 48 reads and 125 potential write-before-rejection transaction paths. Some are explicit platform/admin operations, transaction parameters or no-row updates. The confirmed Notification/Email/usage defects were repaired; the entire heuristic list has not been semantically closed. Record the auth gate and tenant context for each exception, then add focused negative regressions for actual exposure or partial-commit bugs.
4. **Build/runtime:** automatic shared-dependency grouping removed the manual vendor chunk cycles. The built public verification route was checked at desktop/mobile widths with no console errors. Still verify authenticated lazy module navigation in a deployed-equivalent environment. Retain large-chunk warnings as performance work, not suppressed thresholds. Set size budgets and measure route payloads before further splitting.
5. **Deployment:** apply migrations in order on staging; prove restricted DB roles, secret rotation, HTTPS/CORS/cookie topology, scan-required uploads, persistent storage, provider callback verification, recovery from backups and job singleton behavior. Local tests do not verify the deployed environment.
6. **Compliance evidence:** validate jurisdiction-specific retention schedules, legal holds, DSR deadlines/exports, consent and notification records, contracts/subprocessors and external assessments with qualified owners. No certification or legal determination was performed by this source-code audit.

## Completion requirements

Re-run focused regressions after each security fix, then the full typecheck and appropriate integration suite. Review dependency advisories against supported runtime versions. Verify shared controls at desktop and mobile widths and retain an app-by-app coverage matrix. Record unresolved deployment, credential, provider, legal and operational requirements explicitly; local builds cannot establish deployed compliance, disaster recovery or third-party security posture.
