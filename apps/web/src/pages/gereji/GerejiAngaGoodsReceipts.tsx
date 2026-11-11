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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Receipt { id: string; supplier_id: string | null; po_reference: string | null; received_at: string }
interface ReceiptLine { id: string; stock_unit_id: string; inspection_outcome: string; inspected_at: string | null; serial: string | null; condition: string; availability: string; pn: string }
interface Part { id: string; pn: string }
interface Supplier { id: string; name: string }
interface Location { id: string; warehouse: string; zone: string | null; rack: string | null; shelf: string | null; bin: string | null }
interface DraftLine { part_id: string; serial: string }

const OUTCOME_BADGE: Record<string, 'gray' | 'success' | 'warning' | 'error'> = { pending: 'gray', accepted: 'success', quarantined: 'warning', rejected: 'error' };


export function GerejiAngaGoodsReceipts() {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [inspectDialog, setInspectDialog] = useState<{ receiptId: string; lineId: string } | null>(null);
  const [outcome, setOutcome] = useState<'accepted' | 'quarantined' | 'rejected'>('accepted');

  const [supplierId, setSupplierId] = useState('');
  const [poReference, setPoReference] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ part_id: '', serial: '' }]);

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/goods-receipts').then(d => setRows(d.receipts ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/anga/parts').then(d => setParts(d.parts ?? []));
    apiFetch('/v1/gereji/anga/suppliers').then(d => setSuppliers(d.suppliers ?? []));
    apiFetch('/v1/gereji/anga/locations').then(d => setLocations(d.locations ?? []));
  }, [reload]);

  function resetForm() { setSupplierId(''); setPoReference(''); setDraftLines([{ part_id: '', serial: '' }]); }

  async function create() {
    if (draftLines.some(l => !l.part_id)) { showAlert('Select a part for every line.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/goods-receipts', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: supplierId || undefined, po_reference: poReference.trim() || undefined,
          lines: draftLines.map(l => ({ part_id: l.part_id, serial: l.serial.trim() || undefined })),
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create receipt.'); }
    finally { setSaving(false); }
  }

  async function expand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const d = await apiFetch(`/v1/gereji/anga/goods-receipts/${id}`).catch(() => ({ lines: [] }));
    setLines(d.lines ?? []);
  }

  async function inspect() {
    if (!inspectDialog) return;
    try {
      await apiFetch(`/v1/gereji/anga/goods-receipts/${inspectDialog.receiptId}/lines/${inspectDialog.lineId}/inspect`, {
        method: 'POST', body: JSON.stringify({ outcome }),
      });
      setInspectDialog(null);
      const d = await apiFetch(`/v1/gereji/anga/goods-receipts/${inspectDialog.receiptId}`);
      setLines(d.lines ?? []);
    } catch (e: any) { showAlert(e.message || 'Inspection failed.'); }
  }

  async function putaway(receiptId: string, lineId: string, locationId: string) {
    try {
      await apiFetch(`/v1/gereji/anga/goods-receipts/${receiptId}/lines/${lineId}/putaway`, { method: 'POST', body: JSON.stringify({ location_id: locationId }) });
      const d = await apiFetch(`/v1/gereji/anga/goods-receipts/${receiptId}`);
      setLines(d.lines ?? []);
      showAlert('Stocked away.', { variant: 'success' });
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Goods"
        titleEm="receipts"
        subtitle="Intake, inspection and putaway — the start of every stock unit's life."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Receipt</Button>}
      />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No goods receipts yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['PO Reference', 'Supplier', 'Received', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(r => {
                    const supplier = suppliers.find(s => s.id === r.supplier_id);
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => expand(r.id)}>
                          <td style={{ ...TD, fontWeight: 600 }}>{r.po_reference ?? '—'}</td>
                          <td style={TD}>{supplier?.name ?? '—'}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.received_at)}</td>
                          <td style={{ ...TD, textAlign: 'right' }}><Icon name="chevronDown" size={14} /></td>
                        </tr>
                        {expanded === r.id && (
                          <tr><td colSpan={4} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                            <div style={{ padding: '12px 24px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead><tr>{['PN', 'Serial', 'Condition', 'Availability', 'Inspection', ''].map(h => <th key={h} style={{ ...TH, fontSize: 10, padding: '6px 12px' }}>{h}</th>)}</tr></thead>
                                <tbody>
                                  {lines.map(l => (
                                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font)' }}>{l.pn}</td>
                                      <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{l.serial ?? '—'}</td>
                                      <td style={{ padding: '8px 12px' }}><Badge variant="gray">{l.condition}</Badge></td>
                                      <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{l.availability.replace(/_/g, ' ')}</td>
                                      <td style={{ padding: '8px 12px' }}><Badge variant={OUTCOME_BADGE[l.inspection_outcome] ?? 'gray'}>{l.inspection_outcome}</Badge></td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={14} /></Button></DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            {l.inspection_outcome === 'pending' && <DropdownMenuItem onClick={() => setInspectDialog({ receiptId: r.id, lineId: l.id })}>Inspect</DropdownMenuItem>}
                                            {locations.map(loc => (
                                              <DropdownMenuItem key={loc.id} onClick={() => putaway(r.id, l.id, loc.id)}>
                                                Put away: {[loc.warehouse, loc.zone, loc.rack, loc.shelf, loc.bin].filter(Boolean).join('/')}
                                              </DropdownMenuItem>
                                            ))}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New goods receipt</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Supplier (optional)</label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><label style={LABEL}>PO reference</label><Input value={poReference} onChange={e => setPoReference(e.target.value)} /></div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={LABEL as React.CSSProperties}>Lines</label>
                  <Button variant="ghost" size="sm" onClick={() => setDraftLines(prev => [...prev, { part_id: '', serial: '' }])}><Icon name="plus" size={12} /> Add line</Button>
                </div>
                {draftLines.map((l, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <Select value={l.part_id} onValueChange={v => setDraftLines(prev => prev.map((x, j) => j === i ? { ...x, part_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                      <SelectContent>{parts.map(p => <SelectItem key={p.id} value={p.id}>{p.pn}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Serial (optional)" value={l.serial} onChange={e => setDraftLines(prev => prev.map((x, j) => j === i ? { ...x, serial: e.target.value } : x))} />
                    <Button variant="ghost" size="icon" onClick={() => setDraftLines(prev => prev.filter((_, j) => j !== i))} disabled={draftLines.length === 1}><Icon name="close" size={14} /></Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create receipt'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inspectDialog} onOpenChange={v => { if (!v) setInspectDialog(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Inspect unit</DialogTitle></DialogHeader>
          <DialogBody>
            <label style={LABEL}>Outcome</label>
            <Select value={outcome} onValueChange={v => setOutcome(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted">Accepted — into service</SelectItem>
                <SelectItem value="quarantined">Quarantined — hold for review</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectDialog(null)}>Cancel</Button>
            <Button onClick={inspect}>Record outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
