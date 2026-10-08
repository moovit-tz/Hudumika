import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface Consignment {
  id: string;
  owner_id?: string;
  owner_name?: string;
  transport_doc_type: string;
  transport_doc_number: string | null;
  status: string;
  expected_arrival: string | null;
  goods_description: string | null;
  gross_weight_kg: number | null;
  compartment_name?: string | null;
}
interface Compartment { id: string; code: string; name: string; }
interface Customer { id: string; name: string; category?: string; }

export const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  EXPECTED: 'gray', ARRIVED_AT_GATE: 'info', GATE_IN_COMPLETE: 'info', IN_YARD: 'brand',
  AWAITING_CUSTOMS: 'warning', UNDER_EXAMINATION: 'warning', RELEASED_FOR_DEVANNING: 'brand',
  DEVANNING: 'brand', DEVANNED: 'success', EMPTY_RETURNED: 'success',
  HELD_BY_CUSTOMS: 'error', HELD_BY_AGENCY: 'error', DAMAGED: 'error',
  SHORT_SHIPPED: 'error', REJECTED_AT_GATE: 'error',
};

const STATUS_OPTIONS = [
  { value: '__none__', label: 'All statuses' },
  { value: 'EXPECTED',               label: 'Expected' },
  { value: 'ARRIVED_AT_GATE',        label: 'Arrived at Gate' },
  { value: 'IN_YARD',                label: 'In Yard' },
  { value: 'AWAITING_CUSTOMS',       label: 'Awaiting Customs' },
  { value: 'UNDER_EXAMINATION',      label: 'Under Examination' },
  { value: 'RELEASED_FOR_DEVANNING', label: 'Released for Devanning' },
  { value: 'DEVANNED',               label: 'Devanned' },
  { value: 'HELD_BY_CUSTOMS',        label: 'Held by Customs' },
  { value: 'HELD_BY_AGENCY',         label: 'Held by Agency' },
];

const TRANSPORT_DOC_TYPES = ['BL', 'AWB', 'CMR', 'RAIL_WAYBILL'];

const BLANK_FORM = {
  compartmentId: '', ownerId: '', docType: 'BL', docNumber: '',
  expectedArrival: undefined as Date | undefined, goodsDescription: '',
};

export function SealConsignments() {
  const navigate = useNavigate();
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__none__');
  const [form, setForm] = useState({ ...BLANK_FORM });

  function reload() {
    setLoading(true);
    apiFetch('/v1/seal/consignments')
      .then((r: any) => setConsignments(Array.isArray(r) ? r : r.data ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    apiFetch('/v1/seal/compartments')
      .then((rows: Compartment[]) => {
        setCompartments(rows);
        if (rows.length === 1) setForm(f => ({ ...f, compartmentId: rows[0].id }));
      })
      .catch(() => {});
    apiFetch('/v1/customers')
      .then((res: any) => setCustomers(Array.isArray(res) ? res : res.data || res.customers || []))
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.compartmentId || !form.ownerId) {
      showAlert('Select a compartment and an owner.'); return;
    }
    setSaving(true);
    try {
      const c: any = await apiFetch('/v1/seal/consignments', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: form.compartmentId,
          ownerId: form.ownerId,
          transportDocType: form.docType,
          transportDocNumber: form.docNumber.trim() || null,
          expectedArrival: form.expectedArrival ? toDateOnlyString(form.expectedArrival) : null,
          goodsDescription: form.goodsDescription.trim() || null,
        }),
      });
      navigate(`/seal/consignments/${c.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create consignment.');
    } finally {
      setSaving(false);
    }
  }

  // KPI calculations
  const today = new Date().toDateString();
  const expected   = consignments.filter(c => c.status === 'EXPECTED').length;
  const arrivingToday = consignments.filter(c => c.expected_arrival && new Date(c.expected_arrival).toDateString() === today).length;
  const active     = consignments.filter(c => ['ARRIVED_AT_GATE','GATE_IN_COMPLETE','IN_YARD','AWAITING_CUSTOMS','UNDER_EXAMINATION','RELEASED_FOR_DEVANNING','DEVANNING'].includes(c.status)).length;
  const held       = consignments.filter(c => ['HELD_BY_CUSTOMS','HELD_BY_AGENCY'].includes(c.status)).length;
  const devanned   = consignments.filter(c => c.status === 'DEVANNED' || c.status === 'EMPTY_RETURNED').length;
  const totalWeight = consignments.reduce((s, c) => s + (c.gross_weight_kg ?? 0), 0);

  // Filtered list
  const filtered = consignments.filter(c => {
    if (statusFilter !== '__none__' && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.transport_doc_number ?? '').toLowerCase().includes(q) ||
      (c.owner_name ?? '').toLowerCase().includes(q) ||
      (c.goods_description ?? '').toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const activeFilters = (statusFilter !== '__none__' ? 1 : 0);

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  return (
    <div className="seal-page">
      {showNew && (
        <Dialog open onOpenChange={o => { if (!o) setShowNew(false); }}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>New Consignment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <DialogBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Compartment</label>
                      <Select value={form.compartmentId} onValueChange={v => setForm(f => ({ ...f, compartmentId: v }))}>
                        <SelectTrigger style={inp}><SelectValue placeholder="Choose warehouse" /></SelectTrigger>
                        <SelectContent>
                          {compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={lbl}>Owner (CRM Client)</label>
                      <Combobox
                        options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.category }))}
                        value={form.ownerId}
                        onChange={v => setForm(f => ({ ...f, ownerId: v }))}
                        placeholder="Search clients…"
                        emptyText="No matching clients."
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Doc Type</label>
                      <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                        <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TRANSPORT_DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={lbl}>Document Number</label>
                      <input type="text" style={inp} value={form.docNumber} onChange={e => setForm(f => ({ ...f, docNumber: e.target.value }))} placeholder="MEDU1234567" />
                    </div>
                    <div>
                      <label style={lbl}>Expected Arrival</label>
                      <DatePicker date={form.expectedArrival} onChange={d => setForm(f => ({ ...f, expectedArrival: d }))} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Goods Description</label>
                    <input type="text" style={inp} value={form.goodsDescription} onChange={e => setForm(f => ({ ...f, goodsDescription: e.target.value }))} placeholder="General merchandise" />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)} data-ui-native-button="">Cancel</button>
                <Button type="submit" disabled={saving || !form.compartmentId || !form.ownerId}>
                  {saving ? 'Creating…' : 'Create Consignment'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <PageHeader
        crumbs={['SEAL', 'Gate & Receiving', 'Consignments']}
        titlePlain="Inbound"
        titleEm="consignments"
        subtitle="Pre-arrival through gate-in to devanning — one consignment per transport document."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Consignment</Button>}
      />

      {/* KPI strip — 6 tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Expected',        value: expected,        color: 'var(--ink3)',   icon: 'clock' },
          { label: 'Arriving Today',  value: arrivingToday,   color: 'var(--teal)',   icon: 'truck' },
          { label: 'Active in Yard',  value: active,          color: 'var(--blue)',   icon: 'package' },
          { label: 'Held',            value: held,            color: 'var(--red)',    icon: 'alertCircle' },
          { label: 'Devanned',        value: devanned,        color: 'var(--green)',  icon: 'checkCircle' },
          { label: 'Total Weight (t)', value: (totalWeight / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), color: 'var(--gold)', icon: 'scale' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color, opacity: 0.75, flexShrink: 0 }}>
              <Icon name={k.icon as any} size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: status left, search right */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={v => setStatusFilter(v ?? '__none__')}
        />
        <div style={{ flex: 1 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by doc number, owner or goods…"
            activeFilterCount={activeFilters}
          />
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : filtered.length === 0 ? (
            <div className="seal-empty">
              {consignments.length === 0 ? 'No consignments yet.' : 'No consignments match your filters.'}
            </div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Transport Doc</th>
                  <th>Owner</th>
                  <th>Goods</th>
                  <th>Weight</th>
                  <th>ETA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/consignments/${c.id}`)}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>{c.transport_doc_type}</div>
                      {c.transport_doc_number && (
                        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>
                          {c.transport_doc_number}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.owner_name ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar userId={c.owner_id} kind="customers" name={c.owner_name} size={22} />
                          <span style={{ fontSize: 13 }}>{c.owner_name}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink2)', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.goods_description ?? '—'}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--ink3)' }}>
                      {c.gross_weight_kg ? `${(c.gross_weight_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      {c.expected_arrival ? new Date(c.expected_arrival).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                        {c.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
