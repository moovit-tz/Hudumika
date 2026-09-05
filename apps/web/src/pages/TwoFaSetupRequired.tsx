import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface SetupData { secret: string; uri: string }

/**
 * SuperAdmin ▸ Settings ▸ Security & Sessions' "Two-Factor Authentication
 * Policy: Required" lands here — auth.routes.ts's POST /login withholds a
 * real session for an account that authenticated correctly but has no
 * authenticator enrolled yet, issuing only a narrow, 15-minute setup token
 * instead (see middleware/auth.ts's TWOFA_SETUP_ALLOWED_ROUTES). This page
 * is the only place that token is ever used, calling /v1/security/2fa/setup
 * and /verify directly with it as a Bearer header rather than the normal
 * session cookie. Once verify succeeds, the server has already set real
 * session cookies (security.routes.ts's own twofa_setup branch) — resumeSession()
 * just needs to read them back.
 */
export const TwoFaSetupRequired: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { resumeSession } = useAuth();
  const setupToken = (location.state as { setupToken?: string } | null)?.setupToken;

  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (!setupToken) {
    navigate('/login', { replace: true });
    return null;
  }

  const authHeader = { Authorization: `Bearer ${setupToken}` };

  async function startSetup() {
    setBusy(true);
    try {
      setSetupData(await apiFetch('/v1/security/2fa/setup', { method: 'POST', headers: authHeader }));
    } catch (err: any) {
      showAlert(err.message || 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndFinish() {
    setBusy(true);
    try {
      await apiFetch('/v1/security/2fa/verify', { method: 'POST', headers: authHeader, body: JSON.stringify({ token: verifyCode }) });
      await resumeSession();
      navigate('/', { replace: true });
    } catch (err: any) {
      showAlert(err.message || 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--elev-lg)', padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name="shield" size={20} color="var(--teal)" />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Two-factor authentication required</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, margin: '0 0 20px' }}>
          Your organization requires an authenticator app on every account. Set one up now to finish signing in.
        </p>

        {!setupData && (
          <Button variant="default" onClick={startSetup} disabled={busy}>
            {busy ? 'Starting…' : 'Set up authenticator'}
          </Button>
        )}

        {setupData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ padding: 10, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <QRCodeSVG value={setupData.uri} size={128} level="M" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>1. Scan with your authenticator app</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)', wordBreak: 'break-all', marginBottom: 14 }}>{setupData.secret}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>2. Enter the 6-digit code</div>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="input-field"
                  style={{ fontFamily: 'var(--mono)', fontSize: 16, letterSpacing: '0.2em', textAlign: 'center', width: 150 }}
                />
              </div>
            </div>
            <Button variant="default" onClick={verifyAndFinish} disabled={busy || verifyCode.length < 6}>
              {busy ? 'Verifying…' : 'Verify & continue'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
