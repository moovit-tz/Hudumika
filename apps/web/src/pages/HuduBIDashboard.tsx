import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon, IconName } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Dashboard {
  period: string;
  generatedAt: string;
  dataLayer: { totalRecords: number; tables: number };
  kpis: { consignmentValueUsd: number; activeCases: number; customers: number; declarations: number; revenueTzs: number; expensesTzs: number };
  shipmentPipeline: { label: string; count: number }[];
  shipmentsByMode: { mode: string; label: string; count: number }[];
  customersBySegment: { segment: string; count: number }[];
  monthlyVolume: { month: string; count: number }[];
}

const usd = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;
const tzs = (v: number) => v >= 1_000_000 ? `TZS ${(v / 1_000_000).toFixed(1)}M` : `TZS ${Math.round(v).toLocaleString()}`;
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short' }); };

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const cardSub: React.CSSProperties = { fontSize: 12, color: 'var(--ink3)', marginTop: 2 };

// A labelled horizontal bar list, shares of a total. Colour comes from the
// per-app accent (var(--teal) = HuduBI's own colour), never a hardcoded hue.
function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No data yet.</div>}
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: 'var(--ink2)' }}>{r.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.value}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((r.value / max) * 100)}%`, background: 'var(--teal)', borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HuduBIDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [explain, setExplain] = useState<any | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  const load = useCallback(async () => {
    try { const res = await apiFetch('/v1/hudubi/dashboard'); if (res) setData(res); }
    catch (e) { console.error('HuduBI dashboard load failed', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openExplain = async () => {
    setShowExplain(true);
    if (!explain) { try { setExplain(await apiFetch('/v1/hudubi/explain')); } catch { /* ignore */ } }
  };

  const k = data?.kpis;
  const kpis: { label: string; value: string; icon: IconName }[] = k ? [
    { label: 'Consignment value (CIF)', value: usd(k.consignmentValueUsd), icon: 'package' },
    { label: 'Active shipment cases', value: String(k.activeCases), icon: 'truck' },
    { label: 'Customers', value: String(k.customers), icon: 'users' },
    { label: 'Declarations', value: String(k.declarations), icon: 'fileText' },
    { label: 'Invoiced revenue', value: tzs(k.revenueTzs), icon: 'dollarSign' },
    { label: 'Recorded expenses', value: tzs(k.expensesTzs), icon: 'trendingDown' },
  ] : [];

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Overview']}
        titlePlain="Executive"
        titleEm="snapshot"
        subtitle="Live figures aggregated directly from your operational and finance data — no forecasts, no invented numbers."
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={openExplain} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}>
            <Icon name="info" size={14} /> How this is computed
          </button>
        }
      />

      {loading && <SectionCard><div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading your data…</div></SectionCard>}

      {data && (
        <>
          {/* Data-layer strip */}
          <SectionCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="layers" size={18} color="var(--teal)" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                {data.dataLayer.totalRecords.toLocaleString()} records across {data.dataLayer.tables} core tables
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{data.period} · scoped to this workspace · every figure below is a live count or sum of these rows</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--green)', background: 'var(--green-l)', padding: '4px 10px', borderRadius: 20 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} /> Live
            </span>
            </div>
          </SectionCard>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            {kpis.map(kpi => (
              <div key={kpi.label} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={kpi.icon} size={16} color="var(--teal)" />
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{kpi.value}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Pipeline + mode */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <SectionCard title="Clearance pipeline">
              <div style={{ ...cardSub, marginBottom: 16 }}>Active shipment cases by clearance stage</div>
              <BarList rows={data.shipmentPipeline.map(s => ({ label: s.label, value: s.count }))} />
            </SectionCard>
            <SectionCard title="Shipment mix">
              <div style={{ ...cardSub, marginBottom: 16 }}>Cases by transport mode</div>
              <BarList rows={data.shipmentsByMode.map(m => ({ label: m.label, value: m.count }))} />
            </SectionCard>
          </div>

          {/* Segments + monthly volume */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <SectionCard title="Customer segments">
              <div style={{ ...cardSub, marginBottom: 16 }}>Customers by category</div>
              <BarList rows={data.customersBySegment.map(s => ({ label: s.segment.charAt(0).toUpperCase() + s.segment.slice(1), value: s.count }))} />
            </SectionCard>
            <SectionCard title="Shipment volume">
              <div style={{ ...cardSub, marginBottom: 16 }}>New cases per month</div>
              {data.monthlyVolume.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No cases yet.</div>
              ) : (() => {
                const max = Math.max(1, ...data.monthlyVolume.map(m => m.count));
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140, paddingTop: 8 }}>
                    {data.monthlyVolume.map(m => (
                      <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{m.count}</span>
                        <div style={{ width: '100%', maxWidth: 46, height: `${Math.max(4, (m.count / max) * 100)}%`, background: 'var(--teal)', borderRadius: '5px 5px 0 0', transition: 'height 0.5s' }} />
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{monthLabel(m.month)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </SectionCard>
          </div>
        </>
      )}

      {/* Explain drawer */}
      {showExplain && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setShowExplain(false)} />
          <div style={{ position: 'relative', width: 420, maxWidth: '100%', background: 'var(--white)', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 25px rgba(0,0,0,0.12)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>How this is computed</div>
              <button type="button" onClick={() => setShowExplain(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
            </div>
            {explain ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([['Method', explain.modelName], ['What it does', explain.description], ['Basis', explain.rationale], ['Note', explain.note]] as const).map(([label, val]) => val && (
                  <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>{val}</div>
                  </div>
                ))}
              </div>
            ) : <SectionLoading />}
          </div>
        </div>
      )}
    </div>
  );
}
