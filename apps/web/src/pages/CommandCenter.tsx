import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useShipments } from '../hooks/useShipments.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { apiFetch } from '../lib/api.js';
import { FilterBar } from '../components/FilterBar.jsx';
import type { AiFilterResult } from '../components/FilterBar.jsx';
import { TableHeader } from '../components/TableHeader.jsx';
import { CustomerGroup } from '../components/CustomerGroup.jsx';
import type { ShipmentCase, ShipmentType } from '@clearos/types';
import { CLEARANCE_STAGES, STAGE_LABELS } from '@clearos/types';
import type { ClearanceStage } from '@clearos/types';

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
  const ref                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const q = query.replace(/^@/, '').toLowerCase();
  const filtered = officers.filter(o =>
    !q || o.name.toLowerCase().includes(q) || (o.role || '').toLowerCase().includes(q)
  );

  const avatarColor = (name: string) => {
    const colors = ['#0b7264','#7c3aed','#0891b2','#ea580c','#16a34a','#dc2626','#d97706'];
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
    setTimeout(() => (ref.current?.querySelector('input') as HTMLInputElement)?.focus(), 10);
  };

  const inits = (name: string) =>
    name.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
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
            type="text"
            placeholder="Type @ to search staff…"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            style={{ border: 'none', outline: 'none', fontSize: 13, color: 'var(--ink)', background: 'transparent', flex: 1, fontFamily: 'var(--font)', padding: 0 }}
          />
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1200,
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9,
          boxShadow: '0 8px 28px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>No staff found</div>
          ) : filtered.slice(0, 8).map(o => (
            <button
              key={o.user_id || o.id}
              type="button"
              onClick={() => select(o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--bg)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'none')}
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
        </div>
      )}
    </div>
  );
}

type Metric = 'active' | 'demurrage' | 'sla' | 'delivered' | null;

/* ── Stage colour palette for board columns ── */
const STAGE_COLORS: Partial<Record<ClearanceStage, string>> = {
  DOCS_RECEIVED:      '#7c3aed', VALIDATION:   '#7c3aed', PERMITS:       '#d97706',
  ENTRY_PREP:         '#d97706', TANCIS_REG:   '#0891b2', ASSESSMENT:    '#0891b2',
  TAX_PAYMENT:        '#ea580c', DO_APPLICATION:'#ea580c', INSPECTION_BOOKING:'#dc2626',
  INSPECTION:         '#dc2626', GOV_REMARKS:  '#dc2626', RELEASE:       '#16a34a',
  ICD_PAYMENT:        '#0d7a6b', GATE_PASS:    '#0d7a6b', TRANSPORT:     '#0d7a6b',
  DELIVERY:           '#16a34a', EMPTY_RETURN: '#6b7280', INVOICING:     '#6b7280',
  CLOSED:             '#6b7280',
};

/* ── Risk label config (Trello-style) ── */
const RISK_META: Record<string, { label: string; color: string }> = {
  SLA_BREACH:  { label: 'SLA Breach',   color: '#ef4444' },
  DEMURRAGE:   { label: 'Demurrage',    color: '#f97316' },
  MISSING_DOC: { label: 'Missing Docs', color: '#eab308' },
  CUSTOMS:     { label: 'Customs Hold', color: '#8b5cf6' },
};

const TYPE_SHORT: Record<string, string> = {
  SEA_FCL: 'FCL', SEA_LCL: 'LCL', AIR: 'AIR', ROAD: 'RD', RAIL: 'RAIL', BULK: 'BULK',
};

/* ── Enterprise Kanban Board ── */
function KanbanBoard({ groups }: { groups: any[] }) {
  const navigate = useNavigate();

  const allShips = groups.flatMap((g: any) =>
    (g.shipments || []).map((s: any) => ({
      ...s,
      _customer: g.customer.name,
      _avatarColor: g.customer.avatar_color || '#0b7264',
    }))
  );

  const byStage = new Map<ClearanceStage, any[]>();
  for (const st of CLEARANCE_STAGES) byStage.set(st, []);
  for (const s of allShips) {
    const col = byStage.get(s.stage as ClearanceStage);
    if (col) col.push(s);
  }

  const activeCols = CLEARANCE_STAGES.filter(st => (byStage.get(st)?.length || 0) > 0);

  if (activeCols.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 14 }}>
        No shipments match the current filters.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '14px 16px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {activeCols.map(stage => {
        const ships = byStage.get(stage) || [];
        const color = STAGE_COLORS[stage] || '#0b7264';
        const colBg = color.startsWith('#') ? `${color}10` : '#f4f5f7';

        return (
          <div key={stage} style={{
            flexShrink: 0, width: 252,
            display: 'flex', flexDirection: 'column',
            borderRadius: 10,
            background: colBg,
            maxHeight: '100%',
            border: '1px solid rgba(0,0,0,0.07)',
          }}>
            {/* ── Column header ── */}
            <div style={{
              padding: '10px 12px 9px',
              borderTop: `3px solid ${color}`,
              borderRadius: '10px 10px 0 0',
              background: 'var(--white)',
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                  {STAGE_LABELS[stage] || stage}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: '#fff', background: color,
                  borderRadius: 20, minWidth: 22, height: 20,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 7px', flexShrink: 0,
                }}>
                  {ships.length}
                </span>
              </div>
            </div>

            {/* ── Card list ── */}
            <div style={{ overflowY: 'auto', padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ships.map((ship: any) => {
                const risks = (ship.active_risk_types || []) as string[];
                const pct = Math.round(
                  (CLEARANCE_STAGES.indexOf(ship.stage as ClearanceStage) + 1) / CLEARANCE_STAGES.length * 100
                );
                const initials = ship._customer
                  .split(' ').map((w: string) => w[0] || '').join('').slice(0, 2).toUpperCase();
                const days = Math.floor((Date.now() - new Date(ship.created_at).getTime()) / 86_400_000);
                const daysColor = days > 30 ? '#ef4444' : days > 14 ? '#f97316' : 'var(--ink3)';
                const daysBg   = days > 30 ? '#fef2f2' : days > 14 ? '#fff7ed' : 'var(--bg)';

                return (
                  <div
                    key={ship.id}
                    onClick={() => navigate(`/clearance/${ship.id}`)}
                    style={{
                      background: 'var(--white)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                      overflow: 'hidden',
                      transition: 'box-shadow 0.15s, transform 0.12s',
                      fontFamily: 'var(--font)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(0,0,0,0.13)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Trello-style colored label strips */}
                    {risks.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, padding: '7px 10px 0' }}>
                        {risks.map(r => {
                          const rm = RISK_META[r] || { color: '#6b7280' };
                          return <div key={r} title={RISK_META[r]?.label || r} style={{ height: 6, flex: 1, maxWidth: 72, borderRadius: 99, background: rm.color }} />;
                        })}
                      </div>
                    )}

                    <div style={{ padding: risks.length > 0 ? '7px 10px 10px' : '10px 10px' }}>
                      {/* Ref + type badge row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, color, letterSpacing: '0.01em' }}>
                          {ship.ref_number}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em' }}>
                          {TYPE_SHORT[ship.type as string] || ship.type}
                        </span>
                      </div>

                      {/* Title — 2-line clamp */}
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 9,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {ship.goods_desc}
                      </div>

                      {/* Risk text chips */}
                      {risks.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
                          {risks.map(r => {
                            const rm = RISK_META[r] || { label: r, color: '#6b7280' };
                            return (
                              <span key={r} style={{
                                fontSize: 10, fontWeight: 700, color: rm.color,
                                background: `${rm.color}18`, borderRadius: 4,
                                padding: '2px 6px', letterSpacing: '0.02em',
                              }}>
                                {rm.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Customer row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: ship._avatarColor, color: '#fff',
                          fontSize: 8.5, fontWeight: 800, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.5px',
                        }}>
                          {initials}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ship._customer}
                        </span>
                      </div>

                      {/* Footer: progress bar + % + days */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ flex: 1, height: 3, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink3)', flexShrink: 0 }}>
                          {pct}%
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: daysColor, background: daysBg, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          {days}d
                        </span>
                      </div>
                    </div>
                  </div>
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
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [urlParams] = useSearchParams();
  const [searchQuery, setSearchQuery]     = useState(() => urlParams.get('search') || '');
  const [selectedType, setSelectedType]   = useState<ShipmentType | 'ALL'>('ALL');
  const [showOnlyMyCases, setShowOnlyMyCases] = useState(false);
  const [selectedRiskOnly, setSelectedRiskOnly] = useState(false);

  const handleAiQuery = useCallback((_raw: string, filters: AiFilterResult) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery);
    if (filters.type        !== undefined) setSelectedType(filters.type);
    if (filters.riskOnly    !== undefined) setSelectedRiskOnly(filters.riskOnly);
    if (filters.myCases     !== undefined) setShowOnlyMyCases(filters.myCases);
  }, []);
  const [selectedMetric, setSelectedMetric] = useState<Metric>(null);
  const [sortBy, setSortBy] = useState<'urgency' | 'created' | 'eta' | 'days'>('urgency');
  const [viewMode, setViewMode] = useState<'list' | 'board'>(
    () => (localStorage.getItem('ops_viewMode') as 'list' | 'board') ?? 'list'
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { groupedShipments, kpis, loading, refresh } = useShipments(
    showOnlyMyCases ? { assigned_to: user?.id } : {}
  );

  const [opsSummary, setOpsSummary] = useState<{ checked_in: number; active_shipments: number; pending_tasks: number } | null>(null);

  useEffect(() => {
    apiFetch('/v1/hr/ops-summary')
      .then((d: any) => setOpsSummary(d))
      .catch(() => {});
  }, []);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState<'ocr' | 'form'>('ocr');
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any | null>(null);
  const [ocrSimulated, setOcrSimulated] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [createForm, setCreateForm] = useState({
    customer_id: '',
    type: 'SEA_FCL' as ShipmentType,
    goods_desc: '',
    bl_number: '',
    vessel: '',
    origin_port: 'Port of Shanghai',
    dest_port: 'Port of Dar es Salaam',
    eta: '',
    free_time_end: '',
    assigned_to: '',
    assigned_to_name: '',
    container_number: 'MSKU' + Math.floor(1000000 + Math.random() * 9000000),
    container_size: '40HC' as const,
  });
  const [ocrDeclarationData, setOcrDeclarationData] = useState<any | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!showCreateModal) return;
    apiFetch('/v1/customers').then(res => {
      const list = res.data || [];
      setCustomers(list);
      if (list.length > 0) setCreateForm(p => ({ ...p, customer_id: list[0].id }));
    });
    apiFetch('/v1/hr/staff').then(res => {
      const list = (res.data || res || []) as any[];
      setOfficers(list);
    }).catch(() => {
      apiFetch('/v1/analytics/officers').then(res => setOfficers(res.data || []));
    });
  }, [showCreateModal]);

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateStep('ocr');
    setOcrFile(null);
    setOcrPreview(null);
    setOcrResult(null);
    setOcrSimulated(false);
    setOcrDeclarationData(null);
    setCreateForm(p => ({ ...p, assigned_to: '', assigned_to_name: '' }));
  };

  const handleOcrFile = async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    setOcrFile(file);
    // Generate preview URL for images
    if (file.type.startsWith('image/')) {
      setOcrPreview(URL.createObjectURL(file));
    } else {
      setOcrPreview(null);
    }
    setOcrScanning(true);
    setOcrResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      const mediaType = file.type.startsWith('image/') ? file.type : 'image/jpeg';
      const res = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({ image_base64: b64, media_type: mediaType }),
      });
      setOcrResult(res.result);
      setOcrSimulated(res.simulated || false);
    } catch (err: any) {
      alert('OCR scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      setOcrScanning(false);
    }
  };

  const applyOcrToForm = () => {
    if (!ocrResult) return;
    const isTansad = ocrResult.doc_type === 'TANSAD';
    const ov = ocrResult.overview || {};
    const fi = ocrResult.financial || {};
    const pt = ocrResult.parties  || {};

    // Derive goods description from HS lines if not explicit
    const hs: any[] = ocrResult.hs_lines || [];
    const goodsFromHs = hs.length > 0
      ? hs.map((l: any) => l.description).filter(Boolean).join('; ')
      : '';

    setCreateForm(p => ({
      ...p,
      bl_number:        isTansad ? (ov.tansad_number || p.bl_number) : (ov.bl_number || p.bl_number),
      vessel:           ov.vessel           || p.vessel,
      origin_port:      ov.origin_port      || (isTansad ? pt.shipper_country : '') || p.origin_port,
      dest_port:        ov.dest_port        || p.dest_port,
      goods_desc:       ov.goods_desc       || goodsFromHs || p.goods_desc,
      eta:              ov.eta              || p.eta,
      free_time_end:    ov.free_time_end    || p.free_time_end,
      container_number: ov.container_number || p.container_number,
      container_size:   (ov.container_size as any) || p.container_size,
    }));
    setOcrDeclarationData({
      doc_type: ocrResult.doc_type,
      parties:  pt,
      financial: fi,
      hs_lines: hs,
      overview: ov,
    });
    setCreateStep('form');
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await apiFetch('/v1/shipments', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: createForm.customer_id,
          type: createForm.type,
          goods_desc: createForm.goods_desc,
          bl_number: createForm.bl_number || undefined,
          vessel: createForm.vessel,
          origin_port: createForm.origin_port,
          dest_port: createForm.dest_port,
          eta: createForm.eta ? new Date(createForm.eta).toISOString() : undefined,
          free_time_end: createForm.free_time_end ? new Date(createForm.free_time_end).toISOString() : undefined,
          assigned_to: createForm.assigned_to || undefined,
          containers: [{
            number: createForm.container_number,
            size: createForm.container_size,
            seal_number: 'SL-' + Math.floor(100000 + Math.random() * 900000),
          }],
        }),
      });

      const shipmentId  = res?.data?.id  || res?.id;
      const refNumber   = res?.data?.ref_number || res?.ref_number || 'New Shipment';

      if (ocrDeclarationData && shipmentId) {
        localStorage.setItem(`ocrDecl_${shipmentId}`, JSON.stringify(ocrDeclarationData));
      }

      // Send in-app notification to the assigned officer
      if (createForm.assigned_to && shipmentId) {
        apiFetch('/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            user_id: createForm.assigned_to,
            type:    'assignment',
            title:   `You've been assigned ${refNumber}`,
            message: `You have been assigned to handle: ${createForm.goods_desc}. From ${createForm.origin_port} → ${createForm.dest_port}.`,
            link:    `/clearance/${shipmentId}`,
            metadata: { shipment_id: shipmentId, assigned_by: user?.name || 'Operations' },
          }),
        }).catch(() => {});
      }

      closeCreateModal();
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to create case');
    } finally {
      setCreateLoading(false);
    }
  };

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
        <div className="cc-page-header">
          <div className="cc-page-header-left">
            <div className="cc-breadcrumb">
              <span className="cc-breadcrumb-root">Dashboard</span>
              <span className="cc-breadcrumb-sep">›</span>
              <span className="cc-breadcrumb-current">Operations</span>
            </div>
            <h1 className="cc-page-title">
              {isJunior ? 'My Cases' : 'Operations'}
            </h1>
          </div>
          <div className="cc-page-header-right">
            <span className="cc-date-chip">{todayLabel}</span>

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

            {canCreate && (
              <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
                + New Shipment
              </button>
            )}
            <button type="button" onClick={() => { localStorage.clear(); refresh(); }} className="btn btn-secondary btn-sm" title="Refresh data">
              ↻
            </button>
          </div>
        </div>

        {/* Ops summary bar */}
        {opsSummary && (
          <div style={{ display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0, boxShadow: '0 0 0 2px rgba(22,163,74,0.25)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Checked In</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{opsSummary.checked_in}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Active Shipments</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)', lineHeight: 1 }}>{opsSummary.active_shipments}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Pending Tasks</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: opsSummary.pending_tasks > 0 ? '#d97706' : 'var(--ink)', lineHeight: 1 }}>{opsSummary.pending_tasks}</span>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <FilterBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          showOnlyMyCases={showOnlyMyCases}
          setShowOnlyMyCases={setShowOnlyMyCases}
          selectedRiskOnly={selectedRiskOnly}
          setSelectedRiskOnly={setSelectedRiskOnly}
          onAiQuery={handleAiQuery}
        />

        {/* Board view */}
        {viewMode === 'board' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                Syncing shipment data…
              </div>
            ) : (
              <KanbanBoard groups={filteredGroupedShipments} />
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
                  onSelectShipment={(ship: ShipmentCase) => navigate(`/clearance/${ship.id}`)}
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
                <select value={pageSize} title="Rows per page"
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', color: 'var(--ink)', background: 'var(--white)', cursor: 'pointer' }}>
                  {[5, 10, 20, 25, 50].map(s => <option key={s} value={s}>{s} / page</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>


      {/* Create Case Modal — 2-step: OCR → Form */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeCreateModal()}>
          <div className="card" style={{ width: '94%', maxWidth: createStep === 'ocr' && ocrResult ? '820px' : '560px', padding: '24px', borderRadius: '9px', boxShadow: 'var(--shadow-lg)', transition: 'max-width 0.25s ease', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div>
                <h2 className="cc-modal-title" style={{ marginBottom: 2 }}>New Shipment</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['ocr', 'form'] as const).map((s, i) => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: createStep === s ? 'var(--teal)' : 'var(--ink3)', fontWeight: createStep === s ? 700 : 400 }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: createStep === s ? 'var(--teal)' : i < (['ocr','form'].indexOf(createStep)) ? 'var(--teal)' : 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>{i + 1}</span>
                      {s === 'ocr' ? 'Scan Document' : 'Shipment Details'}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" title="Close" className="dp-close" onClick={closeCreateModal}>×</button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />

            {/* ── STEP 1: OCR ── */}
            {createStep === 'ocr' && (
              <div>
                {/* Drop zone */}
                {!ocrFile && !ocrScanning && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleOcrFile(f); }}
                    style={{ border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, padding: '40px 24px', textAlign: 'center', background: dragOver ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.onchange = (ev: any) => { const f = ev.target.files?.[0]; if (f) handleOcrFile(f); }; inp.click(); }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>Drop or click to upload a document</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Bill of Lading · Commercial Invoice · Packing List · Air Waybill</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>PNG, JPG, WEBP, PDF supported</div>
                  </div>
                )}

                {/* Scanning animation */}
                {ocrScanning && (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <div style={{ width: 56, height: 56, border: '4px solid var(--teal-l)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Scanning document…</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>AI is extracting shipment data</div>
                  </div>
                )}

                {/* OCR Result */}
                {ocrResult && !ocrScanning && (() => {
                  const ov = ocrResult.overview || {};
                  const pt = ocrResult.parties || {};
                  const fi = ocrResult.financial || {};
                  const hs: any[] = ocrResult.hs_lines || [];
                  const conf = Math.round((ocrResult.confidence || 0.9) * 100);
                  return (
                    <div style={{ display: 'flex', gap: 16 }}>
                      {/* Left: thumbnail */}
                      {ocrPreview && (
                        <div style={{ flexShrink: 0 }}>
                          <img src={ocrPreview} alt="Scanned document" style={{ width: 160, height: 200, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)' }} />
                        </div>
                      )}
                      {/* Right: extracted data */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, background: 'var(--teal)', color: '#fff', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{ocrResult.doc_type}</span>
                            {ocrSimulated && <span style={{ fontSize: 11, background: 'var(--gold)', color: '#7c5800', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>Demo data</span>}
                            <span style={{ fontSize: 11, color: conf >= 85 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{conf}% confidence</span>
                          </div>
                          <button type="button" title="Re-scan a different document" style={{ fontSize: 11, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                            onClick={() => { setOcrFile(null); setOcrPreview(null); setOcrResult(null); }}>
                            Re-scan
                          </button>
                        </div>

                        {/* Overview grid */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Document Overview</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 12 }}>
                          {[
                            ['B/L Number', ov.bl_number], ['Vessel', ov.vessel],
                            ['Origin Port', ov.origin_port], ['Dest Port', ov.dest_port],
                            ['ETA', ov.eta], ['Container', ov.container_number],
                            ['Gross Weight', ov.gross_weight_kg ? ov.gross_weight_kg + ' kg' : ''], ['CBM', ov.cbm],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k as string} style={{ display: 'flex', flexDirection: 'column', padding: '5px 8px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--teal)' }}>
                              <span style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>{k}</span>
                              <span style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{v}</span>
                            </div>
                          ))}
                        </div>

                        {/* Parties */}
                        {(pt.shipper_name || pt.consignee_name) && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Parties</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 12 }}>
                              {pt.shipper_name && (
                                <div style={{ padding: '5px 8px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--blue)' }}>
                                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>Shipper / Exporter</div>
                                  <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{pt.shipper_name}</div>
                                  {pt.shipper_country && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{pt.shipper_country}</div>}
                                </div>
                              )}
                              {pt.consignee_name && (
                                <div style={{ padding: '5px 8px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--blue)' }}>
                                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>Consignee / Importer</div>
                                  <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{pt.consignee_name}</div>
                                  {pt.consignee_country && <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{pt.consignee_country}</div>}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Financial */}
                        {(fi.invoice_number || fi.invoice_value_usd) && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Financial</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', marginBottom: 12 }}>
                              {[
                                ['Invoice No.', fi.invoice_number], ['Invoice Date', fi.invoice_date],
                                ['Invoice Value', fi.invoice_value_usd ? `$${Number(fi.invoice_value_usd).toLocaleString()}` : ''],
                                ['Incoterms', fi.incoterms], ['Freight (USD)', fi.freight_usd ? `$${fi.freight_usd}` : ''],
                                ['Insurance', fi.insurance_usd ? `$${fi.insurance_usd}` : ''],
                              ].filter(([, v]) => v).map(([k, v]) => (
                                <div key={k as string} style={{ padding: '5px 8px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--gold)' }}>
                                  <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600 }}>{k}</div>
                                  <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* HS Lines */}
                        {hs.length > 0 && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>HS Code Lines ({hs.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                              {hs.map((line: any, i: number) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--navy)' }}>
                                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', flexShrink: 0 }}>{line.hs_code}</span>
                                  <span style={{ fontSize: 11, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description}</span>
                                  <span style={{ fontSize: 11, color: 'var(--ink3)', flexShrink: 0 }}>{line.quantity} {line.unit}</span>
                                  {line.value_usd && <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 600, flexShrink: 0 }}>${Number(line.value_usd).toLocaleString()}</span>}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Flags */}
                        {ocrResult.flags?.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                            {ocrResult.flags.map((f: string) => (
                              <span key={f} style={{ fontSize: 11, background: 'var(--red)', color: '#fff', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{f}</span>
                            ))}
                          </div>
                        )}

                        {/* Goods description preview */}
                        {ov.goods_desc && (
                          <div style={{ padding: '8px 10px', background: 'var(--teal-l)', borderRadius: 9, fontSize: 12, color: 'var(--ink)', marginBottom: 12 }}>
                            <span style={{ fontWeight: 700 }}>Goods: </span>{ov.goods_desc}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button type="button" title="Skip OCR and fill form manually" className="btn btn-secondary btn-sm" onClick={() => setCreateStep('form')}>
                    Skip — fill manually
                  </button>
                  {ocrResult && !ocrScanning && (
                    <button type="button" title="Apply extracted data to form" className="btn btn-primary btn-sm" onClick={applyOcrToForm}>
                      Apply & Continue →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: FORM ── */}
            {createStep === 'form' && (
              <form onSubmit={handleCreateCase} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ocrDeclarationData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--teal-l)', borderRadius: 9, fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                    <span>✓</span>
                    <span>OCR data applied — declaration info will be pre-filled in the Declaration tab after creation.</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Customer</label>
                    <select title="Customer" className="input-field" value={createForm.customer_id} onChange={e => setCreateForm(p => ({ ...p, customer_id: e.target.value }))} required>
                      <option value="" disabled>Choose customer…</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Type</label>
                    <select title="Shipment type" className="input-field" value={createForm.type} onChange={e => setCreateForm(p => ({ ...p, type: e.target.value as ShipmentType }))} required>
                      <option value="SEA_FCL">Sea — FCL</option>
                      <option value="SEA_LCL">Sea — LCL</option>
                      <option value="AIR">Air Cargo</option>
                      <option value="ROAD">Road Freight</option>
                      <option value="RAIL">Rail</option>
                      <option value="BULK">Bulk Vessel</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Goods Description</label>
                  <input type="text" title="Goods description" className="input-field" placeholder="e.g. 500 MT of Medical Supplies" value={createForm.goods_desc} onChange={e => setCreateForm(p => ({ ...p, goods_desc: e.target.value }))} required />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {fld('BL / Doc Number', createForm.bl_number, v => setCreateForm(p => ({ ...p, bl_number: v })), { placeholder: 'e.g. MEDU90123456' })}
                  {fld('Vessel / Flight', createForm.vessel, v => setCreateForm(p => ({ ...p, vessel: v })), { placeholder: 'e.g. MSC Savannah', required: true })}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {fld('Origin Port', createForm.origin_port, v => setCreateForm(p => ({ ...p, origin_port: v })), { required: true })}
                  {fld('Destination Port', createForm.dest_port, v => setCreateForm(p => ({ ...p, dest_port: v })), { required: true })}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>ETA</label>
                    <input title="Estimated time of arrival" type="date" className="input-field" value={createForm.eta} onChange={e => setCreateForm(p => ({ ...p, eta: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>Free Time End</label>
                    <input title="Free time end date" type="date" className="input-field" value={createForm.free_time_end} onChange={e => setCreateForm(p => ({ ...p, free_time_end: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '4px' }}>
                      Assigned Officer <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>— type @ to search</span>
                    </label>
                    <OfficerMentionInput
                      officers={officers}
                      value={{ id: createForm.assigned_to, name: createForm.assigned_to_name }}
                      onChange={(id, name) => setCreateForm(p => ({ ...p, assigned_to: id, assigned_to_name: name }))}
                    />
                  </div>
                  {fld('Container No.', createForm.container_number, v => setCreateForm(p => ({ ...p, container_number: v })), { required: true })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <button type="button" title="Back to document scan" className="btn btn-secondary btn-sm" onClick={() => setCreateStep('ocr')}>
                    ← Back
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={closeCreateModal}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createLoading}>
                      {createLoading ? 'Creating…' : 'Create Shipment'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
