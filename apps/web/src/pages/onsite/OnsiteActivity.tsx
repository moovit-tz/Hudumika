import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

interface ActivityItem {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  actor_name: string | null;
  created_at: string;
}

/** event_type is a free-form 'onsite.<noun>.<verb>' string, not a label —
 *  this turns it into what a person reads, using whatever payload fields
 *  the emitting route actually sent rather than inventing new ones. */
function describe(a: ActivityItem): string {
  const p = a.payload ?? {};
  const name = (p.domain ?? p.name) as string | undefined;
  switch (a.event_type) {
    case 'onsite.domain.created': return `Domain ${name ?? ''} added`;
    case 'onsite.domain.updated': return `Domain ${name ?? ''} updated`;
    case 'onsite.domain.deleted': return `Domain ${name ?? ''} removed`;
    case 'onsite.dns_record.created': return `DNS record ${p.dns_type ?? ''} ${p.name ?? ''} added`;
    case 'onsite.dns_record.deleted': return `DNS record ${p.dns_type ?? ''} ${p.name ?? ''} removed`;
    case 'onsite.application.created': return `Application ${name ?? ''} created`;
    case 'onsite.deployment.triggered': return `Deployment triggered on branch ${p.branch ?? '?'} via ${p.ci_provider ?? 'CI'}`;
    case 'onsite.server.created': return `Server ${name ?? ''} added`;
    case 'onsite.server.deleted': return `Server ${name ?? ''} removed`;
    case 'onsite.website.created': return `Website ${name ?? ''} added`;
    case 'onsite.website.deleted': return `Website ${name ?? ''} removed`;
    case 'onsite.backup.created': return 'Configuration backup created';
    case 'onsite.backup.restored': return 'Configuration backup restored';
    default: return a.event_type;
  }
}

export function OnsiteActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    apiFetch('/v1/activity?source_app=onsite')
      .then((res: any) => setActivities(Array.isArray(res) ? res : []))
      .catch((err: any) => {
        // A 403 (not an admin) must not look identical to "nothing has
        // happened yet" — the message text is the only signal apiFetch's
        // thrown Error carries through.
        if (/403|permission|forbidden/i.test(err?.message ?? '')) setForbidden(true);
        setActivities([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="onsite-page">
      <PageHeader
        crumbs={['Onsite', 'Activity']}
        titlePlain="Infrastructure"
        titleEm="audit"
        subtitle="Real-time record of domain, DNS, application, server, website and backup changes made in Onsite."
      />

      {loading ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)' }}>Loading audit log…</p>
        </div>
      ) : forbidden ? (
        <div className="onsite-card">
          <p style={{ color: 'var(--ink-muted)', padding: '1rem 0', margin: 0 }}>
            You don't have permission to view this workspace's audit feed — it's restricted to SUPER_ADMIN, ADMIN and TENANT_ADMIN.
          </p>
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
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{describe(a)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>By: {a.actor_name || 'System'}</div>
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
