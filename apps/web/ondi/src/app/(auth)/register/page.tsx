'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback } from 'react';
import { OndiBrand, BrandWatermark } from '@/components/OneUI';
import { renderGoogleButton } from '@/lib/googleAuth';
import PhoneLinkModal from '@/components/PhoneLinkModal';
import {
  ArrowRight, ShieldCheck,
  Loader2, CheckCircle, Lock, Fingerprint,
} from 'lucide-react';

type Path = 'personal' | 'business';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';

export default function RegisterPage() {
  const router = useRouter();
  // Everyone starts as a personal account — asking "individual or business" upfront
  // just adds friction before the user has any reason to care. Business details are
  // an optional toggle within the same form; KYB/organization setup happens later.
  const [path, setPath] = useState<Path>('personal');
  const [stage, setStage] = useState<'form' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', company: '', role: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [showPhoneLink, setShowPhoneLink] = useState(false);

  // Personal accounts land in the dashboard — identity verification is now
  // optional and can be started from the in-dashboard 'Verify identity' card.
  // Business accounts go straight into KYB: there's no organization yet for
  // them to land on, and leaving that until they happen to visit
  // /dashboard/enterprise meant signups could sit unverified indefinitely.
  const postAuthPath = path === 'personal' ? '/dashboard/personal' : '/register/enterprise/kyb';

  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      const res = await fetch(`${API_URL}/auth/federated/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.workspaceDomain) localStorage.setItem('workspace_domain', data.workspaceDomain);
        if (data.user?.phoneNumber?.startsWith('federated_')) {
          setShowPhoneLink(true);
        } else {
          router.push(postAuthPath);
        }
      } else {
        setGoogleError(data.error || 'Google sign-up failed. Please try again.');
      }
    } catch {
      setGoogleError('Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [router, postAuthPath]);

  function finishPhoneLink(phoneNumber?: string) {
    setShowPhoneLink(false);
    try {
      const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, phoneNumber: phoneNumber ?? stored.phoneNumber }));
    } catch { /* ignore */ }
    router.push(postAuthPath);
  }

  const googleBtnRef = useCallback((el: HTMLDivElement | null) => {
    if (el) renderGoogleButton(el, handleGoogleCredential).catch(() => {});
  }, [handleGoogleCredential]);

  const update = (field: string, val: string) => {
    setForm(p => ({ ...p, [field]: val }));
    setFieldErrors(p => {
      if (!p[field]) return p;
      const next = { ...p };
      delete next[field];
      return next;
    });
  };

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (path === 'personal') {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    } else {
      if (!form.company.trim()) errs.company = 'Company name is required';
      if (!form.role.trim()) errs.role = 'Your role is required';
    }
    const digits = form.phone.trim().replace(/\D/g, '');
    if (!digits) errs.phone = 'Phone number is required';
    else if (digits.replace(/^255/, '').replace(/^0/, '').length < 9) errs.phone = 'Enter a valid phone number';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Format phone: strip spaces, ensure starts with 255
      let phone = form.phone.trim().replace(/\s+/g, '');
      if (phone.startsWith('0')) phone = '255' + phone.slice(1);
      else if (!phone.startsWith('255') && !phone.startsWith('+')) phone = '255' + phone;
      phone = phone.replace(/^\+/, '');

      // Initiate auth (creates user if new)
      const res = await fetch(`${API_URL}/auth/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          channel: 'sms',
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      // Store phone for OTP step
      localStorage.setItem('pending_phone', phone);
      // Carry the company name into the KYB form so it isn't re-typed
      if (path === 'business' && form.company.trim()) {
        localStorage.setItem('pending_company_name', form.company.trim());
      }
      if (data.access_token) localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);

      setStage('done');
      setTimeout(() => {
        router.push(`/login?redirect=${encodeURIComponent(postAuthPath)}&phone=${encodeURIComponent(phone)}`);
      }, 1600);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  }

  const stageIdx = stage === 'form' ? 0 : 1;

  return (
    <>
    <div className="min-h-screen flex font-sans">

      {/* ── LEFT — Brand & Progress Panel ────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[38%] bg-[#001633] flex-col justify-between p-14 relative overflow-hidden">
        <BrandWatermark useImage={true} opacity={0.07} className="absolute inset-0 w-full h-full pointer-events-none -z-0" />
        <BrandWatermark opacity={0.05} size="550px" color="#ffffff" className="absolute -right-1/6 -bottom-1/6 pointer-events-none -z-0" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#4253D1]/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 cursor-pointer" onClick={() => router.push('/')} role="button" tabIndex={0} aria-label="Go to home">
          <OndiBrand size={26} theme="dark" className="hover:scale-105 transition-transform duration-300" />
        </div>

        {/* Progress steps */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-[#4253D1] uppercase tracking-widest font-mono">Account Setup</p>
            <h2 className="text-2xl font-bold text-white uppercase leading-tight">Join the Network</h2>
          </div>

          <div className="space-y-4">
            {[
              { idx: 0, label: 'Create Account', sub: 'Name & phone' },
              { idx: 1, label: 'Secure your account', sub: 'Biometrics & PIN' },
            ].map(({ idx, label, sub }) => {
              const done = stageIdx > idx;
              const active = stageIdx === idx;
              return (
                <div key={label} className="flex items-start gap-4">
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300 ${done ? 'bg-[#4253D1] border-[#4253D1]' : active ? 'border-[#4253D1] bg-transparent' : 'border-white/20 bg-transparent'}`}>
                    {done
                      ? <CheckCircle size={14} className="text-white" />
                      : <span className={`text-[10px] font-bold font-mono ${active ? 'text-[#4253D1]' : 'text-white/30'}`}>{idx + 1}</span>
                    }
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wide font-mono ${active ? 'text-white' : done ? 'text-white/60' : 'text-white/30'}`}>{label}</p>
                    <p className={`text-[10px] font-mono mt-0.5 ${active ? 'text-white/40' : 'text-white/20'}`}>{sub}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust pills */}
          <div className="space-y-2.5 pt-4 border-t border-white/10">
            {[
              { icon: ShieldCheck, label: 'NIDA Registry Connected' },
              { icon: Lock, label: 'End-to-End Encrypted' },
              { icon: Fingerprint, label: 'Biometric Secured' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#4253D1]">
                  <Icon size={13} />
                </div>
                <span className="text-[10px] text-white/40 font-mono">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest font-mono">
            © {new Date().getFullYear()} Ondi · Hudumika Group
          </p>
        </div>
      </div>

      {/* ── RIGHT — Content Panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 bg-[#FAFAF8] relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(236,238,255,0.3)_0%,rgba(250,250,248,0)_70%)] pointer-events-none" />

        {/* Mobile logo */}
        <div className="lg:hidden mb-10 cursor-pointer relative z-10" onClick={() => router.push('/')}>
          <OndiBrand size={24} theme="light" />
        </div>

        <div className="w-full max-w-lg relative z-10">
          <AnimatePresence mode="wait">

            {/* ── STAGE: SIGN UP (Google-first, deferred business toggle) ── */}
            {stage === 'form' && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold text-[#001633] uppercase tracking-tight">Create your account</h1>
                  <p className="text-sm text-slate-400 font-normal">
                    {path === 'business' ? 'Tell us about your organisation to get started.' : 'Your Ondi account is free and takes about 60 seconds.'}
                  </p>
                </div>

                <div>
                  {googleError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-mono">
                      {googleError}
                    </div>
                  )}
                  {googleLoading ? (
                    <div className="w-full py-4 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing up with Google...</span>
                    </div>
                  ) : (
                    <div ref={googleBtnRef} className="w-full" />
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">or continue with phone</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  {path === 'personal' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="First Name" id="reg-first-name" value={form.firstName} onChange={v => update('firstName', v)} placeholder="Amara" error={fieldErrors.firstName} />
                      <InputField label="Last Name" id="reg-last-name" value={form.lastName} onChange={v => update('lastName', v)} placeholder="Mwangi" error={fieldErrors.lastName} />
                    </div>
                  ) : (
                    <>
                      <InputField label="Company Name" id="reg-company" value={form.company} onChange={v => update('company', v)} placeholder="Kilimanjaro Freight Ltd." error={fieldErrors.company} />
                      <InputField label="Your Role" id="reg-role" value={form.role} onChange={v => update('role', v)} placeholder="HR Director" error={fieldErrors.role} />
                    </>
                  )}
                  <div className="relative">
                    <label htmlFor="reg-phone" className="block text-[10px] font-bold text-slate-400 tracking-widest uppercase font-mono mb-2">Phone</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#001633] text-xs font-bold font-mono border-r border-slate-200 pr-4">+255</span>
                      <input
                        id="reg-phone"
                        type="tel"
                        value={form.phone}
                        onChange={e => update('phone', e.target.value)}
                        aria-invalid={!!fieldErrors.phone}
                        className={`w-full bg-white border rounded-xl py-4 pl-20 pr-5 text-[#001633] font-bold text-sm focus:outline-none focus:ring-4 transition-all font-mono placeholder:font-normal placeholder:text-slate-300 ${fieldErrors.phone ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-[#4253D1] focus:ring-[#4253D1]/10'}`}
                        placeholder="700 000 000"
                      />
                    </div>
                    {fieldErrors.phone && <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.phone}</p>}
                  </div>
                  <InputField
                    label="Email"
                    id="reg-email"
                    type="email"
                    value={form.email}
                    onChange={v => update('email', v)}
                    placeholder={path === 'business' ? 'you@company.com' : 'amara.mwangi@gmail.com'}
                    error={fieldErrors.email}
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-mono">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    id="register-submit-btn"
                    disabled={loading}
                    className="w-full mt-2 py-4 bg-[#001633] text-white rounded-xl font-bold text-sm uppercase tracking-wider font-mono hover:bg-[#4253D1] transition-all active:scale-[0.98] shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue to Verification <ArrowRight size={14} /></>}
                  </button>
                </form>

                <p className="text-center text-xs text-slate-400 font-normal">
                  {path === 'personal' ? (
                    <>Registering a business?{' '}
                      <button onClick={() => setPath('business')} className="text-[#4253D1] font-bold hover:underline transition-colors">
                        Add organization details
                      </button>
                    </>
                  ) : (
                    <>Registering for yourself?{' '}
                      <button onClick={() => setPath('personal')} className="text-[#4253D1] font-bold hover:underline transition-colors">
                        Switch to personal signup
                      </button>
                    </>
                  )}
                </p>

                <p className="text-center text-sm text-slate-400 font-normal">
                  Already have an account?{' '}
                  <button onClick={() => router.push('/login')} className="text-[#4253D1] font-bold hover:underline transition-colors">
                    Sign in
                  </button>
                </p>
              </motion.div>
            )}

            {/* ── STAGE 2: DONE ─────────────────────────────────────────── */}
            {stage === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="text-center space-y-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="w-20 h-20 rounded-full bg-[#ECEEFF] flex items-center justify-center mx-auto"
                >
                  <CheckCircle size={40} className="text-[#4253D1]" />
                </motion.div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-[#001633] uppercase">Account Created</h2>
                  <p className="text-sm text-slate-400 font-normal">
                    {path === 'business'
                      ? 'Redirecting you to verify your business…'
                      : 'Redirecting you to complete identity verification…'}
                  </p>
                </div>
                <div className="flex justify-center">
                  <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 1.8, ease: 'linear' }}
                      className="h-full bg-[#4253D1] rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
    <PhoneLinkModal
      open={showPhoneLink}
      onClose={() => finishPhoneLink()}
      onLinked={(phoneNumber) => finishPhoneLink(phoneNumber)}
    />
    </>
  );
}

function InputField({ label, id, value, onChange, placeholder, type = 'text', error }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; error?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[10px] font-bold text-slate-400 tracking-widest uppercase font-mono">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-invalid={!!error}
        className={`w-full bg-white border rounded-xl py-4 px-5 text-[#001633] font-bold text-sm focus:outline-none focus:ring-4 transition-all font-mono placeholder:font-normal placeholder:text-slate-300 ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-[#4253D1] focus:ring-[#4253D1]/10'}`}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}
