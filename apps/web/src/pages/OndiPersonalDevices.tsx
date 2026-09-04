// ─── OndiPersonalDevices.tsx — Ondi Personal · Hardware & Sessions ───
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import './OndiPersonalDevices.css';

interface ClientHints {
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
}

interface DeviceRow {
  id: string;
  device_label: string | null;
  device_type: string | null;
  user_agent: string | null;
  trusted: boolean;
  last_used_at: string;
  created_at: string;
  revoked_at: string | null;
  is_current: boolean;
  active: boolean;
  /** Real hardware telemetry from the browser's own User-Agent Client Hints
   *  API (see useAuth.tsx's reportClientHints) — null until the browser has
   *  reported once, or permanently on a browser without Client Hints support
   *  (Safari, Firefox). Never guessed as a fallback; see formatArchitecture. */
  client_hints: ClientHints | null;
}

/** Real architecture/platform string from Client Hints — never a UA-regex
 *  guess. Client Hints reports short codes ("arm", "x86") plus a separate
 *  bitness ("64"/"32"); combined into the usual "ARM64"/"x86_64" shorthand
 *  when both are present. */
function formatArchitecture(hints: ClientHints | null | undefined): string {
  if (!hints || !hints.architecture) return 'Not reported by browser';
  const arch = hints.architecture.toLowerCase();
  const bits = hints.bitness || '';
  if (arch === 'arm') return bits ? `ARM${bits}` : 'ARM';
  if (arch === 'x86') return bits === '64' ? 'x86_64' : bits ? `x86 (${bits}-bit)` : 'x86';
  return bits ? `${hints.architecture} (${bits}-bit)` : hints.architecture;
}

interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  osFamily: 'windows' | 'mac' | 'ios' | 'android' | 'linux' | 'unknown';
}

function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) {
    return { browser: 'Web Client', browserVersion: '', os: 'Standard OS', osFamily: 'unknown' };
  }

  // OS detection
  let os = 'Unknown OS';
  let osFamily: ParsedUA['osFamily'] = 'unknown';

  if (/iPhone/i.test(ua)) {
    os = 'Apple iOS';
    osFamily = 'ios';
  } else if (/iPad/i.test(ua)) {
    os = 'Apple iPadOS';
    osFamily = 'ios';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    osFamily = 'mac';
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 11 / 10';
    osFamily = 'windows';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    osFamily = 'windows';
  } else if (/Android/i.test(ua)) {
    os = 'Android OS';
    osFamily = 'android';
  } else if (/Linux/i.test(ua)) {
    os = /Ubuntu/i.test(ua) ? 'Ubuntu Linux' : /Fedora/i.test(ua) ? 'Fedora Linux' : 'Linux';
    osFamily = 'linux';
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

  return { browser, browserVersion, os, osFamily };
}

/** device_type is real, captured server-side at login (auth.routes.ts's
 *  parseDevice()) and stored on hr_devices — this reads that instead of
 *  re-guessing a second, potentially-disagreeing classification client-side. */
function realDeviceType(d: Pick<DeviceRow, 'device_type'>): 'desktop' | 'mobile' | 'tablet' {
  const t = (d.device_type || '').toLowerCase();
  return t === 'mobile' || t === 'tablet' ? t : 'desktop';
}

function relTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr > 1 ? 's' : ''} ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const DEVICES_PAGE_SIZE = 12;

export const OndiPersonalDevices: React.FC = () => {
  const { logout } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'desktop' | 'mobile' | 'current'>('all');
  // List (table) is the default view — grid is still available via the toggle.
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [page, setPage] = useState(0);
  const [copiedUa, setCopiedUa] = useState(false);
  const [revokeConfirmModal, setRevokeConfirmModal] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/v1/security/sessions');
      setDevices(data);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeDevices = useMemo(() => {
    return (devices ?? []).filter((d) => d.active);
  }, [devices]);

  const currentDevice = useMemo(() => {
    return activeDevices.find((d) => d.is_current) ?? activeDevices[0] ?? null;
  }, [activeDevices]);

  const otherDevicesCount = useMemo(() => {
    return activeDevices.filter((d) => !d.is_current).length;
  }, [activeDevices]);

  const trustedCount = useMemo(() => {
    return activeDevices.filter((d) => d.trusted).length;
  }, [activeDevices]);

  const filteredDevices = useMemo(() => {
    let list = activeDevices;

    // Filter type
    if (filterType === 'current') {
      list = list.filter((d) => d.is_current);
    } else if (filterType === 'desktop') {
      list = list.filter((d) => realDeviceType(d) === 'desktop');
    } else if (filterType === 'mobile') {
      list = list.filter((d) => realDeviceType(d) !== 'desktop');
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((d) => {
        const parsed = parseUserAgent(d.user_agent);
        return (
          (d.device_label && d.device_label.toLowerCase().includes(q)) ||
          (d.user_agent && d.user_agent.toLowerCase().includes(q)) ||
          parsed.browser.toLowerCase().includes(q) ||
          parsed.os.toLowerCase().includes(q) ||
          formatArchitecture(d.client_hints).toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [activeDevices, filterType, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / DEVICES_PAGE_SIZE));
  useEffect(() => { setPage(0); }, [filterType, searchQuery, viewMode]);
  // Filter/search results shrinking under the current page (e.g. after a
  // sign-out) must not strand the view on a now-empty page.
  useEffect(() => { if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1)); }, [page, totalPages]);
  const pagedDevices = useMemo(
    () => filteredDevices.slice(page * DEVICES_PAGE_SIZE, (page + 1) * DEVICES_PAGE_SIZE),
    [filteredDevices, page]
  );

  const selected = activeDevices.find((d) => d.id === selectedId) ?? null;
  const selectedParsed = useMemo(() => {
    return selected ? parseUserAgent(selected.user_agent) : null;
  }, [selected]);

  function openDetail(d: DeviceRow) {
    setSelectedId(d.id);
    setRenaming(false);
    setRenameValue(d.device_label || '');
    setCopiedUa(false);
  }

  function closeDetail() {
    setSelectedId(null);
    setRenaming(false);
    setCopiedUa(false);
  }

  async function handleSignOut(id: string, isCurrent: boolean) {
    setRevokingId(id);
    try {
      const res = await apiFetch(`/v1/security/sessions/${id}`, { method: 'DELETE' });
      if (res.was_current || isCurrent) {
        logout();
        return;
      }
      if (selectedId === id) closeDetail();
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to sign out device.');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleSignOutOthers() {
    setRevokingOthers(true);
    try {
      await apiFetch('/v1/security/sessions/revoke-others', { method: 'POST' });
      setRevokeConfirmModal(false);
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to sign out other devices.');
    } finally {
      setRevokingOthers(false);
    }
  }

  async function saveRename() {
    if (!selected) return;
    const label = renameValue.trim();
    if (!label) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/security/sessions/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      });
      setRenaming(false);
      await reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to rename device.');
    } finally {
      setSaving(false);
    }
  }

  function copyUserAgentString(ua: string | null) {
    if (!ua) return;
    navigator.clipboard.writeText(ua);
    setCopiedUa(true);
    setTimeout(() => setCopiedUa(false), 2500);
  }

  return (
    <div className="opd-page">
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Hardware &"
        titleEm="sessions"
        subtitle="Inspect active authorizations, recognized hardware telemetry, and real-time session controls."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={reload}
              title="Refresh session list"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--white)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                padding: 'var(--ds-btn-py-sm) 14px',
                minHeight: 'var(--ctl-h-sm)',
                boxSizing: 'border-box',
                lineHeight: 1.25,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </button>
            {otherDevicesCount > 0 && (
              <button
                type="button"
                onClick={() => setRevokeConfirmModal(true)}
                className="opd-revoke-all-btn"
              >
                <Icon name="logOut" size={14} />
                <span>Sign Out Others ({otherDevicesCount})</span>
              </button>
            )}
          </div>
        }
      />

      {/* ── Top Executive KPI Metrics ── */}
      <div className="opd-kpi-grid">
        <div className="opd-kpi-card">
          <div className="opd-kpi-header">
            <span className="opd-kpi-title">Active Sessions</span>
            <div className="opd-kpi-icon primary">
              <Icon name="activity" size={18} />
            </div>
          </div>
          <div className="opd-kpi-body">
            <div className="opd-kpi-value">
              {activeDevices.length}
              <span className="opd-live-pulse" title="Real-time heartbeat active" />
            </div>
            <div className="opd-kpi-sub">
              <span>Authorized hardware connections</span>
            </div>
          </div>
        </div>

        <div className="opd-kpi-card">
          <div className="opd-kpi-header">
            <span className="opd-kpi-title">Current Device</span>
            <div className="opd-kpi-icon success">
              <Icon name="monitor" size={18} />
            </div>
          </div>
          <div className="opd-kpi-body">
            <div className="opd-kpi-value" style={{ fontSize: 16 }}>
              {currentDevice ? (
                <span>
                  {parseUserAgent(currentDevice.user_agent).browser}
                </span>
              ) : (
                'Active'
              )}
            </div>
            <div className="opd-kpi-sub">
              <span>{currentDevice ? parseUserAgent(currentDevice.user_agent).os : 'This browser session'}</span>
            </div>
          </div>
        </div>

        <div className="opd-kpi-card">
          <div className="opd-kpi-header">
            <span className="opd-kpi-title">Hardware Trust</span>
            <div className="opd-kpi-icon primary">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="opd-kpi-body">
            <div className="opd-kpi-value">
              {activeDevices.length > 0
                ? `${Math.round((trustedCount / activeDevices.length) * 100)}%`
                : '100%'}
            </div>
            <div className="opd-kpi-sub">
              <span>{trustedCount} of {activeDevices.length} devices trusted</span>
            </div>
          </div>
        </div>

        <div className="opd-kpi-card">
          <div className="opd-kpi-header">
            <span className="opd-kpi-title">Remote Sessions</span>
            <div className="opd-kpi-icon warning">
              <Icon name="globe" size={18} />
            </div>
          </div>
          <div className="opd-kpi-body">
            <div className="opd-kpi-value">
              {otherDevicesCount}
            </div>
            <div className="opd-kpi-sub">
              <span>{otherDevicesCount === 0 ? 'No remote devices active' : 'Other active hardware'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search, Filter & View Mode Controls ── */}
      <div className="opd-controls-bar">
        <div className="opd-filters-left">
          <div className="opd-search-box">
            <div className="opd-search-icon">
              <Icon name="search" size={14} />
            </div>
            <input
              type="text"
              className="opd-search-input"
              placeholder="Search devices, browser, OS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="opd-filter-pills">
            <button
              type="button"
              className={`opd-filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              <span>All Sessions</span>
              <span className="opd-filter-count">{activeDevices.length}</span>
            </button>
            <button
              type="button"
              className={`opd-filter-btn ${filterType === 'current' ? 'active' : ''}`}
              onClick={() => setFilterType('current')}
            >
              <span>This Device</span>
              <span className="opd-filter-count">{currentDevice ? 1 : 0}</span>
            </button>
            <button
              type="button"
              className={`opd-filter-btn ${filterType === 'desktop' ? 'active' : ''}`}
              onClick={() => setFilterType('desktop')}
            >
              <span>Desktop</span>
              <span className="opd-filter-count">
                {activeDevices.filter((d) => realDeviceType(d) === 'desktop').length}
              </span>
            </button>
            <button
              type="button"
              className={`opd-filter-btn ${filterType === 'mobile' ? 'active' : ''}`}
              onClick={() => setFilterType('mobile')}
            >
              <span>Mobile / Tablet</span>
              <span className="opd-filter-count">
                {activeDevices.filter((d) => realDeviceType(d) !== 'desktop').length}
              </span>
            </button>
          </div>
        </div>

        <div className="opd-controls-right">
          <div className="opd-view-toggle">
            <button
              type="button"
              className={`opd-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Cards Grid View"
            >
              <Icon name="grid" size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              className={`opd-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Data Table View"
            >
              <Icon name="list" size={13} />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading / Empty States ── */}
      {loading && devices === null && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: 14 }}>
          Loading active hardware sessions…
        </div>
      )}

      {!loading && filteredDevices.length === 0 && (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--white)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
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
            <Icon name="monitor" size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>No devices found</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 360 }}>
            {searchQuery
              ? `No authorized sessions match "${searchQuery}". Try clearing search filters.`
              : 'There are no active devices matching the selected criteria.'}
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                padding: '6px 14px',
                borderRadius: '6px',
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

      {/* ── Grid View ── */}
      {!loading && viewMode === 'grid' && filteredDevices.length > 0 && (
        <div className="opd-device-grid">
          {pagedDevices.map((d) => {
            const parsed = parseUserAgent(d.user_agent);
            const isPhone = realDeviceType(d) !== 'desktop';

            return (
              <div
                key={d.id}
                className={`opd-device-card ${d.is_current ? 'is-current' : ''}`}
                onClick={() => openDetail(d)}
              >
                <div className="opd-card-top">
                  <div className="opd-card-icon-wrap">
                    <Icon name={isPhone ? 'smartphone' : 'monitor'} size={22} />
                    {d.is_current && <div className="opd-card-online-dot" title="Active session" />}
                  </div>

                  <div className="opd-card-info">
                    <div className="opd-card-title-row">
                      <span className="opd-card-title">
                        {d.device_label || `${parsed.browser} on ${parsed.os}`}
                      </span>
                    </div>

                    <div className="opd-card-specs">
                      <span className="opd-spec-chip">
                        <Icon name="terminal" size={11} />
                        {parsed.os}
                      </span>
                      <span className="opd-spec-chip">
                        {parsed.browser} {parsed.browserVersion ? `v${parsed.browserVersion}` : ''}
                      </span>
                    </div>

                    <div className="opd-card-badges">
                      {d.is_current && (
                        <span className="opd-badge-current">
                          <span className="opd-live-pulse" style={{ width: 6, height: 6 }} />
                          This Device
                        </span>
                      )}
                      {d.trusted && (
                        <span className="opd-badge-trusted">
                          <Icon name="shield" size={10} />
                          Trusted
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="opd-card-meta">
                  <div className="opd-meta-row">
                    <span className="opd-meta-label">
                      <Icon name="clock" size={12} />
                      Last Active
                    </span>
                    <span className="opd-meta-val">{relTime(d.last_used_at)}</span>
                  </div>
                  <div className="opd-meta-row">
                    <span className="opd-meta-label">
                      <Icon name="calendar" size={12} />
                      Authorized
                    </span>
                    <span className="opd-meta-val">
                      {new Date(d.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="opd-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="opd-card-btn-detail"
                    onClick={() => openDetail(d)}
                  >
                    <Icon name="info" size={13} />
                    <span>Telemetry & Details</span>
                  </button>
                  <button
                    type="button"
                    className="opd-card-btn-signout"
                    onClick={() => handleSignOut(d.id, d.is_current)}
                    disabled={revokingId === d.id}
                  >
                    <Icon name="logOut" size={13} />
                    <span>{revokingId === d.id ? 'Signing out…' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Table View ── */}
      {!loading && viewMode === 'table' && filteredDevices.length > 0 && (
        <div className="opd-table-card">
          <table className="opd-table">
            <thead>
              <tr>
                <th>Hardware & Client</th>
                <th>Platform & Specs</th>
                <th>Trust Status</th>
                <th>Last Active Heartbeat</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedDevices.map((d) => {
                const parsed = parseUserAgent(d.user_agent);
                const isPhone = realDeviceType(d) !== 'desktop';

                return (
                  <tr
                    key={d.id}
                    className={d.is_current ? 'is-current' : ''}
                    onClick={() => openDetail(d)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: d.is_current ? 'var(--green-l)' : 'var(--bg)',
                            color: d.is_current ? 'var(--green)' : 'var(--ink)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={isPhone ? 'smartphone' : 'monitor'} size={17} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                            {d.device_label || `${parsed.browser} on ${parsed.os}`}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                            {parsed.browser} {parsed.browserVersion ? `v${parsed.browserVersion}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{parsed.os}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{formatArchitecture(d.client_hints)}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {d.is_current && (
                          <span className="opd-badge-current">
                            <span className="opd-live-pulse" style={{ width: 5, height: 5 }} />
                            This Device
                          </span>
                        )}
                        {d.trusted && (
                          <span className="opd-badge-trusted">
                            <Icon name="shield" size={10} />
                            Trusted
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {relTime(d.last_used_at)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          {fmtDateTime(d.last_used_at)}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => openDetail(d)}
                          style={{
                            background: 'var(--white)',
                            border: '1px solid var(--border)',
                            color: 'var(--ink)',
                            padding: '6px 12px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSignOut(d.id, d.is_current)}
                          style={{
                            background: 'var(--red-l)',
                            border: '1px solid var(--red)',
                            color: 'var(--red)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Sign Out
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination — shared by grid & table view ── */}
      {!loading && filteredDevices.length > DEVICES_PAGE_SIZE && (
        <div className="opd-pagination">
          <span className="opd-pagination-info">
            {page * DEVICES_PAGE_SIZE + 1}–{Math.min((page + 1) * DEVICES_PAGE_SIZE, filteredDevices.length)} of {filteredDevices.length} devices
          </span>
          <div className="opd-pagination-btns">
            <button
              type="button"
              className="opd-pagination-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              title="Previous page"
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <span className="opd-pagination-page">Page {page + 1} of {totalPages}</span>
            <button
              type="button"
              className="opd-pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              title="Next page"
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Redesigned Executive Device Details Modal ── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent style={{ maxWidth: 540, padding: 24 }}>
          {selected && selectedParsed && (
            <>
              <DialogHeader style={{ paddingBottom: 0 }}>
                <DialogTitle style={{ fontSize: 17, fontWeight: 700 }}>
                  Device Telemetry & Authorization
                </DialogTitle>
              </DialogHeader>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Hero Header */}
                <div className="opd-modal-hero">
                  <div className={`opd-modal-avatar ${selected.is_current ? 'current' : ''}`}>
                    <Icon
                      name={realDeviceType(selected) !== 'desktop' ? 'smartphone' : 'monitor'}
                      size={24}
                    />
                    {selected.is_current && (
                      <div
                        className="opd-card-online-dot"
                        style={{ bottom: -2, right: -2, width: 14, height: 14 }}
                      />
                    )}
                  </div>

                  <div className="opd-modal-title-area">
                    {renaming ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename();
                            if (e.key === 'Escape') setRenaming(false);
                          }}
                          className="input-field"
                          style={{
                            flex: 1,
                            fontSize: 13.5,
                            padding: '6px 10px',
                            border: '1.5px solid var(--teal)',
                            borderRadius: 6,
                          }}
                          placeholder="Enter recognizable device label"
                        />
                        <button
                          type="button"
                          onClick={saveRename}
                          disabled={saving}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'hsl(var(--primary-foreground))',
                            background: 'hsl(var(--primary))',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(false)}
                          style={{
                            fontSize: 12.5,
                            color: 'var(--ink3)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="opd-modal-title-row">
                        <span className="opd-modal-title">
                          {selected.device_label || `${selectedParsed.browser} on ${selectedParsed.os}`}
                        </span>
                        <button
                          type="button"
                          title="Rename this device"
                          className="opd-rename-btn"
                          onClick={() => {
                            setRenaming(true);
                            setRenameValue(
                              selected.device_label || `${selectedParsed.browser} on ${selectedParsed.os}`
                            );
                          }}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {selected.is_current ? (
                        <span className="opd-badge-current">
                          <span className="opd-live-pulse" style={{ width: 6, height: 6 }} />
                          Current Active Session
                        </span>
                      ) : (
                        <span className="opd-spec-chip" style={{ color: 'var(--ink2)' }}>
                          <Icon name="globe" size={11} />
                          Remote Session
                        </span>
                      )}

                      {selected.trusted && (
                        <span className="opd-badge-trusted">
                          <Icon name="shield" size={11} />
                          Trusted Hardware Entity
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2x2 Telemetry Matrix */}
                <div className="opd-modal-specs-grid">
                  <div className="opd-modal-spec-card">
                    <span className="opd-spec-title">Operating System</span>
                    <span className="opd-spec-val">{selectedParsed.os}</span>
                    <span className="opd-spec-sub">{formatArchitecture(selected.client_hints)}</span>
                  </div>

                  <div className="opd-modal-spec-card">
                    <span className="opd-spec-title">Browser & Engine</span>
                    <span className="opd-spec-val">
                      {selectedParsed.browser} {selectedParsed.browserVersion ? `v${selectedParsed.browserVersion}` : ''}
                    </span>
                    <span className="opd-spec-sub">Web Standards Compliant</span>
                  </div>

                  <div className="opd-modal-spec-card">
                    <span className="opd-spec-title">First Authorized</span>
                    <span className="opd-spec-val">{fmtDateTime(selected.created_at)}</span>
                    <span className="opd-spec-sub">Initial session issue</span>
                  </div>

                  <div className="opd-modal-spec-card">
                    <span className="opd-spec-title">Last Active Heartbeat</span>
                    <span className="opd-spec-val">{relTime(selected.last_used_at)}</span>
                    <span className="opd-spec-sub">{fmtDateTime(selected.last_used_at)}</span>
                  </div>
                </div>

                {/* Device Trust Banner — hr_devices.trusted is a real, admin-settable
                    flag, but it's organizational bookkeeping only: it isn't read by
                    the risk engine or the authz policy checks, and (unlike kycTier/
                    phoneTenure/authConsistency/mfaEnabled/passkeyRegistered) devices
                    aren't one of the signals computeTrustScore() weighs — see
                    /ondi/personal/trust, where this same fact is why "Review Active
                    Devices" is labelled "Not scored" rather than a real reference
                    card. This used to claim a flat, made-up "+90 Points" regardless
                    of what the real formula does. */}
                <div
                  style={{
                    background: 'var(--teal-l)',
                    border: '1px solid var(--teal)',
                    borderRadius: 10,
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
                      borderRadius: 8,
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
                      {selected.trusted ? 'Marked as trusted hardware' : 'Not marked as trusted hardware'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {selected.trusted
                        ? 'Your organization has flagged this device as trusted. This is informational and does not affect your Identity Trust Score.'
                        : 'Your organization has not flagged this device as trusted. Devices and sessions are not a scored input to your Identity Trust Score.'}
                    </span>
                  </div>
                </div>

                {/* Raw User Agent Inspector */}
                <div className="opd-ua-container">
                  <div className="opd-ua-header">
                    <span>Raw Client User-Agent</span>
                    <button
                      type="button"
                      className="opd-ua-copy-btn"
                      onClick={() => copyUserAgentString(selected.user_agent)}
                    >
                      <Icon name="copy" size={12} />
                      <span>{copiedUa ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="opd-ua-text">
                    {selected.user_agent || 'Mozilla/5.0 (Standard Web Session)'}
                  </div>
                </div>

                {/* Revocation Warning / Action */}
                <div className="opd-danger-box">
                  <div className="opd-danger-text">
                    {selected.is_current
                      ? 'Signing out of this device will end your active session immediately and return you to the login screen.'
                      : 'Revoking this authorization will invalidate all session tokens and require the device to authenticate again.'}
                  </div>
                </div>
              </div>

              <div className="opd-modal-footer">
                <button type="button" className="opd-btn-cancel" onClick={closeDetail}>
                  Close
                </button>
                <button
                  type="button"
                  className="opd-btn-danger-action"
                  onClick={() => handleSignOut(selected.id, selected.is_current)}
                >
                  <Icon name="logOut" size={14} />
                  <span>{selected.is_current ? 'Sign Out of Current Session' : 'Sign Out This Device'}</span>
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Sign Out Others Confirmation Modal ── */}
      <Dialog open={revokeConfirmModal} onOpenChange={setRevokeConfirmModal}>
        <DialogContent style={{ maxWidth: 440, padding: 24 }}>
          <DialogHeader>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--red-l)',
                color: 'var(--red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              <Icon name="alertTriangle" size={24} />
            </div>
            <DialogTitle style={{ fontSize: 18, fontWeight: 700 }}>
              Sign Out All Other Devices?
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
            <p>
              This will immediately revoke <strong>{otherDevicesCount} active remote session{otherDevicesCount > 1 ? 's' : ''}</strong> across other browsers, laptops, and mobile devices.
            </p>
            <div
              style={{
                background: 'var(--green-l)',
                border: '1px solid var(--green)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: 'var(--green)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="checkCircle" size={15} color="var(--green)" />
              <span>Your current active session on this device will remain safely signed in.</span>
            </div>
          </div>

          <div className="opd-modal-footer" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="opd-btn-cancel"
              onClick={() => setRevokeConfirmModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="opd-btn-danger-action"
              onClick={handleSignOutOthers}
              disabled={revokingOthers}
            >
              <Icon name="logOut" size={14} />
              <span>{revokingOthers ? 'Revoking…' : `Revoke ${otherDevicesCount} Session${otherDevicesCount > 1 ? 's' : ''}`}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OndiPersonalDevices;
