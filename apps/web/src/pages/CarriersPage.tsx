import React, { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { showAlert } from '../lib/alert.js';

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

const cardBox: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12 };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 };

export function CarriersPage() {
  const isMobile = useIsMobile();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', mode: 'OCEAN', scac_or_iata: '', contact_name: '', contact_email: '', contact_phone: '' });

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
    apiFetch('/v1/freight-booking/carriers').then(setCarriers).catch(() => {}).finally(() => setLoading(false));
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

  return (
    <div style={{ padding: '0 0 24px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['CargoTracker', 'Carriers']}
        titlePlain="Carrier"
        titleEm="directory"
        subtitle="Shipping lines, airlines, road and rail carriers used for rate cards and bookings"
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setShowDirectory(s => !s)}>
              <Icon name="search" size={15} /> {showDirectory ? 'Hide directory' : 'Browse directory'}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setShowForm(s => !s)}>
              <Icon name={showForm ? 'x' : 'plus'} size={15} /> {showForm ? 'Cancel' : 'Add Carrier'}
            </button>
          </div>
        }
      />

      {/* ── Browse the global carrier directory ── */}
      {showDirectory && (
        <div style={{ ...cardBox, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="globe" size={15} /></FeaturedIcon>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Global carrier directory</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>119 real ocean, air, road & rail carriers — search and add with one click</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                className="input-field"
                value={dirQuery}
                onChange={e => setDirQuery(e.target.value)}
                placeholder="Search by name, SCAC/IATA code, or country…"
                style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, height: 42 }}
              />
            </div>
            <SingleSelectFilter
              label="Mode"
              icon={<Icon name="filter" size={13} />}
              options={MODES}
              value={dirMode}
              onChange={setDirMode}
              allLabel="All modes"
            />
          </div>

          {dirLoading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Searching…</div>
          ) : dirResults.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No carriers match your search.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
              {dirResults.map(d => {
                const already = ownNames.has(`${d.name.toLowerCase()}__${d.mode}`);
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <FeaturedIcon variant="gray" size="sm" shape="circle"><Icon name={MODE_ICON[d.mode] ?? 'ship'} size={14} /></FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                        {d.scac_or_iata && <span style={{ fontFamily: 'var(--mono)' }}>{d.scac_or_iata}</span>}
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
                    >
                      {already ? <><Icon name="checkCircle" size={12} /> Added</> : addingId === d.id ? 'Adding…' : <><Icon name="plus" size={12} /> Add</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Manual add form ── */}
      {showForm && (
        <div style={{ ...cardBox, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={fieldLabel}>Name *</label>
              <input className="input-field" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Maersk Line" />
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
              <input className="input-field" value={form.scac_or_iata} onChange={e => setForm(p => ({ ...p, scac_or_iata: e.target.value }))} placeholder="e.g. MAEU" />
            </div>
            <div>
              <label style={fieldLabel}>Contact name</label>
              <input className="input-field" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            </div>
            <div>
              <label style={fieldLabel}>Contact email</label>
              <input className="input-field" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            </div>
            <div>
              <label style={fieldLabel}>Contact phone</label>
              <input className="input-field" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <button type="button" className="btn btn-primary btn-lg" onClick={saveCarrier} disabled={saving}>{saving ? 'Saving…' : 'Save Carrier'}</button>
        </div>
      )}

      <div style={{ ...cardBox, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading carriers…</div>
        ) : carriers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No carriers yet — add one manually or browse the directory above.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Mode', 'Code', 'Contact', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carriers.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{MODES.find(m => m.value === c.mode)?.label || c.mode}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{c.scac_or_iata || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{c.contact_name || c.contact_email || '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={c.active ? 'success' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
