'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import { PRODUCTS_DATA } from '@/data/menuPagesData';
import {
  Key,
  ShieldCheck,
  Laptop,
  Lock,
  Award,
  Database,
  Scale,
  Zap,
  CheckCircle,
  Cpu,
  ArrowRight,
  TrendingUp,
  Server
} from 'lucide-react';

const IconMap: Record<string, any> = {
  Key,
  ShieldCheck,
  Laptop,
  Lock,
  Award,
  Database,
  Scale,
  Zap,
  CheckCircle,
  Cpu,
  TrendingUp,
  Server
};

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { slug } = use(params);
  const config = PRODUCTS_DATA[slug];

  // If slug is invalid, redirect to business page
  useEffect(() => {
    if (!config) {
      router.push('/business');
    }
  }, [config, router]);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="w-10 h-10 rounded-full border-4 border-[#ECEEFF] border-t-[#4253D1] animate-spin" />
      </div>
    );
  }

  const IconComponent = IconMap[config.iconName] || ShieldCheck;

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
            <IconComponent size={13} />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">{config.category}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto"
          >
            {config.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            {config.tagline}
          </motion.p>
        </div>
      </section>

      {/* ── METRICS STRIP ────────────────────────────────────────────────── */}
      <section className="py-12 bg-white border-y border-slate-100 relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid sm:grid-cols-3 gap-8 justify-center items-center divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {config.stats.map((stat, i) => (
              <div key={i} className="text-center sm:first:pl-0 sm:pl-8 space-y-1 py-4 sm:py-0">
                <span className="text-3xl sm:text-4xl font-bold text-[#001633] font-mono block">
                  {stat.value}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CORE DETAILS & SPECS ────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-start">
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-12">
              <ScrollReveal y={20}>
                <div className="space-y-6">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Overview</span>
                  <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight">Secure, High-Performance Integration</h2>
                  <div className="space-y-4 text-sm text-[#4B5563] leading-relaxed font-normal">
                    {config.detailedParagraphs.map((para, idx) => (
                      <p key={idx}>{para}</p>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Dynamic Benefits grid */}
              <div className="space-y-8">
                <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono block border-b border-slate-200/60 pb-2">
                  Key Capabilities
                </span>
                <div className="grid sm:grid-cols-3 gap-6">
                  {config.benefits.map((benefit, idx) => (
                    <div key={idx} className="space-y-3 p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <div className="w-8 h-8 rounded-lg bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                        <CheckCircle size={15} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-[#001633] uppercase">
                          {benefit.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                          {benefit.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Tech Specs Column */}
            <div className="lg:col-span-5 space-y-8">
              <ScrollReveal y={20} x={20}>
                <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative rounded-[2rem] space-y-8">
                  <div className="space-y-2 border-b border-slate-100 pb-4">
                    <span className="text-[9px] font-bold tracking-widest text-[#4253D1] uppercase font-mono block">
                      Security & Architecture
                    </span>
                    <h3 className="text-lg font-bold text-[#001633] uppercase">Technical Specifications</h3>
                  </div>

                  {/* Tech Specs List */}
                  <div className="space-y-4">
                    {config.techSpecs.map((spec, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide font-mono">
                          {spec.label}
                        </span>
                        <span className="text-xs font-bold text-[#001633] font-mono text-right pl-4">
                          {spec.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Real World Use Case */}
                  <div className="p-5 bg-[#FAFAF8] border border-slate-100 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-[#4253D1]" />
                      <span className="text-[9px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">
                        Regional Use Case
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-[#001633] font-mono uppercase">
                        {config.useCase.organization}
                      </p>
                      <p className="text-[11px] text-[#4B5563] leading-relaxed">
                        <span className="font-semibold text-[#001633]">Challenge: </span>
                        {config.useCase.challenge}
                      </p>
                      <p className="text-[11px] text-[#4B5563] leading-relaxed">
                        <span className="font-semibold text-[#4253D1]">Outcome: </span>
                        {config.useCase.outcome}
                      </p>
                    </div>
                  </div>
                </GlassPanel>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── DYNAMIC CTA SECTION ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#001633] text-white text-center relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <div className="max-w-3xl mx-auto space-y-10 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-4">
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight font-sans">Deploy Cryptographic Trust</h2>
              <p className="text-sm text-white/50 leading-relaxed font-normal max-w-xl mx-auto">
                Connect your platforms to East Africa's most secure digital identity infrastructure in minutes.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.1}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register/enterprise/kyb" className="w-full sm:w-auto relative overflow-hidden group px-12 py-5 bg-[#4253D1] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-2">
                <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Register Organization</span>
                <ArrowRight size={14} className="relative z-10" />
              </Link>
              <Link href="/developers" className="w-full sm:w-auto px-12 py-5 border border-white/20 bg-white/5 text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono hover:bg-white/10 transition-all flex items-center justify-center">
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
