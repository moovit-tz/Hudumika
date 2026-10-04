import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Combobox } from '../components/ui/combobox.js';
import { DateTimePicker } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Textarea } from '../components/ui/textarea.js';

/** Format a Date to "YYYY-MM-DDTHH:mm" in local time — same shape a native
 *  <input type="datetime-local"> value had, so the existing string-based
 *  form state and JSON.stringify(form) POST body keep working unchanged. */
const toLocalDateTimeString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Vehicle {
  id: string;
  name: string;
  plate_number: string | null;
  photo_url: string | null;
}

interface Assignment {
  id: string;
  vehicle_id: string;
  driver_id: string;
  driver_name: string;
  driver_avatar_url: string | null;
  start_time: string;
  end_time: string | null;
  labels: string | null;
  comment: string | null;
}

export const TrackingAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState('');

  const fetchAssignments = async () => {
    try {
      const data = await apiFetch('/v1/tracking/assignments');
      setAssignments(data);
      // Fetch vehicles for the left column
      const vData = await apiFetch('/v1/tracking/vehicles');
      setVehicles(vData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const nextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const prevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };
  const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 9);
  const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 16);
  const filteredVehicles = vehicles.filter(vehicle => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const drivers = assignments.filter(a => a.vehicle_id === vehicle.id).map(a => a.driver_name).join(' ');
    return [vehicle.name, vehicle.plate_number ?? '', drivers].some(value => value.toLowerCase().includes(q));
  });

  return (
    <div style={{ padding: '0 0 24px', background: 'transparent', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Assignments']}
        titlePlain="Driver"
        titleEm="assignments"
        subtitle="Which driver is on which vehicle, and from when."
      />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SearchToolbar className="w-full xl:max-w-xl" search={search} onSearch={setSearch} placeholder="Search vehicles, plates, or drivers…" actions={<Button size="sm" onClick={() => setShowAddModal(true)}>Add assignment</Button>} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button type="button" variant="ghost" size="icon" onClick={prevDay} aria-label="Previous day"><Icon name="chevronLeft" size={16} /></Button>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', width: 140, textAlign: 'center' }}>{formatDate(currentDate)}</div>
            <Button type="button" variant="ghost" size="icon" onClick={nextDay} aria-label="Next day"><Icon name="chevronRight" size={16} /></Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
        </div>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ width: 250, padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>Vehicles</div>
          <div style={{ flex: 1, display: 'flex' }}>
            {['09:00am', '10:00am', '11:00am', '12:00pm', '01:00pm', '02:00pm', '03:00pm'].map(t => (
              <div key={t} style={{ flex: 1, padding: '12px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ink3)', borderRight: '1px solid var(--border)' }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <SectionLoading />
          ) : (
            filteredVehicles.map((v) => {
              const vAssignments = assignments.filter(a => {
                if (a.vehicle_id !== v.id) return false;
                const start = new Date(a.start_time);
                const end = a.end_time ? new Date(a.end_time) : dayEnd;
                return start < dayEnd && end > dayStart;
              });
              return (
                <div key={v.id} style={{ display: 'flex', minHeight: Math.max(72, 16 + vAssignments.length * 48), borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 250, padding: '16px', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="truck" size={20} color="var(--ink3)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{v.plate_number || 'No Plate'}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    {/* Background grid */}
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex' }}>
                      {[0,1,2,3,4,5,6].map(x => <div key={x} style={{ flex: 1, borderRight: '1px solid var(--border)' }} />)}
                    </div>
                    {/* Assignment bars */}
                    {vAssignments.map((a, j) => {
                      const colors = ['#e0e7ff', '#ecfdf5', '#fce7f3', '#fef3c7'];
                      const textColors = ['#3730a3', '#065f46', '#9d174d', '#92400e'];
                      const cIdx = j % colors.length;
                      const start = Math.max(dayStart.getTime(), new Date(a.start_time).getTime());
                      const end = Math.min(dayEnd.getTime(), a.end_time ? new Date(a.end_time).getTime() : dayEnd.getTime());
                      const span = dayEnd.getTime() - dayStart.getTime();
                      const left = ((start - dayStart.getTime()) / span) * 100;
                      const width = Math.max(4, ((end - start) / span) * 100);
                      return (
                        <div key={a.id} style={{ position: 'absolute', zIndex: 1, left: `${left}%`, width: `${width}%`, top: 8 + j * 48, background: colors[cIdx], borderRadius: 'var(--r-sm)', padding: '8px 12px', minWidth: 90, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: textColors[cIdx] }}>
                            <PersonAvatar userId={a.driver_id} kind="drivers" name={a.driver_name} size={18} />
                            {a.driver_name}
                          </div>
                          <div style={{ fontSize: 10, color: textColors[cIdx], opacity: 0.8 }}>
                            {new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{a.end_time ? new Date(a.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ongoing'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          {!loading && filteredVehicles.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No vehicles match this search.</div>}
        </div>
      </div>

      {showAddModal && <AddAssignmentModal onClose={() => setShowAddModal(false)} onSave={() => { setShowAddModal(false); fetchAssignments(); }} />}
    </div>
  );
};

const AddAssignmentModal = ({ onClose, onSave }: { onClose: () => void, onSave: () => void }) => {
  const [form, setForm] = useState({ vehicle_id: '', driver_id: '', start_time: '', end_time: '', comment: '' });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<{id: string, name: string}[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles);
    apiFetch('/v1/tracking/drivers').then(setDrivers);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/v1/tracking/assignments', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onSave();
    } catch (e: any) {
      showAlert(e.message || 'Error adding assignment');
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-100 gap-0" style={{ borderRadius: 'var(--r)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <DialogTitle style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Add Assignment</DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Assign Vehicle *</label>
            <Combobox
              options={vehicles.map(v => ({ value: v.id, label: v.name }))}
              value={form.vehicle_id} onChange={v => setForm({...form, vehicle_id: v})} placeholder="Please select"
            />
          </div>
          <div>
            <label style={labelStyle}>Operator *</label>
            <Combobox
              options={drivers.map(d => ({ value: d.id, label: d.name }))}
              value={form.driver_id} onChange={v => setForm({...form, driver_id: v})} placeholder="Please select"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Start Date/Time *</label>
              <DateTimePicker
                date={form.start_time ? new Date(form.start_time) : undefined}
                onChange={d => setForm({ ...form, start_time: d ? toLocalDateTimeString(d) : '' })}
                triggerClassName="w-full"
              />
            </div>
            <div>
              <label style={labelStyle}>End Date/Time</label>
              <DateTimePicker
                date={form.end_time ? new Date(form.end_time) : undefined}
                onChange={d => setForm({ ...form, end_time: d ? toLocalDateTimeString(d) : '' })}
                triggerClassName="w-full"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Add a comment</label>
            <Textarea className="min-h-20" placeholder="Type here" value={form.comment} onChange={e => setForm({...form, comment: e.target.value})} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !form.vehicle_id || !form.driver_id || !form.start_time}>
            {saving ? 'Saving...' : 'Save Assignment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
