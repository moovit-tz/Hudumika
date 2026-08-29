'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, HolographicRing } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  ArrowRight,
  ShieldCheck,
  Wallet,
  TrendingUp,
  Award,
  CheckCircle,
  Lock,
  Fingerprint,
  Zap,
} from 'lucide-react';

export default function PersonalPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-32 px-6 overflow-hidden bg-[#FAFAF8]">
        <BrandWatermark useImage={true} opacity={0.11} className="absolute inset-0 w-full h-full -z-30 pointer-events-none" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,rgba(236,238,255,0.65)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[700px] h-[500px] bg-[#4253D1]/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl space-y-8">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1]"
            >
              <Fingerprint size={13} />
              <span className="text-xs font-bold uppercase tracking-widest font-mono">For Individuals</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase"
            >
              Your Identity.<br />
              <span className="text-[#4253D1]">Your Capital.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-2xl"
            >
              Build a portable digital identity that grows with you. Prove your trustworthiness instantly to banks, employers, and services — without the paperwork marathon.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 pt-2"
            >
              <Link href="/register/personal/kyc" className="relative overflow-hidden group px-10 py-4 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-xl shadow-blue-500/20 flex items-center gap-2 whitespace-nowrap w-fit">
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Create Your Ondi</span>
                <ArrowRight size={15} className="relative z-10" />
              </Link>
              <Link href="/login" className="px-10 py-4 bg-white border border-[#D5D9F5] text-[#001633] rounded-full font-bold text-sm uppercase tracking-wider font-mono hover:bg-slate-50 transition-all whitespace-nowrap w-fit">
                Sign In
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 3 PILLARS ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-white border-y border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.035} size="600px" color="#4253D1" className="absolute -right-20 top-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3 mb-20">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">What You Get</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Three tools. One identity.</h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Wallet, delay: 0.05, label: '01', title: 'Sovereign Wallet', desc: 'Store your NIDA ID, university degrees, and professional certifications in an encrypted vault. You decide exactly who sees what, and when.' },
              { icon: TrendingUp, delay: 0.15, label: '02', title: 'Trust Score', desc: 'A portable reputation ranking (0–850) computed from identity authenticity, financial history, behavioural signals, and compliance standing.' },
              { icon: Award, delay: 0.25, label: '03', title: 'Opportunity Passport', desc: 'High-trust scores unlock instant micro-loans, premium remote careers, rental applications, and exclusive partner benefits automatically.' },
            ].map(({ icon: Icon, delay, label, title, desc }) => (
              <ScrollReveal key={title} y={24} delay={delay}>
                <div className="group p-8 bg-[#FAFAF8] border border-slate-100 rounded-2xl space-y-6 hover:border-[#D5D9F5] hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500">
                      <Icon size={22} />
                    </div>
                    <span className="text-3xl font-bold text-[#4253D1]/15 font-mono">{label}</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-[#001633] uppercase tracking-tight">{title}</h3>
                    <p className="text-sm text-[#4B5563] leading-relaxed font-normal">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST SCORE DEEP DIVE ─────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-[#001633] text-white relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <BrandWatermark opacity={0.05} size="650px" color="#ffffff" className="absolute -right-24 -bottom-24 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <ScrollReveal y={20} x={-20}>
              <div className="space-y-10">
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">The Reputation Engine</span>
                  <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight">Beyond a credit score.</h2>
                  <p className="text-base text-white/50 leading-relaxed font-normal">
                    Ondi computes a real-time trust rating from multi-dimensional signals that grow with every life achievement.
                  </p>
                </div>

                <div className="space-y-6">
                  {[
                    { title: 'Identity Authenticity', pct: 25, val: 95, color: 'from-[#4253D1] to-[#4E76E5]' },
                    { title: 'Financial Signals', pct: 35, val: 78, color: 'from-[#10B981] to-[#059669]' },
                    { title: 'Behavioural Signals', pct: 25, val: 82, color: 'from-[#3B82F6] to-[#2563EB]' },
                    { title: 'Compliance Standing', pct: 15, val: 91, color: 'from-[#F59E0B] to-[#D97706]' },
                  ].map(({ title, pct, val, color }) => (
                    <div key={title} className="space-y-3 p-4 bg-white/3 backdrop-blur-sm rounded-xl border border-white/5 transition-all duration-300 hover:border-white/10 hover:bg-white/5">
                      <div className="flex justify-between text-xs font-mono font-bold uppercase tracking-wider">
                        <span className="text-white/80">{title}</span>
                        <span className="text-white/40">{pct}% weight · <span className="text-[#4E76E5] font-extrabold">{val}%</span></span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full relative overflow-hidden border border-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${val}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.8, ease: [0.25, 1, 0.5, 1] }}
                          className={`h-full bg-gradient-to-r ${color} rounded-full relative`}
                        >
                          {/* Volumetric scanning pulse inside the bar */}
                          <div className="absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-r from-transparent to-white/30 blur-[2px] animate-pulse" />
                        </motion.div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal y={20} x={20}>
              <div className="relative">
                <div className="absolute inset-0 bg-[#4253D1]/10 blur-[100px] rounded-full pointer-events-none" />
                <GlassPanel className="p-12 bg-white/5 border-white/10 backdrop-blur-xl space-y-8">
                  <div className="flex flex-col items-center gap-6">
                    <HolographicRing score={720} max={850} label="Trust Score" color="#4E76E5" dark={true} />
                    <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest text-center">Live Score · Updated in Real-Time</p>
                  </div>
                  <div className="space-y-3 border-t border-white/10 pt-6">
                    {[
                      { label: 'NIDA Verified', val: 'Passed' },
                      { label: 'Education Records', val: '2 Verified' },
                      { label: 'Employment History', val: 'Active' },
                      { label: 'Financial Standing', val: 'Strong' },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between text-[11px] font-mono py-1 border-b border-white/5 last:border-0">
                        <span className="text-white/40">{label}</span>
                        <span className="text-emerald-400 font-bold">{val}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-[#F4F3EF] border-y border-[#E4E0D8] relative overflow-hidden">
        <BrandWatermark opacity={0.04} size="650px" color="#4253D1" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Simple by Design</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">How it works</h2>
            </div>
          </ScrollReveal>

          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
            {[
              { num: '01', icon: Fingerprint, title: 'Verify Once', desc: 'Complete a one-time KYC check — document scan + liveness — against official registries. Takes under 3 minutes.' },
              { num: '02', icon: TrendingUp, title: 'Build Reputation', desc: 'Your trust score grows automatically as you log verified employment, education milestones, and financial activity.' },
              { num: '03', icon: Zap, title: 'Unlock Instantly', desc: 'Share consent-gated credential proofs with banks, employers, and landlords. No repeat paperwork, ever.' },
            ].map(({ num, icon: Icon, title, desc }, i) => (
              <ScrollReveal key={num} y={20} delay={i * 0.1}>
                <div className="bg-white border border-slate-100 rounded-2xl p-8 space-y-5 hover:border-[#D5D9F5] hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-300">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-[#4253D1]/20 font-mono">{num}</span>
                    <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                      <Icon size={18} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#001633] uppercase tracking-tight">{title}</h3>
                    <p className="text-xs text-[#4B5563] leading-relaxed">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── REGISTRY TRUST STRIP ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#F4F3EF] border-b border-[#E4E0D8] relative overflow-hidden">
        <BrandWatermark opacity={0.04} size="500px" color="#4253D1" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />
        <div className="max-w-7xl mx-auto relative z-10">
          <ScrollReveal y={16}>
            <div className="text-center space-y-3 mb-4">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Anchored in Official Records</span>
              <h3 className="text-2xl lg:text-3xl font-bold text-[#001633] uppercase">Verified by the authorities that matter</h3>
              <p className="text-sm text-[#4B5563] max-w-2xl mx-auto">Ondi is cryptographically bound to government registries and industry leaders — zero third-party papers required.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-16">
              {[
                {
                  name: 'NIDA',
                  logo: '/logos/nida.svg',
                  badge: 'National Identification',
                  title: 'Sovereign Citizen Registry',
                  desc: 'Direct real-time cryptographic binding to NIDA to verify legal names, citizenship status, birth registry records, and biometric validity without third-party delay.',
                },
                {
                  name: 'TRA',
                  logo: '/logos/tra.svg',
                  badge: 'Tax Authority',
                  title: 'Verified Financial Status',
                  desc: 'Securely binds to the Tanzania Revenue Authority records to instantly check and verify active TIN status, tax clearance certificates, and formal income compliance.',
                },
                {
                  name: 'BRELA',
                  logo: '/logos/brela.svg',
                  badge: 'Business Registry',
                  title: 'Director & Corporate Mapping',
                  desc: 'Verifies active business registrations, corporate director rosters, UBO status, and enterprise ownership files directly from BRELA records.',
                },
              ].map(({ name, logo, badge, title, desc }) => (
                <div 
                  key={name} 
                  className="group relative bg-white/60 backdrop-blur-md border border-[#E4E0D8] rounded-2xl p-8 transition-all duration-300 hover:border-[#4253D1]/45 hover:shadow-2xl hover:shadow-slate-200/50 hover:scale-[1.02]"
                >
                  <div className="h-16 flex items-center justify-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={logo} 
                      alt={`${name} Logo`} 
                      className="max-h-full max-w-[140px] object-contain opacity-40 grayscale group-hover:opacity-95 group-hover:grayscale group-hover:scale-105 transition-all duration-300 mix-blend-multiply" 
                    />
                  </div>
                  <div className="border-t border-[#E4E0D8]/40 pt-6">
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono block">
                      {badge}
                    </span>
                    <h4 className="text-base font-bold text-[#001633] uppercase mt-2">
                      {title}
                    </h4>
                    <p className="text-xs text-[#4B5563] leading-relaxed mt-2">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── TRUST ASSURANCES ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF8]">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal y={16}>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { icon: Lock, title: 'You Own Your Data', desc: 'Selective disclosure — you choose exactly which credentials to share, with whom, and for how long.' },
                { icon: ShieldCheck, title: 'Zero-Knowledge Proofs', desc: 'Verify attributes without revealing raw personal data. Our cryptographic guarantees protect your privacy.' },
                { icon: Fingerprint, title: 'Biometric Secured', desc: 'Device-level biometric binding ensures only you can authorize credential sharing from your wallet.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4 p-6 bg-white border border-slate-100 rounded-xl">
                  <div className="w-9 h-9 rounded-lg bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#001633] uppercase tracking-tight">{title}</p>
                    <p className="text-xs text-[#4B5563] leading-relaxed">{desc}</p>
                  </div>
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
