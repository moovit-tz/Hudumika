'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { HolographicRing, ShieldLogo } from '@/components/OneUI';
import {
  ArrowRight, ShieldCheck, CheckCircle, AlertTriangle,
  ClipboardCheck, ChevronRight, ArrowLeft, RefreshCw,
  Mail, Check, ChevronDown, Star, LayoutGrid, Lock,
  Users, ShieldAlert, Award, Compass, Database, Eye
} from 'lucide-react';

/* ─── DATA ─────────────────────────────────────────────────────────── */
interface Answers {
  businessSize: string; industry: string; mainChallenge: string;
  loginSystem: string; custVerification: string; deviceTrust: string; accessRevoke: string;
  fraudVisibility: string; auditLogs: string; riskScoring: string; biometricSupport: string;
  onboardingDuration: string; passwordDependency: string; multiPlatform: string;
  regulatoryTracking: string; dataRetention: string; consentTracking: string; rbacPermissions: string;
}

const INIT: Answers = {
  businessSize: '', industry: '', mainChallenge: '',
  loginSystem: '', custVerification: '', deviceTrust: '', accessRevoke: '',
  fraudVisibility: '', auditLogs: '', riskScoring: '', biometricSupport: '',
  onboardingDuration: '', passwordDependency: '', multiPlatform: '',
  regulatoryTracking: '', dataRetention: '', consentTracking: '', rbacPermissions: '',
};

interface Question {
  id: keyof Answers;
  section: string;
  sectionNum: number;
  label: string;
  hint?: string;
  options: { val: string; label: string; desc?: string }[];
}

const QUESTIONS: Question[] = [
  // 1 — Profile
  { id: 'businessSize', section: 'Profile Context', sectionNum: 1, label: 'What is your organization\'s employee size?',
    options: [{ val: '1–10', label: '1–10', desc: 'Micro-startup or early stage' }, { val: '11–50', label: '11–50', desc: 'Growing tech or professional service' }, { val: '51–200', label: '51–200', desc: 'Established regional enterprise' }, { val: '200+', label: '200+', desc: 'Large scale corporate footprint' }] },
  { id: 'industry', section: 'Profile Context', sectionNum: 1, label: 'Which primary industry do you operate in?',
    options: [{ val: 'Fintech', label: 'Fintech & Lending' }, { val: 'Logistics', label: 'Logistics & Mobility' }, { val: 'Healthcare', label: 'Healthcare & Vetting' }, { val: 'SaaS', label: 'SaaS & Platforms' }, { val: 'Education', label: 'Education & Portals' }, { val: 'Commerce', label: 'Retail & E-Commerce' }] },
  { id: 'mainChallenge', section: 'Profile Context', sectionNum: 1, label: 'What is your primary identity or trust challenge?',
    options: [{ val: 'Customer verification', label: 'Customer Onboarding & Verification', desc: 'Real-time KYC checks' }, { val: 'Employee access', label: 'Employee Access & SSO Control', desc: 'JML lifecycle management' }, { val: 'Fraud prevention', label: 'Fraud Prevention', desc: 'Credential spoofing detection' }, { val: 'Compliance', label: 'Regulatory Compliance', desc: 'TRA, BRELA, NIDA audits' }, { val: 'Password fatigue', label: 'Password & User Friction', desc: 'Passwordless flow and dropout reduction' }] },
  // 2 — Identity & Access
  { id: 'loginSystem', section: 'Identity & Access', sectionNum: 2, label: 'How do employees log into internal business systems?',
    options: [{ val: 'Passwords only', label: 'Static Passwords Only', desc: 'No MFA applied' }, { val: 'Google/Microsoft login', label: 'Google or Microsoft SSO', desc: 'Primary workspace accounts' }, { val: 'SSO', label: 'Dedicated SSO Portal', desc: 'Centralized directory sign-in' }, { val: 'Custom IAM', label: 'Custom Identity (IAM)', desc: 'Advanced identity gateways' }] },
  { id: 'custVerification', section: 'Identity & Access', sectionNum: 2, label: 'How do you verify customer identities during onboarding?',
    options: [{ val: 'No verification', label: 'No Verification', desc: 'Email/password self-assertion only' }, { val: 'Phone OTP', label: 'SMS / Phone OTP', desc: 'OTP via mobile number' }, { val: 'Document verification', label: 'Document Upload Vetting', desc: 'Manual PDF/image review' }, { val: 'Full KYC/KYB', label: 'Authoritative Registry API', desc: 'Direct NIDA, TRA, BRELA sync' }] },
  { id: 'deviceTrust', section: 'Identity & Access', sectionNum: 2, label: 'Do you verify and authorize trusted devices before granting system access?',
    options: [{ val: 'Yes', label: 'Yes, we track and bind authorized devices' }, { val: 'No', label: 'No, access is permitted from any hardware' }] },
  { id: 'accessRevoke', section: 'Identity & Access', sectionNum: 2, label: 'Can employee access be centrally and instantly revoked across all systems?',
    options: [{ val: 'Yes', label: 'Yes, centrally controlled and immediate' }, { val: 'No', label: 'No, requires individual manual removals' }] },
  // 3 — Trust & Security
  { id: 'fraudVisibility', section: 'Trust & Security', sectionNum: 3, label: 'Do you have real-time visibility into sign-in anomalies or parallel sessions?',
    options: [{ val: 'Yes', label: 'Yes, anomalies trigger immediate warnings' }, { val: 'No', label: 'No, we only review records post-incident' }] },
  { id: 'auditLogs', section: 'Trust & Security', sectionNum: 3, label: 'Are all identity verifications stored in tamper-proof, secure audit logs?',
    options: [{ val: 'Yes', label: 'Yes, logs are immutable and signed' }, { val: 'No', label: 'No, logs can be deleted or modified' }] },
  { id: 'riskScoring', section: 'Trust & Security', sectionNum: 3, label: 'Do you run adaptive authentication checks based on user risk scoring?',
    options: [{ val: 'Yes', label: 'Yes, high-risk steps trigger biometric prompts' }, { val: 'No', label: 'No, login difficulty remains uniform' }] },
  { id: 'biometricSupport', section: 'Trust & Security', sectionNum: 3, label: 'Do your authentication systems support biometric passkeys or face scans?',
    options: [{ val: 'Yes', label: 'Yes, biometric MFA is active' }, { val: 'No', label: 'No, we rely on passwords and OTP texts' }] },
  // 4 — Customer Experience
  { id: 'onboardingDuration', section: 'Customer Experience', sectionNum: 4, label: 'How long does a customer verification step typically take?',
    options: [{ val: '< 1 minute', label: 'Under 1 minute', desc: 'Instantaneous authoritative check' }, { val: '1–5 mins', label: '1 to 5 minutes', desc: 'Liveness prompt & image uploads' }, { val: '5–15 mins', label: '5 to 15 minutes', desc: 'Review delay loops' }, { val: '15+ mins', label: '15 minutes or more', desc: 'Manual backend validation' }] },
  { id: 'passwordDependency', section: 'Customer Experience', sectionNum: 4, label: 'Do your users or staff still rely on memorizing alphanumeric passwords?',
    options: [{ val: 'Yes', label: 'Yes, passwords are the primary gate' }, { val: 'No', label: 'No, we use passkeys or SSO' }] },
  { id: 'multiPlatform', section: 'Customer Experience', sectionNum: 4, label: 'Can users access credentials consistently across mobile, web, and USSD?',
    options: [{ val: 'Yes', label: 'Yes, seamlessly unified credentials' }, { val: 'No', label: 'No, platforms operate as separate silos' }] },
  // 5 — Compliance & Governance
  { id: 'regulatoryTracking', section: 'Compliance & Governance', sectionNum: 5, label: 'Do you actively track compliance with TCRA, TRA, and BRELA standards?',
    options: [{ val: 'Yes', label: 'Yes, fully aligned with regulatory checks' }, { val: 'No', label: 'No, audited manually on a yearly basis' }] },
  { id: 'dataRetention', section: 'Compliance & Governance', sectionNum: 5, label: 'Do you enforce automated personal data pruning and retention policies?',
    options: [{ val: 'Yes', label: 'Yes, automated data purging is in place' }, { val: 'No', label: 'No, all historical records are kept indefinitely' }] },
  { id: 'consentTracking', section: 'Compliance & Governance', sectionNum: 5, label: 'Are explicit user consent parameters logged for every registry query?',
    options: [{ val: 'Yes', label: 'Yes, consent logs accompany every API check' }, { val: 'No', label: 'No, queries run without formal consent receipts' }] },
  { id: 'rbacPermissions', section: 'Compliance & Governance', sectionNum: 5, label: 'Are data access privileges governed strictly using Role-Based Access Control (RBAC)?',
    options: [{ val: 'Yes', label: 'Yes, strict least-privilege policies enforced' }, { val: 'No', label: 'No, administrators hold unrestricted access' }] },
];

const SECTIONS = [
  { num: 1, label: 'Profile Context', count: 3 },
  { num: 2, label: 'Identity & Access', count: 4 },
  { num: 3, label: 'Trust & Security', count: 4 },
  { num: 4, label: 'Customer Experience', count: 3 },
  { num: 5, label: 'Compliance & Governance', count: 4 },
];

/* ─── SCORING ───────────────────────────────────────────────────────── */
function calcScore(a: Answers) {
  let id = 0, ac = 0, fr = 0, ux = 0, co = 0;
  if (a.loginSystem === 'SSO') id += 7; else if (a.loginSystem === 'Custom IAM') id += 10; else if (a.loginSystem === 'Google/Microsoft login') id += 5; else id += 2;
  if (a.custVerification === 'Full KYC/KYB') id += 10; else if (a.custVerification === 'Document verification') id += 7; else if (a.custVerification === 'Phone OTP') id += 4; else id += 1;
  if (a.biometricSupport === 'Yes') id += 10;
  if (a.deviceTrust === 'Yes') ac += 10; if (a.accessRevoke === 'Yes') ac += 10; if (a.rbacPermissions === 'Yes') ac += 10;
  if (a.fraudVisibility === 'Yes') fr += 10; if (a.riskScoring === 'Yes') fr += 10; if (a.auditLogs === 'Yes') fr += 10;
  if (a.onboardingDuration === '< 1 minute') ux += 10; else if (a.onboardingDuration === '1–5 mins') ux += 7; else if (a.onboardingDuration === '5–15 mins') ux += 4; else ux += 1;
  if (a.passwordDependency === 'No') ux += 10; if (a.multiPlatform === 'Yes') ux += 10;
  if (a.regulatoryTracking === 'Yes') co += 10; if (a.dataRetention === 'Yes') co += 10; if (a.consentTracking === 'Yes') co += 10;
  const identitySec = Math.round((id / 30) * 100);
  const accessMgmt = Math.round((ac / 30) * 100);
  const fraudPrev = Math.round((fr / 30) * 100);
  const userExp = Math.round((ux / 30) * 100);
  const compliance = Math.round((co / 30) * 100);
  const overall = Math.round((identitySec + accessMgmt + fraudPrev + userExp + compliance) / 5);
  return { overall, identitySec, accessMgmt, fraudPrev, userExp, compliance };
}

function getLevel(s: number) {
  if (s >= 80) return { name: 'Enterprise-Grade', desc: 'Secure, passwordless, fully orchestrated cryptographic registry integrations.' };
  if (s >= 60) return { name: 'Advanced', desc: 'Centralized access controls, active MFA, with emerging data risk policies.' };
  if (s >= 40) return { name: 'Growing', desc: 'Foundational SSO, basic OTP validations, but prone to manual review loops.' };
  return { name: 'Foundational', desc: 'Password-heavy access, paper-reliant onboarding, high risk of breaches.' };
}

function getRisks(a: Answers): string[] {
  const r: string[] = [];
  if (a.loginSystem === 'Passwords only') r.push('Password-heavy authentication: Prone to phishing, credential stuffing, and JML leaks.');
  if (a.custVerification === 'No verification' || a.custVerification === 'Phone OTP') r.push('Weak customer verification: Prone to SIM-swap intercepts and synthetic identity fraud.');
  if (a.deviceTrust === 'No') r.push('Zero device trust gating: Vulnerable to sessions hijacked on unmanaged external endpoints.');
  if (a.accessRevoke === 'No') r.push('Access revoke vulnerability: No immediate kill-switch for terminated contractor accounts.');
  if (a.fraudVisibility === 'No') r.push('Blind spots in authentication: No mechanism to detect real-time sign-in anomalies.');
  if (a.riskScoring === 'No') r.push('Static identity gating: Lacks adaptive, context-aware challenges for unusual actions.');
  if (r.length === 0) { r.push('Minor integration gaps: Legacy APIs could cause background query latency.'); r.push('Evolving compliance maps: Regional updates require continuous schema syncs.'); }
  return r.slice(0, 3);
}

function getRecs(a: Answers): string[] {
  const r: string[] = [];
  if (a.industry === 'Fintech' || a.mainChallenge === 'Fraud prevention') { r.push('Integrate Ondi authoritative registry-bridging (BRELA, TRA, NIDA) to eliminate KYC spoofing.'); r.push('Enforce real-time biometric liveness prompts for sensitive transactional thresholds.'); }
  if (a.mainChallenge === 'Password fatigue' || a.passwordDependency === 'Yes') r.push('Transition to Ondi Passwordless SSO utilizing device-anchored Passkey cryptos.');
  if (a.deviceTrust === 'No' || a.riskScoring === 'No') r.push('Deploy adaptive, risk-aware authentication gating responding to real-time Trust Scores.');
  if (a.onboardingDuration === '5–15 mins' || a.onboardingDuration === '15+ mins') r.push('Integrate Ondi KYB instant query API to compress validation times to under 3 minutes.');
  if (r.length < 3) { r.push('Establish automated RBAC across all department nodes.'); r.push('Provision cryptographically signed audit logs to maintain trace integrity.'); }
  return r.slice(0, 3);
}

/* ─── COMPONENT ────────────────────────────────────────────────────── */
export default function TakeAssessmentPage() {
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
    if (!expandedSections.includes(sec)) setExpandedSections(prev => [...prev, sec]);
  };

  const back = () => {
    if (activeIdx > 0) {
      const prev = QUESTIONS[activeIdx - 1];
      setActiveIdx(activeIdx - 1);
      if (!expandedSections.includes(prev.sectionNum)) setExpandedSections(prev2 => [...prev2, prev.sectionNum]);
    }
  };

  const next = () => {
    if (answers[q.id]) {
      if (activeIdx < totalQ - 1) {
        const nextQ = QUESTIONS[activeIdx + 1];
        setActiveIdx(activeIdx + 1);
        if (!expandedSections.includes(nextQ.sectionNum)) setExpandedSections(prev => [...prev, nextQ.sectionNum]);
      } else {
        setDone(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const restart = () => { setAnswers(INIT); setActiveIdx(0); setDone(false); setEmailSent(false); setEmail(''); setExpandedSections([1]); };

  const scores = calcScore(answers);
  const maturity = getLevel(scores.overall);

  const ACC = '#4253D1';
  const ACC_LIGHT = '#ECEEFF';

  /* ── Results ── */
  if (done) {
    const risks = getRisks(answers);
    const recs = getRecs(answers);
    return (
      <div className="min-h-screen bg-[#F1F4F9] font-sans">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-[#E5E9F0] h-14 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/assessment" className="text-slate-400 hover:text-slate-700 transition-colors">
              <ArrowLeft size={18} />
            </Link>
            <span className="text-sm font-semibold text-[#001633]">Identity Trust Assessment</span>
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-xs font-bold text-[#4253D1] font-mono">Results</span>
          </div>
          <button onClick={restart} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-mono transition-colors">
            <RefreshCw size={12} /> Restart
          </button>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
          {/* Score card */}
          <div className="bg-white border border-[#E5E9F0] rounded-2xl p-8 grid lg:grid-cols-[auto_1fr] gap-10 items-center shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <HolographicRing score={scores.overall} max={100} label="Trust Index" color={ACC} />
              <div className="text-center">
                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">Maturity Level</p>
                <h3 className="text-base font-bold text-[#001633] mt-0.5">{maturity.name}</h3>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-[#001633]">Diagnostic Report Card</h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{maturity.desc}</p>
              </div>
              <div className="space-y-3">
                {([
                  { label: 'Identity Security', score: scores.identitySec },
                  { label: 'Access Management', score: scores.accessMgmt },
                  { label: 'Fraud Prevention', score: scores.fraudPrev },
                  { label: 'User Experience', score: scores.userExp },
                  { label: 'Compliance & Governance', score: scores.compliance },
                ] as const).map(({ label, score }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-600 font-semibold">{label}</span>
                      <span className="text-[#4253D1] font-bold">{score}/100</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
                        className="h-full bg-gradient-to-r from-[#4E76E5] to-[#4253D1] rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-5">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-wider font-mono">
                  <AlertTriangle size={13} /> Identified Security Risks
                </div>
                {risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 pl-4 border-l-2 border-rose-300">
                    <span className="text-xs text-rose-800 leading-relaxed">{r}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider font-mono">
                  <ClipboardCheck size={13} /> Strategic Roadmap
                </div>
                {recs.map((r, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 font-mono text-[9px] font-bold">{i + 1}</div>
                    <span className="text-xs text-slate-600 leading-relaxed">{r}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#E5E9F0] rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2 text-[#4253D1] font-bold text-[10px] uppercase tracking-wider font-mono mb-1">
                  <Star size={11} /> Get PDF Report
                </div>
                <h4 className="text-sm font-bold text-[#001633]">Save Your Diagnostic Roadmap</h4>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Emailed directly to your organization</p>
              </div>
              {emailSent ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto"><CheckCircle size={20} /></div>
                  <h5 className="text-xs font-bold text-[#001633]">Report Dispatched</h5>
                  <p className="text-[10px] text-slate-500">Sent to <strong className="text-[#001633]">{email}</strong></p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Corporate Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@organization.com"
                      className="w-full px-3 py-2.5 border border-[#E5E9F0] rounded-lg text-xs text-[#001633] placeholder-slate-300 focus:outline-none focus:border-[#4253D1] transition-colors" />
                  </div>
                  <button onClick={() => { if (email.includes('@')) setEmailSent(true); }} disabled={!email.includes('@')}
                    className={`w-full py-3 bg-[#4253D1] text-white rounded-lg font-bold text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 transition-all ${!email.includes('@') ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#4E76E5]'}`}>
                    <Mail size={12} /> Save & Email Report
                  </button>
                </div>
              )}
              <button onClick={restart} className="w-full py-2 text-slate-400 hover:text-slate-600 font-mono text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                <RefreshCw size={9} /> Restart Assessment
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Question form ── */
  const isLast = activeIdx === totalQ - 1;
  const answered = answers[q.id] !== '';
  const qIndexInSection = sectionQuestions(q.sectionNum).findIndex(x => x.id === q.id);
  const sectionPct = Math.round((sectionAnswered(q.sectionNum) / sectionTotal(q.sectionNum)) * 100);

  return (
    <div className="min-h-screen bg-[#F1F4F9] font-sans flex flex-col">
      {/* ── Top Header Bar ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E5E9F0] h-14 flex items-center justify-between px-4 gap-4 shadow-sm">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/assessment" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-9 h-9 shrink-0">
              <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#E5E9F0" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={ACC} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 15}`}
                  strokeDashoffset={`${2 * Math.PI * 15 * (1 - overallPct / 100)}`}
                  strokeLinecap="round" className="transition-all duration-500" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black font-mono text-[#4253D1]">{overallPct}%</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#001633] truncate">Identity Trust Assessment</p>
              <p className="text-[10px] text-slate-400 font-mono">Overall progress</p>
            </div>
          </div>
        </div>

        {/* Right: page indicator + save button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono border border-[#E5E9F0] rounded-lg px-3 py-1.5">
            <span className="font-bold text-[#001633]">Q{activeIdx + 1}</span>
            <span className="text-slate-300">/</span>
            <span>{totalQ}</span>
            <ChevronDown size={11} className="text-slate-400" />
          </div>
          <button onClick={next} disabled={!answered}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${answered ? 'bg-[#4253D1] text-white hover:bg-[#4E76E5] shadow-md shadow-blue-500/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
            {isLast ? 'View Results' : 'Save & Next'} <ChevronRight size={13} />
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#E5E9F0] overflow-y-auto shrink-0">
          {/* Sidebar header */}
          <div className="px-4 py-4 border-b border-[#E5E9F0] flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: ACC }}>
              <ShieldLogo size={14} variant="transparent" className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#001633]">Diagnostic</p>
              <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">Maturity Radar</p>
            </div>
          </div>

          {/* Section tree */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {SECTIONS.map(sec => {
              const isActiveSec = q.sectionNum === sec.num;
              const isExpanded = expandedSections.includes(sec.num);
              const answered_n = sectionAnswered(sec.num);
              const total_n = sectionTotal(sec.num);
              const complete = sectionComplete(sec.num);

              return (
                <div key={sec.num}>
                  <button
                    onClick={() => {
                      const firstQ = QUESTIONS.findIndex(x => x.sectionNum === sec.num);
                      if (firstQ >= 0) goTo(firstQ);
                      setExpandedSections(prev => isExpanded && !isActiveSec ? prev.filter(n => n !== sec.num) : [...prev.filter(n => n !== sec.num), sec.num]);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                      isActiveSec ? 'text-[#4253D1] font-semibold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black transition-colors ${
                        complete ? 'bg-emerald-500 text-white' : isActiveSec ? 'text-white' : 'bg-slate-200 text-slate-500'
                      }`} style={isActiveSec && !complete ? { background: ACC } : {}}>
                        {complete ? <Check size={9} strokeWidth={3} /> : sec.num}
                      </div>
                      <span className="text-[12px] truncate">{sec.label}</span>
                    </div>
                    <span className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-md font-bold ${
                      complete ? 'text-emerald-600 bg-emerald-50' : isActiveSec ? 'bg-[#ECEEFF] text-[#4253D1]' : 'text-slate-400 bg-slate-100'
                    }`}>{answered_n}/{total_n}</span>
                  </button>

                  {/* Sub-questions */}
                  {isExpanded && (
                    <div className="ml-8 mt-0.5 space-y-px">
                      {sectionQuestions(sec.num).map((sq, si) => {
                        const isActiveQ = activeIdx === QUESTIONS.indexOf(sq);
                        const isAnswered = answers[sq.id] !== '';
                        return (
                          <button key={sq.id} onClick={() => goTo(QUESTIONS.indexOf(sq))}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-[11px] transition-all ${
                              isActiveQ ? 'font-bold' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                            }`} style={isActiveQ ? { background: ACC_LIGHT, color: ACC } : {}}>
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              isAnswered ? 'bg-emerald-500 border-emerald-500' : isActiveQ ? 'border-[#4253D1]' : 'border-slate-300'
                            }`}>
                              {isAnswered && <Check size={7} strokeWidth={3} className="text-white" />}
                            </span>
                            <span className="truncate">{sec.num}.{si + 1} {sq.label.slice(0, 32)}{sq.label.length > 32 ? '...' : ''}</span>
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
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallPct}%`, background: ACC }} />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-8">
            {/* Section + subsection breadcrumb */}
            <div className="bg-white border border-[#E5E9F0] rounded-2xl overflow-hidden shadow-sm">
              {/* Section title bar */}
              <div className="px-6 py-4 border-b border-[#E5E9F0] bg-[#FAFBFF]">
                <h2 className="text-sm font-bold text-[#001633]">
                  {q.sectionNum}. {q.section}
                </h2>
              </div>

              {/* Subsection row */}
              <div className="px-6 py-3 border-b border-[#E5E9F0] flex items-center justify-between flex-wrap gap-3">
                <p className="text-[12px] text-slate-600 font-medium">
                  {q.sectionNum}.{qIndexInSection + 1} {q.label.slice(0, 55)}{q.label.length > 55 ? '...' : ''}
                </p>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">{sectionPct}% completed</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-400" style={{ width: `${sectionPct}%`, background: ACC }} />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{sectionAnswered(q.sectionNum)}/{sectionTotal(q.sectionNum)}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full font-mono" style={{ background: ACC_LIGHT, color: ACC }}>
                    Q {qIndexInSection + 1} / {sectionTotal(q.sectionNum)}
                  </span>
                </div>
              </div>

              {/* Section divider tag (like "Assessed Entity" in reference) */}
              <div className="px-6 py-2 bg-[#F8FAFF] border-b border-[#E5E9F0]">
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: ACC }}>{q.section}</span>
              </div>

              {/* Question + options */}
              <AnimatePresence mode="wait">
                <motion.div key={`q-${activeIdx}`}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="px-6 py-6 space-y-6">

                  {/* Question label */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                      Question {activeIdx + 1} of {totalQ}
                    </p>
                    <h3 className="text-base font-semibold text-[#001633] leading-snug">{q.label}</h3>
                  </div>

                  {/* Options */}
                  <div className={`grid gap-3 ${q.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                    {q.options.map(opt => {
                      const sel = answers[q.id] === opt.val;
                      return (
                        <button key={opt.val} onClick={() => select(opt.val)}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 group ${
                            sel ? 'border-[#4253D1] bg-[#ECEEFF]' : 'border-[#E5E9F0] bg-[#FAFBFF] hover:border-[#4253D1]/40 hover:bg-white'
                          }`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            sel ? 'border-[#4253D1] bg-[#4253D1]' : 'border-slate-300 group-hover:border-[#4253D1]/60'
                          }`}>
                            {sel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[13px] font-semibold leading-snug ${sel ? 'text-[#4253D1]' : 'text-[#001633]'}`}>{opt.label}</p>
                            {opt.desc && <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{opt.desc}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Footer nav */}
              <div className="px-6 py-4 border-t border-[#E5E9F0] bg-[#FAFBFF] flex justify-between items-center">
                <button onClick={back} disabled={activeIdx === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E5E9F0] text-[11px] font-mono uppercase tracking-wider text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <ArrowLeft size={11} /> Previous
                </button>
                <div className="sm:hidden text-[10px] text-slate-400 font-mono">{activeIdx + 1}/{totalQ}</div>
                <button onClick={next} disabled={!answered}
                  className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider transition-all ${
                    answered ? 'text-white shadow-md' : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                  }`} style={answered ? { background: ACC } : {}}>
                  {isLast ? 'View Results' : 'Next'} <ChevronRight size={11} />
                </button>
              </div>
            </div>

            {/* Mobile progress */}
            <div className="mt-4 md:hidden bg-white border border-[#E5E9F0] rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallPct}%`, background: ACC }} />
              </div>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">{overallPct}% complete</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
