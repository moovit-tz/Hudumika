import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { healthOf, moneyTotals, money } from './projectData.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAuth } from '../../hooks/useAuth.js';
import './ProjectDashboard.css';

export interface DashProject {
  id: string;
  name: string;
  ref?: string | null;
  description?: string | null;
  status: string;
  color: string;
  health_status?: string;
  progress_pct?: number;
  owner_name: string | null;
  owner_id: string;
  start_date: string | null;
  target_date: string | null;
  task_count: number;
  task_done_count: number;
  member_count?: number;
  baseline_budget?: number;
  actual_cost?: number;
  contract_value?: number;
  currency: string;
  customer_name?: string | null;
  industry?: string | null;
  project_tags?: string[];
  created_at?: string;
}

interface CommandMetrics {
  active_projects?: number;
  total_projects?: number;
  portfolio_cpi?: number;
  portfolio_spi?: number | null;
  total_contract_value?: number;
  total_budget?: number;
  total_spent?: number;
  total_earned_value?: number;
  heavy_machinery_utilization_pct?: number;
  health_distribution?: { green: number; amber: number; red: number; critical: number };
}

const HEALTH_META: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'brand'; dot: string }> = {
  on_track: { label: 'On Track', variant: 'brand', dot: 'var(--green)' },
  at_risk: { label: 'At Risk', variant: 'warning', dot: 'var(--gold)' },
  critical: { label: 'Critical', variant: 'error', dot: 'var(--red)' },
  completed: { label: 'Completed', variant: 'brand', dot: 'var(--teal)' },
};

const STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'error' | 'success' }> = {
  not_started: { label: 'Planning', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  on_hold: { label: 'On Hold', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  finished: { label: 'Completed', variant: 'success' },
};

const INDUSTRIES = [
  'general', 'construction', 'engineering', 'real_estate', 'manufacturing',
  'transport', 'public_sector', 'telecom', 'it_software', 'energy', 'mining',
  'agriculture', 'ngo', 'aerospace', 'pharma', 'professional_services',
];

export const ProjectDashboard: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [projects, setProjects] = useState<DashProject[]>([]);
  const [metrics, setMetrics] = useState<CommandMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Filters & View State
  const [statusTab, setStatusTab] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const projectPreviewLimit = 6;

  // Quick Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newIndustry, setNewIndustry] = useState('general');
  const [newCurrency, setNewCurrency] = useState('TZS');
  const [newBudget, setNewBudget] = useState('');
  const [newContractVal, setNewContractVal] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');

    try {
      const [projRes, metricRes] = await Promise.allSettled([
        apiFetch('/v1/tasks/projects'),
        apiFetch('/v1/project-os/command-center'),
      ]);

      if (projRes.status === 'fulfilled') {
        const raw = projRes.value;
        const data = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);
        setProjects(data.map((row: any) => ({
          ...row,
          health_status: healthOf(row.health_status),
          baseline_budget: Number(row.baseline_budget || row.current_budget || 0),
          actual_cost: Number(row.actual_cost || 0),
          contract_value: Number(row.contract_value || 0),
          progress_pct: Number(row.progress_pct || 0),
        })));
      } else {
        throw projRes.reason;
      }

      if (metricRes.status === 'fulfilled') {
        const m = metricRes.value;
        setMetrics(m.data || m);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load project portfolio');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Computed metrics across portfolio
  const active = useMemo(() => projects.filter(p => p.status === 'in_progress'), [projects]);
  const planning = useMemo(() => projects.filter(p => p.status === 'not_started' || p.status === 'draft'), [projects]);
  const completed = useMemo(() => projects.filter(p => p.status === 'finished' || p.status === 'completed'), [projects]);
  const atRisk = useMemo(() => projects.filter(p => p.health_status === 'at_risk' || p.health_status === 'critical'), [projects]);
  const critical = useMemo(() => projects.filter(p => p.health_status === 'critical'), [projects]);

  const avgProgress = useMemo(() => {
    if (projects.length === 0) return 0;
    return Math.round(projects.reduce((s, p) => s + (p.progress_pct || 0), 0) / projects.length);
  }, [projects]);

  const totalTasks = useMemo(() => projects.reduce((s, p) => s + (p.task_count || 0), 0), [projects]);
  const doneTasks = useMemo(() => projects.reduce((s, p) => s + (p.task_done_count || 0), 0), [projects]);

  const totalBudget = useMemo(() => projects.reduce((s, p) => s + (p.baseline_budget || 0), 0), [projects]);
  const totalCost = useMemo(() => projects.reduce((s, p) => s + (p.actual_cost || 0), 0), [projects]);
  const budgetBurnPct = totalBudget > 0 ? Math.min(100, Math.round((totalCost / totalBudget) * 100)) : 0;

  // Filtered & sorted projects list
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    // Status Tab filter
    if (statusTab === 'active') {
      list = list.filter(p => p.status === 'in_progress');
    } else if (statusTab === 'planning') {
      list = list.filter(p => p.status === 'not_started' || p.status === 'draft');
    } else if (statusTab === 'at_risk') {
      list = list.filter(p => p.health_status === 'at_risk' || p.health_status === 'critical');
    } else if (statusTab === 'completed') {
      list = list.filter(p => p.status === 'finished' || p.status === 'completed');
    }

    // Health Select filter
    if (healthFilter !== 'all') {
      list = list.filter(p => p.health_status === healthFilter);
    }

    // Text search query
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.ref && p.ref.toLowerCase().includes(q)) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
        (p.industry && p.industry.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.project_tags && p.project_tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'progress_desc') return (b.progress_pct || 0) - (a.progress_pct || 0);
      if (sortBy === 'progress_asc') return (a.progress_pct || 0) - (b.progress_pct || 0);
      if (sortBy === 'budget_desc') return (b.baseline_budget || 0) - (a.baseline_budget || 0);
      if (sortBy === 'due_soon') {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
      }
      // 'recent' by default
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return list;
  }, [projects, statusTab, healthFilter, search, sortBy]);


  // Handle Quick Project Creation
  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError('');

    try {
      const newId = crypto.randomUUID();
      const res = await apiFetch('/v1/tasks/projects', {
        method: 'POST',
        body: JSON.stringify({
          id: newId,
          name: newTitle.trim(),
          description: newDescription.trim() || null,
          industry: newIndustry,
          currency: newCurrency,
          baseline_budget: Number(newBudget) || 0,
          contract_value: Number(newContractVal) || 0,
          startDate: newStartDate || null,
          targetDate: newTargetDate || null,
        }),
      });

      const createdId = res.data?.id || newId;
      setCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewBudget('');
      setNewContractVal('');
      setNewStartDate('');
      setNewTargetDate('');
      await loadData();
      navigate(`/projects/${createdId}`);
    } catch (err: any) {
      setCreateError(err.message || 'Unable to create project');
    } finally {
      setCreating(false);
    }
  };

  // Helper date format & countdown
  const formatCountdown = (targetDate: string | null) => {
    if (!targetDate) return null;
    const target = new Date(targetDate);
    const now = new Date();
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    if (diffDays === 0) return { text: 'Due today', isOverdue: false, isNear: true };
    if (diffDays <= 7) return { text: `${diffDays}d left`, isOverdue: false, isNear: true };
    return { text: `${diffDays}d left`, isOverdue: false, isNear: false };
  };

  if (loading && !refreshing && projects.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <SectionLoading label="Loading executive portfolio…" size={36} />
      </div>
    );
  }

  return (
    <div className="project-dash">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={() => void loadData()}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Top Header */}
      <div className="project-dash-header-wrap">
        <PageHeader
          crumbs={['Projects', 'Overview']}
          titlePlain="Portfolio"
          titleEm="dashboard"
          subtitle="Executive view — project health, spend, milestones, and risk across the entire portfolio."
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadData(true)}
                disabled={refreshing}
                title="Refresh portfolio status"
              >
                <Icon name="refresh" size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                <span className="hidden sm:inline">Sync</span>
              </Button>
              <Button onClick={() => navigate('/projects/new')}>
                <Icon name="plus" size={14} /> New Project
              </Button>
            </div>
          }
        />
      </div>

      {/* Interactive KPI Ribbon */}
      <div className="project-kpi-grid">
        {/* Total Projects */}
        <div
          className={`project-kpi-tile ${statusTab === 'all' && healthFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => { setStatusTab('all'); setHealthFilter('all'); }}
          title="Click to view all projects"
        >
          <div className="project-kpi-top">
            <span className="project-kpi-label">Total Projects</span>
            <FeaturedIcon variant="brand" size="sm">
              <Icon name="briefcase" size={15} />
            </FeaturedIcon>
          </div>
          <div className="project-kpi-value">{projects.length}</div>
          <div className="project-kpi-sub">
            <span>{active.length} active</span>
            <span>&bull;</span>
            <span>{planning.length} planning</span>
          </div>
        </div>

        {/* Active Velocity */}
        <div
          className={`project-kpi-tile ${statusTab === 'active' ? 'is-active' : ''}`}
          onClick={() => { setStatusTab('active'); setHealthFilter('all'); }}
          title="Click to view active projects"
        >
          <div className="project-kpi-top">
            <span className="project-kpi-label">Active Delivery</span>
            <FeaturedIcon variant="brand" size="sm">
              <Icon name="trendingUp" size={15} />
            </FeaturedIcon>
          </div>
          <div className="project-kpi-value" style={{ color: 'var(--teal)' }}>{active.length}</div>
          <div className="project-kpi-sub">
            <span>{projects.length > 0 ? Math.round((active.length / projects.length) * 100) : 0}% of portfolio</span>
          </div>
        </div>

        {/* Attention Required */}
        <div
          className={`project-kpi-tile ${statusTab === 'at_risk' ? 'is-active' : ''}`}
          onClick={() => { setStatusTab('at_risk'); setHealthFilter('all'); }}
          title="Click to inspect at-risk and critical projects"
        >
          <div className="project-kpi-top">
            <span className="project-kpi-label">At Risk / Critical</span>
            <FeaturedIcon variant={critical.length > 0 ? 'error' : 'warning'} size="sm">
              <Icon name="alertTriangle" size={15} />
            </FeaturedIcon>
          </div>
          <div className="project-kpi-value" style={{ color: critical.length > 0 ? 'var(--red)' : atRisk.length > 0 ? 'var(--gold)' : 'var(--ink)' }}>
            {atRisk.length}
          </div>
          <div className="project-kpi-sub">
            {critical.length > 0 ? (
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>{critical.length} critical flagged</span>
            ) : atRisk.length > 0 ? (
              <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{atRisk.length} schedule variance</span>
            ) : (
              <span style={{ color: 'var(--teal)' }}>All projects healthy</span>
            )}
          </div>
        </div>

        {/* Average Progress */}
        <div className="project-kpi-tile">
          <div className="project-kpi-top">
            <span className="project-kpi-label">Avg Completion</span>
            <FeaturedIcon variant="info" size="sm">
              <Icon name="barChart2" size={15} />
            </FeaturedIcon>
          </div>
          <div className="project-kpi-value">{avgProgress}%</div>
          <div className="project-kpi-sub">
            <span>{doneTasks}/{totalTasks} tasks finished</span>
          </div>
        </div>

        {/* Portfolio Capital */}
        <div className="project-kpi-tile">
          <div className="project-kpi-top">
            <span className="project-kpi-label">Actual Spend</span>
            <FeaturedIcon variant="warning" size="sm">
              <Icon name="dollarSign" size={15} />
            </FeaturedIcon>
          </div>
          <div className="project-kpi-value" style={{ fontSize: 22 }}>
            {moneyTotals(projects, 'actual_cost')}
          </div>
          <div className="project-kpi-sub">
            <span>Budget: {moneyTotals(projects, 'baseline_budget')}</span>
            {budgetBurnPct > 0 && <Badge variant={budgetBurnPct > 90 ? 'error' : 'brand'}>{budgetBurnPct}% burn</Badge>}
          </div>
        </div>
      </div>

      {/* Strategic Portfolio Health & Radar Strip */}
      <div className="project-radar-card">
        <div className="project-radar-header">
          <div className="project-radar-title-group">
            <FeaturedIcon variant="brand" size="sm">
              <Icon name="activity" size={15} />
            </FeaturedIcon>
            <div>
              <div className="project-radar-title">Strategic Portfolio Radar</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                Multi-project variance indicators, schedule velocity, and health classification
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {metrics?.portfolio_cpi != null && Number.isFinite(metrics.portfolio_cpi) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--bg)', padding: '4px 10px', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Cost CPI:</span>
                <span style={{ fontWeight: 800, color: metrics.portfolio_cpi >= 1 ? 'var(--teal)' : 'var(--red)' }}>
                  {metrics.portfolio_cpi.toFixed(2)}
                </span>
              </div>
            )}
            {metrics?.portfolio_spi != null && Number.isFinite(metrics.portfolio_spi) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--bg)', padding: '4px 10px', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Schedule SPI:</span>
                <span style={{ fontWeight: 800, color: metrics.portfolio_spi >= 1 ? 'var(--teal)' : 'var(--gold)' }}>
                  {metrics.portfolio_spi.toFixed(2)}
                </span>
              </div>
            )}
            <Link to="/projects/timeline" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>
              Full Timeline &rarr;
            </Link>
          </div>
        </div>

        <div className="project-radar-stats-row">
          {/* Segmented Health Distribution */}
          <div className="project-seg-bar-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ color: 'var(--ink2)' }}>Portfolio Health Distribution</span>
              <span style={{ color: 'var(--ink3)' }}>{projects.length} Total</span>
            </div>

            <div className="project-seg-bar">
              {projects.length > 0 ? (
                <>
                  <div
                    className="project-seg-segment green"
                    style={{ width: `${(projects.filter(p => p.health_status === 'on_track' || p.health_status === 'completed').length / projects.length) * 100}%` }}
                    title="On Track"
                  />
                  <div
                    className="project-seg-segment amber"
                    style={{ width: `${(projects.filter(p => p.health_status === 'at_risk').length / projects.length) * 100}%` }}
                    title="At Risk"
                  />
                  <div
                    className="project-seg-segment red"
                    style={{ width: `${(critical.length / projects.length) * 100}%` }}
                    title="Critical"
                  />
                </>
              ) : (
                <div className="project-seg-segment" style={{ width: '100%', background: 'var(--border)' }} />
              )}
            </div>

            <div className="project-seg-legend">
              <div className="project-seg-legend-item">
                <span className="project-seg-dot" style={{ background: 'var(--green)' }} />
                <span>On Track ({projects.filter(p => p.health_status === 'on_track' || p.health_status === 'completed').length})</span>
              </div>
              <div className="project-seg-legend-item">
                <span className="project-seg-dot" style={{ background: 'var(--gold)' }} />
                <span>At Risk ({projects.filter(p => p.health_status === 'at_risk').length})</span>
              </div>
              <div className="project-seg-legend-item">
                <span className="project-seg-dot" style={{ background: 'var(--red)' }} />
                <span>Critical ({critical.length})</span>
              </div>
            </div>
          </div>

          {/* Budget Burn Meter */}
          <div className="project-seg-bar-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ color: 'var(--ink2)' }}>Budget Allocation Burn</span>
              <span style={{ color: budgetBurnPct > 90 ? 'var(--red)' : 'var(--teal)' }}>
                {budgetBurnPct}% Utilized
              </span>
            </div>

            <div className="project-seg-bar">
              <div
                className="project-seg-segment brand"
                style={{
                  width: `${budgetBurnPct}%`,
                  background: budgetBurnPct > 90 ? 'var(--red)' : 'var(--teal)'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink3)' }}>
              <span>Spent: {moneyTotals(projects, 'actual_cost')}</span>
              <span>Baseline: {moneyTotals(projects, 'baseline_budget')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Left Explorer (Cards/Table) & Right Strategic Rail */}
      <div className="project-dash-layout">
        {/* Left Column: Explorer */}
        <div>
          {/* Controls Bar */}
          <div className="project-toolbar">
            <div className="project-toolbar-left">
              <Tabs value={statusTab} onValueChange={setStatusTab}>
                <TabsList>
                  <TabsTrigger value="all">All ({projects.length})</TabsTrigger>
                  <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
                  <TabsTrigger value="planning">Planning ({planning.length})</TabsTrigger>
                  <TabsTrigger value="at_risk">At Risk ({atRisk.length})</TabsTrigger>
                  <TabsTrigger value="completed">Done ({completed.length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="project-toolbar-right">
              {/* Search */}
              <div style={{ position: 'relative', width: isMobile ? '100%' : 200 }}>
                <Icon
                  name="search"
                  size={14}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }}
                />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter projects…"
                  style={{ paddingLeft: 30, height: 'var(--project-control-height)', minHeight: 'var(--project-control-height)', paddingBlock: 0, fontSize: 13 }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>

              {/* Health Filter */}
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger style={{ height: 'var(--project-control-height)', minHeight: 'var(--project-control-height)', paddingBlock: 0, width: 120, fontSize: 13 }}>
                  <SelectValue placeholder="Health" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger style={{ height: 'var(--project-control-height)', minHeight: 'var(--project-control-height)', paddingBlock: 0, width: 130, fontSize: 13 }}>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="due_soon">Due Soonest</SelectItem>
                  <SelectItem value="progress_desc">Highest Progress</SelectItem>
                  <SelectItem value="budget_desc">Highest Budget</SelectItem>
                </SelectContent>
              </Select>

              {/* View Switcher */}
              <div className="project-view-switcher">
                <Button size="icon" variant="ghost"
                  type="button"
                  onClick={() => setViewMode('grid')}
                  style={{
                    height: 'var(--project-control-height)',
                    minHeight: 'var(--project-control-height)',
                    padding: '0 10px',
                    background: viewMode === 'grid' ? 'var(--teal-l)' : 'var(--white)',
                    color: viewMode === 'grid' ? 'var(--teal)' : 'var(--ink3)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Card Grid View"
                >
                  <Icon name="grid" size={14} />
                </Button>
                <Button size="icon" variant="ghost"
                  type="button"
                  onClick={() => setViewMode('table')}
                  style={{
                    height: 'var(--project-control-height)',
                    minHeight: 'var(--project-control-height)',
                    padding: '0 10px',
                    background: viewMode === 'table' ? 'var(--teal-l)' : 'var(--white)',
                    color: viewMode === 'table' ? 'var(--teal)' : 'var(--ink3)',
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Data Table View"
                >
                  <Icon name="list" size={14} />
                </Button>
              </div>
            </div>
          </div>

          {/* Empty Filter State */}
          {filteredProjects.length === 0 && projects.length > 0 && (
            <div className="project-empty-card">
              <FeaturedIcon variant="gray" size="lg">
                <Icon name="search" size={24} />
              </FeaturedIcon>
              <div className="project-empty-title">No projects match your filter</div>
              <div className="project-empty-sub">
                Try clearing search terms or selecting a different status tab to see your records.
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setStatusTab('all'); setHealthFilter('all'); }}
              >
                Clear all filters
              </Button>
            </div>
          )}

          {/* First Run / 0 Projects State */}
          {projects.length === 0 && (
            <div className="project-empty-card" style={{ padding: '60px 24px' }}>
              <FeaturedIcon variant="brand" size="xl">
                <Icon name="briefcase" size={32} />
              </FeaturedIcon>
              <div className="project-empty-title" style={{ fontSize: 18, marginTop: 8 }}>
                Welcome to Hudumika Projects
              </div>
              <div className="project-empty-sub">
                Organize projects, plan deliverables, track milestones, monitor budgets, and coordinate field teams with full enterprise multi-tenancy.
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <Button onClick={() => navigate('/projects/new')}>
                  <Icon name="plus" size={14} /> Create Your First Project
                </Button>
              </div>
            </div>
          )}

          {/* Card Grid View */}
          {filteredProjects.length > 0 && viewMode === 'grid' && (
            <div className="project-cards-grid">
              {filteredProjects.slice(0, projectPreviewLimit).map(p => {
                const pct = p.progress_pct || (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0);
                const hb = HEALTH_META[p.health_status || 'on_track'] || HEALTH_META.on_track;
                const sm = STATUS_META[p.status] || STATUS_META.not_started;
                const countdown = formatCountdown(p.target_date);

                return (
                  <div
                    key={p.id}
                    className="project-card"
                    onClick={() => navigate(`/projects/${p.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/projects/${p.id}`);
                      }
                    }}
                  >
                    <div>
                      {/* Top Row: Ref & Badges */}
                      <div className="project-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || 'var(--teal)', flexShrink: 0 }} />
                          {p.ref && <span className="project-card-ref">{p.ref}</span>}
                          {p.industry && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'capitalize' }}>
                              {p.industry.replace('_', ' ')}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <Badge variant={hb.variant}>{hb.label}</Badge>
                          <Badge variant={sm.variant}>{sm.label}</Badge>
                        </div>
                      </div>

                      {/* Title & Customer */}
                      <div className="project-card-title" title={p.name}>
                        {p.name}
                      </div>

                      <div className="project-card-meta">
                        {p.customer_name ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink2)', fontWeight: 600 }}>
                            <Icon name="building" size={12} style={{ color: 'var(--teal)' }} />
                            {p.customer_name}
                          </span>
                        ) : (
                          <span>Internal Project</span>
                        )}
                        {countdown && (
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            color: countdown.isOverdue ? 'var(--red)' : countdown.isNear ? 'var(--gold)' : 'var(--ink3)',
                            fontWeight: countdown.isOverdue || countdown.isNear ? 700 : 500,
                          }}>
                            &bull;
                            <Icon name="clock" size={11} />
                            {countdown.text}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <div className="project-card-desc">
                        {p.description || 'No project scope description provided.'}
                      </div>

                      {/* Progress Bar */}
                      <div className="project-card-progress-wrap">
                        <div className="project-card-progress-label">
                          <span>Physical Progress</span>
                          <span style={{ color: 'var(--ink)' }}>{pct}%</span>
                        </div>
                        <div className="project-card-progress-track">
                          <div
                            className="project-card-progress-fill"
                            style={{
                              width: `${pct}%`,
                              background: p.color || 'var(--teal)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Key Stats Pill Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--ink3)', marginBottom: 8 }}>
                        <span>
                          <strong>{p.task_done_count || 0}</strong>/{p.task_count || 0} tasks done
                        </span>
                        {(p.baseline_budget || 0) > 0 && (
                          <span>
                            Cost: <strong>{money(p.actual_cost, p.currency)}</strong> / {money(p.baseline_budget, p.currency)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="project-card-footer">
                      <div className="project-card-owner">
                        <PersonAvatar
                          userId={p.owner_id}
                          name={p.owner_name || 'Project Lead'}
                          size={24}
                        />
                        <span className="project-card-owner-name">{p.owner_name || 'Unassigned'}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          {p.member_count || 1} {p.member_count === 1 ? 'member' : 'members'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>
                          Open &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table View */}
          {filteredProjects.length > 0 && viewMode === 'table' && (
            <div className="project-table-wrap">
              <table className="project-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Customer / Industry</th>
                    <th>Health</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Budget vs Cost</th>
                    <th>Owner</th>
                    <th>Target Date</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.slice(0, projectPreviewLimit).map(p => {
                    const pct = p.progress_pct || (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0);
                    const hb = HEALTH_META[p.health_status || 'on_track'] || HEALTH_META.on_track;
                    const sm = STATUS_META[p.status] || STATUS_META.not_started;
                    return (
                      <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || 'var(--teal)', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{p.name}</div>
                              {p.ref && <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{p.ref}</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{p.customer_name || '—'}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'capitalize' }}>
                            {p.industry ? p.industry.replace('_', ' ') : 'General'}
                          </div>
                        </td>
                        <td>
                          <Badge variant={hb.variant}>{hb.label}</Badge>
                        </td>
                        <td>
                          <Badge variant={sm.variant}>{sm.label}</Badge>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 100 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: p.color || 'var(--teal)' }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{pct}%</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 11.5, fontWeight: 700 }}>{money(p.actual_cost, p.currency)}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                            {(p.baseline_budget || 0) > 0 ? `of ${money(p.baseline_budget, p.currency)}` : 'No budget set'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PersonAvatar userId={p.owner_id} name={p.owner_name || 'Lead'} size={22} />
                            <span style={{ fontSize: 11.5 }}>{p.owner_name || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{p.target_date || '—'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); navigate(`/projects/${p.id}`); }}>
                            Open &rarr;
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredProjects.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Showing {Math.min(projectPreviewLimit, filteredProjects.length)} of {filteredProjects.length} projects</span>
              <Button variant="outline" size="sm" className="project-view-all" onClick={() => navigate('/projects/directory')}>View all projects <Icon name="arrowRight" size={14} /></Button>
            </div>
          )}
        </div>

        {/* Right Column: Strategic Rail */}
        <div className="project-side-rail">
          {/* Attention Required / Watchlist */}
          <SectionCard
            title={`Attention Watchlist (${atRisk.length})`}
            collapsible
            action={
              atRisk.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setStatusTab('at_risk'); setHealthFilter('all'); }}
                  style={{ background: 'none', border: 'none', fontSize: 11.5, color: 'var(--teal)', fontWeight: 700, cursor: 'pointer' }}
                >
                  View All &rarr;
                </button>
              ) : null
            }
          >
            {atRisk.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {atRisk.slice(0, 5).map(p => (
                  <div
                    key={p.id}
                    className="project-watch-item"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <Icon
                      name="alertTriangle"
                      size={16}
                      style={{ color: p.health_status === 'critical' ? 'var(--red)' : 'var(--gold)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        {p.owner_name || 'Unassigned'} &bull; {p.target_date || 'No target date'}
                      </div>
                    </div>
                    <Badge variant={p.health_status === 'critical' ? 'error' : 'warning'}>
                      {p.health_status === 'critical' ? 'Critical' : 'At Risk'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--teal-l)', borderRadius: 'var(--r)', border: '1px solid var(--teal)' }}>
                <FeaturedIcon variant="brand" size="sm">
                  <Icon name="checkCircle" size={16} />
                </FeaturedIcon>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>
                    Portfolio On Schedule
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--teal)', opacity: 0.9 }}>
                    All active delivery projects are currently within expected cost and milestone tolerance.
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Quick Command Center Hub */}
          <SectionCard title="Command Center Hub" collapsible>
            <div className="project-cmd-grid">
              {[
                { label: 'Timeline & Gantt', icon: 'calendar' as const, path: '/projects/timeline', desc: 'Schedule grid' },
                { label: 'My Tasks', icon: 'checkCircle' as const, path: '/projects/tasks', desc: 'Assigned work' },
                { label: 'Milestones', icon: 'flag' as const, path: '/projects/milestones', desc: 'Critical gates' },
                { label: 'Budgets & EVM', icon: 'dollarSign' as const, path: '/projects/budgets', desc: 'Financial radar' },
                { label: 'Risk Register', icon: 'shield' as const, path: '/projects/risks', desc: 'Threat mitigation' },
                { label: 'Approvals', icon: 'clipboardList' as const, path: '/projects/approvals', desc: 'Sign-off queue' },
                { label: 'Equipment & Fleet', icon: 'tool' as const, path: '/projects/equipment', desc: 'Heavy machinery' },
                { label: 'Portfolios', icon: 'layers' as const, path: '/projects/portfolios', desc: 'Enterprise groups' },
              ].map(cmd => (
                <div
                  key={cmd.path}
                  className="project-cmd-btn"
                  onClick={() => navigate(cmd.path)}
                >
                  <Icon name={cmd.icon} size={15} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 500 }}>{cmd.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Budget Utilization Breakdown */}
          {totalBudget > 0 && (
            <SectionCard
              title="Budget Leaders"
              collapsible
              action={
                <Link to="/projects/budgets" style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>
                  Details &rarr;
                </Link>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {projects
                  .filter(p => (p.baseline_budget || 0) > 0)
                  .sort((a, b) => (b.baseline_budget || 0) - (a.baseline_budget || 0))
                  .slice(0, 5)
                  .map(p => {
                    const pct = Math.min(100, Math.round(((p.actual_cost || 0) / (p.baseline_budget || 1)) * 100));
                    const isOver = pct > 90;
                    return (
                      <div key={p.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          <span style={{ color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
                            {p.name}
                          </span>
                          <span style={{ color: isOver ? 'var(--red)' : 'var(--ink3)' }}>
                            {pct}% ({money(p.actual_cost, p.currency)})
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 3,
                              background: isOver ? 'var(--red)' : 'var(--teal)',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </SectionCard>
          )}

          {/* Upcoming Target Deadlines */}
          {projects.some(p => p.target_date) && (
            <SectionCard title="Upcoming Target Deadlines" collapsible>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects
                  .filter(p => p.target_date)
                  .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
                  .slice(0, 4)
                  .map(p => {
                    const cd = formatCountdown(p.target_date);
                    return (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', cursor: 'pointer' }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                            Target: {p.target_date}
                          </div>
                        </div>
                        {cd && (
                          <Badge variant={cd.isOverdue ? 'error' : cd.isNear ? 'warning' : 'gray'}>
                            {cd.text}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Quick Project Creation Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <form onSubmit={handleQuickCreate} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DialogHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <DialogTitle style={{ fontSize: 17, fontWeight: 800 }}>Create New Project</DialogTitle>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                Initialize a project workspace with scope, financial baseline, and dates.
              </div>
            </DialogHeader>

            <DialogBody style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Project Name <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <Input
                  required
                  placeholder="e.g. Kilwa Port Berth Extension Project"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Industry Pack
                  </label>
                  <Select value={newIndustry} onValueChange={setNewIndustry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(ind => (
                        <SelectItem key={ind} value={ind}>
                          {ind.replace('_', ' ').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Currency
                  </label>
                  <Select value={newCurrency} onValueChange={setNewCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['TZS', 'USD', 'KES', 'EUR', 'GBP', 'UGX'].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Baseline Budget (BAC)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newBudget}
                    onChange={e => setNewBudget(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Contract Value
                  </label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newContractVal}
                    onChange={e => setNewContractVal(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Start Date
                  </label>
                  <DatePicker
                    date={parseDateOnly(newStartDate)}
                    onChange={d => setNewStartDate(toDateOnlyString(d))}
                    placeholder="Start date"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    Target Completion Date
                  </label>
                  <DatePicker
                    date={parseDateOnly(newTargetDate)}
                    onChange={d => setNewTargetDate(toDateOnlyString(d))}
                    placeholder="Target date"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                  Scope & Objectives
                </label>
                <Textarea
                  placeholder="Outline key deliverables, constraints, and project objectives..."
                  rows={3}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setCreateOpen(false); navigate('/projects/new'); }}
                style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Advanced Setup Wizard &rarr;
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !newTitle.trim()}>
                  {creating ? 'Creating…' : 'Create Project'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
