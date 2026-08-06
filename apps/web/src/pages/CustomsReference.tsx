import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useAuth } from '../hooks/useAuth.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';

// ── Customs Reference — ICD directory, TASAC agents, EAC excise, port/agency tariff ──
// Real gazette data imported from the public EAC customs suite
// (see apps/api/src/scripts/import-moovit-reference-data.ts for the
// original one-off seed; SUPER_ADMIN can now refresh/edit it from here).
// The "Tariff" tab additionally covers the TPA Sea Ports Tariff Book
// (Jan 2026, Clauses 19-25) and the TASAC CFA agency-fee guide
// (GN. 83-2026), seeded via scripts/seed-port-tariff.mjs into
// port_tariff_items (migration 144).

type Tab = 'icd' | 'agents' | 'excise' | 'tariff';
const TARIFF_NONE = '__all__';

interface IcdOperator {
  id: string; operator_type: string; name: string; email: string | null;
  tel: string | null; address: string | null; region: string | null;
  license_no: string | null; license_start: string | null; license_exp: string | null;
}
interface ClearingAgent {
  id: string; name: string; email: string | null; license_no: string | null;
  region: string | null; tel: string | null;
}
interface ExciseItem {
  id: string; category: string; item_description: string;
  tz_rate: string | null; ke_rate: string | null; ug_rate: string | null;
  rw_rate: string | null; bi_rate: string | null;
}
interface ImportSummary { total: number; inserted: number; updated: number; skipped: number }
interface TariffItem {
  id: string; authority: string; clause_ref: string | null; category: string; subcategory: string | null;
  item_name: string; unit: string | null; cargo_type: string | null; container_size: string | null;
  rate_amount: string | null; rate_currency: string; rate_type: string; min_charge: string | null;
  free_period: string | null; source_document: string; notes: string | null; is_placeholder: boolean;
}

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const editInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--teal)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5, fontFamily: 'var(--font)' };

export const CustomsReference: React.FC = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN';

  const [tab, setTab] = useState<Tab>('icd');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const [icd, setIcd] = useState<IcdOperator[]>([]);
  const [agents, setAgents] = useState<ClearingAgent[]>([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [agentsPage, setAgentsPage] = useState(0);
  const [excise, setExcise] = useState<ExciseItem[]>([]);
  const [tariff, setTariff] = useState<TariffItem[]>([]);
  const [tariffTotal, setTariffTotal] = useState(0);
  const [tariffPage, setTariffPage] = useState(0);
  const [tariffAuthority, setTariffAuthority] = useState(TARIFF_NONE);
  const [tariffCategory, setTariffCategory] = useState(TARIFF_NONE);
  const [tariffCategories, setTariffCategories] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Inline row editing ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // ── Bulk CSV import ──
  const [importBusy, setImportBusy] = useState<Tab | null>(null);
  const [importResult, setImportResult] = useState<{ tab: Tab; summary: ImportSummary } | null>(null);
  const [importError, setImportError] = useState('');
  const importTargetTab = useRef<Tab>('icd');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAGE = 50;

  const load = async (query: string, page = 0) => {
    setLoading(true);
    try {
      if (tab === 'icd') {
        const res = await apiFetch(`/v1/reference/icd-operators${query ? `?q=${encodeURIComponent(query)}` : ''}`);
        setIcd(res.data ?? []);
      } else if (tab === 'agents') {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('limit', String(PAGE));
        params.set('offset', String(page * PAGE));
        const res = await apiFetch(`/v1/reference/clearing-agents?${params}`);
        setAgents(res.data ?? []);
        setAgentsTotal(res.total ?? 0);
      } else if (tab === 'tariff') {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (tariffAuthority !== TARIFF_NONE) params.set('authority', tariffAuthority);
        if (tariffCategory !== TARIFF_NONE) params.set('category', tariffCategory);
        params.set('limit', String(PAGE));
        params.set('offset', String(page * PAGE));
        const res = await apiFetch(`/v1/reference/tariff?${params}`);
        setTariff(res.data ?? []);
        setTariffTotal(res.total ?? 0);
      } else {
        const res = await apiFetch(`/v1/reference/excise${query ? `?q=${encodeURIComponent(query)}` : ''}`);
        setExcise(res.data ?? []);
      }
    } catch (err) {
      console.error('Reference lookup failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial + tab change
  useEffect(() => { setQ(''); setAgentsPage(0); setTariffPage(0); setEditingId(null); setImportResult(null); load(''); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tariff authority/category filter change
  useEffect(() => {
    if (tab !== 'tariff') return;
    setTariffPage(0);
    load(q, 0);
  }, [tariffAuthority, tariffCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tariff category options refresh when authority filter changes
  useEffect(() => {
    if (tab !== 'tariff') return;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (tariffAuthority !== TARIFF_NONE) params.set('authority', tariffAuthority);
        const res = await apiFetch(`/v1/reference/tariff/categories?${params}`);
        setTariffCategories(res.data ?? []);
      } catch (err) { console.error('Tariff categories lookup failed:', err); }
    })();
  }, [tab, tariffAuthority]);

  // Debounced live search
  const onSearch = (val: string) => {
    setQ(val);
    setAgentsPage(0);
    setTariffPage(0);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(val, 0), 300);
  };

  const gotoPage = (p: number) => {
    if (tab === 'tariff') { setTariffPage(p); load(q, p); }
    else { setAgentsPage(p); load(q, p); }
  };
  const totalPages = Math.max(1, Math.ceil((tab === 'tariff' ? tariffTotal : agentsTotal) / PAGE));

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  // ── Edit ──
  function startEdit(row: any) { setEditingId(row.id); setDraft({ ...row }); }
  function cancelEdit() { setEditingId(null); setDraft({}); }
  function setField(k: string, v: any) { setDraft(d => ({ ...d, [k]: v })); }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      const path = tab === 'icd' ? `/v1/reference/icd-operators/${editingId}`
        : tab === 'agents' ? `/v1/reference/clearing-agents/${editingId}`
        : tab === 'tariff' ? `/v1/reference/tariff/${editingId}`
        : `/v1/reference/excise/${editingId}`;
      const payload: Record<string, any> = { ...draft };
      if (tab === 'icd') {
        payload.license_start = draft.license_start instanceof Date ? toDateOnlyString(draft.license_start) : draft.license_start;
        payload.license_exp = draft.license_exp instanceof Date ? toDateOnlyString(draft.license_exp) : draft.license_exp;
      }
      const res = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(payload) });
      if (tab === 'icd') setIcd(prev => prev.map(r => r.id === editingId ? res.data : r));
      else if (tab === 'agents') setAgents(prev => prev.map(r => r.id === editingId ? res.data : r));
      else if (tab === 'tariff') setTariff(prev => prev.map(r => r.id === editingId ? res.data : r));
      else setExcise(prev => prev.map(r => r.id === editingId ? res.data : r));
      cancelEdit();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  // ── Bulk import ──
  function handleUploadClick(t: Tab) {
    importTargetTab.current = t;
    fileInputRef.current?.click();
  }
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const t = importTargetTab.current;
    setImportBusy(t);
    setImportError('');
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    const path = t === 'icd' ? '/v1/reference/icd-operators/import'
      : t === 'agents' ? '/v1/reference/clearing-agents/import'
      : '/v1/reference/excise/import';
    try {
      const res = await apiFetch(path, { method: 'POST', body: fd });
      setImportResult({ tab: t, summary: res.data });
      if (t === tab) load(q, t === 'agents' ? agentsPage : 0);
    } catch (err: any) {
      setImportError(err.message || 'Import failed — check the file is a valid CSV.');
    } finally {
      setImportBusy(null);
      e.target.value = '';
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'icd',    label: 'ICD / Dry Ports' },
    { key: 'agents', label: 'Clearing Agents' },
    { key: 'excise', label: 'EAC Excise Rates' },
    { key: 'tariff', label: 'TPA / TASAC Tariff' },
  ];
  const AUTHORITY_LABEL: Record<string, string> = { TPA: 'TPA (Sea Ports)', TASAC_CFA: 'TASAC (Agency Fees)', TRA: 'TRA (Other Levies)' };
  const fmtRate = (t: TariffItem) => {
    if (t.rate_amount == null) return t.is_placeholder ? 'Rate pending' : '—';
    const n = Number(t.rate_amount);
    return `${t.rate_currency} ${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ padding: '0 0 32px', flex: 1, overflowY: 'auto' }}>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Header */}
      <PageHeader
        crumbs={['ClearOS', 'Reference Data']}
        titlePlain="Customs"
        titleEm="reference"
        subtitle="Licensed ICD operators, TASAC clearing-agent registry (GN 83/2026), EAC excise duty schedules, and the TPA/TASAC port & agency tariff book."
        actions={canEdit && tab !== 'tariff' ? (
          <button type="button" onClick={() => handleUploadClick(tab)} disabled={importBusy !== null}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 'var(--ds-btn-py) 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: importBusy ? 'wait' : 'pointer', opacity: importBusy ? 0.7 : 1, flexShrink: 0, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="upload" size={15} /> {importBusy === tab ? 'Uploading…' : `Upload fresh ${TABS.find(t => t.key === tab)?.label} list`}
          </button>
        ) : undefined}
      />

      {!canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
          <Icon name="lock" size={13} />
          This is shared reference data used by every tenant on the platform — only a platform super-admin can edit or re-upload it.
        </div>
      )}

      {importResult && importResult.tab === tab && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--green-l)', border: '1px solid var(--green)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
          <span>
            Imported {importResult.summary.total} rows — {importResult.summary.updated} updated, {importResult.summary.inserted} new
            {importResult.summary.skipped > 0 ? `, ${importResult.summary.skipped} skipped (missing required fields)` : ''}.
          </span>
          <button type="button" onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)' }}><Icon name="x" size={14} /></button>
        </div>
      )}
      {importError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
          <span>{importError}</span>
          <button type="button" onClick={() => setImportError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* Tabs + search — one row, responsive */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(14,31,61,0.04)', padding: 4, borderRadius: 9 }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{
                height: 32, padding: '0 14px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)',
                background: tab === t.key ? 'var(--white)' : 'transparent',
                color: tab === t.key ? 'var(--ink)' : 'var(--ink3)',
                boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 380, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon name="search" size={13} color="var(--ink3)" />
          </span>
          <input
            value={q}
            onChange={e => onSearch(e.target.value)}
            placeholder={tab === 'icd' ? 'Search operator, licence, address…' : tab === 'agents' ? 'Search agent name, licence, email…' : tab === 'tariff' ? 'Search clause, item, category…' : 'Search product…'}
            style={{ width: '100%', height: 32, boxSizing: 'border-box', padding: '0 12px 0 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13 }}
          />
        </div>
        {tab === 'tariff' && (
          <>
            <Select value={tariffAuthority} onValueChange={setTariffAuthority}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 170 }}><SelectValue placeholder="Authority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TARIFF_NONE}>All authorities</SelectItem>
                <SelectItem value="TPA">TPA (Sea Ports)</SelectItem>
                <SelectItem value="TASAC_CFA">TASAC (Agency Fees)</SelectItem>
                <SelectItem value="TRA">TRA (Other Levies)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tariffCategory} onValueChange={setTariffCategory}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 220 }}><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TARIFF_NONE}>All categories</SelectItem>
                {tariffCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {loading && <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Table card */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
          {tab === 'icd' && (
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={th}>Operator</th><th style={th}>Type</th><th style={th}>Region</th>
                <th style={th}>Licence No.</th><th style={th}>Expires</th><th style={th}>Contact</th>
                {canEdit && <th style={th}></th>}
              </tr></thead>
              <tbody>
                {icd.map(o => {
                  const isEditing = editingId === o.id;
                  return (
                    <tr key={o.id}>
                      {isEditing ? (
                        <>
                          <td style={td}>
                            <input style={editInput} value={draft.name ?? ''} onChange={e => setField('name', e.target.value)} placeholder="Operator name" />
                            <input style={{ ...editInput, marginTop: 4 }} value={draft.address ?? ''} onChange={e => setField('address', e.target.value)} placeholder="Address" />
                          </td>
                          <td style={td}><input style={editInput} value={draft.operator_type ?? ''} onChange={e => setField('operator_type', e.target.value)} placeholder="Type" /></td>
                          <td style={td}><input style={editInput} value={draft.region ?? ''} onChange={e => setField('region', e.target.value)} placeholder="Region" /></td>
                          <td style={td}><input style={editInput} value={draft.license_no ?? ''} onChange={e => setField('license_no', e.target.value)} placeholder="Licence no." /></td>
                          <td style={td}>
                            <DatePicker
                              date={draft.license_exp ? new Date(draft.license_exp) : undefined}
                              onChange={d => setField('license_exp', d)}
                              triggerClassName="h-8 text-xs"
                            />
                          </td>
                          <td style={td}>
                            <input style={editInput} value={draft.email ?? ''} onChange={e => setField('email', e.target.value)} placeholder="Email" />
                            <input style={{ ...editInput, marginTop: 4 }} value={draft.tel ?? ''} onChange={e => setField('tel', e.target.value)} placeholder="Phone" />
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={saveEdit} disabled={saving} title="Save" style={{ background: 'none', border: 'none', cursor: saving ? 'wait' : 'pointer', color: 'var(--green)', padding: 4 }}><Icon name="check" size={15} /></button>
                            <button type="button" onClick={cancelEdit} disabled={saving} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="x" size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, fontWeight: 600 }}>{o.name}<div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{o.address}</div></td>
                          <td style={td}><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(8,145,178,0.1)', color: 'var(--teal)' }}>{o.operator_type}</span></td>
                          <td style={td}>{o.region ?? '—'}</td>
                          <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12 }}>{o.license_no ?? '—'}</td>
                          <td style={td}>{fmtDate(o.license_exp)}</td>
                          <td style={{ ...td, fontSize: 12 }}>{o.email ?? '—'}{o.tel ? <div style={{ color: 'var(--ink3)' }}>{o.tel}</div> : null}</td>
                          {canEdit && <td style={td}><button type="button" onClick={() => startEdit(o)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="edit" size={14} /></button></td>}
                        </>
                      )}
                    </tr>
                  );
                })}
                {icd.length === 0 && !loading && <tr><td colSpan={canEdit ? 7 : 6} style={{ ...td, textAlign: 'center', color: 'var(--ink3)', padding: 40 }}>No operators match.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'agents' && (
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={th}>Licence No.</th><th style={th}>Agent</th><th style={th}>Region</th><th style={th}>Email</th>
                {canEdit && <th style={th}></th>}
              </tr></thead>
              <tbody>
                {agents.map(a => {
                  const isEditing = editingId === a.id;
                  return (
                    <tr key={a.id}>
                      {isEditing ? (
                        <>
                          <td style={td}><input style={editInput} value={draft.license_no ?? ''} onChange={e => setField('license_no', e.target.value)} placeholder="Licence no." /></td>
                          <td style={td}>
                            <input style={editInput} value={draft.name ?? ''} onChange={e => setField('name', e.target.value)} placeholder="Agent name" />
                            <input style={{ ...editInput, marginTop: 4 }} value={draft.tel ?? ''} onChange={e => setField('tel', e.target.value)} placeholder="Phone" />
                          </td>
                          <td style={td}><input style={editInput} value={draft.region ?? ''} onChange={e => setField('region', e.target.value)} placeholder="Region" /></td>
                          <td style={td}><input style={editInput} value={draft.email ?? ''} onChange={e => setField('email', e.target.value)} placeholder="Email" /></td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={saveEdit} disabled={saving} title="Save" style={{ background: 'none', border: 'none', cursor: saving ? 'wait' : 'pointer', color: 'var(--green)', padding: 4 }}><Icon name="check" size={15} /></button>
                            <button type="button" onClick={cancelEdit} disabled={saving} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="x" size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{a.license_no ?? '—'}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{a.name}</td>
                          <td style={td}>{a.region ?? '—'}</td>
                          <td style={{ ...td, fontSize: 12 }}>{a.email ?? '—'}</td>
                          {canEdit && <td style={td}><button type="button" onClick={() => startEdit(a)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="edit" size={14} /></button></td>}
                        </>
                      )}
                    </tr>
                  );
                })}
                {agents.length === 0 && !loading && <tr><td colSpan={canEdit ? 5 : 4} style={{ ...td, textAlign: 'center', color: 'var(--ink3)', padding: 40 }}>No agents match.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'excise' && (
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={th}>Category</th><th style={th}>Product</th>
                <th style={th}>Tanzania</th><th style={th}>Kenya</th><th style={th}>Uganda</th><th style={th}>Rwanda</th><th style={th}>Burundi</th>
                {canEdit && <th style={th}></th>}
              </tr></thead>
              <tbody>
                {excise.map(x => {
                  const isEditing = editingId === x.id;
                  return (
                    <tr key={x.id}>
                      {isEditing ? (
                        <>
                          <td style={td}><input style={editInput} value={draft.category ?? ''} onChange={e => setField('category', e.target.value)} placeholder="Category" /></td>
                          <td style={td}><input style={editInput} value={draft.item_description ?? ''} onChange={e => setField('item_description', e.target.value)} placeholder="Product" /></td>
                          {(['tz_rate', 'ke_rate', 'ug_rate', 'rw_rate', 'bi_rate'] as const).map(k => (
                            <td key={k} style={td}><input style={{ ...editInput, width: 70, fontFamily: 'var(--mono)' }} value={draft[k] ?? ''} onChange={e => setField(k, e.target.value)} /></td>
                          ))}
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={saveEdit} disabled={saving} title="Save" style={{ background: 'none', border: 'none', cursor: saving ? 'wait' : 'pointer', color: 'var(--green)', padding: 4 }}><Icon name="check" size={15} /></button>
                            <button type="button" onClick={cancelEdit} disabled={saving} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="x" size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, fontSize: 11, fontWeight: 700, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{x.category}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{x.item_description}</td>
                          {[x.tz_rate, x.ke_rate, x.ug_rate, x.rw_rate, x.bi_rate].map((r, i) => (
                            <td key={i} style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap', color: r ? 'var(--ink)' : 'var(--ink3)' }}>{r ?? '—'}</td>
                          ))}
                          {canEdit && <td style={td}><button type="button" onClick={() => startEdit(x)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="edit" size={14} /></button></td>}
                        </>
                      )}
                    </tr>
                  );
                })}
                {excise.length === 0 && !loading && <tr><td colSpan={canEdit ? 8 : 7} style={{ ...td, textAlign: 'center', color: 'var(--ink3)', padding: 40 }}>No excise entries match.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'tariff' && (
            <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={th}>Authority</th><th style={th}>Clause</th><th style={th}>Item</th>
                <th style={th}>Unit</th><th style={th}>Size/Type</th><th style={th}>Rate</th>
                {canEdit && <th style={th}></th>}
              </tr></thead>
              <tbody>
                {tariff.map(t => {
                  const isEditing = editingId === t.id;
                  return (
                    <tr key={t.id}>
                      {isEditing ? (
                        <>
                          <td style={td}><input style={{ ...editInput, width: 90 }} value={draft.authority ?? ''} onChange={e => setField('authority', e.target.value)} placeholder="Authority" /></td>
                          <td style={td}><input style={{ ...editInput, width: 90 }} value={draft.clause_ref ?? ''} onChange={e => setField('clause_ref', e.target.value)} placeholder="Clause" /></td>
                          <td style={td}>
                            <input style={editInput} value={draft.item_name ?? ''} onChange={e => setField('item_name', e.target.value)} placeholder="Item name" />
                            <input style={{ ...editInput, marginTop: 4 }} value={draft.category ?? ''} onChange={e => setField('category', e.target.value)} placeholder="Category" />
                            <input style={{ ...editInput, marginTop: 4 }} value={draft.subcategory ?? ''} onChange={e => setField('subcategory', e.target.value)} placeholder="Subcategory" />
                          </td>
                          <td style={td}><input style={{ ...editInput, width: 100 }} value={draft.unit ?? ''} onChange={e => setField('unit', e.target.value)} placeholder="Unit" /></td>
                          <td style={td}><input style={{ ...editInput, width: 80 }} value={draft.container_size ?? ''} onChange={e => setField('container_size', e.target.value)} placeholder="Size" /></td>
                          <td style={td}>
                            <input style={{ ...editInput, width: 90, fontFamily: 'var(--mono)' }} value={draft.rate_amount ?? ''} onChange={e => setField('rate_amount', e.target.value)} placeholder="Rate" />
                            <input style={{ ...editInput, marginTop: 4, width: 90 }} value={draft.rate_currency ?? ''} onChange={e => setField('rate_currency', e.target.value)} placeholder="Currency" />
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={saveEdit} disabled={saving} title="Save" style={{ background: 'none', border: 'none', cursor: saving ? 'wait' : 'pointer', color: 'var(--green)', padding: 4 }}><Icon name="check" size={15} /></button>
                            <button type="button" onClick={cancelEdit} disabled={saving} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="x" size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={td}><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(8,145,178,0.1)', color: 'var(--teal)' }}>{AUTHORITY_LABEL[t.authority] ?? t.authority}</span></td>
                          <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{t.clause_ref ?? '—'}</td>
                          <td style={{ ...td, fontWeight: 600 }}>
                            {t.item_name}
                            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{[t.category, t.subcategory].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td style={{ ...td, fontSize: 12 }}>{t.unit ?? '—'}</td>
                          <td style={{ ...td, fontSize: 12 }}>{[t.container_size, t.cargo_type].filter(Boolean).join(' / ') || '—'}</td>
                          <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: t.is_placeholder ? 'var(--gold)' : 'var(--ink)' }}>
                            {fmtRate(t)}
                            {t.min_charge != null && <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 400 }}>min {t.rate_currency} {Number(t.min_charge).toLocaleString('en-US')}</div>}
                          </td>
                          {canEdit && <td style={td}><button type="button" onClick={() => startEdit(t)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="edit" size={14} /></button></td>}
                        </>
                      )}
                    </tr>
                  );
                })}
                {tariff.length === 0 && !loading && <tr><td colSpan={canEdit ? 7 : 6} style={{ ...td, textAlign: 'center', color: 'var(--ink3)', padding: 40 }}>No tariff items match.</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        {/* Agents / Tariff pagination */}
        {((tab === 'agents' && agentsTotal > PAGE) || (tab === 'tariff' && tariffTotal > PAGE)) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {(() => { const p = tab === 'tariff' ? tariffPage : agentsPage; const total = tab === 'tariff' ? tariffTotal : agentsTotal; return `${p * PAGE + 1}–${Math.min((p + 1) * PAGE, total)} of ${total.toLocaleString()} ${tab === 'tariff' ? 'tariff items' : 'licensed agents'}`; })()}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(() => { const p = tab === 'tariff' ? tariffPage : agentsPage; return (
                <>
                  <button type="button" disabled={p === 0} onClick={() => gotoPage(p - 1)}
                    style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: p === 0 ? 'var(--ink3)' : 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: p === 0 ? 'default' : 'pointer' }}>
                    ‹ Prev
                  </button>
                  <button type="button" disabled={p >= totalPages - 1} onClick={() => gotoPage(p + 1)}
                    style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: p >= totalPages - 1 ? 'var(--ink3)' : 'var(--ink)', fontSize: 12, fontWeight: 600, cursor: p >= totalPages - 1 ? 'default' : 'pointer' }}>
                    Next ›
                  </button>
                </>
              ); })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
