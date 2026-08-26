import React, { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

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
  expected_close?: string;
  created_at: string;
  notes?: string;
  industry?: string;
  location?: string;
  website?: string;
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

const OFFICERS = ['Amina Hassan', 'John Mwangi', 'Fatuma Ally', 'Peter Kimani', 'Grace Osei'];
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
  const c = STAGE_CFG[stage] || STAGE_CFG.NEW;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap', fontFamily: 'var(--mono)', letterSpacing: '0.03em' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const c = SOURCE_CFG[source] || { color: 'var(--ink3)', bg: 'var(--bg)' };
  return <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{source}</span>;
}

function PriBadge({ priority }: { priority: string }) {
  const c = PRIORITY_CFG[priority] || PRIORITY_CFG.LOW;
  return <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', color: 'var(--ink3)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
const EMPTY_FORM: FormState = {
  company: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'Web Form', stage: 'NEW', value: 0, priority: 'MEDIUM',
  assigned_to: '', expected_close: '', notes: '', industry: '', location: '', website: '',
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
  const activeStages = STAGES.filter(s => s !== 'LOST');
  const active = activeStages.indexOf(current);
  const isLost = current === 'LOST';

  if (isLost) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, background: STAGE_CFG.LOST.bg, color: STAGE_CFG.LOST.color, border: `1.5px solid ${STAGE_CFG.LOST.color}` }}>
        <Icon name="x" size={12} strokeWidth={3} />
        Lost
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
      {activeStages.map((s, i) => {
        const cfg = STAGE_CFG[s];
        const done = i < active;
        const cur = i === active;
        const clickable = interactive && !cur;
        return (
          <React.Fragment key={s}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(s)}
              title={clickable ? `Move to ${cfg.label}` : cfg.label}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 20,
                fontSize: 12.5, fontWeight: cur ? 700 : 600,
                fontFamily: 'var(--font)',
                background: cur ? cfg.bg : done ? 'var(--teal-l)' : 'var(--white)',
                color: cur ? cfg.color : done ? 'var(--teal)' : 'var(--ink3)',
                border: cur ? `1.5px solid ${cfg.color}` : done ? '1px solid transparent' : '1px solid var(--border)',
                cursor: clickable ? 'pointer' : 'default',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!clickable) return;
                e.currentTarget.style.background = cfg.bg;
                e.currentTarget.style.color = cfg.color;
                e.currentTarget.style.borderColor = cfg.color;
              }}
              onMouseLeave={e => {
                if (!clickable) return;
                e.currentTarget.style.background = done ? 'var(--teal-l)' : 'var(--white)';
                e.currentTarget.style.color = done ? 'var(--teal)' : 'var(--ink3)';
                e.currentTarget.style.borderColor = done ? 'transparent' : 'var(--border)';
              }}
            >
              {done && <Icon name="check" size={12} strokeWidth={3} />}
              {cfg.label}
            </button>
            {i < activeStages.length - 1 && (
              <div style={{ width: 18, height: 2, borderRadius: 1, background: i < active ? 'var(--teal)' : 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
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

  /* List filters */
  const [search,         setSearch]         = useState('');
  const [filterStage,    setFilterStage]    = useState('');
  const [filterSource,   setFilterSource]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [selectedIds,    setSelectedIds]    = useState<string[]>([]);
  const [page,           setPage]           = useState(1);

  /* Add/Edit modal */
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<FormState>({ ...EMPTY_FORM });
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
    if (selected) setNotes(selected.notes || '');
  }, [selected]);

  /* Filtering */
  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    if (q && !l.company.toLowerCase().includes(q) && !l.contact_name.toLowerCase().includes(q) && !(l.contact_email || '').toLowerCase().includes(q)) return false;
    if (filterStage    && l.stage    !== filterStage)    return false;
    if (filterSource   && l.source   !== filterSource)   return false;
    if (filterPriority && l.priority !== filterPriority) return false;
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
  const active   = leads.filter(l => !['WON', 'LOST'].includes(l.stage));
  const wonL     = leads.filter(l => l.stage === 'WON');
  const lostL    = leads.filter(l => l.stage === 'LOST');
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
        await apiFetch(`/v1/leads/${editingId}`, { method: 'PATCH', body: JSON.stringify({ ...addForm, value: Number(addForm.value) || 0 }) });
        setLeads(p => p.map(l => l.id === editingId ? { ...l, ...addForm, value: Number(addForm.value) || 0 } : l));
        if (selected?.id === editingId) setSelected(prev => prev ? { ...prev, ...addForm, value: Number(addForm.value) || 0 } : prev);
      } else {
        const res = await apiFetch('/v1/leads', { method: 'POST', body: JSON.stringify({ ...addForm, value: Number(addForm.value) || 0 }) });
        const newLead: Lead = res?.id ? res : { ...addForm, id: res?.id ?? Date.now().toString(), value: Number(addForm.value) || 0, created_at: new Date().toISOString().split('T')[0] };
        setLeads(p => [newLead, ...p]);
      }
      setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save lead');
    } finally { setAddSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await showConfirm(`Delete "${name}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/leads/${id}`, { method: 'DELETE' });
      setLeads(p => p.filter(l => l.id !== id));
      if (selected?.id === id) { setSelected(null); setView('list'); }
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
  }

  function openEdit(lead: Lead) {
    setEditingId(lead.id);
    setAddForm({ company: lead.company, contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '', source: lead.source, stage: lead.stage, value: lead.value, priority: lead.priority, assigned_to: lead.assigned_to || '', expected_close: lead.expected_close || '', notes: lead.notes || '', industry: lead.industry || '', location: lead.location || '', website: lead.website || '' });
    setShowAdd(true);
  }

  function setF(k: keyof FormState, v: string | number) { setAddForm(p => ({ ...p, [k]: v })); }

  const btnS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--white)', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' };

  /* ══════════════════════
     PROFILE VIEW
  ══════════════════════ */
  if (view === 'profile' && selected) {
    const sel = selected;
    const stageCfg = STAGE_CFG[sel.stage] || STAGE_CFG.NEW;
    const priCfg   = PRIORITY_CFG[sel.priority] || PRIORITY_CFG.LOW;
    const days     = daysInPipeline(sel.created_at);

    const PROF_TABS = [
      { key: 'overview',  label: 'Overview',  icon: 'grid'      as IconName },
      { key: 'contact',   label: 'Contact',   icon: 'user'      as IconName },
      { key: 'notes',     label: 'Notes',     icon: 'edit'      as IconName },
      { key: 'documents', label: 'Documents', icon: 'folder'    as IconName },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

        {/* ── Hero ── */}
        <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ padding: '20px 28px 0' }}>

            <button type="button" onClick={() => setView('list')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 600, marginBottom: 16, padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink3)')}>
              <Icon name="chevronDown" size={13} style={{ transform: 'rotate(90deg)' }} /> Back to Leads
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              <AvatarPicker id={sel.id} kind="leads" name={sel.company} size={72} shape="square" />

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: 0, letterSpacing: '-0.3px' }}>{sel.company}</h1>
                  <StageBadge stage={sel.stage} />
                  <PriBadge priority={sel.priority} />
                  {sel.industry && <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--bg)', color: 'var(--ink2)', border: '1px solid var(--border)' }}>{sel.industry}</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 16 }}>
                  {sel.contact_name}
                  {sel.location && ` · ${sel.location}`}
                  {` · Added ${fmtDate(sel.created_at)}`}
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 28, paddingBottom: 20, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Pipeline Value', value: fmtValue(sel.value) },
                    { label: 'Days in Pipeline', value: `${days}d` },
                    { label: 'Source', value: sel.source },
                    { label: 'Assigned To', value: sel.assigned_to || '—' },
                    { label: 'Expected Close', value: sel.expected_close ? fmtShort(sel.expected_close) : '—' },
                  ].map((s, i, arr) => (
                    <React.Fragment key={s.label}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.1 }}>{s.value}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{s.label}</div>
                      </div>
                      {i < arr.length - 1 && <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" style={btnS} onClick={() => sel.contact_email && window.open(`mailto:${sel.contact_email}`, '_blank')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                  <Icon name="mail" size={13} strokeWidth={1.75} /> Email
                </button>
                <button type="button" style={btnS} onClick={() => { const p = sel.contact_phone?.replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                  <Icon name="send" size={13} strokeWidth={1.75} /> WhatsApp
                </button>
                <button type="button" style={{ ...btnS, background: 'hsl(var(--primary))', border: 'none', color: 'hsl(var(--primary-foreground))' }}
                  onClick={() => openEdit(sel)}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  <Icon name="edit" size={13} strokeWidth={1.75} /> Edit Lead
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '0 28px', overflowX: 'auto' }}>
            {PROF_TABS.map(tab => {
              const isActive = profileTab === tab.key;
              return (
                <button key={tab.key} type="button" onClick={() => { setProfileTab(tab.key); setEditMode(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py-lg) 16px', border: 'none', borderBottom: isActive ? '2px solid var(--teal)' : '2px solid transparent', background: 'none', color: isActive ? 'var(--teal)' : 'var(--ink3)', fontSize: 13, fontWeight: isActive ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', marginBottom: -1, minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--ink)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--ink3)'; }}>
                  <Icon name={tab.icon} size={13} color={isActive ? 'var(--teal)' : 'var(--ink3)'} strokeWidth={1.75} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>

          {/* Overview */}
          {profileTab === 'overview' && (
            <div style={{ padding: '24px 28px' }}>
              {/* Stage pipeline */}
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)' }}>Pipeline Stage</div>
                  {!['WON', 'LOST'].includes(sel.stage) && (
                    <button type="button"
                      onClick={() => updateStage('LOST')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--ink3)', transition: 'color 0.12s, border-color 0.12s, background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.background = 'var(--red-l)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink3)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <Icon name="x" size={12} strokeWidth={2.5} />
                      Mark as Lost
                    </button>
                  )}
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                  <StagePipeline current={sel.stage} onSelect={updateStage} interactive={!['WON', 'LOST'].includes(sel.stage)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 20 }}>
                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, alignContent: 'start' }}>
                  {[
                    { label: 'Pipeline Value',   value: fmtValue(sel.value),   icon: 'dollarSign' as IconName, color: '#2563eb', bg: 'var(--blue-l)' },
                    { label: 'Days in Pipeline', value: `${days} days`,         icon: 'timer'      as IconName, color: 'var(--gold)', bg: 'var(--gold-l)' },
                    { label: 'Priority',         value: priCfg.label,           icon: 'alertCircle'as IconName, color: priCfg.color, bg: priCfg.bg },
                    { label: 'Lead Source',      value: sel.source,             icon: 'target'     as IconName, color: '#0d9488', bg: '#ccfbf1' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 9, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={kpi.icon} size={18} color={kpi.color} strokeWidth={1.75} />
                      </div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.2 }}>{kpi.value}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>{kpi.label}</div>
                      </div>
                    </div>
                  ))}

                  {/* Notes preview */}
                  {sel.notes && (
                    <div style={{ gridColumn: '1 / -1', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink3)', marginBottom: 8 }}>Notes</div>
                      <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.65, margin: 0 }}>{sel.notes}</p>
                    </div>
                  )}
                </div>

                {/* Right sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Key info */}
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 14 }}>Key Information</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { label: 'Contact Person', value: sel.contact_name },
                        { label: 'Email', value: sel.contact_email },
                        { label: 'Phone', value: sel.contact_phone },
                        { label: 'Industry', value: sel.industry },
                        { label: 'Location', value: sel.location },
                        { label: 'Website', value: sel.website },
                        { label: 'Assigned To', value: sel.assigned_to },
                        { label: 'Expected Close', value: sel.expected_close ? fmtDate(sel.expected_close) : undefined },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                          <span style={{ fontSize: 12, color: 'var(--ink3)', flexShrink: 0 }}>{label}</span>
                          <span style={{ fontSize: 12.5, color: value ? 'var(--ink)' : 'var(--ink3)', textAlign: 'right', fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink3)', marginBottom: 12 }}>Quick Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        { label: 'Send Email',         icon: 'mail'       as IconName, action: () => sel.contact_email && window.open(`mailto:${sel.contact_email}`) },
                        { label: 'Send WhatsApp',      icon: 'send'       as IconName, action: () => { const p = sel.contact_phone?.replace(/\D/g,''); if(p) window.open(`https://wa.me/${p}`,'_blank'); } },
                        { label: 'Edit Lead Details',  icon: 'edit'       as IconName, action: () => openEdit(sel) },
                        { label: 'Add Notes',          icon: 'fileText'   as IconName, action: () => setProfileTab('notes') },
                        { label: 'Mark as Won',        icon: 'check'      as IconName, action: () => updateStage('WON') },
                        { label: 'Mark as Lost',       icon: 'x'         as IconName, action: () => updateStage('LOST') },
                      ]).map(action => (
                        <button key={action.label} type="button" onClick={action.action}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--white)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}>
                          <Icon name={action.icon} size={13} color="var(--teal)" strokeWidth={1.75} /> {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact */}
          {profileTab === 'contact' && (
            <div style={{ padding: '24px 28px' }}>
              {!editMode ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                    <button type="button" onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="edit" size={14} strokeWidth={1.75} /> Edit Contact
                    </button>
                  </div>
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                      <LeadAv name={sel.contact_name} size={56} />
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>{sel.contact_name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 3 }}>{sel.company}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px 32px' }}>
                      {[
                        { label: 'Email', value: sel.contact_email },
                        { label: 'Phone / WhatsApp', value: sel.contact_phone },
                        { label: 'Industry', value: sel.industry },
                        { label: 'Location', value: sel.location },
                        { label: 'Website', value: sel.website },
                        { label: 'Lead Source', value: sel.source },
                        { label: 'Assigned To', value: sel.assigned_to },
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
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '20px 24px', marginBottom: 16 }}>
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
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>{label}</label>
                          <input type="text" className="input-field" required={req}
                            value={String(profileForm[key] ?? '')}
                            onChange={e => setProfileForm(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Assigned To</label>
                        <Select value={profileForm.assigned_to || '__none__'} onValueChange={v => setProfileForm(p => ({ ...p, assigned_to: v === '__none__' ? '' : v }))}>
                          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {OFFICERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setProfileForm({ ...sel }); setEditMode(false); }}>Discard</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Notes */}
          {profileTab === 'notes' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Internal Notes</span>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Only visible to your team</span>
              </div>
              <textarea className="prof-input" style={{ height: 220, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.7 }}
                placeholder={`Notes about ${sel.company} — follow-ups, preferences, concerns…`}
                value={notes} onChange={e => setNotes(e.target.value)} />
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{notes.length} characters</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveNote} disabled={noteSaving}>{noteSaving ? 'Saving…' : 'Save Notes'}</button>
              </div>
            </div>
          )}

          {/* Documents — real Drive-linked files (entity_type='lead'), not a
              decorative drop zone. See the upload/loadLinkedFiles/unlinkFile
              comment above: the upload control used to post to a route that
              was never implemented on the backend, so every upload here
              silently 404'd no matter what was picked. */}
          {profileTab === 'documents' && (
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Documents</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: '1.5px solid var(--teal)', borderRadius: 9, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 12.5, fontWeight: 600, cursor: fileUploading ? 'default' : 'pointer', fontFamily: 'var(--font)', opacity: fileUploading ? 0.7 : 1 }}>
                  <Icon name="upload" size={13} strokeWidth={2} />
                  {fileUploading ? 'Uploading…' : 'Upload File'}
                  <input type="file" multiple disabled={fileUploading} style={{ display: 'none' }}
                    onChange={async e => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) await uploadFilesToDrive(files);
                      e.target.value = '';
                    }} />
                </label>
              </div>

              {filesLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
              ) : linkedFiles.length > 0 ? (
                <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {linkedFiles.map((f: any, i: number) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < linkedFiles.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="file" size={16} color="var(--ink3)" strokeWidth={1.75} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                          {f.size != null ? `${(f.size / 1024).toFixed(1)} KB · ` : ''}{new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <button type="button" onClick={() => apiDownload(`/v1/files/${f.id}/download`, f.name).catch((err: any) => showAlert(err.message || 'Download failed'))}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                        <Icon name="download" size={13} /> Download
                      </button>
                      <button type="button" onClick={() => unlinkFile(f.id, f.name)} title="Remove from this lead (file stays in Drive)"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 'var(--ds-btn-py-xs) 8px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }}>
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ border: '2px dashed var(--border)', borderRadius: 9, padding: '40px 24px', textAlign: 'center', color: 'var(--ink3)', background: 'var(--bg)' }}>
                  <Icon name="upload" size={28} strokeWidth={1.25} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)', marginTop: 10 }}>No documents yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Proposals, contracts, any documents for this lead</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add/Edit modal (reused from list) */}
        {showAdd && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div className="card" style={{ width: '90%', maxWidth: 580, padding: 28, borderRadius: 9, boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>{editingId ? 'Edit Lead' : 'Add New Lead'}</h2>
                <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }}>×</button>
              </div>
              <form onSubmit={handleAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 16px' }}>
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
                    <Select value={addForm.assigned_to || '__none__'} onValueChange={v => setF('assigned_to', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {OFFICERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Notes</label>
                    <textarea className="input-field" placeholder="Brief description of the opportunity…" rows={3}
                      value={addForm.notes || ''} onChange={e => setF('notes', e.target.value)} style={{ resize: 'vertical', minHeight: 70 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary btn-md" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-md" disabled={addSaving}>{addSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Lead'}</button>
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
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['CRM', 'Leads']}
        titlePlain="Lead"
        titleEm="pipeline"
        subtitle={`${leads.length} leads · ${active.length} active · ${fmtValue(pipeline)} pipeline value · ${winRate}% win rate`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => exportLeadsCSV(filtered)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 18px', fontSize: 13, borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              <Icon name="download" size={14} strokeWidth={2} /> Export CSV
            </button>
            <button type="button" onClick={() => { setAddForm({ ...EMPTY_FORM }); setEditingId(null); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 22px', fontSize: 14, fontWeight: 700, borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
              <Icon name="plus" size={15} strokeWidth={2.5} color="hsl(var(--primary-foreground))" /> New Lead
            </button>
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
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <SingleSelectFilter
              label="Stage" allLabel="All Stages"
              options={STAGES.map(s => ({ value: s, label: STAGE_CFG[s].label }))}
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
            {(search || filterStage || filterSource || filterPriority) && (
              <button type="button" onClick={() => { setSearch(''); setFilterStage(''); setFilterSource(''); setFilterPriority(''); setPage(1); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontFamily: 'var(--font)', padding: '0 2px' }}>
                Clear
              </button>
            )}

            <div style={{ flex: 1 }} />

            <span style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{filtered.length} leads</span>
            <div style={{ position: 'relative', minWidth: 180, maxWidth: 280 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' } as React.CSSProperties} />
              <input type="text" placeholder="Search leads…" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Stage chips */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexWrap: 'wrap' }}>
            <button type="button" className={`fc${!filterStage ? ' on' : ''}`} onClick={() => { setFilterStage(''); setPage(1); }}>
              All ({leads.length})
            </button>
            {STAGES.map(s => (
              <button key={s} type="button" className={`fc${filterStage === s ? ' on' : ''}`} onClick={() => { setFilterStage(filterStage === s ? '' : s); setPage(1); }}>
                {STAGE_CFG[s].label} ({leads.filter(l => l.stage === s).length})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rtbl-wrap">
            <table className="rtbl">
              <thead>
                <tr>
                  <Th width={44}>
                    <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={toggleAll} />
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
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${lead.company}`} checked={selectedIds.includes(lead.id)}
                        onChange={() => setSelectedIds(p => p.includes(lead.id) ? p.filter(x => x !== lead.id) : [...p, lead.id])} />
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
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtValue(lead.value)}</td>
                    <td style={{ padding: '12px 14px' }}><PriBadge priority={lead.priority} /></td>
                    <td style={{ padding: '12px 14px' }}>
                      {lead.assigned_to ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <LeadAv name={lead.assigned_to} size={22} />
                          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{lead.assigned_to}</span>
                        </div>
                      ) : <span style={{ color: 'var(--ink3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{lead.expected_close ? fmtShort(lead.expected_close) : '—'}</td>
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
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 8px', background: 'var(--white)', cursor: pg === 1 ? 'default' : 'pointer', color: 'var(--ink3)', opacity: pg === 1 ? 0.4 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                {getPageNums(pg, totalPages).map((p, i) =>
                  p === '…' ? <span key={i} style={{ padding: '0 6px', color: 'var(--ink3)', fontSize: 13 }}>…</span> :
                  <button key={p} type="button" onClick={() => setPage(Number(p))}
                    style={{ border: `1px solid ${pg === p ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 10px', background: pg === p ? 'hsl(var(--primary))' : 'var(--white)', cursor: 'pointer', fontSize: 13, color: pg === p ? 'hsl(var(--primary-foreground))' : 'var(--ink)', minWidth: 32, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    {p}
                  </button>
                )}
                <button type="button" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pg === totalPages}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 8px', background: 'var(--white)', cursor: pg === totalPages ? 'default' : 'pointer', color: 'var(--ink3)', opacity: pg === totalPages ? 0.4 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="card" style={{ width: '90%', maxWidth: 580, padding: 28, borderRadius: 9, boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>{editingId ? 'Edit Lead' : 'Add New Lead'}</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0' }}>Fill in the prospect details below</p>
              </div>
              <button type="button" className="dp-close" aria-label="Close" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }}>×</button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 16px' }}>
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
                  <Select value={addForm.assigned_to || '__none__'} onValueChange={v => setF('assigned_to', v === '__none__' ? '' : v)}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {OFFICERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Notes</label>
                  <textarea className="input-field" placeholder="Brief description of the opportunity…" rows={3}
                    value={addForm.notes || ''} onChange={e => setF('notes', e.target.value)} style={{ resize: 'vertical', minHeight: 70 }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary btn-md" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }); setEditingId(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-md" disabled={addSaving}>{addSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
