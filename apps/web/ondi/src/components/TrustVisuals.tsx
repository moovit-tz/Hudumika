'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, UserCheck, Building2, Zap, Fingerprint, CheckCircle2, Clock } from 'lucide-react';

export function TrustEcosystem() {
  return (
    <div className="relative w-full max-w-2xl h-[400px] flex items-center justify-center">
      {/* Central Hub */}
      <motion.div 
        animate={{ 
          scale: [1, 1.05, 1],
          boxShadow: [
            "0 0 20px rgba(0, 82, 255, 0.1)",
            "0 0 40px rgba(0, 82, 255, 0.2)",
            "0 0 20px rgba(0, 82, 255, 0.1)"
          ]
        }}
        transition={{ duration: 4, repeat: Infinity }}
        className="z-10 w-32 h-32 rounded-[10px] bg-[#0052FF] flex flex-col items-center justify-center text-white shadow-2xl shadow-blue-500/40 border-4 border-white"
      >
        <ShieldCheck size={40} />
        <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Ondi</span>
      </motion.div>

      {/* Connected Nodes */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Bank Node */}
        <motion.div 
          initial={{ x: -150, y: -80, opacity: 0 }}
          animate={{ x: -150, y: -80, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute p-4 bg-white rounded-[10px] border border-slate-200 shadow-xl flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 rounded-[10px] bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 size={24} />
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Bank</span>
          <div className="flex gap-1">
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
          </div>
        </motion.div>

        {/* User Node */}
        <motion.div 
          initial={{ x: 150, y: -80, opacity: 0 }}
          animate={{ x: 150, y: -80, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="absolute p-4 bg-white rounded-[10px] border border-slate-200 shadow-xl flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 rounded-[10px] bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck size={24} />
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Verified User</span>
          <div className="flex gap-1">
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
          </div>
        </motion.div>

        {/* Service Node */}
        <motion.div 
          initial={{ x: 0, y: 150, opacity: 0 }}
          animate={{ x: 0, y: 150, opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="absolute p-4 bg-white rounded-[10px] border border-slate-200 shadow-xl flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 rounded-[10px] bg-amber-50 text-amber-600 flex items-center justify-center">
            <Zap size={24} />
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Digital Service</span>
          <div className="flex gap-1">
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
             <div className="w-1 h-1 rounded-full bg-emerald-500" />
          </div>
        </motion.div>
      </div>

      {/* Pulsing Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 400">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0052FF" stopOpacity="0" />
            <stop offset="50%" stopColor="#0052FF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0052FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* To Bank */}
        <path d="M300 200 L150 120" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="5,5" />
        <motion.path 
          d="M300 200 L150 120" 
          stroke="url(#lineGrad)" 
          strokeWidth="3" 
          strokeDasharray="20,180"
          animate={{ strokeDashoffset: [200, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />

        {/* To User */}
        <path d="M300 200 L450 120" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="5,5" />
        <motion.path 
          d="M300 200 L450 120" 
          stroke="url(#lineGrad)" 
          strokeWidth="3" 
          strokeDasharray="20,180"
          animate={{ strokeDashoffset: [-200, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />

        {/* To Service */}
        <path d="M300 200 L300 350" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="5,5" />
        <motion.path 
          d="M300 200 L300 350" 
          stroke="url(#lineGrad)" 
          strokeWidth="3" 
          strokeDasharray="20,180"
          animate={{ strokeDashoffset: [200, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </div>
  );
}

// ── TRUST PULSE ─────────────────────────────────────────────────────────
// IPF-inspired floating dashboard widget for the landing page hero
export function TrustPulse() {
  const signals = [
    { label: 'Identity Match', value: 98, color: '#4253D1' },
    { label: 'Behavioral Score', value: 84, color: '#10B981' },
    { label: 'Financial Trust', value: 76, color: '#8B5CF6' },
  ];

  const events = [
    { icon: CheckCircle2, label: 'KYC Verified', time: '2s ago', color: '#10B981' },
    { icon: Fingerprint, label: 'Biometric Passed', time: '8s ago', color: '#4253D1' },
    { icon: Clock, label: 'Score Updated', time: '1m ago', color: '#8B5CF6' },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* ── Floating Score Badge ─ top-right ── */}
      <motion.div
        initial={{ opacity: 0, y: -16, x: 16 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.4, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -top-8 -right-8 z-20"
      >
        <div className="bg-white rounded-[10px] border border-slate-100 shadow-2xl shadow-blue-900/10 p-5 w-52">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-space">Trust Score</span>
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-[#10B981]"
            />
          </div>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-3xl font-bold text-[#001633] font-barlow leading-none">720</span>
            <span className="text-xs font-bold text-[#10B981] uppercase font-space mb-1">High Trust</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '86%' }}
              transition={{ duration: 1.5, delay: 0.8, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-[#4253D1] to-[#10B981] rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* ── Floating Signal Bars ─ bottom-left ── */}
      <motion.div
        initial={{ opacity: 0, y: 16, x: -16 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.6, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -bottom-8 -left-8 z-20"
      >
        <div className="bg-white rounded-[10px] border border-slate-100 shadow-2xl shadow-blue-900/10 p-5 w-56 space-y-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-space block">Signal Breakdown</span>
          {signals.map((s, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-space">{s.label}</span>
                <span className="text-[10px] font-bold font-space" style={{ color: s.color }}>{s.value}%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${s.value}%` }}
                  transition={{ duration: 1.2, delay: 0.9 + i * 0.15, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: s.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Floating Activity Feed ─ right-center ── */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute top-1/2 -translate-y-1/2 -right-12 z-20 hidden xl:block"
      >
        <div className="bg-white rounded-[10px] border border-slate-100 shadow-2xl shadow-blue-900/10 p-5 w-52 space-y-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-space block">Live Events</span>
          {events.map((e, i) => {
            const Icon = e.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 + i * 0.15 }}
                className="flex items-center gap-3"
              >
                <div className="w-7 h-7 rounded-[10px] flex items-center justify-center shrink-0" style={{ backgroundColor: `${e.color}12` }}>
                  <Icon size={14} style={{ color: e.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-[#001633] uppercase font-space truncate">{e.label}</p>
                  <p className="text-[9px] text-slate-400 font-space">{e.time}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

export function PassportCard() {
  return (
    <motion.div 
      initial={{ rotateY: -15, rotateX: 10, opacity: 0 }}
      animate={{ rotateY: -15, rotateX: 10, opacity: 1 }}
      whileHover={{ rotateY: -5, rotateX: 5 }}
      transition={{ duration: 0.8 }}
      className="relative w-80 h-[480px] bg-gradient-to-br from-[#0F1F3D] to-[#1A3060] rounded-[10px] p-8 text-white shadow-2xl preserve-3d"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="flex justify-between items-start mb-10">
        <div className="text-xl font-bold tracking-tight text-white">ondi</div>
        <div className="w-10 h-8 bg-gradient-to-br from-[#E8B96A] to-[#C9923A] rounded-[10px] opacity-80" />
      </div>

      <div className="w-20 h-20 rounded-[10px] bg-white/10 border border-white/20 flex items-center justify-center text-3xl mb-6 backdrop-blur-sm">
        👤
      </div>

      <div className="space-y-1 mb-8">
        <h4 className="text-xl font-medium font-dm-sans">Amara Osei-Bonsu</h4>
        <p className="text-[10px] text-white/40 font-mono tracking-widest">ID · KE-2024-779341-A</p>
      </div>

      <div className="space-y-3 mb-10">
        <div className="flex flex-wrap gap-2">
           <Badge label="Identity" />
           <Badge label="Phone" />
           <Badge label="Bank" />
           <Badge label="Biometric" />
        </div>
      </div>

      <div className="pt-6 border-t border-white/10">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Trust Score</span>
          <span className="text-sm font-bold text-[#E8B96A]">88 / 100</span>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "88%" }}
            transition={{ duration: 2, delay: 1 }}
            className="h-full bg-gradient-to-r from-[#C9923A] to-[#4ADE80]" 
          />
        </div>
      </div>

      <div className="absolute bottom-[-40px] right-[-40px] w-40 h-40 bg-[#C9923A]/10 blur-[40px] rounded-full pointer-events-none" />
    </motion.div>
  );
}

export function ScrollReveal({ children, delay = 0, x = 0, y = 20 }: { children: React.ReactNode, delay?: number, x?: number, y?: number }) {
  // Only include x/y in motion values when non-zero. If x=0 or y=0 is
  // passed explicitly, framer-motion adds translateX(0)/translateY(0) to
  // the inline style on the client but may omit it on the server, causing
  // a React 19 hydration mismatch across the entire subtree.
  const initial: Record<string, number> = { opacity: 0 };
  const animate: Record<string, number> = { opacity: 1 };
  if (x !== 0) { initial.x = x; animate.x = 0; }
  if (y !== 0) { initial.y = y; animate.y = 0; }

  return (
    <motion.div
      suppressHydrationWarning
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full flex items-center gap-2 backdrop-blur-md">
      <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
      <span className="text-[10px] font-medium text-white/80">{label}</span>
    </div>
  );
}
