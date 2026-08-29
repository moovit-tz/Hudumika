'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OndiBrand } from '@/components/OneUI';
import { Smartphone, Loader2, KeyRound, ShieldCheck, ArrowRight, ShieldAlert, CheckCircle2, QrCode, Copy, Check } from 'lucide-react';
import QRCode from 'react-qr-code';
import { renderGoogleButton } from '@/lib/googleAuth';
import { getDeviceFingerprint } from '@/lib/session';
import PhoneLinkModal from '@/components/PhoneLinkModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';

interface FederatedProvider {
  id: string;
  name: string;
  enabled: boolean;
  authUrl: string;
  scopes: string[];
  clientId: string | null;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard/personal';

  const [phone, setPhone] = useState(() => (searchParams.get('phone') ?? '').replace(/^255/, ''));
  const [loading, setLoading] = useState(false);
  const [federatedLoading, setFederatedLoading] = useState(false);
  const [providers, setProviders] = useState<FederatedProvider[]>([]);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  
  // Steps: phone | mfa-select | totp | push | setup
  const [step, setStep] = useState<'phone' | 'sms-verify' | 'device-verify' | 'mfa-select' | 'totp' | 'push' | 'setup'>('phone');
  const [deviceCode, setDeviceCode] = useState('');
  const [pendingSetupRequired, setPendingSetupRequired] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [smsResent, setSmsResent] = useState(false);
  
  // MFA states
  const [totpCode, setTotpCode] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupUri, setSetupUri] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [pushStatus, setPushStatus] = useState<'pending' | 'approved' | 'denied' | 'expired'>('pending');

  // Format phone number to national E.164 format (e.g. 255700000000)
  function formatPhone(p: string) {
    let cleaned = p.trim().replace(/\s+/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '255' + cleaned.substring(1);
    } else if (!cleaned.startsWith('255')) {
      cleaned = '255' + cleaned;
    }
    return cleaned;
  }

  const [showPhoneLink, setShowPhoneLink] = useState(false);

  const handleFederatedCredential = useCallback(async (provider: string, idToken: string) => {
    setFederatedLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/federated/${provider}`, {
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
          router.push(redirectPath);
        }
      } else {
        setError(data.error || 'Sign-in failed. Please try again.');
      }
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setFederatedLoading(false);
    }
  }, [router, redirectPath]);

  function finishPhoneLink(phoneNumber?: string) {
    setShowPhoneLink(false);
    try {
      const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, phoneNumber: phoneNumber ?? stored.phoneNumber }));
    } catch { /* ignore */ }
    router.push(redirectPath);
  }

  // Fetch the list of enabled federated providers so buttons reflect what's actually configured.
  useEffect(() => {
    fetch(`${API_URL}/auth/federated/providers`)
      .then(res => res.json())
      .then(data => setProviders(data.providers ?? []))
      .catch(() => {});
  }, []);

  // Google — id_token comes back directly via the Identity Services widget.
  useEffect(() => {
    if (step !== 'phone' || !googleBtnRef.current) return;
    renderGoogleButton(googleBtnRef.current, (idToken) => handleFederatedCredential('google', idToken)).catch(() => {});
  }, [step, handleFederatedCredential]);

  // Microsoft — OIDC implicit flow (no client secret available to the browser),
  // id_token comes back in the URL fragment on redirect.
  function startMicrosoftLogin(provider: FederatedProvider) {
    if (!provider.clientId) return;
    const nonce = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id:      provider.clientId,
      response_type:  'id_token',
      response_mode:  'fragment',
      redirect_uri:   `${window.location.origin}/login`,
      scope:          provider.scopes.join(' '),
      nonce,
    });
    window.location.href = `${provider.authUrl}?${params.toString()}`;
  }

  // Pick up the id_token Microsoft appends to the URL fragment after redirect back.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.includes('id_token=')) return;
    const idToken = new URLSearchParams(hash.slice(1)).get('id_token');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (idToken) handleFederatedCredential('microsoft', idToken);
  }, [handleFederatedCredential]);

  const microsoftProvider = providers.find(p => p.id === 'microsoft' && p.clientId);

  // Phase 1: Check MFA status of the phone number
  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;

    setLoading(true);
    setError('');

    const formatted = formatPhone(phone);

    // If this number just registered, an SMS OTP is already sitting in their inbox —
    // verify that first (proves phone ownership) before ever touching MFA/TOTP setup.
    if (typeof window !== 'undefined' && localStorage.getItem('pending_phone') === formatted) {
      setLoading(false);
      setStep('sms-verify');
      return;
    }

    try {
      const deviceFingerprint = getDeviceFingerprint();
      const res = await fetch(`${API_URL}/auth/mfa-status?phoneNumber=${formatted}&deviceFingerprint=${deviceFingerprint}`);
      if (!res.ok) throw new Error('Failed to retrieve MFA status');

      const data = await res.json();

      if (data.requireDeviceStepUp) {
        // Unrecognized browser for this account — send an extra SMS
        // confirmation before the usual MFA step. Never skips MFA itself.
        const otpRes = await fetch(`${API_URL}/auth/otp/resend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formatted, channel: 'sms' }),
        });
        setLoading(false);
        if (!otpRes.ok) {
          setError('Failed to send device verification code. Try again.');
          return;
        }
        setPendingSetupRequired(!!data.setupRequired);
        setStep('device-verify');
        return;
      }

      setLoading(false);
      if (data.setupRequired) {
        // Trigger TOTP setup
        await handleMfaSetup(formatted);
      } else {
        // Redirect to MFA selection screen
        setStep('mfa-select');
      }
    } catch (err: any) {
      setLoading(false);
      setError('Connection failed. Please ensure the Ondi API is running.');
    }
  }

  // Confirm the extra SMS step-up for an unrecognized device, then continue
  // into whichever MFA path the account normally requires.
  async function handleDeviceVerify(e: React.FormEvent) {
    e.preventDefault();
    if (deviceCode.length < 6) return;

    setLoading(true);
    setError('');
    const formatted = formatPhone(phone);

    try {
      const res = await fetch(`${API_URL}/auth/otp/verify-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, otp: deviceCode }),
      });
      const data = await res.json();
      setLoading(false);

      if (res.ok && data.verified) {
        setDeviceCode('');
        if (pendingSetupRequired) {
          await handleMfaSetup(formatted);
        } else {
          setStep('mfa-select');
        }
      } else {
        setError(data.error === 'otp_expired' ? 'Code expired. Request a new one.' : 'Incorrect code. Please try again.');
      }
    } catch {
      setLoading(false);
      setError('Failed to verify code. Please try again.');
    }
  }

  // Verify the SMS OTP sent during registration, then move straight into
  // Ondi Authenticator setup (enforced MFA) before landing on the dashboard.
  async function handleSmsVerify(e: React.FormEvent) {
    e.preventDefault();
    if (smsCode.length < 6) return;

    setLoading(true);
    setError('');
    const formatted = formatPhone(phone);

    try {
      const res = await fetch(`${API_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, otp: smsCode }),
      });
      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.removeItem('pending_phone');
        await handleMfaSetup(formatted);
      } else {
        setError(data.error === 'otp_expired' ? 'Code expired. Request a new one.' : 'Incorrect code. Please try again.');
      }
    } catch {
      setLoading(false);
      setError('Failed to verify code. Please try again.');
    }
  }

  async function handleResendSms() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/otp/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatPhone(phone), channel: 'sms' }),
      });
      if (!res.ok) throw new Error();
      setSmsResent(true);
      setTimeout(() => setSmsResent(false), 4000);
    } catch {
      setError('Failed to resend code. Try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  // Setup TOTP
  async function handleMfaSetup(formattedPhone: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/totp/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formattedPhone }),
      });
      if (!res.ok) throw new Error('Failed to initiate TOTP setup');
      
      const data = await res.json();
      setSetupSecret(data.secret);
      setSetupUri(data.otpAuthUri || '');
      setStep('setup');
    } catch (err: any) {
      setError('Failed to setup authenticator. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // Verify TOTP (Setup or login)
  async function handleTotpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.length < 6) return;

    setLoading(true);
    setError('');

    const formatted = formatPhone(phone);
    try {
      const res = await fetch(`${API_URL}/auth/totp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formatted, code: totpCode, deviceFingerprint: getDeviceFingerprint() }),
      });

      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Success animation transition
        setPushStatus('approved');
        setTimeout(() => {
          router.push(redirectPath);
        }, 1000);
      } else {
        setError(data.error || 'Invalid 6-digit passcode. Please try again.');
      }
    } catch (err) {
      setLoading(false);
      setError('Failed to verify code. Please try again.');
    }
  }

  // Trigger Push Approval
  async function handlePushRequest() {
    setLoading(true);
    setError('');
    const formatted = formatPhone(phone);

    try {
      const res = await fetch(`${API_URL}/auth/push/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: formatted,
          location: 'Dar es Salaam, Tanzania',
          device: 'Chrome on macOS',
          deviceFingerprint: getDeviceFingerprint(),
        }),
      });

      if (!res.ok) throw new Error('Failed to send push request');
      const data = await res.json();
      
      setSessionId(data.sessionId);
      setPushStatus('pending');
      setStep('push');
    } catch (err) {
      setError('Failed to send login approval to your mobile device.');
    } finally {
      setLoading(false);
    }
  }

  // Poll for Push Approval
  useEffect(() => {
    if (step !== 'push' || !sessionId) return;

    let intervalId: any;
    let pollCount = 0;

    const poll = async () => {
      pollCount++;
      if (pollCount > 30) { // 60 seconds timeout
        setPushStatus('expired');
        setError('Login request timed out. Please try again.');
        clearInterval(intervalId);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/push/poll/${sessionId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'approved') {
          setPushStatus('approved');
          localStorage.setItem('access_token', data.access_token ?? data.token);
          if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
          localStorage.setItem('user', JSON.stringify(data.user));
          clearInterval(intervalId);
          setTimeout(() => {
            router.push(redirectPath);
          }, 1000);
        } else if (data.status === 'denied') {
          setPushStatus('denied');
          setError('Login request was denied on your mobile app.');
          clearInterval(intervalId);
        }
      } catch (e) {
        // Silent error during poll
      }
    };

    intervalId = setInterval(poll, 2000);
    return () => clearInterval(intervalId);
  }, [step, sessionId, router, redirectPath]);

  // ── Okta-style shared chrome: one centered card, sentence case, standard
  // form proportions — Ondi's own navy/indigo stay the accent colors, but
  // the layout/typography follow Okta's sign-in widget conventions rather
  // than a bespoke branded split-screen.
  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#001633] placeholder:text-slate-400 focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-colors';
  const codeInputClass =
    'w-full rounded-md border border-slate-300 bg-white py-3 text-center text-xl font-semibold tracking-[0.35em] text-[#001633] placeholder:text-slate-300 focus:outline-none focus:border-[#4253D1] focus:ring-4 focus:ring-[#4253D1]/10 transition-colors';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5';
  const primaryButtonClass =
    'w-full rounded-md bg-[#001633] py-2.5 text-sm font-semibold text-white hover:bg-[#4253D1] transition-colors flex items-center justify-center gap-2 disabled:opacity-60';
  const linkButtonClass = 'w-full text-center text-sm text-slate-500 hover:text-[#4253D1] transition-colors';

  return (
    <>
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F9FC] px-4 py-12 font-sans">
      <div className="mb-8 flex cursor-pointer items-center gap-2.5" onClick={() => router.push('/')}>
        <OndiBrand size={24} theme="light" />
        <span className="text-lg font-semibold text-[#001633]">Sign in</span>
      </div>

      <motion.div
        className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-10 shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
      >
          {error && (
            <div className="mb-6 flex gap-3 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* STEP 1: Phone input */}
            {step === 'phone' && (
              <motion.div
                key="phone-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-8 text-center">
                  <p className="text-sm text-slate-500">Enter your phone number to continue.</p>
                </div>

                <form onSubmit={handlePhoneSubmit} className="space-y-5">
                  <div>
                    <label className={labelClass}>Phone number</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 border-r border-slate-200 pr-3 text-sm font-medium text-slate-500">
                        +255
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`${inputClass} pl-[4.5rem]`}
                        placeholder="700 000 000"
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className={primaryButtonClass}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
                  </button>
                  <button type="button" onClick={() => router.push('/recovery')} className={linkButtonClass}>
                    Can&apos;t sign in?
                  </button>
                </form>

                {/* ── Google Sign-In ─────────────────────────────────────── */}
                <div className="mt-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs text-slate-400">Or continue with</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  {federatedLoading ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 py-2.5 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in…</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div ref={googleBtnRef} className="w-full" />
                      {microsoftProvider && (
                        <button
                          type="button"
                          onClick={() => startMicrosoftLogin(microsoftProvider)}
                          className="flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 py-2.5 text-sm font-medium text-[#001633] hover:bg-slate-50 transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
                            <path fill="#f35325" d="M1 1h10v10H1z" />
                            <path fill="#81bc06" d="M12 1h10v10H12z" />
                            <path fill="#05a6f0" d="M1 12h10v10H1z" />
                            <path fill="#ffba08" d="M12 12h10v10H12z" />
                          </svg>
                          Continue with Microsoft
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* STEP 1.5: Verify phone via the SMS OTP sent during registration */}
            {step === 'sms-verify' && (
              <motion.div
                key="sms-verify-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-semibold text-[#001633]">Verify your phone</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter the 6-digit code we texted to +{formatPhone(phone)}.
                  </p>
                </div>

                <form onSubmit={handleSmsVerify} className="space-y-5">
                  <div>
                    <label className={labelClass}>Verification code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                      className={codeInputClass}
                      placeholder="000000"
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" disabled={loading || smsCode.length < 6} className={primaryButtonClass}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify phone <ArrowRight size={14} /></>}
                  </button>

                  <button type="button" onClick={handleResendSms} disabled={loading} className={`${linkButtonClass} disabled:opacity-60`}>
                    {smsResent ? 'Code resent' : 'Resend code'}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'device-verify' && (
              <motion.div
                key="device-verify-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-semibold text-[#001633]">New device detected</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    We don&apos;t recognize this browser. Enter the 6-digit code we texted to +{formatPhone(phone)} to continue —
                    you&apos;ll still complete your usual Authenticator or Push sign-in after this.
                  </p>
                </div>

                <form onSubmit={handleDeviceVerify} className="space-y-5">
                  <div>
                    <label className={labelClass}>Verification code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={deviceCode}
                      onChange={(e) => setDeviceCode(e.target.value.replace(/\D/g, ''))}
                      className={codeInputClass}
                      placeholder="000000"
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" disabled={loading || deviceCode.length < 6} className={primaryButtonClass}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify device <ArrowRight size={14} /></>}
                  </button>

                  <button type="button" onClick={handleResendSms} disabled={loading} className={`${linkButtonClass} disabled:opacity-60`}>
                    {smsResent ? 'Code resent' : 'Resend code'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 2: MFA Select */}
            {step === 'mfa-select' && (
              <motion.div
                key="mfa-select-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-semibold text-[#001633]">Security check</h2>
                  <p className="mt-1 text-sm text-slate-500">Select a method to authorize this sign-in.</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setStep('totp')}
                    className="flex w-full items-center gap-4 rounded-md border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#4253D1] hover:bg-[#4253D1]/[0.03]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#4253D1]/10 text-[#4253D1]">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#001633]">Ondi Authenticator code</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Verify using the 6-digit rolling code inside your Ondi app.</p>
                    </div>
                  </button>

                  <button
                    onClick={handlePushRequest}
                    className="flex w-full items-center gap-4 rounded-md border border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#4253D1] hover:bg-[#4253D1]/[0.03]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#001633]">Approve on Ondi mobile</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Open the Ondi app on your phone and tap Approve on the sign-in request.</p>
                    </div>
                  </button>

                  <button onClick={() => setStep('phone')} className={`${linkButtonClass} mt-4`}>
                    Go back
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: TOTP Code Input */}
            {step === 'totp' && (
              <motion.div
                key="totp-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-8 text-center">
                  <h2 className="text-xl font-semibold text-[#001633]">Enter code</h2>
                  <p className="mt-1 text-sm text-slate-500">Enter the 6-digit verification code from your Ondi app.</p>
                </div>

                {pushStatus === 'approved' ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-10">
                    <CheckCircle2 size={48} className="text-emerald-500" />
                    <p className="text-sm font-medium text-slate-700">Authentication successful</p>
                  </div>
                ) : (
                  <form onSubmit={handleTotpVerify} className="space-y-5">
                    <div>
                      <label className={labelClass}>6-digit authenticator code</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        className={codeInputClass}
                        placeholder="000000"
                        required
                        autoFocus
                      />
                    </div>

                    <button type="submit" disabled={loading || totpCode.length < 6} className={primaryButtonClass}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify code <ArrowRight size={14} /></>}
                    </button>

                    <button type="button" onClick={() => setStep('mfa-select')} className={linkButtonClass}>
                      Choose another method
                    </button>
                  </form>
                )}
              </motion.div>
            )}

            {/* STEP 4: Push Polling Screen */}
            {step === 'push' && (
              <motion.div
                key="push-step"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-6"
              >
                <div className="relative mb-6 flex justify-center">
                  {pushStatus === 'approved' ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-emerald-500">
                      <CheckCircle2 size={56} className="mx-auto" />
                    </motion.div>
                  ) : pushStatus === 'denied' ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-red-500">
                      <ShieldAlert size={56} className="mx-auto" />
                    </motion.div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#001633] text-[#4253D1]">
                      <Smartphone size={28} />
                    </div>
                  )}
                </div>

                <h3 className="text-xl font-semibold text-[#001633]">
                  {pushStatus === 'approved' ? 'Sign-in approved' : pushStatus === 'denied' ? 'Access denied' : 'Approve on device'}
                </h3>

                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">
                  {pushStatus === 'approved'
                    ? 'Your device authorized access. Redirecting…'
                    : pushStatus === 'denied'
                    ? 'The sign-in request was denied on your mobile app.'
                    : 'Open the Ondi app on your phone to approve this sign-in.'}
                </p>

                <div className="mx-auto mt-6 max-w-xs space-y-1 rounded-md border border-slate-100 bg-slate-50 p-3.5 text-left text-xs text-slate-500">
                  <div>Device: Chrome on macOS</div>
                  <div>Location: Dar es Salaam, Tanzania</div>
                </div>

                {pushStatus === 'pending' && (
                  <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-[#4253D1]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Waiting for your approval…</span>
                  </div>
                )}

                <button type="button" onClick={() => setStep('mfa-select')} className="mt-8 text-sm text-slate-500 hover:text-[#4253D1] transition-colors">
                  Use another method
                </button>
              </motion.div>
            )}

            {/* STEP 5: MFA Setup Screen */}
            {step === 'setup' && (
              <motion.div
                key="setup-step"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <div className="mb-5 text-center">
                  <h2 className="text-xl font-semibold text-[#001633]">Enable Ondi Authenticator</h2>
                  <p className="mt-1 text-sm text-slate-500">Open the Ondi app, scan this QR code, then enter the 6-digit code to confirm.</p>
                </div>

                {/* QR Code card */}
                <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                  {/* Step indicator */}
                  <div className="flex border-b border-slate-100">
                    {['Scan QR code', 'Enter code', 'Done'].map((label, i) => (
                      <div key={label} className={`flex-1 py-2.5 text-center text-[11px] font-medium ${i === 0 ? '-mb-px border-b-2 border-[#4253D1] text-[#4253D1]' : 'text-slate-400'}`}>
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col items-center space-y-4 p-6">
                    {/* QR Code or fallback */}
                    {setupUri ? (
                      <div className="rounded-md border border-slate-100 bg-white p-3">
                        <QRCode
                          value={setupUri}
                          size={172}
                          bgColor="#ffffff"
                          fgColor="#001633"
                          level="M"
                        />
                      </div>
                    ) : (
                      <div className="flex h-[172px] w-[172px] items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-300">
                        <QrCode size={44} />
                      </div>
                    )}

                    {/* App badge */}
                    <span className="flex items-center gap-1.5 rounded-full border border-[#4253D1]/20 bg-[#4253D1]/5 px-2.5 py-1 text-xs font-medium text-[#4253D1]">
                      <ShieldCheck size={12} /> Ondi Authenticator
                    </span>

                    {/* Divider */}
                    <div className="flex w-full items-center gap-3">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-xs text-slate-400">Or enter key manually</span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    {/* Secret key + copy */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(setupSecret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-[#4253D1]/40 hover:bg-[#4253D1]/[0.03]"
                    >
                      <span className="break-all text-left text-xs font-medium text-slate-600">
                        {setupSecret}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {copiedSecret ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </span>
                    </button>

                    <p className="px-2 text-center text-xs text-slate-400">
                      Click to copy the secret key. Time-based codes expire every 30 seconds — make sure your device clock is synced.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleTotpVerify} className="mt-5 space-y-4">
                  <div>
                    <label className={labelClass}>Confirm — enter first code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      className={codeInputClass}
                      placeholder="000000"
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" disabled={loading || totpCode.length < 6} className={primaryButtonClass}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify &amp; enable MFA <ArrowRight size={14} /></>}
                  </button>

                  <button type="button" onClick={() => setStep('phone')} className={linkButtonClass}>
                    Cancel setup
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer link */}
          {step === 'phone' && (
            <p className="mt-8 text-center text-sm text-slate-500">
              New to Ondi?{' '}
              <button
                onClick={() => router.push('/register')}
                className="font-semibold text-[#4253D1] hover:underline transition-colors"
              >
                Create an account
              </button>
            </p>
          )}
      </motion.div>

      <div className="mt-8 flex items-center gap-4 text-xs text-slate-400">
        <a href="/support" className="hover:text-[#4253D1] transition-colors">Help</a>
        <span className="h-3 w-px bg-slate-300" />
        <a href="#" className="hover:text-[#4253D1] transition-colors">Privacy</a>
        <span className="h-3 w-px bg-slate-300" />
        <a href="#" className="hover:text-[#4253D1] transition-colors">Terms</a>
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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
