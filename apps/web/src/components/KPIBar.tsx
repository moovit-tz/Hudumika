import React from 'react';
import type { KPIResponse } from '@hudumika/types';

interface KPIBarProps {
  kpis: KPIResponse | null;
  onSelectMetric?: (metric: string | null) => void;
  selectedMetric?: string | null;
}

export const KPIBar: React.FC<KPIBarProps> = ({ kpis, onSelectMetric, selectedMetric }) => {
  if (!kpis) return null;

  const items = [
    {
      id: 'active',
      label: 'Active Cases',
      value: kpis.active_cases,
      colorClass: 't', // teal
      bgClass: '',
    },
    {
      id: 'demurrage',
      label: 'Free Time Due ≤48h',
      value: kpis.free_time_due_48h,
      colorClass: 'r', // red
      bgClass: kpis.free_time_due_48h > 0 ? 'alert' : '',
    },
    {
      id: 'sla',
      label: 'SLA Breached',
      value: kpis.sla_breached,
      colorClass: 'a', // amber
      bgClass: kpis.sla_breached > 0 ? 'warn' : '',
    },
    {
      id: 'delivered',
      label: 'Delivered Today',
      value: kpis.delivered_today,
      colorClass: 'g', // green
      bgClass: '',
    },
    {
      id: 'overdue',
      label: 'Free Time Overdue',
      value: kpis.free_time_overdue,
      colorClass: 'r',
      bgClass: kpis.free_time_overdue > 0 ? 'alert' : '',
    },
    {
      id: 'ontime',
      label: 'SLA-Compliant Close Rate',
      value: kpis.on_time_rate_pct == null ? '—' : `${kpis.on_time_rate_pct}%`,
      colorClass: 'g',
      bgClass: '',
    },
  ];

  return (
    <div
      className="kpi-bar"
      style={{
        display: 'flex',
        background: 'var(--white)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {items.map((item) => {
        const isSelected = selectedMetric === item.id;
        return (
          <div
            key={item.id}
            onClick={() => onSelectMetric?.(isSelected ? null : item.id)}
            className={`kpi-cell ${item.bgClass}`}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '12px 18px',
              borderRight: '1px solid var(--border)',
              cursor: 'pointer',
              background: isSelected ? 'var(--teal-l)' : undefined,
              transition: 'background 0.15s ease',
            }}
          >
            <div className={`kv ${item.colorClass}`} style={{ fontSize: '20px', fontWeight: 700 }}>
              {item.value}
            </div>
            <div className="kl" style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
