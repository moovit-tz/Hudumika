// ─── OndiPersonalActivity.tsx — Ondi Personal · Activity ─────────
// Backed by GET /v1/security/activity (new — see security.routes.ts),
// which merges hr_login_history and ondi_auth_events for the current user
// only. Tenant-wide equivalents of both already existed as admin views
// (ondi.routes.ts /login-history, /v1/security/audit/verify-chain) but
// neither had a self-scoped feed for a personal Activity page to read.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon, type IconName } from '../components/Icon.js';

interface ActivityRow {
  id: string; kind: 'login' | 'event'; label: string;
  ip: string | null; user_agent: string | null; metadata?: unknown; created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  login_success: 'Signed in', login_failed: 'Failed sign-in attempt',
  otp_issued: 'One-time code sent', otp_verified: 'One-time code verified',
  totp_verified: 'Two-factor code verified',
  passkey_added: 'Passkey added', passkey_removed: 'Passkey removed', passkey_login: 'Signed in with a passkey',
  google_login: 'Signed in with Google', microsoft_login: 'Signed in with Microsoft',
  device_renamed: 'Device renamed', session_revoked: 'Session signed out',
  access_denied: 'Access denied',
  kyc_submitted: 'Identity document submitted', kyc_approved: 'Identity verified', kyc_rejected: 'Identity document rejected',
  kyb_submitted: 'Business verification submitted', kyb_verified: 'Business verified', kyb_rejected: 'Business verification rejected',
  org_role_created: 'Org role created', org_role_deleted: 'Org role deleted',
  org_role_granted: 'Org role granted to you', org_role_revoked: 'Org role revoked from you',
  access_request_submitted: 'Access request submitted', access_request_approved: 'Access request approved', access_request_denied: 'Access request denied',
  password_changed: 'Password changed', email_changed: 'Email address changed',
  wallet_item_added: 'Added a wallet item', wallet_item_viewed: 'Revealed a wallet secret',
  wallet_item_updated: 'Updated a wallet item', wallet_item_deleted: 'Deleted a wallet item',
  wallet_item_shared: 'Shared a wallet item', wallet_item_share_revoked: 'Revoked a shared wallet item',
  recovery_contact_added: 'Added a recovery contact', recovery_contact_responded: 'Responded to a recovery-contact request',
  recovery_contact_removed: 'Removed a recovery contact',
  recovery_requested: 'Requested account recovery', recovery_request_approved: 'Approved a recovery request',
  recovery_request_declined: 'Declined a recovery request', recovery_request_cancelled: 'Recovery request cancelled',
  recovery_completed: 'Completed account recovery',
};

const EVENT_ICON: Record<string, IconName> = {
  login: 'logIn', otp: 'smartphone', totp: 'shield', passkey: 'key',
  google: 'globe', microsoft: 'globe', device: 'smartphone', session: 'lock',
  access: 'shield', kyc: 'fingerprint', kyb: 'building', org: 'userCheck',
  password: 'lock', email: 'mail', wallet: 'key', recovery: 'userCheck',
};

function iconFor(row: ActivityRow): IconName {
  if (row.kind === 'login') return row.label === 'Signed in' ? 'logIn' : 'alertTriangle';
  const key = Object.keys(EVENT_ICON).find(k => row.label.toLowerCase().includes(k) || (typeof (row as any).eventType === 'string' && (row as any).eventType.startsWith(k)));
  return (key && EVENT_ICON[key]) || 'activity';
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const OndiPersonalActivity: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/v1/security/activity').then(setRows).catch((e: any) => setErr(e?.message ?? 'Could not load activity.'));
  }, []);

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Your"
        titleEm="activity"
        subtitle="Sign-ins and security events on your own account, most recent first."
      />

      <SectionCard padded={false}>
        {rows === null && !err && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {err && <div style={{ padding: 20, fontSize: 13, color: 'var(--red)' }}>{err}</div>}
        {rows?.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No activity recorded yet.</div>}
        {rows?.map((r, i, arr) => {
          const label = r.kind === 'event' ? (EVENT_LABEL[r.label] || r.label) : r.label;
          const failed = r.kind === 'login' && r.label !== 'Signed in';
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: failed ? 'var(--red-l)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={iconFor({ ...r, label } as ActivityRow)} size={16} color={failed ? 'var(--red)' : 'var(--ink3)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: failed ? 'var(--red)' : 'var(--ink)' }}>{label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {r.ip && <span style={{ fontFamily: 'var(--mono)' }}>{r.ip}</span>}
                  {r.user_agent && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{r.user_agent}</span>}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmt(r.created_at)}</div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
};

export default OndiPersonalActivity;
