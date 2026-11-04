# Source Feature Matrix — Hudumika Platform Integration

**Generated:** 2026-11-02
**Sources:** LexCore @ 4875f43, Ngao @ 3cebb9b, tuma-api @ 9025f305, tuma-web @ 1af95b0a

## Decision key

| Decision | Meaning |
|---|---|
| **RETAIN** | Hudumika already has this — use existing. No port needed. |
| **ADAPT** | Hudumika has a partial equivalent — extend it. |
| **PORT** | No equivalent — build new tables, routes, and UI from the source design. |
| **SHARE** | Feature serves multiple apps — build once in platform, wire to each app shell. |
| **REPLACE** | Source had this, but Hudumika's version is better — discard source's approach. |
| **DEFER** | Not in scope for initial integration — revisit after core vertical slices ship. |

---

## 1. LexCore / Ngao → Hudumika

### Auth & Identity

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| User model (email/password, MFA) | `User` table | `users` table + Ondi SSO | REPLACE | Hudumika has a mature auth system with TOTP MFA, OAuth2, session cookies, CSRF. |
| Organisation (tenant) | `Organisation` table | `tenants` table | REPLACE | Hudumika's tenant model is richer (RLS, design system, entitlements). |
| Sessions (JWT refresh) | `Session` table | `user_sessions` + httpOnly cookies | REPLACE | Hudumika migrated to httpOnly cookies. |
| Password reset | `PasswordResetToken` | Existing auth flow | REPLACE | Already built. |
| Email verification | `EmailVerification` | Existing email verification | REPLACE | Already built. |
| Org invites | `OrgInvite` | Existing team invitations | REPLACE | Already built. |
| System config | `SystemConfig` | `platform_settings` | REPLACE | Already built. |
| Roles (string-based) | User.role field | Hudumika RBAC | ADAPT | Map LexCore's EMPLOYEE/OWNER/ADMIN/VIEWER to Hudumika's existing role system. |

### Legal Domain (LexCore app)

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Fee earner profiles | `FeeEarnerProfile` | None | PORT | Lawyer billing profiles — charge rate, cost rate, practising certificate link. |
| Legal clients | `LegalClient` | CRM contacts (partial) | ADAPT | Extend contacts with legal-specific fields: BRELA, TIN, NIDA, AML status, risk score. Or add separate `legal_clients` table with FK to contacts. |
| Matters | `Matter` | None | PORT | Central legal entity — 7 types, 10-state lifecycle, fee arrangements, practice groups. |
| Court cases | `CourtCase` | None | PORT | Tanzania court hierarchy (Court of Appeal → Primary Court + Tribunals). |
| Court events | `CourtEvent` | None | PORT | 7 event types with scheduling, outcome recording, next-event chaining. |
| Deadlines | `Deadline` | None | PORT | Auto-computed limitation periods (Tanzania: contract 6yr, tort 3yr, etc.) with holiday adjustment. |
| Time entries | `TimeEntry` | None | PORT | Fee earner timesheet — 5-status lifecycle (DRAFT→INVOICED), offline capture. |
| Disbursements | `Disbursement` | None | PORT | 7 categories, VAT treatment, receipt upload, recoverable flag. |
| Legal invoices | `LegalInvoice` + `InvoiceLine` | FinOps invoices (partial) | ADAPT | Legal invoices have WHT (withholding tax), different line types (TIME/DISBURSEMENT/FIXED_FEE). Build as `legal_invoices` separate from `sales_invoices`. |
| Fiscal receipts | `FiscalReceipt` | Existing TRA VFD integration | RETAIN | Hudumika already has TRA VFD (fiscal.routes, fiscal worker). Wire legal invoices to existing integration. |
| Trust accounts | `TrustAccount` | None | PORT | Client trust/escrow bank accounts. **Must be segregated from business cash (legal requirement).** |
| Trust transactions | `TrustTransaction` | None | PORT | Hash-chained trust ledger (IN/OUT/OUT_TO_OFFICE). Maker-checker approval for payments. **Critical — hash chain is an integrity control.** |
| Matter documents | `MatterDocument` | Drive (partial) | ADAPT | Extend Drive with legal privilege marking, `wallId` (ethical wall), OCR text. Or add legal-specific document metadata table. |
| Conflict checks | `ConflictCheck` | None | PORT | Cross-client/matter conflict search with clearance workflow. |
| KYC records | `KycRecord` | None | PORT | AML/PEP/sanctions screening per client per matter. |
| Practising certificates | `PractiseCertificate` | None | PORT | Lawyer licence tracking with expiry alerts. |
| Matter state machine | `matterStateMachine.ts` | None | PORT | 10-state lifecycle with transition validation. |
| Deadline engine | `deadlineEngine.ts` | None | PORT | Tanzania limitation periods with holiday calendar. |
| Workflow engine | `workflowEngine.ts` | Studio workflows (partial) | ADAPT | Source has a simple maker-checker. Hudumika's Studio has a richer workflow engine — use it for trust payment approvals. |
| GL / Chart of accounts | `GlAccount`, `JournalEntry`, `JournalLine` | FinOps GL | RETAIN | Hudumika's GL is more mature. Wire legal invoices and trust movements to existing GL. |
| Partner capital | `PartnerCapital` | None | PORT | Law firm partner equity tracking (profit share, drawings, tax reserve). Niche but legally required. |

### Privacy Domain (Ngao app)

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Assessments | `Assessment` + `AssessmentResponse` | ComplyOS (partial) | ADAPT | ComplyOS has compliance assessments. Extend with PDPA-specific scoring (20-point max, maturity levels, action plans). |
| Processing activities (ROPA) | `ProcessingActivity` | `processing_activities` (mig 523) | RETAIN | Hudumika already has this table. Wire to Ngao UI. |
| Rights requests (DSR) | `RightsRequest` | None (table exists but limited) | ADAPT | 5 types (ACCESS/CORRECTION/ERASURE/OBJECTION/PORTABILITY), public portal, audit log, deadlines. |
| Incidents / breach mgmt | `Incident` | None | PORT | Breach lifecycle (DETECTED→CONTAINED→NOTIFIED→RESOLVED), PDPC notification tracking. |
| Compliance alerts | `ComplianceAlert` | None | PORT | 6 alert types with due dates, snooze, linked documents. |
| Training courses | `TrainingCourse` + `TrainingEnrolment` | None | PORT | Privacy training with progress tracking, certificates. Could become platform-wide training system. |
| Vendor management | `Vendor` | None (partially in CRM) | ADAPT | Data processor oversight — DPA status, risk level, review tracking. |
| Document templates | `Document` | e-Sign document library | ADAPT | PDPA document generation (Privacy Policy, DPA, etc.). Extend existing e-Sign document system. |
| Signatures | `Signature` | e-Sign signatures | RETAIN | Hudumika already has document signing. |
| Consent records | `consent_records` (mig 523) | Already exists | RETAIN | Already built. |
| PII field registry | `pii_field_registry` (mig 523) | Already exists | RETAIN | Already built. |

### Billing / Subscription

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Flutterwave integration | `lib/flutterwave/` | None (different gateways) | DEFER | Hudumika currently has no Flutterwave. Source billing will use Hudumika's existing subscription/packages system. |
| Tier pricing (150K/450K/1M TZS) | `billing/index.ts` | `packages` table | ADAPT | Map LexCore tiers to Hudumika package system. |
| Subscription management | `Subscription` table | `subscription_invoices`, plan changes | REPLACE | Hudumika's billing system is more mature. |

### Background Workers

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Email queue | BullMQ `email` | Existing email worker | RETAIN | Hudumika has email sending. |
| Fiscal queue | BullMQ `fiscal` | Existing fiscal worker | RETAIN | Hudumika has TRA VFD. |
| OCR queue | BullMQ `ocr` | None | DEFER | Document OCR — useful but not day-1 critical. |
| PDF queue | BullMQ `pdf` | Existing PDF generation (pdfkit) | RETAIN | Hudumika generates PDFs. |
| Reminder queue | BullMQ `reminder` | Existing reminder worker | ADAPT | Wire legal deadlines and compliance alerts to existing reminder system. |

---

## 2. Tuma → Hudumika

### Auth & Identity

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| User model (phone + password) | `User` table (int PK) | `users` table (UUID) | REPLACE | Hudumika auth is more mature. Phone-based login can be an auth method. |
| Admin model (separate table) | `Admin` table | `users` + roles | REPLACE | Hudumika uses a single users table with role-based access. |
| Company (tenant) | `Company` table | `tenants` table | REPLACE | Map Tuma companies to Hudumika tenants. |
| Token blacklisting | Redis-based | httpOnly cookies | REPLACE | Hudumika's session model doesn't need token blacklisting. |
| Permission system | `Permission` + `RolePermission` + `RolePermissionSet` | Hudumika RBAC | ADAPT | Tuma's granular permission catalog (26 permissions) maps well. Import the catalog. |

### Parcel / Logistics Domain (Tuma app)

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Parcels | `Parcel` (35+ fields) | None | PORT | Central entity — lifecycle, origin/destination, sender/recipient, vehicle link, OTP delivery. |
| Parcel types | `ParcelType` | None | PORT | Simple category system. |
| Parcel tracking | `ParcelTracking` | None | PORT | GPS/status event log per parcel. |
| Parcel handovers | `ParcelHandover` | None | PORT | Agent-to-agent transfer with accept/reject workflow. |
| OTP delivery | `OTP` | None | PORT | Delivery confirmation via one-time code. |
| Parcel counter | `ParcelCounter` | None | PORT | Sequential parcel number generation. |
| Parcel status lifecycle | Controller logic | None | PORT | 6-state machine: RECEIVED→DISPATCHED→OFFLOADED→DELIVERED/CANCELED/PICKED_UP. |
| Public tracking | GET `/track/:trackingNumber` | None | PORT | Public-facing parcel tracking page. |

### Geography / Locations

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Countries | `Country` | Existing country reference | RETAIN | Hudumika has country data. |
| Regions | `Region` (with lat/lon) | None (partial in HuduFreight) | ADAPT | Extend or reuse HuduFreight's location system. |
| Districts | `District` | None | PORT | Sub-region geography. |
| Booking offices | `BookingOffice` | None | PORT | Physical parcel drop-off/pick-up locations. |

### Fleet / Vehicles

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Vehicles | `Vehicle` (with LATRA sync) | HuduFreight `fleet_vehicles` | ADAPT | Hudumika has fleet management. Extend with LATRA fields, seat layout, special hire. |
| Vehicle catalog | `Brand`, `Model`, `FleetType`, `SeatLayout` | HuduFreight (partial) | ADAPT | Add Tuma-specific catalog tables or extend existing. |
| LATRA sync | Vehicle.latra* fields | None | DEFER | Tanzania regulatory sync — needs LATRA API access. Day-2. |

### Float / Money System

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Float accounts | `FloatInfo` | None | PORT | Prepaid agent balance system. Core to Tuma's business model. |
| Float settings | `FloatSettings` | None | PORT | Per-agent commission config (percentage or fixed, pool type). |
| Float transactions | `FloatTransaction` | None | PORT | Mobile money top-up with payment provider integration. |
| Float ledger | `FloatTransactionLog` | None | PORT | Immutable transaction log (9 types). Important for audit trail. |
| Payment providers | `PaymentProvider` | None | PORT | Payment gateway registry. |
| Commission calculation | Controller logic | None | PORT | FULL_AMOUNT vs COMMISSION_BASED with percentage/fixed amount. |
| Float pools | POOL_MAIN/POOL_LINKED | None | PORT | Shared float across agents under a super-agent. |

### Beneficiary / Deductions

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Beneficiaries | `beneficiary` | None | PORT | Automated recurring deductions from agent floats. |
| Beneficiary transactions | `BeneficiaryTransaction` | None | PORT | Deduction execution records with status tracking. |
| User-beneficiary assignment | `UserBeneficiary` | None | PORT | Many-to-many agent↔beneficiary. |
| Deduction scheduler | `cron/beneficiaryDeduction.js` | None | PORT | Scheduled job for automatic deductions. Use Hudumika's job infrastructure. |

### Invoicing

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Monthly platform invoices | `Invoice` | FinOps invoicing | ADAPT | Tuma's flat-rate per-parcel invoicing. Different billing model from FinOps. Build as a Tuma-specific invoice type or extend existing. |

### Reporting / Analytics

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Reports | `Report` | Existing reporting | ADAPT | Tuma's report types (daily/weekly/monthly/quarterly/yearly/custom) → extend existing. |
| Dashboard stats | `dashboard.controller.js` | Per-app dashboards | PORT | Tuma-specific KPIs and metrics. |
| Agent reports | `parcel.controller.js` | None | PORT | Per-agent performance analytics. |
| Commission reports | `commission.controller.js` | None | PORT | Platform commission tracking. |

### SMS

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| SMS notifications | SprintSMS integration | Hudumika SMS app (Africa's Talking/Twilio) | REPLACE | Use existing SMS infrastructure. |
| SMS log | `SmsLog` | Existing SMS log | RETAIN | Already built. |

### Mobile App Support

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| App version management | `AppVersion` | None | DEFER | Mobile app version forcing — only relevant when Tuma mobile app is ported. |
| Maintenance mode | `PlatformSetting` | Existing maintenance mode | RETAIN | Already built. |

### User Assignments / Scheduling

| Source Feature | Source Location | Hudumika Equivalent | Decision | Notes |
|---|---|---|---|---|
| Office assignments | `UserOffice` | None | PORT | Agent ↔ booking office assignment. |
| Region assignments | `UserRegion` | None | PORT | Agent ↔ region assignment. |
| Shift management | `Shift` + `UserShift` | NexusHR time recording (partial) | ADAPT | Tuma shifts are simpler than NexusHR's. Could reuse or build dedicated. |

---

## 3. New Hudumika App Registrations Required

| App ID | Source | Description | Industry |
|---|---|---|---|
| `tuma` | tuma-web + tuma-api | Parcel logistics platform | Logistics |
| `lexcore` | LexCore | Law firm ERP (matters, billing, trust, court diary) | Legal |
| `ngao` | Ngao (shared backend with LexCore) | PDPC privacy/data-protection compliance | Privacy/Compliance |
| `gereji` | New (from strategy doc) | Automotive workshop & garage management | Automotive |
| `retail` | New (from strategy doc) | Retail/POS management | Retail |

---

## 4. Migration Count Estimate

| Domain | New tables | Source |
|---|---|---|
| Legal (LexCore) | ~18 | fee_earner_profiles, legal_clients, matters, court_cases, court_events, deadlines, time_entries, disbursements, legal_invoices, invoice_lines, trust_accounts, trust_transactions, matter_documents, conflict_checks, kyc_records, practise_certificates, partner_capitals, tanzania_holidays |
| Privacy (Ngao) | ~5 | assessments, assessment_responses, incidents, compliance_alerts, training_courses, training_enrolments, vendors (some already exist: processing_activities, consent_records, pii_field_registry) |
| Parcel (Tuma) | ~15 | parcels, parcel_types, parcel_tracking, parcel_handovers, parcel_otps, parcel_counters, booking_offices, districts, float_accounts, float_settings, float_transactions, float_transaction_logs, payment_providers, beneficiaries, beneficiary_transactions, user_beneficiaries, user_offices, user_regions |
| Workflow support | ~2 | workflow_instances, workflow_steps (if not reusing Studio's) |
| **Total** | **~40** | All additive, no existing table modifications |
