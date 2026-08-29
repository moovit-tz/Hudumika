'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MainNavbar from '@/components/MainNavbar';
import MainFooter from '@/components/MainFooter';
import { GlassPanel, BrandWatermark, GridBackground } from '@/components/OneUI';
import { ScrollReveal } from '@/components/TrustVisuals';
import {
  Shield,
  Lock,
  Key,
  Database,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Cpu,
  FileCheck,
  Server,
  Zap,
  Users,
  AlertTriangle,
  Scale,
  ArrowRight,
  Fingerprint
} from 'lucide-react';

const SECURITY_PILLARS = [
  {
    icon: EyeOff,
    title: 'Zero-Knowledge Proofs',
    desc: 'Verify individual attributes—such as age, nationality, or registration status—without transmitting or exposing the underlying raw Personal Identifiable Information (PII).',
    badge: 'Cryptography'
  },
  {
    icon: Cpu,
    title: 'Hardware-Bound Keys',
    desc: 'Private keys are secured in biometric-backed Secure Enclaves (TPM/HSM). Authentication is tied directly to physical hardware passkeys rather than vulnerable passwords.',
    badge: 'Hardware Protection'
  },
  {
    icon: RefreshCw,
    title: 'Live Registry Binding',
    desc: 'Direct, real-time cryptographic sync with official authoritative registries (NIDA, TRA, BRELA) ensures credentials are instantly valid and impossible to forge.',
    badge: 'Data Integrity'
  },
  {
    icon: Lock,
    title: 'Consent-Gated Architecture',
    desc: 'Users hold full control over their credential sharing. Third-party applications can only request specific attributes, and consent can be revoked instantly from the dashboard.',
    badge: 'User Sovereignty'
  }
];

const REGULATORY_COMPLIANCE = [
  {
    authority: 'Tanzania Personal Data Protection Authority (PDPA)',
    standard: 'Tanzania PDPA Act 2022',
    alignment: 'Full compliance through localized data sovereignty, decentralized storage of biometric keys, and explicit user-revocable consent logs.',
    status: 'Compliant'
  },
  {
    authority: 'Tanzania Communications Regulatory Authority (TCRA)',
    standard: 'EPOCA / SIM Card KYC Standards',
    alignment: 'Authoritative biometric alignment mapping NIDA registration databases directly to mobile/device hardware bindings for zero-fraud digital identities.',
    status: 'Compliant'
  },
  {
    authority: 'Business Registrations and Licensing Agency (BRELA)',
    standard: 'Corporate Governance & KYB Checks',
    alignment: 'Instant verification of director rosters, UBO identification, and enterprise incorporation numbers through cryptographically validated API nodes.',
    status: 'Compliant'
  },
  {
    authority: 'General Data Protection Regulation (GDPR)',
    standard: 'EU GDPR Standards',
    alignment: 'Adheres to strict minimization rules (ZKP), the Right to Be Forgotten, and absolute consent gating for international/cross-border digital engagements.',
    status: 'Aligned / Compliant'
  }
];

export default function SecurityPage() {
  // ZKP interactive simulator state
  const [simStep, setSimStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [selectedAttribute, setSelectedAttribute] = useState<string>('age');

  const runSimulation = () => {
    setIsSimulating(true);
    setSimStep(1);
    setTimeout(() => {
      setSimStep(2);
      setTimeout(() => {
        setSimStep(3);
        setIsSimulating(false);
      }, 1500);
    }, 1200);
  };

  const resetSimulation = () => {
    setSimStep(0);
    setIsSimulating(false);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#232323] font-sans selection:bg-[#ECEEFF] selection:text-[#4253D1] overflow-x-hidden">
      <MainNavbar />

      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="relative pt-56 pb-24 px-6 overflow-hidden bg-[#FAFAF8]">
        <BrandWatermark useImage={true} opacity={0.1} className="absolute inset-0 w-full h-full -z-30 pointer-events-none" />
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,rgba(236,238,255,0.6)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#4253D1]/5 blur-[140px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#ECEEFF] border border-[#D5D9F5] text-[#4253D1] mb-8"
          >
            <Shield size={13} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest font-mono">Security & Trust Center</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="text-4xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-[#001633] uppercase max-w-5xl mx-auto font-sans"
          >
            Cryptographic trust.<br />
            <span className="text-[#4253D1]">Zero compromised data.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-base sm:text-lg text-[#4B5563] font-normal leading-relaxed max-w-3xl mx-auto mt-6"
          >
            Ondi replaces vulnerable centralized database structures and simple paperwork verification with localized, hardware-secured, zero-knowledge credentials. Prove who you are without risking your privacy.
          </motion.p>
        </div>
      </section>

      {/* ── SECURITY PILLARS GRID ────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white border-y border-slate-100 relative overflow-hidden">
        <GridBackground />
        <div className="max-w-7xl mx-auto relative z-10 space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">How We Protect You</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Four Pillars of Digital Sovereignty</h2>
              <p className="text-sm text-[#4B5563] max-w-2xl mx-auto leading-relaxed font-normal">
                Our infrastructure is engineered from the ground up to prevent data honeypots and identity forgery.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {SECURITY_PILLARS.map(({ icon: Icon, title, desc, badge }, i) => (
              <ScrollReveal key={title} y={24} delay={i * 0.08}>
                <div className="group p-8 bg-[#FAFAF8] border border-slate-100 rounded-2xl space-y-6 hover:border-[#D5D9F5] hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center group-hover:bg-[#4253D1] group-hover:text-white transition-all duration-500">
                      <Icon size={22} />
                    </div>
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono bg-[#ECEEFF] px-3 py-1 rounded-full">{badge}</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-[#001633] uppercase tracking-tight">{title}</h3>
                    <p className="text-sm text-[#4B5563] leading-relaxed font-normal">{desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── ZKP INTERACTIVE SIMULATOR ────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FAFAF8] relative overflow-hidden">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            {/* Context Left */}
            <div className="lg:col-span-5 space-y-8">
              <ScrollReveal y={20}>
                <div className="space-y-4">
                  <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Interactive Cryptographic Sandbox</span>
                  <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Zero-Knowledge Proof Simulator</h2>
                  <p className="text-sm text-[#4B5563] leading-relaxed font-normal">
                    Witness how Ondi verifies credentials. Zero-Knowledge Cryptography allows you to prove to a third party that a statement is mathematically true (e.g., "I am over 18 years old") without sharing the actual value (e.g., your birth date).
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal y={20} delay={0.1}>
                <div className="space-y-4">
                  <p className="text-xs font-bold text-[#001633] uppercase tracking-wider font-mono">Select an Attribute to Prove:</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'age', label: 'Age Validation (>18)' },
                      { id: 'tin', label: 'TRA Compliance' },
                      { id: 'nida', label: 'NIDA Legal Name match' },
                      { id: 'citizenship', label: 'E-African Citizenship' }
                    ].map((attr) => (
                      <button
                        key={attr.id}
                        onClick={() => {
                          setSelectedAttribute(attr.id);
                          resetSimulation();
                        }}
                        disabled={isSimulating}
                        className={`px-4 py-3 rounded-xl text-xs font-bold tracking-wide transition-all border text-left flex items-center justify-between ${
                          selectedAttribute === attr.id
                            ? 'bg-[#ECEEFF] border-[#4253D1] text-[#4253D1] shadow-inner'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span>{attr.label}</span>
                        {selectedAttribute === attr.id && <CheckCircle size={12} className="text-[#4253D1]" />}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={runSimulation}
                    disabled={isSimulating}
                    className="w-full relative overflow-hidden group py-4 bg-[#001633] hover:bg-[#4253D1] text-white rounded-full font-bold text-xs uppercase tracking-widest font-mono transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{isSimulating ? 'Simulating Cryptography...' : 'Generate ZKP Proof'}</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </ScrollReveal>
            </div>

            {/* Sandbox Visual Right */}
            <div className="lg:col-span-7">
              <ScrollReveal y={20} x={20}>
                <GlassPanel className="p-8 bg-white border-slate-100 shadow-2xl shadow-blue-900/5 relative min-h-[460px] flex flex-col justify-between overflow-hidden rounded-[2rem]">
                  {/* Decorative background grids */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-30 pointer-events-none" />

                  {/* Header info */}
                  <div className="relative z-10 flex justify-between items-center border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Sandbox Console</span>
                    </div>
                    <span className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono bg-[#ECEEFF] px-3 py-1 rounded-full">
                      Mode: Attribute Validation
                    </span>
                  </div>

                  {/* Dynamic Simulation Terminal */}
                  <div className="relative z-10 flex-1 py-8 flex flex-col justify-center items-center">
                    <AnimatePresence mode="wait">
                      {simStep === 0 && (
                        <motion.div
                          key="step0"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="text-center space-y-6 max-w-sm"
                        >
                          <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                            <Fingerprint size={32} className="animate-pulse" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-bold text-[#001633] uppercase">Identity Verification Pending</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-normal">
                              Press "Generate ZKP Proof" to trigger local device biometrics (Secure Enclave) and generate the cryptographic proof.
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {simStep === 1 && (
                        <motion.div
                          key="step1"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="text-center space-y-6 max-w-sm"
                        >
                          <div className="relative w-20 h-20 mx-auto">
                            <div className="absolute inset-0 rounded-full border-4 border-[#ECEEFF]" />
                            <motion.div
                              className="absolute inset-0 rounded-full border-4 border-t-[#4253D1] border-r-transparent border-b-transparent border-l-transparent"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                              <Cpu size={24} className="animate-bounce" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-bold text-[#4253D1] uppercase">Computing ZKP Locally</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-mono">
                              [Secure Enclave] Requesting verified {selectedAttribute} signature from local wallet...
                              <br />
                              Generating mathematically blind validation certificate...
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {simStep === 2 && (
                        <motion.div
                          key="step2"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="text-center space-y-6 max-w-sm"
                        >
                          <div className="w-20 h-20 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-[#4253D1]">
                            <Lock size={32} className="animate-pulse" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-bold text-[#001633] uppercase">Transmitting Blind Proof</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-mono">
                              Sending certificate payload...
                              <br />
                              <span className="text-[#4253D1] font-semibold">raw_pii: &lt;RESTRICTED_BY_ZKP&gt;</span>
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {simStep === 3 && (
                        <motion.div
                          key="step3"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="text-center space-y-6 max-w-md"
                        >
                          <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-500">
                            <CheckCircle size={32} />
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-sm font-bold text-emerald-600 uppercase">Verification Passed!</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-normal">
                              The verifier successfully confirmed the mathematical truth of your attribute:
                            </p>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2 max-w-sm mx-auto font-mono text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Statement:</span>
                                <span className="font-bold text-[#001633]">
                                  {selectedAttribute === 'age' && 'User is Age > 18'}
                                  {selectedAttribute === 'tin' && 'TIN status is compliant'}
                                  {selectedAttribute === 'nida' && 'Legal name validates'}
                                  {selectedAttribute === 'citizenship' && 'User is EAC Citizen'}
                                </span>
                              </div>
                              <div className="flex justify-between border-t border-slate-200/50 pt-2">
                                <span className="text-slate-400">Exposed PII:</span>
                                <span className="font-bold text-emerald-600">0 Bytes (Zero Data Shared)</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Footer control panel */}
                  <div className="relative z-10 flex justify-between items-center border-t border-slate-100 pt-4 text-[10px] text-slate-400 font-mono">
                    <span>Algorithm: Bulletproofs / ZK-SNARKs</span>
                    <button
                      onClick={resetSimulation}
                      className="text-[#4253D1] hover:underline font-bold"
                    >
                      Reset Simulator
                    </button>
                  </div>
                </GlassPanel>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURE ARCHITECTURE OVERVIEW ─────────────────────────────────── */}
      <section className="py-28 px-6 bg-white border-b border-slate-100 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10 space-y-20">
          <ScrollReveal y={20}>
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Platform Infrastructure</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Secured at Every Layer</h2>
              <p className="text-sm text-[#4B5563] leading-relaxed font-normal">
                How Ondi bridges secure enclave biometrics, decentralized key storage, and authoritative synchronization.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            <ScrollReveal y={24} delay={0.05}>
              <div className="p-8 bg-[#FAFAF8] border border-slate-100 rounded-3xl space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                  <Cpu size={22} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-[#001633] uppercase">Secure Enclave Binding</h3>
                  <p className="text-sm text-slate-500 leading-relaxed font-normal">
                    Ondi uses WebAuthn credentials bound directly to physical device enclaves (e.g., iOS FaceID / Android Fingerprint TPM). Biometric data never leaves the device.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.15}>
              <div className="p-8 bg-[#FAFAF8] border border-slate-100 rounded-3xl space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                  <Database size={22} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-[#001633] uppercase">Decentralized Credentials</h3>
                  <p className="text-sm text-slate-500 leading-relaxed font-normal">
                    Rather than building a central data pool vulnerable to hacks, credential payloads are cryptographically signed by issuers and stored directly inside the user's secure wallet.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal y={24} delay={0.25}>
              <div className="p-8 bg-[#FAFAF8] border border-slate-100 rounded-3xl space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center">
                  <Server size={22} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-[#001633] uppercase">Authoritative Registry Sync</h3>
                  <p className="text-sm text-slate-500 leading-relaxed font-normal">
                    Data integrity is verified using real-time API nodes with NIDA, TRA, and BRELA. Credential validity is cryptographically computed directly from source databases.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── REGULATORY COMPLIANCE MATRIX ─────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FAFAF8] relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10 space-y-16">
          <ScrollReveal y={20}>
            <div className="text-center space-y-3">
              <span className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Standards & Auditing</span>
              <h2 className="text-3xl lg:text-5xl font-bold text-[#001633] uppercase leading-tight">Regulatory Compliance & Alignment</h2>
              <p className="text-sm text-[#4B5563] max-w-2xl mx-auto leading-relaxed font-normal">
                Ondi satisfies strict regional communications acts, national data security laws, and global privacy standards.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={24}>
            <div className="max-w-5xl mx-auto overflow-hidden bg-white border border-slate-200/60 rounded-3xl shadow-xl shadow-blue-900/5">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#001633] text-white font-mono text-[10px] uppercase tracking-wider">
                      <th className="py-5 px-6 font-bold">Regulatory Authority</th>
                      <th className="py-5 px-6 font-bold">Standard / Act</th>
                      <th className="py-5 px-6 font-bold">Ondi Alignment Details</th>
                      <th className="py-5 px-6 font-bold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-normal text-slate-600">
                    {REGULATORY_COMPLIANCE.map((row) => (
                      <tr key={row.authority} className="hover:bg-slate-50 transition-colors">
                        <td className="py-5 px-6 font-bold text-[#001633] uppercase leading-relaxed max-w-[200px]">
                          {row.authority}
                        </td>
                        <td className="py-5 px-6 font-mono text-[11px] text-slate-500 font-semibold">
                          {row.standard}
                        </td>
                        <td className="py-5 px-6 leading-relaxed text-slate-500 font-normal">
                          {row.alignment}
                        </td>
                        <td className="py-5 px-6 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wider text-[9px] font-mono border border-emerald-200">
                            <CheckCircle size={10} />
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── SECURITY CERTIFICATION FLAGS / ASSURANCES ────────────────────── */}
      <section className="py-24 px-6 bg-[#001633] text-white relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.06} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <div className="max-w-4xl mx-auto relative z-10 text-center space-y-12">
          <ScrollReveal y={20}>
            <div className="space-y-4">
              <span className="text-xs font-bold text-blue-300 uppercase tracking-widest font-mono">Our Trust Commitment</span>
              <h2 className="text-3xl lg:text-5xl font-bold uppercase leading-tight font-sans">Security Built By Design</h2>
              <p className="text-sm text-white/50 leading-relaxed font-normal max-w-2xl mx-auto">
                We believe security is not an add-on; it is the fundamental core. Ondi maintains absolute transparency in key custody and data architecture.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-3 gap-6 text-left">
            {[
              { title: 'Zero PII Custody', desc: 'Ondi does not cache or persist raw NIDA NIN files, passport documents, or transactional tax histories on cloud databases.' },
              { title: 'Cryptographic Auditing', desc: 'Every validation query leaves a non-repudiable audit log signed by the user\'s private hardware key.' },
              { title: 'Hardware Isolation', desc: 'All master key signing procedures are routed through hardware security modules (HSM) featuring FIPS 140-2 Level 3 compliance.' }
            ].map(({ title, desc }) => (
              <ScrollReveal key={title} y={16}>
                <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3 hover:bg-white/[0.05] transition-all">
                  <p className="text-sm font-bold text-white uppercase tracking-tight">{title}</p>
                  <p className="text-xs text-white/45 leading-relaxed font-normal">{desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white text-center relative">
        <div className="max-w-3xl mx-auto space-y-10 relative z-10">
          <ScrollReveal y={16}>
            <div className="space-y-4">
              <h2 className="text-4xl lg:text-6xl font-bold text-[#001633] uppercase leading-tight font-sans">Ready to deploy secure trust?</h2>
              <p className="text-base text-slate-500 font-normal max-w-xl mx-auto leading-relaxed">
                Connect your business to East Africa's most secure digital identity infrastructure in minutes.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal y={16} delay={0.1}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register/enterprise/kyb" className="w-full sm:w-auto relative overflow-hidden group px-12 py-5 bg-[#4253D1] text-white rounded-full font-bold text-sm uppercase tracking-wider font-mono shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-2">
                <div className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 bg-gradient-to-r from-[#4E76E5] to-[#4253D1]" />
                <span className="relative z-10">Get Started Now</span>
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
