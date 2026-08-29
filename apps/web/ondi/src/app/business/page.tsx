'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ArrowRight, ShieldCheck, Zap, Scale, Building2,
  Users, Lock, CheckCircle, ClipboardCheck,
  Key, RefreshCw, UserMinus
} from 'lucide-react';

const PILLARS = [
  {
    num: '01',
    title: 'Identity Lifecycle Management',
    sub: 'Joiner · Mover · Leaver',
    icon: Users,
    desc: 'Automate every workforce identity event from first-day provisioning to final offboarding. Eliminate ghost workers, orphan accounts, and access sprawl with zero manual intervention.',
    bullets: [
      'Birthright access provisioned at hire',
      'Role-based access updated on transfer',
      'Instant revocation on termination',
      'Orphan account detection & cleanup',
    ],
  },
  {
    num: '02',
    title: 'Access Management',
    sub: 'SSO · MFA · Zero Trust',
    icon: Key,
    desc: 'Protect every entry point with adaptive, risk-scored authentication. Enforce Zero Trust across your entire workforce — every user, every device, every session.',
    bullets: [
      'Passwordless SSO across all connected apps',
      'Risk-based adaptive MFA triggers',
      'RBAC & ABAC policy enforcement',
      'Privileged access management (PAM)',
    ],
  },
  {
    num: '03',
    title: 'Identity Governance & Administration',
    sub: 'IGA · SoD · Access Certification',
    icon: Scale,
    desc: 'Govern who has access to what — and prove it. Run quarterly access certifications, enforce Segregation of Duties, and produce audit-ready compliance reports for any regulatory framework.',
    bullets: [
      'Periodic access certification campaigns',
      'Segregation of Duties (SoD) enforcement',
      'Role mining & entitlement analysis',
      'Immutable compliance audit logs',
    ],
  },
];

const GLOSSARY = [
  { term: 'IAM', def: 'Identity & Access Management — the policy framework governing digital identities and their access rights.' },
  { term: 'JML', def: 'Joiner-Mover-Leaver — the three lifecycle events that trigger automated access changes.' },
  { term: 'Zero Trust', def: 'Security model requiring verification from every user and device, regardless of network location.' },
  { term: 'RBAC', def: 'Role-Based Access Control — permissions assigned by role, not individual user.' },
  { term: 'ABAC', def: 'Attribute-Based Access Control — dynamic access decisions using user, resource, and context attributes.' },
  { term: 'SSO', def: 'Single Sign-On — one authentication event unlocks all authorized applications.' },
  { term: 'IGA', def: 'Identity Governance & Administration — managing and auditing access rights across the enterprise.' },
  { term: 'PAM', def: 'Privileged Access Management — controlling, securing, and auditing elevated access accounts.' },
  { term: 'SoD', def: 'Segregation of Duties — ensuring no single identity can complete a fraud-enabling set of actions.' },
  { term: 'CAEP', def: 'Continuous Access Evaluation Profile — real-time risk signals that revoke sessions mid-session as threats emerge.' },
  { term: 'PoLP', def: 'Principle of Least Privilege — every identity receives the minimum access needed to function.' },
  { term: 'Identity Fabric', def: 'A unified connectivity layer linking disparate IAM systems across hybrid environments.' },
];

export default function BusinessPage() {
  return (
    <div className="min-h-screen bg-[#001633] text-white font-sans selection:bg-[#4253D1]/30 overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-60 pb-36 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:6rem_4rem] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,83,209,0.15)_0%,transparent_60%)] pointer-events-none" />
        <div className="absolute -right-32 -top-20 w-[800px] h-[400px] bg-[#4253D1]/10 blur-[130px] rounded-full pointer-events-none -z-10" />

        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full -z-10 pointer-events-none" />
        <BrandWatermark opacity={0.04} size="700px" color="#ffffff" className="absolute -right-32 -top-20 pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl space-y-8">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-white/15 text-white/80"
            >
              <Building2 size={13} className="text-[#4253D1]" />
              <span className="text-xs font-bold uppercase tracking-widest font-mono">Workforce Identity Platform</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] uppercase"
            >
              Stop Trusting Paper.<br />
              <span className="text-[#4253D1]">Start Trusting Data.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-base sm:text-lg text-white/55 font-normal leading-relaxed max-w-2xl"
            >
              Ondi Workforce gives your HR, security, and compliance teams a complete IAM platform — automating JML lifecycle events, enforcing Zero Trust access, and delivering IGA-grade governance with cryptographic certainty.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 pt-2"
            >
              <Link href="/assessment" className="relative overflow-hidden group px-10 py-4 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-2xl shadow-blue-900/40 flex items-center gap-2 whitespace-nowrap w-fit">
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Take Trust Assessment</span>
                <ArrowRight size={15} className="relative z-10" />
              </Link>
              <Link href="/register/enterprise/kyb" className="px-10 py-4 bg-transparent text-white border border-white/20 rounded-full font-bold text-sm uppercase tracking-wider font-mono hover:bg-white/5 transition-all whitespace-nowrap w-fit">
                Register Organization
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex flex-wrap gap-2 pt-2"
            >
              {['Zero Trust', 'JML Lifecycle', 'SSO & MFA', 'IGA', 'RBAC / ABAC', 'PAM'].map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-widest font-mono">
                  {tag}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── THREE PILLARS ─────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-[#001026] text-white border-b border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:6rem_4rem] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(66,83,209,0.08)_0%,transparent_60%)] pointer-events-none" />
        <BrandWatermark opacity={0.04} size="600px" color="#ffffff" className="absolute -left-20 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-20">
              <div className="space-y-3 max-w-2xl">
                <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">The Three Pillars of Workforce Identity</span>
                <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight">Identity security built<br />around how work actually happens.</h2>
              </div>
              <p className="text-sm text-white/45 max-w-sm leading-relaxed font-normal">
                From first-day provisioning to final offboarding — Ondi covers the complete IAM stack your enterprise needs.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
            {PILLARS.map(({ num, title, sub, icon: Icon, desc, bullets }, i) => (
              <ScrollReveal key={num} y={24} delay={i * 0.1}>
                <div className="group relative p-8 bg-white/[0.03] border border-white/[0.08] rounded-3xl space-y-6 transition-all duration-300 hover:border-[#4253D1]/40 hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-[#4253D1]/5 flex flex-col h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-white/[0.08] font-mono group-hover:text-[#4253D1]/25 transition-colors duration-500">{num}</span>
                    <div className="w-11 h-11 rounded-2xl bg-[#4253D1]/15 border border-[#4253D1]/20 text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white group-hover:border-[#4253D1] transition-all duration-500">
                      <Icon size={20} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold uppercase tracking-tight text-white/95">{title}</h3>
                    <p className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">{sub}</p>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed font-normal flex-1">{desc}</p>
                  <div className="space-y-2.5 border-t border-white/[0.06] pt-5">
                    {bullets.map(b => (
                      <div key={b} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4253D1] mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                        <span className="text-[11px] text-white/55 font-normal leading-relaxed">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FAFAF8] text-[#001633] border-b border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="600px" color="#4253D1" className="absolute -left-20 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3 mb-20">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">The Cost of Legacy Verification</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">The hidden overhead<br />of manual identity.</h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { stat: '60%', label: 'of enterprise fraud', desc: 'stems from unverified contractor identities and ghost worker payroll schemes — all preventable with real-time credential checks.', delay: 0.05 },
              { stat: '3–6 Weeks', label: 'average onboarding', desc: 'wasted waiting for manual background checks, HR registry lookups, and paper-based reference validation loops.', delay: 0.15 },
              { stat: '1 in 4', label: 'CVs contain falsities', desc: 'of candidates misrepresent qualifications. Ondi\'s registry-anchored verification eliminates this risk entirely.', delay: 0.25 },
            ].map(({ stat, label, desc, delay }) => (
              <ScrollReveal key={stat} y={24} delay={delay}>
                <div className="group relative p-8 bg-white border border-slate-200/60 rounded-2xl space-y-4 hover:border-red-200 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/3 rounded-full blur-2xl pointer-events-none" />
                  <div>
                    <p className="text-4xl lg:text-5xl font-extrabold text-[#001633] font-mono tracking-tight group-hover:text-red-600 transition-colors">{stat}</p>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono mt-1.5">{label}</p>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4B5563] leading-relaxed font-normal">{desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE GRID ────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white border-b border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="550px" color="#4253D1" className="absolute -right-16 bottom-0 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="grid lg:grid-cols-2 gap-20 items-center mb-24">
              <div className="space-y-5">
                <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Enterprise Identity Suite</span>
                <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Everything your security team needs.</h2>
                <p className="text-sm text-[#4B5563] leading-relaxed font-normal">
                  From day-one staff onboarding to instant offboarding — Ondi automates every step of the identity lifecycle with cryptographic certainty.
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 bg-[#4253D1]/5 blur-[80px] rounded-full pointer-events-none" />
                <GlassPanel className="p-8 bg-white border-slate-100 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#001633] uppercase">Enterprise Portal</p>
                        <p className="text-[10px] text-slate-400 font-mono">LIVE DASHBOARD</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[9px] font-bold uppercase font-mono whitespace-nowrap">Zero Fraud Alert</span>
                  </div>
                  {[
                    { label: 'Active Staff Nodes', value: '842 Verified', status: 'Synced' },
                    { label: 'Apps Provisioned', value: '12 Connected', status: 'Healthy' },
                    { label: 'Identity Disputes', value: '0 Flagged', status: 'Clean' },
                    { label: 'Audit Trail', value: '100% Immutable', status: 'Secure' },
                  ].map(({ label, value, status }) => (
                    <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase font-mono">{label}</p>
                        <p className="text-xs font-bold text-[#001633] mt-0.5">{value}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold uppercase font-mono whitespace-nowrap">{status}</span>
                    </div>
                  ))}
                </GlassPanel>
              </div>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, title: 'JML Lifecycle', desc: 'Automate Joiner, Mover, Leaver events. Instantly provision or revoke access across G-Suite, Slack, ERP tools.', delay: 0.05 },
              { icon: Zap, title: 'Adaptive SSO', desc: 'Risk-scored Single Sign-On with dynamic MFA triggers. High-risk logins are challenged; trusted sessions flow freely.', delay: 0.1 },
              { icon: Scale, title: 'KYB Checks', desc: 'Registry integrations (BRELA, TRA, NIDA) in real-time. Onboard suppliers and contractors without manual audits.', delay: 0.15 },
              { icon: Lock, title: 'Immutable Audit Trail', desc: 'Every credential event, access change, and identity check is timestamped and cryptographically logged forever.', delay: 0.2 },
            ].map(({ icon: Icon, title, desc, delay }) => (
              <ScrollReveal key={title} y={20} delay={delay}>
                <div className="advanced-gradient-card p-[1px] rounded-2xl bg-white border border-slate-100/50 overflow-hidden group">
                  <div className="advanced-gradient-card__trace" />
                  <div className="advanced-gradient-card__glow" />
                  <div className="relative z-10 p-7 bg-white/95 rounded-[15px] space-y-5 min-h-[220px]">
                    <div className="w-11 h-11 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500">
                      <Icon size={20} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-[#001633] uppercase tracking-tight">{title}</h3>
                      <p className="text-xs text-[#4B5563] leading-relaxed font-normal">{desc}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── JML LIFECYCLE EXPLAINER ─────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FAFAF8] border-b border-slate-100 text-[#001633] relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="500px" color="#4253D1" className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3 mb-20">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">JML Lifecycle Automation</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Every workforce event,<br />handled automatically.</h2>
              <p className="text-sm text-[#4B5563] max-w-xl mx-auto leading-relaxed font-normal">
                Ondi listens to your HR system in real time and triggers the right access changes — instantly, without a support ticket.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8 relative z-10">
            {/* JOINER */}
            <ScrollReveal y={20} delay={0}>
              <div className="group relative bg-white border border-slate-200/70 rounded-3xl p-8 space-y-6 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center shrink-0">
                    <Users size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono block">Day 1 Provisioning</span>
                    <h3 className="text-lg font-extrabold text-[#001633] font-mono uppercase">JOINER</h3>
                  </div>
                </div>
                <div className="h-px w-full bg-[#4253D1]/10" />
                <div className="space-y-3">
                  {['Birthright access granted', 'SSO provisioned automatically', 'MFA enrolled on first login', 'HR system synced in real time'].map(item => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle size={13} className="text-[#4253D1] shrink-0" />
                      <span className="text-xs text-[#4B5563] font-normal">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            {/* MOVER */}
            <ScrollReveal y={20} delay={0.1}>
              <div className="group relative bg-white border border-slate-200/70 rounded-3xl p-8 space-y-6 hover:shadow-xl hover:shadow-sky-500/5 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                    <RefreshCw size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-sky-500 uppercase tracking-widest font-mono block">Role Transition</span>
                    <h3 className="text-lg font-extrabold text-[#001633] font-mono uppercase">MOVER</h3>
                  </div>
                </div>
                <div className="h-px w-full bg-sky-500/10" />
                <div className="space-y-3">
                  {['Old role permissions revoked', 'New role access granted', 'SoD rules re-evaluated', 'Audit trail updated'].map(item => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle size={13} className="text-sky-500 shrink-0" />
                      <span className="text-xs text-[#4B5563] font-normal">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            {/* LEAVER */}
            <ScrollReveal y={20} delay={0.2}>
              <div className="group relative bg-white border border-slate-200/70 rounded-3xl p-8 space-y-6 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                    <UserMinus size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest font-mono block">Offboarding</span>
                    <h3 className="text-lg font-extrabold text-[#001633] font-mono uppercase">LEAVER</h3>
                  </div>
                </div>
                <div className="h-px w-full bg-red-500/10" />
                <div className="space-y-3">
                  {['All sessions terminated', 'Every access revoked instantly', 'Credentials archived securely', 'Data handover logged'].map(item => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle size={13} className="text-red-500 shrink-0" />
                      <span className="text-xs text-[#4B5563] font-normal">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal y={16} delay={0.3}>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-10 text-center sm:text-left">
              {[
                { label: 'HR System Integrations', value: 'SAP, Workday, HRIS' },
                { label: 'Provisioning Speed', value: '< 30 seconds' },
                { label: 'Manual Tickets Required', value: 'Zero' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">{label}</span>
                  <span className="text-sm font-bold text-[#001633] font-mono">{value}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── INTEGRATIONS ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#F4F3EF] border-b border-[#E4E0D8] relative overflow-hidden">
        <BrandWatermark opacity={0.04} size="500px" color="#4253D1" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={16}>
            <div className="text-center space-y-3 mb-4">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Ecosystem</span>
              <h3 className="text-2xl lg:text-3xl font-bold text-[#001633] uppercase">Connects to your existing stack</h3>
              <p className="text-sm text-[#4B5563] max-w-2xl mx-auto">Ondi plugs into the tools your teams already use — no rip-and-replace required.</p>
            </div>

            <div className="relative w-full overflow-hidden py-6 mt-12 flex">
              <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#F4F3EF] via-[#F4F3EF]/90 to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#F4F3EF] via-[#F4F3EF]/90 to-transparent z-10 pointer-events-none" />

              <div className="animate-logo-ticker flex items-center select-none">
                {[
                  { name: 'BRELA', logo: '/logos/brela.svg' },
                  { name: 'TRA', logo: '/logos/tra.svg' },
                  { name: 'NIDA', logo: '/logos/nida.svg' },
                  { name: 'NSSF', logo: '/logos/nssf.svg' },
                  { name: 'G-Suite', logo: '/logos/g-suite.svg' },
                  { name: 'SAP', logo: '/logos/sap.svg' },
                  { name: 'Microsoft 365', logo: '/logos/m-365.svg' },
                  { name: 'Sage', logo: '/logos/sage.svg' },
                  { name: 'Aleka', logo: '/logos/aleka.svg' },
                  { name: 'DigiCash', logo: '/logos/digicash.svg' },
                  { name: 'Hudumika', logo: '/logos/hudumika.svg' },
                  { name: 'OptIn', logo: '/logos/optin.svg' },
                ].map(({ name, logo }) => (
                  <div key={`${name}-1`} className="group relative bg-transparent flex items-center justify-center w-28 h-14 shrink-0 transition-all duration-300">
                    <div className="w-full h-full relative flex items-center justify-center z-10 transition-all duration-300 opacity-40 grayscale group-hover:opacity-95 group-hover:grayscale-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logo} alt={`${name} Logo`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                    </div>
                  </div>
                ))}
                {[
                  { name: 'BRELA', logo: '/logos/brela.svg' },
                  { name: 'TRA', logo: '/logos/tra.svg' },
                  { name: 'NIDA', logo: '/logos/nida.svg' },
                  { name: 'NSSF', logo: '/logos/nssf.svg' },
                  { name: 'G-Suite', logo: '/logos/g-suite.svg' },
                  { name: 'SAP', logo: '/logos/sap.svg' },
                  { name: 'Microsoft 365', logo: '/logos/m-365.svg' },
                  { name: 'Sage', logo: '/logos/sage.svg' },
                  { name: 'Aleka', logo: '/logos/aleka.svg' },
                  { name: 'DigiCash', logo: '/logos/digicash.svg' },
                  { name: 'Hudumika', logo: '/logos/hudumika.svg' },
                  { name: 'OptIn', logo: '/logos/optin.svg' },
                ].map(({ name, logo }) => (
                  <div key={`${name}-2`} className="group relative bg-transparent flex items-center justify-center w-28 h-14 shrink-0 transition-all duration-300" aria-hidden="true">
                    <div className="w-full h-full relative flex items-center justify-center z-10 transition-all duration-300 opacity-40 grayscale group-hover:opacity-95 group-hover:grayscale-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logo} alt={`${name} Logo`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── KEY CONCEPTS GLOSSARY ────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#001633] text-white border-b border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(66,83,209,0.08)_0%,transparent_60%)] pointer-events-none" />
        <BrandWatermark opacity={0.04} size="550px" color="#ffffff" className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">IAM Reference Glossary</span>
                <h2 className="text-3xl lg:text-4xl font-bold uppercase leading-tight">Know the language<br />of modern identity.</h2>
              </div>
              <p className="text-sm text-white/45 max-w-sm leading-relaxed font-normal">
                Workforce identity has its own vocabulary. Here are the key concepts behind everything Ondi does.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {GLOSSARY.map(({ term, def }, i) => (
              <ScrollReveal key={term} y={16} delay={i * 0.03}>
                <div className="group p-5 bg-white/[0.03] border border-white/[0.07] rounded-2xl space-y-3 hover:bg-white/[0.06] hover:border-[#4253D1]/30 transition-all duration-300 h-full">
                  <span className="block text-xs font-extrabold text-[#4253D1] uppercase tracking-widest font-mono">{term}</span>
                  <p className="text-[11px] text-white/45 leading-relaxed font-normal group-hover:text-white/60 transition-colors">{def}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HIGH CONVERSION ASSESSMENT CTA BANNER ────────────────────────── */}
      <section className="py-20 px-6 bg-gradient-to-br from-[#001026] to-[#001d40] text-white relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid md:grid-cols-[1.5fr_1fr] gap-12 items-center">
            <div className="space-y-4">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Digital Trust Diagnostic</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight tracking-tight">How trusted is your business infrastructure?</h2>
              <p className="text-sm sm:text-base text-white/60 leading-relaxed font-normal max-w-2xl">
                Measure your organization&apos;s identity maturity, fraud resistance, and access control readiness in under 5 minutes. Get a personalized PDF recommendation roadmap.
              </p>
            </div>
            <div className="flex flex-col sm:items-start md:items-end justify-center">
              <Link href="/assessment" className="relative overflow-hidden group px-10 py-5 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-2xl shadow-blue-500/20 flex items-center gap-3 whitespace-nowrap w-fit">
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Start Trust Assessment</span>
                <ArrowRight size={16} className="relative z-10" />
              </Link>
              <p className="text-[10px] text-white/40 font-mono mt-3 uppercase tracking-widest md:mr-10">✓ 24 specific maturity parameters mapped</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIGITAL TRANSFORMATION LIFECYCLE ─────────────────────────────── */}
      <section className="py-32 px-6 bg-[#001026] text-white relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:6rem_4rem] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(66,83,209,0.06)_0%,transparent_50%)] pointer-events-none" />
        <BrandWatermark opacity={0.04} size="600px" color="#ffffff" className="absolute -right-24 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 mb-20 max-w-2xl mx-auto">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Our Transformation Methodology</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight">The digital trust roadmap</h2>
              <p className="text-sm text-white/50 leading-relaxed font-normal">
                Co-creating high-security IAM frameworks and modern identity infrastructure designed specifically for East Africa&apos;s leading enterprises.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: '01', title: 'Discover & Map', sub: 'Identity Discovery', desc: 'We audit your workforce rosters, HR systems, and existing IAM tools to surface orphan accounts, shadow identities, and access sprawl.' },
              { num: '02', title: 'Govern & Provision', sub: 'Access Management', desc: 'We configure RBAC policies, deploy Zero Trust SSO gating, and enable adaptive MFA across all connected applications.' },
              { num: '03', title: 'Automate JML', sub: 'Lifecycle Automation', desc: 'We wire Joiner-Mover-Leaver events to your HR system, triggering real-time provisioning and instant revocation on exit.' },
              { num: '04', title: 'Certify & Audit', sub: 'Governance & Compliance', desc: 'We run quarterly access certifications, enforce SoD policies, and deliver immutable audit trails for ISO 27001 and regulatory compliance.' },
            ].map(({ num, title, sub, desc }, i) => (
              <ScrollReveal key={num} y={24} delay={i * 0.08}>
                <div className="group relative p-8 bg-white/[0.03] border border-white/[0.05] rounded-2xl space-y-6 transition-all duration-300 hover:border-[#4253D1]/45 hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-[#4253D1]/5">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-extrabold text-white/10 font-mono group-hover:text-[#4253D1]/40 transition-colors duration-500">{num}</span>
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-wider font-mono">{sub}</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-bold uppercase tracking-tight text-white/95">{title}</h3>
                    <p className="text-xs text-white/50 leading-relaxed">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONSULTATIVE CALL TO ACTION ───────────────────────────────────── */}
      <section className="py-32 px-6 bg-[#000d20] text-white relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#4253D1]/5 blur-[120px] rounded-full pointer-events-none -z-10" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7 space-y-8">
              <ScrollReveal y={20}>
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Co-Create With Ondi</span>
                  <h2 className="text-3xl lg:text-6xl font-bold uppercase leading-[1.08] tracking-tight">Co-design your modern identity strategy</h2>
                  <p className="text-base text-white/50 leading-relaxed font-normal max-w-2xl mt-4">
                    We don&apos;t just supply software. We partner with East Africa&apos;s leading financial institutions, corporate employers, and utility networks to engineer high-trust IAM ecosystems.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal y={16} delay={0.1}>
                <div className="grid grid-cols-2 gap-6 pt-4">
                  {[
                    { label: 'IAM Architecture', desc: 'Custom Zero Trust & JML workflow design' },
                    { label: 'Registry Bridging', desc: 'Real-time NIDA, TRA & BRELA APIs' },
                    { label: 'Frictionless SSO', desc: 'Custom authentication and MFA gating' },
                    { label: 'IGA & Compliance', desc: 'SoD enforcement & access certification' },
                  ].map(({ label, desc }) => (
                    <div key={label} className="border-l border-[#4253D1]/40 pl-4 space-y-1">
                      <p className="text-xs font-bold uppercase text-white/90">{label}</p>
                      <p className="text-[10px] text-white/45 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            </div>

            <div className="lg:col-span-5">
              <ScrollReveal y={24} delay={0.15}>
                <GlassPanel className="p-10 bg-white/5 border-white/10 backdrop-blur-xl rounded-2xl relative overflow-hidden space-y-6">
                  <div className="space-y-1.5 border-b border-white/10 pb-4">
                    <h4 className="text-base font-bold uppercase text-white/95">Request Architecture Session</h4>
                    <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Connect with Lead Architects</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest font-mono">Company / Organization</label>
                      <input type="text" placeholder="e.g. Aleka Financial" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#4253D1]/80 focus:shadow-[0_0_15px_rgba(66,83,209,0.15)] transition-all font-mono" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest font-mono">Identity Challenge</label>
                      <select className="w-full px-4 py-3 bg-[#001026] border border-white/10 rounded-xl text-xs text-white/70 focus:outline-none focus:border-[#4253D1]/80 transition-all font-mono cursor-pointer">
                        <option>JML Automation & Lifecycle</option>
                        <option>SSO & Adaptive MFA</option>
                        <option>IGA & Access Certification</option>
                        <option>NIDA / TRA / BRELA Integration</option>
                        <option>Zero Trust Architecture</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest font-mono">Corporate Email</label>
                      <input type="email" placeholder="you@company.com" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#4253D1]/80 focus:shadow-[0_0_15px_rgba(66,83,209,0.15)] transition-all font-mono" />
                    </div>
                  </div>

                  <button className="w-full relative overflow-hidden group px-6 py-4 bg-[#4253D1] text-white rounded-xl font-bold text-xs uppercase tracking-wider font-mono shadow-xl shadow-blue-900/30 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all duration-300">
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                    <span className="relative z-10">Schedule Session</span>
                    <ArrowRight size={14} className="relative z-10" />
                  </button>
                </GlassPanel>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── OUTCOMES ──────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-white relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="500px" color="#4253D1" className="absolute -right-16 top-0 pointer-events-none -z-0" />
        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="grid sm:grid-cols-3 gap-8 text-center">
              {[
                { stat: '85%', label: 'Faster Onboarding', desc: 'Median reduction in staff onboarding time across enterprise pilots.' },
                { stat: '99%', label: 'Fraud Detection', desc: 'Ghost workers and forged credential flags caught before payroll processing.' },
                { stat: '< 3 min', label: 'KYB Completion', desc: 'Full company registry check completed via API, replacing a 3-week manual process.' },
              ].map(({ stat, label, desc }) => (
                <div key={label} className="space-y-3">
                  <p className="text-5xl font-bold text-[#4253D1] font-mono">{stat}</p>
                  <p className="text-xs font-bold text-[#001633] uppercase tracking-wider font-mono">{label}</p>
                  <p className="text-sm text-[#4B5563] leading-relaxed font-normal">{desc}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
