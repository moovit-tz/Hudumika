import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';

interface Issue {
  id: string; vehicle_id: string; title: string; severity: string; status: string;
  vehicle_name: string; vehicle_plate: string | null;
  assigned_to_name: string | null; due_date: string | null; created_at: string;
}

const SEVERITY_CFG: Record<string, { color: string; bg: string }> = {
  LOW: { color: '#059669', bg: 'rgba(22,163,74,0.14)' }, MEDIUM: { color: '#ca8a04', bg: 'rgba(202,138,4,0.14)' },
  HIGH: { color: '#ea580c', bg: 'rgba(234,88,12,0.14)' }, CRITICAL: { color: '#dc2626', bg: 'rgba(220,38,38,0.14)' },
};
const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  OPEN: { color: '#dc2626', bg: 'rgba(220,38,38,0.14)' }, IN_PROGRESS: { color: '#2563eb', bg: 'rgba(37,99,235,0.14)' }, RESOLVED: { color: '#059669', bg: 'rgba(22,163,74,0.14)' },
};
const STATUS_FILTERS = ['All', 'OPEN', 'IN_PROGRESS', 'RESOLVED'];

export const TrackingIssues: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/issues').then(setIssues).catch(() => setIssues([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = statusFilter === 'All' ? issues : issues.filter(i => i.status === statusFilter);
  const counts: Record<string, number> = { All: issues.length };
  for (const s of ['OPEN', 'IN_PROGRESS', 'RESOLVED']) counts[s] = issues.filter(i => i.status === s).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Issues']}
            titlePlain="Reported"
            titleEm="issues"
            subtitle="Fleet-wide vehicle issue tracking"
          />
        </div>
        <Link to="/tracking/issues/new"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>
          <Icon name="plus" size={15} /> Report Issue
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${statusFilter === s ? 'var(--teal)' : 'var(--border)'}`, background: statusFilter === s ? 'var(--teal-l)' : 'var(--white)', color: statusFilter === s ? 'var(--teal)' : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
            {s === 'All' ? 'All' : s.replace('_', ' ')} <span style={{ fontWeight: 700 }}>{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Title', 'Vehicle', 'Priority', 'Status', 'Assigned To', 'Reported', 'Due'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.map(i => {
              const pCfg = SEVERITY_CFG[i.severity] ?? SEVERITY_CFG.MEDIUM;
              const sCfg = STATUS_CFG[i.status] ?? STATUS_CFG.OPEN;
              return (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    <Link to={`/tracking/issues/${i.id}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}>
                      {i.title}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{i.vehicle_name}{i.vehicle_plate ? ` (${i.vehicle_plate})` : ''}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pCfg.color }}>{i.severity}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: sCfg.bg, color: sCfg.color }}>{i.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{i.assigned_to_name || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{new Date(i.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink3)' }}>{i.due_date ? new Date(i.due_date).toLocaleDateString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No issues match this filter.</div>
        )}
      </div>
    </div>
  );
};
