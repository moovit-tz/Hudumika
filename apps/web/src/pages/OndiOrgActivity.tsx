import React, { useEffect, useState, useMemo } from 'react';
import './OndiPages.css';
import { apiFetch, apiDownload } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';

interface ActivityEvent {
  id: string;
  event_type: string;
  ip: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
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

function isAuthEvent(eventType: string): boolean {
  return eventType.startsWith('login') || eventType.includes('_login') || eventType.startsWith('otp') || eventType.startsWith('totp') || eventType.startsWith('passkey');
}

function fmt(d: string): string {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const OndiOrgActivity: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryTab, setCategoryTab] = useState<'all' | 'auth' | 'security'>('all');

  useEffect(() => {
    apiFetch('/v1/ondi/org/activity')
      .then(setEvents)
      .catch((e: any) => setErr(e?.message ?? 'Could not load activity.'));
  }, []);

  async function exportCsv() {
    setExporting(true);
    try {
      await apiDownload('/v1/ondi/org/activity?format=csv', `ondi_activity_${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  }

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(e => {
      // Category filter
      if (categoryTab === 'auth' && !isAuthEvent(e.event_type)) return false;
      if (categoryTab === 'security' && (isAuthEvent(e.event_type) && !FAILURE_EVENTS.has(e.event_type))) return false;

      // Text search
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      const label = EVENT_LABEL[e.event_type] || e.event_type;
      return (e.user_name || '').toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        (e.ip || '').includes(q) ||
        (e.user_agent || '').toLowerCase().includes(q);
    });
  }, [events, filter, categoryTab]);

  const authEventCount = useMemo(() => events ? events.filter(e => isAuthEvent(e.event_type)).length : 0, [events]);
  const failedCount = useMemo(() => events ? events.filter(e => FAILURE_EVENTS.has(e.event_type)).length : 0, [events]);

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Audit"
        titleEm="activity"
        subtitle="Hash-chained audit log feed capturing security, authentication, and permission events across this workspace."
        actions={
          <button
            type="button"
            disabled={exporting}
            onClick={exportCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--teal)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-md, 12px)',
              padding: '10px 18px',
              fontFamily: 'var(--font)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              opacity: exporting ? 0.6 : 1,
              boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)'
            }}
          >
            <Icon name="download" size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />

      {/* KPI Stats Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Audit Events</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}>
              <Icon name="activity" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{events ? events.length : 0}</span>
            <span className="ondi-kpi-sub">events captured</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Authentication Events</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#eff6ff', color: '#1e40af' }}>
              <Icon name="logIn" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#1e40af' }}>{authEventCount}</span>
            <span className="ondi-kpi-sub">sign-ins &amp; OTPs</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Security Warnings</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}>
              <Icon name="alertTriangle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#dc2626' }}>{failedCount}</span>
            <span className="ondi-kpi-sub">failures &amp; denials</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Log Storage Guarantee</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}>
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857', fontSize: 20 }}>Tamper-Proof</span>
            <span className="ondi-kpi-sub">SHA-256 chained</span>
          </div>
        </div>
      </div>

      {/* Main Section & Filter Toolbar */}
      <SectionCard padded={false} title="Audit Feed">
        <div className="ondi-toolbar">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`ondi-tab-btn ${categoryTab === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryTab('all')}
            >
              All Events <span className="ondi-tab-badge">{events ? events.length : 0}</span>
            </button>

            <button
              type="button"
              className={`ondi-tab-btn ${categoryTab === 'auth' ? 'active' : ''}`}
              onClick={() => setCategoryTab('auth')}
            >
              Sign-Ins &amp; Auth <span className="ondi-tab-badge">{authEventCount}</span>
            </button>

            <button
              type="button"
              className={`ondi-tab-btn ${categoryTab === 'security' ? 'active' : ''}`}
              onClick={() => setCategoryTab('security')}
            >
              Security Warnings <span className="ondi-tab-badge" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>{failedCount}</span>
            </button>
          </div>

          <div className="ondi-search-input">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search user, event, or IP..."
            />
          </div>
        </div>

        {events === null && !err && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            <div className="spinner" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <span>Loading audit feed…</span>
          </div>
        )}

        {err && (
          <div style={{ padding: 24, fontSize: 13, color: '#dc2626', background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
            {err}
          </div>
        )}

        {events?.length === 0 && (
          <div style={{ padding: 48, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>
            No audit activity recorded yet in this workspace.
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="ondi-table">
            <thead>
              <tr>
                <th>Event Action</th>
                <th>Actor</th>
                <th>IP Address</th>
                <th>Client / Device</th>
                <th style={{ textAlign: 'right' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(e => {
                const failed = FAILURE_EVENTS.has(e.event_type);
                const label = EVENT_LABEL[e.event_type] || e.event_type;
                return (
                  <tr key={e.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FeaturedIcon variant={failed ? 'error' : 'brand'} size="sm" shape="square">
                          <Icon name={iconFor(e.event_type)} size={15} />
                        </FeaturedIcon>
                        <div>
                          <div style={{ fontWeight: 700, color: failed ? '#b91c1c' : 'var(--ink)' }}>{label}</div>
                          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink3)', marginTop: 1 }}>{e.event_type}</div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {e.user_id ? (
                          <PersonAvatar userId={e.user_id} name={e.user_name || '?'} size={28} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>
                            SYS
                          </div>
                        )}
                        <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{e.user_name || 'System Engine'}</span>
                      </div>
                    </td>

                    <td>
                      {e.ip ? (
                        <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink2)', background: 'var(--bg)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border-soft)' }}>
                          {e.ip}
                        </code>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>—</span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_agent || ''}>
                        {e.user_agent ? e.user_agent.split(' ')[0] : '—'}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12 }}>
                      {fmt(e.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

export default OndiOrgActivity;

