'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ArrowRight, ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle,
  FileText, Database, UserCheck, ClipboardList, Eye, Lock,
  Scale, Sparkles, Compass, Calendar, AlertCircle, Users,
  Bell, Trash2, FileSignature, FolderOpen, Globe
} from 'lucide-react';

/* ─── PDPA COMPLIANCE DIMENSIONS ──────────────────────────────────── */
const COMPLIANCE_AREAS = [
  {
    icon: <FileSignature size={22} />,
    title: 'Lawful Basis & Consent',
    description: 'Do you have documented consent for every personal data collection point? Are consent records time-stamped and auditable?',
    risk: 'Critical',
    riskColor: '#dc2626',
    riskBg: '#fef2f2',
  },
  {
    icon: <UserCheck size={22} />,
    title: 'Data Subject Rights',
    description: 'Can individuals access, correct, or delete their data upon request within mandated timelines? Is there a formal rights-request workflow?',
    risk: 'High',
    riskColor: '#d97706',
    riskBg: '#fffbeb',
  },
  {
    icon: <Bell size={22} />,
    title: 'Breach Notification',
    description: 'Is there a documented breach detection, containment, and 72-hour regulatory notification process? Who owns it?',
    risk: 'Critical',
    riskColor: '#dc2626',
    riskBg: '#fef2f2',
  },
  {
    icon: <Database size={22} />,
    title: 'Data Retention & Disposal',
    description: 'Are retention schedules defined per data category? Is there a verified process for secure deletion when retention periods expire?',
    risk: 'High',
    riskColor: '#d97706',
    riskBg: '#fffbeb',
  },
  {
    icon: <FileText size={22} />,
    title: 'Processor Agreements (DPAs)',
    description: 'Do all third-party vendors who handle your customers\' data have signed Data Processing Agreements in place?',
    risk: 'Medium',
    riskColor: '#0A7C5C',
    riskBg: '#E8F5F0',
  },
  {
    icon: <Globe size={22} />,
    title: 'Cross-Border Transfers',
    description: 'Is personal data transferred outside East Africa with documented adequacy decisions or safeguards (SCCs, BCRs)?',
    risk: 'Medium',
    riskColor: '#0A7C5C',
    riskBg: '#E8F5F0',
  },
];

/* ─── PDPA MATURITY LEVELS ─────────────────────────────────────────── */
const MATURITY_LEVELS = [
  {
    level: 'Level 0',
    label: 'No Awareness',
    description: 'No formal data protection policies. Personal data collected and processed without documented legal basis or consent.',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    level: 'Level 1',
    label: 'Awareness Only',
    description: 'Leadership is aware of PDPA requirements but no formal policies, registers, or processes exist. Compliance is ad-hoc.',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    level: 'Level 2',
    label: 'Basic Policies',
    description: 'A privacy policy exists but is poorly enforced. No data inventory, inconsistent consent collection, no breach plan.',
    color: '#ca8a04',
    bg: '#fefce8',
  },
  {
    level: 'Level 3',
    label: 'Partial Compliance',
    description: 'Formal data protection program in progress. Data inventory exists, consent is captured, but gaps remain in third-party risk and subject rights.',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    level: 'Level 4',
    label: 'Monitored Compliance',
    description: 'Mostly compliant. Privacy-by-design in product builds, regular DPIAs, DPAs with all vendors, active breach monitoring.',
    color: '#0A7C5C',
    bg: '#E8F5F0',
  },
  {
    level: 'Level 5',
    label: 'Certified & Audited',
    description: 'Full PDPA compliance. Independently audited, Data Protection Officer appointed, zero-gap regulatory posture.',
    color: '#065f46',
    bg: '#d1fae5',
  },
];

/* ─── DELIVERABLES ─────────────────────────────────────────────────── */
const DELIVERABLES = [
  {
    icon: <ShieldCheck size={22} />,
    label: '01. PDPA Maturity Score',
    description: 'Your compliance level (0-5) benchmarked against East African businesses in your sector, with specific evidence points for each assessment dimension.',
    iconBg: '#E8F5F0',
    iconColor: '#0A7C5C',
    hoverBg: '#0A7C5C',
  },
  {
    icon: <AlertTriangle size={22} />,
    label: '02. Non-Compliant Practice Audit',
    description: 'A precise inventory of non-compliant data practices organized by severity, with regulatory citations for each identified gap under the PDPA framework.',
    iconBg: '#fef2f2',
    iconColor: '#dc2626',
    hoverBg: '#dc2626',
  },
  {
    icon: <Compass size={22} />,
    label: '03. Remediation Priority Plan',
    description: 'A phased 90-day roadmap resolving critical gaps first, with effort estimates and suggested ownership for each remediation task.',
    iconBg: '#eff6ff',
    iconColor: '#2563eb',
    hoverBg: '#2563eb',
  },
  {
    icon: <FileText size={22} />,
    label: '04. Policy & DPA Template Kit',
    description: 'Customizable templates for a PDPA-compliant privacy notice, data processing agreement, subject rights request form, and breach notification protocol.',
    iconBg: '#faf5ff',
    iconColor: '#7c3aed',
    hoverBg: '#7c3aed',
  },
  {
    icon: <Calendar size={22} />,
    label: '05. Compliance Strategy Session',
    description: 'A free 45-minute session with an Ondi PDPA advisor to walk through your maturity report and define the first sprint of remediation work.',
    iconBg: '#E8F5F0',
    iconColor: '#0A7C5C',
    hoverBg: '#065f46',
  },
];

/* ─── CHALLENGE CARDS ──────────────────────────────────────────────── */
const CHALLENGE_CARDS = [
  {
    icon: <Lock size={20} />,
    title: 'No consent records?',
    text: 'Collecting personal data without documented, auditable consent is a PDPA Level 0 risk. Regulators can act immediately.',
  },
  {
    icon: <Users size={20} />,
    title: 'Ignoring subject requests?',
    text: 'Failing to respond to data access or deletion requests within 30 days violates PDPA Section 18, triggering formal complaints.',
  },
  {
    icon: <AlertCircle size={20} />,
    title: 'No breach notification plan?',
    text: 'A 72-hour notification window starts the moment a breach is detected. No plan means automatic non-compliance with PDPA Section 26.',
  },
  {
    icon: <FileText size={20} />,
    title: 'Vendors without DPAs?',
    text: 'Every third-party processor handling your customer data must have a signed Data Processing Agreement. Missing even one is a liability.',
  },
];

export default function PDPAAssessmentPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#d1fae5] selection:text-[#065f46] overflow-x-hidden">
      <MainNavbar />

      {/* ─── SHARED CSS ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes gradientShiftGreen {
          0% { background-position: 0% center; }
          50% { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
        .pdpa-conic-card {
          position: relative;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }
        .pdpa-conic-trace,
        .pdpa-conic-glow {
          position: absolute;
          inset: 0;
          border-radius: 1rem;
          pointer-events: none;
        }
        .pdpa-conic-trace {
          inset: 1px;
          padding: 1.5px;
          background: conic-gradient(
            from 0deg, #6ee7b7, #d1fae5, #d1fae5, #34d399, #d1fae5, #d1fae5, #6ee7b7
          );
          background-size: 300% 300%;
          background-position: 0 50%;
          opacity: 0.9;
          animation: pdpaCardShine 6s ease-out infinite;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        .pdpa-conic-glow {
          inset: 1px;
          border-radius: calc(1rem - 1px);
          background:
            radial-gradient(circle at top right, rgba(52,211,153,0.18), transparent 26%),
            radial-gradient(circle at bottom left, rgba(10,124,92,0.14), transparent 24%);
          filter: blur(8px);
          opacity: 0.55;
          transition: opacity 250ms ease;
        }
        .pdpa-conic-card:hover .pdpa-conic-trace { animation-duration: 4s; opacity: 1; }
        .pdpa-conic-card:hover .pdpa-conic-glow { opacity: 0.8; }
        @keyframes pdpaCardShine {
          0% { background-position: 0 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }
      `}</style>

      {/* ─── HERO ────────────────────────────────────────────────────── */}
      <section className="relative bg-white bg-[linear-gradient(to_right,#c8e6c9_1px,transparent_1px),linear-gradient(to_bottom,#c8e6c9_1px,transparent_1px)] [background-size:6rem_4rem] border-b border-emerald-100/60">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,#E0F5EEBB_0%,#F4FFFCF2_70%,#ffffff_90%)]" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 flex flex-col items-center pt-36 pb-14 text-center md:pt-44 md:pb-16">
          {/* Back link */}
          <Link
            href="/assessment"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0A7C5C] transition-colors font-mono uppercase tracking-widest mb-8 group"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" />
            All Assessments
          </Link>

          <motion.span
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#0A7C5C]/20 bg-gradient-to-r from-[#0A7C5C]/5 via-[#0A7C5C]/15 to-[#0A7C5C]/5 px-5 py-2 text-xs font-semibold text-[#0A7C5C] backdrop-blur-xl sm:text-sm"
          >
            <FileText className="size-4 text-[#0A7C5C]" />
            PDPA Compliance Assessment for East African Businesses
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 text-[2.2rem]/tight font-bold text-[#001633] min-[420px]:text-5xl sm:text-[3.4rem]/tight lg:text-7xl/[1.1]"
          >
            How your organization{' '}
            <span className="hidden md:inline"><br /></span>
            <span
              className="inline-block text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(90deg, #042d1f, #0A7C5C, #34d399)',
                animation: 'gradientShiftGreen 4s ease infinite',
                backgroundSize: '200% auto',
              }}
            >
              handles data matters now.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 mb-10 max-w-2xl text-base/relaxed text-slate-600 sm:text-lg/relaxed"
          >
            <span className="font-semibold text-[#001633]">East Africa&apos;s data protection era has begun.</span>{' '}
            Measure your organization&apos;s PDPA readiness, identify critical non-compliant practices, and get a clear remediation roadmap in 15 minutes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/assessment/pdpa/take"
              className="relative overflow-hidden group inline-flex items-center gap-3 px-10 py-4 bg-[#0A7C5C] text-white rounded-full font-bold text-sm sm:text-base tracking-wide shadow-2xl shadow-emerald-700/25 cursor-pointer"
            >
              <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-in-out bg-gradient-to-r from-[#0d9e76] to-[#0A7C5C]" />
              <span className="relative z-10">Start PDPA Assessment</span>
              <ArrowRight size={20} className="relative z-10" />
            </Link>
            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <CheckCircle size={12} className="text-[#0A7C5C]" />
                Free
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle size={12} className="text-[#0A7C5C]" />
                15 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle size={12} className="text-[#0A7C5C]" />
                No signup required
              </span>
            </div>
          </motion.div>
        </div>

        {/* Stat strip */}
        <div className="relative z-10 max-w-4xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
            {[
              { value: '6', label: 'Compliance Dimensions' },
              { value: '30+', label: 'Assessment Questions' },
              { value: '5', label: 'Maturity Levels' },
              { value: '72h', label: 'PDPA Breach Window' },
            ].map(({ value, label }) => (
              <div key={label} className="bg-white px-6 py-5 text-center">
                <div className="text-2xl font-bold text-[#0A7C5C] font-mono">{value}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT IS PDPA ───────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF8] border-b border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.02} size="480px" color="#0A7C5C" className="absolute -left-32 -bottom-24 pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-5 space-y-6">
              <span className="text-xs font-bold text-[#0A7C5C] uppercase tracking-widest font-mono">The Legal Context</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#001633] leading-tight">
                What the PDPA requires of your organization
              </h2>
              <div className="space-y-4 text-sm/relaxed text-slate-600">
                <p>
                  East Africa&apos;s data protection landscape is consolidating fast. Tanzania&apos;s Personal Data Protection Act (2022), Kenya&apos;s Data Protection Act (2019), and Uganda&apos;s PDPA (2019) share a common framework modeled on GDPR.
                </p>
                <p>
                  Any organization collecting, processing, or sharing personal data of East African residents is subject to these mandates regardless of where the organization is registered.
                </p>
                <p className="font-medium text-[#001633]">
                  Non-compliance exposes your organization to regulatory fines, mandatory audits, and reputational damage that can permanently affect customer trust.
                </p>
              </div>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-3">
                {[
                  { label: 'Lawful basis documented for all personal data processing', done: false },
                  { label: 'Consent records stored with timestamp and version', done: false },
                  { label: 'Data Subject Rights workflow implemented (access, correction, deletion)', done: false },
                  { label: 'Data Processing Agreements with all third-party vendors', done: false },
                  { label: 'Breach notification protocol with 72-hour regulatory window', done: false },
                  { label: 'Retention schedules and secure deletion process per category', done: false },
                  { label: 'Data Protection Impact Assessment (DPIA) for high-risk processing', done: false },
                  { label: 'Data Protection Officer appointed (if required by sector)', done: false },
                ].map(({ label }, i) => (
                  <ScrollReveal key={i} y={12} delay={i * 0.04}>
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
                      <div className="w-5 h-5 rounded border-2 border-slate-200 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-600 leading-snug">{label}</span>
                    </div>
                  </ScrollReveal>
                ))}
                <div className="pt-2 pl-4 text-xs text-slate-400 font-mono">
                  The assessment checks all of the above across your current operations.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── COMPLIANCE DIMENSIONS ──────────────────────────────────── */}
      <section className="py-24 px-6 bg-white border-b border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#0A7C5C]/3 blur-[120px] rounded-full pointer-events-none -translate-x-1/3 -translate-y-1/3" />

        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 mb-16">
              <span className="text-xs font-bold text-[#0A7C5C] uppercase tracking-widest font-mono">Assessment Coverage</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">6 Compliance Dimensions</h2>
              <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
                The assessment evaluates your organization across every dimension required by the Personal Data Protection Act and regional data governance frameworks.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {COMPLIANCE_AREAS.map((area, i) => (
              <ScrollReveal key={area.title} y={24} delay={i * 0.07}>
                <div className="pdpa-conic-card bg-white rounded-2xl h-full p-[3px]" style={{ boxShadow: '-1px 1px 2px 0 rgba(217,237,229,0.6), 0 10px 28px rgba(10,124,92,0.06)' }}>
                  <div className="pdpa-conic-trace" />
                  <div className="pdpa-conic-glow" />
                  <div className="relative bg-gradient-to-b from-[#F0FAF5] to-[#FAFFFE] border-[0.5px] border-[#c8e6c9]/50 w-full p-6 rounded-[calc(1rem-3px)] h-full flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#E8F5F0] text-[#0A7C5C] flex items-center justify-center shrink-0">
                        {area.icon}
                      </div>
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full font-mono shrink-0"
                        style={{ background: area.riskBg, color: area.riskColor }}
                      >
                        {area.risk}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#001633] mb-2">{area.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{area.description}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT YOU'LL RECEIVE ────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FAFAF8] border-b border-slate-100 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#0A7C5C]/3 blur-[120px] rounded-full pointer-events-none translate-x-1/3 translate-y-1/3" />

        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 mb-16">
              <span className="text-xs font-bold text-[#0A7C5C] uppercase tracking-widest font-mono">Your Report Package</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">What You&apos;ll Receive</h2>
              <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
                After completing the 30-question assessment, our compliance engine generates a comprehensive PDPA readiness package tailored to your sector.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {DELIVERABLES.map((d, i) => (
              <ScrollReveal key={d.label} y={24} delay={i * 0.08}>
                <GlassPanel className="p-8 bg-white border-slate-100 flex flex-col justify-between h-full group hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                  <div className="space-y-5">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300"
                      style={{ background: d.iconBg, color: d.iconColor }}
                    >
                      {d.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">{d.label}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed font-normal">{d.description}</p>
                    </div>
                  </div>
                </GlassPanel>
              </ScrollReveal>
            ))}

            {/* CTA card */}
            <ScrollReveal y={24} delay={0.4}>
              <div
                className="relative rounded-2xl bg-gradient-to-br from-[#042d1f] to-[#0A7C5C] text-white p-8 flex flex-col justify-between h-full group transition-all duration-300 hover:scale-[1.01] shadow-xl shadow-emerald-900/20 cursor-pointer"
                onClick={() => window.location.href = '/assessment/pdpa/take'}
              >
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center">
                    <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold uppercase font-mono tracking-tight">Start your assessment</h3>
                    <p className="text-xs text-white/70 leading-relaxed font-normal">
                      30 targeted questions. 15 minutes. A complete PDPA compliance picture with everything you need to act.
                    </p>
                  </div>
                </div>
                <div className="pt-6">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider font-mono bg-white text-[#042d1f] px-5 py-2.5 rounded-full hover:bg-emerald-50 transition-colors">
                    Take PDPA Assessment
                  </span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── MATURITY LEVELS ────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white border-b border-slate-100 relative overflow-hidden">
        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="grid md:grid-cols-12 gap-12 items-start">
              {/* Left */}
              <div className="md:col-span-4 space-y-6 md:sticky md:top-28">
                <span className="text-xs font-bold text-[#0A7C5C] uppercase tracking-widest font-mono">Maturity Framework</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#001633] leading-tight">
                  PDPA Compliance Levels 0-5
                </h2>
                <p className="text-sm/relaxed text-slate-500">
                  The assessment places your organization at one of six maturity levels. Each level corresponds to specific practices, risks, and a clear pathway to the next stage.
                </p>
                <Link
                  href="/assessment/pdpa/take"
                  className="inline-flex items-center gap-2 text-sm font-bold text-[#0A7C5C] hover:gap-3 transition-all"
                >
                  Find your level
                  <ArrowRight size={16} />
                </Link>
              </div>

              {/* Right - levels */}
              <div className="md:col-span-8 space-y-3">
                {MATURITY_LEVELS.map((ml, i) => (
                  <ScrollReveal key={ml.level} y={16} delay={i * 0.06}>
                    <div className="flex items-start gap-5 p-5 rounded-2xl border border-slate-100 bg-[#FAFAF8] hover:bg-white hover:shadow-md transition-all duration-300 group">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black font-mono shrink-0 transition-colors duration-300"
                        style={{ background: ml.bg, color: ml.color }}
                      >
                        {i}
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-sm font-bold text-[#001633]">{ml.level}</h3>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-mono"
                            style={{ background: ml.bg, color: ml.color }}
                          >
                            {ml.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{ml.description}</p>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── CHALLENGE SECTION ──────────────────────────────────────── */}
      <section className="bg-[#FAFAF8] py-20 md:py-28 relative overflow-hidden border-b border-slate-100">
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-[#0A7C5C]/3 blur-[100px] rounded-full pointer-events-none translate-x-1/3 -translate-y-1/2" />

        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-12 gap-12 items-center">
          <div className="md:col-span-5 space-y-6">
            <span className="text-xs font-bold text-[#0A7C5C] uppercase tracking-widest font-mono">The Compliance Risk</span>
            <h2 className="text-2xl sm:text-3xl md:text-[2.2rem]/[1.25] font-bold text-[#001633] uppercase leading-tight">
              Data protection is no longer optional for East African businesses.
            </h2>
            <div className="space-y-4 text-xs sm:text-sm/relaxed text-slate-600 font-normal">
              <p>
                Enforcement is accelerating. Regulators in Tanzania, Kenya, and Uganda are actively issuing compliance notices and fines. The question is no longer if your organization will face scrutiny, but{' '}
                <strong className="text-[#001633]">whether you will be ready when it arrives.</strong>
              </p>
              <p>
                The Ondi PDPA Assessment gives you an objective baseline in 15 minutes, showing exactly which practices are compliant, which are not, and the minimum viable actions needed to close the gap before regulators arrive.
              </p>
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="grid sm:grid-cols-2 gap-4">
              {CHALLENGE_CARDS.map((card, i) => (
                <div
                  key={i}
                  className="pdpa-conic-card bg-white rounded-2xl h-full p-[3px]"
                  style={{ boxShadow: '-1px 1px 2px 0 rgba(217,237,229,0.5), 0 10px 28px rgba(10,124,92,0.07)' }}
                >
                  <div className="pdpa-conic-trace" />
                  <div className="pdpa-conic-glow" />
                  <div className="group relative bg-gradient-to-b from-[#F0FAF5] to-[#ECFFF8] border-[0.5px] border-[#bbf7d0]/60 w-full p-6 rounded-[calc(1rem-3px)] overflow-hidden h-full">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-white/80 text-[#0A7C5C] shadow-sm mb-3">
                      {card.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-[#001633] mb-1.5">{card.title}</h3>
                    <p className="text-[11px] sm:text-xs leading-relaxed text-slate-500">{card.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────────────────── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#042d1f] via-[#073d29] to-[#0A7C5C] text-white px-8 py-12 md:px-14 md:py-16 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#0A7C5C]/40 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#34d399]/10 blur-[80px] rounded-full -translate-x-1/3 translate-y-1/3" />
            </div>

            <div className="relative space-y-3 max-w-xl">
              <span className="text-emerald-300 font-bold uppercase text-xs tracking-widest font-mono">Free PDPA Assessment - 15 Minutes</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight">
                Know your compliance posture before your first regulator inquiry.
              </h2>
              <p className="text-white/70 text-sm sm:text-base leading-relaxed">
                Get a PDPA maturity score, non-compliant practice audit, remediation plan, and policy template kit. No signup required to start.
              </p>
            </div>

            <div className="relative shrink-0 flex flex-col items-center gap-4">
              <Link
                href="/assessment/pdpa/take"
                className="inline-flex items-center gap-3 px-10 py-4 bg-white text-[#042d1f] rounded-full font-bold text-sm tracking-wide shadow-2xl cursor-pointer hover:bg-emerald-50 transition-colors group"
              >
                <span>Start PDPA Assessment</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/assessment"
                className="text-white/50 text-[10px] font-mono uppercase tracking-wider hover:text-white/80 transition-colors"
              >
                Or view all assessments
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
