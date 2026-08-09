import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

interface ActivityItem {
  id: string;
  event_type: string;
  actor_name?: string;
  summary: string;
  created_at: string;
}

export function OnsiteActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/activity')
      .then((res: any) => setActivities(res.events || res.activity || []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Infrastructure Audit Feed</h1>
          <p>Real-time record of all configuration changes, DNS updates, and deployment events.</p>
        </div>
      </div>

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading audit log…</p>
        </div>
      ) : (
        <div className="onsite-card">
          {activities.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', padding: '1rem 0', margin: 0 }}>
              No audit events logged yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activities.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-subtle, #f8fafc)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Icon name="clock" size={16} style={{ color: 'var(--ink-muted)' }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.summary || a.event_type}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>By: {a.actor_name || 'System / User'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
