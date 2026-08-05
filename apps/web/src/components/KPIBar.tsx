import React from 'react';
import type { KPIResponse } from '@hudumika/types';

interface KPIBarProps {
  kpis: KPIResponse | null;
  onSelectMetric?: (metric: string | null) => void;
  selectedMetric?: string | null;
}

export const KPIBar: React.FC<KPIBarProps> = ({ kpis, onSelectMetric, selectedMetric }) => {
  if (!kpis) return null;

  const formatCurrency = (val: number) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M TZS`;
    }
    return `${val.toLocaleString()} TZS`;
  };

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
      label: 'Demurrage Risk',
      value: kpis.demurrage_risk,
      colorClass: 'r', // red
      bgClass: kpis.demurrage_risk > 0 ? 'alert' : '',
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
      id: 'exposure',
      label: 'Penalty Exposure',
      value: formatCurrency(kpis.penalty_exposure_tzs),
      colorClass: 'r',
      bgClass: kpis.penalty_exposure_tzs > 0 ? 'alert' : '',
    },
    {
      id: 'ontime',
      label: 'On-Time Rate',
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
