import { useLocale } from '../../hooks/useLocale.js';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { OndiSignInPanel } from '../../components/OndiSignInPanel.js';
import type { StepProps } from './types.js';
import type { FederatedSignupTicket } from '@hudumika/types';

// Full-SSO registration: identity is verified by Ondi (Google/Microsoft/
// Apple — see OndiSignInPanel's intent="signup" for why those three and not
// phone/email) before anything else is asked. Once verified, this step only
// needs a full name (editable — Ondi's own profile name is a convenience
// default, not a verified claim) and confirmation of the email Ondi already
// verified (not editable — the ondi_ticket in draft is keyed to that exact
// address server-side; letting it be retyped here would be purely cosmetic
// and confusing once /onboarding/complete silently used the real one anyway).
// There is no password anywhere in this flow — completeOnboarding() mints
// one server-side from the verified ticket and the account signs in via
// Ondi from then on, same as any existing user who does.
export const StepAccount: React.FC<StepProps> = ({ draft, update, onNext }) => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [nameErr, setNameErr] = useState<string | undefined>(undefined);
  const [emailErr, setEmailErr] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<'ondi' | 'email'>('ondi');

  const handleSignupTicket = (ticket: FederatedSignupTicket) => {
    update({ ondi_ticket: ticket.signup_ticket, email: ticket.email, name: ticket.name });
  };

  const handleContinue = (ev: React.FormEvent) => {
    ev.preventDefault();
    let hasErr = false;
    if (!draft.name?.trim()) {
      setNameErr(t('onboarding.nameRequired'));
      hasErr = true;
    }
    if (!draft.ondi_ticket && !draft.email?.trim()) {
      setEmailErr(t('onboarding.emailRequired'));
      hasErr = true;
    } else if (!draft.ondi_ticket && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      setEmailErr(t('onboarding.validEmail'));
      hasErr = true;
    }
    if (hasErr) return;
    onNext();
  };

  const useDifferentAccount = () => update({ ondi_ticket: '', email: '', name: '' });

  return (
    <div className="ob-account-container">
      {draft.ondi_ticket ? (
        <form onSubmit={handleContinue} noValidate className="login-form">
          <div className="ob-join-offer" style={{ marginBottom: 12 }}>
            <Icon name="checkCircle" size={18} />
            <div className="ob-join-offer-body">
              <div className="ob-join-offer-title">{t('onboarding.verified')}</div>
              <div className="ob-join-offer-sub">
                Signed in as <strong>{draft.email}</strong>.{' '}
                <button
                  type="button"
                  onClick={useDifferentAccount}
                  className="ob-signin-link"
                >
                  {t('onboarding.differentAccount')}
                </button>
              </div>
            </div>
          </div>

          <div className="login-field">
            <label className="reg-label">{t('onboarding.fullName')}</label>
            <input data-ui-field="input"
              type="text"
              placeholder="e.g. Asha Mwinyi"
              value={draft.name}
              onChange={e => { update({ name: e.target.value }); setNameErr(undefined); }}
              className={`login-input${nameErr ? ' login-input--error' : ''}`}
              autoComplete="name"
              autoFocus
            />
            {nameErr && <span className="login-field-err">{nameErr}</span>}
          </div>

          <div className="login-form-actions">
            <button type="submit" className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {t('onboarding.continueBusiness')}
            </button>
          </div>
        </form>
      ) : mode === 'ondi' ? (
        <>
          <p className="login-subtext" style={{ textAlign: 'center', marginBottom: 16 }}>
            {t('onboarding.identityIntro')}
          </p>
          <OndiSignInPanel intent="signup" onSignupTicket={handleSignupTicket} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--lp-row-border, #e2e8f0)' }} />
            <span style={{ fontSize: 11, color: 'var(--lp-ink3, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('onboarding.emailAlternative')}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--lp-row-border, #e2e8f0)' }} />
          </div>

          <button
            type="button"
            onClick={() => setMode('email')}
            className="login-back-btn"
            style={{ width: '100%', height: "var(--action-h)", justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}
            data-ui-native-button=""
          >
            <Icon name="mail" size={15} />
            <span>{t('onboarding.emailDetails')}</span>
          </button>

          <p className="login-subtext ob-existing-account" style={{ marginTop: 18 }}>
            <span>{t('onboarding.alreadyHaveAccount')}</span>
            <Link to="/ondi/login" className="ob-signin-link">
              {t('onboarding.signInInstead')}
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleContinue} noValidate className="login-form">
          <div className="login-field">
            <label className="reg-label">{t('onboarding.fullName')}</label>
            <input data-ui-field="input"
              type="text"
              placeholder="e.g. John Mwangi"
              value={draft.name}
              onChange={e => { update({ name: e.target.value }); setNameErr(undefined); }}
              className={`login-input${nameErr ? ' login-input--error' : ''}`}
              autoComplete="name"
              autoFocus
            />
            {nameErr && <span className="login-field-err">{nameErr}</span>}
          </div>

          <div className="login-field">
            <label className="reg-label">{t('onboarding.workEmail')}</label>
            <input data-ui-field="input"
              type="email"
              placeholder="john@yourcompany.co.tz"
              value={draft.email}
              onChange={e => { update({ email: e.target.value }); setEmailErr(undefined); }}
              className={`login-input${emailErr ? ' login-input--error' : ''}`}
              autoComplete="email"
            />
            {emailErr && <span className="login-field-err">{emailErr}</span>}
          </div>

          <div className="login-form-actions" style={{ flexDirection: 'column', gap: 10 }}>
            <button type="submit" className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {t('onboarding.continueBusiness')}
            </button>
            <button
              type="button"
              onClick={() => setMode('ondi')}
              className="login-back-btn"
              style={{ width: '100%', height: "var(--action-h)", justifyContent: 'center', fontSize: "var(--text-base)", display: 'flex', alignItems: 'center', gap: 6 }}
              data-ui-native-button=""
            >
              <Icon name="arrowLeft" size={13} />
              <span>{t('onboarding.backProviders')}</span>
            </button>
          </div>

          <p className="login-subtext ob-existing-account" style={{ marginTop: 18 }}>
            <span>{t('onboarding.alreadyHaveAccount')}</span>
            <Link to="/ondi/login" className="ob-signin-link">
              {t('onboarding.signInInstead')}
            </Link>
          </p>
        </form>
      )}
    </div>
  );
};
