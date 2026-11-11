import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Icon } from '../components/Icon.js';
import { Tip } from '../components/ui/tooltip.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from '../components/ui/dialog.js';
import { formatAmount } from '../lib/currency.js';
import { getCompany } from '../data/companyStore.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './CrmQuotaTargets.css';

interface QuotaRow {
  user_id: string;
  user_name: string | null;
  period: string;
  target_value: number;
  target_count: number;
  won_value?: number;
  won_count?: number;
  attainment_pct?: number | null;
  count_pct?: number | null;
}

interface UserOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

function formatPeriod(p: string) {
  const [y, m] = p.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function prevPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function CrmQuotaTargets() {
  const currency = getCompany().currency || 'USD';

  // State
  const [period, setPeriod]                 = useState(currentPeriod);
  const [rows, setRows]                     = useState<QuotaRow[] | null>(null);
  const [users, setUsers]                   = useState<UserOption[]>([]);
  const [edits, setEdits]                   = useState<Record<string, { value: string; count: string }>>({});
  const [saving, setSaving]                 = useState<string | null>(null);
  const [copyingPrevious, setCopyingPrevious] = useState(false);

  // Search & Filter
  const [search, setSearch]                 = useState('');
  const [attainmentFilter, setAttainmentFilter] = useState<string>('ALL');
  const [sortBy, setSortBy]                 = useState<string>('name');

  // Add Rep Modal
  const [showAddModal, setShowAddModal]     = useState(false);
  const [selectedRepId, setSelectedRepId]   = useState<string>('');
  const [newTargetValue, setNewTargetValue] = useState<string>('50000');
  const [newTargetCount, setNewTargetCount] = useState<string>('10');
  const [addingRep, setAddingRep]           = useState(false);

  const load = useCallback(() => {
    setRows(null);
    Promise.all([
      apiFetch(`/v1/crm/quotas?period=${period}`),
      apiFetch(`/v1/crm/quotas/attainment?period=${period}`),
    ]).then(([quotas, attainment]: any) => {
      const attMap = new Map((attainment as QuotaRow[]).map(a => [a.user_id, a]));
      const qList: any[] = Array.isArray(quotas) ? quotas : quotas.items ?? quotas.data ?? [];
      const merged: QuotaRow[] = qList.map(q => ({
        ...q,
        target_value: Number(q.target_value || 0),
        target_count: Number(q.target_count || 0),
        ...(attMap.get(q.user_id) ?? {}),
      }));
      setRows(merged);
      setEdits({});
    }).catch((err: any) => {
      showAlert(err.message || 'Failed to load quota targets', { variant: 'error' });
      setRows([]);
    });
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch('/v1/ondi/users')
      .then((r: any) => {
        const all: any[] = Array.isArray(r) ? r : [];
        const SALES_ROLES = new Set(['SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'MANAGER', 'ADMIN', 'TENANT_ADMIN']);
        setUsers(all.filter((u: any) => SALES_ROLES.has(u.role) && u.active !== false).map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        })));
      })
      .catch(() => setUsers([]));
  }, []);

  // Untracked reps for current period
  const usersWithoutQuota = useMemo(() => {
    return users.filter(u => !rows?.some(r => r.user_id === u.id));
  }, [users, rows]);

  // Executive KPI summary calculations
  const { totalTarget, totalWon, teamAttainment, totalTargetCount, totalWonCount, countAttainment, topPerformer } = useMemo(() => {
    if (!rows || rows.length === 0) {
      return { totalTarget: 0, totalWon: 0, teamAttainment: 0, totalTargetCount: 0, totalWonCount: 0, countAttainment: 0, topPerformer: null };
    }
    const tVal = rows.reduce((s, r) => s + (Number(r.target_value) || 0), 0);
    const wVal = rows.reduce((s, r) => s + (Number(r.won_value) || 0), 0);
    const tCnt = rows.reduce((s, r) => s + (Number(r.target_count) || 0), 0);
    const wCnt = rows.reduce((s, r) => s + (Number(r.won_count) || 0), 0);

    const attPct = tVal > 0 ? Math.round((wVal / tVal) * 100) : 0;
    const cntPct = tCnt > 0 ? Math.round((wCnt / tCnt) * 100) : 0;

    let best: QuotaRow | null = null;
    for (const r of rows) {
      if (r.attainment_pct != null) {
        if (!best || (r.attainment_pct > (best.attainment_pct ?? 0))) {
          best = r;
        }
      }
    }

    return {
      totalTarget: tVal,
      totalWon: wVal,
      teamAttainment: attPct,
      totalTargetCount: tCnt,
      totalWonCount: wCnt,
      countAttainment: cntPct,
      topPerformer: best,
    };
  }, [rows]);

  // Days and month progress
  const { daysPassed, daysInMonth, monthProgress } = useMemo(() => {
    const [y, m] = period.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const isCurrent = period === currentPeriod();
    const passed = isCurrent
      ? Math.min(new Date().getDate(), totalDays)
      : (new Date(y, m - 1, 1) < new Date() ? totalDays : 0);
    return {
      daysPassed: passed,
      daysInMonth: totalDays,
      monthProgress: Math.round((passed / totalDays) * 100),
    };
  }, [period]);

  // Filtered & Sorted rows
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    let list = [...rows];

    if (search.trim()) {
      const ql = search.trim().toLowerCase();
      list = list.filter(r => (r.user_name || '').toLowerCase().includes(ql));
    }

    if (attainmentFilter === 'MET') {
      list = list.filter(r => (r.attainment_pct ?? 0) >= 100);
    } else if (attainmentFilter === 'PROGRESS') {
      list = list.filter(r => (r.attainment_pct ?? 0) >= 70 && (r.attainment_pct ?? 0) < 100);
    } else if (attainmentFilter === 'BEHIND') {
      list = list.filter(r => (r.attainment_pct ?? 0) < 70);
    }

    if (sortBy === 'name') {
      list.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || ''));
    } else if (sortBy === 'target') {
      list.sort((a, b) => b.target_value - a.target_value);
    } else if (sortBy === 'won') {
      list.sort((a, b) => (b.won_value ?? 0) - (a.won_value ?? 0));
    } else if (sortBy === 'attainment') {
      list.sort((a, b) => (b.attainment_pct ?? 0) - (a.attainment_pct ?? 0));
    }

    return list;
  }, [rows, search, attainmentFilter, sortBy]);

  function getEdit(userId: string, row?: QuotaRow) {
    return edits[userId] ?? {
      value: String(row?.target_value ?? ''),
      count: String(row?.target_count ?? ''),
    };
  }

  function setEdit(userId: string, patch: Partial<{ value: string; count: string }>) {
    setEdits(e => ({ ...e, [userId]: { ...getEdit(userId), ...patch } }));
  }

  async function saveRow(userId: string, userName: string) {
    const e = getEdit(userId);
    setSaving(userId);
    try {
      await apiFetch('/v1/crm/quotas', {
        method: 'PUT',
        body: JSON.stringify({
          user_id: userId,
          period,
          target_value: Number(e.value) || 0,
          target_count: Number(e.count) || 0,
        }),
      });
      showAlert(`Quota target saved for ${userName}.`, { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || `Failed to save quota for ${userName}`, { variant: 'error' });
    } finally {
      setSaving(null);
    }
  }

  async function removeRow(userId: string, userName: string) {
    const ok = await showConfirm(`Remove sales quota target for ${userName} in ${formatPeriod(period)}?`, { confirmLabel: 'Remove Target' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/crm/quotas/${userId}/${period}`, { method: 'DELETE' });
      showAlert(`Quota target removed for ${userName}.`, { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove quota', { variant: 'error' });
    }
  }

  async function handleAddRep() {
    if (!selectedRepId) {
      showAlert('Please select a sales representative.', { variant: 'warning' });
      return;
    }
    setAddingRep(true);
    try {
      await apiFetch('/v1/crm/quotas', {
        method: 'PUT',
        body: JSON.stringify({
          user_id: selectedRepId,
          period,
          target_value: Number(newTargetValue) || 0,
          target_count: Number(newTargetCount) || 0,
        }),
      });
      setShowAddModal(false);
      setSelectedRepId('');
      showAlert('Sales rep target added successfully.', { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add sales rep target', { variant: 'error' });
    } finally {
      setAddingRep(false);
    }
  }

  async function handleCopyPreviousMonth() {
    const prev = prevPeriod(period);
    setCopyingPrevious(true);
    try {
      const prevQuotas: any = await apiFetch(`/v1/crm/quotas?period=${prev}`);
      const list: any[] = Array.isArray(prevQuotas) ? prevQuotas : prevQuotas.items ?? prevQuotas.data ?? [];
      if (!list || list.length === 0) {
        showAlert(`No quotas found in previous month (${formatPeriod(prev)}).`, { variant: 'warning' });
        return;
      }

      const ok = await showConfirm(
        `Copy ${list.length} quota targets from ${formatPeriod(prev)} into ${formatPeriod(period)}?`,
        { confirmLabel: 'Copy Targets' }
      );
      if (!ok) return;

      for (const item of list) {
        await apiFetch('/v1/crm/quotas', {
          method: 'PUT',
          body: JSON.stringify({
            user_id: item.user_id,
            period,
            target_value: Number(item.target_value) || 0,
            target_count: Number(item.target_count) || 0,
          }),
        });
      }
      showAlert(`Successfully copied ${list.length} targets from ${formatPeriod(prev)}!`, { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to copy previous month quotas', { variant: 'error' });
    } finally {
      setCopyingPrevious(false);
    }
  }

  function exportCSV() {
    if (!rows || rows.length === 0) {
      showAlert('No quota records to export for this period.', { variant: 'warning' });
      return;
    }
    const headers = ['Sales Rep', 'Period', 'Revenue Target', 'Won Revenue', 'Revenue Attainment %', 'Deal Count Target', 'Closed Deals', 'Deal Count Attainment %'];
    const csvRows = rows.map(r => [
      `"${r.user_name || 'Unknown'}"`,
      r.period,
      r.target_value ?? 0,
      r.won_value ?? 0,
      r.attainment_pct ?? 0,
      r.target_count ?? 0,
      r.won_count ?? 0,
      r.count_pct ?? 0,
    ]);
    const csv = [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-quotas-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showAlert(`Exported ${rows.length} sales rep targets to CSV.`, { variant: 'success' });
  }

  return (
    <div className="quota-page">
      {/* Page Header */}
      <PageHeader
        crumbs={['CRM', 'Sales Management', 'Quota Targets']}
        titlePlain="Quota"
        titleEm="targets"
        subtitle="Set monthly revenue goals and deal-count milestones per sales rep. Live attainment is calculated from Closed Won deals."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs gap-1.5 h-8">
              <Icon name="download" size={13} />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)} className="text-xs gap-1.5 h-8 font-semibold">
              <Icon name="plus" size={14} />
              <span>Add Rep Target</span>
            </Button>
          </div>
        }
      />

      {/* Period Navigation Bar */}
      <div className="quota-period-bar">
        <div className="quota-period-nav">
          <Tip label="Previous month">
            <Button
              variant="outline"
              size="icon"
              iconOnly
              onClick={() => setPeriod(prevPeriod(period))}
              aria-label="Previous Month"
              className="h-8 w-8"
            >
              <Icon name="chevronLeft" size={14} />
            </Button>
          </Tip>

          <div className="quota-period-display">
            <Icon name="calendar" size={14} className="text-primary shrink-0" />
            <span>{formatPeriod(period)}</span>
          </div>

          <Tip label="Next month">
            <Button
              variant="outline"
              size="icon"
              iconOnly
              onClick={() => setPeriod(nextPeriod(period))}
              aria-label="Next Month"
              className="h-8 w-8"
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </Tip>

          {period !== currentPeriod() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPeriod(currentPeriod())}
              className="text-xs text-primary font-semibold h-8"
            >
              Current Month
            </Button>
          )}
        </div>

        <div className="quota-period-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPreviousMonth}
            disabled={copyingPrevious}
            className="text-xs gap-1.5 h-8 text-foreground"
          >
            <Icon name="copy" size={13} />
            <span>{copyingPrevious ? 'Copying…' : 'Copy from Previous Month'}</span>
          </Button>
        </div>
      </div>

      {/* Executive KPI Metrics Deck */}
      <div className="quota-metrics-grid">
        {/* Card 1: Team Target */}
        <div className="quota-metric-card">
          <div className="quota-metric-top">
            <span className="quota-metric-label">Total Team Goal</span>
            <Icon name="target" size={16} className="text-primary" />
          </div>
          <div className="quota-metric-val">{formatAmount(totalTarget, currency)}</div>
          <div className="quota-metric-sub">
            <span>Reps Tracked:</span>
            <span className="font-bold text-foreground">{rows?.length ?? 0} reps</span>
          </div>
        </div>

        {/* Card 2: Actual Attainment */}
        <div className="quota-metric-card">
          <div className="quota-metric-top">
            <span className="quota-metric-label">Won Revenue (Attained)</span>
            <Icon name="trendingUp" size={16} className="text-emerald-500" />
          </div>
          <div className="quota-metric-val text-emerald-600">{formatAmount(totalWon, currency)}</div>
          <div className="quota-metric-sub">
            <span>Team Attainment:</span>
            <span className={`font-extrabold ${teamAttainment >= 100 ? 'text-emerald-600' : teamAttainment >= 70 ? 'text-amber-500' : 'text-destructive'}`}>
              {teamAttainment}% of Goal
            </span>
          </div>
        </div>

        {/* Card 3: Deal Count Milestone */}
        <div className="quota-metric-card">
          <div className="quota-metric-top">
            <span className="quota-metric-label">Deals Closed vs Goal</span>
            <Icon name="award" size={16} className="text-amber-500" />
          </div>
          <div className="quota-metric-val">
            {totalWonCount} <span className="text-xs text-muted-foreground font-normal">/ {totalTargetCount} deals</span>
          </div>
          <div className="quota-metric-sub">
            <span>Volume Progress:</span>
            <span className="font-bold text-foreground">{countAttainment}% achieved</span>
          </div>
        </div>

        {/* Card 4: Top Performer / Pace */}
        <div className="quota-metric-card">
          <div className="quota-metric-top">
            <span className="quota-metric-label">Top Performer</span>
            <Icon name="award" size={16} className="text-primary" />
          </div>
          <div className="quota-metric-val text-sm font-bold truncate">
            {topPerformer ? topPerformer.user_name || 'Top Rep' : '—'}
          </div>
          <div className="quota-metric-sub">
            <span>Highest Attainment:</span>
            <span className="font-extrabold text-emerald-600">
              {topPerformer?.attainment_pct != null ? `${topPerformer.attainment_pct}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Team Progress Banner */}
      <div className="quota-progress-banner">
        <div className="quota-progress-header">
          <span className="quota-progress-title">
            <Icon name="target" size={14} className="text-primary" />
            <span>Monthly Attainment Pacing</span>
          </span>
          <div className="quota-progress-stats">
            <span>Pace: <strong>Day {daysPassed} of {daysInMonth}</strong> ({monthProgress}% of month elapsed)</span>
            <span>Attained: <strong className="text-foreground">{formatAmount(totalWon, currency)}</strong> / {formatAmount(totalTarget, currency)}</span>
          </div>
        </div>
        <div className="quota-progress-track">
          <div
            className={`quota-progress-fill ${teamAttainment >= 100 ? 'is-green' : teamAttainment >= 70 ? 'is-amber' : 'is-red'}`}
            style={{ width: `${Math.min(100, teamAttainment)}%` }}
          />
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="quota-toolbar">
        <div className="quota-toolbar-filters">
          {/* Search Rep */}
          <div className="quota-search-box">
            <Icon name="search" size={14} className="quota-search-icon" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reps by name…"
              className="quota-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {/* Attainment Filter */}
          <Select value={attainmentFilter} onValueChange={setAttainmentFilter}>
            <SelectTrigger className="h-8.5 text-xs w-[160px]">
              <SelectValue placeholder="All Attainments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Performances</SelectItem>
              <SelectItem value="MET" className="text-xs">Target Met (≥ 100%)</SelectItem>
              <SelectItem value="PROGRESS" className="text-xs">In Progress (70–99%)</SelectItem>
              <SelectItem value="BEHIND" className="text-xs">At Risk (&lt; 70%)</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort By */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8.5 text-xs w-[150px]">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name" className="text-xs">Sort by Name</SelectItem>
              <SelectItem value="target" className="text-xs">Highest Target</SelectItem>
              <SelectItem value="won" className="text-xs">Most Won Revenue</SelectItem>
              <SelectItem value="attainment" className="text-xs">Highest Attainment %</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing <strong className="text-foreground">{filteredRows.length}</strong> of {rows?.length ?? 0} reps
        </div>
      </div>

      {/* Main Quota Targets List */}
      <div className="quota-card">
        <div className="quota-card-hdr">
          <div className="flex items-center gap-2">
            <Icon name="users" size={15} className="text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Sales Rep Quotas</h3>
            {rows && <Badge variant="outline" className="text-[10px]">{rows.length} tracked</Badge>}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Revenue and deal milestones for {formatPeriod(period)}
          </span>
        </div>

        {rows === null ? (
          <div className="p-12 text-center"><SectionLoading label="Loading sales quotas…" /></div>
        ) : rows.length === 0 ? (
          <div className="p-16 text-center">
            <Icon name="target" size={36} className="mx-auto mb-3 text-muted-foreground/50" />
            <h3 className="text-sm font-bold text-foreground">No quotas configured for {formatPeriod(period)}</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Add individual reps or copy targets from the previous month to start tracking performance.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1.5 font-semibold">
                <Icon name="plus" size={14} />
                <span>Add Sales Rep Target</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyPreviousMonth} className="gap-1.5">
                <Icon name="copy" size={13} />
                <span>Copy Previous Month</span>
              </Button>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            No sales reps match your current search/filter.
          </div>
        ) : (
          <div>
            {/* Table Head */}
            <div className="quota-table-head">
              <span>Sales Rep</span>
              <span>Attainment Progress</span>
              <span>Revenue Target</span>
              <span>Deals Goal</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Rep Rows */}
            <div className="divide-y divide-border">
              {filteredRows.map(row => {
                const e = getEdit(row.user_id, row);
                const isDirty = e.value !== String(row.target_value) || e.count !== String(row.target_count);
                const pct = row.attainment_pct;
                const wonVal = row.won_value ?? 0;
                const tgtVal = Number(e.value) || row.target_value || 0;
                const wonCnt = row.won_count ?? 0;
                const tgtCnt = Number(e.count) || row.target_count || 0;

                const statusColorClass = (pct ?? 0) >= 100 ? 'text-emerald-600' : (pct ?? 0) >= 70 ? 'text-amber-500' : 'text-destructive';
                const progressFillClass = (pct ?? 0) >= 100 ? 'bg-emerald-500' : (pct ?? 0) >= 70 ? 'bg-amber-500' : 'bg-destructive';

                return (
                  <div key={row.user_id} className="quota-rep-row">
                    {/* Identity */}
                    <div className="quota-rep-identity">
                      <PersonAvatar userId={row.user_id} name={row.user_name ?? '?'} size={34} />
                      <div className="quota-rep-name-group">
                        <div className="quota-rep-name">{row.user_name ?? 'Unknown Rep'}</div>
                        <div className="quota-rep-role">Sales Representative</div>
                      </div>
                    </div>

                    {/* Attainment Progress */}
                    <div className="quota-attainment-block">
                      <div className="quota-attainment-top">
                        <span>
                          <strong className="text-foreground font-mono">{formatAmount(wonVal, currency)}</strong>
                          <span className="text-muted-foreground"> / {formatAmount(tgtVal, currency)}</span>
                        </span>
                        <span className={`font-extrabold font-mono ${statusColorClass}`}>
                          {pct != null ? `${pct}%` : '0%'}
                        </span>
                      </div>
                      <div className="quota-mini-progress">
                        <div
                          className={`quota-mini-fill ${progressFillClass}`}
                          style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                        />
                      </div>
                      <div className="text-[10.5px] text-muted-foreground flex items-center justify-between mt-0.5">
                        <span>Deals closed: <strong>{wonCnt}</strong> of {tgtCnt}</span>
                        {(pct ?? 0) >= 100 ? (
                          <Badge variant="success" className="text-[9.5px] py-0 px-1">Goal Met</Badge>
                        ) : (pct ?? 0) >= 70 ? (
                          <Badge variant="warning" className="text-[9.5px] py-0 px-1">On Track</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[9.5px] py-0 px-1">At Risk</Badge>
                        )}
                      </div>
                    </div>

                    {/* Revenue Target Input */}
                    <div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                          $
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={e.value}
                          onChange={ev => setEdit(row.user_id, { value: ev.target.value })}
                          className="h-8.5 pl-6 text-xs font-mono font-semibold"
                          aria-label={`Revenue target for ${row.user_name}`}
                        />
                      </div>
                    </div>

                    {/* Deal Count Input */}
                    <div>
                      <Input
                        type="number"
                        min={0}
                        value={e.count}
                        onChange={ev => setEdit(row.user_id, { count: ev.target.value })}
                        className="h-8.5 text-xs font-mono font-semibold text-center"
                        aria-label={`Deal count target for ${row.user_name}`}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5">
                      {isDirty && (
                        <Tip label="Save quota changes">
                          <Button
                            size="sm"
                            onClick={() => saveRow(row.user_id, row.user_name ?? '')}
                            disabled={saving === row.user_id}
                            className="h-8 px-2.5 text-xs gap-1 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Icon name="save" size={13} />
                            <span>{saving === row.user_id ? '…' : 'Save'}</span>
                          </Button>
                        </Tip>
                      )}

                      <Tip label="Remove quota from this period">
                        <Button
                          variant="ghost"
                          size="icon"
                          iconOnly
                          onClick={() => removeRow(row.user_id, row.user_name ?? '')}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label={`Remove quota for ${row.user_name}`}
                        >
                          <Icon name="trash" size={13} />
                        </Button>
                      </Tip>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Untracked Reps Section */}
      {usersWithoutQuota.length > 0 && (
        <div className="quota-card">
          <div className="quota-card-hdr">
            <div className="flex items-center gap-2">
              <Icon name="plus" size={14} className="text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Available Sales Reps ({usersWithoutQuota.length})
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Reps in your team without active quotas in {formatPeriod(period)}
            </span>
          </div>

          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {usersWithoutQuota.map(u => (
              <div key={u.id} className="p-3 bg-muted/20 rounded-xl border border-border flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PersonAvatar userId={u.id} name={u.name} size={30} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">{u.name}</div>
                    <div className="text-[10.5px] text-muted-foreground capitalize">{u.role || 'Sales Rep'}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedRepId(u.id);
                    setShowAddModal(true);
                  }}
                  className="h-7 px-2 text-xs gap-1 shrink-0"
                >
                  <Icon name="plus" size={12} />
                  <span>Assign</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Rep Target Modal */}
      {showAddModal && (
        <Dialog open onOpenChange={o => { if (!o) setShowAddModal(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Icon name="target" size={16} className="text-primary" />
                <span>Assign Sales Quota Target</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 py-2 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Select Sales Representative *</label>
                <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose a sales representative…" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersWithoutQuota.map(u => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.name} {u.role ? `(${u.role})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">Target Period</label>
                <Input value={formatPeriod(period)} disabled className="h-9 text-xs bg-muted/40 font-semibold" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Revenue Target ({currency})</label>
                  <Input
                    type="number"
                    min={0}
                    value={newTargetValue}
                    onChange={e => setNewTargetValue(e.target.value)}
                    placeholder="e.g. 50000"
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Deal Count Goal</label>
                  <Input
                    type="number"
                    min={0}
                    value={newTargetCount}
                    onChange={e => setNewTargetCount(e.target.value)}
                    placeholder="e.g. 10"
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-3">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)} disabled={addingRep}>Cancel</Button>
              <Button size="sm" onClick={handleAddRep} disabled={addingRep || !selectedRepId} className="gap-1.5 font-semibold">
                <Icon name="plus" size={13} />
                <span>{addingRep ? 'Assigning…' : 'Assign Quota Target'}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
