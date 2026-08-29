'use client';

import { motion } from 'framer-motion';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import { 
  Code2, 
  Terminal, 
  Cpu, 
  ShieldCheck, 
  ArrowRight,
  Zap,
  Lock,
  Globe,
  Database
} from 'lucide-react';

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-white text-[#001633] font-dm-sans selection:bg-blue-50 selection:text-blue-900">
      <MainNavbar />
      
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative pt-64 pb-32 px-6 bg-white overflow-hidden">
        <GridBackground />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50/50 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1]"
          >
            <Code2 size={14} />
            <span className="text-sm font-bold uppercase tracking-wider font-space">Developer Hub</span>
          </motion.div>
          <h1 className="text-4xl lg:text-6xl font-bold font-barlow tracking-tight leading-tight text-[#001633] uppercase">
            Build with the <br />
            <span className="text-[#4253D1]">Identity Root.</span>
          </h1>
          <p className="text-base text-slate-500 font-normal leading-relaxed max-w-2xl">
            Integrate verified identity, real-time trust scoring, and biometric authentication into your app with a few lines of code. Built by developers, for developers.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <button className="w-full sm:w-auto px-12 py-5 bg-[#001633] text-white rounded-full font-bold text-sm uppercase tracking-wider font-space shadow-2xl shadow-slate-200 hover:bg-[#4253D1] transition-all">Get API Keys</button>
            <button className="w-full sm:w-auto px-12 py-5 bg-white text-[#001633] border border-[#D5D9F5] rounded-full font-bold text-sm uppercase tracking-wider font-space hover:bg-slate-50 transition-all">Documentation</button>
          </div>
        </div>
      </section>

      {/* ── CODE SECTION ────────────────────────────────────────────── */}
      <section className="py-40 px-6 bg-white relative">
        <GridBackground />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-24 items-center relative z-10">
          <div className="space-y-12">
             <div className="space-y-6">
                <h2 className="text-3xl lg:text-5xl font-bold font-barlow text-[#001633] uppercase leading-tight">One API. <br />Universal Identity.</h2>
                <p className="text-base text-slate-500 font-normal leading-relaxed">
                   Integrate Ondi using OAuth 2.0 or SAML. Support for mobile SDKs, web widgets, and direct API access for custom flows.
                </p>
             </div>
             <div className="grid sm:grid-cols-2 gap-8">
                <TechPoint icon={Cpu} title="Multi-SDK" desc="Libraries for Flutter, React Native, Node, and Python." />
                <TechPoint icon={Database} title="Webhooks" desc="Real-time events for profile updates and trust changes." />
                <TechPoint icon={Terminal} title="CLI Tools" desc="Manage keys and test integrations from your terminal." />
                <TechPoint icon={Lock} title="ZKP Protocol" desc="Privacy-preserving verification by default." />
             </div>
          </div>
          <div className="relative group">
             <div className="absolute inset-0 bg-blue-500/5 blur-[120px] rounded-full" />
             <GlassPanel className="bg-[#001633] p-0 border-white/5 shadow-2xl rounded-[10px] overflow-hidden" hover={false}>
                <div className="bg-white/5 border-b border-white/5 px-8 py-4 flex items-center justify-between">
                   <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                   </div>
                   <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest font-space">ondi_verify.js</span>
                </div>
                <div className="p-10 font-mono text-sm leading-relaxed">
                   <p className="text-blue-400">import <span className="text-white">{`{ Ondi }`}</span> from <span className="text-emerald-400">'@ondi/sdk'</span>;</p>
                   <p className="text-white/40 mt-4">// Initialize client</p>
                   <p className="text-blue-400">const <span className="text-white">client</span> = <span className="text-amber-400">new</span> <span className="text-blue-400">Ondi</span>({`{`}</p>
                   <p className="text-white ml-4">apiKey: <span className="text-emerald-400">'pk_live_...'</span>,</p>
                   <p className="text-white ml-4">region: <span className="text-emerald-400">'east-africa'</span></p>
                   <p className="text-blue-400">{`}`});</p>
                   <p className="text-white/40 mt-4">// Verify user identity</p>
                   <p className="text-blue-400">const <span className="text-white">result</span> = <span className="text-amber-400">await</span> <span className="text-white">client</span>.<span className="text-blue-400">verify</span>({`{`}</p>
                   <p className="text-white ml-4">scopes: [<span className="text-emerald-400">'profile'</span>, <span className="text-emerald-400">'trust'</span>]</p>
                   <p className="text-blue-400">{`}`});</p>
                </div>
             </GlassPanel>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="py-40 px-6 bg-white text-center relative">
         <GridBackground />
         <div className="max-w-3xl mx-auto space-y-12 relative z-10">
            <h2 className="text-4xl lg:text-6xl font-bold font-barlow text-[#001633] uppercase leading-tight">Build the future of <br />digital trust.</h2>
            <p className="text-base text-slate-500 font-normal max-w-xl mx-auto leading-relaxed">Join thousands of developers building on the Ondi platform. Sandbox keys are free and instant.</p>
            <div className="pt-4">
              <button className="px-16 py-6 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-space shadow-2xl shadow-blue-500/20 hover:bg-[#1A3060] transition-all">Start Integrating</button>
            </div>
         </div>
      </section>

      <MainFooter />
    </div>
  );
}

function TechPoint({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="space-y-3">
       <div className="w-10 h-10 rounded-[10px] bg-slate-50 flex items-center justify-center text-[#4253D1]">
          <Icon size={20} />
       </div>
       <h4 className="font-bold text-sm uppercase font-space text-[#001633] tracking-wider">{title}</h4>
       <p className="text-sm text-slate-500 font-normal leading-relaxed">{desc}</p>
    </div>
  );
}
