import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { FormPage, FormPageActions } from '../components/FormPage.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const CATEGORIES = ['OFFICE_EQUIPMENT', 'MOTOR_VEHICLE', 'IT_EQUIPMENT', 'FURNITURE', 'MACHINERY', 'OTHER'];
const CATEGORY_LABEL: Record<string, string> = { OFFICE_EQUIPMENT: 'Office Equipment', MOTOR_VEHICLE: 'Motor Vehicle', IT_EQUIPMENT: 'IT Equipment', FURNITURE: 'Furniture', MACHINERY: 'Machinery', OTHER: 'Other' };

interface Asset {
  id: string; name: string; category: string; acquisition_date: string; cost: number;
  salvage_value: number; useful_life_months: number; status: 'ACTIVE' | 'DISPOSED';
  disposed_at: string | null; disposal_proceeds: number | null;
  accumulated_depreciation: number; net_book_value: number;
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

function NewAssetForm({ onSave, onClose, fmt }: { onSave: (data: any) => Promise<void>; onClose: () => void; fmt: (n: number) => string }) {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('OFFICE_EQUIPMENT');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(0);
  const [salvageValue, setSalvageValue] = useState(0);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(36);
  const [saving, setSaving] = useState(false);

  const depreciableBase = Math.max(0, cost - salvageValue);
  const monthlyDepreciation = usefulLifeMonths > 0 ? depreciableBase / usefulLifeMonths : 0;
  const annualDepreciation = monthlyDepreciation * 12;

  async function submit() {
    if (!name.trim()) return showAlert('An asset name is required.');
    if (cost <= 0) return showAlert('Cost must be greater than zero.');
    if (usefulLifeMonths <= 0) return showAlert('Useful life must be at least 1 month.');
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category,
        asset_account_code: category === 'MOTOR_VEHICLE' ? '1502' : '1501',
        acquisition_date: acquisitionDate,
        cost,
        salvage_value: salvageValue,
        useful_life_months: usefulLifeMonths,
      });
    } finally {
      setSaving(false);
    }
  }

  const sec: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 };
  const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r, 12px)', padding: '22px 24px', marginBottom: 20, boxShadow: 'var(--elev-sm, 0 1px 3px rgba(0,0,0,0.04))' };

  return (
    <FormPage
      title="New Fixed Asset"
      subtitle="Register an asset and initialize straight-line depreciation schedule."
      onCancel={onClose}
      actions={
        <FormPageActions
          onCancel={onClose}
          onSave={submit}
          saving={saving}
          saveLabel="Add Asset"
        />
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Form Fields */}
        <div>
          {/* Card 1: Asset Information */}
          <div style={card}>
            <div style={sec}>Asset Information</div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Asset Name *</label>
              <input
                style={inp}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Toyota Hilux — KDX 123A or Server Rack Switch"
                autoFocus
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Asset GL Account Code</label>
                <div style={{ ...inp, background: 'var(--bg)', color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{category === 'MOTOR_VEHICLE' ? '1502 · Motor Vehicles' : '1501 · Office Equipment & Fixtures'}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 4 }}>Auto</span>
                </div>
              </div>
            </div>
            <div>
              <label style={lbl}>Acquisition Date</label>
              <DatePicker date={parseDateOnly(acquisitionDate)} onChange={d => setAcquisitionDate(toDateOnlyString(d) ?? '')} />
            </div>
          </div>

          {/* Card 2: Cost & Depreciation Parameters */}
          <div style={card}>
            <div style={sec}>Valuation &amp; Useful Life</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Acquisition Cost *</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  style={inp}
                  value={cost || ''}
                  onChange={e => setCost(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label style={lbl}>Salvage / Residual Value</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  style={inp}
                  value={salvageValue || ''}
                  onChange={e => setSalvageValue(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label style={lbl}>Useful Life (Months) *</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  style={{ ...inp, maxWidth: 160 }}
                  value={usefulLifeMonths || ''}
                  onChange={e => setUsefulLifeMonths(parseInt(e.target.value) || 0)}
                />
                <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                  ({(usefulLifeMonths / 12).toFixed(1)} years straight-line depreciation)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Depreciation & Summary Card */}
        <div>
          <div style={{ ...card, position: 'sticky', top: 20 }}>
            <div style={sec}>Depreciation Preview</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--r, 8px)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Monthly Depreciation
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  {fmt(monthlyDepreciation)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>
                  Straight-line across {usefulLifeMonths} months
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Acquisition Cost</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{fmt(cost)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Salvage Value</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{fmt(salvageValue)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Depreciable Base</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{fmt(depreciableBase)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink3)' }}>Annual Depr.</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{fmt(annualDepreciation)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                <span style={{ color: 'var(--ink3)' }}>Net Book Value at Start</span>
                <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(cost)}</span>
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={saving}
                onClick={submit}
              >
                <Icon name="save" size={14} /> {saving ? 'Saving…' : 'Add Fixed Asset'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </FormPage>
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

  const load = () => apiFetch('/v1/fixed-assets').then((d: any) => { if (Array.isArray(d)) setAssets(d); }).catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load fixed assets.')).finally(() => setLoading(false));
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

  if (showForm) {
    return <NewAssetForm onSave={handleSave} onClose={() => setShowForm(false)} fmt={fmt} />;
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading fixed assets…</div>;

  const totalCost = assets.reduce((s, a) => s + Number(a.cost), 0);
  const totalNBV = assets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + Number(a.net_book_value), 0);
  const totalAccum = assets.reduce((s, a) => s + Number(a.accumulated_depreciation), 0);
  const activeCount = assets.filter(a => a.status === 'ACTIVE').length;
  const disposedCount = assets.filter(a => a.status === 'DISPOSED').length;
  const activeCost = assets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + Number(a.cost), 0);
  const disposedCost = assets.filter(a => a.status === 'DISPOSED').reduce((s, a) => s + Number(a.cost), 0);

  return (
    <div className="finance-fixed-assets-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Fixed"
        titleEm="assets"
        subtitle="Asset register with straight-line depreciation, posted monthly to the ledger."
      />

      <MetricsRow cards={[
        {
          title: 'Total Assets', value: String(assets.length),
          sub1Label: 'ACTIVE', sub1Value: String(activeCount),
          sub2Label: 'DISPOSED', sub2Value: String(disposedCount), barHighlight: 'var(--teal)',
        },
        {
          title: 'Total Cost', value: fmt(totalCost),
          sub1Label: 'ACTIVE', sub1Value: fmt(activeCost),
          sub2Label: 'DISPOSED', sub2Value: fmt(disposedCost), barHighlight: 'var(--blue)',
        },
        {
          title: 'Accumulated Depreciation', value: fmt(totalAccum),
          invertTrend: true,
          sub1Label: 'OF TOTAL COST', sub1Value: totalCost ? `${Math.round((totalAccum / totalCost) * 100)}%` : '0%',
          sub2Label: 'ASSETS', sub2Value: String(assets.length), barHighlight: 'var(--gold)',
        },
        {
          title: 'Net Book Value', value: fmt(totalNBV),
          sub1Label: 'ACTIVE', sub1Value: String(activeCount),
          sub2Label: 'TOTAL', sub2Value: String(assets.length), barHighlight: 'var(--green)',
        },
      ]} />

      <div style={{ padding: '16px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button"
          onClick={() => setShowForm(true)}
          style={{ padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font)', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25 }}>
          <Icon name="plus" size={14} color="hsl(var(--primary-foreground))" /> New Asset
        </button>
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
                      <button type="button" className="finance-icon-action" title="View schedule" onClick={() => viewSchedule(a)} style={{ color: 'var(--ink3)' }}><Icon name="fileText" size={14} /></button>
                      {a.status === 'ACTIVE' && <button type="button" className="finance-icon-action" title="Dispose" onClick={() => { setDisposing(a); setDisposalProceeds(0); }} style={{ color: 'var(--gold)' }}><Icon name="logOut" size={14} /></button>}
                      {a.accumulated_depreciation === 0 && a.status === 'ACTIVE' && <button type="button" className="finance-icon-action" title="Delete" onClick={() => handleDelete(a)} style={{ color: 'var(--red)' }}><Icon name="trash" size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!scheduleFor} onOpenChange={o => { if (!o) setScheduleFor(null); }}>
        <SheetContent className="w-115 sm:max-w-115 flex flex-col p-0 gap-0">
          {scheduleFor && (
            <>
              <SheetHeader style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <SheetTitle style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{scheduleFor.name}</SheetTitle>
              </SheetHeader>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                {schedule.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 22px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink2)' }}>{s.period}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(s.amount)}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{fmt(s.net_book_value)} NBV</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!disposing} onOpenChange={o => { if (!o) setDisposing(null); }}>
        <DialogContent className="max-w-95 gap-0">
          {disposing && (
            <>
              <DialogTitle style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Dispose "{disposing.name}"</DialogTitle>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>Net book value: {fmt(disposing.net_book_value)}. This posts the disposal to the ledger, including any gain or loss.</div>
              <label style={lbl}>Disposal Proceeds</label>
              <input type="number" min={0} style={inp} value={disposalProceeds} onChange={e => setDisposalProceeds(parseFloat(e.target.value) || 0)} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDisposing(null)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleDispose}>Confirm Disposal</button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
