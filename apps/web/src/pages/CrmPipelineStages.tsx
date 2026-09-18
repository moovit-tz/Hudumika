import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ArrowUp, ArrowDown, Trash2, Settings, Kanban,
  CheckCircle2, XCircle, Clock, Search, Layers,
  Sparkles, Check, ChevronRight, BarChart3, HelpCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Badge } from '../components/ui/badge.js';
import { Switch } from '../components/ui/switch.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.js';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui/select.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../components/ui/dropdown-menu.js';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '../components/ui/dialog.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  active: boolean;
  deal_count: number;
}

// Canonical soft-tint palette Pipeline.tsx's kanban columns draw from — a
// stage's `color` field is one of these names, never a raw hex, so a
// SuperAdmin theme/preset switch still reaches this page (see CLAUDE.md's
// "soft-tint backgrounds" rule).
export const STAGE_COLORS: Record<string, { fg: string; bg: string; border: string; name: string }> = {
  gold:   { fg: 'var(--gold)',   bg: 'var(--gold-l)',   border: 'var(--gold)',   name: 'Gold' },
  blue:   { fg: 'var(--blue)',   bg: 'var(--blue-l)',   border: 'var(--blue)',   name: 'Blue' },
  teal:   { fg: 'var(--teal)',   bg: 'var(--teal-l)',   border: 'var(--teal)',   name: 'Teal' },
  green:  { fg: 'var(--green)',  bg: 'var(--green-l)',  border: 'var(--green)',  name: 'Green' },
  red:    { fg: 'var(--red)',    bg: 'var(--red-l)',    border: 'var(--red)',    name: 'Red' },
  purple: { fg: 'var(--purple)', bg: 'var(--purple-l)', border: 'var(--purple)', name: 'Purple' },
};
const COLOR_NAMES = Object.keys(STAGE_COLORS);

type FilterTab = 'all' | 'active' | 'terminal' | 'open';

export function CrmPipelineStages() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [quickLabel, setQuickLabel] = useState('');
  const [quickColor, setQuickColor] = useState('blue');
  const [quickBusy, setQuickBusy] = useState(false);

  // Edit / Configuration Dialog state
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [editMilestone, setEditMilestone] = useState<'open' | 'won' | 'lost'>('open');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // New Stage Dialog state
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newDialogLabel, setNewDialogLabel] = useState('');
  const [newDialogColor, setNewDialogColor] = useState('teal');
  const [newDialogMilestone, setNewDialogMilestone] = useState<'open' | 'won' | 'lost'>('open');
  const [creatingDialog, setCreatingDialog] = useState(false);

  const load = useCallback(() => {
    apiFetch('/v1/crm/pipeline-stages')
      .then((data: any) => setStages(data))
      .catch(() => setStages([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Quick inline add
  async function handleQuickAdd() {
    const trimmed = quickLabel.trim();
    if (!trimmed) return;
    setQuickBusy(true);
    try {
      await apiFetch('/v1/crm/pipeline-stages', {
        method: 'POST',
        body: JSON.stringify({ label: trimmed, color: quickColor }),
      });
      setQuickLabel('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add stage');
    } finally {
      setQuickBusy(false);
    }
  }

  // Modal create
  async function handleModalCreate() {
    const trimmed = newDialogLabel.trim();
    if (!trimmed) return;
    setCreatingDialog(true);
    try {
      await apiFetch('/v1/crm/pipeline-stages', {
        method: 'POST',
        body: JSON.stringify({
          label: trimmed,
          color: newDialogColor,
          is_won: newDialogMilestone === 'won',
          is_lost: newDialogMilestone === 'lost',
        }),
      });
      setIsNewDialogOpen(false);
      setNewDialogLabel('');
      setNewDialogColor('teal');
      setNewDialogMilestone('open');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create stage');
    } finally {
      setCreatingDialog(false);
    }
  }

  // Patch stage helper
  async function patchStage(s: PipelineStage, body: Record<string, unknown>) {
    try {
      await apiFetch(`/v1/crm/pipeline-stages/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update stage');
    }
  }

  // Open modal edit
  function openEditModal(stage: PipelineStage) {
    setEditingStage(stage);
    setEditLabel(stage.label);
    setEditColor(stage.color);
    setEditMilestone(stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open');
    setEditActive(stage.active);
  }

  // Save modal edit
  async function handleSaveEdit() {
    if (!editingStage) return;
    const trimmed = editLabel.trim();
    if (!trimmed) {
      showAlert('Stage name is required');
      return;
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/v1/crm/pipeline-stages/${editingStage.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: trimmed,
          color: editColor,
          is_won: editMilestone === 'won',
          is_lost: editMilestone === 'lost',
          active: editActive,
        }),
      });
      setEditingStage(null);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update stage');
    } finally {
      setSavingEdit(false);
    }
  }

  // Move stage
  async function moveStage(s: PipelineStage, dir: -1 | 1) {
    if (!stages) return;
    const idx = stages.findIndex((x) => x.id === s.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    const ids = stages.map((x) => x.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    try {
      await apiFetch('/v1/crm/pipeline-stages/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to reorder stages');
    }
  }

  // Delete stage
  async function removeStage(s: PipelineStage) {
    if (s.deal_count > 0) {
      showAlert(
        `${s.deal_count} deal${s.deal_count === 1 ? ' is' : 's are'} currently in "${s.label}". Please move them to another stage before deleting.`
      );
      return;
    }
    const confirmed = await showConfirm(
      `Delete the "${s.label}" stage from the CRM pipeline? This action cannot be undone.`,
      { confirmLabel: 'Delete Stage' }
    );
    if (!confirmed) return;
    try {
      await apiFetch(`/v1/crm/pipeline-stages/${s.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete stage');
    }
  }

  // Derived metrics
  const metrics = useMemo(() => {
    if (!stages) return { total: 0, active: 0, openDeals: 0, wonDeals: 0, lostDeals: 0, totalDeals: 0 };
    const total = stages.length;
    const active = stages.filter((s) => s.active).length;
    const wonStage = stages.find((s) => s.is_won);
    const lostStage = stages.find((s) => s.is_lost);
    const wonDeals = wonStage?.deal_count ?? 0;
    const lostDeals = lostStage?.deal_count ?? 0;
    const openDeals = stages
      .filter((s) => !s.is_won && !s.is_lost)
      .reduce((acc, s) => acc + (s.deal_count || 0), 0);
    const totalDeals = stages.reduce((acc, s) => acc + (s.deal_count || 0), 0);
    return { total, active, openDeals, wonDeals, lostDeals, totalDeals, wonStage, lostStage };
  }, [stages]);

  // Filtered stage rows
  const filteredStages = useMemo(() => {
    if (!stages) return [];
    return stages.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesLabel = s.label.toLowerCase().includes(q);
        const matchesKey = s.key.toLowerCase().includes(q);
        if (!matchesLabel && !matchesKey) return false;
      }
      if (filterTab === 'active') return s.active;
      if (filterTab === 'terminal') return s.is_won || s.is_lost;
      if (filterTab === 'open') return !s.is_won && !s.is_lost;
      return true;
    });
  }, [stages, search, filterTab]);

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['CRM', 'Settings', 'Pipeline Stages']}
        titlePlain="Pipeline"
        titleEm="stages"
        subtitle="Manage deal progression columns, outcome milestones, column colors, and Kanban board visibility."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/crm/pipeline')}
              className="gap-2"
            >
              <Kanban className="h-4 w-4 text-muted-foreground" />
              <span>View Pipeline Board</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsNewDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Stage</span>
            </Button>
          </div>
        }
      />

      {/* ── Metric KPI Strip ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Active Stages */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4.5 shadow-sm transition-all hover:shadow-md">
          <FeaturedIcon variant="brand" size="md" shape="square">
            <Layers className="h-5 w-5" />
          </FeaturedIcon>
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-extrabold tracking-tight text-foreground">
              {stages ? `${metrics.active}/${metrics.total}` : '—'}
            </div>
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">
              Active Stages in Funnel
            </div>
          </div>
        </div>

        {/* Live Open Deals */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4.5 shadow-sm transition-all hover:shadow-md">
          <FeaturedIcon variant="info" size="md" shape="square">
            <BarChart3 className="h-5 w-5" />
          </FeaturedIcon>
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-extrabold tracking-tight text-foreground">
              {stages ? metrics.openDeals : '—'}
            </div>
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">
              Active Deals In Progress
            </div>
          </div>
        </div>

        {/* Closed Won Milestone */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4.5 shadow-sm transition-all hover:shadow-md">
          <FeaturedIcon variant="success" size="md" shape="square">
            <CheckCircle2 className="h-5 w-5" />
          </FeaturedIcon>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">
                {stages ? metrics.wonDeals : '—'}
              </span>
              {metrics.wonStage && (
                <span className="truncate text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {metrics.wonStage.label}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">
              Deals Closed Won
            </div>
          </div>
        </div>

        {/* Closed Lost Milestone */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4.5 shadow-sm transition-all hover:shadow-md">
          <FeaturedIcon variant="error" size="md" shape="square">
            <XCircle className="h-5 w-5" />
          </FeaturedIcon>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground">
                {stages ? metrics.lostDeals : '—'}
              </span>
              {metrics.lostStage && (
                <span className="truncate text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {metrics.lostStage.label}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">
              Deals Closed Lost
            </div>
          </div>
        </div>
      </div>

      {/* ── Visual Pipeline Progression Stepper ── */}
      <Card className="border border-border/80 bg-card shadow-sm">
        <CardHeader className="pb-3 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Pipeline Funnel Flow
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Visual progression order as deals move through active stages toward close.
              </CardDescription>
            </div>
            <Badge variant="brand" className="text-xs font-medium">
              {stages?.filter((s) => s.active).length ?? 0} Visible Stages
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-5 pt-0">
          {stages === null ? (
            <SectionLoading />
          ) : stages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No pipeline stages configured. Add your first stage below.
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {stages.map((s, idx) => {
                const col = STAGE_COLORS[s.color] ?? STAGE_COLORS.blue;
                const isLast = idx === stages.length - 1;
                return (
                  <React.Fragment key={s.id}>
                    <div
                      onClick={() => openEditModal(s)}
                      className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 shadow-xs transition-all hover:border-primary/50 hover:shadow-sm ${
                        !s.active ? 'opacity-40 grayscale' : ''
                      }`}
                      style={{ minWidth: 160 }}
                    >
                      {/* Left accent bar */}
                      <span
                        className="h-7 w-1 rounded-full shrink-0"
                        style={{ backgroundColor: col.fg }}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <span className="truncate text-xs font-bold text-foreground group-hover:text-primary">
                            {s.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {s.deal_count} {s.deal_count === 1 ? 'deal' : 'deals'}
                          </span>
                          {s.is_won && (
                            <Badge variant="success" className="h-4 px-1.5 text-[9px] font-bold">
                              WON
                            </Badge>
                          )}
                          {s.is_lost && (
                            <Badge variant="error" className="h-4 px-1.5 text-[9px] font-bold">
                              LOST
                            </Badge>
                          )}
                          {!s.active && (
                            <Badge variant="gray" className="h-4 px-1.5 text-[9px] font-bold">
                              HIDDEN
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isLast && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Main Stage Management Table / List Card ── */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border/80 pb-4 pt-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Configured Stages
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Reorder columns, configure outcome triggers, edit titles, and control kanban display.
              </CardDescription>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filter Tabs */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                {(
                  [
                    { id: 'all', label: 'All Stages' },
                    { id: 'open', label: 'In Progress' },
                    { id: 'terminal', label: 'Milestones' },
                    { id: 'active', label: 'Active Only' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                      filterTab === tab.id
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-44 md:w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stages…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Quick Add Stage Strip */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-border/80 bg-muted/30 p-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                value={quickLabel}
                onChange={(e) => setQuickLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickAdd();
                }}
                placeholder="Add new stage — e.g. Technical Review, Contract Sent"
                className="h-8.5 text-xs bg-background"
              />
            </div>

            {/* Color Select */}
            <Select value={quickColor} onValueChange={setQuickColor}>
              <SelectTrigger className="h-8.5 w-32 text-xs bg-background">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: STAGE_COLORS[quickColor]?.fg }}
                  />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {COLOR_NAMES.map((c) => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: STAGE_COLORS[c]?.fg }}
                      />
                      <span>{STAGE_COLORS[c]?.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={!quickLabel.trim() || quickBusy}
              onClick={handleQuickAdd}
              className="gap-1.5 h-8.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Stage</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {stages === null ? (
            <div className="p-8">
              <SectionLoading />
            </div>
          ) : filteredStages.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <FeaturedIcon variant="gray" size="lg" shape="circle" className="mb-3">
                <Layers className="h-6 w-6 text-muted-foreground" />
              </FeaturedIcon>
              <div className="text-sm font-bold text-foreground">No stages found</div>
              <div className="mt-1 text-xs text-muted-foreground max-w-sm">
                {search
                  ? `No pipeline stages match the filter "${search}".`
                  : 'Get started by configuring your sales progression stages.'}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredStages.map((s) => {
                const fullIndex = stages.findIndex((x) => x.id === s.id);
                const isFirst = fullIndex === 0;
                const isLast = fullIndex === stages.length - 1;
                const col = STAGE_COLORS[s.color] ?? STAGE_COLORS.blue;

                return (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-3 p-3.5 px-5 transition-colors hover:bg-muted/30 ${
                      !s.active ? 'opacity-55' : ''
                    }`}
                  >
                    {/* Reorder Buttons */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <Tip label="Move up in pipeline">
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => moveStage(s, -1)}
                          className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                      <Tip label="Move down in pipeline">
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => moveStage(s, 1)}
                          className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </Tip>
                    </div>

                    {/* Step Position Indicator */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 text-xs font-bold text-muted-foreground">
                      {String(fullIndex + 1).padStart(2, '0')}
                    </div>

                    {/* Stage Color Dot / Recolor Menu */}
                    <DropdownMenu>
                      <Tip label="Change stage color">
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/80 transition-transform hover:scale-105"
                            style={{ backgroundColor: col.bg }}
                          >
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: col.fg }}
                            />
                          </button>
                        </DropdownMenuTrigger>
                      </Tip>
                      <DropdownMenuContent align="start" className="w-36">
                        <DropdownMenuLabel>Stage Color</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {COLOR_NAMES.map((c) => (
                          <DropdownMenuItem
                            key={c}
                            onClick={() => patchStage(s, { color: c })}
                            className="flex items-center gap-2"
                          >
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: STAGE_COLORS[c]?.fg }}
                            />
                            <span>{STAGE_COLORS[c]?.name}</span>
                            {s.color === c && (
                              <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Stage Title Inline Input */}
                    <div className="min-w-0 flex-1 flex flex-col md:flex-row md:items-center gap-2">
                      <input
                        defaultValue={s.label}
                        key={s.id + s.label}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== s.label) patchStage(s, { label: v });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="rounded-lg border border-transparent bg-transparent px-2.5 py-1 text-sm font-bold text-foreground transition-all hover:border-border focus:border-primary focus:bg-background focus:outline-none w-full md:w-64"
                        placeholder="Stage label"
                      />

                      {/* System Key Tag */}
                      <code className="hidden sm:inline-block rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10.5px] font-mono text-muted-foreground">
                        {s.key}
                      </code>
                    </div>

                    {/* Live Deal Count */}
                    <div className="shrink-0 text-right pr-2">
                      <Tip label="Active deals currently in this stage">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{s.deal_count}</span>
                          <span className="text-[11px] text-muted-foreground font-normal">
                            {s.deal_count === 1 ? 'deal' : 'deals'}
                          </span>
                        </span>
                      </Tip>
                    </div>

                    {/* Milestone Classification Pills */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Won Toggle */}
                      <Tip label="Mark deals entering this stage as Won Revenue">
                        <button
                          type="button"
                          onClick={() =>
                            patchStage(s, {
                              is_won: !s.is_won,
                              is_lost: s.is_won ? s.is_lost : false,
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
                            s.is_won
                              ? 'bg-[var(--green-l)] text-[var(--green)] border border-[var(--green)]/40 shadow-xs'
                              : 'border border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Won</span>
                        </button>
                      </Tip>

                      {/* Lost Toggle */}
                      <Tip label="Mark deals entering this stage as Closed Lost">
                        <button
                          type="button"
                          onClick={() =>
                            patchStage(s, {
                              is_lost: !s.is_lost,
                              is_won: s.is_lost ? s.is_won : false,
                            })
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
                            s.is_lost
                              ? 'bg-[var(--red-l)] text-[var(--red)] border border-[var(--red)]/40 shadow-xs'
                              : 'border border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                          }`}
                        >
                          <XCircle className="h-3 w-3" />
                          <span>Lost</span>
                        </button>
                      </Tip>
                    </div>

                    {/* Active Kanban Switch */}
                    <div className="hidden sm:flex items-center gap-2 pl-2 shrink-0">
                      <Tip label={s.active ? 'Visible on Pipeline Kanban board' : 'Hidden from Kanban board'}>
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={s.active}
                            onCheckedChange={(checked) => patchStage(s, { active: checked })}
                          />
                          <span className="text-xs font-medium text-muted-foreground w-12 text-left">
                            {s.active ? 'Active' : 'Hidden'}
                          </span>
                        </div>
                      </Tip>
                    </div>

                    {/* Row Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Stage Options</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => openEditModal(s)}>
                          <Settings className="text-muted-foreground" />
                          <span>Configure Details</span>
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: col.fg }}
                            />
                            <span>Color Theme</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {COLOR_NAMES.map((c) => (
                              <DropdownMenuItem
                                key={c}
                                onClick={() => patchStage(s, { color: c })}
                                className="flex items-center gap-2"
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: STAGE_COLORS[c]?.fg }}
                                />
                                <span>{STAGE_COLORS[c]?.name}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem
                          disabled={isFirst}
                          onClick={() => moveStage(s, -1)}
                        >
                          <ArrowUp className="text-muted-foreground" />
                          <span>Move Up</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isLast}
                          onClick={() => moveStage(s, 1)}
                        >
                          <ArrowDown className="text-muted-foreground" />
                          <span>Move Down</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => patchStage(s, { active: !s.active })}
                        >
                          <Layers className="text-muted-foreground" />
                          <span>{s.active ? 'Hide from Kanban' : 'Show on Kanban'}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => removeStage(s)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 />
                          <span>Delete Stage</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Guidelines Accordion / Info Card ── */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4.5">
        <div className="flex items-start gap-3">
          <FeaturedIcon variant="brand" size="sm" shape="circle" className="mt-0.5">
            <HelpCircle className="h-4 w-4" />
          </FeaturedIcon>
          <div className="space-y-1">
            <div className="text-xs font-bold text-foreground">
              Pipeline Stage Best Practices
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              • Maintain 4 to 7 distinct stages for optimal CRM conversion tracking.<br />
              • Mark one terminal stage as <strong>Won</strong> and another as <strong>Lost</strong> to ensure win-rate and deal closing metrics calculate accurately.<br />
              • Stages cannot be deleted while containing active deals — move deals to another stage first to preserve audit history.
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Dialog: Edit / Configure Stage ── */}
      <Dialog
        open={editingStage !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStage(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Configure Stage</DialogTitle>
            <DialogDescription>
              Adjust properties, color theme, and milestone behavior for "{editingStage?.label}".
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Stage Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Stage Name
              </label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="e.g. Contract Negotiation"
                className="text-sm"
              />
            </div>

            {/* Color Swatch */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Accent Color
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {COLOR_NAMES.map((c) => {
                  const isSelected = editColor === c;
                  const item = STAGE_COLORS[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.fg }}
                      />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Outcome Milestone */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Milestone Classification
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setEditMilestone('open')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    editMilestone === 'open'
                      ? 'border-primary bg-[var(--teal-l)] text-[var(--teal)] ring-2 ring-primary/20'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>In Progress</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Active funnel column
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditMilestone('won')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    editMilestone === 'won'
                      ? 'border-emerald-500 bg-[var(--green-l)] text-[var(--green)] ring-2 ring-emerald-500/20'
                      : 'border-border bg-card text-muted-foreground hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Closed Won</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Counts as won revenue
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditMilestone('lost')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    editMilestone === 'lost'
                      ? 'border-rose-500 bg-[var(--red-l)] text-[var(--red)] ring-2 ring-rose-500/20'
                      : 'border-border bg-card text-muted-foreground hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Closed Lost</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Terminal lost deal
                  </span>
                </button>
              </div>
            </div>

            {/* Kanban Visibility Switch */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3.5">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Show on Kanban Board
                </div>
                <div className="text-[11px] text-muted-foreground">
                  When enabled, this stage appears as an active column in the CRM Pipeline view.
                </div>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>

            {/* Deal Count Warning */}
            {editingStage && editingStage.deal_count > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>
                  This stage currently holds <strong>{editingStage.deal_count}</strong> active {editingStage.deal_count === 1 ? 'deal' : 'deals'}.
                </span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingStage(null)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveEdit}
              disabled={savingEdit || !editLabel.trim()}
            >
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Dialog: Create New Stage ── */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add Pipeline Stage</DialogTitle>
            <DialogDescription>
              Create a new stage column to track deals through your sales funnel.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Stage Name
              </label>
              <Input
                value={newDialogLabel}
                onChange={(e) => setNewDialogLabel(e.target.value)}
                placeholder="e.g. Solution Demo, Legal Review"
                className="text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Accent Color
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {COLOR_NAMES.map((c) => {
                  const isSelected = newDialogColor === c;
                  const item = STAGE_COLORS[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewDialogColor(c)}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.fg }}
                      />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Stage Role
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setNewDialogMilestone('open')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    newDialogMilestone === 'open'
                      ? 'border-primary bg-[var(--teal-l)] text-[var(--teal)] ring-2 ring-primary/20'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>In Progress</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Standard column</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewDialogMilestone('won')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    newDialogMilestone === 'won'
                      ? 'border-emerald-500 bg-[var(--green-l)] text-[var(--green)] ring-2 ring-emerald-500/20'
                      : 'border-border bg-card text-muted-foreground hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Closed Won</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Terminal Won</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewDialogMilestone('lost')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                    newDialogMilestone === 'lost'
                      ? 'border-rose-500 bg-[var(--red-l)] text-[var(--red)] ring-2 ring-rose-500/20'
                      : 'border-border bg-card text-muted-foreground hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Closed Lost</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Terminal Lost</span>
                </button>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewDialogOpen(false)}
              disabled={creatingDialog}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleModalCreate}
              disabled={creatingDialog || !newDialogLabel.trim()}
            >
              {creatingDialog ? 'Creating…' : 'Create Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
