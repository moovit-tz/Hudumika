import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { AuthCard } from './Login.js';

export const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const email = params.get('email') ?? 'your email';

  return (
    <AuthCard>
      <div className="auth-sent-state">
        <div className="auth-sent-icon auth-sent-icon-ok">
          <Icon name="mail" size={32} strokeWidth={1.5} />
        </div>
        <h2 className="auth-form-title">Verify your email</h2>
        <p className="auth-form-sub" style={{ marginBottom: 8 }}>
          We sent a verification link to
        </p>
        <p style={{ fontWeight: 600, color: 'var(--lp-ink)', fontSize: 15, marginBottom: 20, wordBreak: 'break-all' }}>
          {email}
        </p>
        <p className="auth-form-sub" style={{ fontSize: 13, color: 'var(--lp-ink3)', marginBottom: 28 }}>
          Click the link in that email to activate your account. The link expires in 24 hours. Check your spam folder if you don't see it.
        </p>

        <div className="auth-verify-steps">
          {[
            { icon: 'mail' as const,        text: 'Open your email inbox' },
            { icon: 'search' as const,      text: 'Find the email from Hudumika' },
            { icon: 'checkCircle' as const, text: 'Click the verification link' },
          ].map((s, i) => (
            <div key={i} className="auth-verify-step">
              <div className="auth-verify-num">{i + 1}</div>
              <Icon name={s.icon} size={14} />
              <span>{s.text}</span>
            </div>
          ))}
        </div>

        <Link to="/auth/login" className="auth-btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 24 }}>
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
};
