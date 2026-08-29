'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { BrandWatermark, GlassPanel } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ArrowRight, TrendingUp, Users, ShieldCheck,
  Building2, Globe, Zap, Award, CheckCircle,
} from 'lucide-react';

const CASE_STUDIES = [
  {
    tag: 'Fintech · Tanzania',
    logo: 'NALA',
    title: 'From 3 weeks to 90 seconds.',
    subtitle: 'Digital Onboarding',
    body: 'A leading Tanzanian payments provider replaced a 3-week manual KYC process with Ondi\'s registry-anchored verification. Customers now complete full identity checks in under two minutes — directly inside the app — reducing drop-off by 74% and eliminating paper document storage entirely.',
    stats: [
      { val: '74%', label: 'Drop-off Reduction' },
      { val: '90s', label: 'Avg. KYC Completion' },
      { val: '100K+', label: 'Users Migrated' },
    ],
    icon: TrendingUp,
    color: '#4253D1',
    dark: false,
  },
  {
    tag: 'Government · Kenya',
    logo: 'GOV-KE',
    title: 'Citizens verified. Services unlocked.',
    subtitle: 'Digital Public Services',
    body: 'A Kenyan county government deployed Ondi as the identity backbone for social grant disbursements. Biometric liveness checks eliminated ghost beneficiaries, reducing fraudulent payouts by 99% while cutting administrative overhead from 40 staff-days per cycle to under 4 hours.',
    stats: [
      { val: '99%', label: 'Fraud Eliminated' },
      { val: '4 hrs', label: 'vs 40 Staff-Days' },
      { val: '280K', label: 'Citizens Served' },
    ],
    icon: ShieldCheck,
    color: '#ffffff',
    dark: true,
  },
  {
    tag: 'Enterprise · Uganda',
    logo: 'DFCU',
    title: 'Zero ghost workers. Zero rework.',
    subtitle: 'Workforce Identity',
    body: 'A Ugandan financial institution with 1,200 employees deployed Ondi Workforce to overhaul their JML (Joiner/Mover/Leaver) process. Every credential is cryptographically verified at hire, and access is revoked automatically at termination — removing 12 hours of weekly IT admin load.',
    stats: [
      { val: '1,200', label: 'Staff Nodes Secured' },
      { val: '12 hrs', label: 'Weekly Admin Saved' },
      { val: '0', label: 'Identity Disputes' },
    ],
    icon: Users,
    color: '#4253D1',
    dark: false,
  },
];

const METRICS = [
  { val: '280K+', label: 'Citizens Served' },
  { val: '99%', label: 'Fraud Detection Rate' },
  { val: '85%', label: 'Faster Onboarding' },
  { val: '3 min', label: 'Avg. KYB Turnaround' },
];

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-24 px-6 overflow-hidden bg-[#FAFAF8]">
        <BrandWatermark useImage={true} opacity={0.1} className="absolute inset-0 w-full h-full -z-30 pointer-events-none" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,rgba(236,238,255,0.6)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[500px] bg-[#4253D1]/5 blur-[130px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1] mb-8"
          >
            <Award size={13} />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Case Studies</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-4xl mx-auto"
          >
            Real Outcomes.<br />
            <span className="text-[#4253D1]">Real Organizations.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-2xl mx-auto mt-6"
          >
            See how fintechs, government agencies, and enterprise teams across East Africa are using Ondi to eliminate fraud, accelerate onboarding, and build lasting digital trust.
          </motion.p>
        </div>
      </section>

      {/* ── METRICS STRIP ─────────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#001633] text-white relative overflow-hidden border-y border-white/10">
        <BrandWatermark opacity={0.04} size="600px" color="#ffffff" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {METRICS.map(({ val, label }, i) => (
              <ScrollReveal key={label} y={16} delay={i * 0.08}>
                <div className="space-y-1">
                  <p className="text-4xl font-bold font-mono text-white">{val}</p>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono">{label}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CASE STUDY CARDS ──────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="550px" color="#4253D1" className="absolute -right-16 top-32 pointer-events-none -z-0" />
        <div className="max-w-5xl mx-auto space-y-16 relative z-10">
          {CASE_STUDIES.map(({ tag, logo, title, subtitle, body, stats, icon: Icon, color, dark }, i) => (
            <ScrollReveal key={logo} y={24} delay={i * 0.08}>
              <div className={`rounded-3xl overflow-hidden border ${dark ? 'bg-[#001633] border-white/10' : 'bg-[#FAFAF8] border-slate-100'} shadow-xl shadow-slate-900/5`}>
                <div className="grid lg:grid-cols-[1.4fr_1fr]">
                  {/* Left — Content */}
                  <div className="p-10 lg:p-14 space-y-8">
                    <div className="space-y-3">
                      <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${dark ? 'text-white/40' : 'text-[#4253D1]'}`}>{tag}</span>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-white/5 text-white/60' : 'bg-[#ECEEFF] text-[#4253D1]'}`}>
                          <Icon size={18} />
                        </div>
                        <p className={`text-xs font-bold uppercase tracking-wider font-mono ${dark ? 'text-white/40' : 'text-slate-400'}`}>{subtitle}</p>
                      </div>
                    </div>

                    <h2 className={`text-2xl lg:text-3xl font-bold uppercase leading-tight ${dark ? 'text-white' : 'text-[#001633]'}`}>
                      {title}
                    </h2>
                    <p className={`text-sm leading-relaxed font-normal ${dark ? 'text-white/50' : 'text-[#4B5563]'}`}>
                      {body}
                    </p>

                    <Link
                      href="/register"
                      className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono transition-all whitespace-nowrap ${dark ? 'text-white/60 hover:text-white' : 'text-[#4253D1] hover:text-[#001633]'}`}
                    >
                      Read Full Story <ArrowRight size={13} />
                    </Link>
                  </div>

                  {/* Right — Stats */}
                  <div className={`p-10 lg:p-14 ${dark ? 'bg-white/[0.03] border-l border-white/10' : 'bg-white border-l border-slate-100'} flex flex-col justify-center`}>
                    <div className="space-y-6">
                      {stats.map(({ val, label }) => (
                        <div key={label} className={`py-5 border-b last:border-0 ${dark ? 'border-white/10' : 'border-slate-100'}`}>
                          <p className={`text-4xl font-bold font-mono ${dark ? 'text-white' : 'text-[#001633]'}`}>{val}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-widest font-mono mt-1 ${dark ? 'text-white/30' : 'text-slate-400'}`}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── BECOME A CASE STUDY ───────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#F4F3EF] border-t border-[#E4E0D8] relative overflow-hidden">
        <BrandWatermark opacity={0.04} size="500px" color="#4253D1" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-3xl mx-auto text-center space-y-8 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-5">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Your Organization</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight">
                Ready to be the next success story?
              </h2>
              <p className="text-sm text-[#4B5563] leading-relaxed max-w-xl mx-auto font-normal">
                Join forward-thinking organizations across East Africa building their identity infrastructure on Ondi.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/register/enterprise/kyb" className="relative overflow-hidden group px-10 py-4 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-xl shadow-blue-500/20 flex items-center gap-2 whitespace-nowrap">
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Register Organization</span>
                <ArrowRight size={15} className="relative z-10" />
              </Link>
              <Link href="/about" className="px-10 py-4 border border-[#D5D9F5] bg-white text-[#001633] rounded-full font-bold text-sm uppercase tracking-wider font-mono hover:bg-slate-50 transition-all whitespace-nowrap">
                Our Mission
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
