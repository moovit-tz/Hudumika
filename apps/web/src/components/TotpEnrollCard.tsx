// ─── TotpEnrollCard.tsx — self-contained authenticator-app enrollment ───
// Same real endpoints (/v1/security/2fa/*) OndiSecuritySettings.tsx's MFA
// card already uses, packaged so it can also be mounted on Ondi Personal ▸
// Apps ("add an app for authentication" — literally an authenticator app).
// Intentionally not swapped into OndiSecuritySettings itself: that flow
// already works, this is purely a second, independent mount point, styled
// entirely with inline tokens so it doesn't depend on either host page's
// CSS file.
import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { showAlert } from '../lib/alert.js';

export function TotpEnrollCard() {
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; enabled_at: string | null } | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch('/v1/security/2fa/status').then(setTwoFA).catch(() => setTwoFA({ enabled: false, enabled_at: null }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function startSetup() {
    setBusy(true);
    try {
      setSetupData(await apiFetch('/v1/security/2fa/setup', { method: 'POST' }));
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndEnable() {
    setBusy(true);
    try {
      const res = await apiFetch('/v1/security/2fa/verify', { method: 'POST', body: JSON.stringify({ token: verifyCode }) });
      setBackupCodes(res.backup_codes);
      setTwoFA({ enabled: true, enabled_at: new Date().toISOString() });
      setSetupData(null);
      setVerifyCode('');
      showAlert('Authenticator app connected.', { variant: 'success', title: 'Two-factor enabled' });
    } catch (err: any) {
      showAlert(err.message || 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await apiFetch('/v1/security/2fa/disable', { method: 'POST', body: JSON.stringify({ token: disableCode }) });
      setTwoFA({ enabled: false, enabled_at: null });
      setShowDisable(false);
      setDisableCode('');
      setBackupCodes(null);
      showAlert('Authenticator app disconnected.', { variant: 'warning' });
    } catch (err: any) {
      showAlert(err.message || 'Invalid confirmation code.');
    } finally {
      setBusy(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--white, #ffffff)', border: '1px solid var(--border)',
    borderRadius: 'var(--r, 12px)', overflow: 'hidden', boxShadow: 'var(--elev-sm)',
  };
  const hdrStyle: React.CSSProperties = {
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  };
  const bodyStyle: React.CSSProperties = { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 };
  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font)', fontSize: 13, color: 'var(--ink)', background: 'var(--bg)',
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 8px)', padding: '8px 10px', boxSizing: 'border-box',
  };

  return (
    <div style={cardStyle}>
      <div style={hdrStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: twoFA?.enabled ? 'var(--green-l)' : 'var(--teal-l)', color: twoFA?.enabled ? 'var(--green, #10b981)' : 'var(--teal)',
          }}>
            <Icon name="shield" size={15} />
          </div>
          <div>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Authenticator app</h3>
            <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '2px 0 0' }}>Add a TOTP app (Google Authenticator, Authy, 1Password) as a sign-in factor</p>
          </div>
        </div>
        <Badge variant={twoFA?.enabled ? 'success' : 'gray'}>{twoFA?.enabled ? 'Connected' : 'Not connected'}</Badge>
      </div>

      <div style={bodyStyle}>
        {twoFA === null && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}

        {twoFA && !twoFA.enabled && !setupData && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, margin: '0 0 14px' }}>
              Every app you connect through Ondi is protected by your account's own sign-in — adding an authenticator app here strengthens that for all of them at once.
            </p>
            <Button variant="default" size="sm" onClick={startSetup} disabled={busy}>
              <Icon name="plus" size={13} style={{ marginRight: 5 }} />
              Add authenticator app
            </Button>
          </div>
        )}

        {setupData && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--white)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
              <QRCodeSVG value={setupData.uri} size={120} level="M" />
            </div>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>1. Scan the QR code, or copy the secret key</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                <span style={{ flex: 1, overflow: 'auto', whiteSpace: 'nowrap' }}>{setupData.secret}</span>
                <button type="button" onClick={() => { navigator.clipboard.writeText(setupData.secret); showAlert('Secret key copied.', { variant: 'success' }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0, display: 'flex' }}>
                  <Icon name="copy" size={13} />
                </button>
              </div>

              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>2. Enter the 6-digit code it shows</span>
              <input
                type="text" value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" style={{ ...inputStyle, fontFamily: 'var(--mono)', fontSize: 16, letterSpacing: '0.2em', textAlign: 'center', width: 160 }}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="default" size="sm" onClick={verifyAndEnable} disabled={busy || verifyCode.length < 6}>Verify & connect</Button>
                <Button variant="outline" size="sm" onClick={() => { setSetupData(null); setVerifyCode(''); }}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {backupCodes && (
          <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Backup codes — save these somewhere safe</span>
              <button type="button" onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); showAlert('Backup codes copied.', { variant: 'success' }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="copy" size={12} /> Copy all
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)' }}>
              {backupCodes.map((code) => <div key={code}>{code}</div>)}
            </div>
          </div>
        )}

        {twoFA?.enabled && !setupData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green, #10b981)', fontSize: 13, fontWeight: 600 }}>
              <Icon name="checkCircle" size={16} />
              <span>An authenticator app is connected{twoFA.enabled_at ? ` since ${new Date(twoFA.enabled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}.</span>
            </div>

            {!showDisable ? (
              <div>
                <Button variant="outline" size="sm" onClick={() => setShowDisable(true)} style={{ color: 'var(--red)' }}>Disconnect authenticator app</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <input
                  type="text" value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code" style={{ ...inputStyle, width: 160, fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}
                />
                <Button variant="outline" size="sm" onClick={disable} disabled={busy || disableCode.length < 6} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>Confirm disconnect</Button>
                <Button variant="outline" size="sm" onClick={() => { setShowDisable(false); setDisableCode(''); }}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TotpEnrollCard;
