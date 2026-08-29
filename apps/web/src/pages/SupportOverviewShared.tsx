// Shared data hook + small UI atoms used by SupportOverview.tsx,
// SupportAnalytics.tsx and SupportTeam.tsx — these were originally three tabs
// of one component; split into separate pages/routes but still share the
// same ticket+metrics fetch and the same KPI-card/section-header/bar-row look.
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

export type StatusKey   = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type PriorityKey = 'LOW'  | 'MEDIUM'      | 'HIGH'      | 'URGENT';

export interface Ticket {
  id: string; ref: string; customer: string; category: string | null;
  status: StatusKey; priority: PriorityKey; assigned_to: string | null;
  created_at: string; updated_at?: string;
}

export interface AgentStat {
  id: string; name: string; assigned: number; resolved: number; open: number;
  avgResolutionHours: number | null; csat: number | null; resolutionRate: number;
}

export function useSupportMetrics() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const buildTickets = useCallback((data: any[]): Ticket[] =>
    data.slice(0, 200).map((s: any): Ticket => ({
      id: s.id,
      ref: s.ref || s.ref_number || s.id,
      customer: s.customer ?? s.customer_name ?? 'Unknown',
      category: s.category || null,
      status: s.status as StatusKey,
      priority: s.priority as PriorityKey,
      assigned_to: s.assigned_to || null,
      created_at: s.created_at,
      updated_at: s.updated_at || s.created_at,
    })), []);

  useEffect(() => {
    apiFetch('/v1/support/tickets')
      .then((r: any) => setTickets(buildTickets(r.data ?? r ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [buildTickets]);

  useEffect(() => {
    setMetricsLoading(true);
    apiFetch(`/v1/support/metrics?period=${period}`)
      .then((r: any) => setMetrics(r))
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, [period]);

  return { period, setPeriod, tickets, loading, metrics, metricsLoading };
}

export function PeriodSwitcher({ period, setPeriod }: { period: '7d' | '30d' | '90d'; setPeriod: (p: '7d' | '30d' | '90d') => void }) {
  return (
    <>
      {(['7d', '30d', '90d'] as const).map(p => (
        <button key={p} type="button" onClick={() => setPeriod(p)}
          className={`sov-period-btn${period === p ? ' sov-period-btn--active' : ''}`}>
          {p}
        </button>
      ))}
    </>
  );
}

export function KpiCard({ icon, label, value, sub, color, iconBg, trend, trendUp }: {
  icon: IconName; label: string; value: string; sub?: string;
  color: string; iconBg: string; trend?: string; trendUp?: boolean;
}) {
  return (
    <div className="sov-kpi">
      <div className="sov-kpi-top">
        <div className="sov-kpi-icon" style={{ background: iconBg }}>
          <Icon name={icon} size={18} strokeWidth={1.75} style={{ color } as React.CSSProperties} />
        </div>
        {trend && (
          <span className={`sov-kpi-trend${trendUp ? ' sov-kpi-trend--up' : ' sov-kpi-trend--down'}`}>
            <Icon name={trendUp ? 'arrowUp' : 'arrowDown'} size={9} strokeWidth={2.5} />{trend}
          </span>
        )}
      </div>
      <div className="sov-kpi-value">{value}</div>
      <div className="sov-kpi-label">{label}</div>
      {sub && <div className="sov-kpi-sub">{sub}</div>}
    </div>
  );
}

export function SHdr({ title, action, to }: { title: string; action?: string; to?: string }) {
  return (
    <div className="sov-shdr">
      <div className="sov-shdr-title">{title}</div>
      {action && to && <Link to={to} className="sov-shdr-action">{action} →</Link>}
    </div>
  );
}

export function StatRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="sov-stat-row">
      <div className="sov-stat-row-top">
        <span className="sov-stat-row-label">{label}</span>
        <span className="sov-stat-row-value" style={{ color }}>{value} <span className="sov-stat-row-pct">({pct}%)</span></span>
      </div>
      <div className="sov-bar-track"><div className="sov-bar-fill" style={{ background: color, width: `${pct}%` }} /></div>
    </div>
  );
}

export function Av({ name, userId, size = 30 }: { name: string; userId?: string; size?: number }) {
  return <PersonAvatar userId={userId} name={name} size={size} />;
}
