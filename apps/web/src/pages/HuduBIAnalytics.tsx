import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';

export function HuduBIAnalytics() {
  const [activeTab, setActiveTab] = useState<'kpi' | 'reports' | 'forecasting'>('kpi');

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#fafafa', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        crumbs={['HuduBI', 'Analytics']}
        titlePlain="Analytics &"
        titleEm="reports center"
        subtitle="Custom report builder, KPI target monitoring, and revenue forecasting"
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
        <button
          type="button"
          onClick={() => setActiveTab('kpi')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'kpi' ? '#18181B' : 'transparent', color: activeTab === 'kpi' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          KPI Center
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'reports' ? '#18181B' : 'transparent', color: activeTab === 'reports' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Reports Library
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('forecasting')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'forecasting' ? '#18181B' : 'transparent', color: activeTab === 'forecasting' ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Revenue Forecasting
        </button>
      </div>

      {activeTab === 'kpi' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { title: 'Gross Revenue Target', current: '$28.4M', target: '$25.0M', status: 'Exceeded', pct: 113, color: '#10b981' },
            { title: 'Customer Churn Rate', current: '1.2%', target: '1.5%', status: 'On Track', pct: 80, color: '#10b981' },
            { title: 'Customer Acquisition Cost', current: '$420', target: '$400', status: 'Attention', pct: 105, color: '#f59e0b' },
            { title: 'Net Promoter Score (NPS)', current: '68', target: '65', status: 'Exceeded', pct: 104, color: '#10b981' },
            { title: 'Data Pipeline Uptime', current: '99.98%', target: '99.90%', status: 'Exceeded', pct: 100, color: '#10b981' },
            { title: 'ML Prediction Latency', current: '42ms', target: '50ms', status: 'Exceeded', pct: 84, color: '#10b981' },
          ].map(k => (
            <div key={k.title} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{k.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: k.status === 'Exceeded' ? '#d1fae5' : '#fef3c7', color: k.status === 'Exceeded' ? '#065f46' : '#92400e' }}>
                  {k.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{k.current}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Target: {k.target}</span>
              </div>

              <div style={{ width: '100%', height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, k.pct)}%`, background: k.color, borderRadius: 3 }}></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'reports' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Saved Executive Reports</span>
            <button type="button" className="btn btn-primary" style={{ background: '#18181B', color: '#fff' }}>+ Create Report</button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: 11, color: '#9ca3af', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Report Name</th>
                <th style={{ padding: '10px 12px' }}>Category</th>
                <th style={{ padding: '10px 12px' }}>Frequency</th>
                <th style={{ padding: '10px 12px' }}>Last Run</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Monthly Executive Financial Statement', category: 'Finance', freq: 'Monthly', last: 'Today, 08:00 AM' },
                { name: 'Customer Cohort Churn Analysis', category: 'Product', freq: 'Weekly', last: 'Yesterday' },
                { name: 'Regional Freight Revenue Breakdown', category: 'Operations', freq: 'Daily', last: '2 hours ago' },
                { name: 'AI Model Accuracy & Drift Audit', category: 'ML Engineering', freq: 'Weekly', last: '3 days ago' },
              ].map(r => (
                <tr key={r.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#111827' }}>{r.name}</td>
                  <td style={{ padding: '12px', color: '#4b5563' }}>{r.category}</td>
                  <td style={{ padding: '12px', color: '#4b5563' }}>{r.freq}</td>
                  <td style={{ padding: '12px', color: '#6b7280' }}>{r.last}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <button type="button" style={{ background: 'none', border: 'none', color: '#18181B', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Run Now</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'forecasting' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>4-Quarter Machine Learning Revenue Forecast</div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            Model parameters trained on 18.4M transaction logs, seasonality adjustments, and macroeconomic indicators.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 10 }}>
            {[
              { q: 'Q4 2026 (Projected)', rev: '$31.2M', growth: '+9.8% QoQ', conf: '98.2%' },
              { q: 'Q1 2027 (Projected)', rev: '$34.0M', growth: '+8.9% QoQ', conf: '96.5%' },
              { q: 'Q2 2027 (Projected)', rev: '$37.5M', growth: '+10.2% QoQ', conf: '94.1%' },
              { q: 'Q3 2027 (Projected)', rev: '$41.8M', growth: '+11.4% QoQ', conf: '91.8%' },
            ].map(f => (
              <div key={f.q} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{f.q}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{f.rev}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: '#10b981' }}>
                  <span>{f.growth}</span>
                  <span style={{ color: '#6b7280' }}>Conf: {f.conf}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
