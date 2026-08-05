import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import './TrackingNewExpense.css';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle {
  id: string;
  name: string;
  plate_number: string | null;
}

interface Vendor {
  id: string;
  name: string;
}

export const TrackingNewExpense: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  const [form, setForm] = useState({
    vehicle_id: '',
    category: '',
    vendor_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    frequency: 'single',
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(console.error);
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.vehicle_id) return setError('Please select a Vehicle.');
    if (!form.category) return setError('Please select an Expense Type.');
    if (!form.amount) return setError('Please enter an Amount.');

    setSaving(true);
    
    // Append frequency to description if it's recurring or if files were mock-attached
    const finalDescription = form.frequency === 'recurring' 
      ? `[Recurring Expense] ${form.notes}`
      : form.notes;

    try {
      await apiFetch(`/v1/tracking/vehicles/${form.vehicle_id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          amount: Number(form.amount),
          expense_date: form.date,
          vendor_id: form.vendor_id || undefined,
          description: finalDescription
        })
      });
      navigate(`/tracking/vehicles/${form.vehicle_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save expense');
      setSaving(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Mock drop logic
  };

  return (
    <div className="exp-page">
      <div className="exp-header-row">
        <div className="exp-title-area">
          <Link to="/tracking/vehicles" className="exp-back-link">
            <Icon name="arrowLeft" size={14} /> Expense Entries
          </Link>
          <PageHeader
            crumbs={['HuduFreight', 'New Expense']}
            titlePlain="New"
            titleEm="expense"
          />
        </div>
        <div className="exp-actions">
          <button className="exp-btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button className="exp-btn-primary" onClick={handleSubmit} disabled={saving}>Save Expense Entry</button>
        </div>
      </div>

      <div className="exp-form-container">
        {error && (
          <div style={{ padding: 16, background: 'rgba(220,38,38,0.08)', color: '#dc2626', borderRadius: 8, marginBottom: 24, fontSize: 13, border: '1px solid rgba(220,38,38,0.25)' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          
          <div className="exp-section">
            <div className="exp-section-title">Details</div>
            
            <div className="exp-field-group">
              <label className="exp-label">Vehicle <span className="required">*</span></label>
              <Combobox
                options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
                value={form.vehicle_id} onChange={v => setForm({...form, vehicle_id: v})} placeholder="Please select"
              />
            </div>

            <div className="exp-field-group">
              <label className="exp-label">Expense Type <span className="required">*</span></label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FUEL">Fuel</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance / Parts</SelectItem>
                  <SelectItem value="TOLL">Toll</SelectItem>
                  <SelectItem value="PARKING">Parking</SelectItem>
                  <SelectItem value="FINE">Fine / Ticket</SelectItem>
                  <SelectItem value="WASH">Wash / Clean</SelectItem>
                  <SelectItem value="INSURANCE">Insurance</SelectItem>
                  <SelectItem value="REGISTRATION">Registration / Tax</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="exp-field-group">
              <label className="exp-label">Vendor</label>
              <Combobox
                options={vendors.map(v => ({ value: v.id, label: v.name }))}
                value={form.vendor_id} onChange={v => setForm({...form, vendor_id: v})} placeholder="Please select"
              />
            </div>

            <div className="exp-field-group">
              <label className="exp-label">Amount <span className="required">*</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: 10, color: 'var(--ink3)', fontWeight: 500 }}>$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  className="exp-input" 
                  style={{ paddingLeft: 28 }}
                  value={form.amount} 
                  onChange={e => setForm({...form, amount: e.target.value})} 
                  placeholder=""
                  required
                />
              </div>
            </div>
          </div>

          <div className="exp-section">
            <div className="exp-section-title">Frequency</div>
            <div className="exp-freq-row">
              <label className="exp-radio-label">
                <input 
                  type="radio" 
                  name="frequency" 
                  className="exp-radio-input"
                  checked={form.frequency === 'single'}
                  onChange={() => setForm({...form, frequency: 'single'})}
                />
                <div className="exp-radio-text-group">
                  <div className="exp-radio-title">Single Expense</div>
                  <div className="exp-radio-desc">A single entry that does not repeat</div>
                </div>
              </label>

              <label className="exp-radio-label">
                <input 
                  type="radio" 
                  name="frequency" 
                  className="exp-radio-input"
                  checked={form.frequency === 'recurring'}
                  onChange={() => setForm({...form, frequency: 'recurring'})}
                />
                <div className="exp-radio-text-group">
                  <div className="exp-radio-title">Recurring Expense</div>
                  <div className="exp-radio-desc">Repeats on a monthly or annual basis</div>
                </div>
              </label>
            </div>
          </div>

          <div className="exp-section">
            <div className="exp-field-group">
              <label className="exp-label">Date <span className="required">*</span></label>
              <DatePicker
                date={parseDateOnly(form.date)}
                onChange={d => setForm({...form, date: toDateOnlyString(d)})}
              />
            </div>
          </div>

          <div className="exp-section">
            <div className="exp-field-group">
              <label className="exp-label">Notes</label>
              <textarea 
                className="exp-textarea" 
                placeholder="Type here"
                value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})}
              />
            </div>
          </div>

          <div className="exp-upload-row">
            <div className="exp-upload-col">
              <label className="exp-label">Photos</label>
              <div className="exp-upload-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
                <div className="exp-upload-icon"></div>
                <div className="exp-upload-text">
                  <div className="exp-upload-primary">Drag & drop files to upload</div>
                  <div className="exp-upload-secondary">or click to pick files</div>
                </div>
              </div>
            </div>

            <div className="exp-upload-col">
              <label className="exp-label">Documents</label>
              <div className="exp-upload-zone" onDragOver={handleDragOver} onDrop={handleDrop}>
                <div className="exp-upload-icon" style={{ borderRadius: 4 }}></div>
                <div className="exp-upload-text">
                  <div className="exp-upload-primary">Drag & drop files to upload</div>
                  <div className="exp-upload-secondary">or click to pick files</div>
                </div>
              </div>
            </div>
          </div>

          <div className="exp-form-footer">
            <button type="button" className="exp-btn-text" onClick={() => navigate(-1)}>Cancel</button>
            <div className="exp-footer-actions">
              <button type="button" className="exp-btn-secondary">Save & Add Another</button>
              <button type="submit" className="exp-btn-primary" disabled={saving}>Save Expense Entry</button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
