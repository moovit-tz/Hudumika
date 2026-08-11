import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

interface DataSource {
  name: string;
  type: string;
  status: string;
  recordsCount: number;
  lastSync: string;
}

export function HuduBIDataSources() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      try {
        const res = await apiFetch('/v1/hudubi/data-sources');
        if (res && res.sources) {
          setSources(res.sources);
        }
      } catch (err) {
        console.error('Failed to load data sources', err);
      } finally {
        setLoading(false);
      }
    }
    loadSources();
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#fafafa', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        crumbs={['HuduBI', 'Data Management']}
        titlePlain="Data Sources &"
        titleEm="warehouse pipelines"
        subtitle="Connected enterprise warehouses, ETL jobs, data quality checks, and real-time ingestion"
        actions={
          <button type="button" className="btn btn-primary" style={{ background: '#18181B', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} color="#fff" /> Connect Source
          </button>
        }
      />

      {/* Connected Sources List */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Active Data Connections</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {(sources.length > 0 ? sources : [
            { name: 'Snowflake Data Warehouse', type: 'WAREHOUSE', status: 'CONNECTED', recordsCount: 12400000, lastSync: '10 min ago' },
            { name: 'Postgres Operational DB', type: 'DATABASE', status: 'CONNECTED', recordsCount: 4200000, lastSync: 'Live' },
            { name: 'Google BigQuery Analytics', type: 'ANALYTICS', status: 'CONNECTED', recordsCount: 1800000, lastSync: '1 hour ago' },
            { name: 'AWS S3 Data Lake', type: 'STORAGE', status: 'CONNECTED', recordsCount: 8500000, lastSync: '30 min ago' },
          ]).map(s => (
            <div key={s.name} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="layers" size={18} color="#18181b" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.name}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46' }}>
                  {s.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280' }}>
                <span>Type: <strong style={{ color: '#111827' }}>{s.type}</strong></span>
                <span>Last sync: {s.lastSync}</span>
              </div>

              <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                {s.recordsCount.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af' }}>records indexed</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ETL Pipeline Jobs Status */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>ETL Data Pipelines Status</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', fontSize: 11, color: '#9ca3af', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Pipeline Name</th>
              <th style={{ padding: '10px 12px' }}>Source → Target</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Throughput</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Financial Ledger Sync', route: 'Postgres → Snowflake', status: 'Healthy', rate: '12,400 rows/min' },
              { name: 'Customs & Demurrage Events Stream', route: 'Kafka → BigQuery', status: 'Healthy', rate: '45,000 msg/sec' },
              { name: 'NexusHR Shift Logs Ingestion', route: 'API → S3 Data Lake', status: 'Healthy', rate: '8,200 rows/min' },
              { name: 'ComplyOS BRELA Audit Mirror', route: 'Postgres → Postgres Read Replica', status: 'Healthy', rate: 'Sync' },
            ].map(p => (
              <tr key={p.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: '#111827' }}>{p.name}</td>
                <td style={{ padding: '12px', color: '#4b5563' }}>{p.route}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46' }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ padding: '12px', color: '#6b7280' }}>{p.rate}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <button type="button" style={{ background: 'none', border: 'none', color: '#18181B', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Configure</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
