'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  UserCheck,
  CheckCircle,
  Zap,
  ArrowRight,
  ShieldAlert,
  Cpu,
  FileCheck,
  TrendingUp,
  AlertTriangle,
  Fingerprint,
  Smile,
  Frown,
  Sliders
} from 'lucide-react';

const REGISTRY_FLOWS = [
  {
    name: 'NIDA Legal Verification',
    desc: 'Instant cryptographic query matching legal citizen registry. Validates full name, age, and nationality in < 800ms.',
    badge: 'National ID'
  },
  {
    name: 'TRA Tax Compliance',
    desc: 'Binds with Tanzania Revenue Authority nodes. Automatically confirms tax status, active TIN, and business registration compliance.',
    badge: 'TIN Sync'
  },
  {
    name: 'BRELA Director Mapping',
    desc: 'Verifies active business registrations, corporate director rosters, and director eligibility directly from BRELA records.',
    badge: 'KYB Registries'
  }
];

export default function CustomerIdentityPage() {
  // Simulator State
  const [fields, setFields] = useState<number>(12);
  const [hasLiveness, setHasLiveness] = useState<boolean>(true);
  const [hasDocUpload, setHasDocUpload] = useState<boolean>(true);

  // Computations
  const completionRate = Math.max(10, Math.min(98, 98 - (fields * 2.5) - (hasDocUpload ? 18 : 0) + (hasLiveness ? 5 : 0)));
  const fraudVulnerability = Math.max(0.1, Math.min(85, (fields * 1.5) + (hasDocUpload ? 30 : 0) - (hasLiveness ? 40 : 0)));
  const onboardingTime = `${Math.ceil((fields * 0.5) + (hasDocUpload ? 5 : 0.5))} minutes`;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-24 px-6 overflow-hidden bg-[#FAFAF8]">
        <BrandWatermark useImage={true} opacity={0.1} className="absolute inset-0 w-full h-full -z-30 pointer-events-none" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,rgba(236,238,255,0.6)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#4253D1]/5 blur-[140px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1]"
          >
            <UserCheck size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Core Product Pillar</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Customer Identity<br />
            <span className="text-[#4253D1]">Without Onboarding Drops.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            Deploy frictionless, registry-bound customer verification. Connect digital registration forms directly to authoritative registries and biometric checks to eliminate fraud while doubling conversions.
          </motion.p>
        </div>
      </section>

      {/* ── INTERACTIVE FRICTION SIMULATOR ──────────────────────────────── */}
      <section className="py-24 px-6 bg-white border-y border-slate-100 relative overflow-hidden">
        <GridBackground />
        <div className="max-w-6xl mx-auto relative z-10 space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Interactive Cost Analysis</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase">The Onboarding Friction Calculator</h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto">
                Adjust the settings below to see how standard onboarding forms damage user completion and fuel identity fraud compared to a 1-click verify node.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid lg:grid-cols-12 gap-12 items-center max-w-5xl mx-auto">
            {/* Controls Column Left */}
            <div className="lg:col-span-5 space-y-8 bg-[#FAFAF8] p-8 rounded-3xl border border-slate-100 shadow-inner relative z-10">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
                <Sliders size={16} className="text-[#4253D1]" />
                <span className="text-xs font-bold text-[#001633] uppercase tracking-widest font-mono">Simulator Controls</span>
              </div>

              {/* Slider fields count */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold text-[#001633] uppercase font-mono">
                  <span>Number of Form Fields:</span>
                  <span className="text-[#4253D1] font-extrabold">{fields} Fields</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="25"
                  value={fields}
                  onChange={(e) => setFields(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-[#4253D1]"
                />
              </div>

              {/* Document upload toggles */}
              <div className="flex justify-between items-center py-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#001633] uppercase font-mono block">Require Doc Uploads</span>
                  <span className="text-[10px] text-slate-400 block font-normal">Selfies, manual passport / utility photos</span>
                </div>
                <button
                  onClick={() => setHasDocUpload(!hasDocUpload)}
                  className={`w-12 h-6 rounded-full transition-all relative ${
                    hasDocUpload ? 'bg-[#4253D1]' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-md ${
                      hasDocUpload ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Biometrics toggle */}
              <div className="flex justify-between items-center py-2 border-t border-slate-200/50 pt-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#001633] uppercase font-mono block">Biometric Liveness Match</span>
                  <span className="text-[10px] text-slate-400 block font-normal">Dynamic depth check preventing fake photo submissions</span>
                </div>
                <button
                  onClick={() => setHasLiveness(!hasLiveness)}
                  className={`w-12 h-6 rounded-full transition-all relative ${
                    hasLiveness ? 'bg-[#4253D1]' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-md ${
                      hasLiveness ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Quick set to Ondi standard */}
              <button
                onClick={() => {
                  setFields(3);
                  setHasDocUpload(false);
                  setHasLiveness(true);
                }}
                className="w-full py-3 bg-[#001633] hover:bg-[#4253D1] text-white rounded-xl font-bold text-xs uppercase tracking-widest font-mono transition-all"
              >
                Apply Ondi Best Practice (1-Click Verification)
              </button>
            </div>

            {/* Calculations Column Right */}
            <div className="lg:col-span-7">
              <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative rounded-[2rem] space-y-8 min-h-[380px] flex flex-col justify-between">
                <div className="absolute inset-0 bg-[radial-gradient(#ECEEFF_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-35 pointer-events-none" />

                <div className="relative z-10 space-y-6">
                  {/* Completion Rate Score */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold uppercase font-mono">
                      <span className="text-slate-400">Expected Form Completion:</span>
                      <span className={completionRate > 70 ? 'text-emerald-500 font-extrabold' : 'text-red-500 font-extrabold'}>
                        {completionRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${completionRate}%` }}
                        transition={{ type: 'spring', stiffness: 100 }}
                        className={`h-full rounded-full ${
                          completionRate > 70 ? 'bg-emerald-500' : completionRate > 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Fraud Vulnerability */}
                  <div className="space-y-2 border-t border-slate-100 pt-6">
                    <div className="flex justify-between text-xs font-bold uppercase font-mono">
                      <span className="text-slate-400">Identity Fraud Vulnerability:</span>
                      <span className={fraudVulnerability < 10 ? 'text-emerald-500 font-extrabold' : 'text-red-500 font-extrabold'}>
                        {fraudVulnerability.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${fraudVulnerability}%` }}
                        transition={{ type: 'spring', stiffness: 100 }}
                        className={`h-full rounded-full ${
                          fraudVulnerability < 10 ? 'bg-emerald-500' : fraudVulnerability < 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Onboarding Time */}
                  <div className="flex justify-between items-center border-t border-slate-100 pt-6 text-xs font-bold uppercase font-mono">
                    <span className="text-slate-400">Average Onboarding Time:</span>
                    <span className="text-[#001633] font-extrabold">{onboardingTime}</span>
                  </div>
                </div>

                {/* Dynamic visual emoji indicator */}
                <div className="relative z-10 p-5 bg-[#FAFAF8] border border-slate-100 rounded-2xl flex items-center gap-4">
                  {completionRate > 70 ? (
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                      <Smile size={24} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                      <Frown size={24} />
                    </div>
                  )}
                  <div className="space-y-1 text-xs">
                    <p className="font-extrabold text-[#001633] uppercase">
                      {completionRate > 70 ? 'High Conversions Secured' : 'Critical Drop-off Warning'}
                    </p>
                    <p className="text-slate-500 leading-normal font-normal">
                      {completionRate > 70
                        ? 'Frictionless fields and biometric checks ensure maximum completion with absolute fraud protection.'
                        : 'Manual document uploads and excessive fields drive users away. Ghost profiles can easily pass standard forms.'}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>
        </div>
      </section>

      {/* ── REGISTRY SYNCS ──────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Authoritative Integrations</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight">Biometric & Registry Vetting Nodes</h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                Connect your onboarding flow directly to national registry records. Instant, cryptographically bound verification that replaces manual checks.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {REGISTRY_FLOWS.map((flow, i) => (
              <ScrollReveal key={flow.name} y={24} delay={i * 0.1}>
                <div className="group p-8 bg-[#FAFAF8] border border-slate-100 rounded-3xl space-y-6 hover:border-[#D5D9F5] hover:bg-white hover:shadow-xl transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500">
                      <Cpu size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono bg-[#ECEEFF] px-3 py-1 rounded-full">
                      {flow.badge}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-[#001633] uppercase tracking-tight">{flow.name}</h3>
                    <p className="text-xs text-[#4B5563] leading-relaxed font-normal">{flow.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURE BIOMETRICS LIVENESS ───────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#001633] text-white relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal y={20} x={-20}>
              <div className="space-y-8">
                <div className="space-y-4">
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-widest font-mono">Biometric Authenticity</span>
                  <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight font-sans">Dynamic Liveness Check</h2>
                  <p className="text-base text-white/50 leading-relaxed font-normal">
                    SMS codes can be hijacked and photo uploads can be spoofed using high-resolution screens or deepfakes. Ondi integrates dynamic, passive biometric depth mapping directly inside onboarding drawers.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { title: 'Anti-Spoofing Filters', desc: 'Dynamic liveness checks immediately spot video playback, mask overlays, or digital photo recreations.' },
                    { title: 'Device Local Attestation', desc: 'Attestation keys verify that the scan payload was computed locally inside the device\'s secure enclave.' },
                    { title: 'Frictionless Check', desc: 'Settles in < 1.5 seconds. Users simply look at the screen—no weird head turns or instructions needed.' }
                  ].map(({ title, desc }) => (
                    <div key={title} className="flex gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4253D1] mt-2 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white uppercase tracking-wider font-mono">{title}</p>
                        <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal y={20} x={20}>
              <div className="relative">
                <div className="absolute inset-0 bg-[#4253D1]/10 blur-[100px] rounded-full pointer-events-none" />
                <GlassPanel className="p-8 bg-white/5 border-white/10 backdrop-blur-xl space-y-6 text-center max-w-sm mx-auto">
                  <div className="relative w-44 h-44 rounded-full border-4 border-emerald-500 mx-auto flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="absolute inset-0 bg-slate-800/50 flex items-center justify-center font-bold text-6xl">
                      👤
                    </div>
                    {/* Volumetric green scanning line passing over face */}
                    <motion.div
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      className="absolute left-0 right-0 h-1 bg-emerald-400 blur-[2px] shadow-[0_0_10px_#10B981] z-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wider text-[9px] font-mono border border-emerald-500/20 rounded-full mx-auto">
                      <CheckCircle size={10} />
                      Liveness Passed
                    </span>
                    <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Attestation Match Verified</p>
                  </div>
                </GlassPanel>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white text-center relative">
        <div className="max-w-3xl mx-auto space-y-10 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-6xl font-bold text-[#001633] uppercase leading-tight font-sans">Accelerate Your Customer Onboarding</h2>
              <p className="text-base text-slate-500 font-normal max-w-xl mx-auto leading-relaxed">
                Unlock instant digital registration with 100% fraud protection.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.1}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register/enterprise/kyb" className="w-full sm:w-auto relative overflow-hidden group px-12 py-5 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-2">
                <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Verify Organization</span>
                <ArrowRight size={16} className="relative z-10" />
              </Link>
              <Link href="/developers" className="w-full sm:w-auto px-12 py-5 border border-[#D5D9F5] text-[#001633] rounded-full font-bold text-sm uppercase tracking-wider font-mono hover:bg-slate-50 transition-all flex items-center justify-center">
                Developer API Docs
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
