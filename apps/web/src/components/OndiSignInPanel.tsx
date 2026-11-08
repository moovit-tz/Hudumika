import { useLocale } from '../hooks/useLocale.js';
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { MicrosoftSignInButton } from './MicrosoftSignInButton.js';
import { AppleSignInButton } from './AppleSignInButton.js';
import { Tip } from './ui/tooltip.js';
import type { FederatedSignupTicket } from '@hudumika/types';

const METHOD_META: Record<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso', { icon: 'phone' | 'shield' | 'fingerprint' | 'mail' | 'building'; label: string }> = {
  'phone':       { icon: 'phone',       label: 'Sign in with a phone code' },
  'totp':        { icon: 'shield',      label: 'Sign in with an authenticator app' },
  'passkey':     { icon: 'fingerprint', label: 'Sign in with a passkey' },
  'magic-link':  { icon: 'mail',        label: 'Sign in with an email link' },
  'company-sso': { icon: 'building',    label: "Sign in with your company's SSO" },
};

// Off for now, by request — the plan is to bring passkey sign-in back once
// it can be offered platform-wide (every app's own login, not just Ondi's),
// rather than only here. The whole flow underneath (submitPasskey,
// requestPasskeyLoginOptions/verifyPasskeyLogin in useAuth.tsx, the real
// WebAuthn ceremony) is untouched — this only hides the entry point, so
// flipping it back to `true` is the entire re-enable.
const PASSKEY_LOGIN_ENABLED = false;
// Same story, same pattern — off until needed. sendMagicLink,
// requestMagicLink in useAuth.tsx, and the real /v1/ondi/auth/magic-link/*
// backend are all untouched; only this entry point is hidden.
const MAGIC_LINK_LOGIN_ENABLED = false;
// By direct request: the login picker was showing too many competing
// options (phone pill, "more ways" reveal with authenticator/company-SSO/
// Microsoft/Apple) and a user trying to sign in with Google ended up
// clicking "Sign in with your company's SSO" by mistake, hitting a real
// but unrelated "No company sign-on found" error. Login now offers exactly
// one button — Google, the only provider actually configured — same
// hide-the-entry-point-keep-the-flow pattern as PASSKEY_LOGIN_ENABLED/
// MAGIC_LINK_LOGIN_ENABLED above: requestOtpLogin/verifyOtpLogin,
// submitTotpCredentials/submitTotp, and checkCompanySso are all untouched,
// just unreachable from the UI until one of these flips back to true.
const PHONE_LOGIN_ENABLED = false;
const TOTP_LOGIN_ENABLED = false;
const COMPANY_SSO_LOGIN_ENABLED = false;
// Same reasoning, login side only — signup already rendered Google only
// implicitly via ONDI_SSO_MULTI_PROVIDER_SIGNUP below.
const VISIBLE_METHODS = (Object.keys(METHOD_META) as Array<keyof typeof METHOD_META>)
  .filter(key => key !== 'passkey' || PASSKEY_LOGIN_ENABLED)
  .filter(key => key !== 'magic-link' || MAGIC_LINK_LOGIN_ENABLED)
  .filter(key => key !== 'totp' || TOTP_LOGIN_ENABLED)
  .filter(key => key !== 'company-sso' || COMPANY_SSO_LOGIN_ENABLED);
// Phone is its own primary pill (the idle view's second CTA, alongside
// Google), not one more icon in the secondary row below.
const SECONDARY_METHODS = VISIBLE_METHODS.filter(key => key !== 'phone');
// Microsoft/Apple handlers (handleMicrosoftCredential etc.) stay fully
// wired below — only the buttons are hidden, both for login and signup —
// so re-enabling multi-provider sign-in later is flipping this back on,
// not rebuilding it.
const ONDI_SSO_MULTI_PROVIDER_SIGNUP = false;

interface OndiSignInPanelProps {
  /** 'login' (default): the platform's own phone-OTP/authenticator/passkey/
   *  company-SSO methods — no Google, by explicit product decision (a
   *  separate federated option read as competing with "sign in with Ondi"
   *  rather than being part of it). 'signup': brand-new workspace creation
   *  — ONLY Google/Microsoft/Apple render, because every other method here
   *  (phone-OTP, magic-link, company-SSO) requires an existing tenant's own
   *  SMS gateway/mail sender to verify through, which doesn't exist yet for
   *  someone who isn't registered. OAuth doesn't have that problem — the
   *  provider does the verifying, Hudumika never sends anything. */
  intent?: 'login' | 'signup';
  /** signup intent only: fires when Google/Microsoft/Apple verified a real
   *  identity with no existing Hudumika account and no company to join —
   *  genuinely new. The host (StepAccount) carries this into company-
   *  details collection instead of a password field. */
  onSignupTicket?: (ticket: FederatedSignupTicket) => void;
}

/**
 * Ondi's actual method picker and sign-in forms — Google/phone pills, the
 * "more ways to sign in" reveal (authenticator/company SSO/Microsoft), and
 * every mode's form (phone+OTP, email+authenticator-code, passkey, magic
 * link, company SSO). Pulled out of OndiLogin.tsx (the dedicated /ondi/login
 * page) so the *identical* picker can also render inline — as the "Ondi" tab
 * on the plain Login page, and (intent="signup") on the onboarding wizard's
 * own Account step — without three copies of this state machine drifting
 * apart. Only the page-level chrome (theme toggle, the centered icon/
 * headline, the closing "sign in with password instead" links) stays with
 * each host; this component is just the picker + its own error/info
 * feedback.
 *
 * Every LOGIN mode lands on the same session /auth/login issues and always
 * finishes by navigating to '/', regardless of which page is currently
 * hosting it. SIGNUP intent never creates a session itself — see
 * onSignupTicket above.
 */
export function OndiSignInPanel({ intent = 'login', onSignupTicket }: OndiSignInPanelProps) {
  const { t } = useLocale();
  const { login, requestOtpLogin, verifyOtpLogin, requestMagicLink, requestPasskeyLoginOptions, verifyPasskeyLogin, loginWithGoogle, loginWithMicrosoft, loginWithApple } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';
  const isSignup = intent === 'signup';

  // null = the idle "choose how to sign in" view (the two pills); set once
  // a method is actually picked.
  const [mode, setMode] = useState<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso' | null>(null);
  const [showMoreMethods, setShowMoreMethods] = useState(false);

  // Phone + OTP
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Email + authenticator (real password+authenticator-code 2FA — the same
  // /auth/login mechanism the plain password Login page uses, not a
  // separate passwordless check. See submitTotpCredentials below.)
  const [email, setEmail] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [showTotpPassword, setShowTotpPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Passkey
  const [passkeyEmail, setPasskeyEmail] = useState('');

  // Email magic link
  const [magicEmail, setMagicEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Company SSO (SAML)
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoChecking, setSsoChecking] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Set only for the login-intent NO_MATCHING_WORKSPACE case — renders a
  // real "create a workspace instead" link rather than leaving it as a
  // dead-end text hint (the gap this session's own audit flagged: the
  // provider sign-in actually works, there's just nowhere to go from here).
  const [noWorkspaceFound, setNoWorkspaceFound] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ondi-saml.routes.ts's /acs redirects failures here as ?samlError=1 (it
  // has no JS context of its own to show an error from) — only ever present
  // when this panel is hosted on /ondi/login, but harmless to check
  // regardless of host. Same "drop the marker once consumed" pattern as
  // Login.tsx's own ?expired=.
  useEffect(() => {
    if (searchParams.get('samlError')) {
      setMode('company-sso');
      setError("Your company sign-on didn't complete. Try again, or check with your IT administrator.");
      setSearchParams(params => { params.delete('samlError'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCode = async () => {
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    setError(null); setInfo(null); setLoading(true);
    try {
      const res = await requestOtpLogin(phone.trim());
      setOtpSent(true);
      setInfo(res.message || 'A sign-in code was sent by SMS.');
      setResendIn(30);
    } catch (err: any) {
      setError(err.message || 'Could not send the code. Try again.');
    } finally { setLoading(false); }
  };

  const submitOtp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (otpCode.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError(null); setLoading(true);
    try {
      await verifyOtpLogin(phone.trim(), otpCode.trim());
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  // Real password+authenticator-code 2FA — the exact same /auth/login
  // mechanism (useAuth's login()) the plain password Login page uses, not
  // a separate passwordless TOTP check. Step 1 is credentials; the code
  // step only appears once the server actually confirms this account has
  // 2FA enabled (requires_2fa) — asking for a code upfront on every
  // account would leak who has 2FA turned on before a password is even
  // checked. An account with no 2FA enabled at all just signs straight in
  // after step 1, same as the plain password form.
  const [totpStep, setTotpStep] = useState<'credentials' | 'code'>('credentials');

  const submitTotpCredentials = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!email.trim() || !totpPassword) { setError('Enter your email and password.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await login(email.trim(), totpPassword);
      if ('requires_2fa_setup' in res) { navigate('/2fa-setup-required', { state: { setupToken: res.setup_token } }); return; }
      if ('requires_2fa' in res) { setTotpStep('code'); return; }
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally { setLoading(false); }
  };

  const submitTotp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (totpCode.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await login(email.trim(), totpPassword, totpCode.trim());
      if ('requires_2fa' in res) { setError('Invalid code. Try again.'); return; }
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  const switchMode = (next: 'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso' | null) => {
    setMode(next); setError(null); setInfo(null); setNoWorkspaceFound(false); setTotpStep('credentials'); setTotpPassword('');
  };

  const checkCompanySso = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ssoEmail.trim()) { setError('Enter your work email.'); return; }
    setError(null); setInfo(null); setSsoChecking(true);
    try {
      const res = await apiFetch(`/v1/ondi/auth/saml/lookup?email=${encodeURIComponent(ssoEmail.trim())}`);
      if (res.found) {
        // A real cross-origin navigation to the IdP, not a fetch — SAML
        // can't be driven through the SPA's own request layer.
        window.location.href = `${BASE_URL}/v1/ondi/auth/saml/${res.providerId}/login`;
      } else {
        setError('No company sign-on found for that email. Check with your IT administrator, or use another sign-in method.');
        setSsoChecking(false);
      }
    } catch (err: any) {
      setError(err.message || 'Could not look up your company sign-on. Try again.');
      setSsoChecking(false);
    }
  };

  const sendMagicLink = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!magicEmail.trim()) { setError('Enter your email.'); return; }
    setError(null); setInfo(null); setLoading(true);
    try {
      const res = await requestMagicLink(magicEmail.trim());
      setMagicLinkSent(true);
      setInfo(res.message || 'If that email is registered, a sign-in link has been sent.');
    } catch (err: any) {
      setError(err.message || 'Could not send the link. Try again.');
    } finally { setLoading(false); }
  };

  const submitPasskey = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!passkeyEmail.trim()) { setError('Enter your email.'); return; }
    setError(null); setLoading(true);
    try {
      const options = await requestPasskeyLoginOptions(passkeyEmail.trim());
      const response = await startAuthentication({ optionsJSON: options });
      await verifyPasskeyLogin(passkeyEmail.trim(), response);
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Could not sign in with that passkey.');
    } finally { setLoading(false); }
  };

  // allowJoinRequest=true here (and only here — Login.tsx's own Google tab
  // used to call this login-only) — an email with no matching user but a
  // real domain match gets queued as a join request instead of a bare "no
  // account" error. See createJoinRequestForFederatedIdentity's own header
  // for why that's the only registration case a federated identity can
  // support (never a brand-new tenant with no company/plan/payment behind
  // it).
  const handleFederatedResult = (res: Awaited<ReturnType<typeof loginWithMicrosoft>>) => {
    if ('join_request' in res) {
      setInfo(`A request to join ${res.join_request.tenant_name} was sent for review. You'll get an email once an admin approves it.`);
      return;
    }
    if ('signup_ticket' in res) {
      onSignupTicket?.(res);
      return;
    }
    navigate(returnTo);
  };

  const handleFederatedError = (err: any, provider: 'Google' | 'Microsoft' | 'Apple') => {
    if (err?.status === 404 && err?.body?.code === 'NO_MATCHING_WORKSPACE') {
      if (isSignup) {
        setError(`Could not verify your ${provider} account. Try again.`);
      } else {
        setError(`No Hudumika workspace found for that ${provider} account.`);
        setNoWorkspaceFound(true);
      }
      return;
    }
    setError(err.message || `Could not sign in with ${provider}.`);
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null); setInfo(null); setNoWorkspaceFound(false); setLoading(true);
    try {
      handleFederatedResult(await loginWithGoogle(credential, true, isSignup));
    } catch (err: any) {
      handleFederatedError(err, 'Google');
    } finally { setLoading(false); }
  };

  const handleMicrosoftCredential = async (credential: string) => {
    setError(null); setInfo(null); setNoWorkspaceFound(false); setLoading(true);
    try {
      handleFederatedResult(await loginWithMicrosoft(credential, true, isSignup));
    } catch (err: any) {
      handleFederatedError(err, 'Microsoft');
    } finally { setLoading(false); }
  };

  const handleAppleCredential = async (credential: string, name?: string) => {
    setError(null); setInfo(null); setNoWorkspaceFound(false); setLoading(true);
    try {
      handleFederatedResult(await loginWithApple(credential, name, true, isSignup));
    } catch (err: any) {
      handleFederatedError(err, 'Apple');
    } finally { setLoading(false); }
  };

  return (
    <div className="ondi-panel">
      {mode === null ? (
        <>
          <div className="ondi-signin-choice" role="group" aria-label="Sign-in method">
            <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} variant="choice" />
            <span className="ondi-signin-choice-or" aria-hidden="true">{t('onboarding.or')}</span>
            <Button type="button" variant="ghost" size="sm" className="ondi-signin-choice-sso" aria-label="Sign in with company SSO" onClick={() => switchMode('company-sso')}>
              <Icon name="building" size={18} /><span>{t('onboarding.companySso')}</span>
            </Button>
          </div>
          {!isSignup && PHONE_LOGIN_ENABLED && (
            <button type="button" onClick={() => switchMode('phone')} className="ondi-pill ondi-pill--phone" data-ui-native-button="">
              <Icon name="phone" size={16} /> Continue with phone number
            </button>
          )}
          {!isSignup && SECONDARY_METHODS.length > 0 && (
            <>
              <button type="button" onClick={() => setShowMoreMethods(s => !s)} className="ondi-more-toggle" data-ui-native-button="">
                {showMoreMethods ? 'Fewer options' : 'More ways to sign in'}
                <Icon name={showMoreMethods ? 'chevronUp' : 'chevronDown'} size={13} />
              </button>
              {showMoreMethods && (
                <div>
                  <div className="ondi-method-row">
                    {SECONDARY_METHODS.map(key => (
                      <Tip key={key} label={METHOD_META[key].label}>
                        <button
                          type="button"
                          onClick={() => switchMode(key)}
                          className="ondi-method-btn"
                          aria-label={METHOD_META[key].label}
                         data-ui-native-button="">
                          <Icon name={METHOD_META[key].icon} size={17} />
                        </button>
                      </Tip>
                    ))}
                  </div>
                  <div className="ondi-method-caption">Pick a method above</div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <button type="button" onClick={() => switchMode(null)} className="login-back-btn ondi-form-back" data-ui-native-button="">
          <Icon name="chevronLeft" size={14} /> All sign-in options
        </button>
      )}

      {error && (
        <div className="login-error">
          <Icon name="alertCircle" size={16} />
          <span>{error}</span>
        </div>
      )}
      {noWorkspaceFound && (
        <button
          type="button"
          onClick={() => navigate(`/signup?returnTo=${encodeURIComponent(returnTo)}`)}
          className="login-submit-btn login-submit-btn--full"
          style={{ marginTop: 4 }}
          data-ui-native-button=""
        >
          Create a workspace instead
        </button>
      )}
      {info && !error && (
        <div className="login-error" style={{ background: 'var(--green-l, #ecfdf5)', borderColor: 'var(--green, #059669)', color: 'var(--green, #059669)' }}>
          <Icon name="checkCircle" size={16} />
          <span>{info}</span>
        </div>
      )}

      {mode === 'phone' && (
        <form onSubmit={otpSent ? submitOtp : (e) => { e.preventDefault(); sendCode(); }} noValidate className="login-form">
          <div className="login-field">
            <input data-ui-field="input"
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={e => { setPhone(e.target.value); setOtpSent(false); setOtpCode(''); }}
              className="login-input"
              autoComplete="tel"
              disabled={loading}
            />
          </div>

          {otpSent && (
            <div className="login-field">
              <input data-ui-field="input"
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="login-input"
                autoComplete="one-time-code"
                disabled={loading}
              />
            </div>
          )}

          {otpSent ? (
            <div className="login-form-actions">
              <button
                type="button"
                onClick={sendCode}
                disabled={loading || resendIn > 0}
                className="login-back-btn"
               data-ui-native-button="">
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="submit" disabled={loading} className="login-submit-btn" data-ui-native-button="">
                {loading ? 'Please wait…' : 'Verify & sign in'}
              </button>
            </div>
          ) : (
            <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {loading ? 'Please wait…' : 'Send code'}
            </button>
          )}
        </form>
      )}

      {mode === 'totp' && (
        totpStep === 'credentials' ? (
          <form onSubmit={submitTotpCredentials} noValidate className="login-form">
            <div className="login-field">
              <input data-ui-field="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="login-input"
                autoComplete="username"
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="login-field">
              <div className="login-field-pw">
                <input data-ui-field="input"
                  type={showTotpPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={totpPassword}
                  onChange={e => setTotpPassword(e.target.value)}
                  className="login-input"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <Tip label={showTotpPassword ? 'Hide password' : 'Show password'}>
                  <button type="button" onClick={() => setShowTotpPassword(p => !p)} className="login-pw-toggle" data-ui-native-button="">
                    <Icon name={showTotpPassword ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </Tip>
              </div>
            </div>
            <button type="submit" disabled={loading || !email.trim() || !totpPassword} className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {loading ? 'Please wait…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitTotp} noValidate className="login-form">
            <div className="login-field">
              <input data-ui-field="input"
                type="text"
                inputMode="numeric"
                placeholder="6-digit authenticator code"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="login-input"
                autoComplete="one-time-code"
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="login-form-actions">
              <button
                type="button"
                onClick={() => { setTotpStep('credentials'); setTotpCode(''); setTotpPassword(''); setError(null); }}
                disabled={loading}
                className="login-back-btn"
               data-ui-native-button="">
                Back
              </button>
              <button type="submit" disabled={loading} className="login-submit-btn" data-ui-native-button="">
                {loading ? 'Please wait…' : 'Verify & sign in'}
              </button>
            </div>
          </form>
        )
      )}

      {mode === 'passkey' && (
        <form onSubmit={submitPasskey} noValidate className="login-form">
          <div className="login-field">
            <input data-ui-field="input"
              type="email"
              placeholder="Email"
              value={passkeyEmail}
              onChange={e => setPasskeyEmail(e.target.value)}
              className="login-input"
              autoComplete="username webauthn"
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
            {loading ? 'Please wait…' : 'Continue with passkey'}
          </button>
        </form>
      )}

      {mode === 'magic-link' && (
        magicLinkSent ? (
          <div className="login-form">
            <p className="login-subtext" style={{ textAlign: 'center' }}>
              Check <strong>{magicEmail}</strong> for a one-click sign-in link. It expires in 15 minutes and works once.
            </p>
            <button
              type="button"
              onClick={() => { setMagicLinkSent(false); setInfo(null); }}
              className="login-back-btn"
              style={{ margin: '0 auto' }}
             data-ui-native-button="">
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} noValidate className="login-form">
            <div className="login-field">
              <input data-ui-field="input"
                type="email"
                placeholder="Email"
                value={magicEmail}
                onChange={e => setMagicEmail(e.target.value)}
                className="login-input"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {loading ? 'Please wait…' : 'Send sign-in link'}
            </button>
          </form>
        )
      )}

      {mode === 'company-sso' && (
        <form onSubmit={checkCompanySso} noValidate className="login-form">
          <div className="login-field">
            <label className="reg-label" style={{ marginBottom: 4, display: 'block' }}>
              Work or organization email
            </label>
            <input data-ui-field="input"
              type="email"
              placeholder="you@yourcompany.com"
              value={ssoEmail}
              onChange={e => setSsoEmail(e.target.value)}
              className="login-input"
              autoComplete="username"
              disabled={ssoChecking}
              autoFocus
            />
            <p className="login-subtext" style={{ fontSize: 11.5, marginTop: 4 }}>
              Enter your work email to connect to your organization's Single Sign-On (SSO).
            </p>
          </div>
          <button type="submit" disabled={ssoChecking} className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
            {ssoChecking ? 'Connecting to SSO…' : 'Continue with SSO'}
          </button>
        </form>
      )}
    </div>
  );
}

export default OndiSignInPanel;
