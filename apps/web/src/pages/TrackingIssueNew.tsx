import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { BackButton } from '../components/ui/BackButton.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface StaffUser { id: string; name: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const TrackingIssueNew: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [source, setSource] = useState('Manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then((rows: Vehicle[]) => { setVehicles(rows); if (rows[0]) setVehicleId(rows[0].id); }).catch(() => setVehicles([]));
    apiFetch('/v1/oneid/users').then(setStaff).catch(() => setStaff([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) { setError('Select a vehicle'); return; }
    setSaving(true); setError('');
    try {
      const created = await apiFetch(`/v1/tracking/vehicles/${vehicleId}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title, severity, description: description || undefined,
          assigned_to: assignedTo || undefined, due_date: dueDate || undefined, source,
        }),
      });
      navigate(`/tracking/issues/${created.id}`);
    } catch (err: any) { setError(err.message || 'Failed to report issue'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <BackButton to="/tracking/issues" label="Issues" />
      <PageHeader
        crumbs={['HuduFreight', 'Report Issue']}
        titlePlain="Report an"
        titleEm="issue"
      />

      <SectionCard>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Vehicle</label>
          <Combobox
            options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
            value={vehicleId} onChange={setVehicleId} placeholder="Select vehicle…"
          />
        </div>
        <div><label style={labelStyle}>Title</label><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chip in windshield" style={inputStyle} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Manual', 'Driver Report', 'Inspection'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Assign To</label>
            <Combobox
              options={[{ value: '', label: 'Unassigned' }, ...staff.map(s => ({ value: s.id, label: s.name }))]}
              value={assignedTo} onChange={setAssignedTo} placeholder="Unassigned"
            />
          </div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Due Date</label><DatePicker date={parseDateOnly(dueDate)} onChange={d => setDueDate(toDateOnlyString(d))} /></div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to="/tracking/issues" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {saving ? 'Saving…' : 'Report Issue'}
          </button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
