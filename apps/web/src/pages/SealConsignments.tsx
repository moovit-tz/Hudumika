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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Input } from '../components/ui/input.js';
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
  { value: 'EXPECTED',               label: 'Expected' },
  { value: 'ARRIVED_AT_GATE',        label: 'Arrived at Gate' },
  { value: 'GATE_IN_COMPLETE',       label: 'Gate In Complete' },
  { value: 'IN_YARD',                label: 'In Yard' },
  { value: 'AWAITING_CUSTOMS',       label: 'Awaiting Customs' },
  { value: 'UNDER_EXAMINATION',      label: 'Under Examination' },
  { value: 'RELEASED_FOR_DEVANNING', label: 'Released for Devanning' },
  { value: 'DEVANNING',              label: 'Devanning' },
  { value: 'DEVANNED',               label: 'Devanned' },
  { value: 'EMPTY_RETURNED',         label: 'Empty Returned' },
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
  const [statusFilter, setStatusFilter] = useState('');
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
      showAlert('Select a warehouse compartment and an owner.');
      return;
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
      setShowNew(false);
      setForm({ ...BLANK_FORM });
      navigate(`/seal/consignments/${c.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create consignment.');
    } finally {
      setSaving(false);
    }
  }

  // KPI calculations
  const today = new Date().toDateString();
  const expected      = consignments.filter(c => c.status === 'EXPECTED').length;
  const arrivingToday = consignments.filter(c => c.expected_arrival && new Date(c.expected_arrival).toDateString() === today).length;
  const active        = consignments.filter(c => ['ARRIVED_AT_GATE','GATE_IN_COMPLETE','IN_YARD','AWAITING_CUSTOMS','UNDER_EXAMINATION','RELEASED_FOR_DEVANNING','DEVANNING'].includes(c.status)).length;
  const held          = consignments.filter(c => ['HELD_BY_CUSTOMS','HELD_BY_AGENCY'].includes(c.status)).length;
  const devanned      = consignments.filter(c => c.status === 'DEVANNED' || c.status === 'EMPTY_RETURNED').length;
  const totalWeight   = consignments.reduce((s, c) => s + (c.gross_weight_kg ?? 0), 0);

  const kpiTiles = [
    { label: 'Expected',        value: expected,      icon: 'clock',       variant: 'gray' as const,    filterKey: 'EXPECTED' },
    { label: 'Arriving Today',  value: arrivingToday, icon: 'truck',       variant: 'brand' as const,   filterKey: '__today__' },
    { label: 'Active in Yard',  value: active,        icon: 'package',     variant: 'info' as const,    filterKey: '__active__' },
    { label: 'Held',            value: held,          icon: 'alertCircle', variant: 'error' as const,   filterKey: '__held__' },
    { label: 'Devanned',        value: devanned,      icon: 'checkCircle', variant: 'success' as const, filterKey: 'DEVANNED' },
    { label: 'Total Weight',    value: totalWeight > 0 ? `${(totalWeight / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} t` : '0 t', icon: 'scale', variant: 'warning' as const },
  ];

  // Filtered list
  const filtered = consignments.filter(c => {
    if (statusFilter) {
      if (statusFilter === '__today__') {
        if (!c.expected_arrival || new Date(c.expected_arrival).toDateString() !== today) return false;
      } else if (statusFilter === '__active__') {
        if (!['ARRIVED_AT_GATE','GATE_IN_COMPLETE','IN_YARD','AWAITING_CUSTOMS','UNDER_EXAMINATION','RELEASED_FOR_DEVANNING','DEVANNING'].includes(c.status)) return false;
      } else if (statusFilter === '__held__') {
        if (!['HELD_BY_CUSTOMS','HELD_BY_AGENCY'].includes(c.status)) return false;
      } else if (c.status !== statusFilter) {
        return false;
      }
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.transport_doc_number ?? '').toLowerCase().includes(q) ||
      (c.owner_name ?? '').toLowerCase().includes(q) ||
      (c.goods_description ?? '').toLowerCase().includes(q) ||
      (c.compartment_name ?? '').toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const activeFiltersCount = (statusFilter ? 1 : 0);

  return (
    <div className="seal-page">
      {/* ── New Consignment Dialog ── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Register Inbound Consignment</DialogTitle>
            <DialogDescription>
              Record a transport document (Bill of Lading, Air Waybill or Road Consignment Note) for gate pre-arrival tracking.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Warehouse Compartment</label>
                    <Select value={form.compartmentId} onValueChange={v => setForm(f => ({ ...f, compartmentId: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Choose warehouse compartment" /></SelectTrigger>
                      <SelectContent>
                        {compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Owner (CRM Client)</label>
                    <Combobox
                      options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.category }))}
                      value={form.ownerId}
                      onChange={v => setForm(f => ({ ...f, ownerId: v }))}
                      placeholder="Search clients…"
                      emptyText="No matching clients."
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Doc Type</label>
                    <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSPORT_DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Document Number</label>
                    <Input
                      type="text"
                      value={form.docNumber}
                      onChange={e => setForm(f => ({ ...f, docNumber: e.target.value }))}
                      placeholder="e.g. MEDU7291840"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Expected Arrival</label>
                    <DatePicker date={form.expectedArrival} onChange={d => setForm(f => ({ ...f, expectedArrival: d }))} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Goods Description</label>
                  <Input
                    type="text"
                    value={form.goodsDescription}
                    onChange={e => setForm(f => ({ ...f, goodsDescription: e.target.value }))}
                    placeholder="e.g. General cargo — mixed hardware, steel coils, automotive parts"
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.compartmentId || !form.ownerId}>
                {saving ? 'Creating…' : 'Create Consignment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['SEAL', 'Gate & Receiving', 'Consignments']}
        titlePlain="Inbound"
        titleEm="consignments"
        subtitle="Pre-arrival through gate-in to devanning — one consignment per transport document."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} />
            <span>New Consignment</span>
          </Button>
        }
      />

      {/* ── KPI Metric Strip (Hudumika Squircle Design) ── */}
      <div className="seal-kpi-strip">
        {kpiTiles.map(k => {
          const isSelected = !!k.filterKey && statusFilter === k.filterKey;
          return (
            <div
              key={k.label}
              className="seal-kpi-card"
              style={{
                cursor: k.filterKey ? 'pointer' : 'default',
                borderColor: isSelected ? 'var(--seal)' : undefined,
                background: isSelected ? 'var(--teal-l)' : undefined,
              }}
              onClick={() => {
                if (k.filterKey) {
                  setStatusFilter(curr => curr === k.filterKey ? '' : k.filterKey!);
                }
              }}
              title={k.filterKey ? `Click to filter by ${k.label}` : undefined}
            >
              <FeaturedIcon variant={k.variant} size="md" shape="squircle">
                <Icon name={k.icon as any} size={20} />
              </FeaturedIcon>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="seal-kpi-value">{k.value}</div>
                <div className="seal-kpi-label">{k.label}</div>
              </div>
              {isSelected && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--seal)', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Toolbar: Filter pill & Search bar ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter || null}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
          onChange={v => setStatusFilter(v ?? '')}
        />
        <div style={{ flex: 1, minWidth: 260 }}>
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by doc number, owner or goods…"
            activeFilterCount={activeFiltersCount}
          />
        </div>
      </div>

      {/* ── Consignments Table Card ── */}
      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div style={{ padding: '48px 0' }}>
              <SectionLoading />
            </div>
          ) : filtered.length === 0 ? (
            <div className="seal-empty">
              {consignments.length === 0 ? (
                <>
                  <FeaturedIcon variant="brand" size="lg" shape="squircle">
                    <Icon name="truck" size={24} />
                  </FeaturedIcon>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '14px 0 6px' }}>
                    No inbound consignments registered
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 440, margin: '0 0 16px', lineHeight: 1.4 }}>
                    Pre-arrival consignments appear here as transport documents are registered. Add your first consignment to track gate-in and devanning.
                  </p>
                  <Button onClick={() => setShowNew(true)}>
                    <Icon name="plus" size={14} />
                    <span>Create First Consignment</span>
                  </Button>
                </>
              ) : (
                <>
                  <FeaturedIcon variant="gray" size="lg" shape="squircle">
                    <Icon name="search" size={24} />
                  </FeaturedIcon>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '14px 0 6px' }}>
                    No consignments match your filters
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 16px' }}>
                    Try searching with a different transport doc number, customer name, or clear active filters.
                  </p>
                  <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter(''); }}>
                    Clear Filters
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <table className="seal-table">
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>Transport Doc</th>
                    <th>Owner</th>
                    <th>Goods Description</th>
                    <th style={{ width: 120 }}>Gross Weight</th>
                    <th style={{ width: 130 }}>ETA</th>
                    <th style={{ width: 150 }}>Status</th>
                    <th style={{ width: 44, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const isToday = c.expected_arrival && new Date(c.expected_arrival).toDateString() === today;
                    return (
                      <tr key={c.id} className="seal-table-row-clickable" onClick={() => navigate(`/seal/consignments/${c.id}`)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', color: 'var(--ink2)', letterSpacing: '0.02em' }}>
                              {c.transport_doc_type}
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                              {c.transport_doc_number || '—'}
                            </span>
                          </div>
                          {c.compartment_name && (
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>
                              {c.compartment_name}
                            </div>
                          )}
                        </td>
                        <td>
                          {c.owner_name ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <PersonAvatar userId={c.owner_id} kind="customers" name={c.owner_name} size={24} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.owner_name}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 240 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.goods_description ?? undefined}>
                            {c.goods_description ?? '—'}
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--ink)' }}>
                          {c.gross_weight_kg ? `${(c.gross_weight_kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} t` : '—'}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                          {c.expected_arrival ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span>{new Date(c.expected_arrival).toLocaleDateString()}</span>
                              {isToday && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'var(--teal-l)', color: 'var(--teal)' }}>
                                  Today
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink3)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                            {c.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Icon name="chevronRight" size={15} color="var(--ink3)" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Table metadata footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--card-sunken, var(--bg))',
                  fontSize: 12,
                  color: 'var(--ink3)',
                }}
              >
                <div>
                  Showing <strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> of{' '}
                  <strong style={{ color: 'var(--ink)' }}>{consignments.length}</strong> consignments
                  {statusFilter && (
                    <span style={{ marginLeft: 8 }}>
                      &middot; Filtered by <span style={{ color: 'var(--seal)', fontWeight: 600 }}>{STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? statusFilter}</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reload}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink2)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <Icon name="refresh" size={12} />
                  <span>Refresh</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
