// ─── OndiSecuritySettings.tsx — Ondi Personal · Security Hub ───
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './OndiSecuritySettings.css';

interface RecoveryContact {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  contact_name?: string;
  contact_email?: string;
  owner_name?: string;
  owner_email?: string;
}

interface RecoveryRequest {
  id: string;
  status: string;
  requested_at: string;
  cooldown_ends_at: string | null;
  requester_name: string;
  requester_email: string;
}

interface PasskeyItem {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${Math.max(sec, 0)} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? 's' : ''} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const OndiSecuritySettings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [activeSection, setActiveSection] = useState<'all' | 'password' | 'mfa' | 'passkeys' | 'phone' | 'kyc' | 'recovery' | 'sessions'>('all');

  // ── Password Management ──
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState<{ expired: boolean; days_remaining: number | null } | null>(null);

  const loadPwStatus = useCallback(() => {
    apiFetch('/v1/security/password-status').then(setPwStatus).catch(() => setPwStatus(null));
  }, []);
  useEffect(() => { loadPwStatus(); }, [loadPwStatus]);

  async function updatePassword() {
    if (newPw.length < 8) { showAlert('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { showAlert('New password and confirmation do not match.'); return; }
    setPwSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      showAlert('Password updated successfully.', { variant: 'success', title: 'Success' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      loadPwStatus();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  // ── Email Management ──
  const [currentPwForEmail, setCurrentPwForEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  async function updateEmail() {
    const trimmed = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) { showAlert('Enter a valid email address.'); return; }
    if (!currentPwForEmail) { showAlert('Enter your current password to confirm this change.'); return; }
    setEmailSaving(true);
    try {
      const res = await apiFetch('/auth/change-email', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPwForEmail, new_email: trimmed }),
      });
      if (res?.user) updateUser(res.user);
      showAlert('Primary email address updated.', { variant: 'success', title: 'Success' });
      setCurrentPwForEmail(''); setNewEmail('');
    } catch (err: any) {
      showAlert(err.message || 'Failed to update email.');
    } finally {
      setEmailSaving(false);
    }
  }

  // ── Two-Factor Authentication (2FA) ──
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; enabled_at: string | null } | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [twoFABusy, setTwoFABusy] = useState(false);

  const load2faStatus = useCallback(() => {
    apiFetch('/v1/security/2fa/status').then(setTwoFA).catch(() => setTwoFA({ enabled: false, enabled_at: null }));
  }, []);
  useEffect(() => { load2faStatus(); }, [load2faStatus]);

  async function start2faSetup() {
    setTwoFABusy(true);
    try {
      setSetupData(await apiFetch('/v1/security/2fa/setup', { method: 'POST' }));
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setTwoFABusy(false);
    }
  }

  async function verifyAndEnable2fa() {
    setTwoFABusy(true);
    try {
      const res = await apiFetch('/v1/security/2fa/verify', { method: 'POST', body: JSON.stringify({ token: verifyCode }) });
      setBackupCodes(res.backup_codes);
      setTwoFA({ enabled: true, enabled_at: new Date().toISOString() });
      setSetupData(null);
      setVerifyCode('');
      showAlert('Two-factor authentication enabled successfully.', { variant: 'success', title: '2FA Enabled' });
    } catch (err: any) {
      showAlert(err.message || 'Invalid verification code.');
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
      showAlert('Two-factor authentication has been disabled.', { variant: 'warning', title: '2FA Disabled' });
    } catch (err: any) {
      showAlert(err.message || 'Invalid confirmation code.');
    } finally {
      setTwoFABusy(false);
    }
  }

  // ── Hardware Passkeys ──
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null);
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
      const label = window.prompt('Name this passkey (e.g. "Windows Hello", "iPhone")', 'Hardware Key') || 'Hardware Key';
      await apiFetch('/v1/security/passkeys/register/verify', { method: 'POST', body: JSON.stringify({ response, label }) });
      await reloadPasskeys();
      showAlert('Passkey registered successfully.', { variant: 'success', title: 'Passkey Added' });
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') showAlert(err.message || 'Could not register passkey.');
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (!(await showConfirm('Remove this passkey? You will no longer be able to sign in with this hardware key.', { variant: 'warning', confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/security/passkeys/${id}`, { method: 'DELETE' });
      await reloadPasskeys();
      showAlert('Passkey removed.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  // ── Phone Number Verification (SMS one-time code) ──
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneVerifyCode, setPhoneVerifyCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  async function sendPhoneCode() {
    if (!/^\+?[0-9]{7,15}$/.test(phoneNumber.trim())) {
      showAlert('Enter a valid phone number, including country code.');
      return;
    }
    setPhoneBusy(true);
    try {
      await apiFetch('/v1/security/phone/send-code', { method: 'POST', body: JSON.stringify({ phone: phoneNumber.trim() }) });
      setPhoneCodeSent(true);
      showAlert('A verification code was sent by SMS.', { variant: 'success', title: 'Code Sent' });
    } catch (err: any) {
      showAlert(err.message || 'Could not send the verification code.');
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyPhoneOtp() {
    setPhoneBusy(true);
    try {
      await apiFetch('/v1/security/phone/verify-code', { method: 'POST', body: JSON.stringify({ code: phoneVerifyCode }) });
      setPhoneCodeSent(false);
      setPhoneVerifyCode('');
      await reloadKyc();
      showAlert('Phone number verified.', { variant: 'success', title: 'Phone Verified' });
    } catch (err: any) {
      showAlert(err.message || 'Incorrect code.');
    } finally {
      setPhoneBusy(false);
    }
  }

  // ── Government Identity Verification (KYC) ──
  const [kycStatus, setKycStatus] = useState<{ kyc_status: string; verification_level: string; latest_submission: any } | null>(null);
  const [kycDocType, setKycDocType] = useState<'national_id' | 'passport' | 'drivers_license'>('national_id');
  const [kycBusy, setKycBusy] = useState(false);

  const reloadKyc = useCallback(async () => {
    try { setKycStatus(await apiFetch('/v1/ondi/kyc/status')); } catch { setKycStatus(null); }
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
      const res = await apiFetch('/v1/ondi/kyc/submit', {
        method: 'POST',
        body: JSON.stringify({ document_type: kycDocType, image_base64: base64, media_type }),
      });
      showAlert(`Document submitted. Verified "${res.extracted?.full_name || 'Identity Record'}".`, { variant: 'success', title: 'Submitted for Review' });
      await reloadKyc();
    } catch (err: any) {
      showAlert(err.message || 'Could not process document photo. Please ensure high clarity.');
    } finally {
      setKycBusy(false);
    }
  }

  // ── Recovery Contacts & Requests ──
  const [myContacts, setMyContacts] = useState<RecoveryContact[] | null>(null);
  const [vouchingFor, setVouchingFor] = useState<RecoveryContact[] | null>(null);
  const [requests, setRequests] = useState<RecoveryRequest[] | null>(null);
  const [picked, setPicked] = useState<PickerItem | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const staffCache = useRef<PickerItem[] | null>(null);

  const searchStaff = useCallback(async (query: string): Promise<PickerItem[]> => {
    if (!staffCache.current) {
      const users = await apiFetch('/v1/ondi/users').catch(() => []);
      staffCache.current = users.map((u: any) => ({ id: u.id, label: u.name, sublabel: u.email }));
    }
    const q = query.trim().toLowerCase();
    const all = staffCache.current ?? [];
    return q ? all.filter(u => u.label.toLowerCase().includes(q) || u.sublabel?.toLowerCase().includes(q)) : all;
  }, []);

  const reloadRecovery = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/security/recovery-contacts');
      setMyContacts(res.myContacts); setVouchingFor(res.vouchingFor);
    } catch { setMyContacts([]); setVouchingFor([]); }
    try { setRequests(await apiFetch('/v1/security/recovery-requests')); } catch { setRequests([]); }
  }, []);
  useEffect(() => { reloadRecovery(); }, [reloadRecovery]);

  async function addRecoveryContact() {
    if (!picked) { showAlert('Pick a colleague first.'); return; }
    setAddingContact(true);
    try {
      await apiFetch('/v1/security/recovery-contacts', { method: 'POST', body: JSON.stringify({ contact_user_id: picked.id }) });
      setPicked(null);
      await reloadRecovery();
      showAlert('Recovery contact request sent.', { variant: 'success' });
    } catch (err: any) { showAlert(err.message); } finally { setAddingContact(false); }
  }

  async function removeRecoveryContact(id: string) {
    if (!(await showConfirm('Remove this recovery contact?', { confirmLabel: 'Remove' }))) return;
    try { await apiFetch(`/v1/security/recovery-contacts/${id}`, { method: 'DELETE' }); await reloadRecovery(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function respondRecovery(id: string, accept: boolean) {
    try { await apiFetch(`/v1/security/recovery-contacts/${id}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }); await reloadRecovery(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function approveRecoveryRequest(id: string) {
    if (!(await showConfirm("Vouch for this person? They'll regain access after a 24-hour cooldown — if this wasn't really them, they can cancel it just by logging in normally.", { confirmLabel: 'Approve' }))) return;
    try { await apiFetch(`/v1/security/recovery-requests/${id}/approve`, { method: 'POST' }); await reloadRecovery(); }
    catch (err: any) { showAlert(err.message); }
  }

  async function declineRecoveryRequest(id: string) {
    try { await apiFetch(`/v1/security/recovery-requests/${id}/decline`, { method: 'POST' }); await reloadRecovery(); }
    catch (err: any) { showAlert(err.message); }
  }

  // ── Active Sessions ──
  const [sessions, setSessions] = useState<any[] | null>(null);
  const reloadSessions = useCallback(async () => {
    try { setSessions(await apiFetch('/v1/security/sessions')); } catch { setSessions([]); }
  }, []);
  useEffect(() => { reloadSessions(); }, [reloadSessions]);

  async function signOutOthers() {
    if (!(await showConfirm('Sign out of every other session? Those devices will need to sign in again.', { variant: 'warning', confirmLabel: 'Sign Out Others' }))) return;
    try {
      await apiFetch('/v1/security/sessions/revoke-others', { method: 'POST' });
      await reloadSessions();
      showAlert('All other active hardware sessions terminated.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  // ── Identity Trust Score ──
  const [trust, setTrust] = useState<{ score: number; tier: 'LOW' | 'MEDIUM' | 'HIGH' } | null>(null);
  useEffect(() => {
    apiFetch('/v1/security/trust-score').then(setTrust).catch(() => setTrust(null));
  }, []);

  const pendingRequests = requests?.filter(r => r.status === 'pending') ?? [];
  const otherRequests = requests?.filter(r => r.status !== 'pending') ?? [];

  return (
    <div className="oss-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Security"
        titleEm="hub"
        subtitle="Password safeguards, two-factor authentication, biometric passkeys, government verification, and emergency recovery."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/ondi/personal">
              <Button variant="outline" size="sm">
                <Icon name="fingerprint" size={13} style={{ marginRight: 5 }} />
                My Identity
              </Button>
            </Link>
            <Link to="/ondi/personal/trust">
              <Button variant="outline" size="sm">
                <Icon name="trendingUp" size={13} style={{ marginRight: 5 }} />
                Trust Score
              </Button>
            </Link>
            <Link to="/ondi/personal/activity">
              <Button variant="outline" size="sm">
                <Icon name="activity" size={13} style={{ marginRight: 5 }} />
                Activity Trail
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Top Executive Posture KPI Grid (Compact 2x2 on Mobile) ── */}
      <div className="oss-kpi-grid">
        <div className="oss-kpi-card">
          <div className="oss-kpi-header">
            <span className="oss-kpi-title">2FA Protection</span>
            <div className={`oss-kpi-icon ${twoFA?.enabled ? 'success' : 'warning'}`}>
              <Icon name="shield" size={17} />
            </div>
          </div>
          <div className="oss-kpi-body">
            <div className="oss-kpi-val" style={{ color: twoFA?.enabled ? 'var(--green, #10b981)' : 'var(--gold, #f59e0b)' }}>
              {twoFA?.enabled ? 'ACTIVE' : 'OFF'}
            </div>
            <div className="oss-kpi-sub">
              <span>{twoFA?.enabled ? 'TOTP Authenticator active' : 'Enable 2FA for protection'}</span>
            </div>
          </div>
        </div>

        <div className="oss-kpi-card">
          <div className="oss-kpi-header">
            <span className="oss-kpi-title">Hardware Passkeys</span>
            <div className="oss-kpi-icon purple">
              <Icon name="key" size={17} />
            </div>
          </div>
          <div className="oss-kpi-body">
            <div className="oss-kpi-val">
              {passkeys ? passkeys.length : '—'}
            </div>
            <div className="oss-kpi-sub">
              <span>FIDO2 biometric keys</span>
            </div>
          </div>
        </div>

        <div className="oss-kpi-card">
          <div className="oss-kpi-header">
            <span className="oss-kpi-title">ID Verification</span>
            <div className={`oss-kpi-icon ${kycStatus?.kyc_status === 'approved' ? 'success' : 'primary'}`}>
              <Icon name="fileText" size={17} />
            </div>
          </div>
          <div className="oss-kpi-body">
            <div className="oss-kpi-val">
              {kycStatus?.kyc_status === 'approved' ? 'VERIFIED' : kycStatus?.kyc_status === 'pending' ? 'REVIEW' : 'BASIC'}
            </div>
            <div className="oss-kpi-sub">
              <span>{kycStatus?.kyc_status === 'approved' ? 'Government ID confirmed' : 'Elevates trust tier'}</span>
            </div>
          </div>
        </div>

        <div className="oss-kpi-card">
          <div className="oss-kpi-header">
            <span className="oss-kpi-title">Active Devices</span>
            <div className="oss-kpi-icon primary">
              <Icon name="smartphone" size={17} />
            </div>
          </div>
          <div className="oss-kpi-body">
            <div className="oss-kpi-val">
              {sessions ? sessions.filter(s => s.active).length : 1}
            </div>
            <div className="oss-kpi-sub">
              <span>Authorized hardware sessions</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section Filter / Quick Jump Pills ── */}
      <div className="oss-nav-strip">
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >
          <Icon name="sliders" size={13} />
          <span>All Safeguards</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'password' ? 'active' : ''}`}
          onClick={() => setActiveSection('password')}
        >
          <Icon name="lock" size={13} />
          <span>Password & Email</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'mfa' ? 'active' : ''}`}
          onClick={() => setActiveSection('mfa')}
        >
          <Icon name="shield" size={13} />
          <span>Two-Factor Auth</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'passkeys' ? 'active' : ''}`}
          onClick={() => setActiveSection('passkeys')}
        >
          <Icon name="key" size={13} />
          <span>Passkeys ({passkeys?.length ?? 0})</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'phone' ? 'active' : ''}`}
          onClick={() => setActiveSection('phone')}
        >
          <Icon name="phone" size={13} />
          <span>Phone Number</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'kyc' ? 'active' : ''}`}
          onClick={() => setActiveSection('kyc')}
        >
          <Icon name="fingerprint" size={13} />
          <span>Identity KYC</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'recovery' ? 'active' : ''}`}
          onClick={() => setActiveSection('recovery')}
        >
          <Icon name="users" size={13} />
          <span>Recovery Contacts</span>
        </button>
        <button
          type="button"
          className={`oss-nav-pill ${activeSection === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveSection('sessions')}
        >
          <Icon name="smartphone" size={13} />
          <span>Sessions</span>
        </button>
      </div>

      {/* ── Main Layout: Content & Sidebar ── */}
      <div className="oss-layout-grid">
        <div className="oss-main-col">

          {/* 1. Password Rotation Notification Banner */}
          {pwStatus && (pwStatus.expired || (pwStatus.days_remaining !== null && pwStatus.days_remaining <= 14)) && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px',
                background: pwStatus.expired ? 'var(--red-l)' : 'var(--gold-l)',
                border: `1px solid ${pwStatus.expired ? 'var(--red)' : 'var(--gold)'}`,
                borderRadius: 'var(--r, 10px)',
              }}
            >
              <Icon name="alertTriangle" size={18} color={pwStatus.expired ? 'var(--red)' : 'var(--gold)'} />
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
                {pwStatus.expired
                  ? "Your account password is past this workspace's rotation policy — please update it below."
                  : `Your password will be due for rotation in ${pwStatus.days_remaining} day${pwStatus.days_remaining === 1 ? '' : 's'}.`}
              </div>
            </div>
          )}

          {/* 2. Password Management Card */}
          {(activeSection === 'all' || activeSection === 'password') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="lock" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Change Account Password</h3>
                    <p className="oss-card-sub">Use a strong, unique passphrase with at least 8 characters</p>
                  </div>
                </div>
                {pwStatus && pwStatus.days_remaining !== null && (
                  <Badge variant={pwStatus.expired ? 'error' : 'gray'}>
                    {pwStatus.expired ? 'Rotation Expired' : `${pwStatus.days_remaining}d remaining`}
                  </Badge>
                )}
              </div>

              <div className="oss-card-body">
                <div className="oss-form-row">
                  <label className="oss-form-label">Current Password</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="oss-input"
                  />
                </div>

                <div className="oss-form-row">
                  <label className="oss-form-label">New Password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="At least 8 characters"
                    className="oss-input"
                  />
                </div>

                <div className="oss-form-row">
                  <label className="oss-form-label">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    className="oss-input"
                  />
                </div>

                <div className="oss-btn-row">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={updatePassword}
                    disabled={pwSaving || !currentPw || newPw.length < 8}
                  >
                    <Icon name="save" size={13} style={{ marginRight: 5 }} />
                    {pwSaving ? 'Updating Password…' : 'Update Password'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Primary Email Card */}
          {(activeSection === 'all' || activeSection === 'password') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="info" size="sm" shape="square">
                    <Icon name="mail" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Primary Sign-in Email</h3>
                    <p className="oss-card-sub">Used for account login and transactional security alerts</p>
                  </div>
                </div>
                <Badge variant="success">Verified</Badge>
              </div>

              <div className="oss-card-body">
                <div className="oss-form-row">
                  <label className="oss-form-label">Current Email</label>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {user?.email || '—'}
                  </div>
                </div>

                <div className="oss-form-row">
                  <label className="oss-form-label">New Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="oss-input"
                  />
                </div>

                <div className="oss-form-row">
                  <label className="oss-form-label">Current Password</label>
                  <input
                    type="password"
                    value={currentPwForEmail}
                    onChange={(e) => setCurrentPwForEmail(e.target.value)}
                    placeholder="Verify password to change email"
                    className="oss-input"
                  />
                </div>

                <div className="oss-btn-row">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={updateEmail}
                    disabled={emailSaving || !newEmail.trim() || !currentPwForEmail}
                  >
                    <Icon name="save" size={13} style={{ marginRight: 5 }} />
                    {emailSaving ? 'Updating Email…' : 'Update Email Address'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Two-Factor Authentication (2FA) */}
          {(activeSection === 'all' || activeSection === 'mfa') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant={twoFA?.enabled ? 'success' : 'brand'} size="sm" shape="square">
                    <Icon name="shield" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Two-Factor Authentication (2FA)</h3>
                    <p className="oss-card-sub">Hardware TOTP authenticator code required at every login</p>
                  </div>
                </div>
                <Badge variant={twoFA?.enabled ? 'success' : 'gray'}>
                  {twoFA?.enabled ? '2FA Active' : 'Not Enrolled'}
                </Badge>
              </div>

              <div className="oss-card-body">
                {twoFA === null && (
                  <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading 2FA telemetry…</div>
                )}

                {/* Not enabled & not setting up */}
                {twoFA && !twoFA.enabled && !setupData && (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, margin: '0 0 14px' }}>
                      Enrolling a TOTP authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) elevates your account security posture and prevents unauthorized access even if credentials are leaked.
                    </p>
                    <Button variant="default" size="sm" onClick={start2faSetup} disabled={twoFABusy}>
                      <Icon name="shield" size={13} style={{ marginRight: 5 }} />
                      Configure 2FA Authenticator
                    </Button>
                  </div>
                )}

                {/* QR Setup Step */}
                {setupData && (
                  <div className="oss-2fa-setup-wrap">
                    <div className="oss-qr-box">
                      <QRCodeSVG value={setupData.uri} size={130} level="M" />
                    </div>
                    <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        1. Scan QR Code or copy secret key
                      </span>
                      <div className="oss-secret-pill">
                        <span>{setupData.secret}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(setupData.secret);
                            showAlert('Secret key copied.', { variant: 'success' });
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 0 }}
                        >
                          <Icon name="copy" size={13} />
                        </button>
                      </div>

                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>
                        2. Enter 6-digit authenticator code
                      </span>
                      <input
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="oss-input"
                        style={{ fontFamily: 'var(--mono)', fontSize: 16, letterSpacing: '0.2em', textAlign: 'center', width: 180 }}
                      />

                      <div className="oss-btn-row">
                        <Button variant="default" size="sm" onClick={verifyAndEnable2fa} disabled={twoFABusy || verifyCode.length < 6}>
                          Verify & Activate 2FA
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSetupData(null); setVerifyCode(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Backup Codes Display */}
                {backupCodes && (
                  <div style={{ padding: '14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                        One-Time Backup Security Codes (Save securely)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(backupCodes.join('\n'));
                          showAlert('Backup codes copied.', { variant: 'success' });
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Icon name="copy" size={12} />
                        <span>Copy All</span>
                      </button>
                    </div>
                    <div className="oss-backup-codes-grid">
                      {backupCodes.map((code) => (
                        <div key={code}>{code}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enabled Status */}
                {twoFA?.enabled && !setupData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green, #10b981)', fontSize: 13, fontWeight: 600 }}>
                      <Icon name="checkCircle" size={16} />
                      <span>Two-factor authentication is active{twoFA.enabled_at ? ` since ${new Date(twoFA.enabled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}.</span>
                    </div>

                    {!showDisable ? (
                      <div>
                        <Button variant="outline" size="sm" onClick={() => setShowDisable(true)} style={{ color: 'var(--red)' }}>
                          Disable 2FA Protection
                        </Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <input
                          type="text"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Enter 6-digit code"
                          className="oss-input"
                          style={{ width: 160, fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}
                        />
                        <Button variant="outline" size="sm" onClick={disable2FA} disabled={twoFABusy || disableCode.length < 6} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                          Confirm Disable
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowDisable(false); setDisableCode(''); }}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Biometric Hardware & Passkeys */}
          {(activeSection === 'all' || activeSection === 'passkeys') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="key" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Biometric Passkeys (FIDO2 / WebAuthn)</h3>
                    <p className="oss-card-sub">Fast passwordless sign-in with Touch ID, Windows Hello, or hardware security keys</p>
                  </div>
                </div>
                <Button variant="default" size="sm" onClick={addPasskey} disabled={passkeyBusy}>
                  <Icon name="plus" size={13} style={{ marginRight: 4 }} />
                  {passkeyBusy ? 'Registering…' : 'Add Passkey'}
                </Button>
              </div>

              <div className="oss-card-body">
                {passkeys === null && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading registered passkeys…</div>}
                {passkeys?.length === 0 && (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No hardware passkeys registered. Add a biometric key for instant passwordless authorization.
                  </div>
                )}
                {passkeys && passkeys.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {passkeys.map((p) => (
                      <div key={p.id} className="oss-passkey-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--white, #ffffff)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                            <Icon name="key" size={16} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.label}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                              {p.last_used_at ? `Last authenticated ${relTime(p.last_used_at)}` : `Registered ${new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => removePasskey(p.id)} style={{ color: 'var(--red)', fontSize: 12, height: 28, padding: '0 10px' }}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5b. Phone Number Verification (SMS one-time code) */}
          {(activeSection === 'all' || activeSection === 'phone') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant={kycStatus && kycStatus.verification_level !== 'unverified' ? 'success' : 'brand'} size="sm" shape="square">
                    <Icon name="phone" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Phone Number Verification</h3>
                    <p className="oss-card-sub">Confirm ownership of your phone number by SMS one-time code</p>
                  </div>
                </div>
                <Badge variant={kycStatus && kycStatus.verification_level !== 'unverified' ? 'success' : 'gray'}>
                  {kycStatus && kycStatus.verification_level !== 'unverified' ? 'Verified' : 'Not Verified'}
                </Badge>
              </div>

              <div className="oss-card-body">
                {kycStatus === null && (
                  <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading phone verification status…</div>
                )}

                {kycStatus && kycStatus.verification_level !== 'unverified' && !phoneCodeSent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green, #10b981)', fontSize: 13, fontWeight: 600 }}>
                      <Icon name="checkCircle" size={16} />
                      <span>{user?.phone ? `${user.phone} is verified.` : 'Your phone number is verified.'}</span>
                    </div>
                    <div>
                      <Button variant="outline" size="sm" onClick={() => { setPhoneNumber(''); setPhoneCodeSent(false); }}>
                        Verify a Different Number
                      </Button>
                    </div>
                  </div>
                )}

                {kycStatus && kycStatus.verification_level === 'unverified' && !phoneCodeSent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
                      A verified phone number is used for SMS sign-in codes and account recovery.
                    </p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+255 700 000 000"
                        className="oss-input"
                        style={{ width: 220 }}
                      />
                      <Button variant="default" size="sm" onClick={sendPhoneCode} disabled={phoneBusy || !phoneNumber.trim()}>
                        {phoneBusy ? 'Sending…' : 'Send Verification Code'}
                      </Button>
                    </div>
                  </div>
                )}

                {phoneCodeSent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      Enter the 6-digit code sent to {phoneNumber}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={phoneVerifyCode}
                        onChange={(e) => setPhoneVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="oss-input"
                        style={{ fontFamily: 'var(--mono)', fontSize: 16, letterSpacing: '0.2em', textAlign: 'center', width: 160 }}
                      />
                      <Button variant="default" size="sm" onClick={verifyPhoneOtp} disabled={phoneBusy || phoneVerifyCode.length < 6}>
                        Verify Code
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setPhoneCodeSent(false); setPhoneVerifyCode(''); }}>
                        Cancel
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={sendPhoneCode}
                      disabled={phoneBusy}
                      style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}
                    >
                      Resend code
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. Government Identity KYC Verification */}
          {(activeSection === 'all' || activeSection === 'kyc') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="info" size="sm" shape="square">
                    <Icon name="fileText" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Government Identity Verification (KYC)</h3>
                    <p className="oss-card-sub">Verified identity credential required for elevated enterprise trust</p>
                  </div>
                </div>
                <Badge variant={kycStatus?.kyc_status === 'approved' ? 'success' : kycStatus?.kyc_status === 'pending' ? 'warning' : 'gray'}>
                  {kycStatus?.kyc_status === 'approved' ? 'ID Verified' : kycStatus?.kyc_status === 'pending' ? 'Pending Review' : 'Not Verified'}
                </Badge>
              </div>

              <div className="oss-card-body">
                {kycStatus === null && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading verification status…</div>}

                {kycStatus?.kyc_status === 'approved' && kycStatus.latest_submission && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 8, color: 'var(--green, #10b981)', fontSize: 13, fontWeight: 600 }}>
                    <Icon name="checkCircle" size={17} />
                    <span>
                      Identity verified as {kycStatus.latest_submission.extracted_full_name || 'Account Holder'} via {kycStatus.latest_submission.document_type === 'passport' ? 'Passport' : kycStatus.latest_submission.document_type === 'drivers_license' ? "Driver's License" : 'National Identity Card'}.
                    </span>
                  </div>
                )}

                {kycStatus?.kyc_status === 'pending' && (
                  <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
                    Your submitted identity document is currently undergoing administrative compliance review. Verification typically concludes within 1 business day.
                  </div>
                )}

                {(kycStatus?.kyc_status === 'not_started' || kycStatus?.kyc_status === 'rejected') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {kycStatus?.kyc_status === 'rejected' && kycStatus.latest_submission?.rejection_reason && (
                      <div style={{ padding: '10px 12px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 8, color: 'var(--red)', fontSize: 12.5 }}>
                        Previous document rejected: {kycStatus.latest_submission.rejection_reason}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        value={kycDocType}
                        onChange={(e) => setKycDocType(e.target.value as any)}
                        className="oss-select"
                        disabled={kycBusy}
                      >
                        <option value="national_id">National Identity Card</option>
                        <option value="passport">Government Passport</option>
                        <option value="drivers_license">Driver's License</option>
                      </select>

                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 16px',
                          height: 36,
                          borderRadius: 'var(--r-sm, 8px)',
                          background: 'hsl(var(--primary))',
                          color: 'hsl(var(--primary-foreground))',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: kycBusy ? 'default' : 'pointer',
                          opacity: kycBusy ? 0.6 : 1,
                        }}
                      >
                        <Icon name="upload" size={13} />
                        <span>{kycBusy ? 'Processing Photo…' : 'Upload Document Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={kycBusy}
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) submitKycDocument(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. Mutual-Consent Recovery Contacts */}
          {(activeSection === 'all' || activeSection === 'recovery') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="users" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Mutual-Consent Recovery Contacts</h3>
                    <p className="oss-card-sub">Trusted colleagues who can vouch for your identity if password and email are lost</p>
                  </div>
                </div>
              </div>

              <div className="oss-card-body">
                {/* Pending Vouching Requests */}
                {pendingRequests.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Recovery Requests Waiting for Your Vouch
                    </span>
                    {pendingRequests.map((r) => (
                      <div key={r.id} className="oss-request-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Icon name="alertTriangle" size={16} color="var(--gold)" />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                              {r.requester_name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {r.requester_email}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                              Requested on {fmtDateTime(r.requested_at)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button variant="default" size="sm" onClick={() => approveRecoveryRequest(r.id)}>
                            Approve Vouch
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => declineRecoveryRequest(r.id)}>
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Handled Requests */}
                {otherRequests.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Recent Vouch History
                    </span>
                    {otherRequests.slice(0, 3).map((r) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{r.requester_name}</span>
                        <Badge variant={r.status === 'approved' ? 'success' : r.status === 'completed' ? 'success' : r.status === 'declined' ? 'error' : 'gray'}>
                          {r.status}{r.status === 'approved' && r.cooldown_ends_at ? ` · cooldown until ${fmtDateTime(r.cooldown_ends_at)}` : ''}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active Recovery Contacts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Your Designated Recovery Contacts
                  </span>
                  {myContacts?.length === 0 && (
                    <div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                      No recovery contacts configured yet. Add a trusted team member.
                    </div>
                  )}
                  {myContacts?.map((c) => (
                    <div key={c.id} className="oss-contact-row">
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {c.contact_name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {c.contact_email}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge variant={c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'error' : 'gray'}>
                          {c.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => removeRecoveryContact(c.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <EntityPicker value={picked} onChange={setPicked} search={searchStaff} placeholder="Search a colleague to add…" />
                    </div>
                    <Button variant="default" size="sm" disabled={addingContact} onClick={addRecoveryContact}>
                      {addingContact ? 'Adding…' : 'Add Recovery Contact'}
                    </Button>
                  </div>
                </div>

                {/* Vouching For Others */}
                {vouchingFor && vouchingFor.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Colleagues who named you as recovery contact
                    </span>
                    {vouchingFor.map((v) => (
                      <div key={v.id} className="oss-contact-row">
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          {v.owner_name} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· {v.owner_email}</span>
                        </div>
                        {v.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button variant="default" size="sm" onClick={() => respondRecovery(v.id, true)}>
                              Accept
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => respondRecovery(v.id, false)}>
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <Badge variant={v.status === 'accepted' ? 'success' : 'error'}>{v.status}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 8. Active Sessions Quick Killswitch */}
          {(activeSection === 'all' || activeSection === 'sessions') && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="smartphone" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h3 className="oss-card-title">Authorized Hardware Sessions</h3>
                    <p className="oss-card-sub">Manage authenticated browsers and mobile devices</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={signOutOthers} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                  Sign Out Other Sessions
                </Button>
              </div>

              <div className="oss-card-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                      <Icon name="smartphone" size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                        {sessions ? sessions.filter(s => s.active).length : 1} active device session{sessions && sessions.filter(s => s.active).length === 1 ? '' : 's'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                        View hardware telemetry, IP origins, and individual session revokes
                      </div>
                    </div>
                  </div>

                  <Link to="/ondi/personal/devices" style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Manage recognized devices</span>
                    <Icon name="arrowRight" size={13} />
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Right Column: Trust Index & Best Practice Safeguards ── */}
        <div className="oss-side-col">
          {/* Identity Trust Dial Card */}
          {trust && (
            <div className="oss-card">
              <div className="oss-card-hdr">
                <div className="oss-card-hdr-left">
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="trendingUp" size={15} />
                  </FeaturedIcon>
                  <div>
                    <h4 className="oss-card-title">Identity Trust Score</h4>
                    <p className="oss-card-sub">Dynamic enterprise risk index</p>
                  </div>
                </div>
                <Badge variant={trust.tier === 'HIGH' ? 'success' : trust.tier === 'MEDIUM' ? 'warning' : 'gray'}>
                  {trust.tier}
                </Badge>
              </div>

              <div className="oss-card-body">
                <div className="oss-side-trust-dial">
                  <span className="oss-side-trust-num">{trust.score}</span>
                  <span className="oss-side-trust-max">/ 850</span>
                </div>

                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden', margin: '6px 0 2px' }}>
                  <div
                    style={{
                      height: '100%',
                      background: trust.tier === 'HIGH' ? 'var(--green, #10b981)' : trust.tier === 'MEDIUM' ? 'var(--gold, #f59e0b)' : 'var(--red, #ef4444)',
                      width: `${Math.max(0, Math.min(100, ((trust.score - 300) / (850 - 300)) * 100))}%`,
                    }}
                  />
                </div>

                <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45, margin: 0 }}>
                  Computed across government verification, 2FA status, biometric passkeys, account tenure, and sign-in consistency.
                </p>

                <div style={{ marginTop: 4 }}>
                  <Link to="/ondi/personal/trust" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Inspect factor attribution & history</span>
                    <Icon name="arrowRight" size={12} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Security Best Practices Checklist */}
          <div className="oss-card">
            <div className="oss-card-hdr">
              <div className="oss-card-hdr-left">
                <FeaturedIcon variant="success" size="sm" shape="square">
                  <Icon name="shield" size={15} />
                </FeaturedIcon>
                <div>
                  <h4 className="oss-card-title">Security Checklist</h4>
                  <p className="oss-card-sub">Recommended posture controls</p>
                </div>
              </div>
            </div>

            <div className="oss-card-body">
              <div className="oss-side-tips-list">
                <div className="oss-side-tip-item">
                  <Icon name={newPw || currentPw ? 'check' : 'check'} size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 12.5 }}>Strong Unique Password:</strong>
                    <div style={{ color: 'var(--ink3)', marginTop: 1 }}>Minimum 8-12 characters, never reused across accounts.</div>
                  </div>
                </div>

                <div className="oss-side-tip-item">
                  <Icon name={twoFA?.enabled ? 'checkCircle' : 'alertCircle'} size={14} color={twoFA?.enabled ? 'var(--green)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 12.5 }}>Enable 2FA Protection:</strong>
                    <div style={{ color: 'var(--ink3)', marginTop: 1 }}>
                      {twoFA?.enabled ? 'TOTP hardware protection active.' : 'Protects access during credential leaks.'}
                    </div>
                  </div>
                </div>

                <div className="oss-side-tip-item">
                  <Icon name={passkeys && passkeys.length > 0 ? 'checkCircle' : 'alertCircle'} size={14} color={passkeys && passkeys.length > 0 ? 'var(--green)' : 'var(--ink3)'} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 12.5 }}>Register a Biometric Key:</strong>
                    <div style={{ color: 'var(--ink3)', marginTop: 1 }}>Touch ID or Windows Hello eliminates phishing vectors.</div>
                  </div>
                </div>

                <div className="oss-side-tip-item">
                  <Icon name={myContacts && myContacts.length > 0 ? 'checkCircle' : 'alertCircle'} size={14} color={myContacts && myContacts.length > 0 ? 'var(--green)' : 'var(--ink3)'} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 12.5 }}>Designate Recovery Contacts:</strong>
                    <div style={{ color: 'var(--ink3)', marginTop: 1 }}>Safeguards emergency access if email is lost.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail Quick Link */}
          <div className="oss-card" style={{ background: 'var(--bg)' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="activity" size={15} color="var(--teal)" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Audit Activity Trail</span>
              </div>
              <Link to="/ondi/personal/activity" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                View Logs →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OndiSecuritySettings;
