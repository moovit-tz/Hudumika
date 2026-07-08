import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import type { StepProps } from './types.js';
import type { EmailCheckResponse } from '@hudumika/types';

function passStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s as 0 | 1 | 2 | 3;
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Strong'];

export const StepAccount: React.FC<StepProps> = ({ draft, update, onNext }) => {
  const navigate = useNavigate();
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErr, setFieldErr]       = useState<Record<string, string | undefined>>({});
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const email = draft.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus('idle');
      return;
    }
    setEmailStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const res: EmailCheckResponse = await apiFetch(`/v1/onboarding/check-email?value=${encodeURIComponent(email)}`);
        setEmailStatus(res.available ? 'available' : 'taken');
      } catch {
        setEmailStatus('idle');
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

  const strength = passStrength(draft.password);

  return (
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
        {fieldErr.email && <span className="login-field-err">{fieldErr.email}</span>}
      </div>

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
          <button type="button" onClick={() => setShowPass(p => !p)} className="login-pw-toggle" title={showPass ? 'Hide password' : 'Show password'}>
            <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
          </button>
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
          <button type="button" onClick={() => setShowConfirm(p => !p)} className="login-pw-toggle" title={showConfirm ? 'Hide password' : 'Show password'}>
            <Icon name={showConfirm ? 'eyeOff' : 'eye'} size={15} />
          </button>
        </div>
        {fieldErr.confirm && <span className="login-field-err">{fieldErr.confirm}</span>}
      </div>

      <div className="login-form-actions">
        <button type="button" onClick={() => navigate('/login')} className="login-back-btn">Back</button>
        <button type="submit" className="login-submit-btn">Continue</button>
      </div>
    </form>
  );
};
