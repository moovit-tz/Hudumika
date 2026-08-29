'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OndiBrand, BrandWatermark } from '@/components/OneUI';
import { Loader2, ArrowRight, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';

type Step = 'phone' | 'status' | 'otp' | 'done';
type Status = 'none' | 'pending' | 'cooldown' | 'awaiting_contact_confirmation' | 'ready_to_complete';

function formatPhone(p: string) {
  let cleaned = p.trim().replace(/\s+/g, '');
  if (cleaned.startsWith('0')) cleaned = '255' + cleaned.substring(1);
  else if (!cleaned.startsWith('255')) cleaned = '255' + cleaned;
  return cleaned;
}

export default function RecoveryPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<Step>('phone');
  const [status, setStatus] = useState<Status>('none');
  const [requestId, setRequestId] = useState('');
  const [cooldownEndsAt, setCooldownEndsAt] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const formatted = formatPhone(phone);
    try {
      await fetch(`${API_URL}/auth/recovery/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formatted }),
      });
      await checkStatus(formatted);
      setStep('status');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(formatted: string) {
    try {
      const res = await fetch(`${API_URL}/auth/recovery/status?phoneNumber=${formatted}`);
      const data = await res.json();
      setStatus(data.status);
      setRequestId(data.requestId || '');
      setCooldownEndsAt(data.cooldownEndsAt || null);
    } catch {
      setError('Could not check status. Please try again.');
    }
  }

  async function handleRefresh() {
    setLoading(true);
    await checkStatus(formatPhone(phone));
    setLoading(false);
  }

  async function handleSendOtp() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/recovery/${requestId}/send-completion-otp`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setStep('otp');
    } catch {
      setError('Could not send the completion code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/recovery/${requestId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formatPhone(phone), otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setStep('done');
    } catch (err: any) {
      setError(err.message === 'invalid_otp' ? 'Incorrect code.' : 'Could not complete recovery. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const statusCopy: Record<Status, string> = {
    none: '',
    pending: "We've notified your recovery contacts. This can take a little while — check back later.",
    cooldown: 'A contact approved your request. For safety, there is a waiting period before recovery can complete.',
    awaiting_contact_confirmation: 'The waiting period has passed — your contact needs to give one final confirmation.',
    ready_to_complete: "You're ready to finish recovering your account.",
  };

  return (
    <div className="min-h-screen flex font-sans">
      <div className="hidden lg:flex lg:w-[46%] bg-[#001633] flex-col justify-between p-16 relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.08} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <div className="relative z-10" onClick={() => router.push('/')} role="button" tabIndex={0} aria-label="Go to home">
          <OndiBrand size={26} theme="dark" className="cursor-pointer hover:scale-105 transition-transform duration-300" />
        </div>
        <div className="relative z-10 space-y-4">
          <p className="text-xs font-bold text-[#4253D1] uppercase tracking-widest font-mono">Account Recovery</p>
          <h1 className="text-4xl font-bold text-white uppercase leading-tight">Lost access?<br />Your contacts can help.</h1>
          <p className="text-sm text-white/45 font-normal leading-relaxed max-w-xs">
            Recovery requires approval from a trusted contact and a waiting period — this protects you even if someone else tries to use this page.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.div key="phone" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="mb-10 space-y-2">
                  <h2 className="text-3xl font-bold text-[#001633] uppercase tracking-tight">Can't sign in?</h2>
                  <p className="text-sm text-slate-400 font-normal">Enter your phone number to start account recovery.</p>
                </div>
                <form onSubmit={handleRequest} className="space-y-6">
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#001633] text-xs font-bold font-mono border-r border-slate-200 pr-4">+255</span>
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-4 pl-20 pr-5 text-[#001633] font-bold text-sm focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-all font-mono"
                      placeholder="700 000 000" required
                    />
                  </div>
                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                  <button type="submit" disabled={loading} className="w-full py-4 bg-[#001633] text-white rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:bg-[#4253D1] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Start Recovery <ArrowRight size={14} /></>}
                  </button>
                  <button type="button" onClick={() => router.push('/login')} className="w-full text-center text-xs font-mono font-bold text-slate-400 uppercase hover:text-[#4253D1] transition-colors">
                    Back to sign in
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'status' && (
              <motion.div key="status" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="mb-10 space-y-2">
                  <h2 className="text-3xl font-bold text-[#001633] uppercase tracking-tight">Recovery Status</h2>
                </div>
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 mb-6">
                  {status === 'ready_to_complete' ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <Clock size={18} className="text-amber-500 shrink-0 mt-0.5" />}
                  <p className="text-sm text-slate-600">{statusCopy[status] || 'No recovery request found for this number.'}</p>
                </div>
                {error && <p className="text-xs text-red-500 font-medium mb-4">{error}</p>}
                {status === 'ready_to_complete' ? (
                  <button onClick={handleSendOtp} disabled={loading} className="w-full py-4 bg-[#4253D1] text-white rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:bg-[#1A3060] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Completion Code'}
                  </button>
                ) : (
                  <button onClick={handleRefresh} disabled={loading} className="w-full py-4 bg-white border border-slate-200 text-[#001633] rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:border-[#4253D1] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh Status'}
                  </button>
                )}
                <button type="button" onClick={() => setStep('phone')} className="w-full text-center text-xs font-mono font-bold text-slate-400 uppercase hover:text-[#4253D1] transition-colors mt-4">
                  Use a different number
                </button>
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="mb-10 space-y-2">
                  <h2 className="text-3xl font-bold text-[#001633] uppercase tracking-tight">Finish Recovery</h2>
                  <p className="text-sm text-slate-400 font-normal flex items-start gap-2">
                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                    Completing this will sign you out everywhere and require setting up a new Authenticator.
                  </p>
                </div>
                <form onSubmit={handleComplete} className="space-y-6">
                  <input
                    type="text" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-4 text-center text-2xl font-black font-mono tracking-[0.7em] text-[#001633] focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-all"
                    placeholder="000000" required autoFocus
                  />
                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                  <button type="submit" disabled={loading || otp.length < 6} className="w-full py-4 bg-[#001633] text-white rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:bg-[#4253D1] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Recovery'}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="mb-8 space-y-3 text-center">
                  <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
                  <h2 className="text-2xl font-bold text-[#001633] uppercase tracking-tight">Recovery Complete</h2>
                  <p className="text-sm text-slate-400 font-normal">
                    Please sign in again with your phone number to set up a new Ondi Authenticator.
                  </p>
                </div>
                <button onClick={() => router.push('/login')} className="w-full py-4 bg-[#001633] text-white rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:bg-[#4253D1] transition-all">
                  Go to Sign In
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
