import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

interface Vehicle { id: string; name: string }
interface Driver { id: string; name: string }
interface Reminder {
  id: string; vehicle_id: string | null; driver_id: string | null; title: string;
  reminder_type: string; due_date: string; status: string; notes: string | null;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function AddReminderModal({ vehicles, drivers, onClose, onAdded }: {
  vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onAdded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [reminderType, setReminderType] = useState('CUSTOM');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title, reminder_type: reminderType, due_date: dueDate,
          vehicle_id: vehicleId || undefined, driver_id: driverId || undefined, notes,
        }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to add reminder'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a reminder</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={labelStyle}>Title</label><input required value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <Select value={reminderType} onValueChange={setReminderType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                  <SelectItem value="DOCUMENT">DOCUMENT</SelectItem>
                  <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Due date</label><DatePicker date={parseDateOnly(dueDate)} onChange={d => setDueDate(toDateOnlyString(d))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Vehicle</label>
              <Combobox
                options={[{ value: '', label: '— None —' }, ...vehicles.map(v => ({ value: v.id, label: v.name }))]}
                value={vehicleId} onChange={setVehicleId} placeholder="— None —"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Driver</label>
              <Combobox
                options={[{ value: '', label: '— None —' }, ...drivers.map(d => ({ value: d.id, label: d.name }))]}
                value={driverId} onChange={setDriverId} placeholder="— None —"
              />
            </div>
          </div>
          <div><label style={labelStyle}>Notes</label><input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} /></div>
          {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving || !title || !dueDate} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const TrackingReminders: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/reminders').then(setReminders).catch(() => setReminders([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/drivers').then(setDrivers).catch(() => setDrivers([]));
  }, [reload]);

  const vehicleName = (id: string | null) => vehicles.find(v => v.id === id)?.name;
  const driverName = (id: string | null) => drivers.find(d => d.id === id)?.name;

  async function setStatus(id: string, status: string) {
    await apiFetch(`/v1/tracking/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
  }

  const overdue = (date: string) => new Date(date).getTime() < Date.now();

  return (
    <div style={{ padding: 24 }}>
      {showAdd && <AddReminderModal vehicles={vehicles} drivers={drivers} onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Reminders</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Maintenance, document &amp; custom due dates</div>
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Icon name="bell" size={15} /> Add reminder
        </button>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Title', 'Type', 'Related to', 'Due', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && reminders.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{r.title}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{r.reminder_type}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{vehicleName(r.vehicle_id) || driverName(r.driver_id) || '—'}</td>
                <td style={{ padding: '10px 14px', color: r.status === 'PENDING' && overdue(r.due_date) ? '#dc2626' : 'var(--ink2)', fontWeight: r.status === 'PENDING' && overdue(r.due_date) ? 700 : 400 }}>
                  {new Date(r.due_date).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: r.status === 'DONE' ? '#ecfdf5' : r.status === 'DISMISSED' ? '#f1f5f9' : '#fef9c3', color: r.status === 'DONE' ? '#065f46' : r.status === 'DISMISSED' ? '#64748b' : '#ca8a04' }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.status === 'PENDING' && (
                    <>
                      <button type="button" onClick={() => setStatus(r.id, 'DONE')} style={{ fontSize: 11, fontWeight: 600, color: '#065f46', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Mark done</button>
                      <button type="button" onClick={() => setStatus(r.id, 'DISMISSED')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && reminders.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No reminders yet.</div>
        )}
      </div>
    </div>
  );
};
