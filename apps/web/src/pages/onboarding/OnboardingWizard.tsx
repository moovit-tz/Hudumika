import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { useBranding } from '../../hooks/useBranding.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useLocale } from '../../hooks/useLocale.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { EMPTY_DRAFT, STEP_LABELS } from './types.js';
import type { OnboardingDraft } from './types.js';
import { StepAccount } from './StepAccount.js';
import { StepCompany } from './StepCompany.js';
import { StepPackage } from './StepPackage.js';
import { StepDomain } from './StepDomain.js';
import { StepPayment } from './StepPayment.js';
import { StepConfiguration } from './StepConfiguration.js';
import { StepSuccess } from './StepSuccess.js';
import type { OnboardingCompleteInput, OnboardingCompleteResponse, Package } from '@hudumika/types';
import '../Login.css';
import './Onboarding.css';

const LOGIN_BG_MAP: Record<string, string> = {
  navy:     '#0e1f3d',
  teal:     '#0d7a6b',
  gradient: 'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)',
  white:    '#f0f4f9',
};

function toCompleteInput(draft: OnboardingDraft, referralCode: string | null): OnboardingCompleteInput {
  return {
    referral_code: referralCode || undefined,
    account: { name: draft.name, email: draft.email, password: draft.password },
    company: { name: draft.companyName, industry: draft.industry || undefined, country: draft.country || undefined },
    package_code: draft.package_code,
    billing_cycle: draft.billing_cycle,
    subdomain: draft.subdomain,
    payment: {
      method: draft.payment.method,
      card_number: draft.payment.method === 'card' ? draft.payment.card_number : undefined,
      card_holder: draft.payment.method === 'card' ? draft.payment.card_holder : undefined,
      card_expiry: draft.payment.method === 'card' ? draft.payment.card_expiry : undefined,
      card_cvc: draft.payment.method === 'card' ? draft.payment.card_cvc : undefined,
      mobile_number: draft.payment.method === 'mpesa' ? draft.payment.mobile_number : undefined,
      mobile_provider: draft.payment.method === 'mpesa' ? draft.payment.mobile_provider : undefined,
    },
    configuration: {
      timezone: draft.timezone,
      currency: draft.currency,
      hq_city: draft.hq_city || undefined,
      hq_country: draft.hq_country || undefined,
    },
  };
}

export const OnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const rootRef  = useRef<HTMLDivElement>(null);
  const { completeOnboarding } = useAuth();
  const [searchParams] = useSearchParams();
  const { t, language, setLanguage, LANGUAGES } = useLocale();
  // Captured once, from whatever ?ref= link brought this signup here — the
  // backend resolves it against a real tenant slug and silently ignores a
  // stale/mistyped one rather than failing the signup over it.
  const referralCodeRef = useRef<string | null>(searchParams.get('ref'));

  const [step, setStep]     = useState(1);
  const [draft, setDraft]   = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [packages, setPackages] = useState<Package[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<OnboardingCompleteResponse | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hudumika_login_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { localStorage.setItem('hudumika_login_theme', theme); }, [theme]);

  const branding = useBranding();
  const isDark   = theme === 'dark';
  const logo     = isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight;
  const pageBg   = isDark ? '#131314' : (LOGIN_BG_MAP[branding.loginBgStyle] ?? '#f0f4f9');
  const isBgDark = !isDark && branding.loginBgStyle !== 'white';
  const accent   = branding.accentColor;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const d = isDark, b = isBgDark;
    el.style.setProperty('--lp-bg',              pageBg);
    el.style.setProperty('--lp-accent',          accent);
    el.style.setProperty('--lp-card-bg',         d ? '#1e1e1f'                      : '#fff');
    el.style.setProperty('--lp-card-border',     d ? '#3c4043'                      : '#e0e2e6');
    el.style.setProperty('--lp-card-shadow',     b ? '0 8px 32px rgba(0,0,0,0.28)' : 'none');
    el.style.setProperty('--lp-ink',             d ? '#e3e3e3'                      : '#1f1f1f');
    el.style.setProperty('--lp-ink2',            d ? '#c4c7c5'                      : '#444746');
    el.style.setProperty('--lp-ink3',            d ? '#9aa0a6'                      : '#5f6368');
    // Lighter than --lp-card-bg (#1e1e1f), not a reuse of the page-level
    // near-black (#131314) — an input darker than the card it sits in
    // reads as a hole punched through the card rather than a field on it.
    el.style.setProperty('--lp-input-bg',        d ? '#2a2a2d'                      : '#fff');
    el.style.setProperty('--lp-input-border',    d ? '#8e918f'                      : '#cbd5e1');
    el.style.setProperty('--lp-row-border',      d ? '#3c4043'                      : '#e2e8f0');
    el.style.setProperty('--lp-toggle-border',   d ? '#3c4043'  : b ? 'rgba(255,255,255,0.25)' : '#e0e2e6');
    el.style.setProperty('--lp-toggle-bg',       d ? '#1e1e1f'  : b ? 'rgba(255,255,255,0.12)' : '#fff');
    el.style.setProperty('--lp-toggle-color',    d ? '#e3e3e3'  : b ? '#fff'                   : '#444746');
    el.style.setProperty('--lp-page-text',       b ? 'rgba(255,255,255,0.65)' : d ? '#9aa0a6'  : '#5f6368');
    el.style.setProperty('--lp-page-link',       b ? 'rgba(255,255,255,0.85)' : d ? 'rgba(255,255,255,0.7)' : '#5f6368');
    // Same fix as Login.tsx's own copy of this effect: the tenant's raw
    // accent has no contrast guarantee (it can be a dark tone), which is
    // fine as a button fill (contrast is against white button text) but
    // reads as near-invisible link text on a dark page. Google's dark-mode
    // link blue is a safe, on-theme fallback for text specifically.
    el.style.setProperty('--lp-link-accent',     d ? '#8ab4f8' : accent);
  }, [isDark, isBgDark, pageBg, accent]);

  useEffect(() => {
    apiFetch('/v1/packages').then(res => setPackages(res.data)).catch(() => {});
  }, []);

  // Once the success screen has shown its checklist animation, log in and land in the workspace.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      completeOnboarding(success);
      navigate('/');
    }, 1800);
    return () => clearTimeout(t);
  }, [success, completeOnboarding, navigate]);

  const update = (patch: Partial<OnboardingDraft>) => setDraft(prev => ({ ...prev, ...patch }));

  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const handleNext = async () => {
    if (step < 6) {
      setStep(s => s + 1);
      return;
    }
    // Final step — actually create the tenant/account/plan/payment/settings.
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res: OnboardingCompleteResponse = await apiFetch('/v1/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(toCompleteInput(draft, referralCodeRef.current)),
      });
      setSuccess(res);
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong creating your workspace. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepProps = { draft, update, onNext: handleNext, onBack: handleBack, packages, submitting, submitError };

  return (
    <div ref={rootRef} className="login-page" data-theme={theme}>
      <button
        type="button"
        onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
        className="login-toggle"
        title="Toggle Theme"
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} />
      </button>

      {/* Wide treatment is sized for step 3's 4-column pricing grid
          specifically — steps 4-6 are plain single-column forms (a domain
          input, a card form, a timezone/currency pair + review box) that
          were designed at the normal card width and just looked stretched
          and empty on the right when `step >= 3` widened all of them. */}
      <div className={`login-card login-card--reg${step === 3 ? ' ob-card--wide' : ''}`}>
        {success ? (
          <StepSuccess subdomain={draft.subdomain} />
        ) : (
          <>
            <div className="login-brand-hdr">
              <div className="login-brand-row">
                {logo ? (
                  <img src={logo} alt={branding.platformName} className="g-brand-logo-img" />
                ) : (
                  <>
                    <div className="g-brand-grid">
                      <div className="g-brand-sq g-brand-sq--r" />
                      <div className="g-brand-sq g-brand-sq--b" />
                      <div className="g-brand-sq g-brand-sq--y" />
                      <div className="g-brand-sq g-brand-sq--g" />
                    </div>
                    <span className="g-brand-name">{branding.platformName}</span>
                  </>
                )}
              </div>
              <div>
                <h1 className="login-headline">Set up your workspace</h1>
                <p className="login-subtext">Step {step} of 6 — {STEP_LABELS[step - 1]}</p>
              </div>
            </div>

            <div className="ob-steps">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className={`ob-step-dot${i + 1 === step ? ' ob-step-dot--active' : ''}${i + 1 < step ? ' ob-step-dot--done' : ''}`} title={label} />
              ))}
            </div>

            {submitError && <div className="login-error">{submitError}</div>}

            {step === 1 && <StepAccount {...stepProps} />}
            {step === 2 && <StepCompany {...stepProps} />}
            {step === 3 && <StepPackage {...stepProps} />}
            {step === 4 && <StepDomain {...stepProps} />}
            {step === 5 && <StepPayment {...stepProps} />}
            {step === 6 && <StepConfiguration {...stepProps} />}
          </>
        )}
      </div>

      <div className="login-footer">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="login-lang-trigger">
              <Icon name="globe" size={13} />
              {LANGUAGES.find(l => l.code === language)?.nativeLabel ?? 'English'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {LANGUAGES.map(l => (
              <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)} className="cursor-pointer gap-3">
                <span className="text-base">{l.flag}</span>
                <span className="flex-1">{l.nativeLabel}</span>
                {language === l.code && <Icon name="check" size={14} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="login-footer-links">
          <a href="#help" className="login-footer-link">Help</a>
          <span className="login-footer-link">Privacy</span>
          <span className="login-footer-link">Terms</span>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
