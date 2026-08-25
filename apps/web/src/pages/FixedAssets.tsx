import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

const CATEGORIES = ['OFFICE_EQUIPMENT', 'MOTOR_VEHICLE', 'IT_EQUIPMENT', 'FURNITURE', 'MACHINERY', 'OTHER'];
const CATEGORY_LABEL: Record<string, string> = { OFFICE_EQUIPMENT: 'Office Equipment', MOTOR_VEHICLE: 'Motor Vehicle', IT_EQUIPMENT: 'IT Equipment', FURNITURE: 'Furniture', MACHINERY: 'Machinery', OTHER: 'Other' };

interface Asset {
  id: string; name: string; category: string; acquisition_date: string; cost: number;
  salvage_value: number; useful_life_months: number; status: 'ACTIVE' | 'DISPOSED';
  disposed_at: string | null; disposal_proceeds: number | null;
  accumulated_depreciation: number; net_book_value: number;
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

function NewAssetPanel({ onSave, onClose }: { onSave: (data: any) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OFFICE_EQUIPMENT');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(0);
  const [salvageValue, setSalvageValue] = useState(0);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(36);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return showAlert('An asset name is required.');
    if (cost <= 0) return showAlert('Cost must be greater than zero.');
    if (usefulLifeMonths <= 0) return showAlert('Useful life must be at least 1 month.');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), category,
        asset_account_code: category === 'MOTOR_VEHICLE' ? '1502' : '1501',
        acquisition_date: acquisitionDate, cost, salvage_value: salvageValue, useful_life_months: usefulLifeMonths,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>New Fixed Asset</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Asset Name *</label><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Toyota Hilux — KDX 123A" /></div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Acquisition Date</label><DatePicker date={parseDateOnly(acquisitionDate)} onChange={d => setAcquisitionDate(toDateOnlyString(d) ?? '')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>Cost</label><input type="number" min={0} style={inp} value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)} /></div>
            <div><label style={lbl}>Salvage Value</label><input type="number" min={0} style={inp} value={salvageValue} onChange={e => setSalvageValue(parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lbl}>Useful Life (months)</label><input type="number" min={1} style={inp} value={usefulLifeMonths} onChange={e => setUsefulLifeMonths(parseInt(e.target.value) || 0)} /></div>
          <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 9, fontSize: 13, color: 'var(--ink2)' }}>
            Monthly depreciation: <strong style={{ color: 'var(--teal)' }}>{((cost - salvageValue) / (usefulLifeMonths || 1)).toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Add Asset'}</button>
        </div>
      </div>
    </>
  );
}

export function FixedAssets() {
  const { fmt } = useCurrency();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Asset | null>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [disposing, setDisposing] = useState<Asset | null>(null);
  const [disposalProceeds, setDisposalProceeds] = useState(0);

  const load = () => apiFetch('/v1/fixed-assets').then((d: any) => { if (Array.isArray(d)) setAssets(d); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function handleSave(data: any) {
    try {
      await apiFetch('/v1/fixed-assets', { method: 'POST', body: JSON.stringify(data) });
      setShowForm(false);
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this asset.');
    }
  }

  async function viewSchedule(a: Asset) {
    setScheduleFor(a);
    try {
      const r = await apiFetch(`/v1/fixed-assets/${a.id}/schedule`);
      setSchedule(r.schedule || []);
    } catch {
      setSchedule([]);
    }
  }

  async function handleDispose() {
    if (!disposing) return;
    try {
      await apiFetch(`/v1/fixed-assets/${disposing.id}/dispose`, { method: 'POST', body: JSON.stringify({ disposed_at: new Date().toISOString().slice(0, 10), proceeds: disposalProceeds }) });
      setDisposing(null);
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not dispose this asset.');
    }
  }

  async function handleDelete(a: Asset) {
    if (!(await showConfirm(`Delete "${a.name}"? Only possible if no depreciation has posted yet.`, { variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/fixed-assets/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not delete this asset.');
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading fixed assets…</div>;

  const totalCost = assets.reduce((s, a) => s + Number(a.cost), 0);
  const totalNBV = assets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + Number(a.net_book_value), 0);
  const totalAccum = assets.reduce((s, a) => s + Number(a.accumulated_depreciation), 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Fixed"
        titleEm="assets"
        subtitle="Asset register with straight-line depreciation, posted monthly to the ledger."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={13} /> New Asset
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Cost', value: fmt(totalCost), color: 'var(--ink)' },
          { label: 'Accumulated Depreciation', value: fmt(totalAccum), color: 'var(--gold)' },
          { label: 'Net Book Value (active)', value: fmt(totalNBV), color: 'var(--teal)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rtbl-wrap">
          <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Asset</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Acquired</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cost</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Accum. Depr.</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Net Book Value</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No fixed assets registered yet.</td></tr>
              ) : assets.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', opacity: a.status === 'DISPOSED' ? 0.55 : 1 }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink3)' }}>{CATEGORY_LABEL[a.category] || a.category}</td>
                  <td style={{ padding: '9px 12px' }}>{new Date(a.acquisition_date).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(a.cost)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmt(a.accumulated_depreciation)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(a.net_book_value)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: a.status === 'ACTIVE' ? 'var(--green-l)' : 'var(--bg)', color: a.status === 'ACTIVE' ? 'var(--green)' : 'var(--ink3)' }}>{a.status}</span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" title="View schedule" onClick={() => viewSchedule(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="fileText" size={14} /></button>
                      {a.status === 'ACTIVE' && <button type="button" title="Dispose" onClick={() => { setDisposing(a); setDisposalProceeds(0); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', padding: 4 }}><Icon name="logOut" size={14} /></button>}
                      {a.accumulated_depreciation === 0 && a.status === 'ACTIVE' && <button type="button" title="Delete" onClick={() => handleDelete(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Icon name="trash" size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <NewAssetPanel onSave={handleSave} onClose={() => setShowForm(false)} />}

      {scheduleFor && (
        <>
          <div onClick={() => setScheduleFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{scheduleFor.name}</div>
              <button type="button" onClick={() => setScheduleFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
              {schedule.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 22px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--ink2)' }}>{s.period}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(s.amount)}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{fmt(s.net_book_value)} NBV</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {disposing && (
        <>
          <div onClick={() => setDisposing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 380 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Dispose "{disposing.name}"</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>Net book value: {fmt(disposing.net_book_value)}. This posts the disposal to the ledger, including any gain or loss.</div>
              <label style={lbl}>Disposal Proceeds</label>
              <input type="number" min={0} style={inp} value={disposalProceeds} onChange={e => setDisposalProceeds(parseFloat(e.target.value) || 0)} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDisposing(null)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleDispose}>Confirm Disposal</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
