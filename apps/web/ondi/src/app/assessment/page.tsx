'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ArrowRight, ShieldCheck, Zap, Scale, Building2,
  Users, Lock, CheckCircle, AlertTriangle, ShieldAlert,
  Award, Sparkles, Compass, Calendar, AlertCircle,
  FileText, Database, UserCheck, ClipboardList, Eye,
  ChevronRight
} from 'lucide-react';

const LOGOS = [
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
];

const ASSESSMENT_TRACKS = [
  {
    href: '/assessment/take',
    badge: 'Identity & Access',
    title: 'Trust Readiness Assessment',
    description: 'Measure your identity maturity, onboarding speed, and access governance against East African standards. Get a Level 0-5 score with a specific remediation roadmap.',
    time: '5 minutes',
    deliverables: ['Identity Maturity Score (0-5)', 'Gap Analysis & Vulnerability Map', 'Ondi Service Alignment', 'Transformation Roadmap', 'Free Strategy Session'],
    icon: <ShieldCheck size={28} />,
    accent: '#4253D1',
    accentLight: '#ECEEFF',
    cta: 'Start Identity Assessment',
  },
  {
    href: '/assessment/pdpa',
    badge: 'Data Protection',
    title: 'PDPA Compliance Assessment',
    description: 'Evaluate your organization\'s readiness against the Personal Data Protection Act and East Africa\'s emerging data governance mandates. Know where you stand before a regulator does.',
    time: '15 minutes',
    deliverables: ['PDPA Maturity Score (0-5)', 'Non-Compliant Practice Audit', 'Remediation Priority Plan', 'Policy & DPA Template Kit', 'Compliance Strategy Session'],
    icon: <FileText size={28} />,
    accent: '#0A7C5C',
    accentLight: '#E8F5F0',
    cta: 'Start PDPA Assessment',
  },
];

export default function AssessmentLandingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ─── CONIC CARD & GRADIENT CSS ─────────────────────────────────────── */}
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% center; }
          50% { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
        .ondi-conic-card {
          position: relative;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }
        .ondi-conic-trace,
        .ondi-conic-glow {
          position: absolute;
          inset: 0;
          border-radius: 1rem;
          pointer-events: none;
        }
        .ondi-conic-trace {
          inset: 1px;
          padding: 1.5px;
          background: conic-gradient(
            from 0deg, #7fd4ff, #d8f0ff, #d8f0ff, #4fa3ff, #d8f0ff, #d8f0ff, #7fd4ff
          );
          background-size: 300% 300%;
          background-position: 0 50%;
          opacity: 0.9;
          animation: advancedCardShine 6s ease-out infinite;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        .ondi-conic-glow {
          inset: 1px;
          border-radius: calc(1rem - 1px);
          background:
            radial-gradient(circle at top right, rgba(107,182,255,0.16), transparent 26%),
            radial-gradient(circle at bottom left, rgba(66,83,209,0.14), transparent 24%);
          filter: blur(8px);
          opacity: 0.55;
          transition: opacity 250ms ease;
        }
        .ondi-conic-card:hover .ondi-conic-trace { animation-duration: 4s; opacity: 1; }
        .ondi-conic-card:hover .ondi-conic-glow { opacity: 0.8; }
        @keyframes advancedCardShine {
          0% { background-position: 0 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
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
          position: absolute;
          inset: 1px;
          border-radius: 1rem;
          pointer-events: none;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        @keyframes pdpaCardShine {
          0% { background-position: 0 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }
      `}</style>

      {/* ─── HERO SECTION ──────────────────────────────────────────────── */}
      <section className="relative bg-white bg-[linear-gradient(to_right,#dadada_1px,transparent_1px),linear-gradient(to_bottom,#dadada_1px,transparent_1px)] [background-size:6rem_4rem] border-b border-slate-100">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,#E0EDFCB3_0%,#F4FBFEF2_70%,#ffffff_90%)]" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 flex flex-col items-center pt-36 pb-14 text-center md:pt-44 md:pb-16">
          <motion.span
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#4253D1]/15 bg-gradient-to-r from-[#4253D1]/5 via-[#4253D1]/15 to-[#4253D1]/5 px-5 py-2 text-xs font-semibold text-[#4253D1] backdrop-blur-xl sm:text-sm"
          >
            <Sparkles className="size-4 text-[#4253D1]" />
            Digital Trust &amp; Compliance Assessments for East African Businesses
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 text-[2.2rem]/tight font-bold text-[#001633] min-[420px]:text-5xl sm:text-[3.4rem]/tight lg:text-7xl/[1.1]"
          >
            How prepared is your
            <span className="hidden md:inline"><br /></span>{' '}
            <span
              className="inline-block text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(90deg, #001633, #4253D1, #225aa5)',
                animation: 'gradientShift 4s ease infinite',
                backgroundSize: '200% auto',
              }}
            >
              business for what&apos;s coming?
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 mb-10 max-w-2xl text-base/relaxed text-slate-600 sm:text-lg/relaxed"
          >
            <span className="font-semibold text-[#001633]">Identity trust and data compliance are now business requirements.</span>{' '}
            Two free assessments measure exactly where your organization stands and what you need to fix first.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/assessment/take"
              className="relative overflow-hidden group inline-flex items-center gap-3 px-10 py-4 bg-[#4253D1] text-white rounded-full font-bold text-sm sm:text-base tracking-wide shadow-2xl shadow-blue-500/25 cursor-pointer"
            >
              <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-in-out bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
              <span className="relative z-10">Identity Assessment</span>
              <ArrowRight size={20} className="relative z-10" />
            </Link>
            <Link
              href="/assessment/pdpa"
              className="inline-flex items-center gap-2 px-8 py-4 border border-[#0A7C5C]/30 text-[#0A7C5C] bg-[#E8F5F0] rounded-full font-bold text-sm sm:text-base tracking-wide hover:bg-[#0A7C5C] hover:text-white transition-all duration-300 cursor-pointer"
            >
              PDPA Assessment
              <ChevronRight size={18} />
            </Link>
          </motion.div>
        </div>

        {/* Logo trust strip */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-16 text-center">
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-8 font-mono">
            Directly Integrated with Key Authority Registry Systems
          </span>
          <div className="relative w-full overflow-hidden py-4 flex">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none" />
            <div className="animate-logo-ticker flex items-center select-none gap-14">
              {LOGOS.map(({ name, logo }) => (
                <div key={`${name}-1`} className="group relative bg-transparent flex items-center justify-center w-28 h-12 shrink-0 transition-all duration-300">
                  <div className="w-full h-full relative flex items-center justify-center z-10 transition-all duration-300 opacity-40 grayscale group-hover:opacity-95 group-hover:grayscale">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo} alt={`${name} Logo`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                </div>
              ))}
              {LOGOS.map(({ name, logo }) => (
                <div key={`${name}-2`} className="group relative bg-transparent flex items-center justify-center w-28 h-12 shrink-0 transition-all duration-300" aria-hidden="true">
                  <div className="w-full h-full relative flex items-center justify-center z-10 transition-all duration-300 opacity-40 grayscale group-hover:opacity-95 group-hover:grayscale">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo} alt={`${name} Logo`} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── ASSESSMENT TRACKS ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FAFAF8] border-b border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.025} size="500px" color="#4253D1" className="absolute -right-32 -top-32 pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 mb-14">
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] leading-tight">
                Pick your assessment track
              </h2>
              <p className="text-sm sm:text-base text-slate-500 max-w-xl mx-auto leading-relaxed">
                Both assessments are free, take under 15 minutes, and produce an actionable diagnostic report card for your organization.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-6">
            {ASSESSMENT_TRACKS.map((track, i) => (
              <ScrollReveal key={track.href} y={24} delay={i * 0.1}>
                <Link href={track.href} className="block group">
                  <div
                    className="relative rounded-2xl border border-slate-200/60 bg-white p-8 h-full flex flex-col gap-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                    style={{ ['--accent' as string]: track.accent }}
                  >
                    {/* Accent glow */}
                    <div
                      className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-[0.06] pointer-events-none translate-x-1/3 -translate-y-1/3"
                      style={{ background: track.accent }}
                    />

                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest font-mono mb-3"
                          style={{ background: track.accentLight, color: track.accent }}
                        >
                          {track.badge}
                        </span>
                        <h3 className="text-xl font-bold text-[#001633] leading-tight">{track.title}</h3>
                      </div>
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                        style={{ background: track.accentLight, color: track.accent }}
                      >
                        {track.icon}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-slate-500 leading-relaxed">{track.description}</p>

                    {/* Deliverables */}
                    <ul className="space-y-2 flex-1">
                      {track.deliverables.map((d) => (
                        <li key={d} className="flex items-center gap-2.5 text-xs text-slate-600 font-medium">
                          <CheckCircle size={13} style={{ color: track.accent }} className="shrink-0" />
                          {d}
                        </li>
                      ))}
                    </ul>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 font-mono uppercase tracking-wider">About {track.time}</span>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-4 py-2 transition-all duration-300 group-hover:gap-3"
                        style={{ background: track.accentLight, color: track.accent }}
                      >
                        {track.cta}
                        <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT YOU'LL RECEIVE (Identity Assessment) ───────────────────── */}
      <section className="py-24 px-6 bg-white border-b border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#4253D1]/3 blur-[120px] rounded-full pointer-events-none translate-x-1/3 -translate-y-1/3" />

        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 mb-16">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Identity Assessment Deliverables</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">What You&apos;ll Receive</h2>
              <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
                After answering 20 strategic questions about your identity ecosystem, our diagnostic engine compiles a detailed, personalized audit package covering access maturity, fraud exposure, and compliance gaps.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            <ScrollReveal y={24} delay={0.05}>
              <GlassPanel className="p-8 bg-[#FAFAF8] border-slate-100 flex flex-col justify-between h-full group hover:bg-white hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-300">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">01. Identity Maturity Level (0-5)</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      A clear classification of your trust stage (Level 0: Password-Heavy to Level 5: Cryptographically Sovereign) based on verified East African baseline statistics.
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.1}>
              <GlassPanel className="p-8 bg-[#FAFAF8] border-slate-100 flex flex-col justify-between h-full group hover:bg-white hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all duration-300">
                    <AlertTriangle size={22} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">02. Level-Specific Gap Analysis</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      Identification of core security vulnerabilities mapping exact loopholes in customer verification OTPs, employee offboarding lag, and device trust controls.
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.15}>
              <GlassPanel className="p-8 bg-[#FAFAF8] border-slate-100 flex flex-col justify-between h-full group hover:bg-white hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                    <Sparkles size={22} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">03. Recommended Ondi Services</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      A tailored alignment matching your specific challenges to our PaaS primitives (Authoritative Registry KYB APIs, Biometric Liveness MFA, Passwordless Directory SSO).
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.2}>
              <GlassPanel className="p-8 bg-[#FAFAF8] border-slate-100 flex flex-col justify-between h-full group hover:bg-white hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                    <Compass size={22} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">04. Transformation Roadmap</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      A step-by-step checklist of immediate and secondary actions for maximum fraud reduction, zero onboarding drops, and full regional regulatory compliance.
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.25}>
              <GlassPanel className="p-8 bg-[#FAFAF8] border-slate-100 flex flex-col justify-between h-full group hover:bg-white hover:scale-[1.01] hover:shadow-lg transition-all duration-300">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                    <Calendar size={22} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase font-mono tracking-tight">05. Consultative Strategy Session</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      An exclusive invitation to walk through your results with a senior Ondi security architect to configure registry syncs and workspace security policies.
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.3}>
              <div
                className="relative rounded-2xl bg-gradient-to-br from-[#001633] to-[#4253D1] text-white p-8 flex flex-col justify-between h-full group transition-all duration-300 hover:scale-[1.01] shadow-xl shadow-blue-900/10 cursor-pointer"
                onClick={() => window.location.href = '/assessment/take'}
              >
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center">
                    <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold uppercase font-mono tracking-tight">Ready to begin?</h3>
                    <p className="text-xs text-white/70 leading-relaxed font-normal">
                      Enter the trust ready portal and start compiling your maturity scoring instantly. No payment or credit card required.
                    </p>
                  </div>
                </div>
                <div className="pt-6">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider font-mono bg-white text-[#001633] px-5 py-2.5 rounded-full hover:bg-slate-50 transition-colors">
                    Take Identity Assessment
                  </span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── CHALLENGE SECTION ─────────────────────────────────────────── */}
      <section className="bg-[#FAFAF8] py-20 md:py-28 text-[#001633] relative overflow-hidden border-b border-slate-100">
        <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-[#4253D1]/2 blur-[100px] rounded-full pointer-events-none -translate-x-1/3 -translate-y-1/2" />

        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-12 gap-12 items-center">
          <div className="md:col-span-5 space-y-6">
            <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">The Trust Gap</span>
            <h2 className="text-2xl sm:text-3xl md:text-[2.2rem]/[1.25] font-bold text-[#001633] uppercase leading-tight">
              Everyone talks about trust. Most businesses aren&apos;t built for it.
            </h2>
            <div className="space-y-4 text-xs sm:text-sm/relaxed text-slate-600 font-normal">
              <p>
                Across East Africa, organizations face twin pressures: verify users without friction and handle personal data responsibly before legislation forces compliance. But strategy without baseline is guesswork.{' '}
                <strong className="text-[#001633]">Where do you actually stand?</strong>
              </p>
              <p>
                The Ondi assessments give you a mathematically objective diagnostic report card showing precisely where your systems leak, and the exact sequence to close every gap.
              </p>
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  icon: <Lock size={20} />,
                  title: 'Passwords only?',
                  before: 'Password reliance is a ',
                  level: 'Level 0',
                  after: ' risk. Breaches happen in minutes.',
                },
                {
                  icon: <Users size={20} />,
                  title: 'Slow onboarding?',
                  before: 'Manual KYC validation signals a ',
                  level: 'Level 1',
                  after: ' gap. Real-time registries fix this.',
                },
                {
                  icon: <Database size={20} />,
                  title: 'No consent records?',
                  before: 'Collecting data without documented consent is a ',
                  level: 'PDPA',
                  after: ' critical risk. Regulators act fast.',
                },
                {
                  icon: <Eye size={20} />,
                  title: 'No breach protocol?',
                  before: 'Operating without a breach notification process violates ',
                  level: 'PDPA Section 26',
                  after: ' requirements.',
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="ondi-conic-card bg-white rounded-2xl h-full p-[3px]"
                  style={{ boxShadow: '-1px 1px 2px 0 rgba(217,226,237,0.4), 0 10px 28px rgba(66,83,209,0.07)' }}
                >
                  <div className="ondi-conic-trace" />
                  <div className="ondi-conic-glow" />
                  <div className="group relative bg-gradient-to-b from-[#EFF1F5] to-[#ECF5FF] border-[0.5px] border-[#DDDFEB] w-full p-6 rounded-[calc(1rem-3px)] overflow-hidden h-full">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-white/80 text-[#4253D1] shadow-sm mb-3">
                      {card.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-[#001633] mb-1.5">{card.title}</h3>
                    <p className="text-[11px] sm:text-xs leading-relaxed text-slate-500">
                      {card.before}<span className="font-semibold text-[#001633]">{card.level}</span>{card.after}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DUAL CTA BANNER ───────────────────────────────────────────── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Identity CTA */}
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#001633] via-[#001633] to-[#4253D1] text-white px-8 py-12 md:px-14 md:py-14 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#4253D1]/30 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="relative space-y-3 max-w-xl">
              <span className="text-[#4E76E5] font-bold uppercase text-xs tracking-widest font-mono">Identity Trust - Free - 5 Minutes</span>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                Discover your identity maturity level today.
              </h2>
              <p className="text-white/70 text-sm leading-relaxed">
                Get a trust score, gap analysis, and step-by-step roadmap - no email required to start.
              </p>
            </div>
            <div className="relative shrink-0">
              <Link
                href="/assessment/take"
                className="inline-flex items-center gap-3 px-9 py-4 bg-white text-[#001633] rounded-full font-bold text-sm tracking-wide shadow-2xl hover:bg-slate-50 transition-colors group"
              >
                <span>Start Identity Assessment</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* PDPA CTA */}
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#042d1f] via-[#073d29] to-[#0A7C5C] text-white px-8 py-12 md:px-14 md:py-14 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#0A7C5C]/40 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="relative space-y-3 max-w-xl">
              <span className="text-emerald-300 font-bold uppercase text-xs tracking-widest font-mono">PDPA Compliance - Free - 15 Minutes</span>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                Know your data protection status before a regulator does.
              </h2>
              <p className="text-white/70 text-sm leading-relaxed">
                Assess your PDPA readiness, get a compliance gap report, and a prioritised remediation plan.
              </p>
            </div>
            <div className="relative shrink-0">
              <Link
                href="/assessment/pdpa"
                className="inline-flex items-center gap-3 px-9 py-4 bg-white text-[#042d1f] rounded-full font-bold text-sm tracking-wide shadow-2xl hover:bg-emerald-50 transition-colors group"
              >
                <span>Start PDPA Assessment</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
