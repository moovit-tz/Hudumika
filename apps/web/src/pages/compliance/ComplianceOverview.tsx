import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { apiFetch } from '../../lib/api.js';
import { useIsDarkMode } from '../../hooks/useIsDarkMode.js';
import './ComplianceOverview.css';

interface CheckLogRow {
  id: string;
  hs_code: string;
  hs_description: string | null;
  origin_country: string;
  total_checks: number;
  required_count: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
}

interface WizardHistoryRow {
  id: string;
  created_at: string;
  procedure_id: string;
  procedure_name: string;
  procedure_kind: string;
}

type HistorySortKey = 'type' | 'query' | 'result' | 'time';
type ActivityFilter = 'all' | 'quick' | 'advanced' | 'high_risk';

interface HistoryRow {
  id: string;
  type: 'Quick' | 'Advanced';
  query: string;
  detail: string;
  result: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
  openHref: string;
}

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const KIND_COLOR: Record<string, string> = {
  IMPORT: 'blue',
  EXPORT: 'green',
  TRANSIT: 'gold',
  REGISTRATION: 'teal',
};

export function ComplianceOverview() {
  const navigate = useNavigate();
  const isDark = useIsDarkMode();
  const [checkLog, setCheckLog] = useState<CheckLogRow[] | null>(null);
  const [wizardLog, setWizardLog] = useState<WizardHistoryRow[] | null>(null);
  const [wizardUsage, setWizardUsage] = useState<{ used: number; limit: number | null } | null>(null);

  // Table filters, pagination & sorting
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<HistorySortKey>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    apiFetch('/v1/customs/compliance-check/history')
      .then(r => setCheckLog(Array.isArray(r) ? r : []))
      .catch(() => setCheckLog([]));
    apiFetch('/v1/customs/trade-wizard/history')
      .then(r => setWizardLog(Array.isArray(r) ? r : []))
      .catch(() => setWizardLog([]));
    apiFetch('/v1/customs/trade-wizard/usage')
      .then(setWizardUsage)
      .catch(() => {});
  }, []);

  const loading = checkLog === null || wizardLog === null;

  // Calm chart palette
  const C = useMemo(() => ({
    teal: isDark ? '#2dd4bf' : '#0d9488',
    blue: isDark ? '#60a5fa' : '#2563eb',
    gold: isDark ? '#d97706' : '#b45309',
    red: isDark ? '#f87171' : '#dc2626',
    green: isDark ? '#34d399' : '#16a34a',
    gridLine: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    axisText: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  }), [isDark]);

  const checksThisMonth = (checkLog ?? []).filter(c => isThisMonth(c.created_at));
  const highRiskThisMonth = checksThisMonth.filter(c => c.risk_level === 'HIGH');
  const wizardRunsThisMonth = (wizardLog ?? []).filter(w => isThisMonth(w.created_at));

  const metrics = [
    {
      label: 'Quick checks',
      value: checksThisMonth.length,
      subtitle: `${(checkLog ?? []).length} all-time`,
      icon: 'shield' as IconName,
    },
    {
      label: 'High risk',
      value: highRiskThisMonth.length,
      subtitle: `${Math.round(checksThisMonth.length ? (highRiskThisMonth.length / checksThisMonth.length) * 100 : 0)}% of checks`,
      icon: 'alertTriangle' as IconName,
    },
    {
      label: 'Trade procedures',
      value: wizardRunsThisMonth.length,
      subtitle: `${(wizardLog ?? []).length} all-time`,
      icon: 'compass' as IconName,
    },
  ];

  // Quick Action Tool Cards
  const toolCards = [
    {
      title: 'Quick check',
      badge: 'HS code',
      description: 'Check goods against destination rules and agency requirements.',
      icon: 'shield' as IconName,
      actionText: 'Check goods',
      href: '/clearos/compliance/quick',
    },
    {
      title: 'Trade procedures',
      badge: 'Guided',
      description: 'Follow import, export and transit steps, permits and timelines.',
      icon: 'compass' as IconName,
      actionText: 'Open guide',
      href: '/clearos/compliance/advanced',
    },
    {
      title: 'Partner screening',
      badge: 'Sanctions · PEP',
      description: 'Screen people, companies and vessels against watchlists.',
      icon: 'userCheck' as IconName,
      actionText: 'Screen a party',
      href: '/clearos/compliance/screening',
    },
    {
      title: 'Origin certificate',
      badge: 'Trade agreements',
      description: 'Check eligibility for regional and trade-agreement rates.',
      icon: 'award' as IconName,
      actionText: 'Check origin',
      href: '/clearos/compliance/origin',
    },
  ];

  // 14-day activity trend
  const trend = useMemo(() => {
    const days: { key: string; label: string; checks: number; wizard: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        checks: 0,
        wizard: 0,
      });
    }
    const byKey = new Map(days.map(d => [d.key, d]));
    for (const c of checkLog ?? []) {
      const row = byKey.get(dayKey(c.created_at));
      if (row) row.checks += 1;
    }
    for (const w of wizardLog ?? []) {
      const row = byKey.get(dayKey(w.created_at));
      if (row) row.wizard += 1;
    }
    return days;
  }, [checkLog, wizardLog]);

  const hasTrendData = trend.some(d => d.checks > 0 || d.wizard > 0);

  // Risk level breakdown
  const riskBreakdown = useMemo(() => {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const c of checkLog ?? []) counts[c.risk_level] = (counts[c.risk_level] ?? 0) + 1;
    return [
      { name: 'Low Risk', value: counts.LOW, color: C.green },
      { name: 'Medium Risk', value: counts.MEDIUM, color: C.gold },
      { name: 'High Risk', value: counts.HIGH, color: C.red },
    ];
  }, [checkLog, C]);
  const totalChecks = riskBreakdown.reduce((s, r) => s + r.value, 0);

  // Wizard runs by procedure kind
  const kindBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wizardLog ?? []) counts.set(w.procedure_kind, (counts.get(w.procedure_kind) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([kind, value]) => ({ kind, value, color: C[KIND_COLOR[kind] as keyof typeof C] ?? C.teal }))
      .sort((a, b) => b.value - a.value);
  }, [wizardLog, C]);

  const quotaPct = wizardUsage && wizardUsage.limit ? Math.min(100, Math.round((wizardUsage.used / wizardUsage.limit) * 100)) : 0;

  // History rows & filtering
  const allHistoryRows = useMemo<HistoryRow[]>(() => {
    const quick: HistoryRow[] = (checkLog ?? []).map(c => ({
      id: `q-${c.id}`,
      type: 'Quick',
      query: `HS ${c.hs_code}`,
      detail: c.origin_country ? `Origin: ${c.origin_country}` : '',
      result: c.risk_level,
      riskLevel: c.risk_level,
      created_at: c.created_at,
      openHref: `/clearos/compliance/quick?hs=${encodeURIComponent(c.hs_code)}&origin=${encodeURIComponent(c.origin_country)}`,
    }));
    const advanced: HistoryRow[] = (wizardLog ?? []).map(w => ({
      id: `w-${w.id}`,
      type: 'Advanced',
      query: w.procedure_name,
      detail: `Regime: ${w.procedure_kind}`,
      result: w.procedure_kind,
      created_at: w.created_at,
      openHref: `/clearos/compliance/advanced?procedure=${w.procedure_id}`,
    }));
    return [...quick, ...advanced];
  }, [checkLog, wizardLog]);

  const filteredHistoryRows = useMemo(() => {
    let rows = allHistoryRows;

    // Filter by tab
    if (activityFilter === 'quick') {
      rows = rows.filter(r => r.type === 'Quick');
    } else if (activityFilter === 'advanced') {
      rows = rows.filter(r => r.type === 'Advanced');
    } else if (activityFilter === 'high_risk') {
      rows = rows.filter(r => r.riskLevel === 'HIGH');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(r =>
        r.query.toLowerCase().includes(q) ||
        r.detail.toLowerCase().includes(q) ||
        r.result.toLowerCase().includes(q)
      );
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'type':
          return dir * a.type.localeCompare(b.type);
        case 'query':
          return dir * a.query.localeCompare(b.query);
        case 'result':
          return dir * a.result.localeCompare(b.result);
        default:
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
  }, [allHistoryRows, activityFilter, searchQuery, sortKey, sortDir]);

  // Paginated slice
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredHistoryRows.slice(start, start + pageSize);
  }, [filteredHistoryRows, page, pageSize]);

  function handleFilterChange(tabKey: ActivityFilter) {
    setActivityFilter(tabKey);
    setPage(1);
  }

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    setPage(1);
  }

  function toggleSort(key: HistorySortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function SortHeader({ label, k, align = 'left' }: { label: string; k: HistorySortKey; align?: 'left' | 'right' }) {
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
          // 24px is WCAG 2.2's minimum target; the label alone was 17px.
          padding: '4px 0',
          minHeight: 24,
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

  function renderResultStatus(result: string) {
    const upper = result.toUpperCase();
    if (upper === 'HIGH') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--red, #cf222e)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red, #cf222e)', flexShrink: 0 }} />
          HIGH
        </span>
      );
    }
    if (upper === 'MEDIUM') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--gold, #b45309)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold, #b45309)', flexShrink: 0 }} />
          MEDIUM
        </span>
      );
    }
    if (upper === 'LOW') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--green, #16a34a)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green, #16a34a)', flexShrink: 0 }} />
          LOW
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, color: 'var(--ink2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink3)', opacity: 0.5, flexShrink: 0 }} />
        {result}
      </span>
    );
  }

  return (
    <div className="compliance-overview">
      <div className="compliance-overview__metrics">
        {metrics.map(m => (
          <Card key={m.label} className="compliance-overview__metric">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="compliance-overview__metric-label">{m.label}</div>
                <div className="compliance-overview__metric-value">
                  {m.value}
                </div>
                <div className="compliance-overview__metric-note">{m.subtitle}</div>
              </div>
              <div className="compliance-overview__metric-icon">
                <Icon name={m.icon} size={17} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <section className="compliance-overview__tools" aria-labelledby="compliance-tools-title">
        <div className="compliance-overview__section-heading">
          <h2 id="compliance-tools-title">Compliance tools</h2>
        </div>

        <div className="compliance-overview__tool-grid">
          {toolCards.map(tool => (
            <Link
              key={tool.title}
              to={tool.href}
              className="compliance-tool-card"
            >
              <div className="compliance-tool-card__top">
                <div className="compliance-tool-card__icon">
                    <Icon name={tool.icon} size={16} />
                </div>
                <Badge variant="outline" className="compliance-tool-card__badge">{tool.badge}</Badge>
              </div>
              <span className="compliance-tool-card__title">{tool.title}</span>
              <span className="compliance-tool-card__description">{tool.description}</span>
              <span className="compliance-tool-card__action">
                {tool.actionText}<Icon name="arrowRight" size={13} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Row 1 Charts: Activity Trend + Risk Profile Donut ── */}
      <div className="compliance-overview__chart-grid compliance-overview__chart-grid--activity">
        {/* 14-day Trend */}
        <Card>
          <CardHeader style={{ padding: '12px 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <CardTitle style={{ fontSize: 14, fontWeight: 700 }}>Activity trend</CardTitle>
                <CardDescription style={{ fontSize: 12, marginTop: 2 }}>Checks and procedures over 14 days</CardDescription>
              </div>
              <Badge variant="outline" style={{ fontSize: 11, fontWeight: 500 }}>14 days</Badge>
            </div>
          </CardHeader>
          <CardContent style={{ padding: '0 16px 12px' }}>
            {loading ? (
              <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            ) : !hasTrendData ? (
              <div className="compliance-overview__chart-empty">
                No activity in the past 14 days.
              </div>
            ) : (
              <div style={{ height: 190, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="checksGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.teal} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="wizardGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={C.gridLine} strokeDasharray="3 3" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} interval={2} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} allowDecimals={false} width={28} />
                    <RechartsTooltip
                      contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'var(--ink)', fontWeight: 700, marginBottom: 2 }}
                    />
                    <Area type="monotone" dataKey="checks" name="Quick Checks" stroke={C.teal} strokeWidth={2} fillOpacity={1} fill="url(#checksGrad)" />
                    <Area type="monotone" dataKey="wizard" name="Wizard Procedures" stroke={C.blue} strokeWidth={2} fillOpacity={1} fill="url(#wizardGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div style={{ display: 'flex', gap: 18, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.teal, display: 'inline-block' }} /> Quick Checks
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: C.blue, display: 'inline-block' }} /> Wizard Procedures
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Risk Breakdown Donut */}
        <Card className="compliance-overview__risk-card">
          <CardHeader style={{ padding: '12px 16px 10px' }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 700 }}>Risk profile</CardTitle>
            <CardDescription style={{ fontSize: 12, marginTop: 2 }}>Results across all HS-code checks</CardDescription>
          </CardHeader>
          <CardContent style={{ padding: '0 16px 12px' }}>
            {loading ? (
              <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            ) : totalChecks === 0 ? (
              <div className="compliance-overview__chart-empty">
                No checks yet.
              </div>
            ) : (
              <>
                <div style={{ height: 135, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskBreakdown} innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value" stroke="none">
                        {riskBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{totalChecks}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>checks</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {riskBreakdown.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--ink2)' }}>{r.name}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.value}</span>
                      <span style={{ color: 'var(--ink3)', width: 34, textAlign: 'right' }}>
                        {totalChecks > 0 ? Math.round((r.value / totalChecks) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2 Charts: Procedures by Regime + Search Quota Gauge ── */}
      <div className="compliance-overview__chart-grid compliance-overview__chart-grid--quota">
        {/* Procedures by Kind */}
        <Card>
          <CardHeader style={{ padding: '12px 16px 10px' }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 700 }}>Procedures by regime</CardTitle>
            <CardDescription style={{ fontSize: 12, marginTop: 2 }}>Import, export and transit</CardDescription>
          </CardHeader>
          <CardContent style={{ padding: '0 16px 12px' }}>
            {loading ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            ) : kindBreakdown.length === 0 ? (
              <div className="compliance-overview__chart-empty">
                No procedures yet.
              </div>
            ) : (
              <div style={{ height: 160, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kindBreakdown} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={C.gridLine} strokeDasharray="3 3" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: C.axisText }} allowDecimals={false} />
                    <YAxis type="category" dataKey="kind" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--ink)', fontWeight: 600 }} width={104} />
                    <RechartsTooltip
                      contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                      cursor={{ fill: C.gridLine }}
                    />
                    <Bar dataKey="value" name="Procedures" radius={[0, 4, 4, 0]} maxBarSize={20}>
                      {kindBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wizard Search Quota */}
        <Card>
          <CardHeader style={{ padding: '16px 20px 12px' }}>
            <CardTitle style={{ fontSize: 14, fontWeight: 700 }}>Monthly allowance</CardTitle>
            <CardDescription style={{ fontSize: 12, marginTop: 2 }}>Trade procedure searches</CardDescription>
          </CardHeader>
          <CardContent style={{ padding: '0 20px 16px' }}>
            {wizardUsage?.limit === null ? (
              <div style={{ padding: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>∞</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>Unlimited</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Enterprise plan</div>
              </div>
            ) : wizardUsage ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>{wizardUsage.used}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink3)' }}>/ {wizardUsage.limit} queries used</span>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)' }}>
                    {quotaPct}% Used
                  </span>
                </div>

                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden', margin: '8px 0 10px' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    width: `${quotaPct}%`,
                    background: quotaPct >= 90 ? C.red : quotaPct >= 70 ? C.gold : C.teal,
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Resets at the start of next calendar month</span>
                  <span>{wizardUsage.limit - wizardUsage.used} remaining</span>
                </div>
              </div>
            ) : (
              <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SectionLoading /></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Activity Log Table ── */}
      <Card>
        <CardHeader style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div>
              <CardTitle style={{ fontSize: 15, fontWeight: 700 }}>Recent activity</CardTitle>
              <CardDescription style={{ fontSize: 12, marginTop: 2 }}>
                Quick checks and trade procedures
              </CardDescription>
            </div>

            {/* Search input & Segmented filter tabs */}
            <div className="compliance-activity-controls">
              <div className="compliance-activity-search">
                <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search activity"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px 26px 6px 30px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    fontSize: 12,
                    color: 'var(--ink)',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.background = 'var(--white)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>

              {/* Segmented Filter Control */}
              <div className="compliance-activity-filters" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                padding: 2,
                borderRadius: 'var(--r-sm)',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}>
                {(['all', 'quick', 'advanced', 'high_risk'] as ActivityFilter[]).map(tabKey => {
                  const isActive = activityFilter === tabKey;
                  const labels: Record<ActivityFilter, string> = {
                    all: `All · ${allHistoryRows.length}`,
                    quick: `Checks · ${allHistoryRows.filter(r => r.type === 'Quick').length}`,
                    advanced: `Wizard · ${allHistoryRows.filter(r => r.type === 'Advanced').length}`,
                    high_risk: `High risk · ${allHistoryRows.filter(r => r.riskLevel === 'HIGH').length}`,
                  };
                  return (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => handleFilterChange(tabKey)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 5,
                        fontSize: 11.5,
                        fontWeight: isActive ? 600 : 500,
                        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                        background: isActive ? 'var(--white)' : 'transparent',
                        color: isActive ? 'var(--ink)' : 'var(--ink3)',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      {labels[tabKey]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 32 }}><SectionLoading /></div>
          ) : filteredHistoryRows.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              <Icon name="shield" size={28} color="var(--ink3)" style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div>{searchQuery ? 'No matching activity.' : 'No activity yet.'}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                <Button size="sm" variant="outline" onClick={() => navigate('/clearos/compliance/quick')}>
                  <Icon name="shield" size={13} /> Run Quick Check
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/clearos/compliance/advanced')}>
                  <Icon name="compass" size={13} /> Open Wizard
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', width: 140 }}><SortHeader label="Module" k="type" /></th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}><SortHeader label="Query / HS Code" k="query" /></th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', width: 160 }}><SortHeader label="Result Status" k="result" /></th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', width: 130 }}><SortHeader label="Recorded" k="time" /></th>
                      <th style={{ padding: '10px 16px', width: 70, textAlign: 'right' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map(r => (
                      <tr
                        key={r.id}
                        onClick={() => navigate(r.openHref)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                      >
                        {/* Module - clean text with muted icon, zero colored pill badges */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--ink2)' }}>
                            <Icon name={r.type === 'Quick' ? 'shield' : 'compass'} size={13} color="var(--ink3)" />
                            {r.type}
                          </span>
                        </td>

                        {/* Query / HS Code */}
                        <td style={{ padding: '12px 14px', minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                            {r.query}
                          </div>
                          {r.detail && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{r.detail}</div>}
                        </td>

                        {/* Result Status - clean dot indicator, no bubbly badge pills */}
                        <td style={{ padding: '12px 14px' }}>
                          {renderResultStatus(r.result)}
                        </td>

                        {/* Recorded Date */}
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                          {formatDate(r.created_at)}
                        </td>

                        {/* Open Action */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {/* A real link, so keyboard and screen-reader users can open
                              the record too; the row's own click is a mouse shortcut. */}
                          <Link
                            to={r.openHref}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Open ${r.type} check: ${r.query}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: 32, padding: '0 4px', fontSize: 12, fontWeight: 500, color: 'var(--ink2)', textDecoration: 'none', borderRadius: 'var(--r-sm)' }}
                          >
                            Open <Icon name="chevronRight" size={12} color="var(--ink3)" />
                          </Link>
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
                total={filteredHistoryRows.length}
                onPageChange={setPage}
                onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                pageSizeOptions={[10, 20, 50]}
                itemLabel="record"
                bordered={false}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
