import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';

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

  return (
    <div style={{ padding: 24, background: 'var(--bg)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        crumbs={['HuduFreight', 'Assignments']}
        titlePlain="Driver"
        titleEm="assignments"
        subtitle="Which driver is on which vehicle, and from when."
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>Vehicle Assignments</div>
        <button onClick={() => setShowAddModal(true)} style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: 'var(--ds-btn-py-lg) 16px', borderRadius: 'var(--r)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          Add Assignment
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink3)' }}>
            <Icon name="search" size={14} /> Search
          </div>
          <button style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
            <Icon name="filter" size={14} /> Filters
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="chevronLeft" size={16} /></button>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', width: 140, textAlign: 'center' }}>{formatDate(currentDate)}</div>
            <button onClick={nextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="chevronRight" size={16} /></button>
          </div>
          <div style={{ display: 'flex', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', background: 'var(--bg)', border: 'none', borderRight: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>Today</button>
            <button style={{ padding: 'var(--ds-btn-py-sm) 12px', background: 'var(--white)', border: 'none', fontSize: 12, fontWeight: 600, color: 'var(--ink3)', cursor: 'pointer' }}>Day <Icon name="chevronDown" size={10} /></button>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading...</div>
          ) : (
            vehicles.map((v, i) => {
              const vAssignments = assignments.filter(a => a.vehicle_id === v.id);
              // Simple mock visualization logic
              return (
                <div key={v.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 250, padding: '16px', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                      return (
                        <div key={a.id} style={{ position: 'relative', zIndex: 1, marginLeft: 20 + (j*100), background: colors[cIdx], borderRadius: 6, padding: '8px 12px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: textColors[cIdx] }}>{a.driver_name}</div>
                          <div style={{ fontSize: 10, color: textColors[cIdx], opacity: 0.8 }}>
                            {new Date(a.start_time).toLocaleDateString()} - {a.end_time ? new Date(a.end_time).toLocaleDateString() : 'Ongoing'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
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

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Add Assignment</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={20} /></button>
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
              <input type="datetime-local" style={inputStyle} value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} />
            </div>
            <div>
              <label style={labelStyle}>End Date/Time</label>
              <input type="datetime-local" style={inputStyle} value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Add a comment</label>
            <textarea style={{...inputStyle, minHeight: 80}} placeholder="Type here" value={form.comment} onChange={e => setForm({...form, comment: e.target.value})} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'transparent', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.vehicle_id || !form.driver_id || !form.start_time} style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (saving || !form.vehicle_id || !form.driver_id || !form.start_time) ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
};
