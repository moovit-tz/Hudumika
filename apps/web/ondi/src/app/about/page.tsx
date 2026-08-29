'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, FaceMesh } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  Globe, Target, ShieldCheck, ArrowRight,
  TrendingUp, Lock, Fingerprint, Zap, Scale,
} from 'lucide-react';

const PILLARS = [
  { icon: Fingerprint, title: 'Sovereign Identity', desc: 'Every individual and organization controls their own identity data — shared only with explicit consent, revoked instantly.' },
  { icon: Lock, title: 'Privacy by Design', desc: 'Zero-knowledge proofs and device-level biometrics ensure that verification never requires exposing raw personal data.' },
  { icon: Scale, title: 'Equal Access', desc: 'Whether you are an urban professional or a rural micro-entrepreneur, the same trust infrastructure is available to you.' },
  { icon: Globe, title: 'Pan-African Vision', desc: 'Built first for East Africa, designed to federate across every African nation as a shared, interoperable trust layer.' },
];

const IMPACTS = [
  { stat: '280K+', label: 'Verified Identities', desc: 'Individuals and organizations with active Ondi credentials across East Africa.' },
  { stat: '85%', label: 'Faster Onboarding', desc: 'Median reduction in staff and customer onboarding time across all enterprise deployments.' },
  { stat: '99%', label: 'Fraud Detection', desc: 'Ghost workers, forged credentials, and synthetic identity fraud caught before payroll or access.' },
  { stat: '< 3 min', label: 'KYB Turnaround', desc: 'Full company registry verification via live API — replacing a 3–6 week manual process.' },
  { stat: '$2.8B+', label: 'Fraud Risk Mitigated', desc: 'Estimated annual enterprise fraud exposure addressed through verified credential checks.' },
  { stat: '3 Countries', label: 'Active Markets', desc: 'Tanzania, Kenya, and Uganda — with Rwanda and Ethiopia in active expansion planning.' },
  { stat: '12+', label: 'Enterprise Partners', desc: 'Banks, fintechs, and government agencies running live identity verification on Ondi.' },
  { stat: '4.8★', label: 'Developer Satisfaction', desc: 'Average API integration rating across enterprise technical teams using our SDK.' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="relative pt-44 pb-24 px-6 overflow-hidden border-b border-[#ECEEFF]/60">
        {/* Decorative Grid and Ambient Glows */}
        <div className="absolute inset-0 -z-30 opacity-[0.03]" 
          style={{ 
            backgroundImage: 'linear-gradient(#4253D1 1px, transparent 1px), linear-gradient(90deg, #4253D1 1px, transparent 1px)',
            backgroundSize: '80px 80px'
          }} 
        />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,rgba(236,238,255,0.4)_0%,rgba(250,250,248,0)_100%)]" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#4253D1]/8 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '8s' }} />

        <div className="max-w-6xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D5D9F5] shadow-[0_4px_16px_rgba(66,83,209,0.04)] mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#4253D1] animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-[#4253D1]">Our Mission</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-4xl mx-auto"
          >
            Africa is not<br />
            <span className="text-[#4253D1] relative">
              the problem.
              <span className="absolute bottom-1 left-0 w-full h-[6px] bg-[#4253D1]/10 rounded-full" />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#556275] font-normal leading-relaxed max-w-2xl mx-auto mt-8"
          >
            Every day, millions of trustworthy individuals across East Africa are locked out of financial opportunities — not because they aren't reliable, but because there's no unified way to prove it. Ondi is the infrastructure that changes this.
          </motion.p>
        </div>
      </section>

      {/* ── THE FRICTION GAP ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white relative overflow-hidden">
        {/* Subtle Watermark and Decorative Lines */}
        <BrandWatermark opacity={0.02} size="550px" color="#4253D1" className="absolute -left-20 top-20 pointer-events-none -z-10" />
        <FaceMesh className="absolute right-10 top-10 opacity-[0.03]" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            {/* Story / Mission Narrative */}
            <div className="lg:col-span-7 space-y-10">
              <ScrollReveal y={20}>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-5 h-px bg-[#4253D1]" />
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">The Friction Gap</span>
                  </div>
                  <h2 className="text-3xl sm:text-4.5xl font-extrabold text-[#001633] uppercase tracking-tight leading-tight">Trust is fragmented.</h2>
                </div>
              </ScrollReveal>

              <ScrollReveal y={20} delay={0.08}>
                <div className="space-y-6 text-[#556275] text-base leading-relaxed font-normal">
                  <p>
                    Businesses spend weeks manually auditing credential forms that should settle in milliseconds. Users fill out the same paperwork at every institution — banks, employers, landlords, government desks — with no portable proof between them.
                  </p>
                  <p className="border-l-2 border-[#4253D1] pl-4 italic text-[#001633] font-medium">
                    Ondi bridges this gap by building a secure, decentralized identity platform where a credential verified once is trusted everywhere — across institutions, industries, and borders.
                  </p>
                </div>
              </ScrollReveal>

              <div className="space-y-6">
                {[
                  { title: 'Identity Silos', desc: 'No unified verification layer exists across Kenya, Uganda, Tanzania, and Rwanda — until now.' },
                  { title: '60% Application Drop-offs', desc: 'Most digital customers abandon paper KYC before completion. Friction halts economic growth.' },
                  { title: 'Opportunity Lockouts', desc: 'Millions denied micro-loans and employment because manual trust verification is too slow and costly.' },
                ].map(({ title, desc }, i) => (
                  <ScrollReveal key={title} y={15} delay={i * 0.08}>
                    <div className="flex gap-4 group">
                      <div className="w-8 h-8 rounded-lg bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-300">
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-[#001633] uppercase tracking-wider font-mono">{title}</h4>
                        <p className="text-xs text-[#556275] leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>

            {/* Glowing Statistics Card Dashboard */}
            <div className="lg:col-span-5 relative">
              <ScrollReveal y={20} delay={0.15}>
                <div className="absolute -inset-2 bg-gradient-to-tr from-[#4253D1]/10 to-transparent blur-xl rounded-3xl -z-10" />
                <div className="advanced-gradient-card rounded-2xl border border-slate-100 bg-white p-8">
                  <div className="advanced-gradient-card__trace" />
                  <div className="advanced-gradient-card__glow" />
                  
                  <div className="pb-6 border-b border-slate-100/60 space-y-2">
                    <span className="inline-block px-2.5 py-1 rounded bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider font-mono">
                      The Real-World Cost
                    </span>
                    <h3 className="text-lg font-bold text-[#001633] uppercase leading-snug">
                      Fragmented identity fuels fraud and limits business scaling.
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-50 mt-4">
                    {[
                      { label: 'Annual enterprise fraud losses (EAfrica)', val: '$2.8B+' },
                      { label: 'Manual KYC cost per application', val: '$14–$60' },
                      { label: 'Average background check turnaround', val: '3–6 Weeks' },
                      { label: 'Users with no verifiable digital identity', val: '380M+' },
                    ].map(({ label, val }) => (
                      <div key={label} className="py-4 flex items-center justify-between gap-6 hover:bg-[#FAFAF8]/40 px-2 rounded-lg transition-colors">
                        <p className="text-xs text-[#556275] font-normal leading-relaxed">{label}</p>
                        <p className="text-xs font-bold text-[#001633] font-mono shrink-0">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── OUR PRINCIPLES (PILLARS) ────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#001633] text-white relative overflow-hidden">
        {/* Subtle Watermark and Mesh */}
        <BrandWatermark opacity={0.03} size="700px" color="#ffffff" className="absolute -right-20 -bottom-20 pointer-events-none -z-0" />
        
        <div className="max-w-6xl mx-auto relative z-10 space-y-16">
          <ScrollReveal y={20}>
            <div className="max-w-xl space-y-4">
              <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">Our Principles</span>
              <h2 className="text-3xl sm:text-4.5xl font-extrabold uppercase leading-tight">Built on uncompromising values.</h2>
              <p className="text-sm text-white/50 leading-relaxed font-normal">
                Every architectural decision, every policy, every product feature traces back to these four pillars.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PILLARS.map(({ icon: Icon, title, desc }, i) => (
              <ScrollReveal key={title} y={20} delay={i * 0.08}>
                <div className="group advanced-gradient-card rounded-2xl bg-white/[0.03] border border-white/5 p-8 hover:bg-white/[0.05] transition-all duration-300 h-full flex flex-col justify-between">
                  <div className="advanced-gradient-card__trace" />
                  <div className="advanced-gradient-card__glow" />

                  <div className="space-y-6">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 text-white flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500 shadow-inner">
                      <Icon size={22} className="stroke-[1.75]" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">{title}</h3>
                      <p className="text-xs text-white/60 leading-relaxed font-normal">{desc}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPACTS (BY THE NUMBERS) ────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FAFAF8] border-b border-slate-100 relative overflow-hidden">
        <BrandWatermark opacity={0.015} size="600px" color="#4253D1" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none -z-0" />

        <div className="max-w-6xl mx-auto relative z-10 space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">By the Numbers</span>
              <h2 className="text-3xl sm:text-4.5xl font-extrabold text-[#001633] uppercase leading-tight">Impact, measured.</h2>
              <p className="text-xs text-[#556275] max-w-md mx-auto leading-relaxed font-normal">
                Real outcomes from live deployments across East Africa.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {IMPACTS.map(({ stat, label, desc }, i) => (
              <ScrollReveal key={label} y={20} delay={i * 0.06}>
                <div className="group advanced-gradient-card rounded-2xl bg-white border border-slate-100/80 p-8 hover:border-[#D5D9F5]/60 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 h-full flex flex-col justify-between">
                  <div className="advanced-gradient-card__trace" />
                  <div className="advanced-gradient-card__glow" />

                  <div className="space-y-4">
                    <p className="text-4xl sm:text-5xl font-extrabold text-[#001633] font-mono leading-none group-hover:text-[#4253D1] transition-colors duration-300">
                      {stat}
                    </p>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-[#001633] uppercase tracking-wider font-mono">{label}</p>
                      <p className="text-xs text-[#556275] leading-relaxed font-normal">{desc}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOCATION + PARTNERSHIP CTA ──────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F4F3EF] border-t border-[#E4E0D8]/60 relative overflow-hidden">
        <BrandWatermark opacity={0.03} size="450px" color="#4253D1" className="absolute -right-12 bottom-0 pointer-events-none -z-0" />
        
        <div className="max-w-5xl mx-auto relative z-10">
          <ScrollReveal y={16}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="space-y-3 text-center md:text-left">
                <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">Hudumika Group</span>
                <h3 className="text-2xl font-extrabold text-[#001633] uppercase">Built in Tanzania. Scaling East Africa.</h3>
                <p className="text-xs text-[#556275] max-w-sm leading-relaxed font-normal">
                  Headquartered in Dar es Salaam, with operations in Nairobi and Kampala.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto shrink-0 justify-center">
                <Link 
                  href="/register/enterprise/kyb" 
                  className="group relative overflow-hidden px-8 py-3.5 bg-[#4253D1] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono shadow-[0_12px_24px_rgba(66,83,209,0.2)] flex items-center justify-center gap-2 whitespace-nowrap transition-transform duration-300 active:scale-95"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                  <span className="relative z-10">Partner With Us</span>
                  <ArrowRight size={14} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link 
                  href="/case-studies" 
                  className="px-8 py-3.5 border border-[#D5D9F5] bg-white text-[#001633] rounded-full font-bold text-xs uppercase tracking-widest font-mono hover:bg-slate-50 transition-all flex items-center justify-center whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.02)]"
                >
                  View Case Studies
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}

