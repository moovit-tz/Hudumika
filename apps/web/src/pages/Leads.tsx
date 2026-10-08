import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { OrganizationPicker, PersonPicker } from '../components/PartyPicker.js';
import type { PickerItem } from '../components/EntityPicker.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import './LeadProfile.css';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionCard } from '../components/SectionCard.js';
import { Tip } from '../components/ui/tooltip.js';
import { ActivityTimeline } from '../components/crm/ActivityTimeline.js';
import { LabelChips } from '../components/crm/LabelChips.js';
import { ComposeEmailButton } from '../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../components/crm/CustomFieldsPanel.js';

/* ── Types ── */
export interface Lead {
  id: string;
  company: string;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  source: string;
  stage: string;
  value: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  assigned_to?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  score?: number;
  expected_close?: string;
  created_at: string;
  notes?: string;
  industry?: string;
  location?: string;
  website?: string;
  territory_id?: string;
  territory_name?: string;
}

/* ── Config ── */
export const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

export const STAGE_CFG: Record<string, { color: string; bg: string; label: string }> = {
  NEW:         { color: 'var(--ink3)',   bg: 'var(--bg)',       label: 'New'         },
  CONTACTED:   { color: 'var(--blue)',   bg: 'var(--blue-l)',   label: 'Contacted'   },
  QUALIFIED:   { color: 'var(--gold)',   bg: 'var(--gold-l)',   label: 'Qualified'   },
  PROPOSAL:    { color: 'var(--purple)', bg: 'var(--purple-l)', label: 'Proposal'    },
  NEGOTIATION: { color: 'var(--teal)',   bg: 'var(--teal-l)',   label: 'Negotiation' },
  WON:         { color: 'var(--green)',  bg: 'var(--green-l)',  label: 'Won'         },
  LOST:        { color: 'var(--red)',    bg: 'var(--red-l)',    label: 'Lost'        },
};

export interface LeadStageEntry {
  id: string; label: string; color: string | null; position: number; is_won: boolean; is_lost: boolean;
}
interface LeadStagesCtxType {
  stageList: LeadStageEntry[];
  stageCfg: Record<string, { color: string; bg: string; label: string }>;
  stageIds: string[];
  wonIds: Set<string>;
  lostIds: Set<string>;
  isTerminal: (stage: string) => boolean;
  wonStageId: string;
  lostStageId: string;
}
const DEFAULT_CTX: LeadStagesCtxType = {
  stageList: [], stageCfg: STAGE_CFG, stageIds: STAGES,
  wonIds: new Set(['WON']), lostIds: new Set(['LOST']),
  isTerminal: (s: string) => s === 'WON' || s === 'LOST',
  wonStageId: 'WON', lostStageId: 'LOST',
};
export const LeadStagesContext = React.createContext<LeadStagesCtxType>(DEFAULT_CTX);

export const PRIORITY_CFG: Record<string, { color: string; bg: string; label: string }> = {
  HIGH:   { color: 'var(--red)',   bg: 'var(--red-l)',   label: 'High'   },
  MEDIUM: { color: 'var(--gold)',  bg: 'var(--gold-l)',  label: 'Medium' },
  LOW:    { color: 'var(--ink3)',  bg: 'var(--bg)',      label: 'Low'    },
};

const SOURCE_CFG: Record<string, { color: string; bg: string }> = {
  'Referral':   { color: 'var(--green)',  bg: 'var(--green-l)'  },
  'LinkedIn':   { color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  'Web Form':   { color: 'var(--purple)', bg: 'var(--purple-l)' },
  'Cold Call':  { color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  'Trade Show': { color: 'var(--teal)',   bg: 'var(--teal-l)'   },
  'Partner':    { color: 'var(--ink2)',   bg: 'var(--bg)'       },
};

const SOURCES   = Object.keys(SOURCE_CFG);

/* ── Helpers ── */
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtShort(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
export function fmtValue(v: number) {
  if (v >= 1_000_000) return `TZS ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `TZS ${(v / 1_000).toFixed(0)}K`;
  return `TZS ${v.toLocaleString()}`;
}
function daysInPipeline(created_at: string) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86_400_000);
}
function getPageNums(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const p: (number | '…')[] = [1];
  if (cur > 3) p.push('…');
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) p.push(i);
  if (cur < total - 2) p.push('…');
  p.push(total);
  return p;
}
const PAGE_SIZE = 10;

/* ── Sub-components ── */
/**
 * A lead's mark.
 *
 * This had its own eight-colour palette keyed off the first character of the
 * name, as did Customers with a different seven — the reason one company came
 * out a different colour in each app. It delegates to the shared avatar now,
 * keeping only this page's corner radius.
 *
 * `leadId` is optional because the same component also draws `contact_name`
 * and `assigned_to`, which are text fields on the lead rather than records of
 * their own and so have no picture to fetch.
 */
export function LeadAv({ name, size = 32, leadId }: { name: string; size?: number; leadId?: string }) {
  return (
    <PersonAvatar
      userId={leadId} kind="leads" name={name} size={size}
      style={{ borderRadius: size > 48 ? 14 : '50%' }}
    />
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const { stageCfg } = React.useContext(LeadStagesContext);
  const c = stageCfg[stage] || stageCfg.NEW || { color: 'var(--ink3)', bg: 'var(--bg)', label: stage };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap', fontFamily: 'var(--font)', letterSpacing: '0.03em' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const c = SOURCE_CFG[source] || { color: 'var(--ink3)', bg: 'var(--bg)' };
  return <span style={{ padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{source}</span>;
}

function PriBadge({ priority }: { priority: string }) {
  const c = PRIORITY_CFG[priority] || PRIORITY_CFG.LOW;
  return <span style={{ padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
}

/** Rule-based lead score (migration 454). Only rendered when scoring rules
 *  exist — an undefined score means the tenant hasn't set any up. */
export function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--gold)' : 'var(--ink3)';
  const bg = score >= 70 ? 'var(--green-l)' : score >= 40 ? 'var(--gold-l)' : 'var(--bg)';
  return (
    <Tip label="Lead score">
      <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: bg, color }}>
        {score}
      </span>
    </Tip>
  );
}

function Th({ children, align = 'left', width }: { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: align, fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', width }}>
      {children}
    </th>
  );
}

function ActMenu({ onView, onEdit, onDelete }: { onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More actions" onClick={e => e.stopPropagation()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', color: 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
          <Icon name="moreHorizontal" size={16} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onClick={onView}><Icon name="eye" size={13} className="text-muted-foreground" /> View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}><Icon name="edit" size={13} className="text-muted-foreground" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Icon name="trash" size={13} /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Form shape ── */
type FormState = Omit<Lead, 'id' | 'created_at'>;
/** "Use an existing company / contact" pickers for a new lead. Choosing one fills the lead's own
 *  text fields (a snapshot, still editable) and records which canonical party it refers to. */
function LeadPartyLinks({ linkedOrg, setLinkedOrg, linkedPerson, setLinkedPerson, setForm }: {
  linkedOrg: PickerItem | null; setLinkedOrg: (v: PickerItem | null) => void;
  linkedPerson: PickerItem | null; setLinkedPerson: (v: PickerItem | null) => void;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (<>
    <div>
      <OrganizationPicker label="Existing company (optional)" hint="Pick a company you already have — its name fills in below."
        value={linkedOrg}
        onChange={item => { setLinkedOrg(item); if (item) setForm(p => ({ ...p, company: item.label })); }} />
    </div>
    <div>
      <PersonPicker label="Existing contact (optional)" hint="Pick someone you already know — their details fill in below."
        value={linkedPerson}
        onChange={async item => {
          setLinkedPerson(item);
          if (!item) return;
          setForm(p => ({ ...p, contact_name: item.label }));
          try {
            const party = await apiFetch(`/v1/parties/${item.id}`);
            const email = party?.channels?.find((c: any) => c.channel_type === 'EMAIL')?.value;
            const phone = party?.channels?.find((c: any) => c.channel_type === 'PHONE' || c.channel_type === 'MOBILE')?.value;
            setForm(p => ({ ...p, contact_email: p.contact_email || email || '', contact_phone: p.contact_phone || phone || '' }));
          } catch { /* the name is enough; details are a convenience */ }
        }} />
    </div>
  </>);
}

const EMPTY_FORM: FormState = {
  company: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'Web Form', stage: 'NEW', value: 0, priority: 'MEDIUM',
  assigned_to: '', expected_close: '', notes: '', industry: '', location: '', website: '',
  territory_id: '', territory_name: '',
};

/* ── CSV export ── */
function exportLeadsCSV(rows: Lead[]) {
  const hdr = ['Company', 'Contact Name', 'Email', 'Phone', 'Source', 'Stage', 'Value (TZS)', 'Priority', 'Assigned To', 'Expected Close', 'Created'].join(',');
  const body = rows.map(l => [
    `"${l.company.replace(/"/g, '""')}"`,
    `"${l.contact_name.replace(/"/g, '""')}"`,
    `"${(l.contact_email || '').replace(/"/g, '""')}"`,
    l.contact_phone || '',
    l.source,
    l.stage,
    l.value,
    l.priority,
    `"${(l.assigned_to || '').replace(/"/g, '""')}"`,
    l.expected_close || '',
    l.created_at,
  ].join(',')).join('\n');
  const blob = new Blob([hdr + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── Stage pipeline bar ──
   One row, not two: each pill IS the "move to this stage" control (past
   stages jump back, future stages jump forward), so the pipeline no longer
   repeats every stage name a second time as a separate row of "→ Stage"
   buttons underneath. Completed stages carry a check so progress reads at a
   glance without comparing colour saturation. */
function StagePipeline({ current, onSelect, interactive }: { current: string; onSelect: (stage: string) => void; interactive: boolean }) {
  const { stageIds, stageCfg, lostIds } = React.useContext(LeadStagesContext);
  const activeStages = stageIds.filter(s => !lostIds.has(s));
  // Older leads retain built-in stage IDs after a tenant configures its stages.
  const active = activeStages.findIndex(stage => stage === current || stageCfg[stage]?.label === stageCfg[current]?.label);
  const isLost = lostIds.has(current);
  const lostCfg = stageCfg[current] || stageCfg.LOST || { color: 'var(--red)', bg: 'var(--red-l)', label: 'Lost' };

  if (isLost) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 'var(--badge-radius)', fontSize: 12.5, fontWeight: 700, background: lostCfg.bg, color: lostCfg.color, border: `1.5px solid ${lostCfg.color}` }}>
        <Icon name="x" size={12} strokeWidth={3} />
        {lostCfg.label}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
      {activeStages.map((s, i) => {
        const cfg = stageCfg[s] || { color: 'var(--ink3)', bg: 'var(--bg)', label: s };
        const done = i < active;
        const cur = i === active;
        const clickable = interactive && !cur;
        return (
          <React.Fragment key={s}>
            <Tip label={clickable ? `Move to ${cfg.label}` : cfg.label}>
            <Button variant={cur ? 'default' : done ? 'secondary' : 'outline'}
              type="button"
              aria-current={cur ? 'step' : undefined}
              disabled={!clickable}
              onClick={() => clickable && onSelect(s)}



            >
              {done && <Icon name="check" size={12} strokeWidth={3} />}
              {cfg.label}
            </Button>
            </Tip>
            {i < activeStages.length - 1 && (
              <div style={{ width: 18, height: 2, borderRadius: 'var(--badge-radius)', background: i < active ? 'var(--teal)' : 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════
   Main component
══════════════════════════════════════════ */
export const Leads: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView]       = useState<'list' | 'profile'>('list');
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [profileTab, setProfileTab] = useState('overview');
  const [editMode, setEditMode]     = useState(false);
  const [profileForm, setProfileForm] = useState<Partial<Lead>>({});
  const [saving, setSaving]           = useState(false);
  const [notes, setNotes]             = useState('');
  const [noteSaving, setNoteSaving]   = useState(false);
  const [leadTasks, setLeadTasks]     = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue]   = useState('');
  const [addingTask, setAddingTask]   = useState(false);

  /* Live lead stages from /v1/crm/lead-stages — replaces static STAGES array */
  const [liveStages, setLiveStages] = useState<LeadStageEntry[]>([]);
  useEffect(() => {
    let alive = true;
    apiFetch('/v1/crm/lead-stages').then((rows: LeadStageEntry[]) => { if (alive) setLiveStages(rows || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const stagesCtx: LeadStagesCtxType = React.useMemo(() => {
    if (liveStages.length === 0) return DEFAULT_CTX;
    const cfg: Record<string, { color: string; bg: string; label: string }> = { ...STAGE_CFG };
    const wonIds = new Set<string>(['WON']);
    const lostIds = new Set<string>(['LOST']);
    for (const s of liveStages) {
      cfg[s.id] = {
        color: s.color ?? 'var(--teal)',
        bg: s.color ? s.color + '22' : 'var(--teal-l)',
        label: s.label,
      };
      if (s.is_won) wonIds.add(s.id);
      if (s.is_lost) lostIds.add(s.id);
    }
    const stageIds = liveStages.map(s => s.id);
    return {
      stageList: liveStages,
      stageCfg: cfg,
      stageIds,
      wonIds,
      lostIds,
      isTerminal: (s: string) => wonIds.has(s) || lostIds.has(s),
      wonStageId:  liveStages.find(s => s.is_won)?.id  ?? 'WON',
      lostStageId: liveStages.find(s => s.is_lost)?.id ?? 'LOST',
    };
  }, [liveStages]);

  /* Real staff list for "Assigned To" — replaces the old hardcoded OFFICERS
     names with an actual account, same /v1/hr/staff endpoint Contacts' own
     owner picker uses. */
  const [staff, setStaff] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    apiFetch('/v1/hr/staff?search=').then((rows: any[]) => { if (alive) setStaff((rows || []).map(u => ({ value: u.id, label: u.name }))); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /* List filters */
  const [search,         setSearch]         = useState('');
  const [filterStage,     setFilterStage]     = useState('');
  const [filterSource,    setFilterSource]    = useState('');
  const [filterPriority,  setFilterPriority]  = useState('');
  const [filterTerritory, setFilterTerritory] = useState('');
  const [territories,     setTerritories]     = useState<{ id: string; name: string }[]>([]);
  const [selectedIds,    setSelectedIds]    = useState<string[]>([]);
  const [bulkAction,     setBulkAction]     = useState('');
  const [bulkApplying,   setBulkApplying]   = useState(false);
  const [page,           setPage]           = useState(1);

  /* Smart views */
  const [savedViews,     setSavedViews]     = useState<{ id: string; name: string; count: number }[]>([]);
  const [activeViewId,   setActiveViewId]   = useState<string | null>(null);
  const [viewMatchIds,   setViewMatchIds]   = useState<Set<string> | null>(null);

  /* Add/Edit modal */
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<FormState>({ ...EMPTY_FORM });
  // Optional links to an existing canonical organization / person (create only). The lead still keeps
  // its own company / contact text as a snapshot; the link says which record it refers to.
  const [linkedOrg, setLinkedOrg] = useState<PickerItem | null>(null);
  const [linkedPerson, setLinkedPerson] = useState<PickerItem | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /* Documents — the "Upload File" control used to POST to
     /v1/leads/:id/documents, a route that has never existed anywhere in the
     backend (grep apps/api/src/routes confirms it) — every upload attempt
     404'd, silently, since the catch just showed a generic "Upload failed"
     alert with no indication the endpoint itself was the problem. Rewired
     to the same real Drive-backed files API Customers.tsx's own Documents
     tab already uses (entity_type/entity_id tagging on cloud_files), just
     without that page's extra "customer folder" auto-resolution — files
     here are tagged to the lead and dropped in the tenant's default drive. */
  const [linkedFiles, setLinkedFiles] = useState<any[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const profileFileInput = useRef<HTMLInputElement>(null);
  const [defaultDriveId, setDefaultDriveId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/leads');
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      setLeads(data);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load leads');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    apiFetch('/v1/crm/smart-views?entity_type=lead')
      .then((res: any) => setSavedViews(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch('/v1/crm/territories')
      .then((res: any) => setTerritories(Array.isArray(res) ? res.filter((t: any) => t.active !== false) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeViewId) { setViewMatchIds(null); return; }
    apiFetch(`/v1/crm/smart-views/${activeViewId}/results`)
      .then((res: any) => {
        const ids = Array.isArray(res) ? res.map((r: any) => r.id ?? r) : [];
        setViewMatchIds(new Set(ids));
      })
      .catch(() => setViewMatchIds(null));
  }, [activeViewId]);

  useEffect(() => {
    if (selected) setNotes(selected.notes || '');
  }, [selected]);

  useEffect(() => {
    if (!selected || profileTab !== 'tasks') return;
    apiFetch(`/v1/crm/tasks?subject_type=lead&subject_id=${selected.id}&done=all`)
      .then((res: any) => setLeadTasks(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selected, profileTab]);

  /* Filtering */
  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    if (q && !l.company.toLowerCase().includes(q) && !l.contact_name.toLowerCase().includes(q) && !(l.contact_email || '').toLowerCase().includes(q)) return false;
    if (filterStage     && l.stage        !== filterStage)     return false;
    if (filterSource    && l.source       !== filterSource)    return false;
    if (filterPriority  && l.priority     !== filterPriority)  return false;
    if (filterTerritory && l.territory_id !== filterTerritory) return false;
    if (viewMatchIds    && !viewMatchIds.has(l.id))            return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pg   = Math.min(page, totalPages);
  const rows = filtered.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);
  const allChecked = rows.length > 0 && rows.every(l => selectedIds.includes(l.id));

  function toggleAll() {
    if (allChecked) setSelectedIds(p => p.filter(id => !rows.some(l => l.id === id)));
    else setSelectedIds(p => [...new Set([...p, ...rows.map(l => l.id)])]);
  }

  /* Metrics */
  const { isTerminal, wonIds, lostIds, stageIds, stageCfg: liveStageCfg, wonStageId, lostStageId } = stagesCtx;
  const active   = leads.filter(l => !isTerminal(l.stage));
  const wonL     = leads.filter(l => wonIds.has(l.stage));
  const lostL    = leads.filter(l => lostIds.has(l.stage));
  const pipeline = active.reduce((s, l) => s + l.value, 0);
  const wonVal   = wonL.reduce((s, l) => s + l.value, 0);
  const closedN  = wonL.length + lostL.length;
  const winRate  = closedN ? Math.round(wonL.length / closedN * 100) : 0;

  /* CRUD */
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    try {
      if (editingId) {
        const patchBody = { ...addForm, value: Number(addForm.value) || 0, territory_id: addForm.territory_id || null };
        await apiFetch(`/v1/leads/${editingId}`, { method: 'PATCH', body: JSON.stringify(patchBody) });
        const localPatch = { ...patchBody, territory_id: patchBody.territory_id ?? undefined };
        setLeads(p => p.map(l => l.id === editingId ? { ...l, ...localPatch } : l));
        if (selected?.id === editingId) setSelected(prev => prev ? { ...prev, ...localPatch } : prev);
      } else {
        const res = await apiFetch('/v1/leads', { method: 'POST', body: JSON.stringify({ ...addForm, value: Number(addForm.value) || 0, territory_id: addForm.territory_id || null, organization_party_id: linkedOrg?.id ?? null, contact_party_id: linkedPerson?.id ?? null }) });
        const newLead: Lead = res?.id ? res : { ...addForm, id: res?.id ?? Date.now().toString(), value: Number(addForm.value) || 0, created_at: new Date().toISOString().split('T')[0] };
        setLeads(p => [newLead, ...p]);
      }
      setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); setLinkedOrg(null); setLinkedPerson(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save lead');
    } finally { setAddSaving(false); }
  }

  async function handleBulkApply() {
    if (!bulkAction || selectedIds.length === 0) return;
    setBulkApplying(true);
    try {
      if (bulkAction === 'delete') {
        if (!(await showConfirm(`Delete ${selectedIds.length} lead(s)? This cannot be undone.`, { confirmLabel: 'Delete' }))) {
          setBulkApplying(false); return;
        }
        await Promise.all(selectedIds.map(id => apiFetch(`/v1/leads/${id}`, { method: 'DELETE' })));
        setLeads(p => p.filter(l => !selectedIds.includes(l.id)));
        if (selected && selectedIds.includes(selected.id)) closeProfile();
      } else if (bulkAction === 'export') {
        const toExport = leads.filter(l => selectedIds.includes(l.id));
        const rows = [
          ['Company', 'Contact', 'Email', 'Phone', 'Stage', 'Value', 'Priority', 'Source', 'Created'],
          ...toExport.map(l => [l.company, l.contact_name, l.contact_email || '', l.contact_phone || '', l.stage, l.value, l.priority, l.source, l.created_at?.slice(0, 10) || '']),
        ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([rows], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leads.csv'; a.click();
      } else {
        // Stage bulk-move
        await Promise.all(selectedIds.map(id => apiFetch(`/v1/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ stage: bulkAction }) })));
        setLeads(p => p.map(l => selectedIds.includes(l.id) ? { ...l, stage: bulkAction } : l));
        if (selected && selectedIds.includes(selected.id)) setSelected(prev => prev ? { ...prev, stage: bulkAction } : prev);
      }
      setSelectedIds([]);
      setBulkAction('');
    } catch (err: any) {
      showAlert(err.message || 'Bulk action failed');
    } finally { setBulkApplying(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await showConfirm(`Delete "${name}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/leads/${id}`, { method: 'DELETE' });
      setLeads(p => p.filter(l => l.id !== id));
      if (selected?.id === id) closeProfile();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete lead');
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/leads/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ...profileForm, value: Number(profileForm.value) || 0 }) });
      const updated = { ...selected, ...profileForm, value: Number(profileForm.value) || 0 };
      setSelected(updated);
      setLeads(p => p.map(l => l.id === selected.id ? updated : l));
      setEditMode(false);
    } catch (err: any) { showAlert(err.message || 'Save failed'); } finally { setSaving(false); }
  }

  async function handleSaveNote() {
    if (!selected) return;
    setNoteSaving(true);
    try {
      await apiFetch(`/v1/leads/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      setSelected(prev => prev ? { ...prev, notes } : prev);
      setLeads(p => p.map(l => l.id === selected.id ? { ...l, notes } : l));
    } catch (err: any) { showAlert(err.message || 'Failed to save'); } finally { setNoteSaving(false); }
  }

  async function updateStage(stage: string) {
    if (!selected) return;
    try {
      await apiFetch(`/v1/leads/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      const updated = { ...selected, stage };
      setSelected(updated);
      setLeads(p => p.map(l => l.id === selected.id ? updated : l));
    } catch (err: any) { showAlert(err.message || 'Failed'); }
  }

  // Creates a real Deal from this lead (deals.routes.ts, migration 447) and
  // takes the rep straight to it on the new Pipeline board — the lead
  // itself is untouched, so its own stage still records how it was
  // qualified in the first place.
  async function convertToDeal() {
    if (!selected) return;
    try {
      await apiFetch(`/v1/leads/${selected.id}/convert`, { method: 'POST' });
      navigate('/crm/pipeline');
    } catch (err: any) { showAlert(err.message || 'Failed to convert lead to a deal'); }
  }

  const loadLinkedFiles = useCallback(async (leadId: string) => {
    setFilesLoading(true);
    try {
      const res = await apiFetch(`/v1/files?entity_type=lead&entity_id=${leadId}`).catch(() => []);
      setLinkedFiles(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setFilesLoading(false); }
  }, []);

  useEffect(() => {
    if (selected && profileTab === 'documents') loadLinkedFiles(selected.id);
  }, [selected, profileTab, loadLinkedFiles]);

  // The tenant's default drive to upload into, fetched once and cached —
  // same "resolve lazily, first time it's actually needed" pattern
  // Customers.tsx uses for the same purpose.
  const ensureDefaultDrive = useCallback(async () => {
    if (defaultDriveId) return defaultDriveId;
    const drives = await apiFetch('/v1/drives').catch(() => []);
    const id = Array.isArray(drives) && drives.length ? drives[0].id : null;
    setDefaultDriveId(id);
    return id;
  }, [defaultDriveId]);

  async function uploadFilesToDrive(files: File[]) {
    if (!selected || !files.length) return;
    setFileUploading(true);
    try {
      const driveId = await ensureDefaultDrive();
      if (!driveId) throw new Error('No Drive available to upload into');
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const qs = new URLSearchParams({ drive_id: driveId, entity_type: 'lead', entity_id: selected.id });
        await apiFetch(`/v1/files/upload?${qs.toString()}`, { method: 'POST', body: fd });
      }
      showAlert(`${files.length} file(s) uploaded`, { variant: 'success' });
      await loadLinkedFiles(selected.id);
    } catch (err: any) { showAlert(err.message || 'Upload failed'); } finally { setFileUploading(false); }
  }

  async function unlinkFile(fileId: string, name: string) {
    if (!selected) return;
    if (!(await showConfirm(`Remove "${name}" from this lead? The file stays in Drive.`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/files/${fileId}`, { method: 'PATCH', body: JSON.stringify({ entity_type: null, entity_id: null }) });
      setLinkedFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err: any) { showAlert(err.message || 'Failed to remove file'); }
  }

  function openProfile(lead: Lead) {
    setSelected(lead);
    setProfileForm({ ...lead });
    setProfileTab('overview');
    setEditMode(false);
    setView('profile');
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('lead', lead.id); return n; }, { replace: true });
  }

  function closeProfile() {
    setSelected(null);
    setView('list');
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('lead'); return n; }, { replace: true });
  }

  useEffect(() => {
    const id = searchParams.get('lead');
    if (!id || loading || selected?.id === id) return;
    const match = leads.find(lead => lead.id === id);
    if (match) openProfile(match);
  }, [leads, loading, searchParams, selected?.id]);

  function openEdit(lead: Lead) {
    setEditingId(lead.id);
    setAddForm({ company: lead.company, contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '', source: lead.source, stage: lead.stage, value: lead.value, priority: lead.priority, assigned_to: lead.assigned_to || '', expected_close: lead.expected_close || '', notes: lead.notes || '', industry: lead.industry || '', location: lead.location || '', website: lead.website || '' });
    setShowAdd(true);
  }

  function setF(k: keyof FormState, v: string | number) { setAddForm(p => ({ ...p, [k]: v })); }


  /* ══════════════════════
     PROFILE VIEW
  ══════════════════════ */
  if (view === 'profile' && selected) {
    const sel = selected;
    const stageCfg = liveStageCfg[sel.stage] || STAGE_CFG.NEW;
    const priCfg   = PRIORITY_CFG[sel.priority] || PRIORITY_CFG.LOW;
    const days     = daysInPipeline(sel.created_at);

    const PROF_TABS = [
      { key: 'overview',  label: 'Overview',  icon: 'grid'         as IconName },
      { key: 'contact',   label: 'Contact',   icon: 'user'         as IconName },
      { key: 'tasks',     label: 'Tasks',     icon: 'checkCircle'  as IconName },
      { key: 'activity',  label: 'Activity',  icon: 'activity'     as IconName },
      { key: 'notes',     label: 'Notes',     icon: 'edit'         as IconName },
      { key: 'documents', label: 'Documents', icon: 'folder'       as IconName },
    ];

    return (
      <div className="lead-lp-root">
        {/* Breadcrumbs */}
        <div className="lead-lp-crumbs-bar">
          <div className="lead-lp-crumbs-path">
            <a href="/crm/leads" onClick={e => { e.preventDefault(); closeProfile(); }}>CRM · Leads</a>
            <span>/</span>
            <span className="lead-lp-crumbs-current">{sel.company}</span>
          </div>
          <button className="lead-lp-back-btn" onClick={closeProfile} data-ui-native-button="">
            <Icon name="arrowLeft" size={13} />
            All Leads
          </button>
        </div>

        {/* Hero */}
        <div className="lead-lp-hero">
          <div className="lead-lp-hero-header">
            <div className="lead-lp-identity">
              <div className="lead-lp-avatar-frame">
                <AvatarPicker id={sel.id} kind="leads" name={sel.company} size={64} shape="square" controls="default" />
              </div>
              <div className="lead-lp-details">
                <div className="lead-lp-title-row">
                  <h1 className="lead-lp-company-name">{sel.company}</h1>
                  <Badge variant={wonIds.has(sel.stage) ? 'success' : lostIds.has(sel.stage) ? 'error' : 'brand'}>{stageCfg.label}</Badge>
                  <Badge variant={sel.priority === 'HIGH' ? 'error' : sel.priority === 'MEDIUM' ? 'warning' : 'gray'}>{priCfg.label}</Badge>
                  {sel.score != null && <Badge variant="gray">Score {sel.score}</Badge>}
                </div>
                <div className="lead-lp-subtitle-row">
                  {sel.contact_name && (
                    <span className="lead-lp-contact-chip">
                      <PersonAvatar name={sel.contact_name} size={18} />
                      <span>{sel.contact_name}</span>
                    </span>
                  )}
                  {(sel.assigned_to_name || sel.assigned_to) ? (
                    <>
                      <span>·</span>
                      <span className="lead-lp-contact-chip">
                        <PersonAvatar userId={sel.assigned_to_id} name={sel.assigned_to_name || sel.assigned_to || ''} size={18} />
                        <span>Owner: {sel.assigned_to_name || sel.assigned_to}</span>
                      </span>
                    </>
                  ) : null}
                  {sel.source && <><span>·</span><span>Source: <strong style={{ color: 'var(--ink)' }}>{sel.source}</strong></span></>}
                </div>
                <div className="lead-lp-meta-chips">
                  {sel.contact_email && (
                    <span className="lead-lp-meta-chip"><Icon name="mail" size={13} /><a href={`mailto:${sel.contact_email}`}>{sel.contact_email}</a></span>
                  )}
                  {sel.contact_phone && (
                    <span className="lead-lp-meta-chip"><Icon name="phone" size={13} /><a href={`tel:${sel.contact_phone}`}>{sel.contact_phone}</a></span>
                  )}
                  {sel.location && <span className="lead-lp-meta-chip"><Icon name="mapPin" size={13} /><span>{sel.location}</span></span>}
                  {sel.industry && <span className="lead-lp-meta-chip"><Icon name="briefcase" size={13} /><span>{sel.industry}</span></span>}
                </div>
                <div style={{ marginTop: 10 }}>
                  <LabelChips subjectType="lead" subjectId={sel.id} />
                </div>
              </div>
            </div>
            <div className="lead-lp-hero-actions">
              <ComposeEmailButton subjectType="lead" subjectId={sel.id} onSent={() => setProfileTab('activity')}>
                <Button variant="outline" size="sm"><Icon name="mail" size={14} /><span>Email</span></Button>
              </ComposeEmailButton>
              <StartCallButton subjectType="lead" subjectId={sel.id} phone={sel.contact_phone} onLogged={() => setProfileTab('activity')}>
                <Button variant="outline" size="sm" disabled={!sel.contact_phone}><Icon name="phone" size={14} /><span>Call</span></Button>
              </StartCallButton>
              {sel.contact_phone && (
                <Button variant="outline" size="sm"
                  onClick={() => { const phone = sel.contact_phone?.replace(/\D/g, ''); if (phone) window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer'); }}>
                  <Icon name="send" size={14} /><span>WhatsApp</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setProfileForm({ ...sel }); setEditMode(true); setProfileTab('contact'); }}>
                <Icon name="edit" size={14} /><span>Edit</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" style={{ padding: '0 8px' }}>
                    <Icon name="moreHorizontal" size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={convertToDeal}><Icon name="briefcase" size={14} /><span>Convert to Deal</span></DropdownMenuItem>
                  {!isTerminal(sel.stage) && <DropdownMenuItem onClick={() => updateStage(wonStageId)}><Icon name="check" size={14} /><span>Mark Won</span></DropdownMenuItem>}
                  {!isTerminal(sel.stage) && <DropdownMenuItem onClick={() => updateStage(lostStageId)}><Icon name="x" size={14} /><span>Mark Lost</span></DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => handleDelete(sel.id, sel.company)} style={{ color: 'var(--red)' }}><Icon name="trash" size={14} /><span>Delete Lead</span></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* KPI bar */}
          <div className="lead-lp-kpi-bar">
            <div className="lead-lp-kpi-item">
              <div className="lead-lp-kpi-top"><span className="lead-lp-kpi-label">Deal Value</span><Icon name="dollarSign" size={14} /></div>
              <div className={`lead-lp-kpi-val${sel.value > 0 ? ' is-green' : ''}`}>{fmtValue(sel.value)}</div>
              <div className="lead-lp-kpi-sub">Estimated pipeline value</div>
            </div>
            <div className="lead-lp-kpi-item">
              <div className="lead-lp-kpi-top"><span className="lead-lp-kpi-label">Pipeline Age</span><Icon name="clock" size={14} /></div>
              <div className="lead-lp-kpi-val">{Math.max(0, days)} days</div>
              <div className="lead-lp-kpi-sub">Since first contact</div>
            </div>
            <div className="lead-lp-kpi-item">
              <div className="lead-lp-kpi-top"><span className="lead-lp-kpi-label">Expected Close</span><Icon name="calendar" size={14} /></div>
              <div className={`lead-lp-kpi-val${sel.expected_close && new Date(sel.expected_close) < new Date() && !isTerminal(sel.stage) ? ' is-red' : ''}`}>
                {sel.expected_close ? fmtShort(sel.expected_close) : 'Not set'}
              </div>
              <div className="lead-lp-kpi-sub">{sel.expected_close && new Date(sel.expected_close) < new Date() && !isTerminal(sel.stage) ? 'Overdue close date' : 'Target close date'}</div>
            </div>
            <div className="lead-lp-kpi-item">
              <div className="lead-lp-kpi-top"><span className="lead-lp-kpi-label">{sel.score != null ? 'Lead Score' : 'Priority'}</span><Icon name="trendingUp" size={14} /></div>
              {sel.score != null ? (
                <>
                  <div className={`lead-lp-kpi-val${sel.score >= 70 ? ' is-green' : sel.score >= 40 ? ' is-gold' : ''}`}>{sel.score}/100</div>
                  <div className="lead-lp-kpi-sub">{sel.score >= 70 ? 'High-quality lead' : sel.score >= 40 ? 'Moderate interest' : 'Low engagement'}</div>
                </>
              ) : (
                <>
                  <div className={`lead-lp-kpi-val${sel.priority === 'HIGH' ? ' is-red' : sel.priority === 'MEDIUM' ? ' is-gold' : ''}`}>{priCfg.label}</div>
                  <div className="lead-lp-kpi-sub">Sales priority</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab navigation strip */}
        <div className="lead-lp-tab-nav" data-ds-tabstrip="">
          {PROF_TABS.map(t => (
            <button key={t.key} type="button" className="lead-lp-nav-btn"
              data-active={profileTab === t.key ? 'true' : undefined}
              onClick={() => { setProfileTab(t.key); setEditMode(false); }} data-ds-selected={profileTab === t.key} data-ui-native-button="" aria-pressed={profileTab === t.key}>
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
              {t.key === 'tasks' && leadTasks.filter(u => !u.done).length > 0 && (
                <span className="lead-lp-nav-badge">{leadTasks.filter(u => !u.done).length}</span>
              )}
            </button>
          ))}
        </div>

        <LeadStagesContext.Provider value={stagesCtx}>
        <div className="lead-lp-content">

          {/* OVERVIEW */}
          {profileTab === 'overview' && (
            <div className="lead-lp-overview-grid">
              <div className="lead-lp-main-col">
                <div className="lead-lp-card">
                  <div className="lead-lp-card-hdr">
                    <h3 className="lead-lp-card-title"><Icon name="trendingUp" size={15} /><span>Sales Pipeline</span></h3>
                    {!isTerminal(sel.stage) && <Button variant="outline" size="sm" onClick={() => updateStage(lostStageId)}>Mark lost</Button>}
                  </div>
                  <div className="lead-lp-card-body">
                    <div className="lead-lp-pipeline"><StagePipeline current={sel.stage} onSelect={updateStage} interactive={!isTerminal(sel.stage)} /></div>
                  </div>
                </div>
                <div className="lead-lp-card">
                  <div className="lead-lp-card-hdr">
                    <h3 className="lead-lp-card-title"><Icon name="user" size={15} /><span>Contact &amp; Company</span></h3>
                    <Button variant="ghost" size="sm" onClick={() => { setProfileTab('contact'); setEditMode(false); }}><Icon name="edit" size={13} /><span>Edit</span></Button>
                  </div>
                  <div className="lead-lp-card-body is-flush">
                    <div className="lead-lp-kv-list">
                      {[
                        { label: 'Email',     value: sel.contact_email,  icon: 'mail'      as IconName },
                        { label: 'Phone',     value: sel.contact_phone,  icon: 'phone'     as IconName },
                        { label: 'Location',  value: sel.location,       icon: 'mapPin'    as IconName },
                        { label: 'Industry',  value: sel.industry,       icon: 'briefcase' as IconName },
                        { label: 'Website',   value: sel.website,        icon: 'globe'     as IconName },
                        { label: 'Source',    value: sel.source,         icon: 'target'    as IconName },
                        { label: 'Territory', value: sel.territory_name, icon: 'mapPin'    as IconName },
                      ].filter(item => item.value).map(item => (
                        <div key={item.label} className="lead-lp-kv-row" style={{ padding: '10px var(--page-pad-x, 16px)' }}>
                          <span className="lead-lp-kv-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon name={item.icon} size={13} />{item.label}
                          </span>
                          <span className="lead-lp-kv-val">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="lead-lp-card">
                  <div className="lead-lp-card-hdr">
                    <h3 className="lead-lp-card-title"><Icon name="edit" size={15} /><span>Team Notes</span></h3>
                    <Button variant="ghost" size="sm" onClick={() => setProfileTab('notes')}><Icon name="edit" size={13} /><span>Edit</span></Button>
                  </div>
                  <div className="lead-lp-card-body">
                    {sel.notes
                      ? <p className="lead-lp-notes-body">{sel.notes}</p>
                      : <p className="lead-lp-notes-body" style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>No notes yet — add context for your team.</p>
                    }
                  </div>
                </div>
              </div>
              <aside className="lead-lp-side-col">
                <div className="lead-lp-card">
                  <div className="lead-lp-card-hdr">
                    <h3 className="lead-lp-card-title"><Icon name="zap" size={15} /><span>Next Steps</span></h3>
                  </div>
                  <div className="lead-lp-card-body">
                    <div className="lead-lp-next-steps">
                      <Button size="sm" onClick={convertToDeal} style={{ width: '100%', justifyContent: 'flex-start' }}><Icon name="briefcase" size={14} /><span>Convert to Deal</span></Button>
                      <Button variant="outline" size="sm" onClick={() => setProfileTab('tasks')} style={{ width: '100%', justifyContent: 'flex-start' }}><Icon name="checkCircle" size={14} /><span>View Tasks</span></Button>
                      <Button variant="outline" size="sm" onClick={() => setProfileTab('activity')} style={{ width: '100%', justifyContent: 'flex-start' }}><Icon name="activity" size={14} /><span>Log Activity</span></Button>
                      {!isTerminal(sel.stage) && <Button variant="outline" size="sm" onClick={() => updateStage(wonStageId)} style={{ width: '100%', justifyContent: 'flex-start' }}><Icon name="check" size={14} /><span>Mark Won</span></Button>}
                    </div>
                  </div>
                </div>
                <CustomFieldsPanel entityType="lead" subjectId={sel.id} />
              </aside>
            </div>
          )}

          {/* CONTACT */}
          {profileTab === 'contact' && (
            <div className="lead-lp-card">
              {!editMode ? (
                <>
                  <div className="lead-lp-card-hdr">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <LeadAv name={sel.contact_name} size={40} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{sel.contact_name || 'No contact'}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{sel.company}</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(true)}><Icon name="edit" size={13} /><span>Edit</span></Button>
                  </div>
                  <div className="lead-lp-card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                      {[
                        { label: 'Email', value: sel.contact_email },
                        { label: 'Phone / WhatsApp', value: sel.contact_phone },
                        { label: 'Industry', value: sel.industry },
                        { label: 'Location', value: sel.location },
                        { label: 'Website', value: sel.website },
                        { label: 'Lead Source', value: sel.source },
                        { label: 'Territory', value: sel.territory_name },
                        { label: 'Assigned To', value: sel.assigned_to_name || sel.assigned_to },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 13.5, color: value ? 'var(--ink)' : 'var(--ink3)', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <form onSubmit={handleProfileSave}>
                  <div className="lead-lp-card-hdr">
                    <h3 className="lead-lp-card-title"><Icon name="edit" size={14} /><span>Edit Lead Details</span></h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="outline" size="sm" type="button" onClick={() => { setProfileForm({ ...sel }); setEditMode(false); }}>Discard</Button>
                      <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                    </div>
                  </div>
                  <div className="lead-lp-card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 20px' }}>
                      {([
                        { label: 'Company Name *', key: 'company',       req: true  },
                        { label: 'Contact Person', key: 'contact_name',  req: false },
                        { label: 'Email',          key: 'contact_email', req: false },
                        { label: 'Phone',          key: 'contact_phone', req: false },
                        { label: 'Industry',       key: 'industry',      req: false },
                        { label: 'Location',       key: 'location',      req: false },
                        { label: 'Website',        key: 'website',       req: false },
                      ] as { label: string; key: keyof Lead; req: boolean }[]).map(({ label, key, req }) => (
                        <div key={key}>
                          <Label htmlFor={`lead-${key}`} className="mb-2 block">{label}</Label>
                          <Input id={`lead-${key}`} type={key === 'contact_email' ? 'email' : 'text'} required={req}
                            value={String(profileForm[key] ?? '')}
                            onChange={e => setProfileForm(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Assigned To</label>
                        <Combobox
                          options={staff}
                          value={profileForm.assigned_to_id || ''}
                          onChange={v => setProfileForm(p => ({ ...p, assigned_to_id: v, assigned_to_name: staff.find(s => s.value === v)?.label }))}
                          placeholder={staff.length ? 'Unassigned' : 'Loading people…'}
                          searchPlaceholder="Search people…"
                        />
                      </div>
                      <div><Label htmlFor="lead-value" className="mb-2 block">Value (TZS)</Label><Input id="lead-value" type="number" min={0} value={profileForm.value ?? 0} onChange={e => setProfileForm(p => ({ ...p, value: Number(e.target.value) }))} /></div>
                      <div><Label htmlFor="lead-source" className="mb-2 block">Source</Label><Select value={profileForm.source || 'Web Form'} onValueChange={source => setProfileForm(p => ({ ...p, source }))}><SelectTrigger id="lead-source"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...SOURCES, profileForm.source].filter(Boolean))].map(source => <SelectItem key={source} value={source!}>{source}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label htmlFor="lead-priority" className="mb-2 block">Priority</Label><Select value={profileForm.priority || 'MEDIUM'} onValueChange={priority => setProfileForm(p => ({ ...p, priority: priority as Lead['priority'] }))}><SelectTrigger id="lead-priority"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY_CFG).map(([value, cfg]) => <SelectItem key={value} value={value}>{cfg.label}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label htmlFor="lead-stage" className="mb-2 block">Stage</Label><Select value={profileForm.stage || 'NEW'} onValueChange={stage => setProfileForm(p => ({ ...p, stage }))}><SelectTrigger id="lead-stage"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...stageIds, profileForm.stage].filter(Boolean))].map(stage => <SelectItem key={stage} value={stage!}>{liveStageCfg[stage!]?.label || stage}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label className="mb-2 block">Close date</Label><DatePicker key={profileForm.expected_close || 'empty'} date={parseDateOnly(profileForm.expected_close || '')} onChange={date => setProfileForm(p => ({ ...p, expected_close: date ? toDateOnlyString(date) : '' }))} /></div>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TASKS */}
          {profileTab === 'tasks' && (
            <div className="lead-lp-card">
              <div className="lead-lp-card-hdr">
                <h3 className="lead-lp-card-title">
                  <Icon name="checkCircle" size={15} /><span>Tasks</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink3)' }}>({leadTasks.filter(t => !t.done).length} open)</span>
                </h3>
              </div>
              {leadTasks.length === 0 ? (
                <div style={{ padding: '28px var(--page-pad-x, 16px)', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  <Icon name="checkCircle" size={24} strokeWidth={1.25} /><div style={{ marginTop: 8 }}>No tasks yet</div>
                </div>
              ) : (
                <div>
                  {leadTasks.map(t => (
                    <div key={t.id} className="lead-lp-task-row">
                      <Checkbox checked={t.done} className="mt-0.5"
                        onCheckedChange={async () => {
                          const updated = { ...t, done: !t.done };
                          setLeadTasks(prev => prev.map(x => x.id === t.id ? updated : x));
                          await apiFetch(`/v1/crm/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }).catch(() => {});
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: t.done ? 'var(--ink3)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                        {t.due_at && (
                          <div style={{ fontSize: 11.5, marginTop: 2, color: new Date(t.due_at) < new Date() && !t.done ? 'var(--red)' : 'var(--ink3)' }}>
                            {new Date(t.due_at) < new Date() && !t.done ? '⚠ Overdue · ' : ''}Due {new Date(t.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="xs" type="button"
                        onClick={async () => {
                          setLeadTasks(prev => prev.filter(x => x.id !== t.id));
                          await apiFetch(`/v1/crm/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
                        }}>
                        <Icon name="x" size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="lead-lp-task-add">
                <Input placeholder="Add a task…" value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  style={{ flex: 1, minWidth: 150 }}
                  onKeyDown={e => { if (e.key === 'Enter' && newTaskTitle.trim()) document.getElementById('lead-task-add-btn')?.click(); }}
                />
                <DatePicker key={newTaskDue || 'empty'} date={parseDateOnly(newTaskDue)} onChange={date => setNewTaskDue(date ? toDateOnlyString(date) : '')} placeholder="Due date" />
                <Button id="lead-task-add-btn" type="button" size="sm" disabled={!newTaskTitle.trim() || addingTask}
                  onClick={async () => {
                    if (!newTaskTitle.trim()) return;
                    setAddingTask(true);
                    try {
                      const t = await apiFetch('/v1/crm/tasks', { method: 'POST', body: JSON.stringify({ subject_type: 'lead', subject_id: sel.id, title: newTaskTitle.trim(), due_at: newTaskDue || null }) });
                      setLeadTasks(prev => [...prev, t]);
                      setNewTaskTitle(''); setNewTaskDue('');
                    } catch (err: any) { showAlert(err.message || 'Failed to add task'); }
                    finally { setAddingTask(false); }
                  }}>
                  {addingTask ? '…' : 'Add'}
                </Button>
              </div>
            </div>
          )}

          {/* ACTIVITY */}
          {profileTab === 'activity' && (
            <div className="lead-lp-card">
              <div className="lead-lp-card-hdr">
                <h3 className="lead-lp-card-title"><Icon name="activity" size={15} /><span>Activity &amp; Interaction Timeline</span></h3>
              </div>
              <div className="lead-lp-card-body">
                <ActivityTimeline subjectType="lead" subjectId={sel.id} />
              </div>
            </div>
          )}

          {/* NOTES */}
          {profileTab === 'notes' && (
            <div className="lead-lp-card">
              <div className="lead-lp-card-hdr">
                <h3 className="lead-lp-card-title"><Icon name="edit" size={15} /><span>Team Notes</span></h3>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Only visible to your team</span>
              </div>
              <div className="lead-lp-card-body">
                <Textarea style={{ height: 200, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.7 }}
                  placeholder={`Notes about ${sel.company} — follow-ups, preferences, concerns…`}
                  value={notes} onChange={e => setNotes(e.target.value)} />
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{notes.length} characters</span>
                  <Button type="button" size="sm" onClick={handleSaveNote} disabled={noteSaving}>{noteSaving ? 'Saving…' : 'Save Notes'}</Button>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENTS */}
          {profileTab === 'documents' && (
            <div className="lead-lp-card">
              <div className="lead-lp-card-hdr">
                <h3 className="lead-lp-card-title"><Icon name="folder" size={15} /><span>Documents Vault</span></h3>
                <Button size="sm" disabled={fileUploading} onClick={() => profileFileInput.current?.click()}>
                  <Icon name="upload" size={13} />
                  {fileUploading ? 'Uploading…' : 'Upload File'}
                </Button>
                <input ref={profileFileInput} type="file" multiple disabled={fileUploading} hidden
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) await uploadFilesToDrive(files);
                    e.target.value = '';
                  }} />
              </div>
              {filesLoading ? (
                <div className="lead-lp-card-body"><SectionLoading /></div>
              ) : linkedFiles.length > 0 ? (
                <div>
                  {linkedFiles.map((f: any) => (
                    <div key={f.id} className="lead-lp-file-row">
                      <div className="lead-lp-file-icon"><Icon name="file" size={16} color="var(--ink3)" strokeWidth={1.75} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                          {f.size != null ? `${(f.size / 1024).toFixed(1)} KB · ` : ''}{new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" type="button" onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) => showAlert(err.message || 'Download failed'))}>
                        <Icon name="download" size={13} /> Download
                      </Button>
                      <Tip label="Remove from this lead (file stays in Drive)">
                        <Button variant="outline" size="sm" type="button" onClick={() => unlinkFile(f.id, f.name)} aria-label={`Remove ${f.name} from this lead`}>
                          <Icon name="x" size={13} />
                        </Button>
                      </Tip>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lead-lp-card-body">
                  <div className="lead-lp-empty-drop">
                    <Icon name="upload" size={28} strokeWidth={1.25} />
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 10 }}>No documents yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Proposals, contracts, any documents for this lead</div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
        </LeadStagesContext.Provider>
        {/* Add/Edit modal (reused from list) */}
        {showAdd && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div className="card" style={{ width: '90%', maxWidth: 580, padding: 28, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)', maxHeight: '92vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{editingId ? 'Edit Lead' : 'Add New Lead'}</h2>
                <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }} data-ui-native-button="">×</button>
              </div>
              <form onSubmit={handleAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 16px' }}>
                  {!editingId && <LeadPartyLinks linkedOrg={linkedOrg} setLinkedOrg={setLinkedOrg} linkedPerson={linkedPerson} setLinkedPerson={setLinkedPerson} setForm={setAddForm} />}
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Company Name *</label>
                    <input type="text" className="input-field" placeholder="Acme Imports Ltd" required value={addForm.company} onChange={e => setF('company', e.target.value)} />
                  </div>
                  {([
                    { label: 'Contact Person *', key: 'contact_name',  req: true,  ph: 'John Doe'            },
                    { label: 'Phone / WhatsApp', key: 'contact_phone', req: false, ph: '+255 712 345 678'    },
                    { label: 'Email Address',    key: 'contact_email', req: false, ph: 'john@company.com'    },
                    { label: 'Industry',         key: 'industry',      req: false, ph: 'Trading, Logistics…' },
                    { label: 'Location / City',  key: 'location',      req: false, ph: 'Dar es Salaam'       },
                    { label: 'Website',          key: 'website',       req: false, ph: 'company.co.tz'       },
                    { label: 'Est. Value (TZS)', key: 'value',         req: false, ph: '5000000'             },
                  ] as const).map(({ label, key, req, ph }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>{label}</label>
                      <input type="text" className="input-field" placeholder={ph} required={req}
                        value={String(addForm[key as keyof FormState] || '')}
                        onChange={e => setF(key as keyof FormState, e.target.value)} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Expected Close</label>
                    <DatePicker date={parseDateOnly(addForm.expected_close)} onChange={d => setF('expected_close', toDateOnlyString(d))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Lead Source</label>
                    <Select value={addForm.source} onValueChange={v => setF('source', v)}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Stage</label>
                    <Select value={addForm.stage} onValueChange={v => setF('stage', v)}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stageIds.filter(s => !isTerminal(s)).map(s => <SelectItem key={s} value={s}>{liveStageCfg[s]?.label || s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Priority</label>
                    <Select value={addForm.priority} onValueChange={v => setF('priority', v)}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Assign To</label>
                    <Combobox
                      options={staff}
                      value={addForm.assigned_to_id || ''}
                      onChange={v => { setF('assigned_to_id', v); setF('assigned_to_name', staff.find(s => s.value === v)?.label || ''); }}
                      placeholder={staff.length ? 'Unassigned' : 'Loading people…'}
                      searchPlaceholder="Search people…"
                    />
                  </div>
                  {territories.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Territory</label>
                      <Select value={addForm.territory_id || '__none__'} onValueChange={v => setF('territory_id', v === '__none__' ? '' : v)}>
                        <SelectTrigger className="input-field"><SelectValue placeholder="No territory" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No territory —</SelectItem>
                          {territories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Notes</label>
                    <textarea className="input-field" placeholder="Brief description of the opportunity…" rows={3}
                      value={addForm.notes || ''} onChange={e => setF('notes', e.target.value)} style={{ resize: 'vertical', minHeight: 70 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary btn-md" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }} data-ui-native-button="">Cancel</button>
                  <button type="submit" className="btn btn-primary btn-md" disabled={addSaving} data-ui-native-button="">{addSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Lead'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════
     LIST VIEW
  ══════════════════════ */
  return (
    <LeadStagesContext.Provider value={stagesCtx}>
    <div style={{ flex: 1, overflowY: 'auto', background: 'transparent', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['CRM', 'Leads']}
        titlePlain="Lead"
        titleEm="pipeline"
        subtitle={`${leads.length} leads · ${active.length} active · ${fmtValue(pipeline)} pipeline value · ${winRate}% win rate`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => exportLeadsCSV(filtered)}>
              <Icon name="download" size={14} strokeWidth={2} /> Export CSV
            </Button>
            <Button type="button" size="sm" onClick={() => { setAddForm({ ...EMPTY_FORM }); setEditingId(null); setShowAdd(true); }}>
              <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" /> New Lead
            </Button>
          </div>
        }
      />

      {/* No horizontal padding here — Customers.tsx (this app's reference
          toolbar/margin implementation) puts its own table card flush
          against PageHeader's own zero horizontal padding, sharing
          .page-layout's single page gutter. This div used to add an extra
          28px on both sides on top of that, indenting the table card
          relative to the title/breadcrumb above it. */}
      <div style={{ padding: '0 0 28px' }}>
        {/* ── Table card ── */}
        <SectionCard collapsible={false} padded={false}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <SingleSelectFilter
              label="Stage" allLabel="All Stages"
              options={stageIds.map(s => ({ value: s, label: liveStageCfg[s]?.label || s }))}
              value={filterStage || null} onChange={v => { setFilterStage(v || ''); setPage(1); }}
            />
            <SingleSelectFilter
              label="Source" allLabel="All Sources"
              options={SOURCES.map(s => ({ value: s, label: s }))}
              value={filterSource || null} onChange={v => { setFilterSource(v || ''); setPage(1); }}
            />
            <SingleSelectFilter
              label="Priority" allLabel="All Priorities"
              options={[{ value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]}
              value={filterPriority || null} onChange={v => { setFilterPriority(v || ''); setPage(1); }}
            />
            {territories.length > 0 && (
              <SingleSelectFilter
                label="Territory" allLabel="All Territories"
                options={territories.map(t => ({ value: t.id, label: t.name }))}
                value={filterTerritory || null} onChange={v => { setFilterTerritory(v || ''); setPage(1); }}
              />
            )}
            {savedViews.length > 0 && (
              <Select value={activeViewId || '__none__'} onValueChange={v => { setActiveViewId(v === '__none__' ? null : v); setPage(1); }}>
                <SelectTrigger style={{ minWidth: 140, height: 'var(--ctl-h-sm)', fontSize: 12.5 }}>
                  <SelectValue placeholder="Saved view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All leads</SelectItem>
                  {savedViews.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name} ({v.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(search || filterStage || filterSource || filterPriority || filterTerritory || activeViewId) && (
              <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterSource(''); setFilterPriority(''); setFilterTerritory(''); setActiveViewId(null); setViewMatchIds(null); setPage(1); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontFamily: 'var(--font)', padding: '0 2px' }} data-ui-native-button="">
                Clear
              </button>
            )}

            <div style={{ flex: 1 }} />

            <span style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{filtered.length} leads</span>
            <div style={{ position: 'relative', minWidth: 180, maxWidth: 280 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' } as React.CSSProperties} />
              <input type="text" placeholder="Search leads…" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Bulk-action bar — only when rows are selected */}
          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--teal-l)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{selectedIds.length} selected</span>
              <Select value={bulkAction || '__none__'} onValueChange={v => setBulkAction(v === '__none__' ? '' : v)}>
                <SelectTrigger style={{ width: 180, height: 'var(--ctl-h-sm)' }}>
                  <SelectValue placeholder="Choose action…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose action…</SelectItem>
                  {stageIds.map(s => <SelectItem key={s} value={s}>Move to {liveStageCfg[s]?.label || s}</SelectItem>)}
                  <SelectItem value="export">Export CSV</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!bulkAction || bulkApplying} onClick={handleBulkApply}>
                {bulkApplying ? 'Applying…' : 'Apply'}
              </Button>
              <button type="button" onClick={() => { setSelectedIds([]); setBulkAction(''); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink3)', fontFamily: 'var(--font)' }} data-ui-native-button="">
                Clear selection
              </button>
            </div>
          )}

          {/* Stage chips */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexWrap: 'wrap' }}>
            <button type="button" className={`fc${!filterStage ? ' on' : ''}`} onClick={() => { setFilterStage(''); setPage(1); }} data-ui-native-button="">
              All ({leads.length})
            </button>
            {stageIds.map(s => (
              <button key={s} type="button" className={`fc${filterStage === s ? ' on' : ''}`} onClick={() => { setFilterStage(filterStage === s ? '' : s); setPage(1); }} data-ui-native-button="">
                {liveStageCfg[s]?.label || s} ({leads.filter(l => l.stage === s).length})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rtbl-wrap">
            <table className="rtbl">
              <thead>
                <tr>
                  <Th width={44}>
                    <Checkbox aria-label="Select all" checked={allChecked} onCheckedChange={toggleAll} />
                  </Th>
                  <Th>Lead</Th>
                  <Th>Source</Th>
                  <Th>Stage</Th>
                  <Th align="right">Value</Th>
                  <Th>Priority</Th>
                  <Th>Assigned To</Th>
                  <Th>Expected Close</Th>
                  <Th>Created</Th>
                  <Th width={50} />
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading leads…</td></tr>}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: '56px', textAlign: 'center', color: 'var(--ink3)' }}>
                      <Icon name="target" size={28} strokeWidth={1.3} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.35 } as React.CSSProperties} />
                      <div style={{ fontSize: 14, fontWeight: 600 }}>No leads found</div>
                      <div style={{ fontSize: 12.5, marginTop: 4 }}>Try adjusting your filters</div>
                    </td>
                  </tr>
                )}
                {!loading && rows.map(lead => (
                  <tr key={lead.id}
                    onClick={() => openProfile(lead)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <Checkbox aria-label={`Select ${lead.company}`} checked={selectedIds.includes(lead.id)}
                        onCheckedChange={() => setSelectedIds(p => p.includes(lead.id) ? p.filter(x => x !== lead.id) : [...p, lead.id])} />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LeadAv name={lead.company} size={34} leadId={lead.id} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{lead.company}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{lead.contact_name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}><SourceBadge source={lead.source} /></td>
                    <td style={{ padding: '12px 14px' }}><StageBadge stage={lead.stage} /></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtValue(lead.value)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <PriBadge priority={lead.priority} />
                        <ScoreBadge score={lead.score} />
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {lead.assigned_to_id || lead.assigned_to ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          {lead.assigned_to_id
                            ? <PersonAvatar userId={lead.assigned_to_id} name={lead.assigned_to_name || ''} size={22} />
                            : <LeadAv name={lead.assigned_to!} size={22} />}
                          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{lead.assigned_to_name || lead.assigned_to}</span>
                        </div>
                      ) : <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'var(--font)' }}>{lead.expected_close ? fmtShort(lead.expected_close) : '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>{fmtDate(lead.created_at)}</td>
                    <td style={{ padding: '12px 8px' }} onClick={e => e.stopPropagation()}>
                      <ActMenu
                        onView={() => openProfile(lead)}
                        onEdit={() => openEdit(lead)}
                        onDelete={() => handleDelete(lead.id, lead.company)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                Showing {(pg - 1) * PAGE_SIZE + 1}–{Math.min(pg * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button type="button" aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pg === 1}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 8px', background: 'var(--white)', cursor: pg === 1 ? 'default' : 'pointer', color: 'var(--ink3)', opacity: pg === 1 ? 0.4 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                  <Icon name="chevronLeft" size={14} />
                </button>
                {getPageNums(pg, totalPages).map((p, i) =>
                  p === '…' ? <span key={i} style={{ padding: '0 6px', color: 'var(--ink3)', fontSize: 13 }}>…</span> :
                  <button key={p} type="button" onClick={() => setPage(Number(p))}
                    style={{ border: `1px solid ${pg === p ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', background: pg === p ? 'hsl(var(--primary))' : 'var(--white)', cursor: 'pointer', fontSize: 13, color: pg === p ? 'hsl(var(--primary-foreground))' : 'var(--ink)', minWidth: 32, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                    {p}
                  </button>
                )}
                <button type="button" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pg === totalPages}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 8px', background: 'var(--white)', cursor: pg === totalPages ? 'default' : 'pointer', color: 'var(--ink3)', opacity: pg === totalPages ? 0.4 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="card" style={{ width: '90%', maxWidth: 580, padding: 28, borderRadius: 'var(--r)', boxShadow: 'var(--elev-lg)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{editingId ? 'Edit Lead' : 'Add New Lead'}</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Fill in the prospect details below</p>
              </div>
              <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }} data-ui-native-button="">×</button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 16px' }}>
                {!editingId && <LeadPartyLinks linkedOrg={linkedOrg} setLinkedOrg={setLinkedOrg} linkedPerson={linkedPerson} setLinkedPerson={setLinkedPerson} setForm={setAddForm} />}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Company Name *</label>
                  <input type="text" className="input-field" placeholder="Acme Imports Ltd" required value={addForm.company} onChange={e => setF('company', e.target.value)} />
                </div>
                {([
                  { label: 'Contact Person *', key: 'contact_name',  req: true,  ph: 'John Doe'            },
                  { label: 'Phone / WhatsApp', key: 'contact_phone', req: false, ph: '+255 712 345 678'    },
                  { label: 'Email Address',    key: 'contact_email', req: false, ph: 'john@company.com'    },
                  { label: 'Industry',         key: 'industry',      req: false, ph: 'Trading, Logistics…' },
                  { label: 'Location / City',  key: 'location',      req: false, ph: 'Dar es Salaam'       },
                  { label: 'Website',          key: 'website',       req: false, ph: 'company.co.tz'       },
                  { label: 'Est. Value (TZS)', key: 'value',         req: false, ph: '5000000'             },
                ] as const).map(({ label, key, req, ph }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>{label}</label>
                    <input type="text" className="input-field" placeholder={ph} required={req}
                      value={String(addForm[key as keyof FormState] || '')}
                      onChange={e => setF(key as keyof FormState, e.target.value)} />
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Expected Close</label>
                  <DatePicker date={parseDateOnly(addForm.expected_close)} onChange={d => setF('expected_close', toDateOnlyString(d))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Lead Source</label>
                  <Select value={addForm.source} onValueChange={v => setF('source', v)}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Stage</label>
                  <Select value={addForm.stage} onValueChange={v => setF('stage', v)}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.filter(s => s !== 'WON' && s !== 'LOST').map(s => <SelectItem key={s} value={s}>{STAGE_CFG[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Priority</label>
                  <Select value={addForm.priority} onValueChange={v => setF('priority', v)}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Assign To</label>
                  <Combobox
                    options={staff}
                    value={addForm.assigned_to_id || ''}
                    onChange={v => { setF('assigned_to_id', v); setF('assigned_to_name', staff.find(s => s.value === v)?.label || ''); }}
                    placeholder={staff.length ? 'Unassigned' : 'Loading people…'}
                    searchPlaceholder="Search people…"
                  />
                </div>
                {territories.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Territory</label>
                    <Select value={addForm.territory_id || '__none__'} onValueChange={v => setF('territory_id', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="input-field"><SelectValue placeholder="No territory" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— No territory —</SelectItem>
                        {territories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Notes</label>
                  <textarea className="input-field" placeholder="Brief description of the opportunity…" rows={3}
                    value={addForm.notes || ''} onChange={e => setF('notes', e.target.value)} style={{ resize: 'vertical', minHeight: 70 }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary btn-md" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }} data-ui-native-button="">Cancel</button>
                <button type="submit" className="btn btn-primary btn-md" disabled={addSaving} data-ui-native-button="">{addSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </LeadStagesContext.Provider>
  );
};
