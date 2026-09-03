import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { OndiLogo } from '../../components/OndiLogo.js';
import { OndiSignInPanel } from '../../components/OndiSignInPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { StepProps } from './types.js';
import { PERSONAL_EMAIL_DOMAINS } from '@hudumika/types';
import type { EmailCheckResponse, MatchedTenant } from '@hudumika/types';

function passStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s as 0 | 1 | 2 | 3;
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Strong'];

// The field is labeled "Work email" — this flags the well-known free
// consumer providers so a personal address gets a clear, honest heads-up
// instead of silently being accepted as if it were a company domain. A
// warning, not a hard block: a real small business genuinely running on a
// gmail.com address is exactly this platform's own target market, and
// refusing the signup outright would turn away a legitimate customer over
// a guess about their domain.
const PERSONAL_EMAIL_DOMAIN_SET = new Set(PERSONAL_EMAIL_DOMAINS);
function personalEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return PERSONAL_EMAIL_DOMAIN_SET.has(domain) ? domain : null;
}

export const StepAccount: React.FC<StepProps> = ({ draft, update, onNext, onRequestJoin, joinRequestSubmitting, joinRequestError }) => {
  const navigate = useNavigate();
  // Details vs Ondi — was a navigation to /ondi/login; moved inline (same
  // fix, same reasoning, as Login.tsx's own method tabs).
  const [mode, setMode] = useState<'details' | 'ondi'>('details');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErr, setFieldErr]       = useState<Record<string, string | undefined>>({});
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  // Auto-join-by-domain — set only when the (available) email's domain
  // matches an existing tenant's real, active staff. Personal-provider
  // domains never populate this (check-email never returns one for them).
  const [matchedTenant, setMatchedTenant] = useState<MatchedTenant | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const email = draft.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus('idle');
      setMatchedTenant(null);
      return;
    }
    setEmailStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res: EmailCheckResponse = await apiFetch(`/v1/onboarding/check-email?value=${encodeURIComponent(email)}`);
        setEmailStatus(res.available ? 'available' : 'taken');
        setMatchedTenant(res.matched_tenant ?? null);
      } catch {
        setEmailStatus('idle');
        setMatchedTenant(null);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.email]);

  const set = (k: 'name' | 'email' | 'password' | 'confirm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    update({ [k]: e.target.value } as any);
    setFieldErr(p => ({ ...p, [k]: undefined }));
  };

  const validate = () => {
    const e: Record<string, string | undefined> = {};
    if (!draft.name.trim())   e.name = 'Full name is required';
    if (!draft.email)         e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) e.email = 'Enter a valid email address';
    else if (emailStatus === 'taken') e.email = 'An account with this email already exists';
    if (!draft.password)      e.password = 'Password is required';
    else if (draft.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (draft.confirm !== draft.password) e.confirm = 'Passwords do not match';
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    onNext();
  };

  const handleRequestJoin = (ev: React.MouseEvent) => {
    ev.preventDefault();
    if (!validate() || !matchedTenant || !onRequestJoin) return;
    onRequestJoin(matchedTenant.id);
  };

  const strength = passStrength(draft.password);
  const personalDomain = personalEmailDomain(draft.email);
  const showJoinOffer = !!matchedTenant && emailStatus === 'available';

  return (
    <>
      {/* Same choice, same relocation as the sign-in page: Ondi's own page
          already handles "does this email belong to a company already on
          Hudumika" via its Google button (allowJoinRequest — instant join
          request, no form to fill in at all) — a company that's genuinely
          new still needs this form (name/plan/payment have nowhere else to
          come from), but a colleague joining an existing one doesn't. */}
      <div className="login-method-tabs">
        <button type="button" onClick={() => setMode('ondi')} className={`login-method-tab${mode === 'ondi' ? ' login-method-tab--active' : ''}`}>
          <OndiLogo size={14} />
          <span>Ondi</span>
        </button>
        <button type="button" onClick={() => setMode('details')} className={`login-method-tab${mode === 'details' ? ' login-method-tab--active' : ''}`}>
          <Icon name="user" size={14} />
          <span>Details</span>
        </button>
      </div>

      {mode === 'ondi' && <OndiSignInPanel />}

      {mode === 'details' && (
      <form onSubmit={handleSubmit} noValidate className="login-form">
      <div className="login-field">
        <label className="reg-label">Full name</label>
        <input
          type="text"
          placeholder="John Mwangi"
          value={draft.name}
          onChange={set('name')}
          className={`login-input${fieldErr.name ? ' login-input--error' : ''}`}
          autoComplete="name"
        />
        {fieldErr.name && <span className="login-field-err">{fieldErr.name}</span>}
      </div>

      <div className="login-field">
        <label className="reg-label">Work email</label>
        <div className="login-field-pw">
          <input
            type="email"
            placeholder="you@company.com"
            value={draft.email}
            onChange={set('email')}
            className={`login-input${fieldErr.email ? ' login-input--error' : ''}`}
            autoComplete="email"
          />
          {emailStatus === 'checking' && <span className="ob-field-status ob-field-status--checking">Checking…</span>}
          {emailStatus === 'available' && <span className="ob-field-status ob-field-status--ok"><Icon name="checkCircle" size={14} /></span>}
          {emailStatus === 'taken' && <span className="ob-field-status ob-field-status--bad"><Icon name="xCircle" size={14} /></span>}
        </div>
        {personalDomain && !fieldErr.email && (
          <span className="ob-field-hint ob-field-hint--warn">
            <Icon name="alertTriangle" size={13} />
            {personalDomain} is a personal email provider, not a work domain — you can still continue with it.
          </span>
        )}
        {fieldErr.email && <span className="login-field-err">{fieldErr.email}</span>}
      </div>

      {showJoinOffer && matchedTenant && (
        <div className="ob-join-offer">
          <Icon name="building" size={18} />
          <div className="ob-join-offer-body">
            <div className="ob-join-offer-title">{matchedTenant.name} is already on Hudumika</div>
            <div className="ob-join-offer-sub">
              Your email domain matches an existing company workspace. Fill in your name and a password below, then
              request to join it instead of setting up a brand new one — an admin at {matchedTenant.name} will need
              to approve you.
            </div>
            {joinRequestError && <div className="ob-join-offer-error">{joinRequestError}</div>}
          </div>
        </div>
      )}

      <div className="login-field">
        <label className="reg-label">Password</label>
        <div className="login-field-pw">
          <input
            type={showPass ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            value={draft.password}
            onChange={set('password')}
            className={`login-input${fieldErr.password ? ' login-input--error' : ''}`}
            autoComplete="new-password"
          />
          <Tip label={showPass ? 'Hide password' : 'Show password'}>
            <button type="button" onClick={() => setShowPass(p => !p)} className="login-pw-toggle">
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </Tip>
        </div>
        {strength > 0 && (
          <div className="reg-strength" data-strength={strength}>
            <div className="reg-strength-bars">
              {[1, 2, 3].map(lvl => (
                <div key={lvl} className={`reg-strength-bar${strength >= lvl ? ' reg-strength-bar--on' : ''}`} />
              ))}
            </div>
            <span className="reg-strength-label">{STRENGTH_LABEL[strength]}</span>
          </div>
        )}
        {fieldErr.password && <span className="login-field-err">{fieldErr.password}</span>}
      </div>

      <div className="login-field">
        <label className="reg-label">Confirm password</label>
        <div className="login-field-pw">
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="Re-enter password"
            value={draft.confirm}
            onChange={set('confirm')}
            className={`login-input${fieldErr.confirm ? ' login-input--error' : ''}`}
            autoComplete="new-password"
          />
          <Tip label={showConfirm ? 'Hide password' : 'Show password'}>
            <button type="button" onClick={() => setShowConfirm(p => !p)} className="login-pw-toggle">
              <Icon name={showConfirm ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </Tip>
        </div>
        {fieldErr.confirm && <span className="login-field-err">{fieldErr.confirm}</span>}
      </div>

      {showJoinOffer ? (
        <div className="login-form-actions ob-join-offer-actions">
          <button type="button" onClick={() => navigate('/login')} className="login-back-btn">Back to sign in</button>
          <button
            type="button"
            onClick={handleRequestJoin}
            disabled={joinRequestSubmitting}
            className="login-submit-btn"
          >
            {joinRequestSubmitting ? 'Sending request…' : `Request to join ${matchedTenant!.name}`}
          </button>
        </div>
      ) : (
        <div className="login-form-actions">
          <button type="button" onClick={() => navigate('/login')} className="login-back-btn">Back to sign in</button>
          <button type="submit" className="login-submit-btn">Continue</button>
        </div>
      )}
      {showJoinOffer && (
        <button type="submit" className="ob-join-offer-skip">
          Set up a new, separate workspace instead
        </button>
      )}
      </form>
      )}
    </>
  );
};
