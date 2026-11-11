import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Location { id: string; warehouse: string; zone: string | null; rack: string | null; shelf: string | null; bin: string | null; customs_zone: string }

const CUSTOMS_BADGE: Record<string, 'gray' | 'warning' | 'brand'> = { DUTY_PAID: 'gray', BONDED: 'warning', FREE_ZONE: 'brand' };


export function GerejiAngaLocations() {
  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [warehouse, setWarehouse] = useState('Main');
  const [zone, setZone] = useState('');
  const [rack, setRack] = useState('');
  const [shelf, setShelf] = useState('');
  const [bin, setBin] = useState('');
  const [customsZone, setCustomsZone] = useState('DUTY_PAID');

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/locations').then(d => setRows(d.locations ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function resetForm() { setWarehouse('Main'); setZone(''); setRack(''); setShelf(''); setBin(''); setCustomsZone('DUTY_PAID'); }

  async function create() {
    if (!warehouse.trim()) { showAlert('Enter the warehouse name.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/locations', {
        method: 'POST',
        body: JSON.stringify({
          warehouse: warehouse.trim(), zone: zone.trim() || undefined, rack: rack.trim() || undefined,
          shelf: shelf.trim() || undefined, bin: bin.trim() || undefined, customs_zone: customsZone,
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create location.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Warehouse"
        titleEm="locations"
        subtitle="Bin-addressable storage — warehouse, zone, rack, shelf and customs status."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Location</Button>}
      />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No locations yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Warehouse', 'Zone', 'Rack', 'Shelf', 'Bin', 'Customs'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...TD, fontWeight: 600 }}>{l.warehouse}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{l.zone ?? '—'}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{l.rack ?? '—'}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{l.shelf ?? '—'}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{l.bin ?? '—'}</td>
                      <td style={TD}><Badge variant={CUSTOMS_BADGE[l.customs_zone] ?? 'gray'}>{l.customs_zone.replace(/_/g, ' ')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New location</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Warehouse</label><Input value={warehouse} onChange={e => setWarehouse(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Zone</label><Input value={zone} onChange={e => setZone(e.target.value)} /></div>
                <div><label style={LABEL}>Rack</label><Input value={rack} onChange={e => setRack(e.target.value)} /></div>
                <div><label style={LABEL}>Shelf</label><Input value={shelf} onChange={e => setShelf(e.target.value)} /></div>
                <div><label style={LABEL}>Bin</label><Input value={bin} onChange={e => setBin(e.target.value)} /></div>
              </div>
              <div>
                <label style={LABEL}>Customs zone</label>
                <Select value={customsZone} onValueChange={setCustomsZone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DUTY_PAID">Duty paid</SelectItem>
                    <SelectItem value="BONDED">Bonded</SelectItem>
                    <SelectItem value="FREE_ZONE">Free zone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create location'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
