import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PersonLink } from './PersonLink.js';

/**
 * What happened to one record, drawn the same way everywhere.
 *
 * Every list in the product this was compared against carries a per-record
 * activity trail; ours had none. It reads `domain_events` — the event bus the
 * apps already emit to — rather than a fourth activity table, so anything that
 * emits an event gets a trail without a line of new code, including apps added
 * later.
 */

interface Entry {
  id: string;
  event_type: string;
  source_app: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
}

/**
 * `hr.leave_requested` → "Leave requested". The app prefix is dropped because
 * the trail already sits on that app's record, and the underscores are an
 * implementation detail nobody reading a history cares about.
 */
function describe(eventType: string): string {
  const bare = eventType.includes('.') ? eventType.slice(eventType.indexOf('.') + 1) : eventType;
  const words = bare.replace(/[_.]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The payload's own fields, minus the ones the heading already said. */
function details(payload: Record<string, unknown> | null): [string, string][] {
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    // Ids are noise in a history — the interesting ones are already rendered as
    // a person or are the record you are looking at.
    .filter(([k]) => !/^(id|tenantId|userId|actorId|changedBy)$/.test(k))
    .slice(0, 6)
    .map(([k, v]) => [
      k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(),
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ]);
}

export function RecordActivity({ entityType, entityId, limit = 50, emptyText }: {
  entityType: string;
  entityId: string;
  limit?: number;
  emptyText?: string;
}) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    apiFetch(`/v1/activity/${entityType}/${entityId}?limit=${limit}`)
      .then(r => { if (alive) setRows(r ?? []); })
      // An empty trail and a failed request must not look the same.
      .catch(e => { if (alive) setError(e?.message ?? 'Could not load the activity trail.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [entityType, entityId, limit]);

  const shell: React.CSSProperties = {
    background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)',
  };

  if (loading) {
    return <div style={{ ...shell, padding: '40px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>;
  }
  if (error) {
    return (
      <div style={{ ...shell, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>The activity trail could not be loaded</div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink3)' }}>{error}</div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ ...shell, padding: '40px 24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
        {emptyText ?? 'Nothing has been recorded against this record yet.'}
      </div>
    );
  }

  return (
    <div style={{ ...shell, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', marginTop: 6, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{describe(r.event_type)}</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.source_app}</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 'auto' }} title={new Date(r.created_at).toLocaleString('en-GB')}>
                {when(r.created_at)}
              </span>
            </div>

            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {r.actor_id
                ? <PersonLink userId={r.actor_id} name={r.actor_name ?? 'Unknown'} size={20} />
                // Not "System": an older row simply never recorded who did it,
                // and claiming a background job did is a different assertion.
                : <span style={{ fontSize: 12, color: 'var(--ink4)' }}>No-one recorded</span>}
            </div>

            {details(r.payload).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {details(r.payload).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    {k} <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
