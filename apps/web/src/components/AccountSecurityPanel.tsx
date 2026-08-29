import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, type IconName } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/**
 * Every self-service account-security surface Ondi built this session —
 * password, 2FA, identity verification (KYC), active sessions, passkeys,
 * trust score. Originally lived only inside Subscription.tsx's Security
 * tab, which is gated to MGMT_ROLES (SUPER_ADMIN/ADMIN/TENANT_ADMIN/
 * MANAGER) — meaning most real staff (OFFICER/JUNIOR/SALES/FINANCE/SENIOR)
 * could never reach their OWN 2FA/passkey/KYC settings through the UI at
 * all. Extracted here so it can also render on /profile, which every
 * signed-in user can reach regardless of role — these are personal
 * security settings, not a tenant-admin/billing concern. Subscription.tsx
 * still renders it too (an admin managing their own account from the
 * workspace-billing screen is reasonable); the two call sites share this
 * one implementation rather than drifting apart.
 */

function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${Math.max(sec, 0)} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hrs ago`;
  return `${Math.floor(hr / 24)} days ago`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Btn({ label, icon, onClick, variant = 'ghost', disabled = false }: { label: string; icon?: IconName; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const style: Record<string, React.CSSProperties> = {
    primary: { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none' },
    ghost:   { background: 'var(--white)', color: 'var(--ink)', border: '1.5px solid var(--border)' },
    danger:  { background: 'var(--white)', color: 'var(--red)', border: '1.5px solid var(--border)' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'var(--font)', ...style[variant], minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
      {icon && <Icon name={icon} size={13} strokeWidth={2} />}
      {label}
    </button>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{label}</label>
      {children}
    </div>
  );
}

export function AccountSecurityPanel() {
  const { logout } = useAuth();

  // ── Change password ──────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function updatePassword() {
    if (newPw.length < 8) { showAlert('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { showAlert('New password and confirmation do not match.'); return; }
    setPwSaving(true);
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPw, new_password: newPw }) });
      showAlert('Password updated.', { variant: 'success', title: 'Success' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  // ── 2FA ───────────────────────────────────────────────────────
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; enabled_at: string | null } | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [twoFABusy, setTwoFABusy] = useState(false);

  useEffect(() => {
    apiFetch('/v1/security/2fa/status').then(setTwoFA).catch(() => setTwoFA({ enabled: false, enabled_at: null }));
  }, []);

  async function startSetup() {
    setTwoFABusy(true);
    try {
      setSetupData(await apiFetch('/v1/security/2fa/setup', { method: 'POST' }));
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setTwoFABusy(false);
    }
  }

  async function verifyAndEnable() {
    setTwoFABusy(true);
    try {
      const res = await apiFetch('/v1/security/2fa/verify', { method: 'POST', body: JSON.stringify({ token: verifyCode }) });
      setBackupCodes(res.backup_codes);
      setTwoFA({ enabled: true, enabled_at: new Date().toISOString() });
      setSetupData(null);
      setVerifyCode('');
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setTwoFABusy(false);
    }
  }

  async function disable2FA() {
    setTwoFABusy(true);
    try {
      await apiFetch('/v1/security/2fa/disable', { method: 'POST', body: JSON.stringify({ token: disableCode }) });
      setTwoFA({ enabled: false, enabled_at: null });
      setShowDisable(false);
      setDisableCode('');
      setBackupCodes(null);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setTwoFABusy(false);
    }
  }

  // ── Sessions ──────────────────────────────────────────────────
  const [sessions, setSessions] = useState<any[] | null>(null);

  const reloadSessions = useCallback(async () => {
    try { setSessions(await apiFetch('/v1/security/sessions')); } catch { setSessions([]); }
  }, []);

  useEffect(() => { reloadSessions(); }, [reloadSessions]);

  async function signOutSession(id: string) {
    try {
      const res = await apiFetch(`/v1/security/sessions/${id}`, { method: 'DELETE' });
      if (res.was_current) { logout(); return; }
      await reloadSessions();
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  async function signOutOthers() {
    if (!(await showConfirm('Sign out of every other session? Those devices will need to log in again.', { variant: 'warning', confirmLabel: 'Sign Out Others' }))) return;
    try {
      await apiFetch('/v1/security/sessions/revoke-others', { method: 'POST' });
      await reloadSessions();
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  // ── Passkeys ──────────────────────────────────────────────────
  const [passkeys, setPasskeys] = useState<{ id: string; label: string; last_used_at: string | null; created_at: string }[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const reloadPasskeys = useCallback(async () => {
    try { setPasskeys(await apiFetch('/v1/security/passkeys')); } catch { setPasskeys([]); }
  }, []);

  useEffect(() => { reloadPasskeys(); }, [reloadPasskeys]);

  async function addPasskey() {
    setPasskeyBusy(true);
    try {
      const options = await apiFetch('/v1/security/passkeys/register/options', { method: 'POST' });
      const response = await startRegistration({ optionsJSON: options });
      const label = window.prompt('Name this passkey (e.g. "Windows Hello", "iPhone")', 'Passkey') || 'Passkey';
      await apiFetch('/v1/security/passkeys/register/verify', { method: 'POST', body: JSON.stringify({ response, label }) });
      await reloadPasskeys();
      showAlert('Passkey added.', { variant: 'success', title: 'Success' });
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') showAlert(err.message || 'Could not add that passkey.');
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (!(await showConfirm('Remove this passkey? You will no longer be able to sign in with it.', { variant: 'warning', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/security/passkeys/${id}`, { method: 'DELETE' });
      await reloadPasskeys();
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  // ── KYC identity verification (Ondi M4) ─────────────────────────
  const [kycStatus, setKycStatus] = useState<{ kyc_status: string; verification_level: string; latest_submission: any } | null>(null);
  const [kycDocType, setKycDocType] = useState<'national_id' | 'passport' | 'drivers_license'>('national_id');
  const [kycBusy, setKycBusy] = useState(false);

  const reloadKyc = useCallback(async () => {
    try { setKycStatus(await apiFetch('/v1/oneid/kyc/status')); } catch { setKycStatus(null); }
  }, []);
  useEffect(() => { reloadKyc(); }, [reloadKyc]);

  async function submitKycDocument(file: File) {
    setKycBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const [meta, base64] = dataUrl.split(',');
      const media_type = /data:(.*);base64/.exec(meta)?.[1] || file.type || 'image/jpeg';
      const res = await apiFetch('/v1/oneid/kyc/submit', {
        method: 'POST',
        body: JSON.stringify({ document_type: kycDocType, image_base64: base64, media_type }),
      });
      showAlert(`Submitted. We read "${res.extracted.full_name || 'this document'}" — a workspace admin will review it.`, { variant: 'success', title: 'Submitted for review' });
      await reloadKyc();
    } catch (err: any) {
      showAlert(err.message || 'Could not read that document. Try a clearer photo.');
    } finally {
      setKycBusy(false);
    }
  }

  // ── Trust score (Ondi M3) ─────────────────────────────────────
  const [trustScore, setTrustScore] = useState<{ score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' } | null>(null);
  useEffect(() => {
    apiFetch('/v1/security/trust-score').then(setTrustScore).catch(() => setTrustScore(null));
  }, []);
  const TRUST_TIER_COLOR: Record<string, string> = { LOW: '#dc2626', MEDIUM: '#d97706', HIGH: '#059669' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Change password */}
        <Card>
          <CardHead title="Change Password" sub="Use a strong password that you don't use elsewhere." />
          <div style={{ padding: '0 20px 20px' }}>
            <FormRow label="Current Password">
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••••••" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }} />
            </FormRow>
            <FormRow label="New Password">
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••••••" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }} />
            </FormRow>
            <FormRow label="Confirm New Password">
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••••••" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%' }} />
            </FormRow>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <Btn label={pwSaving ? 'Updating…' : 'Update Password'} icon="save" variant="primary" onClick={updatePassword} disabled={pwSaving || !currentPw || newPw.length < 8} />
            </div>
          </div>
        </Card>

        {/* 2FA */}
        <Card>
          <CardHead title="Two-Factor Authentication" sub="Add an extra layer of protection to your account." right={
            twoFA?.enabled ? <span style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--green-l)', color: '#059669', fontSize: 11, fontWeight: 700 }}>Enabled</span> : undefined
          } />
          <div style={{ padding: '16px 20px' }}>
            {twoFA === null && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}

            {twoFA && !twoFA.enabled && !setupData && (
              <>
                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 12 }}>
                  Enable 2FA to require a verification code from your authenticator app when signing in.
                </div>
                <Btn label="Enable 2FA" icon="shield" variant="primary" onClick={startSetup} disabled={twoFABusy} />
              </>
            )}

            {setupData && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flexShrink: 0 }}>
                  <QRCodeSVG value={setupData.uri} size={120} level="M" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Scan with your authenticator app, or enter this code manually:</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.05em', background: 'var(--bg)', padding: '8px 14px', borderRadius: 6, marginBottom: 12, wordBreak: 'break-all' }}>{setupData.secret}</div>
                  <input value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="Enter 6-digit code to verify" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: '100%', marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn label="Verify & Enable" variant="primary" onClick={verifyAndEnable} disabled={twoFABusy || verifyCode.length < 6} />
                    <Btn label="Cancel" onClick={() => { setSetupData(null); setVerifyCode(''); }} />
                  </div>
                </div>
              </div>
            )}

            {backupCodes && (
              <div style={{ marginTop: 16, padding: 14, background: 'var(--bg)', borderRadius: 9, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Save these backup codes — shown only once</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {backupCodes.map(c => <div key={c}>{c}</div>)}
                </div>
              </div>
            )}

            {twoFA?.enabled && !setupData && (
              <>
                <div style={{ fontSize: 13, color: '#059669', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={14} strokeWidth={2} />
                  Two-factor authentication is enabled{twoFA.enabled_at ? ` since ${fmtDate(twoFA.enabled_at)}` : ''}.
                </div>
                {!showDisable ? (
                  <Btn label="Disable 2FA" variant="danger" onClick={() => setShowDisable(true)} />
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={disableCode} onChange={e => setDisableCode(e.target.value)} placeholder="6-digit code" className="input-field" style={{ fontSize: 13, padding: '8px 12px', width: 160 }} />
                    <Btn label="Confirm Disable" variant="danger" onClick={disable2FA} disabled={twoFABusy || disableCode.length < 6} />
                    <Btn label="Cancel" onClick={() => { setShowDisable(false); setDisableCode(''); }} />
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Identity verification (KYC) */}
        <Card>
          <CardHead title="Identity Verification" sub="Verify a government ID to raise your trust level." right={
            kycStatus?.kyc_status === 'approved' ? <span style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--green-l)', color: '#059669', fontSize: 11, fontWeight: 700 }}>Verified</span> :
            kycStatus?.kyc_status === 'pending' ? <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fffbeb', color: '#d97706', fontSize: 11, fontWeight: 700 }}>Under review</span> : undefined
          } />
          <div style={{ padding: '4px 20px 20px' }}>
            {kycStatus === null && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}

            {kycStatus?.kyc_status === 'approved' && kycStatus.latest_submission && (
              <div style={{ fontSize: 13, color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="checkCircle" size={14} strokeWidth={2} />
                Verified as {kycStatus.latest_submission.extracted_full_name || 'you'} — {kycStatus.latest_submission.document_type === 'passport' ? 'Passport' : kycStatus.latest_submission.document_type === 'drivers_license' ? "Driver's License" : 'National ID'}.
              </div>
            )}

            {kycStatus?.kyc_status === 'pending' && (
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>
                Your document is with a workspace admin for review. This usually takes a day or two.
              </div>
            )}

            {(kycStatus?.kyc_status === 'not_started' || kycStatus?.kyc_status === 'rejected') && (
              <>
                {kycStatus.kyc_status === 'rejected' && kycStatus.latest_submission?.rejection_reason && (
                  <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                    Previous submission was rejected: {kycStatus.latest_submission.rejection_reason}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={kycDocType} onChange={e => setKycDocType(e.target.value as any)} className="input-field" style={{ fontSize: 13, padding: '8px 12px' }} disabled={kycBusy}>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="drivers_license">Driver's License</option>
                  </select>
                  <label style={{
                    padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none',
                    background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
                    fontFamily: 'var(--font)', fontWeight: 600, cursor: kycBusy ? 'default' : 'pointer',
                    fontSize: 13, opacity: kycBusy ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box',
                    lineHeight: 1.25, display: 'inline-flex', alignItems: 'center',
                  }}>
                    {kycBusy ? 'Reading document…' : 'Upload a photo'}
                    <input type="file" accept="image/*" capture="environment" disabled={kycBusy} style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) submitKycDocument(f); e.target.value = ''; }} />
                  </label>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Active sessions */}
        <Card>
          <CardHead title="Active Sessions" sub="All devices currently signed in." right={<Btn label="Sign Out Other Sessions" variant="danger" onClick={signOutOthers} />} />
          <div>
            {sessions === null && <div style={{ padding: '16px 20px', fontSize: 12.5, color: 'var(--ink3)' }}>Loading sessions…</div>}
            {sessions?.length === 0 && <div style={{ padding: '16px 20px', fontSize: 12.5, color: 'var(--ink3)' }}>No sessions found.</div>}
            {sessions?.filter(s => s.active).map((s, i, arr) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={s.device_type === 'mobile' ? 'smartphone' : 'monitor'} size={18} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {s.device_label || s.user_agent || 'Unknown device'}
                    {s.is_current && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 9, background: 'var(--green-l)', color: '#059669', fontSize: 10, fontWeight: 700 }}>This device</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Last active {relTime(s.last_used_at)}</div>
                </div>
                <Btn label="Sign Out" variant="danger" onClick={() => signOutSession(s.id)} />
              </div>
            ))}
          </div>
        </Card>

        {/* Passkeys */}
        <Card>
          <CardHead title="Passkeys" sub="Sign in with your device's fingerprint, face, or PIN — no password to type." right={
            <Btn label={passkeyBusy ? 'Adding…' : 'Add a Passkey'} icon="plus" variant="primary" onClick={addPasskey} disabled={passkeyBusy} />
          } />
          <div>
            {passkeys === null && <div style={{ padding: '16px 20px', fontSize: 12.5, color: 'var(--ink3)' }}>Loading passkeys…</div>}
            {passkeys?.length === 0 && <div style={{ padding: '16px 20px', fontSize: 12.5, color: 'var(--ink3)' }}>No passkeys yet. Add one to sign in without a password.</div>}
            {passkeys?.map((p, i, arr) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="key" size={18} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                    {p.last_used_at ? `Last used ${relTime(p.last_used_at)}` : `Added ${fmtDate(p.created_at)}`}
                  </div>
                </div>
                <Btn label="Remove" variant="danger" onClick={() => removePasskey(p.id)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right: tips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {trustScore && (
          <Card>
            <CardHead title="Trust Score" sub="How Hudumika assesses this account's identity signal." />
            <div style={{ padding: '4px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)' }}>{trustScore.score}</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>/ 850</span>
                <span style={{
                  marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${TRUST_TIER_COLOR[trustScore.tier]}1a`, color: TRUST_TIER_COLOR[trustScore.tier],
                }}>{trustScore.tier}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: TRUST_TIER_COLOR[trustScore.tier],
                  width: `${Math.max(0, Math.min(100, ((trustScore.score - 300) / (850 - 300)) * 100))}%`,
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
                Based on identity verification, account age, and sign-in history.
              </div>
            </div>
          </Card>
        )}
        <Card>
          <CardHead title="Security Tips" />
          <div style={{ padding: '12px 20px 16px' }}>
            {['Use a unique, strong password (12+ chars)', 'Enable two-factor authentication', 'Review active sessions regularly', 'Never share your login credentials'].map(tip => (
              <div key={tip} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink2)', padding: '7px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.4 }}>
                <Icon name="check" size={13} strokeWidth={2.5} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 1 } as React.CSSProperties} />
                {tip}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AccountSecurityPanel;
