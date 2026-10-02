import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface Appointment {
  id: string;
  appointment_type: 'INBOUND' | 'OUTBOUND';
  vehicle_plate: string | null;
  driver_name: string | null;
  driver_id: string | null;
  consignment_id: string | null;
  consignment_ref: string | null;
  scheduled_at: string;
  status: string;
  notes: string | null;
  compartment_id: string;
  compartment_name: string | null;
}

const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'gray'> = {
  SCHEDULED: 'brand',
  CHECKED_IN: 'warning',
  AT_DOCK: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
  NO_SHOW: 'gray',
};

const BLANK_FORM = {
  appointment_type: 'INBOUND' as 'INBOUND' | 'OUTBOUND',
  vehicle_plate: '',
  driver_name: '',
  scheduled_date: new Date(),
  scheduled_time: '09:00',
  notes: '',
};

export function SealAppointments() {
  const [compartmentId] = useSealCompartmentId();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(new Date());
  const [form, setForm] = useState({ ...BLANK_FORM });

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    if (dateFilter) params.set('date', toDateOnlyString(dateFilter));
    apiFetch(`/v1/seal/appointments?${params}`)
      .then((r: any) => setAppointments(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [compartmentId, dateFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_plate.trim() && !form.driver_name.trim()) {
      showAlert('Enter a vehicle plate or driver name.'); return;
    }
    setSaving(true);
    const scheduledAt = new Date(form.scheduled_date);
    const [h, m] = form.scheduled_time.split(':').map(Number);
    scheduledAt.setHours(h, m, 0, 0);
    try {
      await apiFetch('/v1/seal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: compartmentId ?? undefined,
          appointmentType: form.appointment_type,
          vehiclePlate: form.vehicle_plate.trim() || null,
          driverName: form.driver_name.trim() || null,
          scheduledAt: scheduledAt.toISOString(),
          notes: form.notes.trim() || null,
        }),
      });
      setShowNew(false);
      setForm({ ...BLANK_FORM });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create appointment.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await apiFetch(`/v1/seal/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch (err: any) {
      showAlert(err.message || 'Failed to update appointment.');
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  const inbound = appointments.filter(a => a.appointment_type === 'INBOUND');
  const outbound = appointments.filter(a => a.appointment_type === 'OUTBOUND');
  const pending = appointments.filter(a => ['SCHEDULED', 'CHECKED_IN', 'AT_DOCK'].includes(a.status));

  return (
    <div className="seal-page">
      {showNew && (
        <Dialog open onOpenChange={o => { if (!o) setShowNew(false); }}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>New Appointment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate}>
              <DialogBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Type</label>
                      <Select value={form.appointment_type} onValueChange={v => setForm(f => ({ ...f, appointment_type: v as 'INBOUND' | 'OUTBOUND' }))}>
                        <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INBOUND">Inbound</SelectItem>
                          <SelectItem value="OUTBOUND">Outbound</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={lbl}>Scheduled Date</label>
                      <DatePicker date={form.scheduled_date} onChange={d => d && setForm(f => ({ ...f, scheduled_date: d }))} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Time</label>
                      <input type="time" style={inp} value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Vehicle Plate</label>
                      <input type="text" style={inp} value={form.vehicle_plate} onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))} placeholder="T123 ABC" />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Driver Name</label>
                    <input type="text" style={inp} value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="John Doe" />
                  </div>
                  <div>
                    <label style={lbl}>Notes</label>
                    <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Appointment'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <PageHeader
        crumbs={['SEAL', 'Gate & Receiving', 'Appointments']}
        titlePlain="Gate"
        titleEm="appointments"
        subtitle="Schedule and manage vehicle gate passes — inbound receipts and outbound dispatches."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Appointment</Button>}
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Today Total', value: appointments.length, color: 'var(--teal)' },
          { label: 'Active / Pending', value: pending.length, color: 'var(--gold)' },
          { label: 'Inbound', value: inbound.length, color: 'var(--blue)' },
          { label: 'Outbound', value: outbound.length, color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} className="seal-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Showing:</span>
        <DatePicker date={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? <SectionLoading /> : appointments.length === 0 ? (
            <div className="seal-empty">No appointments for this date.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Consignment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <Badge variant={a.appointment_type === 'INBOUND' ? 'brand' : 'info'}>
                        {a.appointment_type}
                      </Badge>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{a.vehicle_plate ?? '—'}</td>
                    <td>
                      {a.driver_name ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <PersonAvatar userId={a.driver_id} kind="drivers" name={a.driver_name} size={22} />
                          {a.driver_name}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{a.consignment_ref ?? '—'}</td>
                    <td><Badge variant={STATUS_VARIANT[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {a.status === 'SCHEDULED' && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateStatus(a.id, 'CHECKED_IN')}>Check In</button>
                        )}
                        {a.status === 'CHECKED_IN' && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateStatus(a.id, 'COMPLETED')}>Complete</button>
                        )}
                        {['SCHEDULED', 'CHECKED_IN'].includes(a.status) && (
                          <button type="button" className="btn btn-sm" style={{ background: 'var(--red-l)', color: 'var(--red)', border: 'none' }}
                            onClick={() => updateStatus(a.id, 'CANCELLED')}>
                            Cancel
                          </button>
                        )}
                      </div>
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
