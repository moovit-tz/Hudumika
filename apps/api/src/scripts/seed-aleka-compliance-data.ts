/**
 * Seed real Aleka Group compliance data into ComplyOS, sourced directly from
 * two documents the group shared: "Aleka Certification — Certificates &
 * Permits Tracker" (dated expiries for Aleka Holdings Ltd's industrial/ISO/
 * TMDA/OSHA/Fire/TIC/NEMC items) and "Aleka Group Compliance — 2025 Project
 * Tracker" (group-wide status tracker across 9 entities, mostly qualitative
 * status rather than exact dates).
 *
 * Two different data shapes from the source, handled honestly rather than
 * forcing one model:
 *  - Items with a real expiry date  → comply_certificates (with expiry_date,
 *    so the 90-day/30-day reminder job actually has something to fire on).
 *  - Items tracked only by status ("renewed" / "In progress" / "Not
 *    available", no date given) → comply_obligations, due_date left null.
 *    No fabricated dates — an obligation with an unknown due date is honest;
 *    a made-up one isn't.
 * Items the tracker itself marks "NA deprioritised" are skipped — the client
 * isn't pursuing those right now, so listing them as live obligations would
 * misrepresent their own current intent.
 *
 * Idempotent — safe to re-run (upserts by natural key: customer name,
 * cert_number, obligation_code).
 *
 * Usage: npx tsx src/scripts/seed-aleka-compliance-data.ts
 */
import { db, withTenant } from '../db/client.js';
import type { CustomerCategory } from '@hudumika/types';

const TENANT_ID = '15b7d313-5ab9-47d1-b9b3-eaa90cd90bdf'; // Moovit Mobility Limited — this session's active tenant

// ── Non-renewal risk text, by permit type ──────────────────────────────────
// General, honest descriptions of operational consequences — not citing
// specific unverified penalty amounts or statute sections.
const RISK: Record<string, string> = {
  BRELA_LICENCE: 'Operating without a valid Business Licence is unlawful in Tanzania. BRELA can also decline to process other filings (annual returns, amendments) for the entity until it is renewed.',
  BRELA_ANNUAL_RETURN: 'BRELA can strike the company off the register for persistent failure to file annual returns, and unfiled returns block other BRELA transactions for the entity.',
  INDUSTRIAL_LICENCE: 'Required to lawfully operate a manufacturing/industrial facility. A lapse can trigger a stop-work order and blocks the industrial inspections that other certifications (TMDA, OSHA) depend on.',
  ISO_QUALITY: 'Not government-mandated, but typically required by customers, distributors, and referenced by TMDA for medical-device products. An expired certificate can block sales to institutional buyers and stall TMDA product approvals that cite it.',
  TMDA_PERMIT: 'Required to lawfully manufacture and sell regulated medical devices in Tanzania. A lapse means the approved product(s) can no longer be lawfully sold, and TMDA can seize non-compliant stock or take enforcement action.',
  OSHA_CERT: 'Required under occupational safety law to operate premises with employees. A lapse exposes the company to OSHA inspection penalties and materially increases liability if a workplace incident occurs.',
  FIRE_CERT: 'Required for premises to legally operate. An expired Fire certificate can lead to a closure order from the Fire and Rescue Force and can void insurance coverage that assumes a valid certificate.',
  TIC_INCENTIVES: 'Grants tax/investment incentives (e.g. import duty relief). A lapse means the entity loses eligibility for those incentives going forward and would need to reapply.',
  NEMC: 'Environmental compliance clearance required for the facility. A lapse can halt operations pending a fresh Environmental Impact Assessment and exposes the company to NEMC enforcement.',
  TASAC_LICENCE: 'Required to lawfully operate as a clearing & forwarding agent. A lapse means the company cannot lawfully clear cargo through Tanzanian ports until it is renewed.',
  TAX_CLEARANCE: 'Commonly required for government tenders, banking relationships, and other BRELA/agency filings. A lapse can block tender participation and delay other regulatory processes that require proof of tax compliance.',
  VAT_CERT: 'Required once the entity meets the VAT registration threshold. Operating without one while required to have it exposes the company to TRA penalties and interest on unremitted VAT.',
  WCF: 'Required employer registration for worker compensation. A lapse leaves the company directly exposed to workplace injury claims that WCF would otherwise cover, plus WCF penalties.',
  GAMING_LICENCE: 'Required to lawfully operate gaming/betting activities. A lapse means the Gaming Board can treat continued operation as illegal gambling — fines, closure, and reinstatement typically needs a fresh application.',
  BOT_LICENCE: 'Required to lawfully operate a payment system or microfinance business. A lapse can trigger Bank of Tanzania enforcement action, suspension of operations, and puts banking-partner relationships at risk.',
  TCRA_LICENCE: 'Required to lawfully operate the licensed application/telecom service. A lapse risks TCRA enforcement action and service disruption.',
  PDPC: 'Required under the Personal Data Protection Act for entities processing personal data. A lapse exposes the company to PDPC enforcement for unregistered data processing.',
  PROPERTY_TITLE: 'Not a renewable licence, but unverified title exposes the company to ownership disputes and complicates using the property as loan collateral.',
};

type Cert = {
  cert_number: string; name: string; agency_code: string; agency_name: string; agency_class: string;
  issued_date: Date | null; expiry_date: Date; customer_name: string; non_renewal_risk: string; note?: string;
};
type Obligation = {
  obligation_code: string; agency_code: string; agency_class: string; name: string; frequency: string;
  mandatory: boolean; status: string; customer_name: string;
};

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// ── Dated items → certificates ─────────────────────────────────────────────
const CERTS: Cert[] = [
  // Aleka Holdings Ltd — from "Aleka Certification" tracker (all overdue as
  // of the tracker's own "Today 20-Jul-2026" reference point).
  { cert_number: 'ALEKA-IND-LIC', name: 'Industrial Licence', agency_code: 'MIT', agency_name: 'Ministry of Industry and Trade', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 1, 9), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.INDUSTRIAL_LICENCE },
  { cert_number: 'ALEKA-ISO-9001', name: 'ISO 9001:2015 — Quality Management Systems', agency_code: 'ISO', agency_name: 'ISO Certification Body', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 5, 13), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.ISO_QUALITY },
  { cert_number: 'ALEKA-EN-14683', name: 'EN 14683:2019 — Manufacturing of Surgical 3-Ply Face Masks', agency_code: 'ISO', agency_name: 'ISO Certification Body', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 6, 3), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.ISO_QUALITY },
  { cert_number: 'ALEKA-ISO-13485', name: 'ISO 13485:2016 — Manufacturing of Surgical 3-Ply Face Masks', agency_code: 'ISO', agency_name: 'ISO Certification Body', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 6, 8), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.ISO_QUALITY },
  { cert_number: 'ALEKA-TMDA-NOTIF', name: 'TMDA — Approval of Notification', agency_code: 'TMDA', agency_name: 'Tanzania Medicines & Medical Devices Authority', agency_class: 'reg', issued_date: null, expiry_date: d(2025, 2, 3), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.TMDA_PERMIT },
  { cert_number: 'ALEKA-TMDA-PERMIT', name: 'TMDA — Business Permit', agency_code: 'TMDA', agency_name: 'Tanzania Medicines & Medical Devices Authority', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 6, 30), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.TMDA_PERMIT },
  { cert_number: 'ALEKA-OSHA-CERT', name: 'OSHA — Compliance Certificate', agency_code: 'OSHA', agency_name: 'Occupational Safety & Health Authority', agency_class: 'social', issued_date: null, expiry_date: d(2023, 1, 9), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.OSHA_CERT },
  { cert_number: 'ALEKA-OSHA-FIRSTAID', name: 'OSHA — First Aid Training', agency_code: 'OSHA', agency_name: 'Occupational Safety & Health Authority', agency_class: 'social', issued_date: null, expiry_date: d(2023, 1, 24), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.OSHA_CERT },
  { cert_number: 'ALEKA-OSHA-EHS', name: 'OSHA — EHS Training', agency_code: 'OSHA', agency_name: 'Occupational Safety & Health Authority', agency_class: 'social', issued_date: null, expiry_date: d(2023, 1, 20), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.OSHA_CERT },
  { cert_number: 'ALEKA-FIRE-DEVICES', name: 'Fire — Devices Inspection', agency_code: 'FIRE', agency_name: 'Fire and Rescue Force', agency_class: 'reg', issued_date: null, expiry_date: d(2022, 11, 26), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.FIRE_CERT },
  { cert_number: 'ALEKA-TIC-INCENTIVES', name: 'TIC — Certificate of Incentives', agency_code: 'TIC', agency_name: 'Tanzania Investment Centre', agency_class: 'gov', issued_date: null, expiry_date: d(2024, 5, 6), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.TIC_INCENTIVES },
  { cert_number: 'ALEKA-NEMC-REPORT', name: 'NEMC — Environmental Report', agency_code: 'NEMC', agency_name: 'National Environment Management Council', agency_class: 'reg', issued_date: null, expiry_date: d(2023, 1, 18), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.NEMC },

  // Dated items from the group-wide tracker (all future-dated as of Nov 2025 comments).
  { cert_number: 'ALEKA-TASAC-CF', name: 'TASAC Clearing & Forwarding Licence', agency_code: 'TASAC', agency_name: 'Tanzania Shipping Agencies Corporation', agency_class: 'reg', issued_date: null, expiry_date: d(2026, 8, 16), customer_name: 'Aleka Holdings Ltd', non_renewal_risk: RISK.TASAC_LICENCE },
  { cert_number: 'TIM-BRELA-LIC', name: 'Business Licence (BRELA) — supply of food stuff and beverage', agency_code: 'BRELA', agency_name: 'Business Registration & Licensing Agency', agency_class: 'reg', issued_date: null, expiry_date: d(2026, 10, 20), customer_name: 'Tech in Motion Ltd', non_renewal_risk: RISK.BRELA_LICENCE },
  { cert_number: 'DHOW-BRELA-LIC', name: 'Business Licence (BRELA) — supply of food stuff and beverage', agency_code: 'BRELA', agency_name: 'Business Registration & Licensing Agency', agency_class: 'reg', issued_date: null, expiry_date: d(2026, 6, 9), customer_name: 'Dhow Jahazi Enterprises Ltd', non_renewal_risk: RISK.BRELA_LICENCE },
  { cert_number: 'DIGITZ-BOT-PAYSYS', name: 'BOT Payment System Licence', agency_code: 'BOT', agency_name: 'Bank of Tanzania', agency_class: 'fin', issued_date: null, expiry_date: d(2027, 6, 28), customer_name: 'Digicash Tanzania Ltd', non_renewal_risk: RISK.BOT_LICENCE },
  { cert_number: 'DIGITZ-TCRA-APPSVC', name: 'TCRA Application Service Licence', agency_code: 'TCRA', agency_name: 'Tanzania Communications Regulatory Authority', agency_class: 'reg', issued_date: null, expiry_date: d(2026, 11, 15), customer_name: 'Digicash Tanzania Ltd', non_renewal_risk: RISK.TCRA_LICENCE },
  // Source records this as "Expiry 31/12026" — ambiguous (day/month order
  // unclear, and a slash looks to have been dropped). Best-effort read as
  // 31 Dec 2026 (annual TCC pattern), flagged for verification rather than
  // silently trusted.
  { cert_number: 'DIGITZ-TCC', name: 'Tax Clearance Certificate (TRA)', agency_code: 'TRA', agency_name: 'Tanzania Revenue Authority', agency_class: 'tax', issued_date: null, expiry_date: d(2026, 12, 31), customer_name: 'Digicash Tanzania Ltd', non_renewal_risk: RISK.TAX_CLEARANCE, note: 'Source tracker recorded this expiry as "31/12026" — ambiguous formatting. Read here as 31 Dec 2026; please verify against the actual TRA certificate.' },
];

// ── Undated status items → obligations (no fabricated due_date) ───────────
const OBLIGATIONS: Obligation[] = [
  // Aleka Holdings Ltd
  { obligation_code: 'OB-ALEKA-AH-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA) — trading licence', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-TMDA-PREM', agency_code: 'TMDA', agency_class: 'reg', name: 'TMDA Manufacturing & Premises Certificates', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-TRA-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate (TRA)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-VAT', agency_code: 'TRA', agency_class: 'tax', name: 'VAT Certificate', frequency: 'Once', mandatory: false, status: 'not-started', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-WCF', agency_code: 'WCF', agency_class: 'social', name: 'WCF Registration', frequency: 'Once', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-FIRE-PERMIT', agency_code: 'FIRE', agency_class: 'reg', name: 'Fire Safety Certificate (Premises Permit)', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-EIA', agency_code: 'NEMC', agency_class: 'reg', name: 'EIA Certificate', frequency: 'Once', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },
  { obligation_code: 'OB-ALEKA-AH-TAX-FILINGS', agency_code: 'TRA', agency_class: 'tax', name: 'Annual / Quarterly Tax Filings', frequency: 'Semi-annual', mandatory: true, status: 'active', customer_name: 'Aleka Holdings Ltd' },

  // Nanovas Tanzania Ltd
  { obligation_code: 'OB-ALEKA-NV-GAMING-LIC', agency_code: 'GAMING', agency_class: 'reg', name: 'Gaming Licence (GBT)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Nanovas Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-NV-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA)', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Nanovas Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-NV-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Nanovas Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-NV-GAMING-RETURNS', agency_code: 'GAMING', agency_class: 'reg', name: 'Monthly Gaming Returns Report & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Nanovas Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-NV-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Nanovas Tanzania Ltd' },

  // Tech in Motion Ltd (Business Licence handled as a dated certificate above)
  { obligation_code: 'OB-ALEKA-TIM-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Tech in Motion Ltd' },
  { obligation_code: 'OB-ALEKA-TIM-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Tech in Motion Ltd' },
  { obligation_code: 'OB-ALEKA-TIM-TAX-FILINGS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly / Quarterly Tax Filings', frequency: 'Monthly', mandatory: true, status: 'not-started', customer_name: 'Tech in Motion Ltd' },
  { obligation_code: 'OB-ALEKA-TIM-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Tech in Motion Ltd' },

  // Binary Odds (T) Ltd
  { obligation_code: 'OB-ALEKA-BO-GAMING-LIC', agency_code: 'GAMING', agency_class: 'reg', name: 'Gaming Licence (GBT)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Binary Odds (T) Ltd' },
  { obligation_code: 'OB-ALEKA-BO-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Binary Odds (T) Ltd' },
  { obligation_code: 'OB-ALEKA-BO-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate (dormant entity — not currently sought)', frequency: 'Annual', mandatory: false, status: 'not-started', customer_name: 'Binary Odds (T) Ltd' },
  { obligation_code: 'OB-ALEKA-BO-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Binary Odds (T) Ltd' },

  // Dhow Jahazi Enterprises Ltd (Business Licence handled as a dated certificate above)
  { obligation_code: 'OB-ALEKA-DJ-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Dhow Jahazi Enterprises Ltd' },
  { obligation_code: 'OB-ALEKA-DJ-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Dhow Jahazi Enterprises Ltd' },
  { obligation_code: 'OB-ALEKA-DJ-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Dhow Jahazi Enterprises Ltd' },

  // Aleka Properties Ltd
  { obligation_code: 'OB-ALEKA-AP-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Aleka Properties Ltd' },
  { obligation_code: 'OB-ALEKA-AP-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Aleka Properties Ltd' },
  { obligation_code: 'OB-ALEKA-AP-TITLE', agency_code: 'LANDS', agency_class: 'gov', name: 'Property Ownership / Title Deeds Verification', frequency: 'Once', mandatory: true, status: 'not-started', customer_name: 'Aleka Properties Ltd' },
  { obligation_code: 'OB-ALEKA-AP-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Aleka Properties Ltd' },
  { obligation_code: 'OB-ALEKA-AP-RENT-TAX', agency_code: 'TRA', agency_class: 'tax', name: 'Property Rent & Tax Filings', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Aleka Properties Ltd' },
  { obligation_code: 'OB-ALEKA-AP-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Aleka Properties Ltd' },

  // Digicash Tanzania Ltd (BOT/TCRA/TCC handled as dated certificates above)
  { obligation_code: 'OB-ALEKA-DT-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA) — renewal + BRELA reconciliation', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Digicash Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-DT-BOT-FINANCIALS', agency_code: 'BOT', agency_class: 'fin', name: 'BOT Audited Financials Submission', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Digicash Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-DT-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Digicash Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-DT-PDPC', agency_code: 'PDPC', agency_class: 'reg', name: 'PDPC Data Protection Registration', frequency: 'Once', mandatory: true, status: 'active', customer_name: 'Digicash Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-DT-BOT-TCRA-REPORTS', agency_code: 'BOT', agency_class: 'fin', name: 'Monthly / Quarterly BOT & TCRA Reports', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Digicash Tanzania Ltd' },
  { obligation_code: 'OB-ALEKA-DT-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Digicash Tanzania Ltd' },

  // Digicash Financial Services Ltd
  { obligation_code: 'OB-ALEKA-DFS-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA)', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-BOT-MICROFIN', agency_code: 'BOT', agency_class: 'fin', name: 'BOT Microfinance Licence', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-BOT-FINANCIALS', agency_code: 'BOT', agency_class: 'fin', name: 'BOT Audited Financials Submission', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-BOT-QUARTERLY', agency_code: 'BOT', agency_class: 'fin', name: 'BOT Quarterly Report Submissions', frequency: 'Semi-annual', mandatory: true, status: 'pending', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-CRB-REPORTS', agency_code: 'CRB', agency_class: 'fin', name: 'Monthly CRB Reports', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-AMLKYC', agency_code: 'BOT', agency_class: 'fin', name: 'AML / KYC Filings', frequency: 'Semi-annual', mandatory: true, status: 'not-started', customer_name: 'Digicash Financial Services Ltd' },
  { obligation_code: 'OB-ALEKA-DFS-PDPC', agency_code: 'PDPC', agency_class: 'reg', name: 'PDPC Registration', frequency: 'Once', mandatory: true, status: 'active', customer_name: 'Digicash Financial Services Ltd' },

  // Coastal Steel Ltd
  { obligation_code: 'OB-ALEKA-CS-BRELA-LIC', agency_code: 'BRELA', agency_class: 'reg', name: 'Business Licence (BRELA)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-TCC', agency_code: 'TRA', agency_class: 'tax', name: 'Tax Clearance Certificate (TRA)', frequency: 'Annual', mandatory: true, status: 'pending', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-OSHA', agency_code: 'OSHA', agency_class: 'social', name: 'OSHA Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-WCF', agency_code: 'WCF', agency_class: 'social', name: 'WCF Registration', frequency: 'Once', mandatory: true, status: 'not-started', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-FIRE', agency_code: 'FIRE', agency_class: 'reg', name: 'Fire Safety Certificate', frequency: 'Annual', mandatory: true, status: 'not-started', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-TRA-RETURNS', agency_code: 'TRA', agency_class: 'tax', name: 'Monthly, Quarterly & Yearly TRA Returns Filing & Payments', frequency: 'Monthly', mandatory: true, status: 'active', customer_name: 'Coastal Steel Ltd' },
  { obligation_code: 'OB-ALEKA-CS-BRELA-RETURNS', agency_code: 'BRELA', agency_class: 'reg', name: 'BRELA Annual Returns', frequency: 'Annual', mandatory: true, status: 'active', customer_name: 'Coastal Steel Ltd' },
];

const CUSTOMERS: { name: string; category: CustomerCategory; avatar_color: string }[] = [
  { name: 'Aleka Holdings Ltd', category: 'enterprise', avatar_color: '#0e1f3d' },
  { name: 'Nanovas Tanzania Ltd', category: 'enterprise', avatar_color: '#5b3ea8' },
  { name: 'Tech in Motion Ltd', category: 'enterprise', avatar_color: '#0b7264' },
  { name: 'Binary Odds (T) Ltd', category: 'enterprise', avatar_color: '#b57d0a' },
  { name: 'Dhow Jahazi Enterprises Ltd', category: 'sme', avatar_color: '#0b7264' },
  { name: 'Aleka Properties Ltd', category: 'enterprise', avatar_color: '#0e1f3d' },
  { name: 'Digicash Tanzania Ltd', category: 'enterprise', avatar_color: '#1d4ed8' },
  { name: 'Digicash Financial Services Ltd', category: 'enterprise', avatar_color: '#1d4ed8' },
  { name: 'Coastal Steel Ltd', category: 'enterprise', avatar_color: '#b57d0a' },
];

function initials(name: string): string {
  return name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

async function main() {
  console.log('🌱 Seeding real Aleka Group compliance data for tenant', TENANT_ID);

  await withTenant(TENANT_ID, async (trx) => {
    // ── Customers (the 9 Aleka Group entities) ──────────────────────────────
    const customerIds = new Map<string, string>();
    for (const c of CUSTOMERS) {
      const existing = await trx.selectFrom('customers').select('id').where('tenant_id', '=', TENANT_ID).where('name', '=', c.name).executeTakeFirst();
      if (existing) { customerIds.set(c.name, existing.id); continue; }
      const row = await trx.insertInto('customers').values({
        tenant_id: TENANT_ID, name: c.name, category: c.category,
        avatar_color: c.avatar_color, avatar_initials: initials(c.name),
      }).returning('id').executeTakeFirstOrThrow();
      customerIds.set(c.name, row.id);
    }
    console.log(`  ✓ ${CUSTOMERS.length} Aleka Group entities checked/inserted as CRM customers`);

    // ── Certificates (real dated expiries) ──────────────────────────────────
    let certsInserted = 0;
    for (const c of CERTS) {
      const existing = await trx.selectFrom('comply_certificates').select('id').where('tenant_id', '=', TENANT_ID).where('cert_number', '=', c.cert_number).executeTakeFirst();
      if (existing) continue;
      const customerId = customerIds.get(c.customer_name) ?? null;
      await trx.insertInto('comply_certificates').values({
        tenant_id: TENANT_ID, cert_number: c.cert_number, name: c.name, agency_code: c.agency_code,
        agency_name: c.agency_name, agency_class: c.agency_class, issued_date: c.issued_date, expiry_date: c.expiry_date,
        customer_id: customerId, non_renewal_risk: c.non_renewal_risk,
        metadata: { source: 'aleka-group-compliance-tracker', ...(c.note ? { verify_note: c.note } : {}) },
      }).execute();
      certsInserted++;
    }
    console.log(`  ✓ ${certsInserted}/${CERTS.length} Aleka Group certificates inserted (${CERTS.length - certsInserted} already existed)`);

    // ── Obligations (status-tracked, no fabricated dates) ───────────────────
    let obligationsInserted = 0;
    for (const o of OBLIGATIONS) {
      const existing = await trx.selectFrom('comply_obligations').select('id').where('tenant_id', '=', TENANT_ID).where('obligation_code', '=', o.obligation_code).executeTakeFirst();
      if (existing) continue;
      const customerId = customerIds.get(o.customer_name) ?? null;
      await trx.insertInto('comply_obligations').values({
        tenant_id: TENANT_ID, obligation_code: o.obligation_code, agency_code: o.agency_code, agency_class: o.agency_class,
        name: o.name, frequency: o.frequency, mandatory: o.mandatory, status: o.status, due_date: null,
        customer_id: customerId,
      }).execute();
      obligationsInserted++;
    }
    console.log(`  ✓ ${obligationsInserted}/${OBLIGATIONS.length} Aleka Group obligations inserted (${OBLIGATIONS.length - obligationsInserted} already existed)`);
  });

  console.log('✅ Aleka Group compliance data seed complete.');
  process.exit(0);
}

main().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
