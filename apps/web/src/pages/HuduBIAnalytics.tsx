import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';

interface Analytics {
  topCustomers: { name: string; cases: number; cifUsd: number }[];
  cifByMode: { mode: string; cifUsd: number; cases: number }[];
  byOriginPort: { port: string; count: number }[];
}

const MODE_LABELS: Record<string, string> = { SEA_FCL: 'Sea (FCL)', SEA_LCL: 'Sea (LCL)', AIR: 'Air', ROAD: 'Road', RAIL: 'Rail' };
const usd = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 16 };

function BarList({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No data yet.</div>}
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: 'var(--ink2)' }}>{r.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.display}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((r.value / max) * 100)}%`, background: 'var(--teal)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HuduBIAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const res = await apiFetch('/v1/hudubi/analytics'); if (res) setData(res); }
      catch (e) { console.error('HuduBI analytics load failed', e); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Analytics']}
        titlePlain="Analytics &"
        titleEm="reports"
        subtitle="Where your consignment value and volume concentrate — computed from your shipment and customer records."
      />

      {loading && <div style={{ ...card, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}

      {data && (
        <>
          {/* Top customers */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Top customers by volume</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8 }}>Shipment cases and total CIF value per customer</div>
            {data.topCustomers.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No customer activity yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.topCustomers.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < data.topCustomers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.cases} case{c.cases === 1 ? '' : 's'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 80, textAlign: 'right', fontFamily: 'var(--mono)' }}>{usd(c.cifUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CIF by mode + origin ports */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Consignment value by mode</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8 }}>Total CIF (USD) carried by each transport mode</div>
              <BarList rows={data.cifByMode.map(m => ({ label: `${MODE_LABELS[m.mode] || m.mode} · ${m.cases} cases`, value: m.cifUsd, display: usd(m.cifUsd) }))} />
            </div>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>Top origin ports</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8 }}>Where your shipments come from</div>
              <BarList rows={data.byOriginPort.map(p => ({ label: p.port, value: p.count, display: String(p.count) }))} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
