import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

// Reusing the same CSS classes from CreateShipmentPage for consistent layout
import './CreateShipmentPage.css';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showConfirm } from '../lib/confirm.js';

interface RawShipment {
  id: string;
  ref_number: string;
  goods_desc: string;
  hs_code: string | null;
  bl_number: string | null;
  awb_number: string | null;
  tansad_number: string | null;
  vessel: string | null;
  origin_port: string | null;
  port_of_loading: string | null;
  dest_port: string | null;
  port_of_discharge: string | null;
  eta: string | null;
  free_time_end: string | null;
  sla_deadline: string | null;
  assigned_to: string | null;
  gross_weight_kg: string | number | null;
  cif_value_usd: string | number | null;
  internal_notes: string | null;
}

function toDateInput(v: string | null): string {
  if (!v) return '';
  return new Date(v).toISOString().slice(0, 10);
}

const fldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' };
const inpStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13.5, boxSizing: 'border-box', width: '100%', fontFamily: 'var(--font)' };

export const ShipmentEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [officers, setOfficers] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    { id: 1, title: 'Cargo', desc: 'Core shipment details like description and HS code.' },
    { id: 2, title: 'Transport', desc: 'Port details, vessel, and ETA tracking.' },
    { id: 3, title: 'Financial', desc: 'Weight, CIF value, and invoicing basics.' },
    { id: 4, title: 'Notes', desc: 'Internal remarks and assignments.' },
  ];

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch(`/v1/shipments/${id}`),
      apiFetch('/v1/hr/staff').catch(() => ({ data: [] })),
    ]).then(([shipment, staff]: [RawShipment, any]) => {
      setForm({
        goods_desc: shipment.goods_desc || '',
        hs_code: shipment.hs_code || '',
        bl_number: shipment.bl_number || '',
        awb_number: shipment.awb_number || '',
        tansad_number: shipment.tansad_number || '',
        vessel: shipment.vessel || '',
        origin_port: shipment.origin_port || '',
        port_of_loading: shipment.port_of_loading || '',
        dest_port: shipment.dest_port || '',
        port_of_discharge: shipment.port_of_discharge || '',
        eta: toDateInput(shipment.eta),
        free_time_end: toDateInput(shipment.free_time_end),
        sla_deadline: toDateInput(shipment.sla_deadline),
        assigned_to: shipment.assigned_to || '',
        gross_weight_kg: shipment.gross_weight_kg != null ? String(shipment.gross_weight_kg) : '',
        cif_value_usd: shipment.cif_value_usd != null ? String(shipment.cif_value_usd) : '',
        internal_notes: shipment.internal_notes || '',
        ref_number: shipment.ref_number,
      });
      setOfficers(staff.data || staff || []);
    }).catch(() => setError('Failed to load shipment')).finally(() => setLoading(false));
  }, [id]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/shipments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          goods_desc: form.goods_desc,
          hs_code: form.hs_code || null,
          bl_number: form.bl_number || null,
          awb_number: form.awb_number || null,
          tansad_number: form.tansad_number || null,
          vessel: form.vessel || null,
          origin_port: form.origin_port || null,
          port_of_loading: form.port_of_loading || null,
          dest_port: form.dest_port || null,
          port_of_discharge: form.port_of_discharge || null,
          eta: form.eta || null,
          free_time_end: form.free_time_end || null,
          sla_deadline: form.sla_deadline || null,
          assigned_to: form.assigned_to || null,
          gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
          cif_value_usd: form.cif_value_usd ? Number(form.cif_value_usd) : null,
          internal_notes: form.internal_notes || null,
        }),
      });
      navigate(`/clearos/clearance/${id}`);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!(await showConfirm(`Delete shipment ${form.ref_number}? This removes it from every listing but keeps its records for audit purposes.`, { confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await apiFetch(`/v1/shipments/${id}`, { method: 'DELETE' });
      navigate('/clearos/ops');
    } catch (e: any) {
      setError(e.message ?? 'Delete failed');
      setDeleting(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--teal)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 14, color: 'var(--ink3)' }}>Loading shipment…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="create-shipment-page">
      {/* Sidebar */}
      {!isMobile && (
        <div className="create-shipment-sidebar">
          <Link to={`/clearos/clearance/${id}`} className="create-shipment-brand" style={{ color: 'var(--ink2)', fontSize: 14 }}>
            <Icon name="chevronLeft" size={16} /> Back to Shipment
          </Link>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)', marginBottom: 32, marginTop: -16 }}>
            {form.ref_number}
          </div>
          
          <div className="create-shipment-steps">
            {steps.map((s) => {
              const status = currentStep === s.id ? 'active' : 'completed'; // For edits, all are accessible, so 'completed' fits as a clickable state
              return (
                <div key={s.id} className={`create-shipment-step ${status}`} onClick={() => setCurrentStep(s.id)} style={{ cursor: 'pointer' }}>
                  <div className="create-shipment-step-indicator">
                    {s.id}
                  </div>
                  <div className="create-shipment-step-content">
                    <div className="create-shipment-step-title">{s.title}</div>
                    <div className="create-shipment-step-desc">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="create-shipment-main">
        {isMobile && (
          <div className="create-shipment-header">
            <Link to={`/clearos/clearance/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink2)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', width: 'fit-content' }}>
              <Icon name="chevronLeft" size={14} /> Back
            </Link>
          </div>
        )}
        <div className="create-shipment-content" style={{ maxWidth: 800, marginTop: isMobile ? 0 : 24 }}>
          {error && (
            <div style={{ padding: '11px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#dc2626', marginBottom: 24 }}>
              {error}
            </div>
          )}

          <div className="create-shipment-title">
            {currentStep === 1 && 'Cargo Details'}
            {currentStep === 2 && 'Transport Details'}
            {currentStep === 3 && 'Financial Details'}
            {currentStep === 4 && 'Notes & Assignment'}
          </div>
          <div className="create-shipment-subtitle" style={{ marginBottom: 32 }}>
            {currentStep === 1 && 'Core shipment details — edits save directly to the customs case.'}
            {currentStep === 2 && 'Port details, vessel, and ETA tracking.'}
            {currentStep === 3 && 'Weight, CIF value, and invoicing basics.'}
            {currentStep === 4 && 'Internal remarks and team assignments.'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* STEP 1 */}
            {currentStep === 1 && (
              <>
                <div style={fldStyle}>
                  <label style={lblStyle}>Cargo Description</label>
                  <input style={inpStyle} value={form.goods_desc || ''} onChange={set('goods_desc')} placeholder="e.g. Bagged cement, 500 units" />
                </div>
                <div style={fldStyle}>
                  <label style={lblStyle}>HS Code</label>
                  <input style={inpStyle} value={form.hs_code || ''} onChange={set('hs_code')} placeholder="e.g. 2523.29.00" />
                </div>
              </>
            )}

            {/* STEP 2 */}
            {currentStep === 2 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div style={fldStyle}><label style={lblStyle}>B/L Number</label><input style={inpStyle} value={form.bl_number || ''} onChange={set('bl_number')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>AWB Number</label><input style={inpStyle} value={form.awb_number || ''} onChange={set('awb_number')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>TANSAD Number</label><input style={inpStyle} value={form.tansad_number || ''} onChange={set('tansad_number')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Vessel</label><input style={inpStyle} value={form.vessel || ''} onChange={set('vessel')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Origin Port</label><input style={inpStyle} value={form.origin_port || ''} onChange={set('origin_port')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Port of Loading</label><input style={inpStyle} value={form.port_of_loading || ''} onChange={set('port_of_loading')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Destination Port</label><input style={inpStyle} value={form.dest_port || ''} onChange={set('dest_port')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Port of Discharge</label><input style={inpStyle} value={form.port_of_discharge || ''} onChange={set('port_of_discharge')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>ETA</label><DatePicker date={parseDateOnly(form.eta)} onChange={d => setForm(f => ({...f, eta: toDateOnlyString(d)}))} /></div>
                  <div style={fldStyle}><label style={lblStyle}>Free Time Ends</label><DatePicker date={parseDateOnly(form.free_time_end)} onChange={d => setForm(f => ({...f, free_time_end: toDateOnlyString(d)}))} /></div>
                  <div style={fldStyle}><label style={lblStyle}>SLA Deadline</label><DatePicker date={parseDateOnly(form.sla_deadline)} onChange={d => setForm(f => ({...f, sla_deadline: toDateOnlyString(d)}))} /></div>
                </div>
              </>
            )}

            {/* STEP 3 */}
            {currentStep === 3 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div style={fldStyle}><label style={lblStyle}>Gross Weight (KG)</label><input type="number" min="0" style={inpStyle} value={form.gross_weight_kg || ''} onChange={set('gross_weight_kg')} /></div>
                  <div style={fldStyle}><label style={lblStyle}>CIF Value (USD)</label><input type="number" min="0" style={inpStyle} value={form.cif_value_usd || ''} onChange={set('cif_value_usd')} /></div>
                </div>
              </>
            )}

            {/* STEP 4 */}
            {currentStep === 4 && (
              <>
                <div style={fldStyle}>
                  <label style={lblStyle}>Assigned Officer</label>
                  <Combobox
                    options={[{ value: '', label: 'Unassigned' }, ...officers.map((o: any) => ({ value: o.id, label: o.name }))]}
                    value={form.assigned_to || ''}
                    onChange={v => setForm(f => ({ ...f, assigned_to: v }))}
                  />
                </div>
                <div style={fldStyle}>
                  <label style={lblStyle}>Internal Notes</label>
                  <textarea style={{ ...inpStyle, minHeight: 120, resize: 'vertical' }} value={form.internal_notes || ''} onChange={set('internal_notes')} placeholder="Internal notes, not visible to the customer" />
                </div>
              </>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '40px 0 24px' }} />

          {/* Navigation & Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            {currentStep === 4 ? (
              <button type="button" onClick={handleDelete} disabled={deleting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                <Icon name="trash" size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : (
              <div /> // Spacer
            )}
            
            <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
              {currentStep > 1 && (
                <button type="button" onClick={() => setCurrentStep(s => s - 1)} style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  Previous
                </button>
              )}
              {currentStep < 4 ? (
                <button type="button" onClick={() => setCurrentStep(s => s + 1)} style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  Next Step
                </button>
              ) : (
                <button type="button" onClick={handleSave} disabled={saving}
                  style={{ padding: 'var(--ds-btn-py) 24px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
