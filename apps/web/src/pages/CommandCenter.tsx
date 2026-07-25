import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useShipments } from '../hooks/useShipments.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { FilterBar } from '../components/FilterBar.js';
import { TableHeader } from '../components/TableHeader.js';
import { CustomerGroup } from '../components/CustomerGroup.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { showAlert } from '../lib/alert.js';
import type { ShipmentCase, ShipmentType, Workflow } from '@hudumika/types';
import { CLEARANCE_STAGES, STAGE_LABELS } from '@hudumika/types';
import type { ClearanceStage } from '@hudumika/types';
import { Icon } from '../components/Icon.js';

/* ── @ Mention Officer Picker ─────────────────────────────────────────────── */
function OfficerMentionInput({
  officers,
  value,
  onChange,
}: {
  officers: any[];
  value: { id: string; name: string };
  onChange: (id: string, name: string) => void;
}) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  const q = query.replace(/^@/, '').toLowerCase();
  const filtered = officers.filter(o =>
    !q || o.name.toLowerCase().includes(q) || (o.role || '').toLowerCase().includes(q)
  );

  const avatarColor = (name: string) => {
    const colors = ['#0b7264','#7c3aed','#0891b2','#ea580c','#059669','#dc2626','#d97706'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
    return colors[Math.abs(h) % colors.length];
  };

  const select = (o: any) => {
    onChange(o.user_id || o.id, o.name);
    setQuery('');
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const inits = (name: string) =>
    name.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          onClick={() => { setOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
            border: `1px solid ${open ? 'var(--teal)' : 'var(--border)'}`,
            borderRadius: 7, background: 'var(--white)', cursor: 'text',
            boxShadow: open ? '0 0 0 2px var(--teal-l)' : 'none', transition: 'border-color .15s, box-shadow .15s',
            minHeight: 36,
          }}
        >
          {value.id ? (
            <>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(value.name), color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {inits(value.name)}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, fontWeight: 600 }}>{value.name}</span>
              <button type="button" onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </>
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder="Type @ to search staff…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              style={{ border: 'none', outline: 'none', fontSize: 13, color: 'var(--ink)', background: 'transparent', flex: 1, fontFamily: 'var(--font)', padding: 0 }}
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5 max-h-[220px] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>No staff found</div>
        ) : filtered.slice(0, 8).map(o => (
          <button
            key={o.user_id || o.id}
            type="button"
            onClick={() => select(o)}
            className="rounded-lg hover:bg-accent hover:text-accent-foreground"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
          >
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(o.name), color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {inits(o.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{o.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                {(o.role || '').replace(/_/g, ' ')}{o.department ? ` · ${o.department}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 700, background: 'var(--teal-l)', padding: '1px 7px', borderRadius: 20, flexShrink: 0 }}>
              @{o.name.split(' ')[0].toLowerCase()}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type Metric = 'active' | 'demurrage' | 'sla' | 'delivered' | null;

/* ── Stage colour for board columns — column order + label already carry
   "which stage", so this isn't a per-stage hue anymore, just two states:
   still in the customs process (brand teal) vs. released/completed (green). */
const STAGE_COLORS: Partial<Record<ClearanceStage, string>> = {
  DOCS_RECEIVED:      'var(--teal)', VALIDATION:   'var(--teal)', PERMITS:       'var(--teal)',
  ENTRY_PREP:         'var(--teal)', TANCIS_REG:   'var(--teal)', ASSESSMENT:    'var(--teal)',
  TAX_PAYMENT:        'var(--teal)', DO_APPLICATION:'var(--teal)', INSPECTION_BOOKING:'var(--teal)',
  INSPECTION:         'var(--teal)', GOV_REMARKS:  'var(--teal)', RELEASE:       'var(--green)',
  ICD_PAYMENT:        'var(--green)', GATE_PASS:    'var(--green)', TRANSPORT:     'var(--green)',
  DELIVERY:           'var(--green)', EMPTY_RETURN: 'var(--green)', INVOICING:     'var(--green)',
  CLOSED:             'var(--green)',
};

/* ── Risk label config (Trello-style) — only red (blocking/costly) and gold
   (actionable, not blocking) are used; keeps the board to 3 status colors
   (red/gold/green) plus the brand teal, instead of a distinct hue per risk. */
const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
  SLA_BREACH:  { label: 'SLA Breach',   color: 'var(--red)',  bg: 'var(--red-l)' },
  DEMURRAGE:   { label: 'Demurrage',    color: 'var(--red)',  bg: 'var(--red-l)' },
  MISSING_DOC: { label: 'Missing Docs', color: 'var(--gold)', bg: 'var(--gold-l)' },
  CUSTOMS:     { label: 'Customs Hold', color: 'var(--red)',  bg: 'var(--red-l)' },
};

const TYPE_SHORT: Record<string, string> = {
  SEA_FCL: 'FCL', SEA_LCL: 'LCL', AIR: 'AIR', ROAD: 'RD', RAIL: 'RAIL', BULK: 'BULK',
};

/* ── Enterprise Kanban Board ──
   `activeWorkflow`: null → legacy fixed-stage board (today's behavior,
   unchanged); a Workflow object → that workflow's own ordered steps become
   the columns, and shipments are scoped to workflow_id === that workflow's
   id instead of workflow_id == null. handleDrop needs no branching at all —
   a column's key is already the exact `stage` value (ClearanceStage literal
   or workflow_steps.id) the PATCH /stage endpoint expects. */
function KanbanBoard({ groups, refresh, activeWorkflow }: { groups: any[], refresh: () => void, activeWorkflow: Workflow | null }) {
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('shipment_id', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overStage !== stage) setOverStage(stage);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    setDraggingId(null);
    setOverStage(null);
    const id = e.dataTransfer.getData('shipment_id');
    if (!id) return;
    try {
      await apiFetch(`/v1/shipments/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      });
      refresh();
    } catch (err: any) {
      const message = err.message || 'Unknown error';
      // The backend's "Prerequisite not met: X, Y, Z" is a single comma-joined
      // sentence — break it into a scannable list instead of a wall of text.
      const prereqMatch = message.match(/^Prerequisite not met: (.+)$/);
      if (prereqMatch) {
        showAlert("This shipment can't move to that stage yet — the following are still required:", {
          title: 'Missing Prerequisites',
          items: prereqMatch[1].split(',').map((s: string) => s.trim()).filter(Boolean),
        });
      } else {
        showAlert('Failed to move shipment: ' + message);
      }
    }
  };

  const allShipsRaw = groups.flatMap((g: any) =>
    (g.shipments || []).map((s: any) => ({
      ...s,
      _customer: g.customer.name,
      _avatarColor: g.customer.avatar_color || '#0b7264',
    }))
  );

  // Legacy board: shipments still on the fixed stage system (workflow_id ==
  // null), unchanged from before. Custom-workflow board: scoped to exactly
  // that workflow's shipments — a single Kanban view can't coherently show
  // one column set for shipments governed by different workflows.
  const allShips = activeWorkflow
    ? allShipsRaw.filter((s: any) => s.workflow_id === activeWorkflow.id)
    : allShipsRaw.filter((s: any) => !s.workflow_id);

  const columns: { key: string; label: string; color: string }[] = activeWorkflow
    ? [...activeWorkflow.steps].sort((a, b) => a.order - b.order).map(s => ({ key: s.id, label: s.name, color: s.color }))
    : CLEARANCE_STAGES.map(st => ({ key: st, label: STAGE_LABELS[st] || st, color: STAGE_COLORS[st] || 'var(--teal)' }));

  const byStage = new Map<string, any[]>();
  for (const col of columns) byStage.set(col.key, []);
  for (const s of allShips) {
    const bucketKey = activeWorkflow ? (s.workflow_step_id ?? s.stage) : s.stage;
    const col = byStage.get(bucketKey);
    if (col) col.push(s);
  }

  if (columns.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 14 }}>
        No shipments match the current filters.
      </div>
    );
  }
  if (activeWorkflow && allShips.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 14 }}>
        No shipments are currently on this workflow.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '14px 16px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {columns.map(col => {
        const ships = byStage.get(col.key) || [];
        const color = col.color;

        return (
          <div key={col.key}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={() => setOverStage(cur => (cur === col.key ? null : cur))}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`cos-column-bg${overStage === col.key ? ' cos-column-bg--over' : ''}`}
            style={{
            flexShrink: 0, width: 302,
            display: 'flex', flexDirection: 'column',
            maxHeight: '100%',
          }}>
            {/* ── Column header: ring icon + label + count pill ── */}
            <div style={{
              padding: '11px 12px 10px',
              flexShrink: 0,
              borderBottom: '1px solid var(--cos-column-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="cos-col-ring" style={{ color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                  {col.label}
                </span>
                <span className="cos-col-count">{ships.length}</span>
              </div>
            </div>

            {/* ── Card list ── */}
            <div style={{ overflowY: 'auto', padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ships.map((ship: any) => {
                const risks = (ship.active_risk_types || []) as string[];
                const urgent = risks.some(r => (RISK_META[r]?.color || '') === 'var(--red)');
                const initials = ship._customer
                  .split(' ').map((w: string) => w[0] || '').join('').slice(0, 2).toUpperCase();
                const createdDate = new Date(ship.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const docCount = ship.document_count ?? 0;
                const msgCount = ship.message_count ?? 0;

                return (
                  <Link
                    key={ship.id}
                    to={`/clearos/clearance/${ship.id}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ship.id)}
                    onDragEnd={handleDragEnd}
                    className={`cos-kanban-card${draggingId === ship.id ? ' cos-kanban-card--dragging' : ''}`}
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      fontFamily: 'var(--font)',
                      textDecoration: 'none',
                      color: 'inherit',
                      padding: '11px 12px',
                    }}
                  >
                    {/* Top line: flag (urgent only) + ref number + type badge */}
                    <div className="cos-card-topline">
                      {urgent && <Icon name="flag" size={12} color="var(--red)" strokeWidth={2} />}
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '0.01em' }}>
                        {ship.ref_number}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em' }}>
                        {TYPE_SHORT[ship.type as string] || ship.type}
                      </span>
                    </div>

                    {/* Title */}
                    <div className="cos-card-title">{ship.goods_desc}</div>

                    {/* Subtitle: customer name */}
                    <div className="cos-card-subtitle">{ship._customer}</div>

                    {/* Risk text chips */}
                    {risks.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
                        {risks.map(r => {
                          const rm = RISK_META[r] || { label: r, color: 'var(--ink3)', bg: 'var(--border)' };
                          return (
                            <span key={r} style={{
                              fontSize: 10, fontWeight: 700, color: rm.color,
                              background: rm.bg, borderRadius: 4,
                              padding: '2px 6px', letterSpacing: '0.02em',
                            }}>
                              {rm.label}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Meta row: date + attachments + comments + avatar */}
                    <div className="cos-card-meta">
                      <span className="cos-meta-item">
                        <Icon name="calendar" size={12} color="var(--ink3)" strokeWidth={1.75} />
                        {createdDate}
                      </span>
                      {docCount > 0 && (
                        <span className="cos-meta-item">
                          <Icon name="paperclip" size={12} color="var(--ink3)" strokeWidth={1.75} />
                          {docCount}
                        </span>
                      )}
                      {msgCount > 0 && (
                        <span className="cos-meta-item">
                          <Icon name="messageSquare" size={12} color="var(--ink3)" strokeWidth={1.75} />
                          {msgCount}
                        </span>
                      )}
                      <div
                        className="cos-card-avatar"
                        style={{ background: `linear-gradient(135deg, ${ship._avatarColor} 0%, color-mix(in srgb, ${ship._avatarColor} 100%, black 25%) 100%)` }}
                        title={ship._customer}
                      >
                        {initials}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString();
}
function fmtM(n: number | undefined | null) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

export const CommandCenter: React.FC = () => {
  usePageSEO('Ops Command Center', 'Manage active shipments and operations.');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [urlParams] = useSearchParams();
  const [searchQuery, setSearchQuery]     = useState(() => urlParams.get('search') || '');
  const [selectedType, setSelectedType]   = useState<ShipmentType | 'ALL'>('ALL');
  const [showOnlyMyCases, setShowOnlyMyCases] = useState(false);
  const [selectedRiskOnly, setSelectedRiskOnly] = useState(false);

  const [selectedMetric, setSelectedMetric] = useState<Metric>(null);
  const [sortBy, setSortBy] = useState<'urgency' | 'created' | 'eta' | 'days'>('urgency');
  const [viewMode, setViewMode] = useState<'list' | 'board'>(
    () => (localStorage.getItem('ops_viewMode') as 'list' | 'board') ?? 'list'
  );
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Ops Kanban workflow selector — 'legacy' (default) shows today's fixed
  // 18-stage board; any other value scopes the board to that tenant
  // workflow's own steps. Never affects list view — that stays unfiltered.
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(
    () => localStorage.getItem('ops_selectedWorkflow') || 'legacy'
  );
  useEffect(() => {
    apiFetch('/v1/workflows')
      .then((res: any) => setWorkflows((res.data ?? []).filter((w: Workflow) => w.isActive)))
      .catch(() => {});
  }, []);
  const activeWorkflow = selectedWorkflowId === 'legacy' ? null : (workflows.find(w => w.id === selectedWorkflowId) ?? null);

  const { groupedShipments, kpis, loading, refresh } = useShipments(
    showOnlyMyCases ? { assigned_to: user?.id } : {}
  );

  const [opsSummary, setOpsSummary] = useState<{ checked_in: number; active_shipments: number; pending_tasks: number } | null>(null);

  useEffect(() => {
    apiFetch('/v1/hr/ops-summary')
      .then((d: any) => setOpsSummary(d))
      .catch(() => {});
  }, []);

  // Old modal logic removed - handled by CreateShipmentPage



  const filteredGroupedShipments = groupedShipments
    .map(group => {
      let ships = group.shipments.filter((s: ShipmentCase) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!s.ref_number.toLowerCase().includes(q) &&
              !s.goods_desc.toLowerCase().includes(q) &&
              !(s.bl_number?.toLowerCase().includes(q))) return false;
        }
        if (selectedType !== 'ALL' && s.type !== selectedType) return false;
        if (selectedRiskOnly && (!s.active_risk_types || s.active_risk_types.length === 0)) return false;
        if (selectedMetric === 'demurrage' && !s.active_risk_types?.includes('DEMURRAGE')) return false;
        if (selectedMetric === 'sla' && !s.active_risk_types?.includes('SLA_BREACH')) return false;
        if (selectedMetric === 'active' && (s.stage === 'CLOSED' || s.stage === 'DELIVERY')) return false;
        if (selectedMetric === 'delivered' && s.stage !== 'DELIVERY' && s.stage !== 'CLOSED') return false;
        return true;
      });

      ships = [...ships].sort((a: ShipmentCase, b: ShipmentCase) => {
        if (sortBy === 'urgency') {
          const score = (s: ShipmentCase) =>
            s.active_risk_types?.includes('DEMURRAGE') ? 3 :
            s.active_risk_types?.includes('SLA_BREACH') ? 2 : 1;
          return score(b) - score(a);
        }
        if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'eta') {
          if (!a.eta) return 1;
          if (!b.eta) return -1;
          return new Date(a.eta).getTime() - new Date(b.eta).getTime();
        }
        if (sortBy === 'days') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return 0;
      });

      return { ...group, shipments: ships, shipment_count: ships.length };
    })
    .filter(g => g.shipment_count > 0);

  // Reset to page 1 whenever filters / sort change
  useEffect(() => setPage(1), [searchQuery, selectedType, selectedRiskOnly, selectedMetric, sortBy]);

  const totalGroups = filteredGroupedShipments.length;
  const totalPages  = Math.max(1, Math.ceil(totalGroups / pageSize));
  const pagedGroups = filteredGroupedShipments.slice((page - 1) * pageSize, page * pageSize);

  const canCreate = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER'].includes(user?.role || '');
  const isJunior  = user?.role === 'JUNIOR' || user?.role === 'OFFICER';

  // KPI cells config
  const kpiCells = [
    { key: 'active',    label: 'Active Shipments',   value: fmt(kpis?.active_cases),           cls: 't', cell: '',      metric: 'active' as Metric },
    { key: 'dem',       label: 'Demurrage Risk',      value: fmt(kpis?.demurrage_risk),          cls: 'r', cell: 'alert', metric: 'demurrage' as Metric },
    { key: 'sla',       label: 'SLA Breached',        value: fmt(kpis?.sla_breached),                cls: 'r', cell: 'alert', metric: 'sla' as Metric },
    { key: 'del',       label: 'Delivered Today',     value: fmt(kpis?.delivered_today),             cls: 'g', cell: '',      metric: 'delivered' as Metric },
    { key: 'penalty',   label: 'Penalty Exposure',    value: `${fmtM(kpis?.penalty_exposure_tzs)} TZS`, cls: 'a', cell: 'warn', metric: null },
    { key: 'ontime',    label: 'On-Time Rate',        value: `${kpis?.on_time_rate_pct ?? 0}%`,     cls: 'g', cell: '',      metric: null },
    { key: 'month',     label: 'This Month',          value: fmt(kpis?.cases_this_month),        cls: 'n', cell: '',      metric: null },
  ];

  const fld = (label: string, value: string, onChange: (v: string) => void, rest?: any) => (
    <div className="cc-fld">
      <label>{label}</label>
      <input type="text" className="input-field" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );

  // Today's date label
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const pgBtn = (disabled: boolean, onClick: () => void, label: string) => (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ minWidth: 28, height: 28, padding: '0 6px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: disabled ? 'var(--ink3)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  );

  return (
    <div className="cc-frame">
    <div className="cc-shell">

      {/* Primary ops column */}
      <div className="cc-main">

        {/* ── Enterprise Page Header ── */}
        <div className="cc-page-header" style={{ padding: '16px 20px', borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
          <div className="cc-page-header-left">
            <div className="cc-breadcrumb">
              <span className="cc-breadcrumb-root">Dashboard</span>
              <span className="cc-breadcrumb-sep">›</span>
              <span className="cc-breadcrumb-current">Operations</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="cc-page-title" style={{ margin: 0 }}>
                {isJunior ? 'My Cases' : 'Operations'}
              </h1>
              <button 
                type="button" 
                onClick={() => setExpanded(!expanded)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {expanded ? <polyline points="6 9 12 15 18 9"></polyline> : <polyline points="18 15 12 9 6 15"></polyline>}
                </svg>
              </button>
            </div>
          </div>
          <div className="cc-page-header-right">
            {/* Secondary controls — shrinks/scrolls internally first when
                space is tight, so the primary action button (below) never
                gets pushed off-screen. */}
            <div className="cc-page-header-scroll">
              {!isMobile && <span className="cc-date-chip">{todayLabel}</span>}

              {/* List / Board toggle */}
              <div className="cc-view-toggle">
                {(['list', 'board'] as const).map(m => (
                  <button key={m} type="button"
                    title={m === 'list' ? 'List view' : 'Board view'}
                    className={`cc-view-btn${viewMode === m ? ' active' : ''}`}
                    onClick={() => { setViewMode(m); localStorage.setItem('ops_viewMode', m); }}>
                    {m === 'list'
                      ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>List</>
                      : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>Board</>
                    }
                  </button>
                ))}
              </div>

              {/* Workflow selector — board view only, and only when the tenant
                  has at least one active custom workflow to switch to. */}
              {viewMode === 'board' && workflows.length > 0 && (
                <Select
                  value={selectedWorkflowId}
                  onValueChange={v => { setSelectedWorkflowId(v); localStorage.setItem('ops_selectedWorkflow', v); }}
                >
                  <SelectTrigger style={{ height: 32, fontSize: 12.5, minWidth: 150, width: 'auto' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legacy">Legacy Stages</SelectItem>
                    {workflows.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Primary actions — always fully visible, never scrolled/clipped. */}
            <div className="cc-page-header-actions">
              {canCreate && (
                <Button size="sm" style={{ background: 'var(--teal)', color: '#fff' }} onClick={() => navigate('/clearos/ops/new')}>
                  <Icon name="plus" size={13} color="currentColor" />
                  {isMobile ? 'New' : 'New Shipment'}
                </Button>
              )}
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { localStorage.clear(); refresh(); }} title="Refresh data">
                <Icon name="refresh" size={14} />
              </Button>
            </div>
          </div>
        </div>

        {/* Collapsible Ops Summary & Filters — one row, wraps as a unit on narrow screens */}
        {expanded && (
          <div className="cc-toolbar-row">
            {/* Ops summary chips */}
            {opsSummary && (
              <div className="cc-summary-chips">
                <div className="cc-summary-chip">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, boxShadow: '0 0 0 2px var(--teal-l)' }} />
                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Checked In</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{opsSummary.checked_in}</span>
                </div>
                <div className="cc-summary-chip">
                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Active Shipments</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{opsSummary.active_shipments}</span>
                </div>
                <div className="cc-summary-chip">
                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Pending Tasks</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: opsSummary.pending_tasks > 0 ? 'var(--gold)' : 'var(--ink)', lineHeight: 1 }}>{opsSummary.pending_tasks}</span>
                </div>
              </div>
            )}

            {/* Filter bar */}
            <div className="cc-toolbar-filters">
              <FilterBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedType={selectedType}
                setSelectedType={setSelectedType}
                showOnlyMyCases={showOnlyMyCases}
                setShowOnlyMyCases={setShowOnlyMyCases}
                selectedRiskOnly={selectedRiskOnly}
                setSelectedRiskOnly={setSelectedRiskOnly}
              />
            </div>
          </div>
        )}

        {/* Board view */}
        {viewMode === 'board' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                Syncing shipment data…
              </div>
            ) : (
              <KanbanBoard groups={filteredGroupedShipments} refresh={refresh} activeWorkflow={activeWorkflow} />
            )}
          </div>
        )}

        {/* List view: Table header + paginated list */}
        {viewMode === 'list' && (
          <>
            <TableHeader sortBy={sortBy} setSortBy={setSortBy} />
            <div className="scroll-body">
              {loading && (
                <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>
                  Syncing shipment data…
                </div>
              )}
              {!loading && totalGroups === 0 && (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '13px' }}>
                  No shipments match the current filters.
                </div>
              )}
              {!loading && pagedGroups.map((group: any) => (
                <CustomerGroup
                  key={group.customer.id}
                  group={group}
                  shipmentHref={(ship: ShipmentCase) => `/clearos/clearance/${ship.id}`}
                />
              ))}
            </div>

            {/* Pagination bar */}
            {!loading && totalGroups > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalGroups)} of {totalGroups} customer group{totalGroups !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {pgBtn(page === 1, () => setPage(1), '«')}
                  {pgBtn(page === 1, () => setPage(p => p - 1), '‹')}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) => p === '…'
                      ? <span key={`e${i}`} style={{ fontSize: 13, color: 'var(--ink3)', padding: '0 2px' }}>…</span>
                      : <button key={p} type="button" onClick={() => setPage(p as number)}
                          style={{ minWidth: 28, height: 28, padding: '0 6px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: page === p ? 'var(--teal)' : 'var(--white)', color: page === p ? '#fff' : 'var(--ink)' }}>
                          {p}
                        </button>
                    )
                  }
                  {pgBtn(page === totalPages, () => setPage(p => p + 1), '›')}
                  {pgBtn(page === totalPages, () => setPage(totalPages), '»')}
                </div>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger aria-label="Rows per page" style={{ width: 'auto', height: 'auto', fontSize: 12, padding: '3px 6px' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 25, 50].map(s => <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>

    </div>
    </div>
  );
};
