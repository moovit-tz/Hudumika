import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'date' | 'textarea' | 'select'; options?: { value: string; label: string }[]; required?: boolean };

interface EntryType {
  title: string;
  submitLabel: string;
  fields: (drivers: { id: string; name: string }[]) => FieldDef[];
  submit: (vehicleId: string, values: Record<string, string>) => Promise<void>;
}

const ENTRY_TYPES: Record<string, EntryType> = {
  assignment: {
    title: 'Assign a driver', submitLabel: 'Assign',
    fields: drivers => [{ key: 'driver_id', label: 'Driver', type: 'select', options: [{ value: '', label: '— Unassign —' }, ...drivers.map(d => ({ value: d.id, label: d.name }))] }],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/assignment`, { method: 'PATCH', body: JSON.stringify({ driver_id: v.driver_id || null }) }); },
  },
  fuel: {
    title: 'Log fuel entry', submitLabel: 'Log fuel entry',
    fields: () => [
      { key: 'liters', label: 'Liters', type: 'number', required: true },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'odometer_km', label: 'Odometer (km)', type: 'number' },
      { key: 'station', label: 'Station', type: 'text' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/fuel', { method: 'POST', body: JSON.stringify({ vehicle_id: id, liters: Number(v.liters), cost: v.cost ? Number(v.cost) : undefined, odometer_km: v.odometer_km ? Number(v.odometer_km) : undefined, station: v.station }) }); },
  },
  expense: {
    title: 'Add expense entry', submitLabel: 'Add expense',
    fields: () => [
      { key: 'category', label: 'Category', type: 'select', options: ['TOLL', 'PARKING', 'FINE', 'WASH', 'OTHER'].map(c => ({ value: c, label: c })) },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'expense_date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/expenses`, { method: 'POST', body: JSON.stringify({ category: v.category, amount: Number(v.amount), expense_date: v.expense_date || undefined, description: v.description }) }); },
  },
  service: {
    title: 'Log service entry', submitLabel: 'Log service',
    fields: () => [
      { key: 'service_type', label: 'Service type', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'service_date', label: 'Service date', type: 'date' },
      { key: 'next_due_date', label: 'Next due date', type: 'date' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/maintenance', { method: 'POST', body: JSON.stringify({ vehicle_id: id, service_type: v.service_type, cost: v.cost ? Number(v.cost) : undefined, service_date: v.service_date || undefined, next_due_date: v.next_due_date || undefined }) }); },
  },
  issue: {
    title: 'Report an issue', submitLabel: 'Report issue',
    fields: () => [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'severity', label: 'Priority', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => ({ value: s, label: s })) },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/issues`, { method: 'POST', body: JSON.stringify({ title: v.title, severity: v.severity, description: v.description }) }); },
  },
  reminder: {
    title: 'Add service reminder', submitLabel: 'Add reminder',
    fields: () => [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'due_date', label: 'Due date', type: 'date', required: true },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/reminders', { method: 'POST', body: JSON.stringify({ vehicle_id: id, title: v.title, reminder_type: 'MAINTENANCE', due_date: v.due_date }) }); },
  },
  meter: {
    title: 'Add meter entry', submitLabel: 'Add reading',
    fields: () => [{ key: 'reading_km', label: 'Odometer reading (km)', type: 'number', required: true }],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/meter-readings`, { method: 'POST', body: JSON.stringify({ reading_km: Number(v.reading_km) }) }); },
  },
};

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24, maxWidth: 520 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const TrackingVehicleAddEntry: React.FC = () => {
  const { id, type } = useParams<{ id: string; type: string }>();
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const config = type ? ENTRY_TYPES[type] : undefined;

  useEffect(() => {
    if (type === 'assignment') apiFetch('/v1/tracking/drivers').then(setDrivers).catch(() => setDrivers([]));
  }, [type]);

  useEffect(() => {
    if (!config) return;
    const fields = config.fields(drivers);
    setValues(init => {
      const next = { ...init };
      for (const f of fields) if (f.type === 'select' && f.options?.[0] && next[f.key] === undefined) next[f.key] = f.options[0].value;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, drivers.length]);

  if (!id || !config) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Unknown entry type.</div>;

  const fields = config.fields(drivers);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await config!.submit(id!, values);
      navigate(`/tracking/vehicles/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <Link to={`/tracking/vehicles/${id}`} style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Back to Vehicle
      </Link>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 20 }}>{config.title}</div>

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={labelStyle}>{f.label}</label>
            {f.type === 'select' ? (
              <Select
                value={values[f.key] || '__none__'}
                onValueChange={v => setValues(vals => ({ ...vals, [f.key]: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {f.options?.map(o => <SelectItem key={o.value || '__none__'} value={o.value || '__none__'}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.type === 'textarea' ? (
              <textarea required={f.required} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
            ) : (
              <input required={f.required} type={f.type} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} style={inputStyle} />
            )}
          </div>
        ))}
        {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to={`/tracking/vehicles/${id}`} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : config.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
