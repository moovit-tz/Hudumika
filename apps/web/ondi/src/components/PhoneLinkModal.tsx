'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api';
import { Smartphone, X, Loader2, ShieldCheck } from 'lucide-react';

interface PhoneLinkModalProps {
  open: boolean;
  onClose: () => void;
  onLinked: (phoneNumber: string) => void;
}

/**
 * Prompts the user to add and SMS-verify a real phone number.
 * Needed for accounts created via a federated provider (Google, etc.) — those start
 * with a placeholder phone (`federated_<provider>_<sub>`) since no phone is collected
 * at signup, but phone is required for Ondi Authenticator / SMS-based recovery.
 */
export default function PhoneLinkModal({ open, onClose, onLinked }: PhoneLinkModalProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function formatPhone(p: string) {
    let cleaned = p.trim().replace(/\s+/g, '');
    if (cleaned.startsWith('0')) cleaned = '255' + cleaned.substring(1);
    else if (!cleaned.startsWith('255')) cleaned = '255' + cleaned;
    return cleaned;
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch('/auth/phone/link/initiate', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: formatPhone(phone) }),
      });
      setStep('code');
    } catch (err: any) {
      setError(err.message === 'phone_already_in_use' ? 'That phone number is already linked to another account.' : 'Failed to send verification code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const formatted = formatPhone(phone);
      await apiFetch('/auth/phone/link/verify', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: formatted, code }),
      });
      onLinked(formatted);
      reset();
    } catch (err: any) {
      setError(err.message === 'invalid_otp' ? 'Incorrect code. Try again.' : 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('phone');
    setPhone('');
    setCode('');
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <>
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-[#0b0e14]/65 backdrop-blur-md z-[99999]"
      />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-sm bg-white rounded-[12px] shadow-2xl border border-slate-100 overflow-hidden pointer-events-auto"
        >
          <div className="p-6 bg-[#001633] border-b border-white/10 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-[#8AB4F8]" />
              <span className="text-xs font-bold uppercase tracking-wider font-space">Add Phone Number</span>
            </div>
            <button onClick={handleClose} className="w-7 h-7 rounded-[6px] border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-all">
              <X size={14} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {step === 'phone' ? (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your account was created without a phone number. Add one to enable Ondi Authenticator and SMS-based account recovery.
                </p>
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#001633] text-xs font-bold font-mono border-r border-slate-200 pr-3">+255</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      autoFocus
                      className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-16 pr-4 text-[#001633] font-bold text-sm focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-all font-mono placeholder:font-normal placeholder:text-slate-300"
                      placeholder="700 000 000"
                    />
                  </div>
                  {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading || !phone}
                    className="w-full py-3 bg-[#001633] text-white rounded-xl font-bold text-xs uppercase tracking-wider font-mono hover:bg-[#4253D1] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                  </button>
                  <button type="button" onClick={handleClose} className="w-full text-center text-xs font-bold text-slate-400 uppercase hover:text-[#4253D1] transition-colors">
                    Skip for now
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter the 6-digit code sent to <span className="font-bold text-[#001633]">+{formatPhone(phone)}</span>.
                </p>
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <input
                    type="text"
                    maxLength={6}
                    value={code}
                    onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                    autoFocus
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 text-center text-xl font-black font-mono tracking-[0.5em] text-[#001633] focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-all placeholder:font-normal placeholder:text-slate-300"
                    placeholder="000000"
                  />
                  {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading || code.length < 6}
                    className="w-full py-3 bg-[#4253D1] text-white rounded-xl font-bold text-xs uppercase tracking-wider font-mono hover:bg-[#1A3060] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck size={14} /> Verify & Save</>}
                  </button>
                  <button type="button" onClick={() => setStep('phone')} className="w-full text-center text-xs font-bold text-slate-400 uppercase hover:text-[#4253D1] transition-colors">
                    Change number
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
