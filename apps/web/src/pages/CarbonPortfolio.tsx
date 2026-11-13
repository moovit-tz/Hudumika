import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { exportCsv } from '../components/AnalyticsKit.js';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';
import type { CarbonPortfolioResponse, CarbonCustomerBreakdown } from '@hudumika/types';

function fmtMonth(m: string): string {
  try {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  } catch {
    return m;
  }
}

type CustomerSortKey = 'customer' | 'shipments' | 'co2' | 'credits';

export const CarbonPortfolio: React.FC = () => {
  usePageSEO('Carbon Portfolio', 'Track freight emissions and sustainability metrics.');
  const isDark = useIsDarkMode();

  const [data, setData] = useState<CarbonPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Table sorting, search & pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('co2');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange?.from) params.set('date_from', dateRange.from.toISOString());
      if (dateRange?.to) params.set('date_to', dateRange.to.toISOString());
      const qs = params.toString();
      const res = await apiFetch(`/v1/analytics/carbon${qs ? `?${qs}` : ''}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load carbon portfolio');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  // Calm chart palette
  const C = useMemo(() => ({
    teal: isDark ? '#2dd4bf' : '#0d9488',
    gridLine: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    axisText: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    modeColors: [
      isDark ? '#2dd4bf' : '#0d9488',
      isDark ? '#60a5fa' : '#2563eb',
      isDark ? '#fbbf24' : '#d97706',
      isDark ? '#f87171' : '#dc2626',
      isDark ? '#a78bfa' : '#7c3aed',
    ],
  }), [isDark]);

  const exportAllData = () => {
    if (!data) return;
    exportCsv(
      'carbon-portfolio-customers.csv',
      ['Customer', 'Shipments', 'CO2 (kg)', 'Est. savings vs baseline (tCO2e)'],
      data.by_customer.map(c => [c.customer_name, c.shipment_count, c.co2_kg, c.credits.toFixed(2)])
    );
  };

  const totalShipments = (data?.calculated_shipment_count ?? 0) + (data?.uncalculated_shipment_count ?? 0);
  const coveragePct = totalShipments > 0
    ? Math.round(((data?.calculated_shipment_count ?? 0) / totalShipments) * 100)
    : 0;

  const metrics = [
    {
      label: 'Total Emissions',
      value: data ? `${(data.total_co2_kg ?? 0).toLocaleString('en')} kg` : '—',
      subtitle: data?.avg_co2_per_shipment_kg ? `Avg ${Math.round(data.avg_co2_per_shipment_kg).toLocaleString('en')} kg / shipment` : 'Freight routing',
      icon: 'trendingUp' as IconName,
    },
    {
      label: 'Estimated savings',
      value: data ? `${Number(data.total_credits ?? 0).toFixed(2)} tCO₂e` : '—',
      subtitle: 'vs an assumed 25% baseline · not certified',
      icon: 'checkCircle' as IconName,
    },
    {
      label: 'Data Coverage',
      value: totalShipments > 0 ? `${coveragePct}%` : '—',
      subtitle: `${data?.calculated_shipment_count ?? 0} of ${totalShipments} shipments`,
      icon: 'package' as IconName,
    },
    {
      label: 'Transport Modes',
      value: data?.by_mode ? `${data.by_mode.length} Modes` : '—',
      subtitle: 'Multimodal freight',
      icon: 'truck' as IconName,
    },
  ];

  // Monthly trend data
  const monthlyChartData = useMemo(() => {
    if (!data?.by_month) return [];
    return data.by_month.map(m => ({
      month: fmtMonth(m.month),
      co2_kg: m.co2_kg,
      shipment_count: m.shipment_count,
    }));
  }, [data]);

  // Mode breakdown data
  const modeChartData = useMemo(() => {
    if (!data?.by_mode) return [];
    const total = data.by_mode.reduce((acc, m) => acc + m.co2_kg, 0);
    return data.by_mode.map((m, idx) => ({
      name: m.mode,
      value: m.co2_kg,
      shipment_count: m.shipment_count,
      pct: total > 0 ? Math.round((m.co2_kg / total) * 100) : 0,
      color: C.modeColors[idx % C.modeColors.length],
    }));
  }, [data, C]);

  // Customer table filtering & sorting
  const filteredCustomers = useMemo(() => {
    if (!data?.by_customer) return [];
    let list = data.by_customer;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => c.customer_name.toLowerCase().includes(q));
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'customer':
          return dir * a.customer_name.localeCompare(b.customer_name);
        case 'shipments':
          return dir * (a.shipment_count - b.shipment_count);
        case 'credits':
          return dir * (a.credits - b.credits);
        default:
          return dir * (a.co2_kg - b.co2_kg);
      }
    });
  }, [data, searchQuery, sortKey, sortDir]);

  // Paginated customers
  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, page, pageSize]);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setPage(1);
  }

  function toggleSort(key: CustomerSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function SortHeader({ label, k, align = 'left' }: { label: string; k: CustomerSortKey; align?: 'left' | 'right' }) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: active ? 'var(--ink)' : 'var(--ink3)',
          fontWeight: active ? 700 : 600,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <span>{label}</span>
        <Icon
          name={active && sortDir === 'asc' ? 'chevronUp' : 'chevronDown'}
          size={11}
          color={active ? 'var(--ink)' : 'var(--ink3)'}
          style={{ opacity: active ? 1 : 0.4 }}
        />
      </button>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['ClearOS', 'Carbon']}
        titlePlain="Carbon"
        titleEm="portfolio"
        subtitle="Track freight emissions and ESG sustainability metrics."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
        {/* ── Top Toolbar (Properly Arranged) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          paddingBottom: 4,
        }}>
          {/* Left: Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DateRangePicker
              range={dateRange}
              onChange={setDateRange}
              placeholder="All time"
              triggerClassName="w-48 h-9 text-xs"
            />
            {dateRange && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateRange(undefined)}
                style={{ height: 32, fontSize: 12, padding: '0 8px', color: 'var(--ink3)' }}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              style={{ height: 34, fontSize: 12, gap: 6 }}
            >
              <Icon name="refresh" size={13} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportAllData}
              disabled={!data || data.by_customer.length === 0}
              style={{ height: 34, fontSize: 12, gap: 6 }}
            >
              <Icon name="download" size={13} />
              Export CSV
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--red, #cf222e)', fontSize: 12.5 }}>
            {error}
          </div>
        )}

        {/* ── Key Metrics Cards (Clean & High-Density) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
        }}>
          {metrics.map(m => (
            <Card key={m.label} style={{ padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink3)' }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, marginTop: 3 }}>
                    {loading ? '…' : m.value}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{m.subtitle}</div>
                </div>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink2)',
                  flexShrink: 0,
                }}>
                  <Icon name={m.icon} size={15} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* ── Visualizations: Monthly Trend & Mode Distribution ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)',
          gap: 14,
        }}>
          {/* Monthly Trend AreaChart */}
          <Card style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Monthly Trend</h3>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>kg CO₂e</span>
            </div>

            {loading ? (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            ) : monthlyChartData.length === 0 ? (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12 }}>
                No emissions data recorded for this period.
              </div>
            ) : (
              <div style={{ height: 190, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyChartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="carbonGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.teal} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={C.gridLine} strokeDasharray="3 3" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} width={32} />
                    <RechartsTooltip
                      contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 6, fontSize: 11.5 }}
                      formatter={(val: any) => [`${Number(val).toLocaleString('en')} kg`, 'Emissions']}
                      labelStyle={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 2 }}
                    />
                    <Area type="monotone" dataKey="co2_kg" stroke={C.teal} strokeWidth={2} fillOpacity={1} fill="url(#carbonGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Mode Breakdown Donut */}
          <Card style={{ background: 'var(--white)', border: '1px solid var(--border)', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>By Mode</h3>
              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{modeChartData.length} modes</span>
            </div>

            {loading ? (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            ) : modeChartData.length === 0 ? (
              <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12 }}>
                No transport modes recorded.
              </div>
            ) : (
              <>
                <div style={{ height: 110, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modeChartData} innerRadius={36} outerRadius={52} paddingAngle={3} dataKey="value" stroke="none">
                        {modeChartData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{modeChartData.length}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--ink3)', marginTop: 1 }}>modes</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  {modeChartData.map(m => (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--ink2)', fontWeight: 500 }}>{m.name}</span>
                      <span style={{ color: 'var(--ink3)', fontSize: 11 }}>{m.shipment_count} shp</span>
                      <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right', minWidth: 55 }}>
                        {m.value.toLocaleString('en')} kg
                      </span>
                      <span style={{ color: 'var(--ink3)', width: 26, textAlign: 'right', fontSize: 11 }}>{m.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* ── Customer Breakdown Table ── */}
        <Card style={{ background: 'var(--white)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Customer Emissions</h3>

            {/* Compact Search */}
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search customers…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '5px 24px 5px 28px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  fontSize: 12,
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          </div>

          <div>
            {loading ? (
              <div style={{ padding: 28 }}><SectionLoading /></div>
            ) : filteredCustomers.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                {searchQuery ? 'No customers match your search.' : 'No customer emissions recorded yet.'}
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <th style={{ padding: '9px 18px', textAlign: 'left' }}><SortHeader label="Customer" k="customer" /></th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', width: 120 }}><SortHeader label="Shipments" k="shipments" align="right" /></th>
                        <th style={{ padding: '9px 14px', textAlign: 'right', width: 140 }}><SortHeader label="CO₂ (kg)" k="co2" align="right" /></th>
                        <th style={{ padding: '9px 18px', textAlign: 'right', width: 140 }}><SortHeader label="Est. savings (tCO₂e)" k="credits" align="right" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCustomers.map((c: CarbonCustomerBreakdown) => (
                        <tr
                          key={c.customer_id}
                          style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s ease' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
                          <td style={{ padding: '11px 18px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {c.customer_name}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: 'var(--ink2)' }}>
                            {c.shipment_count.toLocaleString('en')}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                            {c.co2_kg.toLocaleString('en')} kg
                          </td>
                          <td style={{ padding: '11px 18px', textAlign: 'right', fontSize: 12, color: 'var(--ink2)' }}>
                            {c.credits.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Canonical Pagination Bar */}
                <PaginationBar
                  page={page}
                  pageSize={pageSize}
                  total={filteredCustomers.length}
                  onPageChange={setPage}
                  onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                  pageSizeOptions={[10, 20, 50]}
                  itemLabel="customer"
                  bordered={false}
                />
              </>
            )}
          </div>
        </Card>

        {/* ── Subtle Footnote ── */}
        <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right', paddingRight: 4 }}>
          * GLEC Framework v3.2 / ISO 14083 transport carbon accounting methodology.
        </div>
      </div>
    </div>
  );
};
