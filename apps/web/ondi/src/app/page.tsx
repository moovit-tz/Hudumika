'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { OndiBrand, ShieldLogo, GlassPanel, BrandWatermark, HolographicRing } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ShieldCheck, ArrowRight, Zap, UserCheck, Building2, Award, Wallet,
  Scale, CheckCircle, TrendingUp, Key, Lock, Fingerprint, Network,
  Globe, Code2, ChevronRight, Star, Users, Activity,
} from 'lucide-react';

// ─── Brand palette ────────────────────────────────────────────────────────────
const P = {
  blue:   '#4253D1',
  accent: '#4E76E5',
  navy:   '#001633',
  mist:   '#ECEEFF',
  border: '#D5D9F5',
  bg:     '#FAFAF8',
  stone:  '#F4F3EF',
  stoneBorder: '#E4E0D8',
  text:   '#232323',
  sub:    '#4B5563',
};

// ─── Partner logos ────────────────────────────────────────────────────────────
const PARTNERS = [
  { name: 'NIDA',      src: '/logos/nida.svg' },
  { name: 'BRELA',     src: '/logos/brela.svg' },
  { name: 'TRA',       src: '/logos/tra.svg' },
  { name: 'NSSF',      src: '/logos/nssf.svg' },
  { name: 'Google Workspace', src: '/logos/g-suite.svg' },
  { name: 'Microsoft 365',    src: '/logos/m-365.svg' },
  { name: 'SAP',       src: '/logos/sap.svg' },
  { name: 'Sage',      src: '/logos/sage.svg' },
  { name: 'DigiCash',  src: '/logos/digicash.svg' },
  { name: 'Aleka',     src: '/logos/aleka.svg' },
  { name: 'OptIn',     src: '/logos/optin.svg' },
  { name: 'Hudumika',    src: '/logos/hudumika.svg' },
];

// ─── Root page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [activeSegment, setActiveSegment] = useState<'enterprise' | 'personal'>('enterprise');
  const heroRef = useRef<HTMLElement>(null);

  return (
    <div
      className="min-h-screen text-[#232323] font-sans overflow-x-hidden"
      style={{ background: P.bg, colorScheme: 'light' }}
    >
      <MainNavbar />

      {/* ═══════════════════════════════════════════════════════════════════════
          §1  HERO — clean, centered, brief
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative pt-44 pb-24 px-6 overflow-hidden text-center"
        style={{ background: P.bg }}
      >
        {/* Soft mist tint from top */}
        <div className="absolute top-0 inset-x-0 h-80 pointer-events-none -z-10"
          style={{ background: `linear-gradient(to bottom, ${P.mist}70, transparent)` }} />

        <div className="max-w-3xl mx-auto space-y-8">

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex justify-center"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.22em] font-mono"
              style={{ borderColor: P.border, background: P.mist, color: P.blue }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              East Africa's Digital Trust Network
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.65, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.04]"
            style={{ color: P.navy }}
          >
            Verify once.<br />
            <span style={{ color: P.blue }}>Access everything.</span>
          </motion.h1>

          {/* Sub — one line */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.5 }}
            className="text-lg font-normal"
            style={{ color: P.sub }}
          >
            One NIDA-verified identity for your people and your business.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.45 }}
            className="flex flex-col sm:flex-row gap-3 justify-center pt-1"
          >
            <Link href="/assessment"
              className="group relative overflow-hidden inline-flex items-center justify-center gap-2 px-9 py-4 rounded-full font-bold text-sm uppercase tracking-wider font-mono text-white shadow-lg transition-all"
              style={{ background: P.blue }}
            >
              <span className="absolute inset-0 w-0 group-hover:w-full transition-all duration-500 ease-out"
                style={{ background: P.accent }} />
              <span className="relative z-10">Get started free</span>
              <ArrowRight size={14} className="relative z-10 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-full font-bold text-sm uppercase tracking-wider font-mono border transition-all hover:bg-slate-50"
              style={{ color: P.navy, borderColor: P.stoneBorder }}
            >
              Talk to sales
            </Link>
          </motion.div>

          {/* Partner ticker */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="pt-14 border-t"
            style={{ borderColor: P.stoneBorder }}
          >
            <p className="text-[10px] font-bold tracking-[0.22em] text-slate-400 uppercase font-mono mb-6">
              Backed by the institutions that power East Africa
            </p>
            <div className="relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
                style={{ background: `linear-gradient(to right, ${P.bg}, transparent)` }} />
              <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
                style={{ background: `linear-gradient(to left, ${P.bg}, transparent)` }} />
              <div className="animate-logo-ticker items-center">
                {[...PARTNERS, ...PARTNERS].map((p, i) => (
                  <div key={`${p.name}-${i}`}
                    className="flex-shrink-0 px-6 py-1 grayscale hover:grayscale-0 opacity-40 hover:opacity-80 transition-all duration-300"
                    style={{ width: 120 }}
                  >
                    <Image src={p.src} alt={p.name} width={120} height={44}
                      className="object-contain w-full h-10" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §3  WHO IS ONDI FOR — toggle panel
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden" style={{ background: P.bg }}>
        <BrandWatermark opacity={0.025} size="560px" color={P.blue}
          className="absolute -right-20 top-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Simpler · Faster · Safer</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                Complete digital trust.<br />For work and life.
              </h2>
              <p className="text-base max-w-2xl mx-auto font-normal" style={{ color: P.sub }}>
                Whether you are securing a scaling enterprise or taking control of your personal credentials,
                Ondi provides a robust trust network that works for you.
              </p>
            </div>
          </ScrollReveal>

          {/* Segment toggle */}
          <div className="flex justify-center">
            <div className="flex p-1 rounded-full border border-slate-200 bg-white shadow-sm font-mono text-xs gap-1">
              {(['enterprise', 'personal'] as const).map((seg) => (
                <button
                  key={seg}
                  onClick={() => setActiveSegment(seg)}
                  className={`px-8 py-3 rounded-full font-bold uppercase tracking-wider transition-all duration-300 ${
                    activeSegment === seg
                      ? 'text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                  style={activeSegment === seg ? { background: P.blue } : {}}
                >
                  {seg === 'enterprise' ? 'For Organizations' : 'For Individuals'}
                </button>
              ))}
            </div>
          </div>

          {/* Segment panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSegment}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_1fr] gap-16 items-center"
            >
              {activeSegment === 'enterprise' ? (
                <>
                  <EnterprisePanel />
                  <EnterpriseMockCard />
                </>
              ) : (
                <>
                  <PersonalPanel />
                  <PersonalMockCard />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §4  TRUST SCORE — feature spotlight
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden border-y" style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            {/* Left: copy */}
            <ScrollReveal x={-24} y={0}>
              <div className="space-y-10">
                <div className="space-y-4">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>
                    The Trust Engine
                  </span>
                  <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                    Your reputation<br />is portable capital.
                  </h2>
                  <p className="text-base leading-relaxed font-normal" style={{ color: P.sub }}>
                    Ondi's Trust Score (0–850) is a dynamic, multi-signal reputation index that
                    validates your identity credibility, financial consistency, regulatory standing,
                    and career timeline — all in one verifiable passport.
                  </p>
                </div>

                <div className="space-y-5">
                  {[
                    { label: 'KYC Verification',   pct: 84, color: P.blue },
                    { label: 'NIDA Identity',       pct: 100, color: '#10B981' },
                    { label: 'Financial History',   pct: 68, color: P.accent },
                    { label: 'PDPA Compliance',     pct: 72, color: '#8B5CF6' },
                    { label: 'Auth Consistency',    pct: 91, color: P.blue },
                  ].map(({ label, pct, color }) => (
                    <ScoreSignalBar key={label} label={label} pct={pct} color={color} />
                  ))}
                </div>

                <Link href="/products/trust-score"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono hover:gap-3 transition-all"
                  style={{ color: P.blue }}
                >
                  How the Trust Score is calculated <ArrowRight size={13} />
                </Link>
              </div>
            </ScrollReveal>

            {/* Right: visual */}
            <ScrollReveal x={24} y={0}>
              <div className="relative flex items-center justify-center">
                {/* Glow backing */}
                <div className="absolute inset-0 rounded-full blur-3xl opacity-20 pointer-events-none"
                  style={{ background: P.blue, transform: 'scale(0.7)' }} />

                <div className="relative bg-white rounded-3xl border p-10 shadow-2xl shadow-blue-900/8 space-y-8 w-full max-w-sm mx-auto"
                  style={{ borderColor: P.border }}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Trust Passport</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: P.navy }}>Amina J. — Verified</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono text-emerald-600 bg-emerald-50 border border-emerald-100">
                      Active
                    </span>
                  </div>

                  {/* Ring */}
                  <div className="flex justify-center">
                    <HolographicRing score={742} max={850} label="Trust Score" color={P.blue} />
                  </div>

                  {/* Badges */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: '🪪', label: 'NIDA Verified' },
                      { icon: '🏦', label: 'BOT Compliant' },
                      { icon: '📜', label: 'BRELA Cleared' },
                      { icon: '🔐', label: 'MFA Active' },
                    ].map(({ icon, label }) => (
                      <div key={label}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold"
                        style={{ borderColor: P.border, color: P.navy, background: P.mist + '60' }}
                      >
                        <span>{icon}</span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-center text-[10px] text-slate-400 font-mono uppercase tracking-widest">
                    TIER: HIGH TRUST · TOP 12%
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §5  PRODUCT SUITE — 3 cards
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden" style={{ background: P.bg }}>
        <BrandWatermark opacity={0.025} size="560px" color={P.blue}
          className="absolute -left-16 top-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Product Suite</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                One platform. Three identity layers.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Building2,
                tag: 'Workforce',
                title: 'Enterprise Identity',
                desc: 'Secure your workforce from day one. Automate joiner-mover-leaver lifecycle, eliminate ghost workers, and provision SSO to every tool in seconds.',
                bullets: ['Automated JML provisioning', 'Ghost-worker detection', 'Zero-trust policy engine'],
                cta: 'Protect Your Organization',
                href: '/business',
                dark: true,
              },
              {
                icon: UserCheck,
                tag: 'Customer',
                title: 'Customer Identity',
                desc: 'Onboard customers in seconds with real-time NIDA + BRELA registry checks. Reduce drop-off, eliminate fraud, and stay compliant automatically.',
                bullets: ['NIDA & BRELA real-time check', 'KYC/KYB in < 60 seconds', 'Consent-gated data flows'],
                cta: 'Explore Customer Identity',
                href: '/products/customer-identity',
                dark: false,
              },
              {
                icon: Wallet,
                tag: 'Personal',
                title: 'Sovereign Wallet',
                desc: 'Your verified identity, education, and career credentials — locked in an encrypted vault. Share selectively. Control every access event.',
                bullets: ['Encrypted credential vault', 'Portable trust score (0–850)', 'One-tap opportunity access'],
                cta: 'Claim Your Wallet',
                href: '/personal',
                dark: false,
              },
            ].map(({ icon: Icon, tag, title, desc, bullets, cta, href, dark }, i) => (
              <ScrollReveal key={tag} y={30} delay={i * 0.12}>
                <div
                  className={`h-full flex flex-col p-8 group cursor-pointer transition-all duration-300 hover:scale-[1.02] rounded-[10px] border shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden ${
                    dark ? 'text-white border-transparent' : 'bg-white border-slate-100'
                  }`}
                  style={dark ? { background: `linear-gradient(145deg, ${P.navy} 0%, #163060 100%)` } : {}}
                >
                  <div className="flex-1 space-y-6">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: dark ? 'rgba(255,255,255,0.1)' : P.mist, color: dark ? 'white' : P.blue }}
                    >
                      <Icon size={22} />
                    </div>

                    {/* Tag + title */}
                    <div className="space-y-1.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.2em] font-mono"
                        style={{ color: dark ? 'rgba(255,255,255,0.4)' : P.blue }}
                      >
                        {tag}
                      </span>
                      <h3
                        className="text-xl font-bold uppercase leading-tight"
                        style={{ color: dark ? 'white' : P.navy }}
                      >
                        {title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed font-normal"
                        style={{ color: dark ? 'rgba(255,255,255,0.55)' : P.sub }}
                      >
                        {desc}
                      </p>
                    </div>

                    {/* Bullets */}
                    <ul className="space-y-2.5">
                      {bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-xs font-medium"
                          style={{ color: dark ? 'rgba(255,255,255,0.65)' : P.text }}
                        >
                          <CheckCircle size={13} className="shrink-0 mt-0.5"
                            style={{ color: dark ? '#34D399' : '#10B981' }} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link href={href}
                    className="mt-8 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider font-mono group-hover:gap-3 transition-all"
                    style={{ color: dark ? 'rgba(255,255,255,0.6)' : P.blue }}
                  >
                    {cta} <ArrowRight size={13} />
                  </Link>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §6  HOW IT WORKS — dark section
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${P.navy} 0%, #091830 100%)` }}>
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 70% 50% at 50% 50%, rgba(66,83,209,0.12), transparent)` }} />
        <BrandWatermark opacity={0.035} size="800px" color={P.accent}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-20 relative z-10">
          <ScrollReveal y={20}>
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-blue-400">The Flywheel</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-[1.08] text-white">
                Every verification<br />enriches the network.
              </h2>
              <p className="text-base text-white/50 max-w-2xl mx-auto font-normal">
                Ondi's self-reinforcing flywheel ensures that every verified claim
                and partner integration adds value to the entire ecosystem.
              </p>
            </div>
          </ScrollReveal>

          <div className="relative max-w-5xl mx-auto">
            {/* Connecting line (desktop) */}
            <div className="hidden lg:block absolute top-16 left-[16.5%] right-[16.5%] h-px border-t border-dashed border-white/15" />

            <div className="grid md:grid-cols-3 gap-12">
              {[
                {
                  num: '01',
                  icon: Fingerprint,
                  title: 'Verify Once',
                  desc: 'Establish authoritative claims validated against NIDA, BRELA, and TRA. Your identity is permanently locked in your sovereign wallet.',
                },
                {
                  num: '02',
                  icon: TrendingUp,
                  title: 'Build Reputation',
                  desc: 'As you complete verification milestones, secure job timelines, and log compliance clearings, your portable Trust Score grows.',
                },
                {
                  num: '03',
                  icon: Key,
                  title: 'Unlock Instantly',
                  desc: 'Share consent-gated credential claims with partners to immediately access loans, leases, systems, and premium remote work.',
                },
              ].map(({ num, icon: Icon, title, desc }, i) => (
                <ScrollReveal key={num} y={30} delay={i * 0.15}>
                  <div className="relative flex flex-col items-center text-center space-y-5 px-2">
                    {/* Number */}
                    <span className="text-7xl font-bold font-mono leading-none"
                      style={{ color: `rgba(66,83,209,0.2)` }}>
                      {num}
                    </span>
                    {/* Icon circle */}
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center -mt-6"
                      style={{ background: 'rgba(66,83,209,0.2)', color: '#818CF8' }}>
                      <Icon size={24} />
                    </div>
                    <h3 className="text-base font-bold uppercase tracking-wide text-white">{title}</h3>
                    <p className="text-sm text-white/45 leading-relaxed font-normal">{desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §7  CAPABILITY GRID — 6 tiles
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 border-b relative overflow-hidden"
        style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Capabilities</span>
              <h2 className="text-3xl lg:text-4xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                Enterprise-grade identity.<br />African-first design.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: ShieldCheck,
                title: 'NIDA & BRELA Integration',
                desc: 'Real-time identity and business registry verification against authoritative government data sources — no manual checks required.',
              },
              {
                icon: Key,
                title: 'Passwordless SSO',
                desc: 'Universal trust-aware single sign-on across G-Suite, Microsoft 365, SAP, Sage, and legacy ERPs — with zero-friction MFA.',
              },
              {
                icon: Fingerprint,
                title: 'Biometric KYC',
                desc: 'Liveness detection, facial matching against NIDA records, and document OCR — all in under 60 seconds via mobile or web.',
              },
              {
                icon: Lock,
                title: 'Adaptive MFA',
                desc: 'Risk-based authentication that triggers step-up verification only when behavioural signals or trust score drops demand it.',
              },
              {
                icon: Scale,
                title: 'Identity Governance',
                desc: 'Fine-grained role-based access controls, immutable audit logs, and JML automation to eliminate insider risk and compliance gaps.',
              },
              {
                icon: Network,
                title: 'Trust Score Engine',
                desc: 'Multi-signal reputational scoring: KYC tier, NIDA status, phone tenure, financial history, PDPA compliance, and AI graph signals.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <ScrollReveal key={title} y={24} delay={i * 0.07}>
                <div
                  className="p-7 bg-white rounded-2xl border hover:border-[#D5D9F5] hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-300 group space-y-4 cursor-default"
                  style={{ borderColor: P.stoneBorder }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                    style={{ background: P.mist, color: P.blue }}>
                    <Icon size={20} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: P.navy }}>{title}</h3>
                    <p className="text-xs leading-relaxed font-normal" style={{ color: P.sub }}>{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §8  INTEGRATION ECOSYSTEM
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="space-y-4 text-center max-w-3xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>
                Integration Ecosystem
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                Compliance at the root.<br />Connected everywhere.
              </h2>
              <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>
                Ondi anchors every identity in verified registry records and connects to the tools
                your organisation already uses — no custom integration work required.
              </p>
            </div>
          </ScrollReveal>

          {/* Logo grid — 2 rows */}
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {PARTNERS.map((p, i) => (
                <ScrollReveal key={p.name} y={16} delay={i * 0.05}>
                  <div
                    className="aspect-square flex items-center justify-center p-4 bg-white rounded-2xl border hover:border-[#D5D9F5] hover:shadow-md transition-all duration-300 group"
                    style={{ borderColor: P.stoneBorder }}
                  >
                    <Image src={p.src} alt={p.name} width={80} height={48}
                      className="w-full h-10 object-contain grayscale group-hover:grayscale-0 opacity-60 group-hover:opacity-100 transition-all duration-300" unoptimized />
                  </div>
                </ScrollReveal>
              ))}
            </div>

            {/* Registry call-outs */}
            <div className="mt-10 grid sm:grid-cols-4 gap-4">
              {[
                { label: 'NIDA', note: 'National ID authority — ground-truth identity' },
                { label: 'BRELA', note: 'Business registry — real-time company verification' },
                { label: 'TRA',   note: 'Tax authority — compliance standing checks' },
                { label: 'W3C',   note: 'Verifiable Credentials standard — portable globally' },
              ].map(({ label, note }) => (
                <div key={label}
                  className="p-4 rounded-xl border text-center space-y-1 hover:border-blue-200 hover:bg-blue-50/40 transition-all duration-200"
                  style={{ borderColor: P.stoneBorder }}
                >
                  <div className="text-xs font-bold uppercase tracking-wider font-mono" style={{ color: P.blue }}>{label}</div>
                  <p className="text-[10px] leading-relaxed" style={{ color: P.sub }}>{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §9  DEVELOPER SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 border-y relative overflow-hidden"
        style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
          {/* Left */}
          <ScrollReveal x={-24} y={0}>
            <div className="space-y-8">
              <div className="space-y-4">
                <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>
                  For Developers
                </span>
                <h2 className="text-3xl lg:text-4xl font-bold uppercase leading-[1.08]" style={{ color: P.navy }}>
                  Trust as a service.<br />API-first.
                </h2>
                <p className="text-base leading-relaxed font-normal" style={{ color: P.sub }}>
                  Integrate Ondi's verification, scoring, and SSO capabilities into your product
                  in minutes. SDKs for TypeScript, Python, and mobile.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { icon: Code2,   label: 'REST & GraphQL APIs',   note: 'Full OpenAPI 3.1 schema' },
                  { icon: Zap,     label: 'Webhooks',               note: 'Real-time event delivery' },
                  { icon: Globe,   label: 'OAuth 2.0 / OIDC',      note: 'Standard compliant SSO flows' },
                  { icon: Activity, label: 'Live Trust Score API',  note: 'Sub-100 ms latency' },
                ].map(({ icon: Icon, label, note }) => (
                  <div key={label} className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center border shrink-0"
                      style={{ borderColor: P.border, background: P.mist, color: P.blue }}>
                      <Icon size={15} />
                    </div>
                    <div>
                      <span className="text-sm font-bold" style={{ color: P.navy }}>{label}</span>
                      <span className="text-xs ml-2" style={{ color: P.sub }}>{note}</span>
                    </div>
                  </div>
                ))}
              </div>

              <Link href="/developers"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-wider font-mono text-white shadow-lg transition-all hover:opacity-90"
                style={{ background: P.blue }}
              >
                Read the Docs <ArrowRight size={13} />
              </Link>
            </div>
          </ScrollReveal>

          {/* Right: code preview */}
          <ScrollReveal x={24} y={0}>
            <div
              className="rounded-2xl border overflow-hidden shadow-2xl shadow-blue-900/10"
              style={{ background: '#0D1117', borderColor: '#21262D' }}
            >
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b" style={{ borderColor: '#21262D' }}>
                {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                  <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
                ))}
                <span className="ml-3 text-[11px] text-white/25 font-mono">ondi-trust.ts</span>
              </div>

              {/* Code */}
              <pre className="p-6 text-[12.5px] leading-[1.75] overflow-x-auto font-mono">
                <code>
                  <span style={{ color: '#6E7681' }}>{`// Verify identity & get Trust Score\n`}</span>
                  <span style={{ color: '#FF7B72' }}>import </span>
                  <span style={{ color: '#79C0FF' }}>{'{ OndiClient }'}</span>
                  <span style={{ color: '#FF7B72' }}> from </span>
                  <span style={{ color: '#A5D6FF' }}>'@ondi/sdk'</span>
                  <span style={{ color: '#C9D1D9' }}>;</span>
                  <span>{'\n\n'}</span>
                  <span style={{ color: '#79C0FF' }}>const</span>
                  <span style={{ color: '#C9D1D9' }}> ondi </span>
                  <span style={{ color: '#FF7B72' }}>= new </span>
                  <span style={{ color: '#7EE787' }}>OndiClient</span>
                  <span style={{ color: '#C9D1D9' }}>({'{'}</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#C9D1D9' }}>  apiKey: </span>
                  <span style={{ color: '#A5D6FF' }}>process.env.ONDI_API_KEY</span>
                  <span style={{ color: '#C9D1D9' }}>,</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#C9D1D9' }}>{'}'});\n'</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#6E7681' }}>{`// KYC + Trust Score in one call\n`}</span>
                  <span style={{ color: '#79C0FF' }}>const</span>
                  <span style={{ color: '#C9D1D9' }}> result </span>
                  <span style={{ color: '#FF7B72' }}>= await </span>
                  <span style={{ color: '#C9D1D9' }}>ondi.identity.</span>
                  <span style={{ color: '#7EE787' }}>verify</span>
                  <span style={{ color: '#C9D1D9' }}>({'{'}</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#C9D1D9' }}>  nidaNumber: </span>
                  <span style={{ color: '#A5D6FF' }}>'19920512-12345-00001-6'</span>
                  <span style={{ color: '#C9D1D9' }}>,</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#C9D1D9' }}>  phone:      </span>
                  <span style={{ color: '#A5D6FF' }}>'+255 712 000 000'</span>
                  <span style={{ color: '#C9D1D9' }}>,</span>
                  <span>{'\n'}</span>
                  <span style={{ color: '#C9D1D9' }}>{'});\n\n'}</span>
                  <span style={{ color: '#6E7681' }}>{`// → { verified: true, trustScore: 742, tier: 'HIGH' }\n`}</span>
                  <span style={{ color: '#C9D1D9' }}>console.</span>
                  <span style={{ color: '#7EE787' }}>log</span>
                  <span style={{ color: '#C9D1D9' }}>(result.trustScore); </span>
                  <span style={{ color: '#6E7681' }}>// 742</span>
                </code>
              </pre>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §10 SOCIAL PROOF — testimonials
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-32 px-6 relative overflow-hidden" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>
                Customer Stories
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold uppercase" style={{ color: P.navy }}>
                Trusted by East Africa's builders.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: '"We cut employee onboarding from 5 days to under 4 hours. Ghost workers disappeared from payroll overnight."',
                name: 'Josephine M.',
                role: 'Chief People Officer, TanzaTech',
                stars: 5,
              },
              {
                quote: '"Our loan approval rate jumped 34% because applicants could share their verified trust score directly. No more fraudulent documents."',
                name: 'David K.',
                role: 'CTO, Inua SACCO',
                stars: 5,
              },
              {
                quote: '"As a freelancer, having a verified Ondi Trust Score opened remote contracts I could never access before. It is my digital CV."',
                name: 'Amina J.',
                role: 'Senior Developer, Remote-First',
                stars: 5,
              },
            ].map(({ quote, name, role, stars }, i) => (
              <ScrollReveal key={name} y={24} delay={i * 0.1}>
                <GlassPanel className="p-7 bg-white border-slate-100 h-full flex flex-col justify-between space-y-6" hover={true}>
                  <div className="space-y-4">
                    <div className="flex gap-1">
                      {Array.from({ length: stars }).map((_, j) => (
                        <Star key={j} size={13} className="fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed italic" style={{ color: P.sub }}>{quote}</p>
                  </div>
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: P.blue }}>
                      {name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: P.navy }}>{name}</p>
                      <p className="text-[10px]" style={{ color: P.sub }}>{role}</p>
                    </div>
                  </div>
                </GlassPanel>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          §11 FINAL CTA — full-width dark
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-40 px-6 overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${P.navy} 0%, #0C1E40 60%, #112558 100%)` }}>
        {/* Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-15 pointer-events-none blur-3xl"
          style={{ background: P.blue }} />
        <BrandWatermark opacity={0.06} size="700px" color={P.accent}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center gap-10">
          {/* Large icon */}
          <motion.div
            suppressHydrationWarning
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
          >
            <ShieldLogo size={72} variant="white" />
          </motion.div>

          <ScrollReveal y={20}>
            <div className="space-y-6">
              <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold uppercase leading-[1.0] text-white tracking-tight">
                One identity.<br />
                <span style={{ color: P.accent }}>Every door.</span>
              </h2>
              <p className="text-lg text-white/50 max-w-xl mx-auto font-normal leading-relaxed">
                Join the trust network being built for East Africa.
                Start free. Verify once. Unlock everything.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.15}>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/assessment"
                className="group relative overflow-hidden inline-flex items-center justify-center gap-2 px-12 py-5 rounded-full font-bold text-sm uppercase tracking-wider font-mono text-white shadow-2xl shadow-blue-900/40 transition-all"
                style={{ background: P.blue }}
              >
                <span className="absolute inset-0 w-0 group-hover:w-full transition-all duration-500 ease-out"
                  style={{ background: P.accent }} />
                <span className="relative z-10">Get Started — It's Free</span>
                <ArrowRight size={15} className="relative z-10 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/contact"
                className="inline-flex items-center justify-center gap-2 px-12 py-5 rounded-full font-bold text-sm uppercase tracking-wider font-mono text-white border border-white/20 hover:bg-white/8 hover:border-white/35 transition-all"
              >
                Talk to sales
              </Link>
            </div>
          </ScrollReveal>

          <p className="text-[11px] text-white/25 font-mono">
            No credit card required · NIDA-verified onboarding · Tanzania & Kenya
          </p>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}

// ─── ANIMATED SCORE SIGNAL BAR ────────────────────────────────────────────────
function ScoreSignalBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="space-y-1.5">
      <div className="flex justify-between text-xs font-mono">
        <span style={{ color: P.sub }}>{label}</span>
        <span className="font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: inView ? `${pct}%` : 0 }}
          transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: 0.1 }}
        />
      </div>
    </div>
  );
}

// ─── ENTERPRISE SEGMENT PANEL ────────────────────────────────────────────────
function EnterprisePanel() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Enterprise-Grade Security</span>
        <h3 className="text-3xl font-bold uppercase leading-tight" style={{ color: P.navy }}>
          Protect your organization.<br />Delight your employees.
        </h3>
        <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>
          Legacy identity checks are broken. Ondi Workforce turns employee credentials into verifiable,
          fraud-proof digital assets — giving security teams absolute certainty while offering workers
          frictionless passwordless authentication.
        </p>
      </div>
      <div className="space-y-4">
        <ValueBullet icon={ShieldCheck} title="Comprehensive JML Lifecycle"
          desc="Automate onboarding, role transitions, and strict offboarding. Provision and revoke access to G-Suite, Slack, and ERP tools with zero lag." />
        <ValueBullet icon={Zap} title="Trust-Aware Adaptive Access"
          desc="Configure SSO with dynamic MFA triggers. Gate sensitive permissions based on the employee's active Trust Score." />
        <ValueBullet icon={Scale} title="Instant KYB & Compliance"
          desc="Onboard suppliers and contractors securely. Conduct TRA, BRELA, and NIDA checks in real-time — no manual paperwork." />
      </div>
      <Link href="/assessment"
        className="inline-flex items-center gap-2 px-10 py-4 rounded-full font-bold text-xs uppercase tracking-wider font-mono text-white shadow-lg transition-all hover:opacity-90"
        style={{ background: P.blue }}
      >
        Start Enterprise Assessment <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ─── ENTERPRISE MOCK CARD ────────────────────────────────────────────────────
function EnterpriseMockCard() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: P.blue }} />
      <GlassPanel className="p-8 bg-white border-slate-100 shadow-xl space-y-6" hover={false}>
        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: P.mist, color: P.blue }}>
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: P.navy }}>Enterprise Portal</p>
              <p className="text-[10px] text-slate-400 font-mono">STATUS: HIGHLY ACTIVE</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono whitespace-nowrap">
            Zero Fraud Alert
          </span>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Active Staff Nodes',       value: '842 Verified',      status: 'Synced' },
            { label: 'Provisioned Apps',          value: '14 Connected',      status: 'Healthy' },
            { label: 'Identity Disputes',         value: '0 Flagged',         status: 'Clean' },
            { label: 'Audit Trail',               value: '100% Immutable',    status: 'Secure' },
          ].map(({ label, value, status }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-none">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase font-mono">{label}</p>
                <p className="text-xs font-bold mt-0.5" style={{ color: P.navy }}>{value}</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold uppercase font-mono">{status}</span>
            </div>
          ))}
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-[11px] text-slate-500 leading-relaxed">
          ⚡ <strong>System Assert:</strong> Ghost worker detection active. AccessOS SSO policies verified.
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── PERSONAL SEGMENT PANEL ──────────────────────────────────────────────────
function PersonalPanel() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Portable Digital Capital</span>
        <h3 className="text-3xl font-bold uppercase leading-tight" style={{ color: P.navy }}>
          Own your identity.<br />Unlock your future.
        </h3>
        <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>
          Stop repeating manual paperwork for every bank, landlord, or employer. Ondi gives you a
          secure digital wallet that holds cryptographically verified proofs of your identity,
          education, and career.
        </p>
      </div>
      <div className="space-y-4">
        <ValueBullet icon={Wallet} title="Sovereign Credential Vault"
          desc="Store your NIDA ID, university degrees, and professional certifications in an encrypted vault. You retain ultimate control over who sees your data." />
        <ValueBullet icon={TrendingUp} title="Evolving Trust Score"
          desc="Build a portable reputation ranking (0–850) that validates your identity credibility, professional timeline, financial consistency, and regulatory standing." />
        <ValueBullet icon={Award} title="Direct Opportunity Passport"
          desc="Unlock instant benefits. High-trust scores automatically grant fast-track micro-loans, premium remote careers, rentals, and exclusive partner programs." />
      </div>
      <Link href="/register"
        className="inline-flex items-center gap-2 px-10 py-4 rounded-full font-bold text-xs uppercase tracking-wider font-mono text-white shadow-lg transition-all hover:opacity-90"
        style={{ background: P.blue }}
      >
        Claim Your Sovereign Wallet <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ─── PERSONAL MOCK CARD ──────────────────────────────────────────────────────
function PersonalMockCard() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: P.blue }} />
      <GlassPanel className="p-8 bg-white border-slate-100 shadow-xl space-y-6" hover={false}>
        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: P.mist, color: P.blue }}>
              <UserCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: P.navy }}>Identity Wallet</p>
              <p className="text-[10px] text-slate-400 font-mono">USER CONTROLLED</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono">
            Verified Sovereign
          </span>
        </div>
        <div className="flex justify-center">
          <HolographicRing score={720} max={850} label="Trust Score" color={P.blue} />
        </div>
        <div className="space-y-2">
          {[
            { label: 'NIDA Verification',    value: 'Passed' },
            { label: 'Education Credentials', value: '2 Verified' },
            { label: 'Career History',        value: 'Active' },
            { label: 'PDPA Consent Log',      value: '14 Events' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-[11px] font-mono border-b border-slate-50 py-1.5 last:border-none">
              <span className="text-slate-400">{label}</span>
              <span className="font-bold" style={{ color: '#10B981' }}>{value}</span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

// ─── BULLET POINT ─────────────────────────────────────────────────────────────
function ValueBullet({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 shadow-sm"
        style={{ borderColor: P.border, background: 'white', color: P.blue }}>
        <Icon size={15} />
      </div>
      <div className="space-y-0.5">
        <h4 className="text-sm font-bold uppercase leading-none" style={{ color: P.navy }}>{title}</h4>
        <p className="text-xs leading-relaxed font-normal" style={{ color: P.sub }}>{desc}</p>
      </div>
    </div>
  );
}
