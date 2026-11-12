import { useLocale } from '../../hooks/useLocale.js';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { OndiSignInPanel } from '../../components/OndiSignInPanel.js';
import type { StepProps } from './types.js';
import type { FederatedSignupTicket } from '@hudumika/types';

// Signup offers Google identity verification or manual business email details.
// After Google verification, the email is bound to Ondi's ticket; only the
// editable profile name remains before the user continues to business setup.
export const StepAccount: React.FC<StepProps> = ({ draft, update, onNext, accountPassword = '', setAccountPassword }) => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [nameErr, setNameErr] = useState<string | undefined>(undefined);
  const [emailErr, setEmailErr] = useState<string | undefined>(undefined);
  const [passwordErr, setPasswordErr] = useState<string | undefined>(undefined);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordErr, setConfirmPasswordErr] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<'ondi' | 'email'>('ondi');

  const handleSignupTicket = (ticket: FederatedSignupTicket) => {
    setAccountPassword?.('');
    setConfirmPassword('');
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
    if (!draft.ondi_ticket && accountPassword.length < 8) {
      setPasswordErr(t('onboarding.passwordMinLength'));
      hasErr = true;
    }
    if (!draft.ondi_ticket && accountPassword !== confirmPassword) {
      setConfirmPasswordErr(t('onboarding.passwordMismatch'));
      hasErr = true;
    }
    if (hasErr) return;
    onNext();
  };

  const useDifferentAccount = () => {
    update({ ondi_ticket: '', email: '', name: '' });
    setAccountPassword?.('');
    setConfirmPassword('');
  };

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
          <OndiSignInPanel
            intent="signup"
            onSignupTicket={handleSignupTicket}
            signupEmailAction={(
              <button
                type="button"
                onClick={() => { setAccountPassword?.(''); setConfirmPassword(''); setMode('email'); }}
                className="ondi-signin-choice-email"
                data-ui-native-button=""
              >
                <Icon name="mail" size={16} />
                <span>{t('onboarding.emailDetails')}</span>
              </button>
            )}
          />

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

          <div className="login-field">
            <label className="reg-label">{t('login.passwordLabel')}</label>
            <input data-ui-field="input"
              type="password"
              value={accountPassword}
              onChange={e => { setAccountPassword?.(e.target.value); setPasswordErr(undefined); }}
              className={`login-input${passwordErr ? ' login-input--error' : ''}`}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {passwordErr && <span className="login-field-err">{passwordErr}</span>}
          </div>

          <div className="login-field">
            <label className="reg-label">{t('onboarding.confirmPassword')}</label>
            <input data-ui-field="input"
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setConfirmPasswordErr(undefined); }}
              className={`login-input${confirmPasswordErr ? ' login-input--error' : ''}`}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {confirmPasswordErr && <span className="login-field-err">{confirmPasswordErr}</span>}
          </div>

          <div className="login-form-actions" style={{ flexDirection: 'column', gap: 10 }}>
            <button type="submit" className="login-submit-btn login-submit-btn--full" data-ui-native-button="">
              {t('onboarding.continueBusiness')}
            </button>
            <button
              type="button"
              onClick={() => { setAccountPassword?.(''); setConfirmPassword(''); setMode('ondi'); }}
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
