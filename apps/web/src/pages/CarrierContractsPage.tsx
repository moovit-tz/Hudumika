import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';

/**
 * Carrier buy-rate contract storage + rate shopping (ClearOS M7) —
 * distinct from FreightRateCardsPage's bundled cost+sell rate cards. A
 * lane can now hold several carriers' contracts at once, which is what
 * makes "compare carriers for this lane" a real feature rather than a
 * single fixed price. See freightBooking.service.ts's rateShopping.
 */

interface Carrier { id: string; name: string; active?: boolean; }
interface Contract {
  id: string; carrier_id: string; carrier_name: string | null; contract_reference: string | null;
  mode: string; origin_port: string; destination_port: string;
  buy_rate: string | number; currency: string; transit_days: number | null;
  valid_from: string | null; valid_to: string | null; active: boolean;
}
interface ShoppingResult {
  id: string; carrier_id: string; carrier_name: string | null; contract_reference: string | null;
  buy_rate: string | number; currency: string; transit_days: number | null; valid_to: string | null;
}

const MODES = [
  { value: 'FCL_20', label: 'FCL — 20ft' },
  { value: 'FCL_40', label: 'FCL — 40ft' },
  { value: 'FCL_40HC', label: 'FCL — 40ft HC' },
  { value: 'LCL', label: 'LCL (per CBM)' },
  { value: 'AIR', label: 'Air (per kg)' },
  { value: 'ROAD', label: 'Road' },
];

export function CarrierContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    carrier_id: '', contract_reference: '', mode: 'FCL_40', origin_port: '', destination_port: '',
    buy_rate: '', currency: 'USD', transit_days: '', valid_from: '', valid_to: '', notes: '',
  });

  const [shop, setShop] = useState({ mode: 'FCL_40', origin_port: '', destination_port: '' });
  const [shopResults, setShopResults] = useState<ShoppingResult[] | null>(null);
  const [shopping, setShopping] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiFetch('/v1/freight-booking/rate-contracts'),
      apiFetch('/v1/freight-booking/carriers'),
    ]).then(([c, cr]) => { setContracts(c); setCarriers(cr); }).catch(() => {
      setContracts([]);
      setCarriers([]);
      setLoadError('Could not load carrier contracts.');
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const activeCarriers = carriers.filter(c => c.active !== false);

  async function saveContract() {
    if (!form.carrier_id || !form.origin_port.trim() || !form.destination_port.trim() || !form.buy_rate) {
      setError('Carrier, origin, destination and buy rate are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/freight-booking/rate-contracts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          buy_rate: parseFloat(form.buy_rate),
          transit_days: form.transit_days ? parseInt(form.transit_days, 10) : undefined,
          contract_reference: form.contract_reference.trim() || undefined,
          valid_from: form.valid_from || undefined,
          valid_to: form.valid_to || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      setForm({ carrier_id: '', contract_reference: '', mode: 'FCL_40', origin_port: '', destination_port: '', buy_rate: '', currency: 'USD', transit_days: '', valid_from: '', valid_to: '', notes: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  }

  async function runRateShopping() {
    if (!shop.origin_port.trim() || !shop.destination_port.trim()) return;
    setShopping(true);
    try {
      const params = new URLSearchParams({ mode: shop.mode, origin_port: shop.origin_port.trim(), destination_port: shop.destination_port.trim() });
      const res = await apiFetch(`/v1/freight-booking/rate-shopping?${params.toString()}`);
      setShopResults(Array.isArray(res) ? res : []);
    } catch {
      setShopResults([]);
    } finally {
      setShopping(false);
    }
  }

  const contractColumns: TableColumn<Contract>[] = [
    { key: 'carrier', header: 'Carrier', sortable: true, render: contract => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><CompanyAvatar name={contract.carrier_name || 'Carrier'} size={26} shape="square" /><span>{contract.carrier_name || '—'}{contract.contract_reference && <small style={{ display: 'block', color: 'var(--ink3)', fontWeight: 400 }}>{contract.contract_reference}</small>}</span></span> },
    { key: 'mode', header: 'Mode', sortable: true, render: contract => MODES.find(mode => mode.value === contract.mode)?.label || contract.mode },
    { key: 'lane', header: 'Lane', render: contract => `${contract.origin_port} → ${contract.destination_port}` },
    { key: 'rate', header: 'Buy rate', render: contract => <strong>{contract.currency} {Number(contract.buy_rate).toFixed(2)}</strong> },
    { key: 'transit', header: 'Transit', render: contract => contract.transit_days != null ? `${contract.transit_days}d` : '—' },
    { key: 'validity', header: 'Validity', render: contract => `${contract.valid_from ? new Date(contract.valid_from).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} – ${contract.valid_to ? new Date(contract.valid_to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}` },
    { key: 'status', header: 'Status', render: contract => <Badge variant={contract.active ? 'success' : 'gray'}>{contract.active ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['CargoTracker', 'Freight Booking', 'Carrier Contracts']}
        titlePlain="Carrier"
        titleEm="contracts"
        subtitle="Real buy-side carrier rates — several contracts can cover the same lane, so you can actually shop between them."
        actions={
          <Button onClick={() => setShowForm(s => !s)}>
            <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add contract'}
          </Button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionCard title="Rate shopping" collapsible={false}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mode</label>
              <Select value={shop.mode} onValueChange={v => setShop(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="input-field" style={{ width: 160 }}><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Origin</label>
              <Input value={shop.origin_port} onChange={e => setShop(p => ({ ...p, origin_port: e.target.value }))} placeholder="e.g. Shanghai" style={{ width: 180 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Destination</label>
              <Input value={shop.destination_port} onChange={e => setShop(p => ({ ...p, destination_port: e.target.value }))} placeholder="e.g. Dar es Salaam" style={{ width: 180 }} />
            </div>
            <Button disabled={shopping} onClick={runRateShopping}>{shopping ? 'Searching…' : 'Compare carriers'}</Button>
          </div>

          {shopResults && (
            <div style={{ marginTop: 16 }}>
              {shopResults.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No active carrier contracts on file for this lane and mode.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shopResults.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--r)', background: i === 0 ? 'var(--teal-l)' : 'var(--bg)', border: i === 0 ? '1px solid var(--teal-m)' : '1px solid var(--border)' }}>
                      {i === 0 && <Badge variant="brand">Cheapest</Badge>}
                      <CompanyAvatar name={r.carrier_name || 'Carrier'} size={22} shape="square" />
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.carrier_name}</span>
                      <span style={{ fontFamily: 'var(--font)', color: 'var(--ink)', fontWeight: 700 }}>{r.currency} {Number(r.buy_rate).toFixed(2)}</span>
                      {r.transit_days != null && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{r.transit_days} days transit</span>}
                      {r.contract_reference && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>· {r.contract_reference}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {showForm && (
          <SectionCard title="Add carrier contract" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Carrier *</label>
                <Combobox options={activeCarriers.map(c => ({ value: c.id, label: c.name }))} value={form.carrier_id} onChange={v => setForm(p => ({ ...p, carrier_id: v }))} placeholder="Choose carrier…" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Contract reference</label>
                <Input value={form.contract_reference} onChange={e => setForm(p => ({ ...p, contract_reference: e.target.value }))} placeholder="Carrier's own contract no." />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mode</label>
                <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Origin port *</label>
                <Input value={form.origin_port} onChange={e => setForm(p => ({ ...p, origin_port: e.target.value }))} placeholder="e.g. Shanghai" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Destination port *</label>
                <Input value={form.destination_port} onChange={e => setForm(p => ({ ...p, destination_port: e.target.value }))} placeholder="e.g. Dar es Salaam" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Transit days</label>
                <Input type="number" min="0" value={form.transit_days} onChange={e => setForm(p => ({ ...p, transit_days: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Buy rate * <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(carrier charges you)</span></label>
                <Input type="number" min="0" value={form.buy_rate} onChange={e => setForm(p => ({ ...p, buy_rate: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
                <Input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} />
              </div>
              <div />
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Valid from</label>
                <DatePicker date={parseDateOnly(form.valid_from)} onChange={d => setForm(p => ({ ...p, valid_from: toDateOnlyString(d) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Valid until</label>
                <DatePicker date={parseDateOnly(form.valid_to)} onChange={d => setForm(p => ({ ...p, valid_to: toDateOnlyString(d) }))} />
              </div>
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
            <Button disabled={saving} onClick={saveContract}>{saving ? 'Saving…' : 'Save contract'}</Button>
          </SectionCard>
        )}

        <SectionCard title="All contracts" padded={false} collapsible={false}>
          <DataTable
            columns={contractColumns}
            rows={contracts}
            loading={loading}
            error={loadError ?? undefined}
            onRetry={load}
            empty={!loading && !loadError && contracts.length === 0}
            emptyIcon="fileText"
            emptyTitle="No carrier contracts yet"
            emptyMessage="Add a buy-side carrier contract to compare rates for a lane."
            defaultSortKey="carrier"
          />
        </SectionCard>
      </div>
    </div>
  );
}
