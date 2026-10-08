import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { showAlert } from '../lib/alert.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';

interface Carrier {
  id: string;
  name: string;
  mode: string;
  scac_or_iata: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
}

interface DirectoryCarrier {
  id: string;
  name: string;
  mode: string;
  scac_or_iata: string | null;
  country: string | null;
  region: string | null;
}

const MODES = [
  { value: 'OCEAN', label: 'Ocean' },
  { value: 'AIR', label: 'Air' },
  { value: 'ROAD', label: 'Road' },
  { value: 'RAIL', label: 'Rail' },
];

const MODE_ICON: Record<string, any> = { OCEAN: 'anchor', AIR: 'compass', ROAD: 'truck', RAIL: 'layers' };

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 };

export function CarriersPage() {
  const isMobile = useIsMobile();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', mode: 'OCEAN', scac_or_iata: '', contact_name: '', contact_email: '', contact_phone: '' });
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Browse the global carrier directory ──
  const [showDirectory, setShowDirectory] = useState(false);
  const [dirQuery, setDirQuery] = useState('');
  const [dirMode, setDirMode] = useState<string | null>(null);
  const [dirResults, setDirResults] = useState<DirectoryCarrier[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const dirTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    apiFetch('/v1/freight-booking/carriers').then(setCarriers).catch(() => {
      setCarriers([]);
      setLoadError('Could not load carriers.');
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!showDirectory) return;
    setDirLoading(true);
    if (dirTimer.current) clearTimeout(dirTimer.current);
    dirTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (dirQuery.trim()) params.set('q', dirQuery.trim());
      if (dirMode) params.set('mode', dirMode);
      params.set('limit', '40');
      apiFetch(`/v1/reference/carriers?${params.toString()}`)
        .then(r => setDirResults(r.data ?? []))
        .catch(() => setDirResults([]))
        .finally(() => setDirLoading(false));
    }, 250);
    return () => { if (dirTimer.current) clearTimeout(dirTimer.current); };
  }, [showDirectory, dirQuery, dirMode]);

  const ownNames = new Set(carriers.map(c => `${c.name.toLowerCase()}__${c.mode}`));

  async function addFromDirectory(d: DirectoryCarrier) {
    setAddingId(d.id);
    try {
      await apiFetch('/v1/freight-booking/carriers', {
        method: 'POST',
        body: JSON.stringify({ name: d.name, mode: d.mode, scac_or_iata: d.scac_or_iata || undefined }),
      });
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to add carrier');
    } finally {
      setAddingId(null);
    }
  }

  async function toggleActive(c: Carrier) {
    setTogglingId(c.id);
    try {
      await apiFetch(`/v1/freight-booking/carriers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) });
      setCarriers(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x));
    } catch (err: any) {
      showAlert(err?.message || 'Failed to update carrier status');
    } finally {
      setTogglingId(null);
    }
  }

  async function saveCarrier() {
    if (!form.name.trim()) { setError('Carrier name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/freight-booking/carriers', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', mode: 'OCEAN', scac_or_iata: '', contact_name: '', contact_email: '', contact_phone: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save carrier');
    } finally {
      setSaving(false);
    }
  }

  const carrierColumns: TableColumn<Carrier>[] = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: carrier => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><CompanyAvatar name={carrier.name} size={26} shape="square" />{carrier.name}</span>,
    },
    { key: 'mode', header: 'Mode', render: carrier => MODES.find(mode => mode.value === carrier.mode)?.label || carrier.mode, sortable: true },
    { key: 'code', header: 'Code', render: carrier => carrier.scac_or_iata || '—' },
    { key: 'contact', header: 'Contact', render: carrier => carrier.contact_name || carrier.contact_email || '—' },
    {
      key: 'status', header: 'Status', width: 120,
      render: carrier => (
        <button type="button" onClick={() => toggleActive(carrier)} disabled={togglingId === carrier.id} aria-label={`${carrier.active ? 'Deactivate' : 'Activate'} ${carrier.name}`} style={{ background: 'none', border: 'none', padding: 0, cursor: togglingId === carrier.id ? 'wait' : 'pointer' }} data-ui-native-button="">
          <Badge variant={carrier.active ? 'success' : 'gray'}>{togglingId === carrier.id ? 'Updating…' : carrier.active ? 'Active' : 'Inactive'}</Badge>
        </button>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 24px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['CargoTracker', 'Freight Booking', 'Carriers']}
        titlePlain="Carrier"
        titleEm="directory"
        subtitle="Shipping lines, airlines, road and rail carriers used for rate cards and bookings"
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" onClick={() => setShowDirectory(s => !s)}>
              <Icon name="search" size={15} /> {showDirectory ? 'Hide directory' : 'Browse directory'}
            </Button>
            <Button type="button" onClick={() => setShowForm(s => !s)}>
              <Icon name={showForm ? 'x' : 'plus'} size={15} /> {showForm ? 'Cancel' : 'Add carrier'}
            </Button>
          </div>
        }
      />

      {/* ── Browse the global carrier directory ── */}
      {showDirectory && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard title="Global carrier directory">
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 16 }}>119 real ocean, air, road & rail carriers — search and add with one click</div>

          <SearchToolbar
            search={dirQuery}
            onSearch={setDirQuery}
            placeholder="Search by name, SCAC/IATA code, or country"
            actions={<SingleSelectFilter
              label="Mode"
              icon={<Icon name="filter" size={13} />}
              options={MODES}
              value={dirMode}
              onChange={setDirMode}
              allLabel="All modes"
            />}
            className="mb-4"
          />

          {dirLoading ? (
            <SectionLoading label="Searching carriers…" />
          ) : dirResults.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No carriers match your search.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
              {dirResults.map(d => {
                const already = ownNames.has(`${d.name.toLowerCase()}__${d.mode}`);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <FeaturedIcon variant="gray" size="sm" shape="circle"><Icon name={MODE_ICON[d.mode] ?? 'ship'} size={14} /></FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                        {d.scac_or_iata && <span style={{ fontFamily: 'var(--font)' }}>{d.scac_or_iata}</span>}
                        {d.country && <span>· {d.country}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={already || addingId === d.id}
                      onClick={() => addFromDirectory(d)}
                      style={{
                        flexShrink: 0,
                        background: already ? 'var(--green-l)' : 'var(--teal-l)',
                        color: already ? 'var(--green)' : 'var(--teal)',
                        border: 'none',
                      }}
                     data-ui-native-button="">
                      {already ? <><Icon name="checkCircle" size={12} /> Added</> : addingId === d.id ? 'Adding…' : <><Icon name="plus" size={12} /> Add</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
        </div>
      )}

      {/* ── Manual add form ── */}
      {showForm && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={fieldLabel}>Name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Maersk Line" />
            </div>
            <div>
              <label style={fieldLabel}>Mode</label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={fieldLabel}>SCAC / IATA code</label>
              <Input value={form.scac_or_iata} onChange={e => setForm(p => ({ ...p, scac_or_iata: e.target.value }))} placeholder="e.g. MAEU" />
            </div>
            <div>
              <label style={fieldLabel}>Contact name</label>
              <Input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            </div>
            <div>
              <label style={fieldLabel}>Contact email</label>
              <Input type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            </div>
            <div>
              <label style={fieldLabel}>Contact phone</label>
              <Input value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <Button type="button" onClick={saveCarrier} disabled={saving}>{saving ? 'Saving…' : 'Save carrier'}</Button>
        </SectionCard>
        </div>
      )}

      <DataTable
        columns={carrierColumns}
        rows={carriers}
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && carriers.length === 0}
        emptyIcon="ship"
        emptyTitle="No carriers yet"
        emptyMessage="Add one manually or browse the global directory above."
        defaultSortKey="name"
      />
    </div>
  );
}
