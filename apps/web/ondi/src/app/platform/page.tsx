'use client';

import { motion } from 'framer-motion';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, GridBackground, BrandWatermark } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import { 
  ShieldCheck, 
  Zap, 
  Lock, 
  Globe, 
  Fingerprint, 
  Award, 
  Briefcase, 
  Wallet,
  Cpu,
  Database,
  Terminal,
  Code2,
  ArrowRight,
  GitBranch,
  Key
} from 'lucide-react';

export default function PlatformPage() {
  return (
    <div className="min-h-screen bg-white text-[#001633] font-dm-sans selection:bg-blue-50 selection:text-blue-900 overflow-x-hidden">
      <MainNavbar />
      
      {/* ── HERO SECTION ────────────────────────────────────────────── */}
      <section className="relative pt-60 pb-36 px-6 overflow-hidden bg-white bg-[linear-gradient(to_right,#E5E7EB_1px,transparent_1px),linear-gradient(to_bottom,#E5E7EB_1px,transparent_1px)]" style={{ backgroundSize: '6rem 4rem' }}>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#ECEEFFB3_0%,#F4F5FFF2_70%,#ffffff_90%)]" />
        <BrandWatermark opacity={0.03} size="1200px" className="-right-1/4 -top-1/4 animate-pulse" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50/50 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <div className="max-w-4xl mx-auto space-y-8 relative z-10 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1]"
          >
            <ShieldCheck size={14} className="animate-pulse" />
            <span className="text-sm font-bold uppercase tracking-wider font-space">Platform Infrastructure</span>
          </motion.div>
          
          <h1 className="text-4xl lg:text-7xl font-bold font-barlow tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto">
            The Digital Trust <br />
            <span className="text-[#4253D1]">Infrastructure.</span>
          </h1>
          
          <p className="text-base sm:text-lg text-slate-500 font-normal leading-relaxed max-w-3xl mx-auto">
            Ondi is a unified multi-tenant infrastructure layer for individuals, workforce access, and corporate governance. Built on zero-trust principles. Verified once. Trusted everywhere.
          </p>
          
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-6">
            <button className="w-full sm:w-auto relative overflow-hidden group px-12 py-5 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-space shadow-2xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
              <div 
                className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-in-out bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" 
                style={{ willChange: 'transform' }}
              />
              <span className="relative z-10">Explore the Network</span>
              <ArrowRight size={16} className="relative z-10" />
            </button>
            <button onClick={() => window.location.href='/security'} className="w-full sm:w-auto px-12 py-5 bg-white text-[#001633] border border-[#D5D9F5] rounded-full font-bold text-sm uppercase tracking-wider font-space hover:bg-slate-50 transition-all shadow-sm">
              Security Specifications
            </button>
          </div>
        </div>
      </section>

      {/* ── THE 5 LAYERS (PREMIUM Conic SHINY ROW CARDS) ──────────────── */}
      <section className="py-40 px-6 bg-white relative">
        <GridBackground />
        <BrandWatermark opacity={0.02} size="900px" className="-left-1/4 -bottom-1/4 animate-pulse" />
        <div className="max-w-7xl mx-auto space-y-20 relative z-10">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <span className="text-sm font-bold text-[#4253D1] uppercase tracking-wider font-space">Infrastructure Layers</span>
            <h2 className="text-3xl lg:text-5xl font-bold font-barlow text-[#001633] uppercase">Five Vertically Integrated Layers</h2>
            <p className="text-base text-slate-500">Ondi is constructed as five distinct engineering layers, each answering a foundational challenge of digital economy trust.</p>
          </div>

          <div className="space-y-8 max-w-5xl mx-auto">
            <ScrollReveal y={20} delay={0.1}>
              <LayerCard 
                number="1" 
                icon={Fingerprint}
                title="Identity Verification Layer" 
                subtitle="Who are you?" 
                desc="Handles secure biometric registry checks, document OCR indexing, and zero-knowledge cryptographic credential issuance. The foundation everything depends on."
                tags={['KYC/KYB Checks', 'Secure Enclaves', 'ZKP Biometrics']}
              />
            </ScrollReveal>
            
            <ScrollReveal y={20} delay={0.2}>
              <LayerCard 
                number="2" 
                icon={GitBranch}
                title="Trust Graph engine" 
                subtitle="How reputable are you?" 
                desc="A multi-dimensional scoring engine that correlates user identity metadata, behavioral consistency signals, education vectors, and TRA/BRELA corporate compliance records."
                tags={['Trust Score Engine', 'Anomaly Classification', 'Ecosystem Graph']}
              />
            </ScrollReveal>

            <ScrollReveal y={20} delay={0.3}>
              <LayerCard 
                number="3" 
                icon={Key}
                title="Access Orchestration Layer" 
                subtitle="What are you authorized to do?" 
                desc="Implements trust-aware consumer SSO login and automated corporate employee SaaS provisioning with zero latency. Seamless single sign-on credentials."
                tags={['Universal SSO', 'Automated Provisioning', 'RBAC Control']}
              />
            </ScrollReveal>

            <ScrollReveal y={20} delay={0.4}>
              <LayerCard 
                number="4" 
                icon={Cpu}
                title="Workforce Lifecycle Layer" 
                subtitle="Where are you in your career path?" 
                desc="Automates JML (Joiner · Mover · Leaver) triggers. Integrates directly with HR software registries to revoke scopes and accounts instantly on exit."
                tags={['JML Automations', 'HR Registry Sync', 'Instant Exits']}
              />
            </ScrollReveal>

            <ScrollReveal y={20} delay={0.5}>
              <LayerCard 
                number="5" 
                icon={Award}
                title="Value Opportunity Layer" 
                subtitle="What can this trust unlock?" 
                desc="Turns verified reputation into a portable key. Connects individuals to instant business credit lines, tenant renting profiles, and verified job marketplaces."
                tags={['Micro-Credit Access', 'Rental Profiles', 'Job Passport']}
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-40 px-6 bg-slate-50 text-center relative">
        <GridBackground />
        <BrandWatermark opacity={0.03} size="800px" className="-right-1/4 -bottom-1/4" />
        <div className="max-w-3xl mx-auto space-y-12 relative z-10">
          <h2 className="text-4xl lg:text-6xl font-bold font-barlow text-[#001633] uppercase leading-tight">Build on a foundation <br />of digital trust.</h2>
          <p className="text-base text-slate-500 font-normal max-w-xl mx-auto leading-relaxed">Join the trust infrastructure layer powering the next generation of East African commerce APIs.</p>
          <div className="pt-4">
            <button className="px-16 py-6 bg-[#001633] text-white rounded-full font-bold text-sm uppercase tracking-wider font-space shadow-2xl shadow-slate-200 hover:bg-[#4253D1] transition-all">Join the Network</button>
          </div>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}

function LayerCard({ 
  number, 
  icon: Icon,
  title, 
  subtitle, 
  desc, 
  tags 
}: { 
  number: string; 
  icon: any;
  title: string; 
  subtitle: string; 
  desc: string; 
  tags: string[];
}) {
  return (
    <div className="advanced-gradient-card p-[1px] rounded-2xl bg-white border border-slate-100/50 overflow-hidden group shadow-md transition-all">
      <div className="advanced-gradient-card__trace" />
      <div className="advanced-gradient-card__glow" />
      <div className="relative z-10 p-8 bg-white/95 rounded-[15px] flex flex-col md:flex-row gap-8 items-center">
        {/* Metric Layer circle badge */}
        <div className="w-16 h-16 rounded-full bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center font-bold text-xl font-space shrink-0 group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500 shadow-inner">
          {number}
        </div>
        
        <div className="flex-1 space-y-3 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-x-4 gap-y-1">
            <div className="flex items-center justify-center md:justify-start gap-2.5">
              <Icon size={20} className="text-[#4253D1] group-hover:scale-110 transition-transform duration-300" />
              <h3 className="text-xl font-bold text-[#001633] font-barlow uppercase tracking-tight">{title}</h3>
            </div>
            <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-[#4253D1] font-bold">
              {subtitle}
            </span>
          </div>
          
          <p className="text-sm text-slate-500 font-normal leading-relaxed">{desc}</p>
          
          <div className="flex flex-wrap gap-2 pt-2 justify-center md:justify-start">
            {tags.map((tag) => (
              <span 
                key={tag} 
                className="text-[10px] font-bold uppercase tracking-wider font-space px-3 py-1 bg-slate-50 text-slate-400 rounded-full border border-slate-100 group-hover:border-[#4253D1]/20 group-hover:text-[#4253D1] transition-all duration-500"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
