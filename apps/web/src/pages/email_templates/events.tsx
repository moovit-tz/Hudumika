import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Badge } from '../../components/ui/badge.js';
import { Input } from '../../components/ui/input.js';

interface CommEventRow {
  event_key: string;
  application: string;
  name: string;
  description: string;
  is_required: boolean;
  is_enabled: boolean;
  has_override: boolean;
}

/**
 * Which platform events send email for this workspace.
 *
 * This used to be Workspace Settings › Communications. It was removed from
 * Settings because templates live here, in Email — but the switches went with
 * it, leaving nowhere to turn an event off. GET /v1/comm/events lists every
 * registered event with this workspace's setting; PATCH turns one on or off.
 * Required events (password reset, sign-in links) cannot be switched off.
 */
export function NotificationEventsTab() {
  const { user } = useAuth();
  const canEdit = !!user && MGMT_ROLES.includes(user.role);
  const [events, setEvents] = useState<CommEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    apiFetch('/v1/comm/events')
      .then((rows: CommEventRow[]) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => showAlert('Could not load notification events.', { variant: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(ev: CommEventRow, enabled: boolean) {
    if (ev.is_required || !canEdit) return;
    setSaving(ev.event_key);
    setEvents(prev => prev.map(e => e.event_key === ev.event_key ? { ...e, is_enabled: enabled } : e));
    try {
      await apiFetch(`/v1/comm/events/${encodeURIComponent(ev.event_key)}`, { method: 'PATCH', body: JSON.stringify({ is_enabled: enabled }) });
    } catch (err: any) {
      setEvents(prev => prev.map(e => e.event_key === ev.event_key ? { ...e, is_enabled: !enabled } : e));
      showAlert(err?.message || 'Could not update this event.', { variant: 'error' });
    } finally {
      setSaving(null);
    }
  }

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const shown = q
      ? events.filter(e => `${e.name} ${e.description} ${e.application} ${e.event_key}`.toLowerCase().includes(q))
      : events;
    const byApp = new Map<string, CommEventRow[]>();
    for (const e of shown) byApp.set(e.application, [...(byApp.get(e.application) ?? []), e]);
    return [...byApp.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, filter]);

  if (loading) return <SectionLoading />;

  return (
    // Same side inset as the page header above it.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink2)', maxWidth: 640 }}>
          Choose which platform events send an email from this workspace. Each event uses its template from
          My Templates. {canEdit ? '' : 'Only managers and administrators can change these.'}
        </p>
        <Input
          aria-label="Filter events"
          placeholder="Filter events…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: 240, maxWidth: '100%' }}
        />
      </div>
      {groups.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink3)' }}>No events match “{filter}”.</p>
      )}
      {groups.map(([app, rows]) => (
        <SectionCard key={app} title={app}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map(ev => (
              <SwitchRow
                key={ev.event_key}
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {ev.name}
                    {ev.is_required && <Badge variant="gray">Always sent</Badge>}
                    {ev.has_override && !ev.is_required && <Badge variant="brand">Customised</Badge>}
                  </span>
                }
                description={ev.description}
                checked={ev.is_required || ev.is_enabled}
                disabled={ev.is_required || !canEdit || saving === ev.event_key}
                onCheckedChange={checked => toggle(ev, checked)}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
