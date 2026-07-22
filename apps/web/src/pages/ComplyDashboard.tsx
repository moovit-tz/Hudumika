import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyDashboard, useComplyApplications, useComplyProfile } from '../hooks/useComply.js';
import './ComplyOS.css';

// agency-code → class name mapping (gov | tax | social | reg | fin)
const AGENCY_CLASS: Record<string, string> = {
  BRELA: 'gov', TRA: 'tax', NSSF: 'social', WCF: 'social',
  NHIF: 'social', OSHA: 'reg', TBS: 'reg', TFDA: 'reg',
  CMSA: 'fin', BOT: 'fin', NEMC: 'reg',
};

function agencyClass(code: string) {
  return AGENCY_CLASS[code.toUpperCase()] ?? 'gov';
}

// ── Health gauge ──────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? 'var(--comply)' : score >= 60 ? 'var(--legal)' : 'var(--red)';
  return (
    <div className="comply-health-gauge">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          className="comply-gauge-arc"
        />
      </svg>
      <div className="comply-health-num">
        <span className="comply-health-pct">{score}</span>
        <span className="comply-health-pct-sign">%</span>
      </div>
    </div>
  );
}

function daysKind(days: number): 'urgent' | 'soon' | 'ok' {
  if (days <= 7)  return 'urgent';
  if (days <= 30) return 'soon';
  return 'ok';
}

// ── Component ─────────────────────────────────────────────────
export function ComplyDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useComplyDashboard();
  const { apps, loading: appsLoading } = useComplyApplications();
  const { profile, loading: profileLoading } = useComplyProfile();

  const score = data?.health_score ?? 0;
  const recentApps = apps.slice(0, 5);

  return (
    <div className="comply-page">
      {/* Header */}
      <div className="comply-page-hdr">
        <div>
          <h1 className="comply-page-title">Compliance Overview</h1>
          <p className="comply-page-sub">Live data · Tanzania · East Africa</p>
        </div>
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={refresh} title="Refresh">
            <Icon name="refresh" size={14} />
          </button>
          <button type="button" className="comply-btn-secondary" onClick={() => navigate('/complyos/obligation-scan')}>
            <Icon name="sparkle" size={14} />
            AI Obligation Scan
          </button>
          <Link to="/complyos/brela-search" className="comply-btn-secondary">
            <Icon name="search" size={14} />
            BRELA Search
          </Link>
          <Link to="/complyos/applications" className="comply-btn-primary">
            <Icon name="plus" size={14} />
            New Application
          </Link>
        </div>
      </div>

      {!profileLoading && !profile && (
        <div className="comply-note" style={{ marginBottom: 16 }}>
          <Icon name="sparkle" size={16} />
          <span>You haven't run an AI Obligation Scan yet — tell us your sector and we'll map the certifications your business needs. </span>
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => navigate('/complyos/obligation-scan')}>Run Scan</button>
        </div>
      )}

      {error && (
        <div className="comply-note comply-note--error">
          Failed to load compliance data: {error}
        </div>
      )}

      {/* KPIs */}
      <div className="comply-kpis">
        <div className="comply-kpi">
          <div className="comply-kpi-val">{loading ? '—' : data?.active_certs ?? 0}</div>
          <div className="comply-kpi-label">Active Certificates</div>
        </div>
        <div className="comply-kpi">
          <div className={`comply-kpi-val${(data?.expiring_soon ?? 0) > 0 ? ' comply-kpi-delta--warn' : ''}`}>
            {loading ? '—' : data?.expiring_soon ?? 0}
          </div>
          <div className="comply-kpi-label">Expiring in 30 Days</div>
        </div>
        <div className="comply-kpi">
          <div className="comply-kpi-val">{loading ? '—' : data?.pending_apps ?? 0}</div>
          <div className="comply-kpi-label">Pending Applications</div>
        </div>
        <div className="comply-kpi">
          <div className={`comply-kpi-val${(data?.overdue ?? 0) > 0 ? ' comply-kpi-delta--danger' : ''}`}>
            {loading ? '—' : data?.overdue ?? 0}
          </div>
          <div className="comply-kpi-label">Overdue / Lapsed</div>
        </div>
      </div>

      {/* Health + Deadlines row */}
      <div className="comply-grid-2 comply-mb-24">
        {/* Compliance health */}
        <div className="comply-card">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">Compliance Health Score</h3>
            <span className={`comply-badge ${score >= 80 ? 'comply-badge--active' : score >= 60 ? 'comply-badge--pending' : 'comply-badge--expired'}`}>
              {score >= 80 ? 'Healthy' : score >= 60 ? 'Needs Attention' : 'At Risk'}
            </span>
          </div>
          <div className="comply-card-body">
            <div className="comply-health-wrap">
              <HealthGauge score={score} />
              <div className="comply-health-info">
                <div className="comply-health-title">{score}% Compliant</div>
                <div className="comply-health-sub">
                  {data
                    ? `${data.active_certs} of ${data.active_certs + data.overdue} required certifications active. ${data.expiring_soon > 0 ? `${data.expiring_soon} expiring within 30 days.` : ''}`
                    : 'Loading compliance data…'}
                </div>
                <Link to="/complyos/obligations" className="comply-btn-secondary comply-btn-sm">
                  View all obligations
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div className="comply-card">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">Upcoming Deadlines</h3>
            <Link to="/complyos/calendar" className="comply-btn-secondary comply-btn-sm">
              <Icon name="calendar" size={12} /> Calendar
            </Link>
          </div>
          <div className="comply-deadline-list">
            {loading && <div className="comply-empty-hint">Loading…</div>}
            {!loading && (data?.upcoming_deadlines ?? []).length === 0 && (
              <div className="comply-empty-hint">No deadlines in the next 90 days.</div>
            )}
            {(data?.upcoming_deadlines ?? []).map(d => {
              const date = new Date(d.expiry_date);
              return (
                <div key={d.cert_id} className="comply-deadline-row">
                  <div className="comply-deadline-date">
                    <div className="comply-deadline-day">{String(date.getDate()).padStart(2, '0')}</div>
                    <div className="comply-deadline-month">{date.toLocaleString('en', { month: 'short' })}</div>
                  </div>
                  <div className="comply-deadline-info">
                    <div className="comply-deadline-name">{d.cert_name}</div>
                    <div className="comply-deadline-agency">{d.agency_code}</div>
                  </div>
                  <div className={`comply-deadline-days comply-deadline-days--${daysKind(d.days_left)}`}>
                    {d.days_left <= 0 ? 'Overdue' : d.days_left === 1 ? 'Tomorrow' : `${d.days_left}d`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Applications */}
      <div className="comply-card comply-mb-24">
        <div className="comply-card-hdr">
          <h3 className="comply-card-title">Recent Applications</h3>
          <Link to="/complyos/applications" className="comply-btn-secondary comply-btn-sm">
            View all
          </Link>
        </div>
        <div className="comply-card-body">
          <table className="comply-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Certification</th>
                <th>Agency</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {appsLoading && (
                <tr><td colSpan={5} className="comply-td-muted">Loading applications…</td></tr>
              )}
              {!appsLoading && recentApps.length === 0 && (
                <tr><td colSpan={5} className="comply-td-muted">No applications yet. Start one from Applications.</td></tr>
              )}
              {recentApps.map(a => (
                <tr key={a.id} className="comply-tr-click" onClick={() => navigate('/complyos/applications')}>
                  <td className="comply-td-mono"><Link to="/complyos/applications" style={{ color: 'inherit', textDecoration: 'none' }}>{a.app_number}</Link></td>
                  <td><div className="comply-table-name">{a.cert_type}</div></td>
                  <td><span className={`comply-agency comply-agency--${agencyClass(a.agency_code)}`}>{a.agency_code}</span></td>
                  <td><span className={`comply-badge comply-badge--${a.status}`}>{a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span></td>
                  <td className="comply-td-muted">{new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent API syncs */}
      {data && data.recent_syncs.length > 0 && (
        <div className="comply-card">
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">Recent Agency Syncs</h3>
          </div>
          <div className="comply-card-body">
            <table className="comply-table">
              <thead>
                <tr><th>Agency</th><th>Status</th><th>Last Synced</th></tr>
              </thead>
              <tbody>
                {data.recent_syncs.map((s, i) => (
                  <tr key={i}>
                    <td className="comply-td-mono">{s.agency_code}</td>
                    <td><span className={`comply-badge comply-badge--${s.status === 'success' ? 'active' : s.status === 'partial' ? 'pending' : 'expired'}`}>{s.status}</span></td>
                    <td className="comply-td-muted">{new Date(s.synced_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
