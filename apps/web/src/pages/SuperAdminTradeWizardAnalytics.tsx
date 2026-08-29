import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { SectionCard } from '../components/SectionCard.js';

interface Summary { total_searches: number; total_runs: number; unique_tenants: number; no_result_searches: number; no_result_rate: number; conversion_rate: number }
interface TermRow { term: string; count: number; no_result_count?: number }
interface ProcedureRow { procedure_id: string; name: string; kind: string; run_count: number }
interface KindRow { kind: string; count: number }
interface TrendRow { day: string; searches: number; runs: number }
interface TenantRow { tenant_id: string; tenant_name: string; search_count: number; run_count: number }

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 };

function RankedBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color }} />
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div style={{ padding: '24px 4px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>{text}</div>;
}

export function SuperAdminTradeWizardAnalytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topTerms, setTopTerms] = useState<TermRow[]>([]);
  const [topProcedures, setTopProcedures] = useState<ProcedureRow[]>([]);
  const [byKind, setByKind] = useState<KindRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [byTenant, setByTenant] = useState<TenantRow[]>([]);
  const [noResults, setNoResults] = useState<TermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, tt, tp, bk, tr, bt, nr] = await Promise.all([
        apiFetch('/v1/superadmin/trade-wizard/summary').catch(() => null),
        apiFetch('/v1/superadmin/trade-wizard/top-search-terms').catch(() => []),
        apiFetch('/v1/superadmin/trade-wizard/top-procedures').catch(() => []),
        apiFetch('/v1/superadmin/trade-wizard/searches-by-kind').catch(() => []),
        apiFetch('/v1/superadmin/trade-wizard/daily-trend').catch(() => []),
        apiFetch('/v1/superadmin/trade-wizard/by-tenant').catch(() => []),
        apiFetch('/v1/superadmin/trade-wizard/no-result-searches').catch(() => []),
      ]);
      setSummary(s); setTopTerms(tt); setTopProcedures(tp); setByKind(bk); setTrend(tr); setByTenant(bt); setNoResults(nr);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', color: 'var(--ink3)' }}>Loading trade wizard analytics…</div>;

  const maxTermCount = Math.max(1, ...topTerms.map(t => t.count));
  const maxProcCount = Math.max(1, ...topProcedures.map(p => p.run_count));
  const maxTenantCount = Math.max(1, ...byTenant.map(t => t.search_count));
  const maxTrend = Math.max(1, ...trend.map(t => Math.max(t.searches, t.runs)));

  return (
    <div>
      <PageHeader
        crumbs={['HuduBI', 'Trade Wizard Analytics']}
        titlePlain="Trade Wizard"
        titleEm="analytics"
        subtitle="Cross-tenant search and usage analytics for the ClearOS Trade Compliance Wizard"
      />

      <MetricsRow cards={[
        { title: 'Total Searches', value: String(summary?.total_searches ?? 0), barHighlight: 'var(--blue)', icon: 'search' },
        { title: 'Wizard Runs', value: String(summary?.total_runs ?? 0), barHighlight: 'var(--teal)', icon: 'checkCircle' },
        { title: 'Tenants Searching', value: String(summary?.unique_tenants ?? 0), barHighlight: 'var(--green)', icon: 'building' },
        { title: 'Conversion Rate', value: `${summary?.conversion_rate ?? 0}%`, barHighlight: 'var(--gold)', icon: 'trendingUp' },
      ]} />

      {summary && summary.no_result_searches > 0 && (
        <div style={{ ...card, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="warning" size="md" shape="square"><Icon name="alertTriangle" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{summary.no_result_searches} searches found nothing ({summary.no_result_rate}% of all searches)</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>See "Searches with no results" below — these are the procedures worth researching next.</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Daily trend */}
        <SectionCard title="Daily activity">
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 14 }}>Searches vs. completed runs, last 30 days</div>
          {trend.length === 0 ? <EmptyPanel text="No activity yet." /> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
              {trend.map(t => (
                <div key={t.day} title={`${t.day}: ${t.searches} searches, ${t.runs} runs`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1, height: '100%' }}>
                  <div style={{ width: '100%', background: 'var(--blue)', opacity: 0.85, borderRadius: '2px 2px 0 0', height: `${(t.searches / maxTrend) * 100}%`, minHeight: t.searches > 0 ? 2 : 0 }} />
                  <div style={{ width: '100%', background: 'var(--teal)', borderRadius: '2px 2px 0 0', height: `${(t.runs / maxTrend) * 100}%`, minHeight: t.runs > 0 ? 2 : 0 }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--ink3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--blue)' }} /> Searches</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--teal)' }} /> Runs</span>
          </div>
        </SectionCard>

        {/* Searches by kind */}
        <SectionCard title="Searches by kind">
          {byKind.length === 0 ? <EmptyPanel text="No searches yet." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byKind.map(k => (
                <div key={k.kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Badge variant="brand">{k.kind}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{k.count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Top search terms */}
        <SectionCard title="Top search terms">
          {topTerms.length === 0 ? <EmptyPanel text="No searches yet." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topTerms.map(t => (
                <div key={t.term}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.term}</span>
                    <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
                  </div>
                  <RankedBar value={t.count} max={maxTermCount} color="var(--blue)" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Top procedures run */}
        <SectionCard title="Most-run procedures">
          {topProcedures.length === 0 ? <EmptyPanel text="No wizard runs yet." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topProcedures.map(p => (
                <div key={p.procedure_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>{p.run_count}</span>
                  </div>
                  <RankedBar value={p.run_count} max={maxProcCount} color="var(--teal)" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* By tenant */}
        <SectionCard title="Usage by tenant">
          {byTenant.length === 0 ? <EmptyPanel text="No activity yet." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byTenant.map(t => (
                <div key={t.tenant_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.tenant_name}</span>
                    <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{t.search_count} searches · {t.run_count} runs</span>
                  </div>
                  <RankedBar value={t.search_count} max={maxTenantCount} color="var(--gold)" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* No-result searches — the actionable list */}
        <SectionCard title="Searches with no results">
          {noResults.length === 0 ? (
            <EmptyPanel text="No unmatched searches — good coverage." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {noResults.map(r => (
                <div key={r.term} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--red-l)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{r.term}</span>
                  <Badge variant="error">{r.count}×</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
