import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import {
  useComplyDashboard,
  useComplyApplications,
  useComplyProfile,
  useComplyObligations,
} from '../hooks/useComply.js';
import { PageHeader } from '../components/PageHeader.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Tip } from '../components/ui/tooltip.js';
import { Banner } from '../components/ui/alert.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../components/ui/table.js';
import './ComplyOS.css';
import './ComplyDashboard.css';
import {ComplyPortfolio} from './ComplyPortfolio.js';

type SemanticVariant = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray';
type PerspectiveView = 'queue' | 'pillars' | 'applications';

interface PillarConfig {
  id: string;
  name: string;
  subtitle: string;
  agencyCode: string;
  variant: SemanticVariant;
  icon: IconName;
  actionPath: string;
  actionLabel: string;
  secondaryPath?: string;
  secondaryLabel?: string;
  desc: string;
}

const REGULATORY_PILLARS: PillarConfig[] = [
  {
    id: 'corporate',
    name: 'Corporate & Entity Legal',
    subtitle: 'BRELA Registry',
    agencyCode: 'BRELA',
    variant: 'info',
    icon: 'briefcase',
    actionPath: '/complyos/brela-search',
    actionLabel: 'Search Registry',
    secondaryPath: '/complyos/companies',
    secondaryLabel: 'Entities Directory',
    desc: 'Annual returns, company incorporation, board filings & statutory business registration.',
  },
  {
    id: 'tax',
    name: 'Tax, Fiscal & Revenue',
    subtitle: 'Tanzania Revenue Authority',
    agencyCode: 'TRA',
    variant: 'warning',
    icon: 'zap',
    actionPath: '/complyos/tra-extract',
    actionLabel: 'TRA Tax Portal',
    secondaryPath: '/complyos/obligations',
    secondaryLabel: 'Tax Clearances',
    desc: 'TIN validation, VAT filings, EFD fiscalisation returns & corporate tax clearance certificates.',
  },
  {
    id: 'social',
    name: 'Labor & Social Protection',
    subtitle: 'NSSF & WCF Portals',
    agencyCode: 'NSSF',
    variant: 'brand',
    icon: 'users',
    actionPath: '/complyos/obligations',
    actionLabel: 'Staff Obligations',
    secondaryPath: '/complyos/renewal-finance',
    secondaryLabel: 'Statutory Payroll',
    desc: 'Mandatory worker pension contributions, injury insurance filings & employer compliance.',
  },
  {
    id: 'safety',
    name: 'Workplace Health & Safety',
    subtitle: 'OSHA Tanzania',
    agencyCode: 'OSHA',
    variant: 'warning',
    icon: 'shield',
    actionPath: '/complyos/obligations',
    actionLabel: 'Safety Audits',
    secondaryPath: '/complyos/vault',
    secondaryLabel: 'OSHA Certificates',
    desc: 'Statutory workplace safety inspections, occupational medical exams & plant safety permits.',
  },
  {
    id: 'environment',
    name: 'Environmental Governance',
    subtitle: 'NEMC Council',
    agencyCode: 'NEMC',
    variant: 'success',
    icon: 'clipboardList',
    actionPath: '/complyos/obligations',
    actionLabel: 'EIA Obligations',
    secondaryPath: '/complyos/vault',
    secondaryLabel: 'Discharge Permits',
    desc: 'Environmental Impact Assessment (EIA) audits, effluent discharge & annual compliance certificates.',
  },
  {
    id: 'standards',
    name: 'Standards & Quality Marks',
    subtitle: 'Tanzania Bureau of Standards',
    agencyCode: 'TBS',
    variant: 'info',
    icon: 'checkCircle',
    actionPath: '/complyos/license-catalog',
    actionLabel: 'Licence Catalog',
    secondaryPath: '/complyos/applications/new',
    secondaryLabel: 'PVoC Clearance',
    desc: 'Statutory product quality testing, batch certification, tested marks & import PVoC compliance.',
  },
];

function getAgencyBadge(code?: string) {
  const norm = (code ?? '').toUpperCase();
  const found = REGULATORY_PILLARS.find(p => p.agencyCode === norm);
  return {
    code: norm || 'OTHER',
    variant: found ? found.variant : ('gray' as SemanticVariant),
  };
}

function getAppStatus(status?: string): { label: string; variant: SemanticVariant } {
  switch ((status ?? '').toLowerCase()) {
    case 'approved':
    case 'issued':
    case 'active':
      return { label: 'Issued', variant: 'success' };
    case 'submitted':
    case 'pending':
    case 'in_progress':
      return { label: 'Pending', variant: 'warning' };
    case 'under_review':
    case 'review':
      return { label: 'In Review', variant: 'info' };
    case 'rejected':
    case 'cancelled':
      return { label: 'Rejected', variant: 'error' };
    case 'lapsed':
    case 'expired':
      return { label: 'Expired', variant: 'error' };
    case 'draft':
    default:
      return {
        label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft',
        variant: 'gray',
      };
  }
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  try {
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/** Executive Radial Gauge with Dynamic Status Arc */
function HealthGauge({ score, incomplete }: { score: number; incomplete: boolean }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const fill = incomplete ? 0 : Math.min(100, Math.max(0, score / 100)) * circ;
  const strokeColor = incomplete
    ? 'var(--ink3)'
    : score >= 85
    ? 'var(--green)'
    : score >= 70
    ? 'var(--teal)'
    : score >= 50
    ? 'var(--gold)'
    : 'var(--red)';

  return (
    <div className="comply-perspective-gauge">
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
        <circle cx="52" cy="52" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="52"
          cy="52"
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          className="comply-gauge-arc"
        />
      </svg>
      <div className="comply-perspective-gauge-val">
        {incomplete ? (
          <span className="comply-gauge-pct-empty">—</span>
        ) : (
          <div className="flex items-baseline justify-center">
            <span className="comply-gauge-pct-num">{score}</span>
            <span className="comply-gauge-pct-sign">%</span>
          </div>
        )}
        <span className="comply-gauge-pct-sub">Recorded Validity</span>
      </div>
    </div>
  );
}

export function ComplyDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refresh:refreshDashboard } = useComplyDashboard();
  const [portfolioRevision,setPortfolioRevision]=useState(0);
  const refresh=async()=>{await refreshDashboard();setPortfolioRevision(v=>v+1);};
  const { apps, loading: appsLoading } = useComplyApplications();
  const { profile, loading: profileLoading } = useComplyProfile();
  const { obligations } = useComplyObligations();

  // Perspective Switcher state: Action Queue vs Regulatory Pillars vs Applications Workbench
  const [activeView, setActiveView] = useState<PerspectiveView>('queue');

  // Filter & Search states
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'urgent' | 'month'>('all');
  const [appFilter, setAppFilter] = useState<'all' | 'pending' | 'issued' | 'draft'>('all');
  const [appSearch, setAppSearch] = useState('');

  const rawScore = data?.health_score ?? 0;
  const incomplete = rawScore < 0;
  const score = incomplete ? 0 : rawScore;

  // Filtered Deadlines
  const filteredDeadlines = useMemo(() => {
    const list = data?.upcoming_deadlines ?? [];
    if (deadlineFilter === 'urgent') return list.filter(d => d.days_left <= 7);
    if (deadlineFilter === 'month') return list.filter(d => d.days_left <= 30);
    return list;
  }, [data?.upcoming_deadlines, deadlineFilter]);

  // Urgent Deadlines (< 7 days or overdue)
  const criticalItems = useMemo(() => {
    return (data?.upcoming_deadlines ?? []).filter(d => d.days_left <= 7);
  }, [data?.upcoming_deadlines]);

  // Filtered Applications for Workbench
  const filteredApps = useMemo(() => {
    let list = apps;
    if (appFilter === 'pending') {
      list = list.filter(a =>
        ['submitted', 'pending', 'in_progress', 'under_review'].includes((a.status ?? '').toLowerCase())
      );
    } else if (appFilter === 'issued') {
      list = list.filter(a => ['approved', 'issued', 'active'].includes((a.status ?? '').toLowerCase()));
    } else if (appFilter === 'draft') {
      list = list.filter(a => (a.status ?? '').toLowerCase() === 'draft');
    }

    if (appSearch.trim()) {
      const q = appSearch.toLowerCase().trim();
      list = list.filter(
        a =>
          (a.app_number ?? '').toLowerCase().includes(q) ||
          (a.cert_type ?? '').toLowerCase().includes(q) ||
          (a.agency_code ?? '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [apps, appFilter, appSearch]);

  if (loading && !data) return <SkeletonPage variant="dashboard" />;

  const postureStatus = incomplete
    ? { label: 'Validity Incomplete', variant: 'gray' as SemanticVariant }
    : score >= 85
    ? { label: 'High Recorded Validity', variant: 'success' as SemanticVariant }
    : score >= 70
    ? { label: 'Recorded Validity Overview', variant: 'brand' as SemanticVariant }
    : score >= 50
    ? { label: 'Renewal Action Needed', variant: 'warning' as SemanticVariant }
    : { label: 'Permit Records Need Review', variant: 'error' as SemanticVariant };

  return (
    <div className="comply-perspective-dashboard">
      {/* ── 1. PageHeader (CLAUDE.md standard) ────────────────────────── */}
      <PageHeader
        crumbs={['ComplyOS', 'Overview']}
        titlePlain="Compliance"
        titleEm="overview"
        subtitle="Operational compliance command deck: track statutory filings, agency pipelines, and regulatory obligations."
        actions={
          <div className="comply-perspective-actions">
            <Tip label="Refresh compliance data">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={refresh}
                aria-label="Refresh compliance data"
              >
                <Icon name="refresh" size={14} />
              </Button>
            </Tip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/complyos/obligation-scan')}
            >
              <Icon name="sparkle" size={14} />
              AI Obligation Scan
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/complyos/brela-search">
                <Icon name="search" size={14} />
                BRELA Search
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/complyos/applications/new">
                <Icon name="plus" size={14} />
                New Application
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── 2. System Alerts & Warnings ───────────────────────────────── */}
      {!profileLoading && !profile && (
        <Banner
          variant="brand"
          icon="sparkle"
          action={
            <Button size="sm" onClick={() => navigate('/complyos/obligation-scan')}>
              Run Sector Scan
            </Button>
          }
        >
          <strong>Initialize your regulatory profile:</strong> Tell us your industry sector and our AI engine will map out your mandatory licensing, municipal permits, and periodic statutory filings.
        </Banner>
      )}

      {error && (
        <Banner
          variant="error"
          icon="alertTriangle"
          action={
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry Sync
            </Button>
          }
        >
          Failed to load live compliance data: {error}
        </Banner>
      )}

      {data && data.overdue > 0 && (
        <Banner
          variant="error"
          icon="alertTriangle"
          action={
            <Button size="sm" variant="outline" onClick={() => navigate('/complyos/obligations')}>
              Review Expired Records
            </Button>
          }
        >
          <strong>Expired Permit Records:</strong> {data.overdue} tracked permits have reached their recorded expiry date. Review their renewal status and authority requirements.
        </Banner>
      )}

      {/* ── 3. Executive Horizon Ribbon (Top Deck) ────────────────────── */}
      <div className="comply-briefing-ribbon">
        <div className="comply-briefing-left">
          <HealthGauge score={score} incomplete={incomplete} />
          <div className="comply-briefing-text">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="comply-briefing-headline">
                {incomplete ? 'Validity Records Incomplete' : `${score}% Recorded Validity`}
              </span>
              <Badge variant={postureStatus.variant} className="text-xs font-semibold">
                {postureStatus.label}
              </Badge>
            </div>
            <p className="comply-briefing-sub">
              {!data
                ? 'Connecting to regulatory registries…'
                : incomplete
                ? 'No commercial licenses recorded yet. Upload permits to the Vault or trigger an AI Sector Scan to begin automated tracking.'
                : `${data.active_certs} certificates with validity beyond 30 days. ${
                    data.expiring_soon > 0
                      ? `${data.expiring_soon} upcoming renewals due in the next 30 days.`
                      : 'All monitored commercial permits are fully compliant.'
                  }`}
            </p>
          </div>
        </div>

        {/* Quick Horizon Metric Chips */}
        <div className="comply-briefing-vitals">
          <div
            className="comply-vital-card cursor-pointer hover:border-teal-500/40 transition-colors"
            onClick={() => navigate('/complyos/vault')}
            title="View active certificates in Vault"
          >
            <div className="comply-vital-card-top">
              <span className="comply-vital-label">Active Permits</span>
              <span className="comply-vital-indicator" style={{ background: 'var(--green)' }} />
            </div>
            <div className="comply-vital-number">{loading ? '—' : (data?.active_certs ?? 0)}</div>
            <span className="comply-vital-sub">In Good Standing</span>
          </div>

          <div
            className="comply-vital-card cursor-pointer hover:border-teal-500/40 transition-colors"
            onClick={() => navigate('/complyos/calendar')}
            title="View 30-day renewal calendar"
          >
            <div className="comply-vital-card-top">
              <span className="comply-vital-label">Due &lt;30 Days</span>
              <span
                className="comply-vital-indicator"
                style={{ background: (data?.expiring_soon ?? 0) > 0 ? 'var(--gold)' : 'var(--teal)' }}
              />
            </div>
            <div className="comply-vital-number">{loading ? '—' : (data?.expiring_soon ?? 0)}</div>
            <span className="comply-vital-sub">Renewal Window</span>
          </div>

          <div
            className="comply-vital-card cursor-pointer hover:border-teal-500/40 transition-colors"
            onClick={() => navigate('/complyos/applications')}
            title="View applications in agency pipeline"
          >
            <div className="comply-vital-card-top">
              <span className="comply-vital-label">In Agency Review</span>
              <span className="comply-vital-indicator" style={{ background: 'var(--blue, #3b82f6)' }} />
            </div>
            <div className="comply-vital-number">{loading ? '—' : (data?.pending_apps ?? 0)}</div>
            <span className="comply-vital-sub">Active Submissions</span>
          </div>

          <div
            className="comply-vital-card cursor-pointer hover:border-teal-500/40 transition-colors"
            onClick={() => navigate('/complyos/obligations')}
            title="View overdue obligations"
          >
            <div className="comply-vital-card-top">
              <span className="comply-vital-label">Overdue Items</span>
              <span
                className="comply-vital-indicator"
                style={{ background: (data?.overdue ?? 0) > 0 ? 'var(--red)' : 'var(--teal)' }}
              />
            </div>
            <div className="comply-vital-number">{loading ? '—' : (data?.overdue ?? 0)}</div>
            <span className="comply-vital-sub">
              {(data?.overdue ?? 0) > 0 ? 'Action Required' : 'Zero Overdue'}
            </span>
          </div>
        </div>
      </div>

      <ComplyPortfolio revision={portfolioRevision}/>

      {/* ── 4. Perspective Switcher Tabs ──────────────────────────────── */}
      <div className="comply-perspective-switcher-wrap">
        <div className="comply-perspective-nav">
          <button data-ui-native-button=""
            type="button"
            className={`comply-perspective-btn ${activeView === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveView('queue')}
          >
            <Icon name="clipboardList" size={15} />
            <span>Priority Action Queue</span>
            {criticalItems.length > 0 && (
              <span className="comply-perspective-pill-alert">{criticalItems.length}</span>
            )}
          </button>

          <button data-ui-native-button=""
            type="button"
            className={`comply-perspective-btn ${activeView === 'pillars' ? 'active' : ''}`}
            onClick={() => setActiveView('pillars')}
          >
            <Icon name="building" size={15} />
            <span>Regulatory Pillars</span>
            <span className="comply-perspective-pill-count">6 Authorities</span>
          </button>

          <button data-ui-native-button=""
            type="button"
            className={`comply-perspective-btn ${activeView === 'applications' ? 'active' : ''}`}
            onClick={() => setActiveView('applications')}
          >
            <Icon name="fileText" size={15} />
            <span>Applications Workbench</span>
            <span className="comply-perspective-pill-count">{apps.length}</span>
          </button>
        </div>

        {/* Quick Utility Drawer Link */}
        <div className="comply-perspective-quick-links">
          <Button asChild variant="ghost" size="xs">
            <Link to="/complyos/calendar">
              <Icon name="calendar" size={13} className="mr-1" />
              Calendar
            </Link>
          </Button>
          <Button asChild variant="ghost" size="xs">
            <Link to="/complyos/vault">
              <Icon name="lock" size={13} className="mr-1" />
              Vault
            </Link>
          </Button>
          <Button asChild variant="ghost" size="xs">
            <Link to="/complyos/renewal-finance">
              <Icon name="bankNote" size={13} className="mr-1" />
              Fee Budget
            </Link>
          </Button>
        </div>
      </div>

      {/* ── 5. PERSPECTIVE VIEW 1: PRIORITY ACTION QUEUE ──────────────── */}
      {activeView === 'queue' && (
        <div className="comply-view-container">
          <div className="comply-queue-grid">
            {/* Urgent & Critical Action Feed */}
            <div className="comply-queue-main">
              <Card className="comply-card-elevated">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 px-5 border-b border-border gap-2">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Icon name="clock" size={16} color="var(--teal)" />
                      <span>Upcoming Deadlines & Filing Timeline</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Statutory renewal windows, annual returns and mandatory filings due
                    </CardDescription>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="comply-queue-segment">
                      <button data-ui-native-button=""
                        type="button"
                        className={`comply-segment-tab ${deadlineFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setDeadlineFilter('all')}
                      >
                        All ({data?.upcoming_deadlines?.length ?? 0})
                      </button>
                      <button data-ui-native-button=""
                        type="button"
                        className={`comply-segment-tab ${deadlineFilter === 'urgent' ? 'active' : ''}`}
                        onClick={() => setDeadlineFilter('urgent')}
                      >
                        Urgent &lt;7d ({criticalItems.length})
                      </button>
                      <button data-ui-native-button=""
                        type="button"
                        className={`comply-segment-tab ${deadlineFilter === 'month' ? 'active' : ''}`}
                        onClick={() => setDeadlineFilter('month')}
                      >
                        30 Days
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {loading && (
                    <div className="p-8 text-center">
                      <SectionLoading label="Checking statutory obligations…" />
                    </div>
                  )}

                  {!loading && filteredDeadlines.length === 0 && (
                    <div className="p-10 text-center">
                      <FeaturedIcon variant="success" size="lg" shape="circle" className="mx-auto mb-3">
                        <Icon name="checkCircle" size={20} />
                      </FeaturedIcon>
                      <div className="text-sm font-semibold text-foreground">
                        {deadlineFilter === 'all'
                          ? 'Zero Pending Deadlines'
                          : 'No Deadlines in Selected Filter'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        All statutory certifications, licenses and regulatory filings are in full standing.
                      </p>
                      <Button asChild variant="outline" size="sm" className="mt-4">
                        <Link to="/complyos/calendar">
                          <Icon name="calendar" size={13} className="mr-1.5" />
                          Open Full Schedule
                        </Link>
                      </Button>
                    </div>
                  )}

                  {!loading && filteredDeadlines.length > 0 && (
                    <div className="comply-queue-list">
                      {filteredDeadlines.map(d => {
                        const date = new Date(d.expiry_date);
                        const isCritical = d.days_left <= 7;
                        const isOverdue = d.days_left <= 0;
                        const agencyBadge = getAgencyBadge(d.agency_code);

                        return (
                          <div
                            key={d.cert_id}
                            className={`comply-queue-item ${isCritical ? 'comply-queue-item--critical' : ''}`}
                            onClick={() =>
                              navigate(`/complyos/obligations?obligation=${encodeURIComponent(d.cert_id)}`)
                            }
                          >
                            {/* Calendar Block */}
                            <div className="comply-queue-cal-box">
                              <span className="comply-queue-cal-day">
                                {isNaN(date.getDate()) ? '—' : String(date.getDate()).padStart(2, '0')}
                              </span>
                              <span className="comply-queue-cal-month">
                                {isNaN(date.getTime()) ? '—' : date.toLocaleString('en', { month: 'short' })}
                              </span>
                            </div>

                            {/* Details */}
                            <div className="comply-queue-details">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="comply-queue-title" title={d.cert_name}>
                                  {d.cert_name}
                                </span>
                                <Badge variant={agencyBadge.variant} className="text-[11px] py-0 px-1.5 h-4">
                                  {d.agency_code}
                                </Badge>
                              </div>

                              <div className="comply-queue-meta">
                                <span>Expiry: {formatDate(d.expiry_date)}</span>
                                <span className="text-border">·</span>
                                <span className="text-muted-foreground">Statutory Renewal</span>
                              </div>
                            </div>

                            {/* Urgency Badge & Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant={isOverdue ? 'error' : isCritical ? 'error' : d.days_left <= 30 ? 'warning' : 'brand'}
                                className="font-bold text-xs"
                              >
                                {isOverdue ? 'Overdue' : `${d.days_left}d remaining`}
                              </Badge>

                              <Button
                                size="sm"
                                variant={isCritical ? 'default' : 'outline'}
                                className="h-7 text-xs hidden sm:inline-flex"
                                onClick={e => {
                                  e.stopPropagation();
                                  navigate(`/complyos/obligations?obligation=${encodeURIComponent(d.cert_id)}`);
                                }}
                              >
                                {isCritical ? 'Renew Now' : 'Details'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar: Pipeline & Integrations */}
            <div className="comply-queue-side">
              {/* Agency Sync Health */}
              <Card className="comply-card-elevated">
                <CardHeader className="py-3 px-5 border-b border-border flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="zap" size={14} color="var(--teal)" />
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Agency Portal Handshakes
                    </CardTitle>
                  </div>
                  <Badge variant="brand" className="text-[10px] py-0 px-1.5">
                    Live
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {data?.recent_syncs?.slice(0, 4).map((s, idx) => {
                      const agencyMeta = getAgencyBadge(s.agency_code);
                      const isSuccess = s.status === 'success';
                      return (
                        <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant={agencyMeta.variant} className="text-[10px] font-mono h-4 px-1.5">
                              {s.agency_code}
                            </Badge>
                            <span className="text-muted-foreground font-mono text-[11px]">
                              {new Date(s.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <Badge variant={isSuccess ? 'success' : 'warning'} className="text-[10px] py-0 px-1.5">
                            {s.status.toUpperCase()}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Fast Action Guidance Box */}
              <Card className="comply-card-elevated">
                <CardHeader className="py-3 px-5 border-b border-border">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Compliance Fast Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-1.5">
                  <Link to="/complyos/obligation-scan" className="comply-fast-action-card group">
                    <FeaturedIcon variant="brand" size="sm" shape="square">
                      <Icon name="sparkle" size={14} />
                    </FeaturedIcon>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-foreground group-hover:text-[var(--teal)] transition-colors">
                        AI Sector Obligation Scan
                      </div>
                      <div className="text-[11px] text-muted-foreground">Map mandatory local permits</div>
                    </div>
                    <Icon name="arrowRight" size={12} className="text-muted-foreground" />
                  </Link>

                  <Link to="/complyos/brela-search" className="comply-fast-action-card group">
                    <FeaturedIcon variant="info" size="sm" shape="square">
                      <Icon name="search" size={14} />
                    </FeaturedIcon>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-foreground group-hover:text-[var(--teal)] transition-colors">
                        BRELA Registry Search
                      </div>
                      <div className="text-[11px] text-muted-foreground">Instant company checks & returns</div>
                    </div>
                    <Icon name="arrowRight" size={12} className="text-muted-foreground" />
                  </Link>

                  <Link to="/complyos/renewal-finance" className="comply-fast-action-card group">
                    <FeaturedIcon variant="success" size="sm" shape="square">
                      <Icon name="bankNote" size={14} />
                    </FeaturedIcon>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-foreground group-hover:text-[var(--teal)] transition-colors">
                        Permit Cost Calculator
                      </div>
                      <div className="text-[11px] text-muted-foreground">Renewal budgets & cash flow</div>
                    </div>
                    <Icon name="arrowRight" size={12} className="text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. PERSPECTIVE VIEW 2: REGULATORY PILLARS (AUTHORITY MATRIX) ── */}
      {activeView === 'pillars' && (
        <div className="comply-view-container">
          <div className="comply-pillars-intro">
            <div>
              <h3 className="text-base font-bold text-foreground">East Africa Statutory Pillars</h3>
              <p className="text-xs text-muted-foreground">
                Domain-by-domain statutory standing across corporate, fiscal, social, safety, environmental and standards regulators.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/complyos/agencies">
                <Icon name="building" size={13} className="mr-1.5" />
                All Agencies Directory
              </Link>
            </Button>
          </div>

          <div className="comply-pillars-grid">
            {REGULATORY_PILLARS.map(pillar => {
              // Calculate how many obligations exist for this pillar
              const pillarObligs = (obligations ?? []).filter(o => o.agency_code === pillar.agencyCode);
              const activeCount = pillarObligs.filter(o => o.status === 'active').length;
              const pendingCount = pillarObligs.filter(o => o.status === 'pending').length;

              return (
                <div key={pillar.id} className="comply-pillar-box group">
                  <div className="comply-pillar-box-hdr">
                    <div className="flex items-center gap-2.5">
                      <FeaturedIcon variant={pillar.variant} size="md" shape="square">
                        <Icon name={pillar.icon} size={18} />
                      </FeaturedIcon>
                      <div>
                        <div className="comply-pillar-box-title group-hover:text-[var(--teal)] transition-colors">
                          {pillar.name}
                        </div>
                        <div className="comply-pillar-box-subtitle">{pillar.subtitle}</div>
                      </div>
                    </div>
                    <Badge variant={pillar.variant} className="text-xs font-mono font-bold">
                      {pillar.agencyCode}
                    </Badge>
                  </div>

                  <p className="comply-pillar-box-desc">{pillar.desc}</p>

                  <div className="comply-pillar-box-stats">
                    <div className="comply-pillar-stat">
                      <span className="comply-pillar-stat-val">{activeCount}</span>
                      <span className="comply-pillar-stat-lbl">Active</span>
                    </div>
                    <div className="comply-pillar-stat">
                      <span className="comply-pillar-stat-val">{pendingCount}</span>
                      <span className="comply-pillar-stat-lbl">Due Soon</span>
                    </div>
                    <div className="comply-pillar-stat">
                      <span className="comply-pillar-stat-val">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                        Live
                      </span>
                      <span className="comply-pillar-stat-lbl">Sync State</span>
                    </div>
                  </div>

                  <div className="comply-pillar-box-actions">
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link to={pillar.actionPath}>
                        {pillar.actionLabel}
                        <Icon name="arrowRight" size={12} className="ml-1.5" />
                      </Link>
                    </Button>
                    {pillar.secondaryPath && (
                      <Button asChild size="sm" variant="ghost" className="w-full text-xs">
                        <Link to={pillar.secondaryPath}>{pillar.secondaryLabel}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 7. PERSPECTIVE VIEW 3: APPLICATIONS WORKBENCH ─────────────── */}
      {activeView === 'applications' && (
        <div className="comply-view-container">
          <Card className="comply-card-elevated">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 px-5 border-b border-border gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span>Applications & Statutory Filings Workbench</span>
                  <Badge variant="gray" className="text-xs">
                    {filteredApps.length} Filings
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Live status tracking for submissions across government agency portals
                </CardDescription>
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                {/* Search bar */}
                <div className="relative flex-1 sm:w-56">
                  <Icon
                    name="search"
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                  <Input
                    type="text"
                    placeholder="Search filing by ID, permit, agency…"
                    value={appSearch}
                    onChange={e => setAppSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                <Button asChild size="sm">
                  <Link to="/complyos/applications/new">
                    <Icon name="plus" size={13} className="mr-1" />
                    New Filing
                  </Link>
                </Button>
              </div>
            </CardHeader>

            {/* Filter Sub-Tabs */}
            <div className="px-5 py-2.5 border-b border-border bg-[var(--surface2,#f8fafc)] flex items-center justify-between flex-wrap gap-2">
              <div className="comply-segment-group">
                {(['all', 'pending', 'issued', 'draft'] as const).map(tab => (
                  <Button
                    key={tab}
                    type="button"
                    variant={appFilter === tab ? 'secondary' : 'ghost'}
                    size="xs"
                    onClick={() => setAppFilter(tab)}
                    className="text-xs"
                  >
                    {tab === 'all' ? 'All Submissions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Button>
                ))}
              </div>

              <span className="text-xs text-muted-foreground">
                Showing {filteredApps.length} of {apps.length} records
              </span>
            </div>

            <CardContent className="p-0">
              {appsLoading && (
                <div className="py-12 text-center text-muted-foreground">
                  <SectionLoading label="Loading applications pipeline…" />
                </div>
              )}

              {!appsLoading && filteredApps.length === 0 && (
                <div className="text-center py-12 px-4">
                  <FeaturedIcon variant="gray" size="md" shape="circle" className="mx-auto mb-2">
                    <Icon name="fileText" size={18} />
                  </FeaturedIcon>
                  <div className="text-sm font-semibold text-foreground">No filings found</div>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
                    {appSearch
                      ? 'No applications match your search query.'
                      : 'No filings match the selected status category.'}
                  </p>
                </div>
              )}

              {/* Desktop Table View */}
              {!appsLoading && filteredApps.length > 0 && (
                <div className="comply-desktop-table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">App Tracking #</TableHead>
                        <TableHead>Licence / Certificate Type</TableHead>
                        <TableHead className="w-24">Agency</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead className="w-32">Submission Date</TableHead>
                        <TableHead className="w-20 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredApps.map(a => {
                        const statusBadge = getAppStatus(a.status);
                        const agencyBadge = getAgencyBadge(a.agency_code);

                        return (
                          <TableRow
                            key={a.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate('/complyos/applications')}
                          >
                            <TableCell className="font-mono text-xs font-bold text-foreground">
                              {a.app_number || `APP-${a.id.slice(0, 8)}`}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              <div className="truncate max-w-[240px]" title={a.cert_type}>
                                {a.cert_type || 'Commercial Statutory Permit'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={agencyBadge.variant} className="text-xs">
                                {a.agency_code || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadge.variant} className="text-xs">
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(a.submitted_at ?? a.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={e => {
                                  e.stopPropagation();
                                  navigate('/complyos/applications');
                                }}
                              >
                                <Icon name="arrowRight" size={13} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Mobile Adaptive Card List */}
              {!appsLoading && filteredApps.length > 0 && (
                <div className="comply-mobile-apps-list">
                  {filteredApps.map(a => {
                    const statusBadge = getAppStatus(a.status);
                    const agencyBadge = getAgencyBadge(a.agency_code);

                    return (
                      <div
                        key={a.id}
                        className="comply-mobile-app-card"
                        onClick={() => navigate('/complyos/applications')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {a.app_number || `APP-${a.id.slice(0, 8)}`}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={agencyBadge.variant} className="text-[11px] py-0 px-1.5 h-4">
                              {a.agency_code || '—'}
                            </Badge>
                            <Badge variant={statusBadge.variant} className="text-[11px] py-0 px-1.5 h-4">
                              {statusBadge.label}
                            </Badge>
                          </div>
                        </div>

                        <div className="comply-mobile-app-title">
                          {a.cert_type || 'Commercial Statutory Permit'}
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>Filed: {formatDate(a.submitted_at ?? a.created_at)}</span>
                          <span className="text-[var(--teal)] font-medium flex items-center gap-0.5">
                            Details
                            <Icon name="arrowRight" size={11} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
