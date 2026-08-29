'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  BookOpen,
  Search,
  Filter,
  CheckCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Building2,
  FileText
} from 'lucide-react';

const RESOURCES = [
  {
    category: 'Case Studies',
    title: 'How NMB Bank Consolidated Onboarding Vetting With Ondi Nodes',
    desc: 'An in-depth review of NMB Bank\'s deployment of NIDA and TRA direct verification nodes, slashing onboarding times to under 3 minutes and eliminating NPL risks.',
    time: '8 min read',
    tags: ['Banking', 'KYC', 'TRA', 'NIDA']
  },
  {
    category: 'Whitepapers',
    title: 'Data Sovereignty & The Tanzania Personal Data Protection Act 2022',
    desc: 'A comprehensive technical and legal guide for enterprise compliance officers detailing how zero-knowledge proofs align perfectly with localized custody laws.',
    time: '12 min read',
    tags: ['PDPA 2022', 'Compliance', 'ZKP']
  },
  {
    category: 'Trust Guides',
    title: 'Demystifying Zero-Knowledge Cryptography In Digital Wallets',
    desc: 'A developer-centric explainer detailing how Bulletproofs and zk-SNARKs allow selective disclosure of age or identity credentials locally.',
    time: '6 min read',
    tags: ['ZKP', 'FIDO2', 'Developer']
  },
  {
    category: 'Case Studies',
    title: 'Hudumika East Africa: Biometric Driver Vetting In Logistics Networks',
    desc: 'How one of the region\'s fastest-growing logistics portals integrated mandatory biometrics and Secure Enclaves to eliminate courier identity fraud.',
    time: '5 min read',
    tags: ['Logistics', 'Biometrics', 'SecOps']
  },
  {
    category: 'Whitepapers',
    title: 'The Reputation Capital of Africa: Portable Trust Scores Explained',
    desc: 'Exploring how thin-file farmers and micro-entrepreneurs can secure business credit lines based on behavioral trust indicators instead of physical collateral.',
    time: '15 min read',
    tags: ['Credit', 'Trust Score', 'SACCOs']
  },
  {
    category: 'Trust Guides',
    title: 'Phishing-Resistant MFA: Deploying FIDO2 & Secure Enclaves Natively',
    desc: 'Step-by-step walkthrough explaining why SMS OTPs fail security audits and how to route authentication through native device TPM passkeys.',
    time: '7 min read',
    tags: ['MFA', 'FIDO2', 'WebAuthn']
  }
];

export default function ResourceCenterPage() {
  const [activeTab, setActiveTab] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filtering logic
  const filteredResources = RESOURCES.filter((res) => {
    const matchesTab = activeTab === 'All' || res.category === activeTab;
    const matchesSearch =
      res.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-20 px-6 overflow-hidden bg-[#FAFAF8]">
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
            <BookOpen size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Resource Center</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Guides, insights,<br />
            <span className="text-[#4253D1]">And trust technology.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            Stay ahead of cybersecurity standards, regulatory data laws, and enterprise digital identity architecture across East Africa.
          </motion.p>
        </div>
      </section>

      {/* ── FILTER & SEARCH PANEL ───────────────────────────────────────── */}
      <section className="py-8 bg-white border-y border-slate-100 relative">
        <GridBackground />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 justify-center">
              {['All', 'Case Studies', 'Whitepapers', 'Trust Guides'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-full text-xs font-bold tracking-wide transition-all border ${
                    activeTab === tab
                      ? 'bg-[#ECEEFF] border-[#4253D1] text-[#4253D1] shadow-inner'
                      : 'bg-[#FAFAF8] border-slate-100 text-slate-500 hover:border-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search resources, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#FAFAF8] border border-slate-200/80 rounded-full py-3.5 pl-11 pr-5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── RESOURCES GRID ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#FAFAF8] min-h-[480px]">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {filteredResources.length > 0 ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {filteredResources.map((res, i) => (
                  <ScrollReveal key={res.title} y={20} delay={i * 0.05}>
                    <div className="group bg-white border border-slate-100 hover:border-[#D5D9F5] p-7 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex flex-col justify-between h-full min-h-[300px]">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-[#4253D1] uppercase tracking-widest font-mono bg-[#ECEEFF] px-3 py-1 rounded-full">
                            {res.category}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-400">
                            <Clock size={10} />
                            {res.time}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-sm font-bold text-[#001633] uppercase leading-snug group-hover:text-[#4253D1] transition-colors duration-300">
                            {res.title}
                          </h3>
                          <p className="text-xs text-slate-500 leading-relaxed font-normal">
                            {res.desc}
                          </p>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100 mt-6 space-y-4">
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5">
                          {res.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] font-bold uppercase tracking-wide font-mono px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md border border-slate-100"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Read CTA */}
                        <Link
                          href="/contact"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#001633] group-hover:text-[#4253D1] transition-colors leading-none uppercase font-mono tracking-wider pt-2"
                        >
                          <span>Request Document</span>
                          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 bg-white border border-slate-100 rounded-3xl space-y-4 max-w-md mx-auto shadow-inner"
              >
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <BookOpen size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[#001633] uppercase">No resources found</h4>
                  <p className="text-xs text-slate-400 font-normal leading-relaxed max-w-xs mx-auto">
                    Try adjusting your search query or switching categories to find related documents.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── PRE-FOOTER NEWSLETTER ── */}
      <section className="py-24 px-6 bg-[#001633] text-white text-center relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <div className="max-w-xl mx-auto space-y-8 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-3">
              <h2 className="text-3xl font-bold uppercase leading-tight font-sans">Subscribe to Trust Briefing</h2>
              <p className="text-xs text-white/50 leading-relaxed font-normal">
                Stay updated with regional data regulation acts, security specs updates, and verified developer integrations.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.1}>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                placeholder="Enter your corporate email address"
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-6 py-4 text-xs font-semibold focus:outline-none focus:border-white focus:bg-white/10 text-white placeholder-white/30"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-4 bg-[#4253D1] hover:bg-[#4E76E5] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono transition-all whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          </ScrollReveal>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
