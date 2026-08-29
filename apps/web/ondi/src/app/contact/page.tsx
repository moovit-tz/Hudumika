'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  Mail,
  CheckCircle,
  Building2,
  Phone,
  Clock,
  Send,
  ArrowRight,
  ShieldCheck,
  Globe,
  MapPin,
  Calendar
} from 'lucide-react';

const OFFICE_LOCATIONS = [
  {
    city: 'Dar es Salaam',
    hq: 'Tanzania Headquarters',
    address: '8th Floor, Tanzanite Park, Victoria, Bagamoyo Road',
    phone: '+255 22 219 7000',
    email: 'tz.sales@ondi.africa',
    hours: 'Mon – Fri: 8:00 AM – 5:00 PM EAT'
  },
  {
    city: 'Nairobi',
    hq: 'Kenya Regional Hub',
    address: '4th Floor, The Alchemist Workspace, Westlands Rd',
    phone: '+254 20 760 2200',
    email: 'ke.sales@ondi.africa',
    hours: 'Mon – Fri: 8:00 AM – 5:00 PM EAT'
  },
  {
    city: 'Kampala',
    hq: 'Uganda Node Office',
    address: '3rd Floor, Innovation House, Plot 14, Kololo Hill Drive',
    phone: '+256 41 450 3300',
    email: 'ug.sales@ondi.africa',
    hours: 'Mon – Fri: 8:00 AM – 5:00 PM EAT'
  }
];

export default function ContactPage() {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [orgSize, setOrgSize] = useState<string>('mid');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [inquiryCode, setInquiryCode] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      const code = `SALE-${Math.floor(100000 + Math.random() * 900000)}`;
      setInquiryCode(code);
    }, 1500);
  };

  const handleReset = () => {
    setInquiryCode(null);
    setName('');
    setEmail('');
    setMessage('');
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
            <Mail size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Consultative Engagement</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Schedule a strategic<br />
            <span className="text-[#4253D1]">Solutions consultation.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto"
          >
            Discuss custom authoritative database API synchronizations, tenant volume SLA rates, and FIDO2 passkey rollouts with our engineers.
          </motion.p>
        </div>
      </section>

      {/* ── INTERACTIVE CONSULTATION FORM ───────────────────────────────── */}
      <section className="py-20 px-6 relative overflow-hidden bg-white border-y border-slate-100">
        <GridBackground />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-start">
            {/* Context Left */}
            <div className="lg:col-span-5 space-y-8">
              <ScrollReveal y={20}>
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Strategic Planning</span>
                  <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight font-sans">Why schedule a session?</h2>
                  <p className="text-sm text-[#4B5563] leading-relaxed font-normal">
                    Enterprise deployments require careful mapping of compliance frameworks, data residency requirements, and application integration dependencies. Our solutions team provides end-to-end guidance.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal y={20} delay={0.1}>
                <div className="space-y-4">
                  {[
                    { title: 'Bespoke Architecture', desc: 'Receive custom REST and SCIM integration blueprints mapping your exact directory systems.' },
                    { title: 'Compliance & Audits Mapping', desc: 'Confirm alignment parameters with BOT, TRA, TCRA, and localized data acts.' },
                    { title: 'Volume Pricing Schedules', desc: 'Custom per-query API rates and multi-tenant isolation packages.' }
                  ].map((value) => (
                    <div key={value.title} className="flex gap-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4253D1] mt-2 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[#001633] uppercase tracking-wider font-mono">{value.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed font-normal">{value.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            </div>

            {/* Booking Form Simulator Right */}
            <div className="lg:col-span-7">
              <ScrollReveal y={20} x={20}>
                <AnimatePresence mode="wait">
                  {!inquiryCode ? (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative rounded-[2rem] space-y-6">
                        <div className="border-b border-slate-100 pb-4">
                          <span className="text-[9px] font-bold tracking-widest text-[#4253D1] uppercase font-mono block">
                            Inquiry Dispatch
                          </span>
                          <h3 className="text-base font-bold text-[#001633] uppercase">Request Sales Call</h3>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                          {/* Name */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#001633] uppercase font-mono block">Full Name:</label>
                            <input
                              type="text"
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="e.g., Joseph Mwamba"
                              className="w-full bg-[#FAFAF8] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner"
                            />
                          </div>

                          {/* Email */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#001633] uppercase font-mono block">Corporate Email Address:</label>
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="e.g., joseph.mwamba@bank.co.tz"
                              className="w-full bg-[#FAFAF8] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner"
                            />
                          </div>

                          {/* Organization size */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-[#001633] uppercase font-mono block">Organization Size:</span>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: 'small', label: '1 - 49 Staff' },
                                { id: 'mid', label: '50 - 499 Staff' },
                                { id: 'enterprise', label: '500+ Staff' }
                              ].map((size) => (
                                <button
                                  key={size.id}
                                  type="button"
                                  onClick={() => setOrgSize(size.id)}
                                  className={`px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider font-mono border text-center transition-all ${
                                    orgSize === size.id
                                      ? 'bg-[#ECEEFF] border-[#4253D1] text-[#4253D1]'
                                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                  }`}
                                >
                                  {size.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Requirements */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#001633] uppercase font-mono block">Target Deployment Scope:</label>
                            <textarea
                              required
                              rows={4}
                              value={message}
                              onChange={(e) => setMessage(e.target.value)}
                              placeholder="Outline your integration goals (e.g., connecting a core fintech app to TRA TIN sync and NIDA legal citizen verification)..."
                              className="w-full bg-[#FAFAF8] border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all shadow-inner resize-none"
                            />
                          </div>

                          {/* Submit button */}
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full relative overflow-hidden group py-4 bg-[#001633] hover:bg-[#4253D1] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Calendar size={12} />
                            <span>{isSubmitting ? 'Scheduling consultation...' : 'Schedule Solutions Call'}</span>
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
                          <h3 className="text-lg font-bold text-emerald-600 uppercase">Consultation Inquiry Logged!</h3>
                          <p className="text-xs text-slate-500 leading-relaxed font-normal max-w-sm mx-auto">
                            Thank you, {name}. A systems architect from our regional team will contact you at {email} within one business hour.
                          </p>
                        </div>

                        {/* Inquiry Receipt */}
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-left space-y-3 font-mono text-[11px] max-w-sm mx-auto relative overflow-hidden">
                          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border border-slate-100" />
                          <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border border-slate-100" />

                          <div className="flex justify-between">
                            <span className="text-slate-400">Case Reference:</span>
                            <span className="font-bold text-[#001633]">{inquiryCode}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200/50 pt-2.5">
                            <span className="text-slate-400">Target SLA:</span>
                            <span className="font-bold text-emerald-600 flex items-center gap-1">
                              <Clock size={10} />
                              &lt; 1 Hour EAT
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200/50 pt-2.5">
                            <span className="text-slate-400">Tier:</span>
                            <span className="font-bold text-[#001633] uppercase">{orgSize} scale</span>
                          </div>
                        </div>

                        <button
                          onClick={handleReset}
                          className="px-8 py-3.5 border border-[#D5D9F5] text-[#001633] rounded-full font-bold text-xs uppercase tracking-widest font-mono hover:bg-slate-50 transition-all"
                        >
                          Submit New Request
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

      {/* ── REGIONAL OFFICES ────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FAFAF8] relative overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Our Network</span>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#001633] uppercase leading-tight font-sans">Regional Office Nodes</h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                Connect with our local solutions teams situated across the primary technology hubs of East Africa.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {OFFICE_LOCATIONS.map((office, i) => (
              <ScrollReveal key={office.city} y={24} delay={i * 0.1}>
                <div className="group bg-white border border-slate-100 hover:border-[#D5D9F5] p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 space-y-6">
                  <div className="space-y-1 border-b border-slate-100 pb-4">
                    <span className="text-xs font-extrabold text-[#4253D1] uppercase tracking-wider font-mono">
                      {office.city}
                    </span>
                    <h3 className="text-sm font-bold text-[#001633] uppercase leading-tight">{office.hq}</h3>
                  </div>

                  <div className="space-y-3.5 text-xs text-[#4B5563] font-normal leading-relaxed">
                    <div className="flex gap-3">
                      <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span>{office.address}</span>
                    </div>
                    <div className="flex gap-3 border-t border-slate-100 pt-3.5">
                      <Phone size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="font-mono">{office.phone}</span>
                    </div>
                    <div className="flex gap-3 border-t border-slate-100 pt-3.5">
                      <Mail size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="font-mono text-[#4253D1]">{office.email}</span>
                    </div>
                    <div className="flex gap-3 border-t border-slate-100 pt-3.5">
                      <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span>{office.hours}</span>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
