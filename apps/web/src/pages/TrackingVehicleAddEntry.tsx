import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, DateTimePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { Tip } from '../components/ui/tooltip.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'combobox'; options?: { value: string; label: string }[]; required?: boolean; min?: number; placeholder?: string; hint?: string };

interface EntryType {
  title: string;
  description: string;
  submitLabel: string;
  successTab: string;
  fields: (drivers: { id: string; name: string }[]) => FieldDef[];
  submit: (vehicleId: string, values: Record<string, string>) => Promise<void>;
}

const ENTRY_TYPES: Record<string, EntryType> = {
  assignment: {
    title: 'Add vehicle assignment', description: 'Assign an available driver and preserve the assignment in this vehicle’s history.', submitLabel: 'Add assignment', successTab: 'Assignments',
    fields: drivers => [
      { key: 'driver_id', label: 'Driver', type: 'combobox', required: true, options: drivers.map(d => ({ value: d.id, label: d.name })), hint: 'Search the available fleet drivers.' },
      { key: 'start_time', label: 'Assignment starts', type: 'datetime-local', required: true, hint: 'The previous active assignment closes at this time.' },
      { key: 'end_time', label: 'Assignment ends (optional)', type: 'datetime-local', hint: 'Leave empty for an ongoing assignment.' },
      { key: 'labels', label: 'Labels', type: 'text', placeholder: 'e.g. Long haul, night shift' },
      { key: 'comment', label: 'Notes', type: 'textarea', placeholder: 'Assignment instructions or context…' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/assignments', { method: 'POST', body: JSON.stringify({ vehicle_id: id, driver_id: v.driver_id, start_time: v.start_time, end_time: v.end_time || undefined, labels: v.labels || undefined, comment: v.comment || undefined }) }); },
  },
  fuel: {
    title: 'Log fuel entry', description: 'Record a refuel, its cost, and the vehicle odometer at the pump.', submitLabel: 'Log fuel entry', successTab: 'Fuel',
    fields: () => [
      { key: 'liters', label: 'Liters', type: 'number', required: true, min: 0 },
      { key: 'cost', label: 'Cost', type: 'number', min: 0 },
      { key: 'odometer_km', label: 'Odometer (km)', type: 'number', min: 0, hint: 'Use the dashboard reading at the time of refuelling.' },
      { key: 'station', label: 'Station', type: 'text' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/fuel', { method: 'POST', body: JSON.stringify({ vehicle_id: id, liters: Number(v.liters), cost: v.cost ? Number(v.cost) : undefined, odometer_km: v.odometer_km ? Number(v.odometer_km) : undefined, station: v.station }) }); },
  },
  expense: {
    title: 'Add expense entry', description: 'Capture a vehicle-specific operating expense for cost reporting.', submitLabel: 'Add expense', successTab: 'Expenses',
    fields: () => [
      { key: 'category', label: 'Category', type: 'select', options: ['TOLL', 'PARKING', 'FINE', 'WASH', 'OTHER'].map(c => ({ value: c, label: c })) },
      { key: 'amount', label: 'Amount', type: 'number', required: true, min: 0 },
      { key: 'expense_date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/expenses`, { method: 'POST', body: JSON.stringify({ category: v.category, amount: Number(v.amount), expense_date: v.expense_date || undefined, description: v.description }) }); },
  },
  service: {
    title: 'Log service entry', description: 'Record completed maintenance and optionally schedule its next due date.', submitLabel: 'Log service', successTab: 'Service History',
    fields: () => [
      { key: 'service_type', label: 'Service type', type: 'text', required: true },
      { key: 'description', label: 'Work completed', type: 'textarea', placeholder: 'Parts replaced, work performed, observations…' },
      { key: 'cost', label: 'Cost', type: 'number', min: 0 },
      { key: 'odometer_km', label: 'Odometer (km)', type: 'number', min: 0 },
      { key: 'service_date', label: 'Service date', type: 'date' },
      { key: 'next_due_date', label: 'Next due date', type: 'date' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/maintenance', { method: 'POST', body: JSON.stringify({ vehicle_id: id, service_type: v.service_type, description: v.description, cost: v.cost ? Number(v.cost) : undefined, odometer_km: v.odometer_km ? Number(v.odometer_km) : undefined, service_date: v.service_date || undefined, next_due_date: v.next_due_date || undefined, status: 'COMPLETED' }) }); },
  },
  issue: {
    title: 'Report an issue', description: 'Create a trackable vehicle problem for the fleet operations team.', submitLabel: 'Report issue', successTab: 'Issues',
    fields: () => [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'severity', label: 'Priority', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => ({ value: s, label: s })) },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/issues`, { method: 'POST', body: JSON.stringify({ title: v.title, severity: v.severity, description: v.description }) }); },
  },
  reminder: {
    title: 'Add service reminder', description: 'Schedule a maintenance alert for this vehicle.', submitLabel: 'Add reminder', successTab: 'Overview',
    fields: () => [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'due_date', label: 'Due date', type: 'date', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What should be checked or serviced?' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/reminders', { method: 'POST', body: JSON.stringify({ vehicle_id: id, title: v.title, reminder_type: 'MAINTENANCE', due_date: v.due_date, notes: v.notes }) }); },
  },
  inspection: {
    title: 'Submit a vehicle inspection', description: 'Record a completed safety or roadworthiness inspection in the service history.', submitLabel: 'Submit inspection', successTab: 'Service History',
    fields: () => [
      { key: 'inspection_type', label: 'Inspection type', type: 'select', required: true, options: [
        { value: 'PRE_TRIP_INSPECTION', label: 'Pre-trip inspection' },
        { value: 'POST_TRIP_INSPECTION', label: 'Post-trip inspection' },
        { value: 'SAFETY_INSPECTION', label: 'Safety inspection' },
        { value: 'ROADWORTHINESS_INSPECTION', label: 'Roadworthiness inspection' },
      ] },
      { key: 'service_date', label: 'Inspection date', type: 'date', required: true },
      { key: 'odometer_km', label: 'Odometer (km)', type: 'number', min: 0 },
      { key: 'result', label: 'Result', type: 'select', required: true, options: [
        { value: 'PASSED', label: 'Passed' }, { value: 'ATTENTION_REQUIRED', label: 'Attention required' }, { value: 'FAILED', label: 'Failed' },
      ] },
      { key: 'description', label: 'Inspection findings', type: 'textarea', placeholder: 'Checklist findings, defects, or corrective action required…' },
      { key: 'next_due_date', label: 'Next inspection due', type: 'date' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/maintenance', { method: 'POST', body: JSON.stringify({ vehicle_id: id, service_type: v.inspection_type, description: [v.result, v.description].filter(Boolean).join(' — '), odometer_km: v.odometer_km ? Number(v.odometer_km) : undefined, service_date: v.service_date, next_due_date: v.next_due_date || undefined, status: 'COMPLETED' }) }); },
  },
  workorder: {
    title: 'Create a work order', description: 'Schedule maintenance work and keep it visible in the vehicle service history.', submitLabel: 'Create work order', successTab: 'Service History',
    fields: () => [
      { key: 'service_type', label: 'Work order type', type: 'text', required: true, placeholder: 'e.g. Brake repair' },
      { key: 'description', label: 'Work requested', type: 'textarea', required: true, placeholder: 'Describe the fault, requested work, and parts needed…' },
      { key: 'service_date', label: 'Scheduled date', type: 'date', required: true },
      { key: 'estimated_cost', label: 'Estimated cost', type: 'number', min: 0 },
      { key: 'odometer_km', label: 'Current odometer (km)', type: 'number', min: 0 },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/maintenance', { method: 'POST', body: JSON.stringify({ vehicle_id: id, service_type: v.service_type, description: v.description, cost: v.estimated_cost ? Number(v.estimated_cost) : undefined, odometer_km: v.odometer_km ? Number(v.odometer_km) : undefined, service_date: v.service_date, status: 'SCHEDULED' }) }); },
  },
  renewal: {
    title: 'Add a vehicle renewal reminder', description: 'Track an upcoming registration, insurance, permit, or inspection renewal.', submitLabel: 'Add renewal reminder', successTab: 'Overview',
    fields: () => [
      { key: 'renewal_type', label: 'Renewal type', type: 'select', required: true, options: [
        { value: 'REGISTRATION', label: 'Vehicle registration' }, { value: 'INSURANCE', label: 'Insurance' },
        { value: 'ROAD_LICENCE', label: 'Road licence' }, { value: 'INSPECTION', label: 'Inspection certificate' },
        { value: 'PERMIT', label: 'Operating permit' }, { value: 'OTHER', label: 'Other renewal' },
      ] },
      { key: 'title', label: 'Reminder title', type: 'text', required: true, placeholder: 'e.g. Renew comprehensive insurance' },
      { key: 'due_date', label: 'Renewal due date', type: 'date', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Provider, policy or document reference, requirements…' },
    ],
    submit: async (id, v) => { await apiFetch('/v1/tracking/reminders', { method: 'POST', body: JSON.stringify({ vehicle_id: id, title: v.title, reminder_type: 'DOCUMENT', due_date: v.due_date, notes: [`Renewal type: ${v.renewal_type}`, v.notes].filter(Boolean).join('\n') }) }); },
  },
  meter: {
    title: 'Add meter entry', description: 'Update the vehicle odometer and preserve the reading in its meter history.', submitLabel: 'Add reading', successTab: 'Overview',
    fields: () => [{ key: 'reading_km', label: 'Odometer reading (km)', type: 'number', required: true, min: 0 }],
    submit: async (id, v) => { await apiFetch(`/v1/tracking/vehicles/${id}/meter-readings`, { method: 'POST', body: JSON.stringify({ reading_km: Number(v.reading_km) }) }); },
  },
};

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 };

function toLocalDateTimeString(date: Date | undefined): string {
  if (!date) return '';
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

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
      if (type === 'assignment' && next.start_time === undefined) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        next.start_time = now.toISOString().slice(0, 16);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, drivers.length]);

  if (!id || !config) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Unknown entry type.</div>;

  const fields = config.fields(drivers);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missingField = fields.find(field => field.required && !values[field.key]?.trim());
    if (missingField) {
      setError(`${missingField.label} is required.`);
      return;
    }
    if (type === 'assignment' && values.end_time && values.end_time <= values.start_time) {
      setError('Assignment end must be later than its start.');
      return;
    }
    setSaving(true); setError('');
    try {
      await config!.submit(id!, values);
      navigate(`/tracking/vehicles/${id}?tab=${encodeURIComponent(config!.successTab)}&created=${encodeURIComponent(type || 'entry')}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['HuduFreight', 'Add Entry']}
        title={config.title}
        subtitle={config.description}
        variant="create"
        backTo={`/tracking/vehicles/${id}`}
      />

      <div style={{ maxWidth: 720 }}>
      <SectionCard collapsible={false}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={labelStyle}>
              {f.label}{f.required && <span aria-hidden="true" style={{ color: 'var(--red)' }}>*</span>}
              {f.hint && (
                <Tip label={f.hint} side="right">
                  <button type="button" aria-label={`About ${f.label}`} style={{ display: 'inline-flex', padding: 0, border: 0, background: 'transparent', color: 'var(--ink3)', cursor: 'help' }}>
                    <Icon name="info" size={13} />
                  </button>
                </Tip>
              )}
            </label>
            {f.type === 'select' ? (
              <Select
                value={values[f.key] || '__none__'}
                onValueChange={v => setValues(vals => ({ ...vals, [f.key]: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder={f.options?.length ? `Select ${f.label.toLowerCase()}` : 'No available options'} /></SelectTrigger>
                <SelectContent>
                  {!f.options?.length && <SelectItem value="__unavailable__" disabled>No available options</SelectItem>}
                  {f.options?.map(o => <SelectItem key={o.value || '__none__'} value={o.value || '__none__'}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : f.type === 'combobox' ? (
              <Combobox
                options={f.options || []}
                value={values[f.key] || ''}
                onChange={value => setValues(vals => ({ ...vals, [f.key]: value }))}
                placeholder={`Select ${f.label.toLowerCase()}`}
                searchPlaceholder={`Search ${f.label.toLowerCase()}…`}
                emptyText="No available drivers."
              />
            ) : f.type === 'date' ? (
              <DatePicker
                date={parseDateOnly(values[f.key])}
                onChange={date => setValues(vals => ({ ...vals, [f.key]: toDateOnlyString(date) }))}
                placeholder={`Select ${f.label.toLowerCase()}`}
              />
            ) : f.type === 'datetime-local' ? (
              <DateTimePicker
                date={values[f.key] ? new Date(values[f.key]) : undefined}
                onChange={date => setValues(vals => ({ ...vals, [f.key]: toLocalDateTimeString(date) }))}
                placeholder={`Select ${f.label.toLowerCase()}`}
              />
            ) : f.type === 'textarea' ? (
              <Textarea required={f.required} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className="min-h-24 resize-y" />
            ) : (
              <Input required={f.required} min={f.min} placeholder={f.placeholder} type={f.type} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
            )}
          </div>
        ))}
        {error && <Banner variant="error" title="Couldn’t save entry" onDismiss={() => setError('')}>{error}</Banner>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button type="button" variant="outline" asChild><Link to={`/tracking/vehicles/${id}`}>Cancel</Link></Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : config.submitLabel}</Button>
        </div>
      </form>
      </SectionCard>
      </div>
    </div>
  );
};
