import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';

interface LoginEvent {
  id: string; ip: string | null; user_agent: string | null;
  status: 'SUCCESS' | 'FAILED'; created_at: string; user_name: string;
}

export const OneIdLoginActivity: React.FC = () => {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/oneid/login-history').then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        crumbs={['OneID', 'Login activity']}
        titlePlain="Login"
        titleEm="activity"
        subtitle="Recent sign-in attempts across this tenant."
      />

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['User', 'IP address', 'Device', 'Status', 'When'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && events.map(e => (
              <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{e.user_name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{e.ip || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.user_agent || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: e.status === 'SUCCESS' ? '#ecfdf5' : '#fee2e2', color: e.status === 'SUCCESS' ? '#065f46' : '#991b1b' }}>
                    {e.status === 'SUCCESS' ? 'Success' : 'Failed'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && events.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No login activity recorded yet.</div>
        )}
      </div>
    </div>
  );
};
