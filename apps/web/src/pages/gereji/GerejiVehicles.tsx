import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Vehicle {
  id: string; registration: string; make: string | null; model: string | null;
  year: number | null; vin: string | null; color: string | null;
  mileage: number | null; customer_id: string | null; notes: string | null; created_at: string;
}

type Draft = {
  registration: string; customer: PickerItem | null; make: string; model: string;
  year: string; vin: string; mileage: string; color: string; notes: string;
};
const EMPTY_DRAFT: Draft = { registration: '', customer: null, make: '', model: '', year: '', vin: '', mileage: '', color: '', notes: '' };

export function GerejiVehicles() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/vehicles').then(d => setRows(d.vehicles ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = q.trim()
    ? rows.filter(r => [r.registration, r.make, r.model, r.vin].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    : rows;

  async function searchCustomers(query: string): Promise<PickerItem[]> {
    const qs = query.trim() ? `?search=${encodeURIComponent(query.trim())}&active=true` : '?active=true';
    const res = await apiFetch(`/v1/customers${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    return list.slice(0, 25).map(c => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined, avatarUserId: c.id, avatarKind: 'customers' as const, avatarType: 'company' as const }));
  }

  function openCreate() { setEditingId(null); setDraft(EMPTY_DRAFT); setOpen(true); }

  async function openEdit(v: Vehicle) {
    setEditingId(v.id);
    let customer: PickerItem | null = null;
    if (v.customer_id) {
      const found = await apiFetch(`/v1/customers/${v.customer_id}`).catch(() => null);
      if (found) customer = { id: found.id, label: found.name, avatarUserId: found.id, avatarKind: 'customers', avatarType: 'company' };
    }
    setDraft({
      registration: v.registration, customer, make: v.make ?? '', model: v.model ?? '',
      year: v.year?.toString() ?? '', vin: v.vin ?? '', mileage: v.mileage?.toString() ?? '',
      color: v.color ?? '', notes: v.notes ?? '',
    });
    setOpen(true);
  }

  async function save() {
    if (!draft.registration.trim()) { showAlert('Enter the registration plate.'); return; }
    setSaving(true);
    const body = {
      registration: draft.registration.trim(),
      customer_id: draft.customer?.id || null,
      make: draft.make.trim() || null, model: draft.model.trim() || null,
      year: draft.year ? Number(draft.year) : null,
      vin: draft.vin.trim() || null,
      mileage: draft.mileage ? Number(draft.mileage) : null,
      color: draft.color.trim() || null, notes: draft.notes.trim() || null,
    };
    try {
      if (editingId) await apiFetch(`/v1/gereji/vehicles/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiFetch('/v1/gereji/vehicles', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to save vehicle.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'Registry']}
        titlePlain="Customer"
        titleEm="vehicles"
        subtitle="Vehicle service history, VIN registry and maintenance schedules."
        actions={<Button onClick={openCreate}><Icon name="plus" size={14} /> New Vehicle</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search vehicles..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No vehicles registered yet.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Registration', 'Make', 'Model', 'Year', 'VIN', 'Mileage', 'Registered', ''].map(h => (
                      <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 18px', fontWeight: 600, color: 'var(--ink)' }}>{r.registration}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink)' }}>{r.make ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink)' }}>{r.model ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.year ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)', fontFamily: 'var(--font)', fontSize: 12 }}>{r.vin ?? '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{r.mileage != null ? `${r.mileage.toLocaleString()} km` : '—'}</td>
                      <td style={{ padding: '12px 18px', color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit vehicle' : 'New vehicle'}</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Registration</label>
                <Input value={draft.registration} onChange={e => setDraft(d => ({ ...d, registration: e.target.value }))} placeholder="e.g. T123ABC" />
              </div>
              <EntityPicker
                label="Customer" value={draft.customer} onChange={item => setDraft(d => ({ ...d, customer: item }))}
                search={searchCustomers} entityType="customer" placeholder="Search customers..."
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Make</label>
                  <Input value={draft.make} onChange={e => setDraft(d => ({ ...d, make: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Model</label>
                  <Input value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Year</label>
                  <Input type="number" value={draft.year} onChange={e => setDraft(d => ({ ...d, year: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Mileage (km)</label>
                  <Input type="number" value={draft.mileage} onChange={e => setDraft(d => ({ ...d, mileage: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>VIN</label>
                  <Input value={draft.vin} onChange={e => setDraft(d => ({ ...d, vin: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Color</label>
                  <Input value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Notes</label>
                <Textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Create vehicle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
