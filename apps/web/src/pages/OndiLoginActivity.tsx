import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface LoginEvent {
  id: string; ip: string | null; user_agent: string | null;
  status: 'SUCCESS' | 'FAILED'; created_at: string; user_name: string;
}

export const OndiLoginActivity: React.FC = () => {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/ondi/login-history').then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false));
  }, []);

  const successCount = events.filter(e => e.status === 'SUCCESS').length;
  const failedCount = events.filter(e => e.status === 'FAILED').length;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Login Activity']}
        titlePlain="Login"
        titleEm="activity"
        subtitle="Real-time log of authentication attempts across all accounts in this tenant."
      />

      {/* KPI Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Total Sign-Ins</span>
            <div className="ondi-kpi-icon-box"><Icon name="logIn" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{events.length}</span>
            <span className="ondi-kpi-sub">recorded attempts</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Successful Logins</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}><Icon name="checkCircle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{successCount}</span>
            <span className="ondi-kpi-sub">successful sign-ins</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Failed Attempts</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fef2f2', color: '#b91c1c' }}><Icon name="alertTriangle" size={18} /></div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b91c1c' }}>{failedCount}</span>
            <span className="ondi-kpi-sub">authentication failures</span>
          </div>
        </div>
      </div>

      <SectionCard padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table className="ondi-table">
            <thead>
              <tr>
                <th>User</th>
                <th>IP Address</th>
                <th>Device / User-Agent</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {!loading && events.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.user_name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink2)' }}>{e.ip || '—'}</td>
                  <td style={{ color: 'var(--ink3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_agent || '—'}>
                    {e.user_agent || '—'}
                  </td>
                  <td>
                    <span className={`ondi-status-pill ${e.status === 'SUCCESS' ? 'success' : 'error'}`}>
                      <span className="ondi-status-dot" />
                      {e.status === 'SUCCESS' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--ink3)', fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && events.length === 0 && (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No login activity recorded yet for this workspace.</div>
        )}
      </SectionCard>
    </div>
  );
};

export default OndiLoginActivity;
