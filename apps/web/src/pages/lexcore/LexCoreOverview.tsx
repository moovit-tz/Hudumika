import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const STATUS_V: Record<string, 'info' | 'brand' | 'warning' | 'gray'> = {
  open: 'info', active: 'brand', on_hold: 'warning', closed: 'gray', archived: 'gray',
};

interface Matter { id: string; matter_number: string; title: string; status: string; client_name: string; created_at: string; }
interface TimeRow { hours: number; entry_date: string; }
interface Deadline { id: string; description: string; due_date: string; is_critical: boolean; }

export function LexCoreOverview() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [hours, setHours] = useState(0);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/legal/matters?limit=10'),
      apiFetch('/v1/legal/time?limit=200'),
      apiFetch('/v1/legal/deadlines?upcoming=true'),
    ]).then(([m, t, d]) => {
      setMatters(m.rows ?? []);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const hrs = (t.rows ?? []).filter((r: TimeRow) => r.entry_date >= monthStart).reduce((s: number, r: TimeRow) => s + (r.hours || 0), 0);
      setHours(Math.round(hrs * 10) / 10);
      setDeadlines(Array.isArray(d) ? d : []);
    }).finally(() => setLoading(false));
  }, []);

  const openCount = matters.filter(m => m.status === 'open' || m.status === 'active').length;

  if (loading) return <div className="page-layout"><PageHeader crumbs={['LexCore']} titlePlain="Legal practice" titleEm="management" subtitle="Matters, time entries, trust accounts, conflicts and court calendar." /><SectionLoading /></div>;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore']}
        titlePlain="Legal practice"
        titleEm="management"
        subtitle="Matters, time entries, trust accounts, conflicts and court calendar."
      />

      <div className="lc-stat-grid">
        <div className="lc-stat"><div className="lc-stat-val">{openCount}</div><div className="lc-stat-lbl">Open matters</div></div>
        <div className="lc-stat"><div className="lc-stat-val">{hours}h</div><div className="lc-stat-lbl">Billable hours this month</div></div>
        <div className="lc-stat"><div className="lc-stat-val">{deadlines.length}</div><div className="lc-stat-lbl">Upcoming deadlines</div></div>
      </div>

      <SectionCard padded={false}>
        <div style={{ padding: '16px 20px 8px', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Recent Matters</div>
        {matters.length === 0 ? <div className="lc-empty">No matters yet.</div> : (
          <table className="lc-table">
            <thead><tr><th>Number</th><th>Title</th><th>Client</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>
              {matters.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{m.matter_number}</td>
                  <td style={{ fontWeight: 600 }}><Link to="/lexcore/matters" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{m.title}</Link></td>
                  <td>{m.client_name || '—'}</td>
                  <td><Badge variant={STATUS_V[m.status] ?? 'gray'}>{m.status.replace(/_/g, ' ')}</Badge></td>
                  <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
