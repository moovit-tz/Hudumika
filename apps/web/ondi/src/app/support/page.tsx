'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  HelpCircle,
  CheckCircle,
  Server,
  Zap,
  Activity,
  Send,
  ArrowRight,
  ShieldCheck,
  FileText,
  Mail,
  AlertTriangle,
  Clock
} from 'lucide-react';

const SYSTEM_STATUS = [
  { name: 'Identity Biometrics Auth', status: 'Operational', uptime: '99.99%', latency: '180ms' },
  { name: 'Authoritative Registries Sync', status: 'Operational', uptime: '99.92%', latency: '750ms' },
  { name: 'SSO & Universal Directory', status: 'Operational', uptime: '100.00%', latency: '95ms' },
  { name: 'Trust Score Calculation Engine', status: 'Operational', uptime: '99.98%', latency: '240ms' }
];

export default function SupportPage() {
  const [ticketCategory, setTicketCategory] = useState<string>('tech');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      const code = `ONED-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmittedCode(code);
    }, 1500);
  };

  const handleReset = () => {
    setSubmittedCode(null);
    setSubject('');
    setDescription('');
  };

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
            <HelpCircle size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Help Desk & Support</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Get support,<br />
            <span className="text-[#4253D1]">Resolve issues instantly.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            Connect with our consultative system architects, review API infrastructure status, or check documentation guides.
          </motion.p>
        </div>
      </section>

      {/* ── UPTIME STATUS MODULE ────────────────────────────────────────── */}
      <section className="py-12 px-6 bg-white border-y border-slate-100 relative">
        <GridBackground />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="bg-[#FAFAF8] rounded-[2rem] border border-slate-100 p-8 shadow-sm max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2.5">
                <Activity size={16} className="text-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-[#001633] uppercase tracking-widest font-mono">Real-Time System Status</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wider text-[9px] font-mono border border-emerald-200">
                <CheckCircle size={10} />
                All Systems Operational
              </span>
            </div>

            {/* Uptime Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
              {SYSTEM_STATUS.map((sys) => (
                <div key={sys.name} className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-inner">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide font-mono truncate max-w-[70%]">
                      {sys.name}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-[#001633] uppercase font-mono">{sys.status}</p>
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Uptime: {sys.uptime}</span>
                      <span>{sys.latency}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE SUPPORT DESK ────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-[#FAFAF8]">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-start">
            {/* Quick links left */}
            <div className="lg:col-span-5 space-y-8">
              <ScrollReveal y={20}>
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Architect Consultations</span>
                  <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight">Interactive Support Desk</h2>
                  <p className="text-sm text-[#4B5563] leading-relaxed font-normal">
                    Submit a support ticket regarding workspace configuration, NIDA registry credential synchronization, or general API inquiries. Our target SLA response time is under 15 minutes for enterprise tenants.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal y={20} delay={0.1}>
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#001633] uppercase tracking-widest font-mono block border-b border-slate-200 pb-2">
                    Alternative Pathways
                  </span>
                  {[
                    { icon: FileText, title: 'Developer Reference Docs', desc: 'Read detailed guides on credential signing, SDK triggers, and webhook schemas.', href: '/docs' },
                    { icon: Mail, title: 'Direct Enterprise Contact', desc: 'Schedule a strategic consultation architecture session for custom registries.', href: '/contact' }
                  ].map((node) => {
                    const Icon = node.icon;
                    return (
                      <Link
                        key={node.title}
                        href={node.href}
                        className="group flex gap-4 p-5 bg-white border border-slate-100 hover:border-[#D5D9F5] rounded-2xl shadow-sm transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center shrink-0">
                          <Icon size={18} />
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-bold text-[#001633] uppercase group-hover:text-[#4253D1] transition-all">
                            {node.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 leading-normal font-normal">
                            {node.desc}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </ScrollReveal>
            </div>

            {/* Ticket simulator right */}
            <div className="lg:col-span-7">
              <ScrollReveal y={20} x={20}>
                <AnimatePresence mode="wait">
                  {!submittedCode ? (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative rounded-[2rem] space-y-6">
                        <div className="border-b border-slate-100 pb-4">
                          <span className="text-[9px] font-bold tracking-widest text-[#4253D1] uppercase font-mono block">
                            Support Ticket Dispatch
                          </span>
                          <h3 className="text-base font-bold text-[#001633] uppercase">Create Support Case</h3>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                          {/* Ticket category */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-[#001633] uppercase font-mono block">Select Case Category:</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { id: 'tech', label: 'Technical API' },
                                { id: 'vetting', label: 'KYC Vetting' },
                                { id: 'registry', label: 'Registry Sync' },
                                { id: 'billing', label: 'Billing/Admin' }
                              ].map((cat) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setTicketCategory(cat.id)}
                                  className={`px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider font-mono border text-center transition-all ${
                                    ticketCategory === cat.id
                                      ? 'bg-[#ECEEFF] border-[#4253D1] text-[#4253D1]'
                                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                  }`}
                                >
                                  {cat.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Subject */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#001633] uppercase font-mono block">Case Subject:</label>
                            <input
                              type="text"
                              required
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              placeholder="e.g., Latency anomaly on NIDA registry node sync API"
                              className="w-full bg-[#FAFAF8] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner"
                            />
                          </div>

                          {/* Description */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#001633] uppercase font-mono block">Detailed Description:</label>
                            <textarea
                              required
                              rows={5}
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="Describe your issue, including API request IDs, environment setups, and error codes where applicable..."
                              className="w-full bg-[#FAFAF8] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner resize-none"
                            />
                          </div>

                          {/* Submit button */}
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full relative overflow-hidden group py-4 bg-[#001633] hover:bg-[#4253D1] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Send size={12} />
                            <span>{isSubmitting ? 'Dispatching Ticket...' : 'Dispatch Ticket'}</span>
                          </button>
                        </form>
                      </GlassPanel>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="receipt"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative rounded-[2rem] space-y-8 text-center max-w-lg mx-auto">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto shadow-inner">
                          <CheckCircle size={28} />
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-lg font-bold text-emerald-600 uppercase">Ticket Dispatched Successfully!</h3>
                          <p className="text-xs text-slate-500 leading-relaxed font-normal max-w-sm mx-auto">
                            Your support case has been logged on the Ondi internal helpdesk node. A systems engineer will contact you shortly.
                          </p>
                        </div>

                        {/* Visual Ticket Receipt */}
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-left space-y-3 font-mono text-[11px] max-w-sm mx-auto relative overflow-hidden">
                          {/* Ticket tear-out decors */}
                          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border border-slate-100" />
                          <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border border-slate-100" />

                          <div className="flex justify-between">
                            <span className="text-slate-400">Case Reference:</span>
                            <span className="font-bold text-[#001633]">{submittedCode}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200/50 pt-2.5">
                            <span className="text-slate-400">Target SLA:</span>
                            <span className="font-bold text-emerald-600 flex items-center gap-1">
                              <Clock size={10} />
                              &lt; 15 Minutes
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200/50 pt-2.5">
                            <span className="text-slate-400">Category:</span>
                            <span className="font-bold text-[#001633] uppercase">{ticketCategory}</span>
                          </div>
                          <div className="flex flex-col border-t border-slate-200/50 pt-2.5 space-y-1">
                            <span className="text-slate-400">Subject:</span>
                            <span className="font-bold text-[#001633] truncate max-w-full">{subject}</span>
                          </div>
                        </div>

                        <button
                          onClick={handleReset}
                          className="px-8 py-3.5 border border-[#D5D9F5] text-[#001633] rounded-full font-bold text-xs uppercase tracking-widest font-mono hover:bg-slate-50 transition-all"
                        >
                          Submit New Ticket
                        </button>
                      </GlassPanel>
                    </motion.div>
                  )}
                </AnimatePresence>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
