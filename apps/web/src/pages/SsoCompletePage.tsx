// ─── SsoCompletePage.tsx — public, unauthenticated ───────────────────
// Landing page for a federated login that arrives via a real browser
// navigation rather than a fetch() call from the SPA — today that's SAML's
// Assertion Consumer Service (ondi-saml.routes.ts's /acs), which sets real
// session cookies and then redirects the browser here. There is no JS
// context at the IdP/ACS hop to write localStorage from, so this page's one
// job is to pick that session up from the cookie (useAuth's resumeSession,
// via GET /v1/identity/me) before entering the app.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { AuthCard, AuthAlert } from './Login.js';

export const SsoCompletePage: React.FC = () => {
  const { resumeSession } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    resumeSession().then(user => {
      if (user) navigate('/');
      else setFailed(true);
    });
  }, []);

  return (
    <AuthCard>
      {failed ? (
        <AuthAlert message="Your sign-in didn't come through. Try again from your company's sign-in page." />
      ) : (
        <p className="auth-form-sub">Signing you in…</p>
      )}
    </AuthCard>
  );
};

export default SsoCompletePage;
