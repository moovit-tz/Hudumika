import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';

interface Issue {
  id: string; vehicle_id: string; title: string; description: string | null;
  severity: string; status: string; source: string;
  reported_by: string | null; reported_by_name: string | null;
  assigned_to: string | null; assigned_to_name: string | null; assigned_to_email: string | null;
  due_date: string | null; due_odometer_km: number | null;
  odometer_km: number | null; resolved_odometer_km: number | null;
  vehicle_name: string; vehicle_plate: string | null; vehicle_photo_url: string | null;
  created_at: string; resolved_at: string | null;
}

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 20 };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 };
const labelStyle: React.CSSProperties = { color: 'var(--ink3)', flexShrink: 0 };
const valueStyle: React.CSSProperties = { color: 'var(--ink)', fontWeight: 600, textAlign: 'right' };

const SEVERITY_CFG: Record<string, { color: string; bg: string }> = {
  LOW: { color: '#059669', bg: '#ecfdf5' }, MEDIUM: { color: '#ca8a04', bg: '#fef9c3' },
  HIGH: { color: '#ea580c', bg: '#ffedd5' }, CRITICAL: { color: '#dc2626', bg: '#fee2e2' },
};
const STATUS_CFG: Record<string, { color: string; bg: string; icon: IconName }> = {
  OPEN: { color: '#dc2626', bg: '#fee2e2', icon: 'alertTriangle' },
  IN_PROGRESS: { color: '#2563eb', bg: '#dbeafe', icon: 'clock' },
  RESOLVED: { color: '#059669', bg: '#ecfdf5', icon: 'checkCircle' },
};

function fdate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' at ' + new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function durationBetween(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return '—';
  const days = Math.floor(ms / 86_400_000);
  const hrs = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hrs) parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (!days && mins) parts.push(`${mins} min${mins === 1 ? '' : 's'}`);
  return parts.join(' ') || '< 1 min';
}

export const TrackingIssueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const [events, setEvents] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/issues/${id}`).then(setIssue).catch(() => setIssue(null)).finally(() => setLoading(false));
    apiFetch(`/v1/tracking/issues/${id}/events`).then(setEvents).catch(() => setEvents([]));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  async function resolve() {
    if (!id) return;
    setResolving(true);
    try { await apiFetch(`/v1/tracking/issues/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({}) }); reload(); }
    finally { setResolving(false); }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || !id) return;
    try {
      await apiFetch(`/v1/tracking/issues/${id}/events`, {
        method: 'POST',
        body: JSON.stringify({ event_type: 'COMMENTED', description: commentText })
      });
      setCommentText('');
      apiFetch(`/v1/tracking/issues/${id}/events`).then(setEvents);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Loading issue…</div>;
  if (!issue) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Issue not found.</div>;

  const sCfg = STATUS_CFG[issue.status] ?? STATUS_CFG.OPEN;
  const pCfg = SEVERITY_CFG[issue.severity] ?? SEVERITY_CFG.MEDIUM;
  const milesToResolve = issue.resolved_odometer_km != null && issue.odometer_km != null
    ? Math.max(0, Math.round((issue.resolved_odometer_km - issue.odometer_km) * 10) / 10) : null;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        crumbs={['HuduFreight', 'Issue']}
        titlePlain="Issue"
        titleEm="detail"
      />
      <Link to="/tracking/issues" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Issues
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{issue.title}</div>
        {issue.status !== 'RESOLVED' && (
          <button type="button" onClick={resolve} disabled={resolving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: resolving ? 0.6 : 1 }}>
            <Icon name="checkCircle" size={15} /> {resolving ? 'Resolving…' : 'Resolve'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Issue Details</div>

          <div style={rowStyle}><span style={labelStyle}>Issue #</span><span style={valueStyle}>{issue.id.slice(0, 8).toUpperCase()}</span></div>
          <div style={rowStyle}>
            <span style={labelStyle}>Status</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: sCfg.bg, color: sCfg.color }}>
              <Icon name={sCfg.icon} size={11} color={sCfg.color} /> {issue.status.replace('_', ' ')}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Priority</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: pCfg.color }}>
              <Icon name="barChart" size={13} color={pCfg.color} /> {issue.severity.charAt(0) + issue.severity.slice(1).toLowerCase()}
            </span>
          </div>
          <div style={rowStyle}><span style={labelStyle}>Summary</span><span style={valueStyle}>{issue.title}</span></div>
          {issue.description && (
            <div style={rowStyle}><span style={labelStyle}>Description</span><span style={{ ...valueStyle, fontWeight: 400, maxWidth: 320 }}>{issue.description}</span></div>
          )}
          <div style={rowStyle}>
            <span style={labelStyle}>Vehicle</span>
            <Link to={`/tracking/vehicles/${issue.vehicle_id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', fontWeight: 700 }}>
              {issue.vehicle_photo_url
                ? <img src={issue.vehicle_photo_url} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
                : <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="truck" size={13} color="var(--teal)" /></div>}
              {issue.vehicle_name}
            </Link>
          </div>
          <div style={rowStyle}><span style={labelStyle}>Reported Date</span><span style={valueStyle}>{fdate(issue.created_at)}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Reported by</span><span style={valueStyle}>{issue.reported_by_name || '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Odometer</span><span style={valueStyle}>{issue.odometer_km != null ? `${issue.odometer_km.toLocaleString()} km` : '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Source</span><span style={valueStyle}>{issue.source}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Assigned To</span><span style={valueStyle}>{issue.assigned_to_name || 'Unassigned'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Due Date</span><span style={valueStyle}>{fdate(issue.due_date)}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Due Odometer</span><span style={valueStyle}>{issue.due_odometer_km != null ? `${issue.due_odometer_km.toLocaleString()} km` : '—'}</span></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Resolution Details</div>
            <div style={rowStyle}><span style={labelStyle}>Resolved Date</span><span style={valueStyle}>{fdate(issue.resolved_at)}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Resolved Meter Entry</span><span style={valueStyle}>{issue.resolved_odometer_km != null ? `${issue.resolved_odometer_km.toLocaleString()} km` : '—'}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Time to Resolve</span><span style={valueStyle}>{issue.resolved_at ? durationBetween(issue.created_at, issue.resolved_at) : '—'}</span></div>
            <div style={rowStyle}><span style={labelStyle}>Miles to Resolve</span><span style={valueStyle}>{milesToResolve != null ? `${milesToResolve.toLocaleString()} km` : '—'}</span></div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Timeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {events.map((ev, i) => (
                <div key={ev.id} style={{ display: 'flex', gap: 10, position: 'relative' }}>
                  {i < events.length - 1 && <div style={{ position: 'absolute', left: 13, top: 26, bottom: -16, width: 2, background: 'var(--border)' }} />}
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: ev.event_type === 'RESOLVED' ? '#ecfdf5' : ev.event_type === 'OPENED' ? '#fef9c3' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <Icon name={ev.event_type === 'RESOLVED' ? 'checkCircle' : ev.event_type === 'OPENED' ? 'alertTriangle' : 'chatBubble'} size={13} color={ev.event_type === 'RESOLVED' ? '#059669' : ev.event_type === 'OPENED' ? '#ca8a04' : 'var(--ink3)'} />
                  </div>
                  <div style={{ flex: 1, paddingBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{ev.description}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {fdate(ev.created_at)} {ev.created_by_name ? `· ${ev.created_by_name}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={postComment} style={{ marginTop: 24, display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font)' }} />
              <button type="submit" disabled={!commentText.trim()} style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: '0 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: !commentText.trim() ? 0.6 : 1 }}>Post</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
