import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { useBranding, BRAND_LOGO_LIGHT, BRAND_LOGO_DARK } from '../../hooks/useBranding.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useLocale } from '../../hooks/useLocale.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Tip } from '../../components/ui/tooltip.js';
import { EMPTY_DRAFT, STEP_LABELS, STEP_SHORT_LABELS, ACCEPTED_REGISTRY_INDUSTRIES } from './types.js';
import type { OnboardingDraft, OnboardingJourney, OnboardingIndustry } from './types.js';
import { StepAccount } from './StepAccount.js';
import { StepCompany } from './StepCompany.js';
import { StepPackage } from './StepPackage.js';
import { StepDomain } from './StepDomain.js';
import { StepPayment } from './StepPayment.js';
import { StepConfiguration } from './StepConfiguration.js';
import { StepSuccess } from './StepSuccess.js';
import { StepJoinRequestSent } from './StepJoinRequestSent.js';
import type { OnboardingCompleteInput, OnboardingCompleteResponse, JoinRequestSubmitResponse, Package, OnboardingDraftResumeResponse } from '@hudumika/types';
import { signupPackageAmount } from '@hudumika/types';
import '../Login.css';
import './Onboarding.css';

const LOGIN_BG_MAP: Record<string, string> = {
  navy:     '#0e1f3d',
  teal:     '#0d7a6b',
  gradient: 'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)',
  white:    '#f0f4f9',
};

function toCompleteInput(draft: OnboardingDraft, referralCode: string | null, locale: string): OnboardingCompleteInput {
  return {
    referral_code: referralCode || undefined,
    onboarding_journey: draft.onboarding_journey || undefined,
    account: { name: draft.name, email: draft.email, ondi_ticket: draft.ondi_ticket },
    company: {
      name: draft.companyName,
      industry: draft.industry || undefined,
      industries: draft.industries?.length ? draft.industries : (draft.industry ? [draft.industry] : undefined),
      country: draft.country || undefined,
    },
    package_code: draft.package_code,
    billing_cycle: draft.billing_cycle,
    initial_products: draft.initial_products.length ? draft.initial_products : undefined,
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
    privacy_acknowledgement: {
      policy_version_id: draft.privacy_policy_version_id,
      acknowledged: true,
      locale,
    },
  };
}

export const OnboardingWizard: React.FC = () => {
  const navigate = useNavigate();
  const rootRef  = useRef<HTMLDivElement>(null);
  const { completeOnboarding } = useAuth();
  const [searchParams] = useSearchParams();
  // The original destination carried over from Login/Ondi (e.g. someone
  // followed a deep link to a specific app while signed out, had no
  // account, and landed here via "Create a workspace instead") — captured
  // once on mount so it survives whatever the wizard itself does to the
  // URL/query string across its six steps.
  const returnToRef = useRef<string | null>(searchParams.get('returnTo'));
  const { t, language, setLanguage, LANGUAGES } = useLocale();
  // Captured once, from whatever ?ref= link brought this signup here — the
  // backend resolves it against a real tenant slug and silently ignores a
  // stale/mistyped one rather than failing the signup over it.
  const referralCodeRef = useRef<string | null>(searchParams.get('ref'));

  const [step, setStep]     = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  useEffect(() => { setFurthestStep(previous => Math.max(previous, step)); }, [step]);
  const [draft, setDraft]   = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [packages, setPackages] = useState<Package[]>([]);
  // Whether a real payment gateway is configured — decides whether the
  // final step collects card/mobile details itself (simulated path,
  // unchanged) or sends the customer to hosted checkout instead.
  const [gatewayConfigured, setGatewayConfigured] = useState(false);
  const [journeys, setJourneys] = useState<OnboardingJourney[]>([]);
  const [industries, setIndustries] = useState<OnboardingIndustry[]>([]);
  const [industriesLoading, setIndustriesLoading] = useState(true);
  const [industriesError, setIndustriesError] = useState<string | null>(null);
  async function loadIndustries() {
    setIndustriesLoading(true); setIndustriesError(null);
    try {
      const response = await apiFetch<{ industries: OnboardingIndustry[] }>('/v1/onboarding/industries');
      setIndustries(response.industries?.length ? response.industries : ACCEPTED_REGISTRY_INDUSTRIES);
    } catch {
      setIndustries(ACCEPTED_REGISTRY_INDUSTRIES);
    } finally {
      setIndustriesLoading(false);
    }
  }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<OnboardingCompleteResponse | null>(null);
  // Auto-join-by-domain — a separate terminal state from `success`: nothing
  // was provisioned, there's no session to start, just a pending request.
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState(false);
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null);
  const [joinRequestSent, setJoinRequestSent] = useState<{ tenantName: string } | null>(null);
  // Resumable setup (migration 715 / onboarding_drafts): shown once, right
  // after a saved draft is actually restored, so the person knows why
  // they've landed past step 1 with fields already filled in.
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  // Autosave status, surfaced so "it's saving" is a fact the user can see
  // rather than an assumption — a swallowed save failure previously left
  // someone typing into a form that silently wasn't persisting anything.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // The ondi_ticket is a 15-minute JWT (see verifySignupTicket) — once it
  // expires, /draft/save and /draft/resume both 401. The fix isn't to
  // retry (a dead ticket never becomes valid again); it's to tell the
  // person plainly and send them back to re-verify with Ondi, which a
  // fresh ticket resolves to the very same saved draft by email.
  const [ticketExpired, setTicketExpired] = useState(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hudumika_login_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { localStorage.setItem('hudumika_login_theme', theme); }, [theme]);

  const branding = useBranding(true);
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
    // accent has no contrast guarantee (it can be a dark tone) and reads as
    // near-invisible link text on a dark page. Google's dark-mode link blue
    // is a safe, on-theme fallback for text specifically.
    el.style.setProperty('--lp-link-accent', 'var(--teal)');
    // Button surface: the raw accent as a solid fill passes WCAG against
    // white text but still reads as a heavy, near-invisible block on a dark
    // page when the accent itself is dark — same fix as Login.tsx's/
    // OndiLogin.tsx's identical block, reusing useDesignSystem.ts's own
    // --primary dark-mode derivation (lighten 45% before the contrast floor)
    // instead of a third, page-local fix.
    el.style.setProperty('--lp-accent-surface', 'hsl(var(--primary))');
    el.style.setProperty('--lp-accent-surface-fg', 'hsl(var(--primary-foreground))');
  }, [isDark, isBgDark, pageBg, accent]);

  useEffect(() => {
    // workspace-free (migration 692) is deliberately excluded from the normal
    // tier grid — it's a $0 catalog row the server needs to exist so a
    // standalone-product signup has a valid package_code, not a plan a
    // customer picks alongside Starter/Business/Scale. StepPackage's new
    // "single product" tab sets it directly instead.
    apiFetch('/v1/packages/signup').then(res => setPackages(res.data as Package[])).catch(() => {});
    void loadIndustries();
    apiFetch('/v1/onboarding/journeys').then(res => setJourneys(Array.isArray(res) ? res : [])).catch(() => {});
    apiFetch('/v1/onboarding/payment-status').then(res => setGatewayConfigured(!!res.gateway_configured)).catch(() => {});
    apiFetch('/v1/privacy-policy/current')
      .then((policy: any) => setDraft(prev => ({ ...prev, privacy_policy_version_id: policy.id })))
      .catch(() => setSubmitError('The Privacy Policy is temporarily unavailable. Please try again shortly.'));
  }, []);

  // Once the success screen has shown its checklist animation, log in and
  // land either in the workspace tour or, if this signup started from a
  // real deep link (someone followed a link to a specific app while
  // signed out, found no account, and chose "Create a workspace instead"
  // — see OndiSignInPanel's returnTo-carrying link), the app they actually
  // came for. A brand-new signup with no originating link still gets the
  // full /welcome tour.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      completeOnboarding(success);
      navigate(returnToRef.current || '/welcome');
    }, 1800);
    return () => clearTimeout(t);
  }, [success, completeOnboarding, navigate]);

  // Resumable setup, part 1: the moment a real ondi_ticket lands in the
  // draft (StepAccount just verified identity with Ondi), ask the server
  // whether this same verified email already has setup progress saved —
  // from an earlier visit, a different device, or just a closed tab. A 404
  // (nothing saved) is the normal, expected case for a first-time signup
  // and isn't surfaced as an error.
  useEffect(() => {
    if (!draft.ondi_ticket) return;
    setTicketExpired(false);
    let cancelled = false;
    apiFetch('/v1/onboarding/draft/resume', { method: 'POST', body: JSON.stringify({ ondi_ticket: draft.ondi_ticket }) })
      .then((res: OnboardingDraftResumeResponse) => {
        if (cancelled) return;
        setDraft(prev => ({ ...prev, ...res.draft }));
        if (res.step > 1) {
          setStep(res.step);
          setResumeNotice("Picked up where you left off — review each step before continuing.");
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        // 404 (nothing saved yet) is the normal first-time-signup case —
        // not an error. A 401 here means the just-issued ticket is already
        // dead (clock skew, or a very slow verify round-trip); same
        // re-verify path as the save effect below.
        if (err?.status === 401) { setTicketExpired(true); return; }
      });
    return () => { cancelled = true; };
  }, [draft.ondi_ticket]);

  // Resumable setup, part 2: save progress as it's made, past the point
  // identity is verified. Deliberately excludes payment details and the
  // ticket itself — see OnboardingDraftPayload's own doc comment for why.
  // Debounced so typing in e.g. the company-name field doesn't fire a
  // request per keystroke.
  useEffect(() => {
    if (!draft.ondi_ticket || step < 2) return;
    const payload = {
      companyName: draft.companyName, industry: draft.industry, industries: draft.industries, country: draft.country,
      onboarding_journey: draft.onboarding_journey, package_code: draft.package_code,
      billing_cycle: draft.billing_cycle, initial_products: draft.initial_products,
      subdomain: draft.subdomain, timezone: draft.timezone, currency: draft.currency,
      hq_city: draft.hq_city, hq_country: draft.hq_country,
    };
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      apiFetch('/v1/onboarding/draft/save', {
        method: 'POST',
        body: JSON.stringify({ ondi_ticket: draft.ondi_ticket, step, draft: payload }),
      })
        .then(() => setSaveStatus('saved'))
        .catch((err: any) => {
          if (err?.status === 401) { setTicketExpired(true); return; }
          setSaveStatus('error');
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    draft.ondi_ticket, step, draft.companyName, draft.industry, draft.industries, draft.country, draft.onboarding_journey,
    draft.package_code, draft.billing_cycle, draft.initial_products, draft.subdomain, draft.timezone,
    draft.currency, draft.hq_city, draft.hq_country,
  ]);

  // Expired-ticket recovery: drop back to step 1 and clear the dead ticket
  // so StepAccount shows its "verify with Ondi" screen again rather than a
  // form that looks alive but can no longer save. All the other draft
  // fields are left in place — a fresh ticket resumes to the same saved
  // row by email (migration 715), so nothing already saved is lost; only
  // whatever changed in the last unsaved 800ms is at risk, which the
  // banner below says plainly.
  useEffect(() => {
    if (!ticketExpired) return;
    setDraft(prev => ({ ...prev, ondi_ticket: '' }));
    setStep(1);
    setFurthestStep(1);
  }, [ticketExpired]);

  const update = (patch: Partial<OnboardingDraft>) => setDraft(prev => ({ ...prev, ...patch }));

  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const handleNext = async () => {
    if (step < 6) {
      setStep(s => s + 1);
      return;
    }
    // Final step — actually create the tenant/account/plan/payment/settings.
    if (!draft.privacy_policy_version_id || !draft.privacy_acknowledged) {
      setSubmitError('Please review and acknowledge the Privacy Policy before creating your workspace.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input = toCompleteInput(draft, referralCodeRef.current, language);
      const pkg = packages.find(p => p.code === draft.package_code);
      const amount = draft.package_code === 'workspace-free' ? 0
        : pkg ? signupPackageAmount(pkg, draft.billing_cycle) : 0;

      if (amount > 0 && gatewayConfigured) {
        // Hosted checkout: nothing is created yet. Navigate away to
        // Flutterwave's own page — completion happens on the far side of
        // the redirect (OnboardingFinalizing), once its webhook confirms.
        const { checkout_url } = await apiFetch('/v1/onboarding/checkout', { method: 'POST', body: JSON.stringify(input) });
        window.location.href = checkout_url;
        return;
      }

      const res: OnboardingCompleteResponse = await apiFetch('/v1/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSuccess(res);
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong creating your workspace. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestJoin = async (tenantId: string) => {
    setJoinRequestSubmitting(true);
    setJoinRequestError(null);
    try {
      // No password collected anywhere in this wizard anymore (full-SSO —
      // see StepAccount) — a join request's own password_hash column is
      // never actually used to sign anyone in (the target tenant's admin
      // approves or denies the request; the requester signs in via Ondi
      // once approved), so a random throwaway value serves exactly the
      // same purpose the old typed one did.
      const res: JoinRequestSubmitResponse = await apiFetch('/v1/onboarding/request-join', {
        method: 'POST',
        body: JSON.stringify({ name: draft.name, email: draft.email, password: crypto.randomUUID() + crypto.randomUUID(), tenant_id: tenantId }),
      });
      setJoinRequestSent({ tenantName: res.tenant_name });
    } catch (err: any) {
      setJoinRequestError(err.message || 'Failed to submit join request. Please try again.');
    } finally {
      setJoinRequestSubmitting(false);
    }
  };

  const stepProps = {
    draft, update, onNext: handleNext, onBack: handleBack, packages, journeys, industries, industriesLoading, industriesError, onRetryIndustries: loadIndustries, onEditStep: (target: number) => { setSubmitError(null); setStep(target); }, submitting, submitError,
    onRequestJoin: handleRequestJoin, joinRequestSubmitting, joinRequestError, gatewayConfigured,
  };

  return (
    <div ref={rootRef} className={`login-page${step === 3 ? ' ob-pricing-page' : ''}`} data-theme={theme}>
      <Tip label="Toggle theme">
        <button
          type="button"
          onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
          className="login-toggle"
          data-theme-switcher=""
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
         data-ui-native-button="">
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </Tip>

      {/* Wide treatment is sized for step 3's 4-column pricing grid
          specifically — steps 4-6 are plain single-column forms (a domain
          input, a card form, a timezone/currency pair + review box) that
          were designed at the normal card width and just looked stretched
          and empty on the right when `step >= 3` widened all of them. */}
      <div className={`login-card login-card--reg${step === 3 ? ' ob-card--wide' : step === 2 ? ' ob-card--split' : ''}`}>
        {success ? (
          <StepSuccess subdomain={draft.subdomain} />
        ) : joinRequestSent ? (
          <StepJoinRequestSent tenantName={joinRequestSent.tenantName} />
        ) : (
          <>
            <div className="login-brand-hdr">
              <div className="login-brand-row">
                <img
                  src={logo || (isDark ? BRAND_LOGO_DARK : BRAND_LOGO_LIGHT)}
                  alt={branding.platformName}
                  className="g-brand-logo-img"
                />
              </div>
              <div>
                <h1 className="login-headline">{t('onboarding.title')}</h1>
                <p className="login-subtext">{t('onboarding.step', { step, label: t(`onboarding.${['identity', 'businessIndustry', 'appsPlan', 'workspace', 'billing', 'reviewLaunch'][step - 1]}`) })}</p>
              </div>
            </div>

            <nav className="ob-stepper-wrap" aria-label="Signup progress">
              <div className="ob-stepper-track">
                <div className="ob-stepper-bar-bg" aria-hidden="true">
                  <div
                    className="ob-stepper-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(0, ((step - 1) / (STEP_LABELS.length - 1)) * 100))}%` }}
                  />
                </div>
                {STEP_LABELS.map((label, i) => {
                  const stepNum = i + 1;
                  const isCurrent = stepNum === step;
                  const isDone = stepNum < step;
                  return (
                    <Tip key={label} label={`Step ${stepNum}: ${label}`}>
                      <button
                        type="button"
                        onClick={() => { setSubmitError(null); setStep(stepNum); }}
                        className={`ob-stepper-node${isCurrent ? ' ob-stepper-node--current' : ''}${isDone ? ' ob-stepper-node--done' : ''}`}
                        aria-label={`Step ${stepNum}: ${label}`}
                        aria-current={isCurrent ? 'step' : undefined}
                        data-ui-native-button=""
                      >
                        <span className="ob-stepper-node-circle">
                          {isDone ? <Icon name="check" size={12} /> : stepNum}
                        </span>
                        <span className="ob-stepper-node-text">{t(`onboarding.${['identity', 'business', 'appsPlan', 'workspace', 'billing', 'review'][i]}`)}</span>
                      </button>
                    </Tip>
                  );
                })}
              </div>
            </nav>

            {ticketExpired && (
              <div className="login-error">
                <Icon name="alertCircle" size={16} />
                <span>Your verification expired. Everything saved up to your last change is safe — verify with Ondi again to pick up right where you left off.</span>
              </div>
            )}
            {resumeNotice && (
              <div className="login-error" style={{ background: 'var(--green-l, #ecfdf5)', borderColor: 'var(--green, #059669)', color: 'var(--green, #059669)' }}>
                <Icon name="checkCircle" size={16} />
                <span>{resumeNotice}</span>
              </div>
            )}
            {submitError && <div className="login-error">{submitError}</div>}
            {step >= 2 && saveStatus !== 'idle' && (
              <div className="ob-save-status" style={{ fontSize: 12.5, color: saveStatus === 'error' ? 'var(--red, #dc2626)' : 'var(--lp-ink3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 8 }}>
                {saveStatus === 'saving' && <>Saving…</>}
                {saveStatus === 'saved' && <><Icon name="checkCircle" size={13} /> Saved</>}
                {saveStatus === 'error' && <>Couldn't save your progress — check your connection.</>}
              </div>
            )}

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
            <button type="button" className="login-lang-trigger" data-ui-native-button="">
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
        {/* target="_blank" here specifically (Login.tsx's own copy of this
            footer navigates in place) — this page has real in-progress form
            state with nowhere it's persisted, so a normal navigation away
            to read Terms mid-signup would silently drop whatever the visitor
            had already filled in. */}
        <div className="login-footer-links">
          <Link to="/support-ticket" target="_blank" rel="noopener noreferrer" className="login-footer-link">{t('login.help')}</Link>
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="login-footer-link">{t('login.privacy')}</Link>
          <Link to="/terms" target="_blank" rel="noopener noreferrer" className="login-footer-link">{t('login.terms')}</Link>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
