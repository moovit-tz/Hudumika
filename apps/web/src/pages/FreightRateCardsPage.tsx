import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';

interface Carrier { id: string; name: string; active?: boolean; }
interface RateCard {
  id: string; carrier_id: string; carrier_name: string | null; mode: string;
  origin_port: string; destination_port: string;
  // Postgres numeric columns come back through pg/Kysely as strings, not
  // JS numbers — .toFixed() on these without Number(...) first throws and
  // takes the whole page down (found live: crashed right after saving the
  // very first rate card).
  cost_rate: string | number; sell_rate: string | number;
  currency: string; active: boolean;
}

const MODES = [
  { value: 'FCL_20', label: 'FCL — 20ft' },
  { value: 'FCL_40', label: 'FCL — 40ft' },
  { value: 'FCL_40HC', label: 'FCL — 40ft HC' },
  { value: 'LCL', label: 'LCL (per CBM)' },
  { value: 'AIR', label: 'Air (per kg)' },
  { value: 'ROAD', label: 'Road' },
];

export function FreightRateCardsPage() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ carrier_id: '', mode: 'FCL_20', origin_port: '', destination_port: '', cost_rate: '', sell_rate: '', currency: 'USD' });

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiFetch('/v1/freight-booking/rate-cards'),
      // Unfiltered — an inactive carrier still needs to be distinguishable
      // from "no carrier exists at all" for the empty-state message below;
      // the picker itself filters to active ones.
      apiFetch('/v1/freight-booking/carriers'),
    ]).then(([rc, c]) => { setCards(rc); setCarriers(c); }).catch(() => {
      setCards([]);
      setCarriers([]);
      setLoadError('Could not load freight rate cards.');
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const activeCarriers = carriers.filter(c => (c as any).active !== false);

  async function saveCard() {
    if (!form.carrier_id || !form.origin_port.trim() || !form.destination_port.trim() || !form.cost_rate || !form.sell_rate) {
      setError('Carrier, origin, destination, cost rate and sell rate are all required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/freight-booking/rate-cards', {
        method: 'POST',
        body: JSON.stringify({ ...form, cost_rate: parseFloat(form.cost_rate), sell_rate: parseFloat(form.sell_rate) }),
      });
      setForm({ carrier_id: '', mode: 'FCL_20', origin_port: '', destination_port: '', cost_rate: '', sell_rate: '', currency: 'USD' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rate card');
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumn<RateCard>[] = [
    { key: 'carrier', header: 'Carrier', sortable: true, render: card => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><CompanyAvatar name={card.carrier_name || 'Carrier'} size={26} shape="square" />{card.carrier_name || '—'}</span> },
    { key: 'mode', header: 'Mode', sortable: true, render: card => MODES.find(mode => mode.value === card.mode)?.label || card.mode },
    { key: 'lane', header: 'Lane', render: card => `${card.origin_port} → ${card.destination_port}` },
    { key: 'cost', header: 'Cost', render: card => `${card.currency} ${Number(card.cost_rate).toFixed(2)}` },
    { key: 'sell', header: 'Sell', render: card => `${card.currency} ${Number(card.sell_rate).toFixed(2)}` },
    { key: 'margin', header: 'Margin', render: card => <strong style={{ color: 'var(--teal)' }}>{card.currency} {(Number(card.sell_rate) - Number(card.cost_rate)).toFixed(2)}</strong> },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['CargoTracker', 'Freight Booking', 'Freight Rate Cards']}
        titlePlain="Freight rate"
        titleEm="cards"
        subtitle="Carrier cost vs. customer sell rate by lane — the margin on every booking comes from here"
        actions={
          <Button type="button" onClick={() => setShowForm(s => !s)}>
            <Icon name={showForm ? 'x' : 'plus'} size={14} /> {showForm ? 'Cancel' : 'Add rate card'}
          </Button>
        }
      />

      {activeCarriers.length === 0 && !loading && (
        <div style={{ padding: '12px 18px', borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold)', marginBottom: 20, fontSize: 12.5, color: 'var(--ink2)' }}>
          {carriers.length === 0
            ? 'Add a carrier first — rate cards belong to a carrier.'
            : 'No active carriers — activate one on the Carriers page before adding a rate card.'}
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Carrier *</label>
              <Combobox options={activeCarriers.map(c => ({ value: c.id, label: c.name }))} value={form.carrier_id} onChange={v => setForm(p => ({ ...p, carrier_id: v }))} placeholder="Choose carrier…" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mode</label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
              <Input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Origin port *</label>
              <Input value={form.origin_port} onChange={e => setForm(p => ({ ...p, origin_port: e.target.value }))} placeholder="e.g. Shanghai" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Destination port *</label>
              <Input value={form.destination_port} onChange={e => setForm(p => ({ ...p, destination_port: e.target.value }))} placeholder="e.g. Dar es Salaam" />
            </div>
            <div />
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Cost rate * <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(carrier charges you)</span></label>
              <Input type="number" min="0" value={form.cost_rate} onChange={e => setForm(p => ({ ...p, cost_rate: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Sell rate * <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(you charge customer)</span></label>
              <Input type="number" min="0" value={form.sell_rate} onChange={e => setForm(p => ({ ...p, sell_rate: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Margin</label>
              <div className="input-field" style={{ display: 'flex', alignItems: 'center', color: 'var(--teal)', fontWeight: 700 }}>
                {form.cost_rate && form.sell_rate ? `${form.currency} ${(parseFloat(form.sell_rate) - parseFloat(form.cost_rate)).toFixed(2)}` : '—'}
              </div>
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <Button type="button" onClick={saveCard} disabled={saving}>{saving ? 'Saving…' : 'Save rate card'}</Button>
        </SectionCard>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={cards}
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && cards.length === 0}
        emptyIcon="dollarSign"
        emptyTitle="No rate cards yet"
        emptyMessage="Add a carrier lane and its buy and sell rates to start quoting consistently."
        defaultSortKey="carrier"
      />
    </div>
  );
}
