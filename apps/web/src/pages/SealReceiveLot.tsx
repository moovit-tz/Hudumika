import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString, parseDateOnly } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { CUSTOMS_STATUS_ENTRY_POINTS, CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import './Seal.css';

interface Compartment { id: string; code: string; name: string; }
interface Location { id: string; code: string; }
interface Customer { id: string; name: string; category?: string; }

export function SealReceiveLot() {
  const navigate = useNavigate();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);

  const [compartmentId, setCompartmentId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [description, setDescription] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [customsStatus, setCustomsStatus] = useState<CustomsStatus>('FOREIGN_DUTY_SUSPENDED');
  const [entryReference, setEntryReference] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState('');
  const [uom, setUom] = useState('PCS');
  const [customsValue, setCustomsValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [dutyAtRisk, setDutyAtRisk] = useState('');
  const [taxAtRisk, setTaxAtRisk] = useState('');
  const [bondOverrideReason, setBondOverrideReason] = useState('');
  const [warehousedOn, setWarehousedOn] = useState<Date | undefined>(new Date());
  const [expiresOn, setExpiresOn] = useState<Date | undefined>(undefined);
  const [isDangerousGoods, setIsDangerousGoods] = useState(false);
  const [unNumber, setUnNumber] = useState('');
  const [imdgClass, setImdgClass] = useState('');
  const [requiresReefer, setRequiresReefer] = useState(false);
  const [reeferSetpointC, setReeferSetpointC] = useState('');

  useEffect(() => {
    apiFetch('/v1/seal/compartments').then(rows => {
      setCompartments(rows);
      if (rows.length === 1) setCompartmentId(rows[0].id);
    });
    apiFetch('/v1/customers').then(res => setCustomers(Array.isArray(res) ? res : res.data || res.customers || []));
  }, []);

  useEffect(() => {
    if (!compartmentId) { setLocations([]); return; }
    apiFetch(`/v1/seal/locations?compartment_id=${compartmentId}`).then(setLocations);
  }, [compartmentId]);

  const isReady = compartmentId && ownerId && description.trim() && qty && Number(qty) > 0 && uom.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    setSaving(true);
    try {
      const lot = await apiFetch('/v1/seal/lots', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId, ownerId, description: description.trim(),
          hsCode: hsCode.trim() || null, countryOfOrigin: countryOfOrigin.trim().toUpperCase() || null,
          customsStatus, entryReference: entryReference.trim() || null,
          locationId: locationId || null, qty: Number(qty), uom: uom.trim(),
          customsValue: customsValue ? Number(customsValue) : null, currency: customsValue ? currency : null,
          dutyAtRisk: dutyAtRisk ? Number(dutyAtRisk) : null, taxAtRisk: taxAtRisk ? Number(taxAtRisk) : null,
          bondOverrideReason: bondOverrideReason.trim() || null,
          warehousedOn: warehousedOn ? toDateOnlyString(warehousedOn) : null,
          expiresOn: expiresOn ? toDateOnlyString(expiresOn) : null,
          isDangerousGoods, unNumber: unNumber.trim() || null, imdgClass: imdgClass.trim() || null,
          requiresReefer, reeferSetpointC: reeferSetpointC ? Number(reeferSetpointC) : null,
        }),
      });
      navigate(`/seal/lots/${lot.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to receive this lot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/lots')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} />
            <span>Back to Lots</span>
          </button>
          <h1 className="seal-page-title">Receive a Lot</h1>
          <p className="seal-page-sub">Creates the lot and its founding receipt movement — the only way a lot may come into existence, so it always has a clock and a chain to start from.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="seal-card">
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
          <div className="seal-field-row">
            <label className="seal-field-label">Compartment</label>
            <Select value={compartmentId} onValueChange={setCompartmentId}>
              <SelectTrigger className="input-field"><SelectValue placeholder="Choose a compartment" /></SelectTrigger>
              <SelectContent>
                {compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="seal-field-row">
            <label className="seal-field-label">Owner</label>
            <Combobox
              options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.category }))}
              value={ownerId}
              onChange={setOwnerId}
              placeholder="Search CRM clients…"
              searchPlaceholder="Search…"
              emptyText="No matching clients."
            />
          </div>

          <div className="seal-field-row">
            <label className="seal-field-label">Description</label>
            <input type="text" className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Steel Reinforcement Bars (Rebar), 12mm" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">HS Code</label>
              <input type="text" className="input-field" value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 7214.20" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Country of Origin</label>
              <input type="text" className="input-field" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. CN" maxLength={2} />
            </div>
          </div>

          <div className="seal-field-row">
            <label className="seal-field-label">Entry Status</label>
            <Select value={customsStatus} onValueChange={v => setCustomsStatus(v as CustomsStatus)}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CUSTOMS_STATUS_ENTRY_POINTS.map(s => <SelectItem key={s} value={s}>{CUSTOMS_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {customsStatus === 'FOREIGN_DUTY_SUSPENDED' && (
            <div className="seal-field-row">
              <label className="seal-field-label">Warehousing Entry Reference</label>
              <input type="text" className="input-field" value={entryReference} onChange={e => setEntryReference(e.target.value)} placeholder="e.g. WH-2026-000412" />
            </div>
          )}

          <div className="seal-field-row">
            <label className="seal-field-label">Location</label>
            <Select value={locationId} onValueChange={setLocationId} disabled={!compartmentId}>
              <SelectTrigger className="input-field"><SelectValue placeholder={compartmentId ? 'Choose a location' : 'Choose a compartment first'} /></SelectTrigger>
              <SelectContent>
                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Quantity</label>
              <input type="number" min="0" step="any" className="input-field" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">UOM</label>
              <input type="text" className="input-field" value={uom} onChange={e => setUom(e.target.value)} placeholder="PCS" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Customs Value (optional)</label>
              <input type="number" min="0" step="any" className="input-field" value={customsValue} onChange={e => setCustomsValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Currency</label>
              <input type="text" className="input-field" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>

          {customsStatus === 'FOREIGN_DUTY_SUSPENDED' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="seal-field-row">
                <label className="seal-field-label" title="Manual estimate — the duty engine is a future increment">Duty at Risk (optional, manual)</label>
                <input type="number" min="0" step="any" className="input-field" value={dutyAtRisk} onChange={e => setDutyAtRisk(e.target.value)} placeholder="0.00" />
              </div>
              <div className="seal-field-row">
                <label className="seal-field-label" title="Manual estimate — the duty engine is a future increment">Tax at Risk (optional, manual)</label>
                <input type="number" min="0" step="any" className="input-field" value={taxAtRisk} onChange={e => setTaxAtRisk(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          )}

          {customsStatus === 'FOREIGN_DUTY_SUSPENDED' && (dutyAtRisk || taxAtRisk) && (
            <div className="seal-field-row">
              <label className="seal-field-label">Bond Override Reason (only used if headroom is exceeded)</label>
              <input type="text" className="input-field" value={bondOverrideReason} onChange={e => setBondOverrideReason(e.target.value)} placeholder="Leave blank unless you intend to override a headroom block" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Warehoused On</label>
              <DatePicker date={warehousedOn} onChange={setWarehousedOn} />
            </div>
            {customsStatus === 'FOREIGN_DUTY_SUSPENDED' && (
              <div className="seal-field-row">
                <label className="seal-field-label">Storage Expires On</label>
                <DatePicker date={expiresOn} onChange={setExpiresOn} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isDangerousGoods} onChange={e => setIsDangerousGoods(e.target.checked)} />
              Dangerous Goods (IMDG)
            </label>
            {isDangerousGoods && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="seal-field-row">
                  <label className="seal-field-label">UN Number</label>
                  <input type="text" className="input-field" value={unNumber} onChange={e => setUnNumber(e.target.value)} placeholder="e.g. UN1993" />
                </div>
                <div className="seal-field-row">
                  <label className="seal-field-label">IMDG Class</label>
                  <input type="text" className="input-field" value={imdgClass} onChange={e => setImdgClass(e.target.value)} placeholder="e.g. 3" title="Placement checks segregation against other DG lots already at the chosen location" />
                </div>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={requiresReefer} onChange={e => setRequiresReefer(e.target.checked)} />
              Requires Reefer (Temperature-Controlled)
            </label>
            {requiresReefer && (
              <div className="seal-field-row" style={{ maxWidth: 200 }}>
                <label className="seal-field-label">Setpoint (°C)</label>
                <input type="number" step="any" className="input-field" value={reeferSetpointC} onChange={e => setReeferSetpointC(e.target.value)} placeholder="-18" />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button type="submit" className="seal-btn-primary" disabled={!isReady || saving}>
              <Icon name="package" size={14} />
              <span>{saving ? 'Receiving…' : 'Receive Lot'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
