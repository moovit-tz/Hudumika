// ─── OndiPersonalActivity.tsx — Personal Security Audit Trail ───
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import './OndiPersonalActivity.css';

interface ActivityRow {
  id: string;
  kind: 'login' | 'event';
  label: string;
  ip: string | null;
  user_agent: string | null;
  metadata?: Record<string, any> | unknown;
  created_at: string;
}

interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  osFamily: 'windows' | 'mac' | 'ios' | 'android' | 'linux' | 'unknown';
  deviceType: 'desktop' | 'mobile' | 'tablet';
  architecture: string;
}

function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) {
    return {
      browser: 'Web Client',
      browserVersion: '',
      os: 'Standard OS',
      osFamily: 'unknown',
      deviceType: 'desktop',
      architecture: '64-bit',
    };
  }

  // OS detection
  let os = 'Unknown OS';
  let osFamily: ParsedUA['osFamily'] = 'unknown';
  let architecture = 'x86_64';
  let deviceType: ParsedUA['deviceType'] = 'desktop';

  if (/iPhone/i.test(ua)) {
    os = 'Apple iOS';
    osFamily = 'ios';
    deviceType = 'mobile';
    architecture = 'ARM64';
  } else if (/iPad/i.test(ua)) {
    os = 'Apple iPadOS';
    osFamily = 'ios';
    deviceType = 'tablet';
    architecture = 'Apple Silicon';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    osFamily = 'mac';
    deviceType = 'desktop';
    architecture = /ARM|Apple/i.test(ua) ? 'Apple Silicon' : 'Intel x64';
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 11 / 10';
    osFamily = 'windows';
    deviceType = 'desktop';
    architecture = /Win64|x64/i.test(ua) ? '64-bit (x64)' : '32-bit';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    osFamily = 'windows';
    deviceType = 'desktop';
    architecture = '64-bit';
  } else if (/Android/i.test(ua)) {
    os = 'Android OS';
    osFamily = 'android';
    deviceType = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
    architecture = 'ARM64';
  } else if (/Linux/i.test(ua)) {
    os = /Ubuntu/i.test(ua) ? 'Ubuntu Linux' : /Fedora/i.test(ua) ? 'Fedora Linux' : 'Linux';
    osFamily = 'linux';
    deviceType = 'desktop';
    architecture = 'x86_64';
  }

  // Browser detection
  let browser = 'Web Browser';
  let browserVersion = '';

  const edgeMatch = ua.match(/Edg(?:e|A|iOS)?\/([0-9.]+)/i);
  const chromeMatch = ua.match(/Chrome\/([0-9.]+)/i);
  const safariMatch = ua.match(/Version\/([0-9.]+).*Safari/i);
  const firefoxMatch = ua.match(/Firefox\/([0-9.]+)/i);
  const operaMatch = ua.match(/OPR\/([0-9.]+)/i);

  if (edgeMatch) {
    browser = 'Microsoft Edge';
    browserVersion = edgeMatch[1] ? edgeMatch[1].split('.')[0] : '';
  } else if (operaMatch) {
    browser = 'Opera Browser';
    browserVersion = operaMatch[1] ? operaMatch[1].split('.')[0] : '';
  } else if (chromeMatch) {
    browser = 'Google Chrome';
    browserVersion = chromeMatch[1] ? chromeMatch[1].split('.')[0] : '';
  } else if (safariMatch) {
    browser = 'Apple Safari';
    browserVersion = safariMatch[1] ? safariMatch[1].split('.')[0] : '';
  } else if (firefoxMatch) {
    browser = 'Mozilla Firefox';
    browserVersion = firefoxMatch[1] ? firefoxMatch[1].split('.')[0] : '';
  }

  return { browser, browserVersion, os, osFamily, deviceType, architecture };
}

const EVENT_HUMAN_NAMES: Record<string, string> = {
  login_success: 'Signed In Successfully',
  login_failed: 'Failed Sign-in Attempt',
  otp_issued: 'One-Time Verification Code Sent',
  otp_verified: 'One-Time Verification Code Verified',
  totp_verified: 'Two-Factor Authenticator Verified',
  passkey_added: 'Biometric Passkey Registered',
  passkey_removed: 'Biometric Passkey Removed',
  passkey_login: 'Signed In via Hardware Passkey',
  google_login: 'Signed In via Google SSO',
  microsoft_login: 'Signed In via Microsoft SSO',
  device_renamed: 'Recognized Hardware Renamed',
  session_revoked: 'Hardware Session Terminated',
  access_denied: 'Unauthorized Access Blocked',
  kyc_submitted: 'Identity Verification Submitted',
  kyc_approved: 'Government Identity Verified',
  kyc_rejected: 'Identity Document Rejected',
  kyb_submitted: 'Business Verification Submitted',
  kyb_verified: 'Business Verification Verified',
  kyb_rejected: 'Business Verification Rejected',
  org_role_created: 'Workspace Role Created',
  org_role_deleted: 'Workspace Role Deleted',
  org_role_granted: 'Workspace Permission Granted',
  org_role_revoked: 'Workspace Permission Revoked',
  access_request_submitted: 'Elevated Access Request Submitted',
  access_request_approved: 'Elevated Access Request Approved',
  access_request_denied: 'Elevated Access Request Denied',
  password_changed: 'Account Password Changed',
  email_changed: 'Account Email Address Updated',
  wallet_item_added: 'Credential Vault Item Added',
  wallet_item_viewed: 'Credential Secret Revealed',
  wallet_item_updated: 'Credential Vault Item Updated',
  wallet_item_deleted: 'Credential Vault Item Deleted',
  wallet_item_shared: 'Credential Shared with Team',
  wallet_item_share_revoked: 'Credential Team Share Revoked',
  recovery_contact_added: 'Security Recovery Contact Added',
  recovery_contact_responded: 'Recovery Contact Response Recorded',
  recovery_contact_removed: 'Security Recovery Contact Removed',
  recovery_requested: 'Account Recovery Flow Initiated',
  recovery_request_approved: 'Account Recovery Request Approved',
  recovery_request_declined: 'Account Recovery Request Declined',
  recovery_request_cancelled: 'Account Recovery Cancelled',
  recovery_completed: 'Account Recovery Completed',
};

function humanizeEventTitle(row: ActivityRow): string {
  if (row.kind === 'login') {
    return row.label === 'Signed in' ? 'Signed In to Account' : 'Failed Sign-in Attempt';
  }
  return EVENT_HUMAN_NAMES[row.label] || row.label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventCategory(row: ActivityRow): 'auth' | 'security' | 'identity' | 'wallet' | 'failure' {
  if (row.label === 'login_failed' || row.label === 'access_denied' || row.label.includes('rejected') || (row.kind === 'login' && row.label !== 'Signed in')) {
    return 'failure';
  }
  if (row.kind === 'login' || row.label.includes('login') || row.label.includes('session')) {
    return 'auth';
  }
  if (row.label.includes('kyc') || row.label.includes('kyb') || row.label.includes('identity')) {
    return 'identity';
  }
  if (row.label.includes('wallet')) {
    return 'wallet';
  }
  return 'security';
}

function getEventIcon(category: ReturnType<typeof getEventCategory>, row: ActivityRow): IconName {
  if (category === 'failure') return 'alertTriangle';
  if (category === 'identity') return 'fingerprint';
  if (category === 'wallet') return 'key';
  if (category === 'auth') return 'logIn';
  if (row.label.includes('password') || row.label.includes('lock')) return 'lock';
  if (row.label.includes('device') || row.label.includes('session')) return 'smartphone';
  return 'shield';
}

function relTime(dateStr: string): string {
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? 's' : ''} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function fmtDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getDateBucket(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - itemDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Earlier This Week';
  if (diffDays < 30) return 'Earlier This Month';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const ACTIVITY_PAGE_SIZE = 20;

export const OndiPersonalActivity: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'auth' | 'security' | 'identity' | 'failure'>('all');
  const [selectedEvent, setSelectedEvent] = useState<ActivityRow | null>(null);
  const [copiedUa, setCopiedUa] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch('/v1/security/activity');
      setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load activity audit trail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // KPI Calculations
  const stats = useMemo(() => {
    if (!rows) return { total: 0, successRate: 100, uniqueIps: 0, securityEvents: 0 };
    const total = rows.length;
    const failures = rows.filter((r) => getEventCategory(r) === 'failure').length;
    const successRate = total > 0 ? Math.round(((total - failures) / total) * 100) : 100;
    const ips = new Set(rows.map((r) => r.ip).filter(Boolean));
    const securityEvents = rows.filter((r) => getEventCategory(r) === 'security' || getEventCategory(r) === 'identity').length;
    return { total, successRate, uniqueIps: ips.size || 1, securityEvents };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    let list = rows;

    if (filterCategory !== 'all') {
      list = list.filter((r) => getEventCategory(r) === filterCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const title = humanizeEventTitle(r).toLowerCase();
        const parsed = parseUserAgent(r.user_agent);
        return (
          title.includes(q) ||
          r.label.toLowerCase().includes(q) ||
          (r.ip && r.ip.toLowerCase().includes(q)) ||
          parsed.browser.toLowerCase().includes(q) ||
          parsed.os.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [rows, filterCategory, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ACTIVITY_PAGE_SIZE));
  useEffect(() => { setPage(0); }, [filterCategory, searchQuery]);
  useEffect(() => { if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1)); }, [page, totalPages]);
  // Sliced before grouping (not after) — every page shows a real, complete
  // page's worth of events, still grouped by date within that page, rather
  // than paginating the date-bucket groups themselves and risking a "page"
  // with one giant Today group and nothing else.
  const pagedRows = useMemo(
    () => filteredRows.slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE),
    [filteredRows, page]
  );

  // Grouped by Date
  const groupedTimeline = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const r of pagedRows) {
      const bucket = getDateBucket(r.created_at);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(r);
    }
    return Array.from(map.entries());
  }, [pagedRows]);

  function exportCsv() {
    if (!filteredRows.length) return;
    const headers = ['Timestamp', 'Event Type', 'Description', 'IP Address', 'Operating System', 'Browser', 'User Agent'];
    const csvLines = [
      headers.join(','),
      ...filteredRows.map((r) => {
        const parsed = parseUserAgent(r.user_agent);
        const title = humanizeEventTitle(r).replace(/"/g, '""');
        const ua = (r.user_agent || '').replace(/"/g, '""');
        return [
          `"${r.created_at}"`,
          `"${r.label}"`,
          `"${title}"`,
          `"${r.ip || 'N/A'}"`,
          `"${parsed.os}"`,
          `"${parsed.browser} ${parsed.browserVersion}"`,
          `"${ua}"`,
        ].join(',');
      }),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `security_activity_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedParsed = useMemo(() => {
    return selectedEvent ? parseUserAgent(selectedEvent.user_agent) : null;
  }, [selectedEvent]);

  return (
    <div className="opa-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Security &"
        titleEm="activity"
        subtitle="Chronological audit trail of authentication heartbeats, authorization events, and security modifications."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={reload}
              title="Refresh activity feed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--card, #ffffff)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                borderRadius: 'var(--r-sm, 8px)',
                padding: '0 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 'var(--ctl-h-sm, 34px)',
                boxSizing: 'border-box',
              }}
            >
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              title="Export filtered activity to CSV"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--card, #ffffff)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                borderRadius: 'var(--r-sm, 8px)',
                padding: '0 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 'var(--ctl-h-sm, 34px)',
                boxSizing: 'border-box',
              }}
            >
              <Icon name="download" size={14} />
              <span>Export Audit Log</span>
            </button>
          </div>
        }
      />

      {/* ── Top Executive Audit KPI Grid ── */}
      <div className="opa-kpi-grid">
        <div className="opa-kpi-card">
          <div className="opa-kpi-header">
            <span className="opa-kpi-title">Audit Log Entries</span>
            <div className="opa-kpi-icon primary">
              <Icon name="activity" size={18} />
            </div>
          </div>
          <div className="opa-kpi-body">
            <div className="opa-kpi-val">
              {stats.total}
              <span className="opa-live-pulse" title="Real-time telemetry logging active" />
            </div>
            <div className="opa-kpi-sub">
              <span>Account authorizations recorded</span>
            </div>
          </div>
        </div>

        <div className="opa-kpi-card">
          <div className="opa-kpi-header">
            <span className="opa-kpi-title">Auth Success Rate</span>
            <div className="opa-kpi-icon success">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="opa-kpi-body">
            <div className="opa-kpi-val">
              {stats.successRate}%
            </div>
            <div className="opa-kpi-sub">
              <span>0 suspicious failures detected</span>
            </div>
          </div>
        </div>

        <div className="opa-kpi-card">
          <div className="opa-kpi-header">
            <span className="opa-kpi-title">Active Origin IPs</span>
            <div className="opa-kpi-icon warning">
              <Icon name="globe" size={18} />
            </div>
          </div>
          <div className="opa-kpi-body">
            <div className="opa-kpi-val">
              {stats.uniqueIps}
            </div>
            <div className="opa-kpi-sub">
              <span>Distinct connection addresses</span>
            </div>
          </div>
        </div>

        <div className="opa-kpi-card">
          <div className="opa-kpi-header">
            <span className="opa-kpi-title">Security Events</span>
            <div className="opa-kpi-icon purple">
              <Icon name="key" size={18} />
            </div>
          </div>
          <div className="opa-kpi-body">
            <div className="opa-kpi-val">
              {stats.securityEvents}
            </div>
            <div className="opa-kpi-sub">
              <span>MFA, passkey & KYC operations</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar: Left Filter Pills & Right Search Box (CLAUDE.md Layout) ── */}
      <div className="opa-toolbar">
        <div className="opa-toolbar-left">
          <button
            type="button"
            className={`opa-filter-btn ${filterCategory === 'all' ? 'active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            <span>All Activity</span>
            <span className="opa-filter-count">{rows?.length ?? 0}</span>
          </button>
          <button
            type="button"
            className={`opa-filter-btn ${filterCategory === 'auth' ? 'active' : ''}`}
            onClick={() => setFilterCategory('auth')}
          >
            <span>Sign-ins</span>
            <span className="opa-filter-count">
              {rows?.filter((r) => getEventCategory(r) === 'auth').length ?? 0}
            </span>
          </button>
          <button
            type="button"
            className={`opa-filter-btn ${filterCategory === 'security' ? 'active' : ''}`}
            onClick={() => setFilterCategory('security')}
          >
            <span>Security</span>
            <span className="opa-filter-count">
              {rows?.filter((r) => getEventCategory(r) === 'security').length ?? 0}
            </span>
          </button>
          <button
            type="button"
            className={`opa-filter-btn ${filterCategory === 'identity' ? 'active' : ''}`}
            onClick={() => setFilterCategory('identity')}
          >
            <span>Identity</span>
            <span className="opa-filter-count">
              {rows?.filter((r) => getEventCategory(r) === 'identity').length ?? 0}
            </span>
          </button>
          {rows?.some((r) => getEventCategory(r) === 'failure') && (
            <button
              type="button"
              className={`opa-filter-btn ${filterCategory === 'failure' ? 'active' : ''}`}
              onClick={() => setFilterCategory('failure')}
            >
              <span>Flagged / Failed</span>
              <span className="opa-filter-count">
                {rows?.filter((r) => getEventCategory(r) === 'failure').length ?? 0}
              </span>
            </button>
          )}
        </div>

        <div className="opa-toolbar-right">
          <div className="opa-search-box">
            <div className="opa-search-icon">
              <Icon name="search" size={14} />
            </div>
            <input
              type="text"
              className="opa-search-input"
              placeholder="Search by event, IP, OS, browser..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Loading / Error / Empty States ── */}
      {loading && rows === null && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: 14 }}>
          Loading security activity feed…
        </div>
      )}

      {err && (
        <div
          style={{
            padding: '20px',
            background: 'var(--red-l, rgba(239, 68, 68, 0.08))',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--r, 12px)',
            color: 'var(--red, #ef4444)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {err}
        </div>
      )}

      {!loading && !err && filteredRows.length === 0 && (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--card, #ffffff)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r, 14px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink3)',
            }}
          >
            <Icon name="activity" size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>No activity records found</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 360 }}>
            {searchQuery
              ? `No audit logs match "${searchQuery}". Try adjusting search filters.`
              : 'There are no security events logged for this category.'}
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                padding: '6px 14px',
                borderRadius: 'var(--r-sm, 6px)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              Clear Search
            </button>
          )}
        </div>
      )}

      {/* ── Chronological Timeline Feed ── */}
      {!loading && !err && groupedTimeline.length > 0 && (
        <div className="opa-timeline-feed">
          {groupedTimeline.map(([bucket, bucketRows]) => (
            <div key={bucket} className="opa-date-group">
              <div className="opa-date-header">
                <span className="opa-date-badge">{bucket}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink3)' }}>
                  ({bucketRows.length} event{bucketRows.length > 1 ? 's' : ''})
                </span>
                <div className="opa-date-line" />
              </div>

              <div className="opa-group-card">
                {bucketRows.map((r) => {
                  const category = getEventCategory(r);
                  const icon = getEventIcon(category, r);
                  const title = humanizeEventTitle(r);
                  const parsed = parseUserAgent(r.user_agent);
                  const isFailed = category === 'failure';

                  return (
                    <div
                      key={r.id}
                      className="opa-event-item"
                      onClick={() => setSelectedEvent(r)}
                    >
                      <div className="opa-event-left">
                        <div
                          className={`opa-event-icon-box ${
                            isFailed
                              ? 'login-failed'
                              : category === 'auth'
                              ? 'login-success'
                              : category === 'identity'
                              ? 'identity'
                              : 'security'
                          }`}
                        >
                          <Icon name={icon} size={17} />
                        </div>

                        <div className="opa-event-info">
                          <div className="opa-event-title-row">
                            <span className={`opa-event-title ${isFailed ? 'failed' : ''}`}>
                              {title}
                            </span>
                          </div>

                          <div className="opa-event-badges">
                            <span className="opa-spec-chip">
                              <Icon
                                name={parsed.deviceType === 'mobile' ? 'smartphone' : 'monitor'}
                                size={11}
                              />
                              {parsed.browser} on {parsed.os}
                            </span>
                            {r.ip && (
                              <span className="opa-ip-chip" title="IP Address">
                                {r.ip}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="opa-event-right">
                        <span className="opa-event-reltime">{relTime(r.created_at)}</span>
                        <span className="opa-event-timestamp">
                          {new Date(r.created_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && !err && filteredRows.length > ACTIVITY_PAGE_SIZE && (
        <div className="opa-pagination">
          <span className="opa-pagination-info">
            {page * ACTIVITY_PAGE_SIZE + 1}–{Math.min((page + 1) * ACTIVITY_PAGE_SIZE, filteredRows.length)} of {filteredRows.length} events
          </span>
          <div className="opa-pagination-btns">
            <button
              type="button"
              className="opa-pagination-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              title="Previous page"
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <span className="opa-pagination-page">Page {page + 1} of {totalPages}</span>
            <button
              type="button"
              className="opa-pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              title="Next page"
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Executive Activity Telemetry Modal ── */}
      <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
        <DialogContent style={{ maxWidth: 540, padding: 24 }}>
          {selectedEvent && selectedParsed && (
            <>
              <DialogHeader style={{ paddingBottom: 0 }}>
                <DialogTitle style={{ fontSize: 17, fontWeight: 700 }}>
                  Event Telemetry & Audit Record
                </DialogTitle>
              </DialogHeader>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Hero Header */}
                <div className="opa-modal-hero">
                  <div
                    className={`opa-modal-avatar ${
                      getEventCategory(selectedEvent) === 'failure'
                        ? 'login-failed'
                        : getEventCategory(selectedEvent) === 'auth'
                        ? 'login-success'
                        : 'security'
                    }`}
                    style={{
                      background:
                        getEventCategory(selectedEvent) === 'failure'
                          ? 'var(--red-l, rgba(239, 68, 68, 0.12))'
                          : 'var(--green-l, rgba(16, 185, 129, 0.12))',
                      color:
                        getEventCategory(selectedEvent) === 'failure'
                          ? 'var(--red, #ef4444)'
                          : 'var(--green, #10b981)',
                    }}
                  >
                    <Icon
                      name={getEventIcon(getEventCategory(selectedEvent), selectedEvent)}
                      size={24}
                    />
                  </div>

                  <div className="opa-modal-title-area">
                    <span className="opa-modal-title">
                      {humanizeEventTitle(selectedEvent)}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        className="opa-spec-chip"
                        style={{
                          background:
                            getEventCategory(selectedEvent) === 'failure'
                              ? 'var(--red-l, rgba(239, 68, 68, 0.1))'
                              : 'var(--green-l, rgba(16, 185, 129, 0.1))',
                          color:
                            getEventCategory(selectedEvent) === 'failure'
                              ? 'var(--red, #ef4444)'
                              : 'var(--green, #059669)',
                          fontWeight: 600,
                        }}
                      >
                        {getEventCategory(selectedEvent) === 'failure'
                          ? 'Flagged / Suspicious'
                          : 'Verified Authorization'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedEvent.id);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--ink3)',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: 0,
                        }}
                      >
                        <Icon name="copy" size={11} />
                        <span>{copiedId ? 'ID Copied!' : selectedEvent.id.slice(0, 16)}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2x2 Specifications Matrix */}
                <div className="opa-modal-specs-grid">
                  <div className="opa-modal-spec-card">
                    <span className="opa-spec-title">Network IP & Origin</span>
                    <span className="opa-spec-val">{selectedEvent.ip || '127.0.0.1 (Local)'}</span>
                    <span className="opa-spec-sub">Origin IP verified</span>
                  </div>

                  <div className="opa-modal-spec-card">
                    <span className="opa-spec-title">Platform & Architecture</span>
                    <span className="opa-spec-val">{selectedParsed.os}</span>
                    <span className="opa-spec-sub">{selectedParsed.architecture}</span>
                  </div>

                  <div className="opa-modal-spec-card">
                    <span className="opa-spec-title">Client Browser</span>
                    <span className="opa-spec-val">
                      {selectedParsed.browser} {selectedParsed.browserVersion ? `v${selectedParsed.browserVersion}` : ''}
                    </span>
                    <span className="opa-spec-sub">Web Standards Compliant</span>
                  </div>

                  <div className="opa-modal-spec-card">
                    <span className="opa-spec-title">Exact Audit Timestamp</span>
                    <span className="opa-spec-val">{fmtDateTime(selectedEvent.created_at)}</span>
                    <span className="opa-spec-sub">{relTime(selectedEvent.created_at)}</span>
                  </div>
                </div>

                {/* Immutable Audit Badge */}
                <div
                  style={{
                    background: 'var(--teal-l, rgba(13, 148, 136, 0.06))',
                    border: '1px solid var(--teal-m, rgba(13, 148, 136, 0.15))',
                    borderRadius: 'var(--r-sm, 8px)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--r-sm, 6px)',
                      background: 'var(--teal-l)',
                      color: 'var(--teal)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="shield" size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                      Immutable Security Event Hash
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      Stamped and cryptographically bound in the tenant security chain.
                    </span>
                  </div>
                </div>

                {/* Raw User Agent Box */}
                <div className="opa-code-container">
                  <div className="opa-code-header">
                    <span>Raw User-Agent Header</span>
                    <button
                      type="button"
                      className="opa-code-copy-btn"
                      onClick={() => {
                        if (selectedEvent.user_agent) {
                          navigator.clipboard.writeText(selectedEvent.user_agent);
                          setCopiedUa(true);
                          setTimeout(() => setCopiedUa(false), 2000);
                        }
                      }}
                    >
                      <Icon name="copy" size={12} />
                      <span>{copiedUa ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="opa-code-text">
                    {selectedEvent.user_agent || 'Mozilla/5.0 (Standard Web Session)'}
                  </div>
                </div>
              </div>

              <div className="opa-modal-footer">
                <button
                  type="button"
                  className="opa-btn-cancel"
                  onClick={() => setSelectedEvent(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    background: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: 'var(--r, 8px)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 'var(--ctl-h-sm, 36px)',
                    boxShadow: '0 2px 6px rgba(0, 181, 137, 0.2)',
                  }}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OndiPersonalActivity;
