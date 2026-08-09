import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useShipments } from '../hooks/useShipments.js';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { TableHeader } from '../components/TableHeader.js';
import { CustomerGroup } from '../components/CustomerGroup.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem, DropdownMenuCheckboxItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../components/ui/dropdown-menu.js';
import { AiExtractedCard } from '../components/AiExtractedCard.js';
import { showAlert } from '../lib/alert.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import type { ShipmentCase, ShipmentType } from '@hudumika/types';
import { CLEARANCE_STAGES, STAGE_LABELS } from '@hudumika/types';
import type { ClearanceStage } from '@hudumika/types';
import { Icon } from '../components/Icon.js';
import {
  DECLARATION_STATUSES, LANES, LANE, STATUS_VARIANT, declMoney,
} from '../lib/declarationMeta.js';

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
    for (let i = 0; i < (name ?? '').length; i++) h = ((h << 5) - h) + (name ?? '').charCodeAt(i);
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

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5 max-h-[220px] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()} onCloseAutoFocus={e => e.preventDefault()}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>No staff found</div>
        ) : filtered.slice(0, 8).map(o => (
          <button
            key={o.user_id || o.id}
            type="button"
            onClick={() => select(o)}
            className="rounded-lg hover:bg-accent hover:text-accent-foreground"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--ds-btn-py) 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
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

type Metric = 'active' | 'demurrage' | 'sla' | 'delivered' | 'checked_in' | 'pending' | null;

/* Shipment type, for the "Filter by" menu. Was seven chips in the toolbar. */
const SHIPMENT_TYPES: { value: ShipmentType | 'ALL'; label: string }[] = [
  { value: 'ALL',     label: 'All types' },
  { value: 'SEA_FCL', label: 'Sea — FCL' },
  { value: 'SEA_LCL', label: 'Sea — LCL' },
  { value: 'AIR',     label: 'Air' },
  { value: 'ROAD',    label: 'Road' },
  { value: 'RAIL',    label: 'Rail' },
  { value: 'BULK',    label: 'Bulk' },
];

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
   (red/gold/green) plus the brand teal, instead of a distinct hue per risk.
   `variant` maps straight onto the shared `Badge` component's soft-tint
   variants (ui/badge.tsx) so risk chips render via the design system's
   status-pill primitive instead of a hand-rolled inline-styled <span>. */
const RISK_META: Record<string, { label: string; variant: 'error' | 'warning'; urgent: boolean }> = {
  SLA_BREACH:  { label: 'SLA Breach',   variant: 'error',   urgent: true },
  DEMURRAGE:   { label: 'Demurrage',    variant: 'error',   urgent: true },
  MISSING_DOC: { label: 'Missing Docs', variant: 'warning', urgent: false },
  CUSTOMS:     { label: 'Customs Hold', variant: 'error',   urgent: true },
};

const TYPE_SHORT: Record<string, string> = {
  SEA_FCL: 'FCL', SEA_LCL: 'LCL', AIR: 'AIR', ROAD: 'RD', RAIL: 'RAIL', BULK: 'BULK',
};

/* ── Enterprise Kanban Board ── fixed CLEARANCE_STAGES columns, drag-to-move. */
function KanbanBoard({ groups, refresh, sortBy }: { groups: any[], refresh: () => void, sortBy: 'urgency' | 'created' | 'eta' | 'days' }) {
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
          // The API names prerequisites with the enum token it stores
          // ("PACKING_LIST document"). Shown verbatim that reads as a system
          // error rather than a thing to go and fetch, so the token is
          // humanised — never translated, only re-cased.
          items: prereqMatch[1]
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
            .map((s: string) => s.replace(/\b[A-Z][A-Z0-9_]{1,}\b/g, tok =>
              tok.length <= 3 ? tok                       // BL, DO, TIN stay as-is
                : tok.charAt(0) + tok.slice(1).toLowerCase().replace(/_/g, ' '))),
        });
      } else {
        showAlert('Failed to move shipment: ' + message);
      }
    }
  };

  // All ships from all customer groups, all shown on the legacy board.
  const allShips = [...groups.flatMap((g: any) =>
    (g.shipments || []).map((s: any) => ({
      ...s,
      _customer: g.customer.name,
      _avatarColor: g.customer.avatar_color || '#0b7264',
    }))
  )].sort((a: any, b: any) => {
    if (sortBy === 'urgency') {
      const score = (s: any) =>
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

  const columns = CLEARANCE_STAGES.map(st => ({ key: st, label: STAGE_LABELS[st] || st, color: STAGE_COLORS[st] || 'var(--teal)' }));

  const byStage = new Map<string, any[]>();
  for (const col of columns) byStage.set(col.key, []);
  for (const s of allShips) {
    const col = byStage.get(s.stage);
    if (col) col.push(s);
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
                const urgent = risks.some(r => RISK_META[r]?.urgent);
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

                    {/* Risk chips — shared Badge component (soft-tint variants),
                        not a hand-rolled inline-styled span. */}
                    {risks.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
                        {risks.map(r => {
                          const rm = RISK_META[r];
                          return (
                            <Badge key={r} variant={rm?.variant ?? 'gray'} className="px-1.5 py-0 text-[10px] font-bold leading-[1.6] tracking-[0.02em]">
                              {rm?.label ?? r}
                            </Badge>
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
  /**
   * Board is the default. Ops Command is a "what is stuck and who is on it"
   * screen, and the board answers that at a glance — a column per stage, with
   * the pile-ups visible as column height — where the list answers "find me
   * this one shipment", which is the rarer question here.
   *
   * A stored choice still wins: this only decides what someone sees who has
   * never touched the toggle. Anyone who has picked List keeps List.
   */
  const [viewMode, setViewMode] = useState<'list' | 'board'>(() => {
    const saved = localStorage.getItem('ops_viewMode');
    return saved === 'list' || saved === 'board' ? saved : 'board';
  });
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  /**
   * Declaration filters, folded in from /clearos/declarations.
   *
   * Every one of these is resolved by the API, which is what that page did and
   * Ops did not — Ops filtered whatever it had already loaded. `__all__` is the
   * Radix sentinel (SelectItem cannot take an empty-string value) and is
   * translated to "no filter" here rather than sent.
   */
  const [declStatus, setDeclStatus] = useState(() => urlParams.get('declaration_status') || '__all__');
  const [lane, setLane] = useState(() => urlParams.get('lane') || '__all__');
  // `?declared=1` is what /clearos/declarations redirects to, so an old
  // bookmark lands on the lodged shipments rather than on everything.
  const [declPresence, setDeclPresence] = useState(() =>
    urlParams.get('declared') === '1' ? 'yes'
      : urlParams.get('declared') === '0' ? 'no'
      : '__all__');   // __all__ | yes | no

  /**
   * The existing FilterBar search is promoted to the server rather than a
   * second box being added. It used to filter the loaded array on ref, goods
   * and BL only; the API now also matches AWB, the TANCIS ref, the TANSAD
   * number and the importer name — the identifiers /clearos/declarations
   * searched, and the ones a customs officer actually has to hand.
   *
   * Debounced, because it is a request per change now rather than a filter.
   */
  const [serverSearch, setServerSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setServerSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  // The box is gone from the toolbar, but /clearos/ops?search=… still works —
  // it is what the global header search links to.

  const declFiltersActive = declStatus !== '__all__' || lane !== '__all__'
    || declPresence !== '__all__' || selectedType !== 'ALL';

  const { groupedShipments, kpis, loading, refresh } = useShipments({
    ...(showOnlyMyCases ? { assigned_to: user?.id } : {}),
    ...(declStatus !== '__all__' ? { declaration_status: declStatus } : {}),
    ...(lane !== '__all__' ? { selectivity_channel: lane } : {}),
    ...(declPresence !== '__all__' ? { has_declaration: declPresence === 'yes' } : {}),
    ...(serverSearch ? { search: serverSearch } : {}),
    ...(selectedMetric === 'checked_in' ? { checked_in: true } : {}),
    ...(selectedMetric === 'pending' ? { pending: true } : {}),
  });

  // Auto-refresh data every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

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
        // No search test here — the API resolves it now, over a wider set of
        // fields than this could see (AWB, TANCIS ref, TANSAD number, importer
        // name). Re-filtering the response would only be able to narrow it.
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

  // Sort customer groups themselves based on their highest priority/sorted shipment
  const sortedGroupedShipments = [...filteredGroupedShipments].sort((gA, gB) => {
    const a = gA.shipments[0];
    const b = gB.shipments[0];
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

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

  const totalGroups = sortedGroupedShipments.length;
  const totalPages  = Math.max(1, Math.ceil(totalGroups / pageSize));
  const pagedGroups = sortedGroupedShipments.slice((page - 1) * pageSize, page * pageSize);

  const canCreate = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER'].includes(user?.role || '');
  const isJunior  = user?.role === 'JUNIOR' || user?.role === 'OFFICER';

  // AI Document Scan Dialog State
  const [aiScanOpen, setAiScanOpen] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [aiSimulated, setAiSimulated] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiScanFile = async (file: File) => {
    setAiFile(file);
    setAiScanning(true);
    setAiError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setAiPreview(dataUrl);
      const image_base64 = dataUrl.split(',')[1];
      const res = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64, media_type: file.type }),
      });
      setAiResult(res.result);
      setAiSimulated(!!res.simulated);
    } catch (err: any) {
      setAiError(err?.message || 'Document scan failed.');
    } finally {
      setAiScanning(false);
    }
  };

  // KPI cells config — restyled as individual design-system cards
  const kpiCells = [
    { key: 'active',    label: 'Active Shipments',   value: loading ? '—' : fmt(kpis?.active_cases),           icon: 'package',       color: 'var(--teal)',  bg: 'var(--teal-l)',  metric: 'active' as Metric },
    { key: 'dem',       label: 'Demurrage Risk',      value: loading ? '—' : fmt(kpis?.demurrage_risk),          icon: 'alertTriangle', color: 'var(--red)',   bg: 'var(--red-l)',   cell: 'alert', metric: 'demurrage' as Metric },
    { key: 'sla',       label: 'SLA Breached',        value: loading ? '—' : fmt(kpis?.sla_breached),            icon: 'clock',         color: 'var(--red)',   bg: 'var(--red-l)',   cell: 'alert', metric: 'sla' as Metric },
    { key: 'del',       label: 'Delivered Today',     value: loading ? '—' : fmt(kpis?.delivered_today),         icon: 'checkCircle',   color: 'var(--green)', bg: '#ecfdf5',        metric: 'delivered' as Metric },
    { key: 'penalty',   label: 'Penalty Exposure',    value: loading ? '—' : `${fmtM(kpis?.penalty_exposure_tzs)} TZS`, icon: 'dollarSign', color: 'var(--gold)',  bg: '#fffbeb',        cell: 'warn', metric: null },
    { key: 'ontime',    label: 'On-Time Rate',        value: loading || kpis?.on_time_rate_pct == null ? '—' : `${kpis.on_time_rate_pct}%`, icon: 'trendingUp', color: 'var(--blue)',  bg: '#eff6ff',        metric: null },
    { key: 'month',     label: 'This Month',          value: loading ? '—' : fmt(kpis?.cases_this_month),        icon: 'calendar',      color: 'var(--navy)',  bg: 'var(--bg)',      metric: null },
  ];

  // Renders one KPI card — interactive button for filter metrics or div for informational numbers.
  const kpiCell = (cell: (typeof kpiCells)[number]) => {
    const clickable = cell.metric !== null;
    const active = clickable && selectedMetric === cell.metric;
    // Raised = one of the two risk figures, and only while it is non-zero.
    const raised = cell.cell === 'alert' && cell.value !== '0' && cell.value !== '—';
    const cls = [
      'cc-pipeline-step',
      clickable ? 'cc-pipeline-step--clickable' : '',
      active ? 'cc-pipeline-step--active' : '',
      cell.cell === 'alert' ? 'r' : '',
      raised ? 'cc-pipeline-step--raised' : '',
    ].filter(Boolean).join(' ');

    const inner = (
      <>
        <span className="cc-pipeline-num">{cell.value}</span>
        <span className="cc-pipeline-label">{cell.label}</span>
      </>
    );

    return clickable ? (
      <button
        key={cell.key}
        type="button"
        className={cls}
        aria-pressed={active}
        onClick={() => setSelectedMetric(m => (m === cell.metric ? null : cell.metric))}
        title={active ? 'Filtering — click to clear' : 'Click to filter'}
      >
        {inner}
      </button>
    ) : (
      <div key={cell.key} className={cls} title={cell.label}>{inner}</div>
    );
  };

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
      style={{ minWidth: 28, height: 28, padding: '0 6px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)', color: disabled ? 'var(--ink3)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer' }}>
      {label}
    </button>
  );

  if (loading) return <SkeletonPage variant="dashboard" />;

  return (
    <div className="cc-frame">
    <div className="cc-shell">

      {/* Primary ops column */}
      <div className="cc-main">

        {/* ── Enterprise Page Header ── */}
        <div className="cc-page-header" style={{ padding: '1.25rem 1.25rem 12px 1.25rem', borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
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

            {/* Primary actions — always fully visible, never scrolled/clipped. */}
            <div className="cc-page-header-actions">
              {canCreate && (
                <Button size="sm" style={{ background: 'var(--teal)', color: '#fff' }} onClick={() => navigate('/clearos/ops/new')}>
                  <Icon name="plus" size={13} color="currentColor" />
                  {isMobile ? 'New' : 'New Shipment'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── KPI Strip — click a cell to filter the list/board below to that
            metric (toggles off on a second click of the same cell); cells with
            no `metric` (penalty exposure, on-time rate, this month) are
            informational only. Always visible, independent of the collapsible
            toolbar below, since these are the primary at-a-glance numbers. */}
        <div className="cc-pipeline" style={{ marginLeft: '1.25rem', marginRight: '1.25rem' }}>
          {kpiCells.map(kpiCell)}
        </div>

        {/* Collapsible Ops Summary & Filters — one row, wraps as a unit on narrow screens */}
        {expanded && (
          <div className="cc-toolbar-row" style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
              <div className="ds-tabs-list" data-variant="segmented" style={{ flexShrink: 0, overflowX: 'auto', maxWidth: '100%' }}>
                {opsSummary && (
                  <>
                    <button
                      type="button"
                      className="ds-tabs-trigger"
                      data-variant="segmented"
                      data-state={selectedMetric === 'active' ? 'active' : 'inactive'}
                      onClick={() => setSelectedMetric(m => m === 'active' ? null : 'active')}
                    >
                      Active
                      <span style={{
                        fontSize: 10,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: selectedMetric === 'active' ? 'var(--teal-l)' : 'var(--border)',
                        color: selectedMetric === 'active' ? 'var(--teal)' : 'var(--ink3)',
                        fontWeight: 700
                      }}>
                        {opsSummary.active_shipments}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="ds-tabs-trigger"
                      data-variant="segmented"
                      data-state={selectedMetric === 'checked_in' ? 'active' : 'inactive'}
                      onClick={() => setSelectedMetric(m => m === 'checked_in' ? null : 'checked_in')}
                    >
                      Checked In
                      <span style={{
                        fontSize: 10,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: selectedMetric === 'checked_in' ? 'var(--teal-l)' : 'var(--border)',
                        color: selectedMetric === 'checked_in' ? 'var(--teal)' : 'var(--ink3)',
                        fontWeight: 700
                      }}>
                        {opsSummary.checked_in}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="ds-tabs-trigger"
                      data-variant="segmented"
                      data-state={selectedMetric === 'pending' ? 'active' : 'inactive'}
                      onClick={() => setSelectedMetric(m => m === 'pending' ? null : 'pending')}
                    >
                      Pending
                      <span style={{
                        fontSize: 10,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: selectedMetric === 'pending' ? 'var(--teal-l)' : 'var(--border)',
                        color: selectedMetric === 'pending' ? 'var(--teal)' : 'var(--ink3)',
                        fontWeight: 700
                      }}>
                        {opsSummary.pending_tasks}
                      </span>
                    </button>

                    <div style={{ width: 1, height: 16, background: 'var(--ink3)', opacity: 0.2, alignSelf: 'center', margin: '0 4px' }} />
                  </>
                )}

                <button
                  type="button"
                  className="ds-tabs-trigger"
                  data-variant="segmented"
                  data-state={showOnlyMyCases ? 'active' : 'inactive'}
                  onClick={() => setShowOnlyMyCases(!showOnlyMyCases)}
                >
                  My Cases
                </button>

                <button
                  type="button"
                  className="ds-tabs-trigger"
                  data-variant="segmented"
                  data-state={selectedRiskOnly ? 'active' : 'inactive'}
                  onClick={() => setSelectedRiskOnly(!selectedRiskOnly)}
                  style={selectedRiskOnly ? { color: 'var(--red)' } : {}}
                >
                  At Risk
                </button>
              </div>

              {/* Filter bar */}
              <div className="cc-toolbar-filters" style={{ minWidth: 'auto', flex: 'none' }}>
                <div className="filter-chips">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={`fc fc-filterby${declFiltersActive ? ' on' : ''}`}>
                        <Icon name="sliders" size={12} />
                        Filter by
                        {declFiltersActive && (
                          <span className="fc-count">
                            {[declPresence, declStatus, lane, selectedType].filter(v => v !== '__all__' && v !== 'ALL').length}
                          </span>
                        )}
                        <Icon name="chevronDown" size={11} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span className="flex-1">Shipment type</span>
                          <span className="text-[11px] text-muted-foreground mr-1">
                            {SHIPMENT_TYPES.find(t => t.value === selectedType)?.label ?? 'All types'}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-48">
                          {SHIPMENT_TYPES.map(t => (
                            <DropdownMenuCheckboxItem key={t.value} checked={selectedType === t.value}
                              onCheckedChange={() => setSelectedType(t.value)}>{t.label}</DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span className="flex-1">Declaration</span>
                          <span className="text-[11px] text-muted-foreground mr-1">
                            {declPresence === 'no' ? 'Not declared' : declPresence === 'yes' ? 'Declared' : 'Any'}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-48">
                          {[
                            { v: '__all__', l: 'Any declaration' },
                            { v: 'no',      l: 'Not declared' },
                            { v: 'yes',     l: 'Declared' },
                          ].map(o => (
                            <DropdownMenuCheckboxItem key={o.v} checked={declPresence === o.v}
                              onCheckedChange={() => setDeclPresence(o.v)}>{o.l}</DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span className="flex-1">Filing status</span>
                          <span className="text-[11px] text-muted-foreground mr-1">
                            {DECLARATION_STATUSES.find(x => x.value === declStatus)?.label ?? 'All'}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-48 max-h-[60vh] overflow-y-auto">
                          <DropdownMenuCheckboxItem checked={declStatus === '__all__'}
                            onCheckedChange={() => setDeclStatus('__all__')}>All statuses</DropdownMenuCheckboxItem>
                          {DECLARATION_STATUSES.map(x => (
                            <DropdownMenuCheckboxItem key={x.value} checked={declStatus === x.value}
                              onCheckedChange={() => setDeclStatus(x.value)}>{x.label}</DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span className="flex-1">TRA lane</span>
                          <span className="text-[11px] text-muted-foreground mr-1">
                            {LANES.find(l => l.value === lane)?.label ?? 'Any'}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-44">
                          <DropdownMenuCheckboxItem checked={lane === '__all__'}
                            onCheckedChange={() => setLane('__all__')}>Any lane</DropdownMenuCheckboxItem>
                          {LANES.map(l => (
                            <DropdownMenuCheckboxItem key={l.value} checked={lane === l.value}
                              onCheckedChange={() => setLane(l.value)}>{l.label}</DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      {declFiltersActive && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => {
                            setDeclStatus('__all__'); setLane('__all__');
                            setDeclPresence('__all__'); setSelectedType('ALL');
                          }}>Clear all filters</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
              <KanbanBoard groups={sortedGroupedShipments} refresh={refresh} sortBy={sortBy} />
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
                          style={{ minWidth: 28, height: 28, padding: '0 6px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', background: page === p ? 'var(--teal)' : 'var(--white)', color: page === p ? '#fff' : 'var(--ink)' }}>
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

      {/* AI Document Scan Dialog Modal */}
      <Dialog open={aiScanOpen} onOpenChange={open => { setAiScanOpen(open); if (!open) { setAiFile(null); setAiPreview(null); setAiResult(null); setAiError(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-[var(--ink)]">
              <Icon name="sparkle" size={18} color="var(--teal)" />
              AI Document Scanner &amp; OCR
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {aiError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex justify-between items-center">
                <span>{aiError}</span>
                <button type="button" onClick={() => setAiError(null)} className="font-bold">×</button>
              </div>
            )}

            {!aiFile && !aiScanning && (
              <div
                className="border-2 border-dashed border-border hover:border-[var(--teal)] rounded-xl p-10 text-center bg-muted/20 hover:bg-[var(--teal-l)]/20 cursor-pointer transition-colors"
                onClick={() => {
                  const inp = document.createElement('input');
                  inp.type = 'file';
                  inp.accept = 'image/*,.pdf';
                  inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) void handleAiScanFile(f); };
                  inp.click();
                }}
              >
                <Icon name="fileText" size={42} className="mx-auto mb-3 text-[var(--ink3)]" />
                <div className="font-bold text-sm text-[var(--ink)] mb-1">
                  Upload Payment Receipt, Invoice, B/L, or TANSAD
                </div>
                <p className="text-xs text-[var(--ink3)]">
                  Supports CRDB / NMB Mobile Payment receipts, Bills of Lading, Commercial Invoices, Air Waybills, and TANSAD declarations (PNG, JPG, WEBP, PDF)
                </p>
              </div>
            )}

            {aiScanning && (
              <div className="text-center py-10 space-y-3">
                <div className="w-10 h-10 border-3 border-[var(--teal-l)] border-t-[var(--teal)] rounded-full animate-spin mx-auto" />
                <div className="font-bold text-sm text-[var(--ink)]">Analyzing document with AI…</div>
                <p className="text-xs text-[var(--ink3)]">Extracting structured transaction fields and line data.</p>
              </div>
            )}

            {aiResult && !aiScanning && (
              <AiExtractedCard
                ocrResult={aiResult}
                previewUrl={aiPreview}
                simulated={aiSimulated}
                onRescan={() => { setAiFile(null); setAiPreview(null); setAiResult(null); }}
                onApply={() => {
                  setAiScanOpen(false);
                  navigate('/clearos/ops/new');
                }}
                applyLabel="Create Shipment from Scan"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
};
