'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ShieldLogo } from '@/components/OneUI';
import {
  ArrowRight, FileText, CheckCircle, AlertTriangle,
  ClipboardCheck, ChevronRight, ArrowLeft, RefreshCw,
  Mail, Check, ChevronDown, Star, Shield,
  Database, UserCheck, Bell, Trash2, FileSignature, Globe,
  Users, Lock, AlertCircle, Scale
} from 'lucide-react';

/* ─── ACCENT ──────────────────────────────────────────────────────── */
const ACC = '#0A7C5C';
const ACC_LIGHT = '#E8F5F0';
const ACC_DARK = '#042d1f';

/* ─── TYPES ───────────────────────────────────────────────────────── */
interface Answers {
  // 1. Profile
  orgSize: string;
  sector: string;
  dataVolume: string;
  // 2. Data Collection & Consent
  legalBasis: string;
  consentMechanism: string;
  consentRecords: string;
  consentWithdrawal: string;
  privacyNotice: string;
  // 3. Data Subject Rights
  sarProcess: string;
  erasureProcess: string;
  correctionProcess: string;
  portability: string;
  // 4. Data Breach Management
  breachProcedure: string;
  breachResponsible: string;
  breachNotification: string;
  breachRegister: string;
  // 5. Third-Party Processing
  dpaAgreements: string;
  processorDueDiligence: string;
  crossBorderSafeguards: string;
  processorAudits: string;
  // 6. Retention & Governance
  retentionSchedules: string;
  secureDeletion: string;
  dpiaProcess: string;
  dpoAppointed: string;
}

const INIT: Answers = {
  orgSize: '', sector: '', dataVolume: '',
  legalBasis: '', consentMechanism: '', consentRecords: '', consentWithdrawal: '', privacyNotice: '',
  sarProcess: '', erasureProcess: '', correctionProcess: '', portability: '',
  breachProcedure: '', breachResponsible: '', breachNotification: '', breachRegister: '',
  dpaAgreements: '', processorDueDiligence: '', crossBorderSafeguards: '', processorAudits: '',
  retentionSchedules: '', secureDeletion: '', dpiaProcess: '', dpoAppointed: '',
};

interface Question {
  id: keyof Answers;
  section: string;
  sectionNum: number;
  label: string;
  hint?: string;
  options: { val: string; label: string; desc?: string }[];
}

/* ─── QUESTIONS ───────────────────────────────────────────────────── */
const QUESTIONS: Question[] = [
  // ── Section 1: Organizational Profile ──────────────────────────
  {
    id: 'orgSize',
    section: 'Organizational Profile',
    sectionNum: 1,
    label: 'What is your organization\'s total employee count?',
    options: [
      { val: '1–10', label: '1–10 employees', desc: 'Micro-enterprise or early-stage startup' },
      { val: '11–50', label: '11–50 employees', desc: 'Growing SME or professional services firm' },
      { val: '51–200', label: '51–200 employees', desc: 'Established regional enterprise' },
      { val: '200+', label: '200+ employees', desc: 'Large-scale corporate or institutional body' },
    ],
  },
  {
    id: 'sector',
    section: 'Organizational Profile',
    sectionNum: 1,
    label: 'Which primary sector does your organization operate in?',
    options: [
      { val: 'Fintech', label: 'Fintech & Financial Services' },
      { val: 'Healthcare', label: 'Healthcare & Medical Records' },
      { val: 'Retail', label: 'Retail & E-Commerce' },
      { val: 'SaaS', label: 'SaaS & Technology Platforms' },
      { val: 'Education', label: 'Education & Student Portals' },
      { val: 'Government', label: 'Government & Public Services' },
    ],
  },
  {
    id: 'dataVolume',
    section: 'Organizational Profile',
    sectionNum: 1,
    label: 'Approximately how many individuals\' personal data does your organization process?',
    options: [
      { val: '<1,000', label: 'Fewer than 1,000 individuals', desc: 'Limited internal or client data' },
      { val: '1k–10k', label: '1,000 to 10,000 individuals', desc: 'Small customer or membership base' },
      { val: '10k–100k', label: '10,000 to 100,000 individuals', desc: 'Mid-size customer database' },
      { val: '100k+', label: 'More than 100,000 individuals', desc: 'Large-scale data processing operations' },
    ],
  },

  // ── Section 2: Data Collection & Consent ───────────────────────
  {
    id: 'legalBasis',
    section: 'Data Collection & Consent',
    sectionNum: 2,
    label: 'Do you have a documented legal basis for every category of personal data your organization collects and processes?',
    hint: 'Legal bases include: consent, contract, legal obligation, vital interests, public task, or legitimate interests.',
    options: [
      { val: 'Yes — all categories documented', label: 'Yes, all categories are documented', desc: 'A data inventory maps every processing activity to a legal basis' },
      { val: 'Partial — some categories documented', label: 'Partially — some categories only', desc: 'Core activities covered but gaps exist for secondary processing' },
      { val: 'No — not formally documented', label: 'No, not formally documented', desc: 'Processing decisions are informal or undocumented' },
    ],
  },
  {
    id: 'consentMechanism',
    section: 'Data Collection & Consent',
    sectionNum: 2,
    label: 'How does your organization obtain consent from individuals before collecting their personal data?',
    options: [
      { val: 'No formal consent', label: 'No formal consent process', desc: 'Data collection happens without explicit consent' },
      { val: 'Implied consent', label: 'Implied or passive consent', desc: 'Opt-out mechanisms only, or buried checkbox defaults' },
      { val: 'Active opt-in', label: 'Active opt-in checkbox or form', desc: 'Individuals must explicitly tick or sign' },
      { val: 'Granular + auditable', label: 'Granular, auditable consent per purpose', desc: 'Purpose-specific consent with timestamped audit trail' },
    ],
  },
  {
    id: 'consentRecords',
    section: 'Data Collection & Consent',
    sectionNum: 2,
    label: 'Do you maintain timestamped records of consent granted by each individual, including the version of the privacy notice shown?',
    options: [
      { val: 'Yes', label: 'Yes, timestamped consent records are maintained', desc: 'With version history and audit trail' },
      { val: 'No', label: 'No, consent is not formally recorded', desc: 'No verifiable proof of consent exists' },
    ],
  },
  {
    id: 'consentWithdrawal',
    section: 'Data Collection & Consent',
    sectionNum: 2,
    label: 'Can individuals easily withdraw their consent, and is the withdrawal processed without undue delay?',
    options: [
      { val: 'Yes', label: 'Yes, withdrawal is simple and processed promptly' },
      { val: 'Partial', label: 'Partially — withdrawal is possible but cumbersome' },
      { val: 'No', label: 'No, there is no clear withdrawal mechanism' },
    ],
  },
  {
    id: 'privacyNotice',
    section: 'Data Collection & Consent',
    sectionNum: 2,
    label: 'Is a clear, plain-language privacy notice accessible to all data subjects at the point of collection?',
    options: [
      { val: 'Yes', label: 'Yes, always visible at every collection point' },
      { val: 'Partial', label: 'Partially — available but not always prominent' },
      { val: 'No', label: 'No, no privacy notice is currently published' },
    ],
  },

  // ── Section 3: Data Subject Rights ─────────────────────────────
  {
    id: 'sarProcess',
    section: 'Data Subject Rights',
    sectionNum: 3,
    label: 'Do you have a formal, documented process for receiving and responding to Subject Access Requests (SARs) within the mandated 30-day window?',
    options: [
      { val: 'Yes', label: 'Yes, a formal SAR workflow is in place', desc: 'With assigned ownership and tracking' },
      { val: 'Informal', label: 'Handled informally on a case-by-case basis', desc: 'No documented process or SLA' },
      { val: 'No', label: 'No, we have no SAR response process' },
    ],
  },
  {
    id: 'erasureProcess',
    section: 'Data Subject Rights',
    sectionNum: 3,
    label: 'Can you fulfill an individual\'s right to erasure (right to be forgotten) across all systems within mandated timelines?',
    options: [
      { val: 'Yes', label: 'Yes, deletion is possible across all systems', desc: 'Including backups and third-party processors' },
      { val: 'Partial', label: 'Partially — primary systems only', desc: 'Backups or processors may retain data' },
      { val: 'No', label: 'No, we cannot reliably fulfill erasure requests' },
    ],
  },
  {
    id: 'correctionProcess',
    section: 'Data Subject Rights',
    sectionNum: 3,
    label: 'Do you allow individuals to request correction of inaccurate personal data, and is this actioned promptly?',
    options: [
      { val: 'Yes', label: 'Yes, correction requests are accepted and processed' },
      { val: 'Informal', label: 'Informally — handled ad-hoc without a defined process' },
      { val: 'No', label: 'No, there is no correction request mechanism' },
    ],
  },
  {
    id: 'portability',
    section: 'Data Subject Rights',
    sectionNum: 3,
    label: 'Can you provide individuals with a copy of their personal data in a structured, machine-readable format upon request (data portability)?',
    options: [
      { val: 'Yes', label: 'Yes, data exports are available in machine-readable format', desc: 'e.g. JSON, CSV, XML on request' },
      { val: 'Partial', label: 'Partially — manual exports only, not always structured' },
      { val: 'No', label: 'No, data portability is not currently supported' },
    ],
  },

  // ── Section 4: Data Breach Management ──────────────────────────
  {
    id: 'breachProcedure',
    section: 'Data Breach Management',
    sectionNum: 4,
    label: 'Does your organization have a documented data breach detection, containment, and response procedure?',
    options: [
      { val: 'Yes', label: 'Yes, a fully documented procedure exists', desc: 'Tested and reviewed at least annually' },
      { val: 'Partial', label: 'Partially — some steps documented but incomplete' },
      { val: 'No', label: 'No, there is no formal breach response procedure' },
    ],
  },
  {
    id: 'breachResponsible',
    section: 'Data Breach Management',
    sectionNum: 4,
    label: 'Is there a designated person or team formally responsible for breach detection, assessment, and regulatory notification?',
    options: [
      { val: 'Yes', label: 'Yes, a named DPO or breach response owner is designated' },
      { val: 'Informal', label: 'Informally — IT or management handles it ad-hoc' },
      { val: 'No', label: 'No, no formal ownership has been assigned' },
    ],
  },
  {
    id: 'breachNotification',
    section: 'Data Breach Management',
    sectionNum: 4,
    label: 'Can your organization notify the relevant regulatory authority within 72 hours of becoming aware of a personal data breach?',
    hint: 'The PDPA requires notification to the Personal Data Protection Commission within 72 hours for breaches likely to result in risk to individuals.',
    options: [
      { val: 'Yes', label: 'Yes, our process can meet the 72-hour window' },
      { val: 'Uncertain', label: 'Uncertain — we have not tested our notification speed' },
      { val: 'No', label: 'No, our process would likely exceed 72 hours' },
    ],
  },
  {
    id: 'breachRegister',
    section: 'Data Breach Management',
    sectionNum: 4,
    label: 'Do you maintain a breach register that logs all personal data incidents, including minor ones that did not require regulatory notification?',
    options: [
      { val: 'Yes', label: 'Yes, all incidents are logged in a breach register' },
      { val: 'Partial', label: 'Only major or notifiable breaches are recorded' },
      { val: 'No', label: 'No, incidents are not systematically recorded' },
    ],
  },

  // ── Section 5: Third-Party Processing ──────────────────────────
  {
    id: 'dpaAgreements',
    section: 'Third-Party Processing',
    sectionNum: 5,
    label: 'Do all third-party vendors and service providers who handle personal data on your behalf have signed Data Processing Agreements (DPAs)?',
    options: [
      { val: 'Yes', label: 'Yes, all processors have signed DPAs', desc: 'With PDPA-compliant clauses' },
      { val: 'Partial', label: 'Partially — major processors only', desc: 'Some vendors lack formal DPAs' },
      { val: 'No', label: 'No, DPAs are not in place with processors' },
    ],
  },
  {
    id: 'processorDueDiligence',
    section: 'Third-Party Processing',
    sectionNum: 5,
    label: 'Do you conduct due diligence on the data security practices and compliance posture of third-party processors before engaging them?',
    options: [
      { val: 'Yes', label: 'Yes, formal due diligence is conducted before engagement', desc: 'Security questionnaires, certifications checked' },
      { val: 'Partial', label: 'Partially — for high-risk processors only' },
      { val: 'No', label: 'No, due diligence is not formally conducted' },
    ],
  },
  {
    id: 'crossBorderSafeguards',
    section: 'Third-Party Processing',
    sectionNum: 5,
    label: 'If personal data is transferred outside East Africa, do you have documented safeguards in place (e.g. adequacy decisions, Standard Contractual Clauses)?',
    options: [
      { val: 'No transfers', label: 'We do not transfer personal data outside East Africa' },
      { val: 'Yes — safeguards in place', label: 'Yes, transfers occur with documented safeguards', desc: 'SCCs, BCRs, or adequacy decisions' },
      { val: 'Transfers without safeguards', label: 'Transfers occur without formal safeguards', desc: 'High risk — regulatory non-compliance' },
    ],
  },
  {
    id: 'processorAudits',
    section: 'Third-Party Processing',
    sectionNum: 5,
    label: 'Do you conduct regular audits or formal reviews of your processors\' ongoing compliance with data protection requirements?',
    options: [
      { val: 'Yes', label: 'Yes, annual or periodic audits are conducted' },
      { val: 'Partial', label: 'Informally reviewed, but not on a defined schedule' },
      { val: 'No', label: 'No, processor compliance is not regularly reviewed' },
    ],
  },

  // ── Section 6: Retention & Governance ──────────────────────────
  {
    id: 'retentionSchedules',
    section: 'Retention & Governance',
    sectionNum: 6,
    label: 'Do you have documented retention schedules specifying how long each category of personal data is kept and the basis for that period?',
    options: [
      { val: 'Yes', label: 'Yes, documented schedules exist for all data categories' },
      { val: 'Partial', label: 'Partially — some categories have defined periods' },
      { val: 'No', label: 'No, data is retained indefinitely with no formal schedule' },
    ],
  },
  {
    id: 'secureDeletion',
    section: 'Retention & Governance',
    sectionNum: 6,
    label: 'Is there a verified process for securely deleting or anonymizing personal data once its retention period has expired?',
    options: [
      { val: 'Yes — automated', label: 'Yes, automated secure deletion is in place', desc: 'System triggers delete or anonymize on schedule' },
      { val: 'Yes — manual', label: 'Yes, manual deletion process exists', desc: 'Periodic manual purge conducted by a responsible person' },
      { val: 'No', label: 'No, expired data is not systematically deleted' },
    ],
  },
  {
    id: 'dpiaProcess',
    section: 'Retention & Governance',
    sectionNum: 6,
    label: 'Does your organization conduct Data Protection Impact Assessments (DPIAs) before starting high-risk personal data processing activities?',
    hint: 'High-risk activities include large-scale profiling, processing sensitive data, or systematic public monitoring.',
    options: [
      { val: 'Yes', label: 'Yes, DPIAs are conducted for high-risk activities', desc: 'Before new processing starts' },
      { val: 'Partial', label: 'Conducted for some activities but not consistently' },
      { val: 'No', label: 'No, DPIAs are not currently conducted' },
    ],
  },
  {
    id: 'dpoAppointed',
    section: 'Retention & Governance',
    sectionNum: 6,
    label: 'Has your organization appointed a Data Protection Officer (DPO) or an equivalent responsible person for overseeing PDPA compliance?',
    options: [
      { val: 'Yes — dedicated DPO', label: 'Yes, a dedicated DPO has been appointed', desc: 'With independence and a defined mandate' },
      { val: 'Yes — dual role', label: 'Yes, a staff member holds DPO responsibilities alongside other duties' },
      { val: 'No', label: 'No DPO or equivalent has been appointed' },
    ],
  },
];

/* ─── SECTIONS ────────────────────────────────────────────────────── */
const SECTIONS = [
  { num: 1, label: 'Organizational Profile', count: 3 },
  { num: 2, label: 'Data Collection & Consent', count: 5 },
  { num: 3, label: 'Data Subject Rights', count: 4 },
  { num: 4, label: 'Data Breach Management', count: 4 },
  { num: 5, label: 'Third-Party Processing', count: 4 },
  { num: 6, label: 'Retention & Governance', count: 4 },
];

/* ─── SCORING ─────────────────────────────────────────────────────── */
function calcScore(a: Answers) {
  // Section 2: Data Collection & Consent (max 40)
  let consent = 0;
  if (a.legalBasis === 'Yes — all categories documented') consent += 10;
  else if (a.legalBasis === 'Partial — some categories documented') consent += 5;
  if (a.consentMechanism === 'Granular + auditable') consent += 10;
  else if (a.consentMechanism === 'Active opt-in') consent += 7;
  else if (a.consentMechanism === 'Implied consent') consent += 3;
  if (a.consentRecords === 'Yes') consent += 10;
  if (a.consentWithdrawal === 'Yes') consent += 5;
  else if (a.consentWithdrawal === 'Partial') consent += 2;
  if (a.privacyNotice === 'Yes') consent += 5;
  else if (a.privacyNotice === 'Partial') consent += 2;

  // Section 3: Data Subject Rights (max 30)
  let rights = 0;
  if (a.sarProcess === 'Yes') rights += 10;
  else if (a.sarProcess === 'Informal') rights += 4;
  if (a.erasureProcess === 'Yes') rights += 10;
  else if (a.erasureProcess === 'Partial') rights += 4;
  if (a.correctionProcess === 'Yes') rights += 5;
  else if (a.correctionProcess === 'Informal') rights += 2;
  if (a.portability === 'Yes') rights += 5;
  else if (a.portability === 'Partial') rights += 2;

  // Section 4: Data Breach Management (max 35)
  let breach = 0;
  if (a.breachProcedure === 'Yes') breach += 10;
  else if (a.breachProcedure === 'Partial') breach += 4;
  if (a.breachResponsible === 'Yes') breach += 10;
  else if (a.breachResponsible === 'Informal') breach += 3;
  if (a.breachNotification === 'Yes') breach += 10;
  else if (a.breachNotification === 'Uncertain') breach += 3;
  if (a.breachRegister === 'Yes') breach += 5;
  else if (a.breachRegister === 'Partial') breach += 2;

  // Section 5: Third-Party Processing (max 30)
  let thirdParty = 0;
  if (a.dpaAgreements === 'Yes') thirdParty += 10;
  else if (a.dpaAgreements === 'Partial') thirdParty += 4;
  if (a.processorDueDiligence === 'Yes') thirdParty += 8;
  else if (a.processorDueDiligence === 'Partial') thirdParty += 3;
  if (a.crossBorderSafeguards === 'No transfers') thirdParty += 7;
  else if (a.crossBorderSafeguards === 'Yes — safeguards in place') thirdParty += 7;
  if (a.processorAudits === 'Yes') thirdParty += 5;
  else if (a.processorAudits === 'Partial') thirdParty += 2;

  // Section 6: Retention & Governance (max 30)
  let retention = 0;
  if (a.retentionSchedules === 'Yes') retention += 8;
  else if (a.retentionSchedules === 'Partial') retention += 3;
  if (a.secureDeletion === 'Yes — automated') retention += 10;
  else if (a.secureDeletion === 'Yes — manual') retention += 6;
  if (a.dpiaProcess === 'Yes') retention += 7;
  else if (a.dpiaProcess === 'Partial') retention += 3;
  if (a.dpoAppointed === 'Yes — dedicated DPO') retention += 5;
  else if (a.dpoAppointed === 'Yes — dual role') retention += 3;

  // Normalize all to 100
  const consentScore = Math.round((consent / 40) * 100);
  const rightsScore = Math.round((rights / 30) * 100);
  const breachScore = Math.round((breach / 35) * 100);
  const thirdPartyScore = Math.round((thirdParty / 30) * 100);
  const retentionScore = Math.round((retention / 30) * 100);
  const overall = Math.round((consentScore + rightsScore + breachScore + thirdPartyScore + retentionScore) / 5);

  return { overall, consentScore, rightsScore, breachScore, thirdPartyScore, retentionScore };
}

function getMaturityLevel(score: number) {
  if (score >= 90) return { level: 5, name: 'Certified & Audited', desc: 'Full PDPA compliance. Independently audited, DPO appointed, zero-gap regulatory posture maintained.' };
  if (score >= 75) return { level: 4, name: 'Monitored Compliance', desc: 'Mostly compliant. Privacy-by-design in product builds, regular DPIAs, DPAs with all vendors, active breach monitoring.' };
  if (score >= 60) return { level: 3, name: 'Partial Compliance', desc: 'Formal data protection program in progress. Data inventory exists, consent captured, but gaps remain in third-party risk and subject rights.' };
  if (score >= 40) return { level: 2, name: 'Basic Policies', desc: 'A privacy policy exists but is poorly enforced. No data inventory, inconsistent consent, no breach response plan.' };
  if (score >= 20) return { level: 1, name: 'Awareness Only', desc: 'Leadership aware of PDPA requirements but no formal policies, registers, or processes exist. Compliance is ad-hoc.' };
  return { level: 0, name: 'No Awareness', desc: 'No formal data protection policies. Personal data collected without documented legal basis or consent.' };
}

function getPDPARisks(a: Answers): { title: string; detail: string; severity: 'critical' | 'high' | 'medium' }[] {
  const risks: { title: string; detail: string; severity: 'critical' | 'high' | 'medium' }[] = [];

  if (a.legalBasis === 'No — not formally documented') {
    risks.push({ title: 'No documented legal basis for processing', detail: 'Processing personal data without a documented legal basis is a fundamental PDPA breach and grounds for regulatory investigation.', severity: 'critical' });
  }
  if (a.consentMechanism === 'No formal consent' || a.consentMechanism === 'Implied consent') {
    risks.push({ title: 'Inadequate consent mechanism', detail: 'Implied or absent consent fails the PDPA\'s requirement for freely given, specific, informed, and unambiguous consent.', severity: 'critical' });
  }
  if (a.consentRecords === 'No') {
    risks.push({ title: 'No consent records maintained', detail: 'Without timestamped consent records, your organization cannot demonstrate compliance if challenged by a regulator or data subject.', severity: 'critical' });
  }
  if (a.sarProcess === 'No') {
    risks.push({ title: 'No Subject Access Request process', detail: 'Failure to respond to SARs within 30 days violates PDPA Section 18 and exposes the organization to formal complaints.', severity: 'high' });
  }
  if (a.erasureProcess === 'No') {
    risks.push({ title: 'Cannot fulfill right to erasure', detail: 'Inability to delete personal data on request is a direct violation of the right to be forgotten under the PDPA.', severity: 'high' });
  }
  if (a.breachNotification === 'No') {
    risks.push({ title: 'Cannot meet 72-hour breach notification window', detail: 'PDPA Section 26 mandates regulatory notification within 72 hours. Exceeding this window results in automatic non-compliance.', severity: 'critical' });
  }
  if (a.breachProcedure === 'No') {
    risks.push({ title: 'No breach response procedure', detail: 'Operating without a breach procedure means incidents will be handled ad-hoc, increasing both harm and regulatory exposure.', severity: 'high' });
  }
  if (a.dpaAgreements === 'No') {
    risks.push({ title: 'Processors without Data Processing Agreements', detail: 'Every third-party processor handling customer data must have a signed DPA. Missing agreements make your organization liable for processor failures.', severity: 'critical' });
  }
  if (a.crossBorderSafeguards === 'Transfers without safeguards') {
    risks.push({ title: 'Unprotected cross-border data transfers', detail: 'Transferring personal data outside East Africa without safeguards (SCCs, adequacy decisions) is a direct PDPA violation.', severity: 'critical' });
  }
  if (a.retentionSchedules === 'No') {
    risks.push({ title: 'No data retention schedules', detail: 'Keeping personal data indefinitely without a schedule violates the data minimisation and storage limitation principles.', severity: 'medium' });
  }
  if (a.dpiaProcess === 'No') {
    risks.push({ title: 'No DPIA process for high-risk activities', detail: 'High-risk processing (profiling, sensitive data, mass surveillance) requires a DPIA before it begins. Skipping this risks regulatory censure.', severity: 'high' });
  }

  if (risks.length === 0) {
    risks.push({ title: 'Ongoing processor review cadence', detail: 'Scheduled annual processor audits should be formalized to maintain visibility into evolving third-party risks.', severity: 'medium' });
    risks.push({ title: 'DPIA refresh on system changes', detail: 'Ensure DPIAs are re-run whenever processing activities materially change, not just at initial deployment.', severity: 'medium' });
  }

  return risks.slice(0, 4);
}

function getPDPARecs(a: Answers, sector: string): string[] {
  const recs: string[] = [];

  if (a.legalBasis !== 'Yes — all categories documented') {
    recs.push('Commission a data mapping exercise to document every processing activity, its legal basis, and data flows — this is the foundation of all PDPA compliance.');
  }
  if (a.consentMechanism !== 'Granular + auditable' || a.consentRecords === 'No') {
    recs.push('Implement a Consent Management Platform (CMP) that captures granular, purpose-specific consent with timestamped records — Ondi\'s consent module integrates directly with your existing forms.');
  }
  if (a.breachProcedure === 'No' || a.breachNotification === 'No') {
    recs.push('Draft and test a Data Breach Response Plan with a clear 72-hour notification runbook. Ondi\'s incident workflow automates regulatory notification drafting.');
  }
  if (a.dpaAgreements !== 'Yes') {
    recs.push('Audit all active vendors and processors and issue PDPA-compliant Data Processing Agreements to any who lack one. Ondi\'s DPA template kit covers standard East African processor relationships.');
  }
  if (a.sarProcess !== 'Yes') {
    recs.push('Build a Subject Rights Management workflow that routes, tracks, and closes SARs within 30 days — a simple intake form, ownership assignment, and deadline tracker is the minimum viable process.');
  }
  if (a.dpiaProcess !== 'Yes') {
    recs.push('Adopt a DPIA screening checklist for all new projects handling personal data. Run full DPIAs before any high-risk processing activity begins.');
  }
  if (sector === 'Fintech' || sector === 'Healthcare') {
    recs.push('As a high-risk sector processor, consider appointing a dedicated DPO with board-level independence and a formally defined mandate covering all PDPA obligations.');
  }

  if (recs.length < 3) {
    recs.push('Establish annual PDPA training for all staff who handle personal data, and maintain training records as evidence of compliance culture.');
    recs.push('Schedule a bi-annual internal PDPA audit to verify that documented policies reflect actual practices across all departments.');
  }

  return recs.slice(0, 4);
}

/* ─── COMPONENT ───────────────────────────────────────────────────── */
export default function PDPATakePage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>(INIT);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [expandedSections, setExpandedSections] = useState<number[]>([1]);

  const q = QUESTIONS[activeIdx];
  const totalQ = QUESTIONS.length;
  const answeredCount = Object.values(answers).filter(v => v !== '').length;
  const overallPct = Math.round((answeredCount / totalQ) * 100);

  const sectionQuestions = (sNum: number) => QUESTIONS.filter(x => x.sectionNum === sNum);
  const sectionAnswered = (sNum: number) => sectionQuestions(sNum).filter(x => answers[x.id] !== '').length;
  const sectionTotal = (sNum: number) => sectionQuestions(sNum).length;
  const sectionComplete = (sNum: number) => sectionAnswered(sNum) === sectionTotal(sNum);

  const select = (val: string) => {
    const next = { ...answers, [q.id]: val };
    setAnswers(next);
    setTimeout(() => {
      if (activeIdx < totalQ - 1) {
        const nextQ = QUESTIONS[activeIdx + 1];
        setActiveIdx(activeIdx + 1);
        if (!expandedSections.includes(nextQ.sectionNum)) {
          setExpandedSections(prev => [...prev, nextQ.sectionNum]);
        }
      } else {
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 220);
  };

  const goTo = (idx: number) => {
    setActiveIdx(idx);
    const sec = QUESTIONS[idx].sectionNum;
    if (!expandedSections.includes(sec)) {
      setExpandedSections(prev => [...prev, sec]);
    }
  };

  const back = () => {
    if (activeIdx > 0) {
      const prevQ = QUESTIONS[activeIdx - 1];
      setActiveIdx(activeIdx - 1);
      if (!expandedSections.includes(prevQ.sectionNum)) {
        setExpandedSections(prev => [...prev, prevQ.sectionNum]);
      }
    }
  };

  const next = () => {
    if (answers[q.id]) {
      if (activeIdx < totalQ - 1) {
        const nextQ = QUESTIONS[activeIdx + 1];
        setActiveIdx(activeIdx + 1);
        if (!expandedSections.includes(nextQ.sectionNum)) {
          setExpandedSections(prev => [...prev, nextQ.sectionNum]);
        }
      } else {
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const restart = () => {
    setAnswers(INIT);
    setActiveIdx(0);
    setDone(false);
    setEmailSent(false);
    setEmail('');
    setExpandedSections([1]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scores = calcScore(answers);
  const maturity = getMaturityLevel(scores.overall);

  /* ── Results Page ─────────────────────────────────────────────── */
  if (done) {
    const risks = getPDPARisks(answers);
    const recs = getPDPARecs(answers, answers.sector);

    const LEVEL_COLORS: Record<number, { bg: string; text: string; border: string }> = {
      0: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
      1: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
      2: { bg: '#fefce8', text: '#ca8a04', border: '#fef08a' },
      3: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
      4: { bg: ACC_LIGHT, text: ACC, border: '#6ee7b7' },
      5: { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
    };
    const lc = LEVEL_COLORS[maturity.level];

    return (
      <div className="min-h-screen bg-[#F1F4F9] font-sans">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-[#E5E9F0] h-14 flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Link href="/assessment/pdpa" className="text-slate-400 hover:text-slate-700 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: ACC }}>
                <FileText size={12} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-[#001633]">PDPA Compliance Assessment</span>
            </div>
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-xs font-bold font-mono" style={{ color: ACC }}>Results</span>
          </div>
          <button onClick={restart} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-mono transition-colors">
            <RefreshCw size={12} /> Restart
          </button>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">

          {/* Maturity Level Banner */}
          <div className="rounded-2xl border p-5 flex items-center gap-4" style={{ background: lc.bg, borderColor: lc.border }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-black font-mono border" style={{ background: 'white', color: lc.text, borderColor: lc.border }}>
              {maturity.level}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: lc.text }}>PDPA Compliance Level</span>
                <span className="text-sm font-bold px-3 py-0.5 rounded-full border" style={{ background: 'white', color: lc.text, borderColor: lc.border }}>{maturity.name}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-2xl">{maturity.desc}</p>
            </div>
            <div className="ml-auto shrink-0 text-right hidden sm:block">
              <div className="text-3xl font-black font-mono" style={{ color: lc.text }}>{scores.overall}</div>
              <div className="text-[10px] text-slate-400 font-mono uppercase">out of 100</div>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-[#001633]">Compliance Score Breakdown</h2>
            <div className="space-y-4">
              {([
                { label: 'Data Collection & Consent', score: scores.consentScore, icon: <FileSignature size={14} /> },
                { label: 'Data Subject Rights', score: scores.rightsScore, icon: <UserCheck size={14} /> },
                { label: 'Data Breach Management', score: scores.breachScore, icon: <Bell size={14} /> },
                { label: 'Third-Party Processing', score: scores.thirdPartyScore, icon: <Globe size={14} /> },
                { label: 'Retention & Governance', score: scores.retentionScore, icon: <Database size={14} /> },
              ] as const).map(({ label, score, icon }) => {
                const color = score >= 75 ? ACC : score >= 50 ? '#2563eb' : score >= 30 ? '#d97706' : '#dc2626';
                return (
                  <div key={label} className="grid grid-cols-[1fr_60px] gap-4 items-center">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{icon}</span>
                        <span className="text-[12px] font-semibold text-slate-700">{label}</span>
                        <span className="text-[10px] font-mono ml-auto" style={{ color }}>{score}/100</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${score}%` }}
                          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                          className="h-full rounded-full"
                          style={{ background: color }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: score >= 75 ? ACC_LIGHT : score >= 30 ? '#fffbeb' : '#fef2f2', color }}>
                        {score >= 75 ? 'Compliant' : score >= 50 ? 'Partial' : 'Gap'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risks + Recs + Email */}
          <div className="grid lg:grid-cols-[1fr_340px] gap-6">
            <div className="space-y-5">
              {/* Risks */}
              <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider font-mono text-rose-600">
                  <AlertTriangle size={13} /> Identified Compliance Gaps
                </div>
                <div className="space-y-4">
                  {risks.map((r, i) => {
                    const severityStyles = {
                      critical: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', label: 'Critical' },
                      high: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', label: 'High' },
                      medium: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', label: 'Medium' },
                    };
                    const s = severityStyles[r.severity];
                    return (
                      <div key={i} className="border rounded-xl p-4 space-y-1" style={{ borderColor: s.border, background: s.bg }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-bold" style={{ color: s.text }}>{r.title}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-mono shrink-0" style={{ background: 'white', color: s.text }}>{s.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{r.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recs */}
              <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider font-mono" style={{ color: ACC }}>
                  <ClipboardCheck size={13} /> Remediation Priority Plan
                </div>
                <div className="space-y-3">
                  {recs.map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-mono text-[9px] font-bold border mt-0.5" style={{ background: ACC_LIGHT, color: ACC, borderColor: '#6ee7b7' }}>
                        {i + 1}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Email / CTA panel */}
            <div className="space-y-4">
              <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 shadow-sm space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider font-mono mb-1" style={{ color: ACC }}>
                    <Star size={11} /> Get Full PDPA Report
                  </div>
                  <h4 className="text-sm font-bold text-[#001633]">Save Your Compliance Roadmap</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Includes DPA template kit and policy templates</p>
                </div>

                {emailSent ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl p-5 text-center space-y-3 border" style={{ background: ACC_LIGHT, borderColor: '#6ee7b7' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto" style={{ background: ACC }}>
                      <CheckCircle size={20} className="text-white" />
                    </div>
                    <h5 className="text-xs font-bold text-[#001633]">Report Dispatched</h5>
                    <p className="text-[10px] text-slate-500 leading-relaxed">Your PDPA compliance report and template kit has been sent to <strong className="text-[#001633]">{email}</strong>.</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Work Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@organization.com"
                        className="w-full px-3 py-2.5 border border-[#E5E9F0] rounded-lg text-xs text-[#001633] placeholder-slate-300 focus:outline-none transition-colors"
                        style={{ outlineColor: ACC }}
                        onFocus={e => e.target.style.borderColor = ACC}
                        onBlur={e => e.target.style.borderColor = '#E5E9F0'}
                      />
                    </div>
                    <button
                      onClick={() => { if (email.includes('@')) setEmailSent(true); }}
                      disabled={!email.includes('@')}
                      className="w-full py-3 text-white rounded-lg font-bold text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 transition-all"
                      style={{ background: email.includes('@') ? ACC : '#cbd5e1', cursor: email.includes('@') ? 'pointer' : 'not-allowed' }}
                    >
                      <Mail size={12} /> Save & Email Report
                    </button>
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <Link
                    href="/assessment/pdpa"
                    className="w-full py-3 border border-[#E5E9F0] text-[#001633] rounded-lg font-bold text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors group"
                  >
                    <span>Back to PDPA Overview</span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <button
                    onClick={restart}
                    className="w-full py-2 text-slate-400 hover:text-slate-600 font-mono text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw size={9} /> Restart Assessment
                  </button>
                </div>
              </div>

              {/* Quick PDPA level guide */}
              <div className="bg-white border border-[#E5E9F0] rounded-2xl p-5 shadow-sm space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">PDPA Maturity Scale</p>
                {([
                  { l: 0, name: 'No Awareness', color: '#dc2626' },
                  { l: 1, name: 'Awareness Only', color: '#d97706' },
                  { l: 2, name: 'Basic Policies', color: '#ca8a04' },
                  { l: 3, name: 'Partial Compliance', color: '#2563eb' },
                  { l: 4, name: 'Monitored Compliance', color: ACC },
                  { l: 5, name: 'Certified & Audited', color: '#065f46' },
                ]).map(({ l, name, color }) => (
                  <div key={l} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${maturity.level === l ? 'border' : ''}`}
                    style={maturity.level === l ? { borderColor: color, background: `${color}08` } : {}}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black font-mono shrink-0" style={{ background: `${color}18`, color }}>
                      {l}
                    </div>
                    <span className={`text-[11px] font-medium ${maturity.level === l ? 'font-bold' : 'text-slate-400'}`} style={maturity.level === l ? { color } : {}}>
                      {name}
                    </span>
                    {maturity.level === l && (
                      <span className="ml-auto text-[9px] font-bold font-mono" style={{ color }}>YOU</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Question Form ─────────────────────────────────────────────── */
  const isLast = activeIdx === totalQ - 1;
  const answered = answers[q.id] !== '';
  const qIndexInSection = sectionQuestions(q.sectionNum).findIndex(x => x.id === q.id);
  const sectionPct = Math.round((sectionAnswered(q.sectionNum) / sectionTotal(q.sectionNum)) * 100);

  return (
    <div className="min-h-screen bg-[#F1F4F9] font-sans flex flex-col">

      {/* ── Top Header Bar ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E5E9F0] h-14 flex items-center justify-between px-4 gap-4 shadow-sm">
        {/* Left: back + progress ring + title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/assessment/pdpa"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Circular progress */}
            <div className="relative w-9 h-9 shrink-0">
              <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#E5E9F0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={ACC} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 15}`}
                  strokeDashoffset={`${2 * Math.PI * 15 * (1 - overallPct / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black font-mono" style={{ color: ACC }}>
                {overallPct}%
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#001633] truncate">PDPA Compliance Assessment</p>
              <p className="text-[10px] text-slate-400 font-mono">Overall progress</p>
            </div>
          </div>
        </div>

        {/* Right: Q counter + Save & Next */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono border border-[#E5E9F0] rounded-lg px-3 py-1.5">
            <span className="font-bold text-[#001633]">Q{activeIdx + 1}</span>
            <span className="text-slate-300">/</span>
            <span>{totalQ}</span>
            <ChevronDown size={11} className="text-slate-400" />
          </div>
          <button
            onClick={next}
            disabled={!answered}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all"
            style={answered ? { background: ACC, color: 'white' } : { background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}
          >
            {isLast ? 'View Results' : 'Save & Next'} <ChevronRight size={13} />
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#E5E9F0] overflow-y-auto shrink-0">

          {/* Sidebar header */}
          <div className="px-4 py-4 border-b border-[#E5E9F0] flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: ACC }}>
              <ShieldLogo size={14} variant="transparent" className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#001633]">PDPA Assessment</p>
              <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Compliance Radar</p>
            </div>
          </div>

          {/* Section tree */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {SECTIONS.map(sec => {
              const isActiveSec = q.sectionNum === sec.num;
              const isExpanded = expandedSections.includes(sec.num);
              const ans_n = sectionAnswered(sec.num);
              const tot_n = sectionTotal(sec.num);
              const complete = sectionComplete(sec.num);

              return (
                <div key={sec.num}>
                  <button
                    onClick={() => {
                      const firstQ = QUESTIONS.findIndex(x => x.sectionNum === sec.num);
                      if (firstQ >= 0) goTo(firstQ);
                      setExpandedSections(prev =>
                        isExpanded && !isActiveSec
                          ? prev.filter(n => n !== sec.num)
                          : [...prev.filter(n => n !== sec.num), sec.num]
                      );
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all"
                    style={isActiveSec ? { color: ACC, fontWeight: 600 } : {}}
                    onMouseEnter={e => { if (!isActiveSec) { e.currentTarget.style.background = '#f8faff'; e.currentTarget.style.color = '#1e293b'; } }}
                    onMouseLeave={e => { if (!isActiveSec) { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; } }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black transition-colors"
                        style={
                          complete
                            ? { background: '#10b981', color: 'white' }
                            : isActiveSec
                              ? { background: ACC, color: 'white' }
                              : { background: '#e2e8f0', color: '#64748b' }
                        }
                      >
                        {complete ? <Check size={9} strokeWidth={3} /> : sec.num}
                      </div>
                      <span className="text-[12px] truncate">{sec.label}</span>
                    </div>
                    <span
                      className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-md font-bold"
                      style={
                        complete
                          ? { color: '#059669', background: '#d1fae5' }
                          : isActiveSec
                            ? { color: ACC, background: ACC_LIGHT }
                            : { color: '#94a3b8', background: '#f1f5f9' }
                      }
                    >
                      {ans_n}/{tot_n}
                    </span>
                  </button>

                  {/* Sub-questions */}
                  {isExpanded && (
                    <div className="ml-8 mt-0.5 space-y-px">
                      {sectionQuestions(sec.num).map((sq, si) => {
                        const isActiveQ = activeIdx === QUESTIONS.indexOf(sq);
                        const isAnswered = answers[sq.id] !== '';
                        return (
                          <button
                            key={sq.id}
                            onClick={() => goTo(QUESTIONS.indexOf(sq))}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-[11px] transition-all"
                            style={isActiveQ ? { background: ACC_LIGHT, color: ACC, fontWeight: 700 } : {}}
                            onMouseEnter={e => { if (!isActiveQ) e.currentTarget.style.background = '#f8faff'; }}
                            onMouseLeave={e => { if (!isActiveQ) e.currentTarget.style.background = ''; }}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                              style={
                                isAnswered
                                  ? { background: '#10b981', borderColor: '#10b981' }
                                  : isActiveQ
                                    ? { borderColor: ACC }
                                    : { borderColor: '#cbd5e1' }
                              }
                            >
                              {isAnswered && <Check size={7} strokeWidth={3} className="text-white" />}
                            </span>
                            <span className="truncate">
                              {sec.num}.{si + 1} {sq.label.slice(0, 30)}{sq.label.length > 30 ? '...' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Bottom progress */}
          <div className="px-4 py-4 border-t border-[#E5E9F0] space-y-2">
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Overall Progress</span>
              <span>{overallPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${overallPct}%`, background: ACC }}
              />
            </div>
            <p className="text-[9px] text-slate-400 leading-normal font-normal pt-1">
              All responses are strictly confidential and consent-gated.
            </p>
          </div>
        </aside>

        {/* Main content pane */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-8">

            {/* Question card */}
            <div className="bg-white border border-[#E5E9F0] rounded-2xl overflow-hidden shadow-sm">

              {/* Section title bar */}
              <div className="px-6 py-4 border-b border-[#E5E9F0] bg-[#FAFFFE]">
                <h2 className="text-sm font-bold text-[#001633]">
                  {q.sectionNum}. {q.section}
                </h2>
              </div>

              {/* Subsection row with progress */}
              <div className="px-6 py-3 border-b border-[#E5E9F0] flex items-center justify-between flex-wrap gap-3">
                <p className="text-[12px] text-slate-600 font-medium">
                  {q.sectionNum}.{qIndexInSection + 1} {q.label.slice(0, 52)}{q.label.length > 52 ? '...' : ''}
                </p>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">{sectionPct}% completed</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-400"
                        style={{ width: `${sectionPct}%`, background: ACC }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {sectionAnswered(q.sectionNum)}/{sectionTotal(q.sectionNum)}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full font-mono"
                    style={{ background: ACC_LIGHT, color: ACC }}
                  >
                    Q {qIndexInSection + 1} / {sectionTotal(q.sectionNum)}
                  </span>
                </div>
              </div>

              {/* Section tag divider */}
              <div className="px-6 py-2 border-b border-[#E5E9F0] bg-[#F5FFFB]">
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: ACC }}>
                  {q.section}
                </span>
              </div>

              {/* Question + options */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`pdpa-q-${activeIdx}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="px-6 py-6 space-y-5"
                >
                  {/* Question label */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                      Question {activeIdx + 1} of {totalQ}
                    </p>
                    <h3 className="text-base font-semibold text-[#001633] leading-snug">{q.label}</h3>
                    {q.hint && (
                      <p className="text-[11px] text-slate-400 leading-relaxed italic border-l-2 pl-3 mt-2" style={{ borderColor: ACC }}>
                        {q.hint}
                      </p>
                    )}
                  </div>

                  {/* Options */}
                  <div className={`grid gap-3 ${q.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {q.options.map(opt => {
                      const sel = answers[q.id] === opt.val;
                      return (
                        <button
                          key={opt.val}
                          onClick={() => select(opt.val)}
                          className="flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 group"
                          style={{
                            borderColor: sel ? ACC : '#E5E9F0',
                            background: sel ? ACC_LIGHT : '#FAFFFE',
                          }}
                          onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = `${ACC}66`; e.currentTarget.style.background = 'white'; } }}
                          onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#E5E9F0'; e.currentTarget.style.background = '#FAFFFE'; } }}
                        >
                          {/* Radio dot */}
                          <div
                            className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                            style={sel ? { borderColor: ACC, background: ACC } : { borderColor: '#cbd5e1' }}
                          >
                            {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-[13px] font-semibold leading-snug"
                              style={{ color: sel ? ACC : '#001633' }}
                            >
                              {opt.label}
                            </p>
                            {opt.desc && (
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                            )}
                          </div>
                          {sel && (
                            <CheckCircle size={14} className="ml-auto shrink-0" style={{ color: ACC }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Footer nav */}
              <div className="px-6 py-4 border-t border-[#E5E9F0] bg-[#FAFFFE] flex justify-between items-center">
                <button
                  onClick={back}
                  disabled={activeIdx === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E5E9F0] text-[11px] font-mono uppercase tracking-wider text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ArrowLeft size={11} /> Previous
                </button>
                <div className="sm:hidden text-[10px] text-slate-400 font-mono">{activeIdx + 1}/{totalQ}</div>
                <button
                  onClick={next}
                  disabled={!answered}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider transition-all"
                  style={answered ? { background: ACC, color: 'white' } : { background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}
                >
                  {isLast ? 'View Results' : 'Next'} <ChevronRight size={11} />
                </button>
              </div>
            </div>

            {/* Mobile progress bar */}
            <div className="mt-4 md:hidden bg-white border border-[#E5E9F0] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${overallPct}%`, background: ACC }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">{overallPct}% complete</span>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
