import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
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

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Login Activity']}
        titlePlain="Login"
        titleEm="activity"
        subtitle="Recent sign-in attempts across this tenant."
      />

      <SectionCard padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                {['User', 'IP Address', 'Device / Browser', 'Status', 'When'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && events.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>{e.user_name}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{e.ip || '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--ink3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_agent || '—'}>
                    {e.user_agent || '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 10px',
                      background: e.status === 'SUCCESS' ? '#ecfdf5' : '#fee2e2',
                      color: e.status === 'SUCCESS' ? '#047857' : '#b91c1c'
                    }}>
                      {e.status === 'SUCCESS' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && events.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No login activity recorded yet for this workspace.</div>
        )}
      </SectionCard>
    </div>
  );
};

export default OndiLoginActivity;
