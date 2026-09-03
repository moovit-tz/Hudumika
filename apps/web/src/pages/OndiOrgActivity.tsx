// ─── OneIdOrgActivity.tsx — Ondi Enterprise · Activity ────────────
// A browsable feed over ondi_auth_events (the same hash-chained audit log
// the Sessions & Security page can now verify the integrity of) — that
// table already existed and was being written to since Ondi M0/M3, but
// nothing ever let an admin actually read it; only a tamper-verify
// endpoint existed. Backed by the new GET /v1/oneid/org/activity.
import React, { useEffect, useState } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

interface ActivityEvent {
  id: string; event_type: string; ip: string | null; user_agent: string | null;
  metadata: unknown; created_at: string; user_id: string | null; user_name: string | null;
}

// Same human labels OneIdPersonalActivity.tsx uses for the personal feed —
// kept in sync rather than imported, since that file's copy is scoped to
// the subset of events a personal feed actually needs and this one covers
// the full tenant-wide set.
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
  org_role_granted: 'Org role granted', org_role_revoked: 'Org role revoked',
  access_request_submitted: 'Access request submitted', access_request_approved: 'Access request approved', access_request_denied: 'Access request denied',
  password_changed: 'Password changed', email_changed: 'Email address changed',
  oauth_consent_revoked: 'Revoked an authorized app', account_deactivation_requested: 'Requested account deactivation',
  wallet_item_added: 'Added a wallet item', wallet_item_viewed: 'Revealed a wallet secret',
  wallet_item_updated: 'Updated a wallet item', wallet_item_deleted: 'Deleted a wallet item',
  wallet_item_shared: 'Shared a wallet item', wallet_item_share_revoked: 'Revoked a shared wallet item',
  access_review_campaign_started: 'Started an access-review campaign', access_review_campaign_completed: 'Completed an access-review campaign',
  access_review_item_approved: 'Approved a role grant', access_review_item_revoked: 'Revoked a role grant',
  recovery_contact_added: 'Added a recovery contact', recovery_contact_responded: 'Responded to a recovery-contact request',
  recovery_contact_removed: 'Removed a recovery contact',
  recovery_requested: 'Requested account recovery', recovery_request_approved: 'Approved a recovery request',
  recovery_request_declined: 'Declined a recovery request', recovery_request_cancelled: 'Recovery request cancelled',
  recovery_completed: 'Completed account recovery',
};

const FAILURE_EVENTS = new Set(['login_failed', 'access_denied', 'kyc_rejected', 'kyb_rejected', 'access_request_denied', 'access_review_item_revoked']);

function iconFor(eventType: string): IconName {
  if (eventType.startsWith('login') || eventType.includes('_login')) return 'logIn';
  if (eventType.startsWith('kyc')) return 'fingerprint';
  if (eventType.startsWith('kyb')) return 'building';
  if (eventType.startsWith('org_role') || eventType.startsWith('access_request') || eventType.startsWith('access_review')) return 'userCheck';
  if (eventType.startsWith('wallet')) return 'key';
  if (eventType.startsWith('passkey') || eventType.startsWith('totp') || eventType.startsWith('otp')) return 'shield';
  if (eventType.includes('password') || eventType.includes('email')) return 'lock';
  if (eventType.includes('device') || eventType.includes('session')) return 'smartphone';
  return 'activity';
}

function fmt(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const OneIdOrgActivity: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiFetch('/v1/oneid/org/activity').then(setEvents).catch((e: any) => setErr(e?.message ?? 'Could not load activity.'));
  }, []);

  // Ondi feature-gap pass (M5): was on-screen only before — GET
  // /v1/oneid/org/activity?format=csv is the same query, just wider
  // (2000 rows) and rendered as a real download instead of JSON.
  async function exportCsv() {
    setExporting(true);
    try { await apiDownload('/v1/oneid/org/activity?format=csv', `ondi_activity_${new Date().toISOString().slice(0, 10)}.csv`); }
    finally { setExporting(false); }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Org"
        titleEm="activity"
        subtitle="Every security event across this tenant, most recent first."
        actions={
          <button type="button" disabled={exporting} onClick={exportCsv}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', opacity: exporting ? 0.6 : 1 }}>
            <Icon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />

      <SectionCard padded={false}>
        {events === null && !err && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>}
        {err && <div style={{ padding: 20, fontSize: 13, color: 'var(--red)' }}>{err}</div>}
        {events?.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--ink3)' }}>No activity recorded yet.</div>}
        {events?.map((e, i, arr) => {
          const failed = FAILURE_EVENTS.has(e.event_type);
          const label = EVENT_LABEL[e.event_type] || e.event_type;
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: failed ? 'var(--red-l)' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={iconFor(e.event_type)} size={15} color={failed ? 'var(--red)' : 'var(--ink3)'} />
              </div>
              {e.user_id ? <PersonAvatar userId={e.user_id} name={e.user_name || '?'} size={26} /> : <div style={{ width: 26 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: failed ? 'var(--red)' : 'var(--ink)' }}>
                  <strong style={{ fontWeight: 600 }}>{e.user_name || 'System'}</strong> — {label}
                </div>
                {e.ip && <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 1, fontFamily: 'var(--mono)' }}>{e.ip}</div>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmt(e.created_at)}</div>
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
};

export default OneIdOrgActivity;
