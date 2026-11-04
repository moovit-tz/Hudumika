import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { Icon } from '../../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate, formatDateTime } from '../../lib/tenantLocale.js';

interface Parcel {
  id: string; parcel_number: string; name: string | null; description: string | null;
  weight: number | null; value: number | null; price: number | null; units: number;
  sender_name: string; sender_phone: string; recipient_name: string; recipient_phone: string;
  origin_office_id: string; dest_office_id: string; vehicle_id: string | null;
  status: string; created_at: string; delivered_date: string | null;
  cancellation_reason: string | null;
}

interface TrackingEntry {
  id: string; status: string; location: string | null; description: string | null;
  tracked_at: string; actor_id: string | null;
}

interface Office { id: string; name: string; }
interface Vehicle { id: string; registration_number: string; }

const STATUS_BADGE: Record<string, 'info' | 'brand' | 'warning' | 'success' | 'error' | 'gray'> = {
  RECEIVED: 'info', DISPATCHED: 'brand', OFFLOADED: 'warning',
  DELIVERED: 'success', PICKED_UP: 'success', CANCELED: 'error',
};

const STATUS_OPTIONS = ['ALL', 'RECEIVED', 'DISPATCHED', 'OFFLOADED', 'DELIVERED', 'PICKED_UP', 'CANCELED'];

const TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['DISPATCHED', 'CANCELED'],
  DISPATCHED: ['OFFLOADED', 'CANCELED'],
  OFFLOADED: ['DELIVERED', 'PICKED_UP', 'CANCELED'],
};

export function TumaParcels() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [offices, setOffices] = useState<Office[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sender_name: '', sender_phone: '', recipient_name: '', recipient_phone: '', origin_office_id: '', dest_office_id: '', vehicle_id: '', name: '', weight: '', price: '', units: '1' });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingEntry[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [dispatchVehicle, setDispatchVehicle] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    apiFetch(`/v1/tuma/parcels?${params}`)
      .then(r => { setParcels(r.rows); setTotal(r.total); })
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, [page, search, statusFilter]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    apiFetch('/v1/tuma/offices').then(r => setOffices(r.offices)).catch(() => {});
    apiFetch('/v1/tuma/fleet').then(r => setVehicles(r.vehicles)).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sender_name.trim() || !form.recipient_name.trim() || !form.origin_office_id || !form.dest_office_id) return;
    setSaving(true);
    try {
      await apiFetch('/v1/tuma/parcels', {
        method: 'POST',
        body: JSON.stringify({
          sender_name: form.sender_name.trim(),
          sender_phone: form.sender_phone.trim(),
          recipient_name: form.recipient_name.trim(),
          recipient_phone: form.recipient_phone.trim(),
          origin_office_id: form.origin_office_id,
          dest_office_id: form.dest_office_id,
          vehicle_id: form.vehicle_id || undefined,
          name: form.name.trim() || undefined,
          weight: form.weight ? Number(form.weight) : undefined,
          price: form.price ? Number(form.price) : undefined,
          units: Number(form.units) || 1,
        }),
      });
      setShowCreate(false);
      setForm({ sender_name: '', sender_phone: '', recipient_name: '', recipient_phone: '', origin_office_id: '', dest_office_id: '', vehicle_id: '', name: '', weight: '', price: '', units: '1' });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create parcel');
    } finally {
      setSaving(false);
    }
  }

  async function expandParcel(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setTrackingLoading(true);
    try {
      const r = await apiFetch(`/v1/tuma/parcels/${id}`);
      setTracking(r.tracking ?? []);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setTrackingLoading(false);
    }
  }

  async function doTransition(id: string, action: string, body?: object) {
    try {
      await apiFetch(`/v1/tuma/parcels/${id}/${action}`, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
      reload();
      if (expanded === id) expandParcel(id);
    } catch (err: any) {
      showAlert(err.message);
    }
  }

  const activeFilterCount = statusFilter !== 'ALL' ? 1 : 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'Operations']}
        titlePlain="Active"
        titleEm="parcels"
        subtitle="Every parcel in the system — received, dispatched, offloaded or delivered."
        actions={<Button onClick={() => setShowCreate(true)}><Icon name="plus" size={14} /> New Parcel</Button>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS.map(s => ({ value: s, label: s === 'ALL' ? 'All statuses' : s }))}
          onChange={v => { setStatusFilter(v ?? 'ALL'); setPage(1); }}
        />
        <div style={{ flex: 1 }} />
        <SearchToolbar
          search={search}
          onSearch={v => { setSearch(v); setPage(1); }}
          placeholder="Search parcels…"
          activeFilterCount={activeFilterCount}
        />
      </div>

      <SectionCard collapsible={false} padded={false}>
        {loading ? <SectionLoading /> : parcels.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No parcels match your filters.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr>
                  <th>Parcel #</th><th>Sender</th><th>Recipient</th><th>Status</th><th>Created</th><th style={{ width: 40 }}></th>
                </tr></thead>
                <tbody>
                  {parcels.map(p => (
                    <React.Fragment key={p.id}>
                      <tr onClick={() => expandParcel(p.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 500 }}>{p.parcel_number}</td>
                        <td>{p.sender_name}</td>
                        <td>{p.recipient_name}</td>
                        <td><Badge variant={STATUS_BADGE[p.status] ?? 'gray'}>{p.status}</Badge></td>
                        <td style={{ color: 'var(--ink2)', fontSize: 13 }}>{formatDate(p.created_at)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {(TRANSITIONS[p.status]?.length ?? 0) > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="btn-icon" data-ui-native-button="" style={{ padding: 4 }}>
                                  <Icon name="moreVertical" size={16} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {p.status === 'RECEIVED' && (
                                  <DropdownMenuItem onClick={() => { setDispatchId(p.id); setDispatchVehicle(''); }}>
                                    <Icon name="truck" size={14} /> Dispatch
                                  </DropdownMenuItem>
                                )}
                                {p.status === 'DISPATCHED' && (
                                  <DropdownMenuItem onClick={() => doTransition(p.id, 'offload', {})}>
                                    <Icon name="download" size={14} /> Offload
                                  </DropdownMenuItem>
                                )}
                                {p.status === 'OFFLOADED' && (
                                  <>
                                    <DropdownMenuItem onClick={() => doTransition(p.id, 'deliver')}>
                                      <Icon name="checkCircle" size={14} /> Mark Delivered
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {TRANSITIONS[p.status]?.includes('CANCELED') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => { setCancelId(p.id); setCancelReason(''); }} style={{ color: 'var(--red)' }}>
                                      <Icon name="close" size={14} /> Cancel
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                      {expanded === p.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--surface, var(--bg))' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
                              <div><strong>Sender:</strong> {p.sender_name} ({p.sender_phone})</div>
                              <div><strong>Recipient:</strong> {p.recipient_name} ({p.recipient_phone})</div>
                              {p.weight && <div><strong>Weight:</strong> {p.weight} kg</div>}
                              {p.price && <div><strong>Price:</strong> {p.price}</div>}
                              {p.units > 1 && <div><strong>Units:</strong> {p.units}</div>}
                              {p.cancellation_reason && <div style={{ gridColumn: '1/-1', color: 'var(--red)' }}><strong>Cancellation:</strong> {p.cancellation_reason}</div>}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tracking</div>
                            {trackingLoading ? <SectionLoading /> : tracking.length === 0 ? (
                              <p style={{ color: 'var(--ink2)', fontSize: 13 }}>No tracking entries.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {tracking.map(t => (
                                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                                    <Badge variant={STATUS_BADGE[t.status] ?? 'gray'} style={{ minWidth: 90, textAlign: 'center' }}>{t.status}</Badge>
                                    <span style={{ color: 'var(--ink2)' }}>{formatDateTime(t.tracked_at)}</span>
                                    {t.description && <span>— {t.description}</span>}
                                    {t.location && <span style={{ color: 'var(--ink2)' }}>@ {t.location}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* ── Create Parcel Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="lg">
          <form onSubmit={handleCreate}>
            <DialogHeader><DialogTitle>Receive New Parcel</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Sender Name *
                  <Input value={form.sender_name} onChange={e => setForm(f => ({ ...f, sender_name: e.target.value }))} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Sender Phone *
                  <Input value={form.sender_phone} onChange={e => setForm(f => ({ ...f, sender_phone: e.target.value }))} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Recipient Name *
                  <Input value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Recipient Phone *
                  <Input value={form.recipient_phone} onChange={e => setForm(f => ({ ...f, recipient_phone: e.target.value }))} required />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Origin Office *
                  <select value={form.origin_office_id} onChange={e => setForm(f => ({ ...f, origin_office_id: e.target.value }))} required className="login-input" style={{ height: 38 }}>
                    <option value="">Select office…</option>
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Destination Office *
                  <select value={form.dest_office_id} onChange={e => setForm(f => ({ ...f, dest_office_id: e.target.value }))} required className="login-input" style={{ height: 38 }}>
                    <option value="">Select office…</option>
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Vehicle (optional)
                  <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} className="login-input" style={{ height: 38 }}>
                    <option value="">None</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Parcel Name
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Electronics box" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Weight (kg)
                  <Input type="number" step="0.1" min="0" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Price
                  <Input type="number" step="100" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  Units
                  <Input type="number" min="1" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
                </label>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Receive Parcel'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dispatch Dialog ── */}
      <Dialog open={!!dispatchId} onOpenChange={() => setDispatchId(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Dispatch Parcel</DialogTitle></DialogHeader>
          <DialogBody>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Assign Vehicle
              <select value={dispatchVehicle} onChange={e => setDispatchVehicle(e.target.value)} className="login-input" style={{ height: 38 }}>
                <option value="">Select vehicle…</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
              </select>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchId(null)}>Cancel</Button>
            <Button disabled={!dispatchVehicle} onClick={() => {
              if (dispatchId && dispatchVehicle) {
                doTransition(dispatchId, 'dispatch', { vehicle_id: dispatchVehicle });
                setDispatchId(null);
              }
            }}>Dispatch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Dialog ── */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel Parcel</DialogTitle></DialogHeader>
          <DialogBody>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Reason for cancellation
              <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Customer requested cancellation" />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>Back</Button>
            <Button variant="destructive" disabled={!cancelReason.trim()} onClick={() => {
              if (cancelId && cancelReason.trim()) {
                doTransition(cancelId, 'cancel', { reason: cancelReason.trim() });
                setCancelId(null);
              }
            }}>Confirm Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
