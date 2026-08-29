'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, HolographicRing } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  FileLock2, ClipboardCheck, AlertTriangle, Users,
  BookOpen, BarChart2, FileText, ArrowRight, CheckCircle,
  Database, Eye, Bell, Scale, TrendingUp, ChevronRight, Zap,
  Building2, BadgeCheck, Shield,
} from 'lucide-react';

const P = {
  blue:        '#4253D1',
  accent:      '#4E76E5',
  navy:        '#001633',
  mist:        '#ECEEFF',
  border:      '#D5D9F5',
  bg:          '#FAFAF8',
  stone:       '#F4F3EF',
  stoneBorder: '#E4E0D8',
  text:        '#232323',
  sub:         '#4B5563',
};

const MATURITY_LEVELS = [
  { level: 'INITIAL',    score: 10,  label: 'Initial',    short: 'Ad-hoc processes. No formal data register.',          desc: 'Your organisation processes personal data but without documented procedures. PDPA exposure is high. Audit findings will be significant.',                                                                         actions: ['Draft a basic privacy policy', 'Identify your data controller', 'List the categories of personal data you hold'],         color: '#EF4444', bg: '#FEF2F2', border: '#FCA5A5' },
  { level: 'DEVELOPING', score: 35,  label: 'Developing', short: 'Awareness exists. Policies drafted but not enforced.', desc: 'Leadership is aware of PDPA obligations. A privacy policy exists on paper but consent flows and staff training are incomplete.',                                                                         actions: ['Complete a data mapping exercise', 'Implement consent capture on all data collection points', 'Train all staff handling personal data'],                                                                                           color: '#F59E0B', bg: '#FFFBEB', border: '#FCD34D' },
  { level: 'DEFINED',    score: 60,  label: 'Defined',    short: 'Formal programme in place. DPO appointed.',            desc: 'A Data Protection Officer is in post. Procedures are documented and enforced. Most PDPA obligations are covered; edge cases remain.',                                                                    actions: ['Register the DPO with the regulatory authority', 'Conduct annual privacy impact assessments', 'Establish a breach notification runbook'],                                                                                          color: '#3B82F6', bg: '#EFF6FF', border: '#93C5FD' },
  { level: 'MANAGED',    score: 80,  label: 'Managed',    short: 'Metrics-driven. Third-party processors assessed.',     desc: 'Privacy is embedded in your SDLC. All processors and vendors hold valid DPAs. Breach and rights workflows run end-to-end with metrics.',                                                                   actions: ['Automate data retention enforcement', 'Complete vendor risk assessments for all processors', 'Run quarterly internal audits'],                                                                                                     color: P.blue,   bg: P.mist,    border: P.border   },
  { level: 'OPTIMISING', score: 100, label: 'Optimising', short: 'Privacy by design. Continuous improvement cycle.',    desc: "Privacy is a competitive differentiator. Your PDPA maturity score feeds directly into your Ondi Trust Score, unlocking preferential partner and lending rates.", actions: ['Publish a transparency report', 'Achieve ISO 27701 certification', 'Share your Ondi Trust Score with partners'], color: '#10B981', bg: '#ECFDF5', border: '#6EE7B7' },
];

const CAPABILITIES = [
  { icon: Database,      title: 'Data Mapping & Inventory',    desc: 'Auto-discover personal data flows across your systems, classify them by category, and maintain a living Record of Processing Activities (RoPA) without manual spreadsheets.',       id: 'data-mapping'   },
  { icon: ClipboardCheck,title: 'Consent Management',          desc: 'Capture, store, and version granular consent from every data subject. Provide proof of consent to regulators within seconds. Sync consent state across your stack via webhook.',    id: 'consent'         },
  { icon: BookOpen,      title: 'DPO Workspace',               desc: 'A dedicated command centre for your DPO: manage PIAs, track remediation tasks, review incoming rights requests, and maintain your compliance calendar.',                            id: 'dpo-workspace'  },
  { icon: Bell,          title: 'Breach Notification Engine',  desc: 'Log a suspected breach, auto-assess risk under PDPA criteria, and generate a pre-filled notification for the data-protection authority — within the 72-hour window.',              id: 'breach'          },
  { icon: Eye,           title: 'Data Subject Rights Portal',  desc: 'Self-service portal for individuals to submit access, correction, deletion, and objection requests. Automated workflow fulfils each request within the statutory deadline.',          id: 'rights-portal'  },
  { icon: BarChart2,     title: 'Maturity Dashboard',          desc: 'Live PDPA maturity score (INITIAL → OPTIMISING) with gap analysis, prioritised remediation roadmap, and audit-ready evidence packs updated in real-time.',                         id: 'dashboard'       },
];

const BENEFITS = [
  { icon: Shield,     title: 'Avoid Regulatory Fines',   desc: 'Protect your organisation from penalties up to TZS 500M under Tanzania PDPA and Kenya DPA with documented, auditable compliance evidence.' },
  { icon: Users,      title: 'Build Customer Trust',     desc: 'Consumers and enterprises choose privacy-conscious organisations. Demonstrate your data protection credentials with a verifiable compliance signal.' },
  { icon: Database,   title: 'Operational Clarity',      desc: 'Know exactly what personal data you hold, where it flows, and who has access — eliminating shadow data risks before they become costly breaches.' },
  { icon: TrendingUp, title: 'Improve Your Trust Score', desc: 'PDPA maturity feeds directly into your Ondi Trust Score as a 5% signal — unlocking better lending rates, procurement standing, and partner confidence.' },
  { icon: BadgeCheck, title: 'Reduce Breach Exposure',   desc: 'Proactive consent management, automated vendor DPA tracking, and breach assessment workflows significantly cut your regulatory risk.' },
  { icon: BookOpen,   title: 'Audit-Ready Evidence',     desc: 'Generate compliance evidence packs on demand. Demonstrate readiness to regulators, auditors, and enterprise clients without weeks of manual preparation.' },
];

const CASE_STUDIES = [
  {
    org: 'HealthNet East Africa', industry: 'Healthcare · Tanzania',
    icon: Building2, color: '#10B981',
    challenge: 'A 12-hospital network managing 2M+ patient records needed to reach DEFINED maturity ahead of a TCRA inspection. Consent was paper-based with no digital audit trail across 6 clinical systems.',
    solution: 'Ondi auto-discovered 14 personal data flows, migrated 2M historical consent records, and deployed a self-service rights portal for patient requests — all in under 3 weeks.',
    outcomes: ['Achieved DEFINED maturity in 6 weeks', 'Passed TCRA inspection with zero findings', 'Consent capture rate: 34% → 98.7%'],
    modules: ['Consent Management', 'Data Mapping', 'DPO Workspace', 'Rights Portal'],
  },
  {
    org: 'SafiPay Digital Finance', industry: 'Fintech · Kenya & Tanzania',
    icon: Scale, color: P.blue,
    challenge: 'A mobile money operator processing 500K daily transactions experienced a suspected breach affecting 40,000 records. Manual assessment and TCRA notification took 8+ hours per incident.',
    solution: "Integrated Ondi's Breach Notification Engine with their incident system. Risk scoring and regulatory notification workflows were automated, cutting assessment time from 8 hours to 14 minutes.",
    outcomes: ['Breach assessment: 8 hrs → 14 minutes', 'Regulatory notification filed within 6 hours', 'Trust Score rose by 38 points post-remediation'],
    modules: ['Breach Notification Engine', 'Maturity Dashboard', 'Trust Score Feed'],
  },
];

const LOGOS = [
  { name: 'NIDA',          file: 'nida'    },
  { name: 'BRELA',         file: 'brela'   },
  { name: 'TRA',           file: 'tra'     },
  { name: 'NSSF',          file: 'nssf'    },
  { name: 'DigiCash',      file: 'digicash'},
  { name: 'SAP',           file: 'sap'     },
  { name: 'Sage',          file: 'sage'    },
  { name: 'Google Workspace', file: 'g-suite' },
  { name: 'Microsoft 365', file: 'm-365'  },
  { name: 'Hudumika',        file: 'hudumika'  },
  { name: 'Aleka',         file: 'aleka'   },
  { name: 'OptIn',         file: 'optin'   },
];

export default function PDPAPage() {
  const [activeMaturity, setActiveMaturity] = useState(2);

  return (
    <div className="min-h-screen text-[#232323] font-sans overflow-x-hidden" style={{ background: P.bg }}>
      <MainNavbar />

      {/* ── §1 HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-20 px-6 overflow-hidden border-b"
        style={{ background: P.bg, borderColor: P.stoneBorder }}>
        {/* Soft blue mist */}
        <div className="absolute top-0 inset-x-0 h-[500px] pointer-events-none -z-0"
          style={{ background: `linear-gradient(170deg, ${P.mist}90 0%, transparent 60%)` }} />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-16 items-center">

            {/* Left — copy */}
            <div className="space-y-7">
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.2em] font-mono"
                  style={{ borderColor: P.border, background: P.mist, color: P.blue }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  PDPA Compliance Suite
                </span>
              </motion.div>

              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }}
                className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.06]"
                style={{ color: P.navy }}>
                East Africa's PDPA is now law.
                <br />
                <span style={{ color: P.blue }}>Are you compliant?</span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.5 }}
                className="text-base leading-relaxed font-normal max-w-lg" style={{ color: P.sub }}>
                Live maturity score, automated consent flows, a DPO workspace, and a breach notification engine — built for East Africa's data protection laws.
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.45 }}
                className="flex flex-col sm:flex-row gap-3">
                <a href="/assessment"
                  suppressHydrationWarning
                  className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm text-white shadow-md transition-all hover:shadow-lg"
                  style={{ background: P.blue }}>
                  Run Compliance Assessment
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a href="/contact"
                  suppressHydrationWarning
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm border transition-all hover:bg-white"
                  style={{ color: P.navy, borderColor: P.stoneBorder }}>
                  Talk to a DPO Expert
                </a>
              </motion.div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42 }}
                className="flex flex-wrap gap-8 pt-1">
                {[
                  { val: '72 hrs',   label: 'Breach notification window' },
                  { val: '30 days',  label: 'Rights request deadline' },
                  { val: '5 levels', label: 'Maturity model' },
                ].map(({ val, label }) => (
                  <div key={label} className="space-y-0.5">
                    <div className="text-2xl font-bold font-mono" style={{ color: P.blue }}>{val}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: P.sub }}>{label}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right — maturity card */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
              <div className="bg-white border rounded-3xl p-8 space-y-6 shadow-xl shadow-blue-900/5"
                style={{ borderColor: P.border }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: P.sub }}>PDPA Maturity Score</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: P.navy }}>HealthNet East Africa</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono text-emerald-700 bg-emerald-50 border border-emerald-100">
                    Improving
                  </span>
                </div>

                <div className="flex justify-center">
                  <HolographicRing score={60} max={100} label="Maturity" color={P.blue} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono uppercase" style={{ color: P.sub }}>
                    <span>Initial</span><span>Developing</span><span>Defined</span><span>Managed</span><span>Optimising</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden flex" style={{ background: P.stone }}>
                    {MATURITY_LEVELS.map((m, i) => (
                      <div key={m.level} className={`h-full flex-1 ${i < 3 ? 'opacity-100' : 'opacity-20'}`}
                        style={{ background: m.color, borderRight: i < 4 ? '2px solid white' : '' }} />
                    ))}
                  </div>
                  <p className="text-center text-[10px] font-bold font-mono uppercase tracking-wider" style={{ color: P.blue }}>
                    Current: DEFINED · Next: MANAGED
                  </p>
                </div>

                <div className="space-y-2.5 border-t pt-4" style={{ borderColor: P.stone }}>
                  {[
                    { task: 'Annual PIA scheduled for Q3',   done: false },
                    { task: 'DPO registered with authority', done: true  },
                    { task: 'Breach runbook drafted',        done: true  },
                    { task: 'Vendor DPAs — 2 outstanding',   done: false },
                  ].map(({ task, done }) => (
                    <div key={task} className="flex items-center gap-3 text-xs">
                      <CheckCircle size={13} className="shrink-0"
                        style={{ color: done ? '#10B981' : P.stoneBorder }} />
                      <span style={{ color: done ? P.navy : P.sub }}>{task}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── §2 STATS BAR ────────────────────────────────────────────────────── */}
      <section className="py-10 px-6 bg-white border-b" style={{ borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: 'TZS 500M', label: 'Maximum fine',    sub: 'Per serious breach under Tanzania PDPA' },
              { val: '72 hrs',   label: 'Breach window',   sub: 'Mandatory notification deadline' },
              { val: '30 days',  label: 'Rights deadline', sub: 'Data subject access requests' },
              { val: '73%',      label: 'Unprepared',      sub: 'Of EA organisations below DEFINED level' },
            ].map(({ val, label, sub }) => (
              <div key={label} className="space-y-1">
                <div className="text-3xl font-bold font-mono" style={{ color: P.blue }}>{val}</div>
                <div className="text-xs font-bold uppercase tracking-wide" style={{ color: P.navy }}>{label}</div>
                <div className="text-[10px]" style={{ color: P.sub }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── §3 THE CHALLENGE ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <ScrollReveal x={-20} y={0}>
            <div className="space-y-6 lg:sticky lg:top-32">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>The Compliance Gap</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.1]" style={{ color: P.navy }}>
                East Africa's data protection laws are active. Enforcement is underway.
              </h2>
              <p className="text-base leading-relaxed font-normal" style={{ color: P.sub }}>
                Tanzania's Personal Data Protection Act and Kenya's Data Protection Act are fully in force. Regulators have moved from awareness campaigns to active audits and enforcement notices.
              </p>
              <p className="text-base leading-relaxed font-normal" style={{ color: P.sub }}>
                Our assessments show 73% of East African organisations sit below DEFINED maturity. Common gaps: no formal RoPA, unconsented processing flows, no DPO, and untested breach procedures.
              </p>
              <a href="/assessment"
                suppressHydrationWarning
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono hover:gap-3 transition-all"
                style={{ color: P.blue }}>
                Check your exposure <ArrowRight size={13} />
              </a>
            </div>
          </ScrollReveal>

          <ScrollReveal x={20} y={0}>
            <div className="space-y-4">
              {[
                { icon: Scale,         heading: 'The law is in force.',              body: "Fines reaching TZS 500M are available for serious breaches. Active enforcement has begun across Tanzania and Kenya — organisations can no longer wait.",                                                                                     color: '#EF4444' },
                { icon: AlertTriangle, heading: 'Most organisations are unprepared.', body: '73% of East African organisations sit below DEFINED level. Common gaps: no RoPA, unconsented data flows, no DPO, and untested breach response procedures.',                                                                                 color: '#F59E0B' },
                { icon: TrendingUp,    heading: 'Compliance drives business value.',  body: 'Organisations at MANAGED or OPTIMISING maturity unlock a compliance signal in their Ondi Trust Score — improving credit ratings, partner confidence, and regulatory relationships.',                                                           color: '#10B981' },
              ].map(({ icon: Icon, heading, body, color }) => (
                <div key={heading} className="flex gap-5 p-6 bg-white rounded-2xl border hover:shadow-sm transition-all"
                  style={{ borderColor: P.stoneBorder }}>
                  <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}15`, color }}>
                    <Icon size={20} />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold" style={{ color: P.navy }}>{heading}</h3>
                    <p className="text-xs leading-relaxed font-normal" style={{ color: P.sub }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── §4 BENEFITS GRID ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-y" style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto space-y-14">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Why Ondi PDPA</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                Compliance that works for your business.
              </h2>
              <p className="text-sm max-w-2xl mx-auto font-normal" style={{ color: P.sub }}>
                Beyond legal protection — Ondi's PDPA platform turns regulatory compliance into a measurable business asset.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
              <ScrollReveal key={title} y={24} delay={i * 0.07}>
                <div className="p-6 bg-white rounded-2xl border hover:border-blue-200 hover:shadow-md transition-all"
                  style={{ borderColor: P.stoneBorder }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: P.mist, color: P.blue }}>
                    <Icon size={18} />
                  </div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: P.navy }}>{title}</h3>
                  <p className="text-xs leading-relaxed font-normal" style={{ color: P.sub }}>{desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── §5 CAPABILITIES ──────────────────────────────────────────────────── */}
      <section id="capabilities" className="py-24 px-6" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto space-y-14">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Platform Capabilities</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                Everything your DPO needs.<br />In one place.
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map(({ icon: Icon, title, desc, id }, i) => (
              <ScrollReveal key={id} y={24} delay={i * 0.07}>
                <div id={id}
                  className="p-7 bg-white rounded-2xl border hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-300 group space-y-4"
                  style={{ borderColor: P.stoneBorder }}>
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

      {/* ── §6 TESTIMONIAL ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-y" style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-5xl mx-auto">
          <ScrollReveal y={20}>
            <div className="bg-white rounded-3xl border p-10 lg:p-14 relative overflow-hidden"
              style={{ borderColor: P.border }}>
              <div className="absolute top-4 left-8 text-[10rem] font-bold leading-none opacity-[0.04] select-none"
                style={{ color: P.blue }}>"</div>
              <div className="relative space-y-8">
                <p className="text-xl lg:text-2xl font-normal leading-relaxed" style={{ color: P.navy }}>
                  "We went from INITIAL to DEFINED in six weeks. Ondi gave our DPO everything needed — the data map, consent audit trail, and breach runbook — all in one place. The TCRA audit passed without a single finding."
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ background: `linear-gradient(135deg, ${P.blue}, ${P.accent})` }}>
                    AK
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: P.navy }}>Amina Kitwana</p>
                    <p className="text-xs" style={{ color: P.sub }}>Chief Data Protection Officer · HealthNet East Africa</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── §7 PARTNER & INTEGRATION LOGOS ───────────────────────────────────── */}
      <section className="py-16 px-6 border-b bg-white" style={{ borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto space-y-8">
          <ScrollReveal y={12}>
            <p className="text-center text-[10px] font-bold tracking-[0.22em] text-slate-400 uppercase font-mono">
              Connected to the institutions that matter
            </p>
          </ScrollReveal>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {LOGOS.map(({ name, file }) => (
              <div key={file}
                className="h-14 rounded-xl border flex items-center justify-center px-4 transition-all hover:shadow-sm"
                style={{ borderColor: P.stoneBorder, background: P.stone }}>
                <Image
                  src={`/logos/${file}.svg`}
                  alt={name}
                  width={80}
                  height={28}
                  unoptimized
                  className="object-contain opacity-60 hover:opacity-90 transition-opacity max-h-7 w-auto"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── §8 MATURITY MODEL ────────────────────────────────────────────────── */}
      <section className="py-32 px-6 relative overflow-hidden" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto space-y-16 relative z-10">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>PDPA Maturity Model</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                Where does your organisation sit?
              </h2>
              <p className="text-sm max-w-2xl mx-auto font-normal" style={{ color: P.sub }}>
                Our 5-level maturity framework maps directly to PDPA regulatory expectations. Click a level to see what it means and what to do next.
              </p>
            </div>
          </ScrollReveal>

          <div className="flex flex-wrap justify-center gap-3">
            {MATURITY_LEVELS.map((m, i) => (
              <button key={m.level} onClick={() => setActiveMaturity(i)}
                className={`px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider font-mono border transition-all duration-200 ${activeMaturity === i ? 'text-white shadow-md' : 'bg-white hover:opacity-80'}`}
                style={activeMaturity === i
                  ? { background: m.color, borderColor: m.color }
                  : { borderColor: m.border, color: m.color, background: m.bg }}>
                {m.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {(() => {
              const m = MATURITY_LEVELS[activeMaturity];
              return (
                <motion.div key={m.level}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.3 }}
                  className="max-w-5xl mx-auto grid md:grid-cols-[1fr_1.2fr] gap-10 items-center">
                  <div className="flex flex-col items-center space-y-6">
                    <HolographicRing score={m.score} max={100} label="Maturity" color={m.color} />
                    <div className="text-center space-y-2">
                      <div className="text-2xl font-bold font-mono uppercase" style={{ color: m.color }}>{m.label}</div>
                      <p className="text-sm font-normal" style={{ color: P.sub }}>{m.short}</p>
                    </div>
                    <div className="w-full max-w-xs h-2 rounded-full overflow-hidden bg-slate-100 flex">
                      {MATURITY_LEVELS.map((lvl, j) => (
                        <div key={lvl.level} className="h-full flex-1 transition-opacity duration-300"
                          style={{ background: lvl.color, opacity: j <= activeMaturity ? 1 : 0.15, borderRight: j < 4 ? '2px solid white' : '' }} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 rounded-2xl border space-y-4" style={{ background: m.bg, borderColor: m.border }}>
                      <h3 className="text-base font-bold uppercase" style={{ color: P.navy }}>Level {activeMaturity + 1}: {m.label}</h3>
                      <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>{m.desc}</p>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color: P.navy }}>Priority actions at this level</p>
                      {m.actions.map((action) => (
                        <div key={action} className="flex items-start gap-3">
                          <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: m.color }} />
                          <p className="text-sm font-normal" style={{ color: P.sub }}>{action}</p>
                        </div>
                      ))}
                    </div>
                    <a href="/assessment"
                      suppressHydrationWarning
                      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono hover:gap-3 transition-all"
                      style={{ color: m.color }}>
                      Assess my organisation now <ArrowRight size={13} />
                    </a>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </section>

      {/* ── §9 CASE STUDIES ──────────────────────────────────────────────────── */}
      <section className="py-32 px-6 border-y" style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Case Studies</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                Real compliance. Real outcomes.
              </h2>
              <p className="text-sm max-w-2xl mx-auto font-normal" style={{ color: P.sub }}>
                How East African organisations used Ondi's PDPA platform to meet regulatory requirements and build lasting compliance programmes.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid lg:grid-cols-2 gap-8">
            {CASE_STUDIES.map(({ org, industry, icon: Icon, color, challenge, solution, outcomes, modules }) => (
              <ScrollReveal key={org} y={24}>
                <div className="bg-white rounded-3xl border overflow-hidden flex flex-col" style={{ borderColor: P.stoneBorder }}>
                  <div className="px-8 py-6 border-b" style={{ background: `${color}08`, borderColor: P.stoneBorder }}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: `${color}20`, color }}>
                        <Icon size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: P.navy }}>{org}</p>
                        <p className="text-[10px] font-mono uppercase tracking-wide" style={{ color: P.sub }}>{industry}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-8 space-y-6 flex-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-2" style={{ color: P.sub }}>The Challenge</p>
                      <p className="text-sm leading-relaxed" style={{ color: P.text }}>{challenge}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-2" style={{ color: P.sub }}>The Solution</p>
                      <p className="text-sm leading-relaxed" style={{ color: P.text }}>{solution}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-2" style={{ color: P.sub }}>Outcomes</p>
                      <ul className="space-y-1.5">
                        {outcomes.map((o) => (
                          <li key={o} className="flex items-start gap-2 text-xs" style={{ color: P.text }}>
                            <CheckCircle size={13} className="shrink-0 mt-0.5" style={{ color }} />{o}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: P.stone }}>
                      {modules.map((mod) => (
                        <span key={mod} className="px-2.5 py-1 rounded text-[10px] font-bold font-mono uppercase"
                          style={{ background: `${color}10`, color, border: `1px solid ${color}30` }}>
                          {mod}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── §10 TRUST SCORE INTEGRATION ──────────────────────────────────────── */}
      <section className="py-32 px-6" style={{ background: P.bg }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <ScrollReveal x={-20} y={0}>
              <div className="space-y-8">
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>Trust Score Integration</span>
                  <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                    Compliance that pays dividends.
                  </h2>
                  <p className="text-base leading-relaxed font-normal" style={{ color: P.sub }}>
                    Your PDPA maturity score is automatically fed into Ondi's Trust Score engine as a 5% weighted signal. Organisations at MANAGED or OPTIMISING level unlock preferential lending rates, improved procurement standing, and higher trust ratings from enterprise clients.
                  </p>
                </div>
                <div className="space-y-4">
                  {[
                    { level: 'INITIAL',    boost: '+0',  note: 'No compliance signal' },
                    { level: 'DEVELOPING', boost: '+5',  note: 'Base signal detected' },
                    { level: 'DEFINED',    boost: '+15', note: 'Formal programme confirmed' },
                    { level: 'MANAGED',    boost: '+25', note: 'Metrics-driven compliance' },
                    { level: 'OPTIMISING', boost: '+40', note: 'Privacy by design — full signal' },
                  ].map(({ level, boost, note }, i) => {
                    const m = MATURITY_LEVELS[i];
                    return (
                      <div key={level} className="flex items-center gap-4">
                        <span className="w-24 text-[10px] font-bold uppercase font-mono shrink-0" style={{ color: m.color }}>{level}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: P.stone }}>
                          <motion.div className="h-full rounded-full" style={{ background: m.color }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${(i + 1) * 20}%` }}
                            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay: i * 0.08 }}
                            viewport={{ once: true }} />
                        </div>
                        <span className="text-xs font-bold font-mono w-10 text-right" style={{ color: m.color }}>{boost} pts</span>
                        <span className="text-[10px] hidden lg:block w-44 shrink-0" style={{ color: P.sub }}>{note}</span>
                      </div>
                    );
                  })}
                </div>
                <a href="/products/trust-score"
                  suppressHydrationWarning
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono hover:gap-3 transition-all"
                  style={{ color: P.blue }}>
                  How the Trust Score works <ArrowRight size={13} />
                </a>
              </div>
            </ScrollReveal>

            <ScrollReveal x={20} y={0}>
              <GlassPanel className="p-8 bg-white border-slate-100 shadow-xl space-y-6" hover={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: P.navy }}>Organisation Trust Passport</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: P.navy }}>InsuAfrika Ltd</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono"
                    style={{ color: P.blue, background: P.mist, border: `1px solid ${P.border}` }}>
                    PDPA: Managed
                  </span>
                </div>
                <div className="flex justify-center">
                  <HolographicRing score={814} max={850} label="Trust Score" color={P.blue} />
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'KYB Verification',    val: 'Passed — BRELA',    color: '#10B981' },
                    { label: 'PDPA Maturity',        val: 'Managed (+25 pts)', color: P.blue   },
                    { label: 'Data Processing Reg.', val: 'DPO Registered',   color: '#10B981' },
                    { label: 'Breach History',       val: 'Clean — 24 months', color: '#10B981' },
                    { label: 'Consent Rate',         val: '98.4% captured',   color: '#10B981' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex justify-between items-center py-2 border-b last:border-none text-xs"
                      style={{ borderColor: P.stone }}>
                      <span style={{ color: P.sub }}>{label}</span>
                      <span className="font-bold font-mono" style={{ color }}>{val}</span>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── §11 HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-32 px-6 border-y" style={{ background: P.navy, borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto space-y-20">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-white/40">Getting Compliant</span>
              <h2 className="text-3xl lg:text-4xl font-bold leading-[1.08] text-white">
                From assessment to audit-ready<br />in four steps.
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: '01', icon: ClipboardCheck, title: 'Run your Assessment',  desc: 'Complete a guided questionnaire. Our engine scores your maturity across 8 PDPA domains and generates a gap report.' },
              { num: '02', icon: FileText,       title: 'Build your Roadmap',   desc: 'Receive a prioritised remediation plan with task assignments, deadlines, and evidence templates for your DPO.' },
              { num: '03', icon: Zap,            title: 'Automate Compliance',  desc: 'Deploy consent widgets, activate data-subject rights flows, and connect your systems to the data mapping engine.' },
              { num: '04', icon: TrendingUp,     title: 'Improve & Report',     desc: 'Track live maturity improvements. Generate audit-ready evidence packs. Watch your Ondi Trust Score rise.' },
            ].map(({ num, icon: Icon, title, desc }, i) => (
              <ScrollReveal key={num} y={30} delay={i * 0.12}>
                <div className="text-center space-y-4 px-2">
                  <span className="text-6xl font-bold font-mono leading-none block opacity-10 text-white">{num}</span>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto -mt-4"
                    style={{ background: `${P.blue}30`, color: P.accent }}>
                    <Icon size={22} />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white">{title}</h3>
                  <p className="text-xs leading-relaxed text-white/45 font-normal">{desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── §12 RESOURCE ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-b" style={{ background: P.stone, borderColor: P.stoneBorder }}>
        <div className="max-w-7xl mx-auto">
          <ScrollReveal y={20}>
            <div className="flex flex-col lg:flex-row items-center gap-12 p-10 bg-white rounded-3xl border"
              style={{ borderColor: P.border }}>
              <div className="shrink-0">
                <div className="w-44 h-56 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center"
                  style={{ background: `linear-gradient(160deg, ${P.navy} 0%, #0D2350 100%)` }}>
                  <Shield size={36} className="mb-3" style={{ color: P.accent }} />
                  <p className="text-center text-white font-bold text-sm leading-tight px-4">PDPA<br />Compliance<br />Guide</p>
                  <p className="text-[9px] text-white/40 font-mono mt-2">2025 EDITION</p>
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold font-mono text-white"
                    style={{ background: P.blue }}>FREE</div>
                </div>
              </div>
              <div className="flex-1 space-y-5">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold font-mono uppercase tracking-wider border"
                  style={{ color: P.blue, borderColor: P.border, background: P.mist }}>
                  DPO Recommended
                </span>
                <h2 className="text-2xl lg:text-3xl font-bold leading-[1.1]" style={{ color: P.navy }}>
                  The 2025 East Africa PDPA Compliance Guide
                </h2>
                <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>
                  A comprehensive playbook for Data Protection Officers covering Tanzania PDPA and Kenya DPA requirements. Includes a self-assessment checklist, RoPA template, consent language examples, and a breach response runbook — co-authored with East African privacy law specialists.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <a href="/resources/pdpa-guide"
                    suppressHydrationWarning
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm font-mono text-white"
                    style={{ background: P.blue }}>
                    Download Free Guide <ArrowRight size={14} />
                  </a>
                  <a href="/assessment"
                    suppressHydrationWarning
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm font-mono border transition-all hover:bg-slate-50"
                    style={{ color: P.navy, borderColor: P.stoneBorder }}>
                    Run Assessment Instead
                  </a>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── §13 NGAO WHITE-LABEL ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-b" style={{ background: P.bg, borderColor: P.stoneBorder }}>
        <div className="max-w-4xl mx-auto">
          <ScrollReveal y={16}>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8 p-8 bg-white rounded-2xl border"
              style={{ borderColor: P.border }}>
              <div className="shrink-0">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: P.mist }}>
                  <FileLock2 size={28} style={{ color: P.blue }} />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold uppercase" style={{ color: P.navy }}>
                    Also available as a white-label product — Ngao
                  </h3>
                  <span className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider font-mono"
                    style={{ background: P.mist, color: P.blue, border: `1px solid ${P.border}` }}>
                    White-label
                  </span>
                </div>
                <p className="text-sm leading-relaxed font-normal" style={{ color: P.sub }}>
                  Ondi's PDPA Compliance Suite is also offered as Ngao — a white-labelled, standalone product for organisations that want a dedicated compliance environment under their own branding. All capabilities originate in Ondi and are fully available in both deployments.
                </p>
              </div>
              <a href="/contact"
                suppressHydrationWarning
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider font-mono text-white"
                style={{ background: P.blue }}>
                Request white-label access <ArrowRight size={13} />
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── §14 FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="py-32 px-6" style={{ background: P.bg }}>
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <ScrollReveal y={20}>
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-[0.2em] font-mono" style={{ color: P.blue }}>
                Start today. The law already applies.
              </span>
              <h2 className="text-3xl lg:text-5xl font-bold leading-[1.08]" style={{ color: P.navy }}>
                Know your compliance<br />position in 15 minutes.
              </h2>
              <p className="text-base leading-relaxed font-normal max-w-xl mx-auto" style={{ color: P.sub }}>
                Our free PDPA readiness assessment generates a maturity score, gap report, and prioritised remediation plan — specific to your organisation and jurisdiction.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal y={14} delay={0.1}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/assessment"
                suppressHydrationWarning
                className="group inline-flex items-center justify-center gap-2 px-10 py-4 rounded-full font-bold text-sm text-white shadow-lg transition-all"
                style={{ background: P.blue }}>
                Run Free Assessment
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a href="/contact"
                suppressHydrationWarning
                className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-full font-bold text-sm border transition-all hover:bg-white"
                style={{ color: P.navy, borderColor: P.stoneBorder }}>
                Talk to a Privacy Expert
              </a>
            </div>
          </ScrollReveal>
          <p className="text-xs font-normal" style={{ color: P.sub }}>
            Free for the first assessment · No setup required · Tanzania PDPA & Kenya DPA covered
          </p>
        </div>
      </section>

      <MainFooter />
    </div>
  );
}
