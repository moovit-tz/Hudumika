import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { useVehicleMakes, useVehicleModels } from '../hooks/useVehicleMakeModel.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';

// Rough mapping from this form's vehicle Type to NHTSA vPIC's vehicle-type
// categories — used only to seed the Make picker with relevant suggestions.
function vpicTypeFor(type: string): string {
  if (type === 'VAN') return 'multipurpose passenger vehicle (mpv)';
  if (type === 'MOTORBIKE') return 'motorcycle';
  if (type === 'Car') return 'car';
  return 'truck';
}

const SECTIONS = ['Details', 'Maintenance', 'Lifecycle', 'Financial', 'Specifications', 'Settings'];

export const TrackingNewVehicle: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('Details');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({
    name: '', type: 'Car', status: 'ACTIVE', ownership: 'OWNED',
    vin: '', year: '', make: '', model: '', trim: '', color: '',
    plate_number: '', device_id: '',
    purchase_vendor: '', purchase_date: '', purchase_price: '', initial_odometer: '', financing_type: 'NONE',
    in_service_date: '', in_service_odometer: '',
    est_life_months: '', est_life_meter: '', est_resale_value: '',
    out_of_service_date: '', out_of_service_odometer: '',
    fuel_type: 'DIESEL',
  });

  const { makes, loading: makesLoading } = useVehicleMakes(vpicTypeFor(form.type));
  const { models } = useVehicleModels(form.make);

  const handleChange = (field: string, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = async () => {
    if (!form.name || !form.device_id) {
      showAlert("Vehicle Name and Device ID are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      ['year', 'purchase_price', 'initial_odometer', 'in_service_odometer', 'est_life_months', 'est_life_meter', 'est_resale_value', 'out_of_service_odometer'].forEach(k => {
        if (payload[k]) payload[k] = Number(payload[k]);
        else delete payload[k];
      });
      ['purchase_date', 'in_service_date', 'out_of_service_date'].forEach(k => {
        if (!payload[k]) delete payload[k];
      });
      
      const res = await apiFetch('/v1/tracking/vehicles', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.id) {
        navigate(`/tracking/vehicles/${res.id}`);
      }
    } catch (e: any) {
      showAlert(e.message || "Error saving vehicle.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: 14, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)'
  };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="arrowLeft" size={16} color="var(--ink3)" />
          </button>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>New Vehicle</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Multiple Vehicles
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Vehicle'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 240, background: 'var(--white)', borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SECTIONS.map(sec => (
            <button key={sec} type="button" onClick={() => setActiveSection(sec)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: activeSection === sec ? 'var(--teal-l)' : 'transparent',
                color: activeSection === sec ? 'var(--teal)' : 'var(--ink2)',
                fontWeight: activeSection === sec ? 700 : 500, fontSize: 13, textAlign: 'left'
              }}>
              <Icon name={sec === 'Details' ? 'fileText' : sec === 'Maintenance' ? 'tool' : sec === 'Lifecycle' ? 'refreshCw' : sec === 'Financial' ? 'dollarSign' : sec === 'Specifications' ? 'settings' : 'sliders'} size={16} />
              {sec}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          <div style={{ maxWidth: 700, margin: '0 auto', background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border)', padding: 32 }}>
            
            {activeSection === 'Details' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Add with a VIN</div>
                  <label style={labelStyle}>VIN/SN</label>
                  <input style={inputStyle} placeholder="Vehicle Identification Number or Serial Number" value={form.vin} onChange={e => handleChange('vin', e.target.value)} />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Identification</div>
                  
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Vehicle Name <span style={{color: '#dc2626'}}>*</span></label>
                    <input style={inputStyle} placeholder="Enter a nickname to distinguish this vehicle in fleet" value={form.name} onChange={e => handleChange('name', e.target.value)} />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Device ID <span style={{color: '#dc2626'}}>*</span></label>
                    <input style={inputStyle} placeholder="GPS/Telematics Device ID" value={form.device_id} onChange={e => handleChange('device_id', e.target.value)} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Type <span style={{color: '#dc2626'}}>*</span></label>
                      <Select value={form.type} onValueChange={v => handleChange('type', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Car">Car</SelectItem>
                          <SelectItem value="TRUCK">Truck</SelectItem>
                          <SelectItem value="VAN">Van</SelectItem>
                          <SelectItem value="MOTORBIKE">Motorbike</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={labelStyle}>Status <span style={{color: '#dc2626'}}>*</span></label>
                      <Select value={form.status} onValueChange={v => handleChange('status', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Ownership <span style={{color: '#dc2626'}}>*</span></label>
                      <Select value={form.ownership} onValueChange={v => handleChange('ownership', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNED">Owned</SelectItem>
                          <SelectItem value="LEASED">Leased</SelectItem>
                          <SelectItem value="RENTED">Rented</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label style={labelStyle}>License Plate</label>
                      <input style={inputStyle} placeholder="Plate Number" value={form.plate_number} onChange={e => handleChange('plate_number', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'Lifecycle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>In-Service</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>In-Service Date</label>
                      <DatePicker date={parseDateOnly(form.in_service_date)} onChange={d => handleChange('in_service_date', toDateOnlyString(d))} />
                    </div>
                    <div>
                      <label style={labelStyle}>In-Service Odometer</label>
                      <input type="number" style={inputStyle} placeholder="Enter Number" value={form.in_service_odometer} onChange={e => handleChange('in_service_odometer', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Vehicle Life Estimates</div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Estimated Service Life in Months</label>
                    <input type="number" style={inputStyle} placeholder="Enter Number" value={form.est_life_months} onChange={e => handleChange('est_life_months', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Estimated Service Life in Meter</label>
                    <input type="number" style={inputStyle} placeholder="Enter Number" value={form.est_life_meter} onChange={e => handleChange('est_life_meter', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Estimated Resale Value</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: 10, color: 'var(--ink3)' }}>$</span>
                      <input type="number" style={{...inputStyle, paddingLeft: 28}} placeholder="Enter Amount" value={form.est_resale_value} onChange={e => handleChange('est_resale_value', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Out-of-Service</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Out-of-Service Date</label>
                      <DatePicker date={parseDateOnly(form.out_of_service_date)} onChange={d => handleChange('out_of_service_date', toDateOnlyString(d))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Out-of-Service Odometer</label>
                      <input type="number" style={inputStyle} placeholder="Enter Number" value={form.out_of_service_odometer} onChange={e => handleChange('out_of_service_odometer', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'Financial' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Purchase Details</div>
                <div>
                  <label style={labelStyle}>Purchase Vendor</label>
                  <input style={inputStyle} placeholder="Select vendor" value={form.purchase_vendor} onChange={e => handleChange('purchase_vendor', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Purchase Date</label>
                    <DatePicker date={parseDateOnly(form.purchase_date)} onChange={d => handleChange('purchase_date', toDateOnlyString(d))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Purchase Price</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: 10, color: 'var(--ink3)' }}>$</span>
                      <input type="number" style={{...inputStyle, paddingLeft: 28}} placeholder="Enter Amount" value={form.purchase_price} onChange={e => handleChange('purchase_price', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Odometer</label>
                  <input type="number" style={inputStyle} placeholder="mi/km" value={form.initial_odometer} onChange={e => handleChange('initial_odometer', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea style={{...inputStyle, minHeight: 80}} placeholder="Type Here" value={form.lifecycle_notes || ''} onChange={e => handleChange('lifecycle_notes', e.target.value)} />
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Loan/Lease</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {['LOAN', 'LEASE', 'NONE'].map(t => (
                      <div key={t} onClick={() => handleChange('financing_type', t)}
                        style={{ border: `1px solid ${form.financing_type === t ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 8, padding: 16, cursor: 'pointer', background: form.financing_type === t ? 'var(--teal-l)' : 'var(--white)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <input type="radio" checked={form.financing_type === t} readOnly style={{ accentColor: 'var(--teal)' }} />
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t === 'NONE' ? 'None' : t === 'LOAN' ? 'Loan' : 'Lease'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                          {t === 'NONE' ? 'This vehicle is not being financed' : t === 'LOAN' ? 'This vehicle is associated with a loan' : 'This vehicle is being leased'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'Specifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Make, Model &amp; Trim</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -16 }}>
                  Suggestions come from the free NHTSA vehicle database — if your brand isn't listed (common for regional truck brands), just type it in.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Year</label>
                    <input type="number" style={inputStyle} placeholder="e.g. 2022" value={form.year} onChange={e => handleChange('year', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Color</label>
                    <input style={inputStyle} placeholder="e.g. White" value={form.color} onChange={e => handleChange('color', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Make{makesLoading ? ' (loading…)' : ''}</label>
                    <input style={inputStyle} list="vehicle-make-options" placeholder="e.g. Isuzu" value={form.make}
                      onChange={e => { handleChange('make', e.target.value); handleChange('model', ''); }} />
                    <datalist id="vehicle-make-options">
                      {makes.map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <div>
                    <label style={labelStyle}>Model</label>
                    <input style={inputStyle} list="vehicle-model-options" placeholder="e.g. NPR" value={form.model} onChange={e => handleChange('model', e.target.value)} disabled={!form.make} />
                    <datalist id="vehicle-model-options">
                      {models.map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Trim</label>
                    <input style={inputStyle} placeholder="e.g. Base" value={form.trim} onChange={e => handleChange('trim', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fuel Type</label>
                    <Select value={form.fuel_type} onValueChange={v => handleChange('fuel_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIESEL">Diesel</SelectItem>
                        <SelectItem value="PETROL">Petrol</SelectItem>
                        <SelectItem value="ELECTRIC">Electric</SelectItem>
                        <SelectItem value="HYBRID">Hybrid</SelectItem>
                        <SelectItem value="CNG">CNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {['Maintenance', 'Settings'].includes(activeSection) && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)' }}>
                <Icon name="tool" size={32} color="var(--border-dark)" style={{ marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink2)' }}>{activeSection} Fields</div>
                <div style={{ fontSize: 14 }}>Additional configuration goes here.</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => navigate(-1)} style={{ padding: '8px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" style={{ padding: '8px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Save & Add Another
                </button>
                <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : 'Save Vehicle'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
