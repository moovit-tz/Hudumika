import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';

interface Issue {
  id: string; vehicle_id: string; title: string; severity: string; status: string;
  vehicle_name: string; vehicle_plate: string | null;
  assigned_to_name: string | null; due_date: string | null; created_at: string;
}

const SEVERITY_VARIANT: Record<string, 'success' | 'warning' | 'error'> = {
  LOW: 'success', MEDIUM: 'warning', HIGH: 'warning', CRITICAL: 'error',
};
const STATUS_VARIANT: Record<string, 'error' | 'info' | 'success'> = {
  OPEN: 'error', IN_PROGRESS: 'info', RESOLVED: 'success',
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
    <div style={{ padding: '0 0 24px'}}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Issues']}
            titlePlain="Reported"
            titleEm="issues"
            subtitle="Fleet-wide vehicle issue tracking"
          />
        </div>
        <Button asChild>
          <Link to="/tracking/issues/new"><Icon name="plus" size={15} /> Report Issue</Link>
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} variant="segmented">
        <TabsList style={{ marginBottom: 16 }}>
          {STATUS_FILTERS.map(s => (
            <TabsTrigger key={s} value={s}>
              {s === 'All' ? 'All' : s.replace('_', ' ')} <span style={{ fontWeight: 700 }}>{counts[s] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SectionCard>
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
              const sevVariant = SEVERITY_VARIANT[i.severity] ?? 'warning';
              const statVariant = STATUS_VARIANT[i.status] ?? 'error';
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
                    <Badge variant={sevVariant}>{i.severity}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={statVariant}>{i.status.replace('_', ' ')}</Badge>
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
      </SectionCard>
    </div>
  );
};
