import React, { useState } from 'react';
import { MetricsRow, spark } from '../components/MetricCard.js';

const SAMPLE = [
  { id: '1', ref: 'CTR-2024-001', customer: 'Dangote Industries', type: 'Service Agreement', value: 85000000, status: 'ACTIVE', start: '2024-01-01', end: '2024-12-31' },
  { id: '2', ref: 'CTR-2024-002', customer: 'Twiga Foods',         type: 'Annual Retainer',  value: 42000000, status: 'ACTIVE', start: '2024-03-01', end: '2025-02-28' },
  { id: '3', ref: 'CTR-2024-003', customer: 'Azam Group',          type: 'Per-Shipment',     value: 12000000, status: 'PENDING',start: '2024-06-01', end: '2024-11-30' },
  { id: '4', ref: 'CTR-2023-008', customer: 'TBL Breweries',       type: 'Service Agreement', value: 60000000, status: 'EXPIRED', start: '2023-01-01', end: '2023-12-31' },
];

const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  ACTIVE:  { cls: 'badge-teal',   label: 'Active' },
  PENDING: { cls: 'badge-gold',   label: 'Pending' },
  EXPIRED: { cls: 'badge-grey',   label: 'Expired' },
  DRAFT:   { cls: 'badge-purple', label: 'Draft' },
};

export const Contracts: React.FC = () => {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const list = filter ? SAMPLE.filter(c => c.status === filter) : SAMPLE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Contracts</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Customer service agreements and retainers</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm">+ New Contract</button>
      </div>

      {/* KPI */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <MetricsRow cards={[
          {
            title: 'Total Contracts',
            value: String(SAMPLE.length),
            trend: 7.5,
            sub1Label: 'ACTIVE', sub1Value: String(SAMPLE.filter(c => c.status === 'ACTIVE').length),
            sub2Label: 'PENDING', sub2Value: String(SAMPLE.filter(c => c.status === 'PENDING').length),
            bars: spark(50, 15, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
          },
          {
            title: 'Active Value',
            value: `TZS ${(SAMPLE.filter(c => c.status === 'ACTIVE').reduce((s, c) => s + c.value, 0) / 1_000_000).toFixed(1)}M`,
            trend: 12.1,
            sub1Label: 'RETAINERS', sub1Value: String(SAMPLE.filter(c => c.type === 'Annual Retainer').length),
            sub2Label: 'PER SHIPMENT', sub2Value: String(SAMPLE.filter(c => c.type === 'Per-Shipment').length),
            bars: spark(51, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
          },
          {
            title: 'Expired',
            value: String(SAMPLE.filter(c => c.status === 'EXPIRED').length),
            trend: -2.3,
            invertTrend: true,
            sub1Label: 'RENEWAL DUE', sub1Value: String(SAMPLE.filter(c => c.status === 'PENDING').length),
            sub2Label: 'RENEWAL RATE', sub2Value: '82%',
            bars: spark(52, 15, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)',
          },
        ]} />
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {['', 'ACTIVE', 'PENDING', 'EXPIRED', 'DRAFT'].map(s => (
          <button type="button" key={s || 'ALL'} className={`fc${filter === s ? ' on' : ''}`} onClick={() => setFilter(s)}>{s || 'All'}</button>
        ))}
      </div>

      {/* Table hdr */}
      <div style={{ display: 'flex', padding: '6px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {['Reference', 'Customer', 'Type', 'Value (TZS)', 'Period', 'Status'].map(h => (
          <div key={h} className="th" style={{ flex: h === 'Customer' || h === 'Type' ? 2 : 1 }}>{h}</div>
        ))}
      </div>

      <div className="scroll-body">
        {list.map(c => (
          <div
            key={c.id}
            onClick={() => setSelected(c)}
            style={{
              display: 'flex', alignItems: 'center', padding: '11px 20px',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              background: selected?.id === c.id ? 'var(--teal-l)' : '#fff',
            }}
          >
            <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>{c.ref}</div>
            <div style={{ flex: 2, fontSize: 13, fontWeight: 600 }}>{c.customer}</div>
            <div style={{ flex: 2, fontSize: 12, color: 'var(--ink2)' }}>{c.type}</div>
            <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{c.value.toLocaleString()}</div>
            <div style={{ flex: 1, fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>
              {c.start} → {c.end}
            </div>
            <div style={{ flex: 1 }}>
              <span className={`badge ${STATUS_CFG[c.status]?.cls ?? 'badge-grey'}`}>{STATUS_CFG[c.status]?.label ?? c.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
