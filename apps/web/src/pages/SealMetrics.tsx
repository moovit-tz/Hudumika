import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import { CUSTOMS_STATUS_VARIANT } from '../lib/sealStatus.js';
import './Seal.css';

interface Metrics {
  totals: {
    lots: number;
    consignments: number;
    pendingExams: number;
    activeTransfers: number;
    expiredLots: number;
    nearExpiryLots: number;
  };
  movementsActivity: Array<{ date: string; count: string }>;
  statusBreakdown: Array<{ customs_status: string; count: string }>;
}

function SparkBar({ data, color }: { data: Array<{ date: string; count: string }>; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => parseInt(d.count)));
  if (max === 0) return <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No movement data.</div>;
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 48 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.date}: ${d.count} movements`} style={{
          flex: 1, background: color, borderRadius: 2, opacity: 0.85,
          height: `${Math.max(4, (parseInt(d.count) / max) * 48)}px`,
          transition: 'height .2s',
          cursor: 'default',
        }} />
      ))}
    </div>
  );
}

export function SealMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/seal/analytics')
      .then((r: any) => setMetrics(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="seal-page"><PageHeader crumbs={['SEAL', 'Analytics']} titlePlain="Metrics &" titleEm="reports" subtitle="" /><SectionLoading /></div>;

  const m = metrics;

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Analytics', 'Metrics']}
        titlePlain="Metrics &"
        titleEm="reports"
        subtitle="Review stock levels, warehouse movements, and customs status."
      />

      {/* Top KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Lots',        value: m?.totals.lots ?? 0,             color: 'var(--teal)',  icon: 'package' },
          { label: 'Consignments',      value: m?.totals.consignments ?? 0,     color: 'var(--blue)',  icon: 'truck' },
          { label: 'Pending Exams',     value: m?.totals.pendingExams ?? 0,     color: 'var(--gold)',  icon: 'search' },
          { label: 'Active Transfers',  value: m?.totals.activeTransfers ?? 0,  color: 'var(--ink2)',  icon: 'arrowRight' },
          { label: 'Expired Lots',      value: m?.totals.expiredLots ?? 0,      color: 'var(--red)',   icon: 'alertCircle' },
          { label: 'Expiring ≤30d',     value: m?.totals.nearExpiryLots ?? 0,   color: 'var(--gold)',  icon: 'clock' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color: k.color, opacity: 0.75, flexShrink: 0 }}><Icon name={k.icon as any} size={22} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 4 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Movement activity sparkbar */}
        <div className="seal-card">
          <div className="seal-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="activity" size={14} style={{ color: 'var(--teal)' }} />
            Movement Activity — Last 30 Days
          </div>
          <div className="seal-card-body">
            {m?.movementsActivity.length ? (
              <>
                <SparkBar data={m.movementsActivity} color="var(--teal)" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink3)' }}>
                  <span>{m.movementsActivity[0]?.date ?? ''}</span>
                  <span style={{ fontWeight: 600 }}>
                    {m.movementsActivity.reduce((s, d) => s + parseInt(d.count), 0)} total
                  </span>
                  <span>{m.movementsActivity[m.movementsActivity.length - 1]?.date ?? ''}</span>
                </div>
              </>
            ) : (
              <div className="seal-empty" style={{ padding: '32px 0' }}>No movement data in the last 30 days.</div>
            )}
          </div>
        </div>

        {/* Lot status breakdown */}
        <div className="seal-card">
          <div className="seal-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="pieChart" size={14} style={{ color: 'var(--teal)' }} />
            Lot Status Breakdown
          </div>
          <div className="seal-card-body">
            {m?.statusBreakdown.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {m.statusBreakdown.map(row => {
                  const total = m.statusBreakdown.reduce((s, r) => s + parseInt(r.count), 0);
                  const pct = total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0;
                  const status = row.customs_status as CustomsStatus;
                  return (
                    <div key={row.customs_status}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge variant={CUSTOMS_STATUS_VARIANT[status] ?? 'gray'} style={{ fontSize: 10 }}>
                            {CUSTOMS_STATUS_LABELS[status] ?? row.customs_status}
                          </Badge>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ink2)' }}>
                          {parseInt(row.count).toLocaleString()} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="seal-empty" style={{ padding: '32px 0' }}>No lots to show breakdown for.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
