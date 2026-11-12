import React, { useEffect, useState, useCallback } from 'react';
import { TH, TD } from './shared.js';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface Estimate {
  id: string; estimate_number: string; vehicle_id: string; customer_id: string | null;
  status: string; labour_total: number; parts_total: number; tax_total: number;
  grand_total: number; currency: string; notes: string | null; job_card_id: string | null;
  created_at: string;
}
interface EstimateLine {
  id: string; line_type: string; description: string; quantity: number;
  unit_price: number; total: number; part_number: string | null;
}
interface Vehicle { id: string; registration: string; make: string | null; model: string | null }
interface DraftLine { line_type: string; description: string; quantity: number; unit_price: number; part_number: string }

const EST_BADGE: Record<string, 'gray' | 'info' | 'success' | 'error' | 'warning' | 'brand'> = {
  draft: 'gray', sent: 'info', approved: 'success', rejected: 'error', expired: 'warning', converted: 'brand',
};
const LINE_TYPES = ['labour', 'part', 'sublet', 'misc'] as const;


export function GerejiEstimates() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Estimate[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState<EstimateLine[]>([]);

  // new-estimate form
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ line_type: 'labour', description: '', quantity: 1, unit_price: 0, part_number: '' }]);

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/estimates').then(d => setRows(d.estimates ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/vehicles').then(d => setVehicles(d.vehicles ?? []));
  }, [reload]);

  function resetForm() { setVehicleId(''); setNotes(''); setLines([{ line_type: 'labour', description: '', quantity: 1, unit_price: 0, part_number: '' }]); }

  async function handleCreate() {
    if (!vehicleId) { showAlert('Select a vehicle.'); return; }
    if (lines.some(l => !l.description.trim())) { showAlert('Every line needs a description.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/estimates', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: vehicleId, notes: notes || undefined, lines: lines.map((l, i) => ({ ...l, sort_order: i })) }),
      });
      setShowNew(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create estimate.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/gereji/estimates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function convert(id: string) {
    try {
      await apiFetch(`/v1/gereji/estimates/${id}/convert`, { method: 'POST' });
      showAlert('Job card created — view it in the Job Cards page.', { variant: 'success' });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function handleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const d = await apiFetch(`/v1/gereji/estimates/${id}`);
      setExpandedLines(d.lines ?? []);
    } catch { setExpandedLines([]); }
  }

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  const labourTotal = lines.reduce((s, l) => s + (l.line_type === 'labour' ? l.quantity * l.unit_price : 0), 0);
  const partsTotal = lines.reduce((s, l) => s + (l.line_type !== 'labour' ? l.quantity * l.unit_price : 0), 0);
  const tax = (labourTotal + partsTotal) * 0.18;
  const grand = labourTotal + partsTotal + tax;

  const filtered = q.trim() ? rows.filter(r => r.estimate_number.toLowerCase().includes(q.toLowerCase())) : rows;

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'Sales']}
        titlePlain="Repair"
        titleEm="estimates"
        subtitle="Quoted repairs awaiting customer approval — labour, parts and total breakdown."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New Estimate</Button>}
      />

      <SearchToolbar search={q} onSearch={setQ} placeholder="Search estimates..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              {rows.length === 0 ? 'No estimates yet.' : 'No matches.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Estimate #', 'Vehicle', 'Status', 'Total', 'Created', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const veh = vehicles.find(v => v.id === r.vehicle_id);
                    return (
                      <React.Fragment key={r.id}>
                        <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => handleExpand(r.id)}>
                          <td style={{ ...TD, fontWeight: 600 }}>{r.estimate_number}</td>
                          <td style={TD}>{veh ? `${veh.registration} ${veh.make ?? ''}`.trim() : r.vehicle_id.slice(0, 8)}</td>
                          <td style={TD}><Badge variant={EST_BADGE[r.status] ?? 'gray'}>{r.status}</Badge></td>
                          <td style={TD}>{Number(r.grand_total).toLocaleString()} {r.currency}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.created_at)}</td>
                          <td style={{ ...TD, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {r.status === 'draft' && <DropdownMenuItem onClick={() => transition(r.id, 'sent')}>Send to customer</DropdownMenuItem>}
                                {r.status === 'sent' && <DropdownMenuItem onClick={() => transition(r.id, 'approved')}>Approve</DropdownMenuItem>}
                                {r.status === 'sent' && <DropdownMenuItem onClick={() => transition(r.id, 'rejected')}>Reject</DropdownMenuItem>}
                                {r.status === 'approved' && !r.job_card_id && <DropdownMenuItem onClick={() => convert(r.id)}>Convert to Job Card</DropdownMenuItem>}
                                {r.job_card_id && <DropdownMenuItem onClick={() => navigate('/gereji/job-cards')}>View Job Card</DropdownMenuItem>}
                                {r.job_card_id && <DropdownMenuItem onClick={() => navigate('/finops/journal')}>View costs in FinOps</DropdownMenuItem>}
                                {['rejected', 'expired'].includes(r.status) && <DropdownMenuItem onClick={() => transition(r.id, 'draft')}>Revert to draft</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {expanded === r.id && (
                          <tr><td colSpan={6} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                            <div style={{ padding: '12px 24px' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</div>
                              {expandedLines.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No lines.</div> : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                  <thead><tr>{['Type', 'Description', 'Qty', 'Unit Price', 'Total'].map(h => <th key={h} style={{ ...TH, fontSize: 10, padding: '6px 12px' }}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {expandedLines.map(l => (
                                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 12px' }}><Badge variant={l.line_type === 'labour' ? 'brand' : 'gray'}>{l.line_type}</Badge></td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>{l.description}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{l.quantity}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{Number(l.unit_price).toLocaleString()}</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--ink)' }}>{Number(l.total).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
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

      {/* ── New Estimate Dialog ── */}
      <Dialog open={showNew} onOpenChange={v => { if (!v) { setShowNew(false); resetForm(); } }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>New Estimate</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Vehicle</label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.registration} {v.make ? `— ${v.make} ${v.model ?? ''}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Notes</label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Line Items</label>
                  <Button variant="ghost" size="sm" onClick={() => setLines(prev => [...prev, { line_type: 'labour', description: '', quantity: 1, unit_price: 0, part_number: '' }])}>
                    <Icon name="plus" size={12} /> Add Line
                  </Button>
                </div>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 70px 100px auto', gap: 8, marginBottom: 8, alignItems: 'start' }}>
                    <Select value={l.line_type} onValueChange={v => updateLine(i, { line_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Description" value={l.description} onChange={e => updateLine(i, { description: e.target.value })} />
                    <Input type="number" min={1} value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) || 1 })} />
                    <Input type="number" min={0} value={l.unit_price} onChange={e => updateLine(i, { unit_price: Number(e.target.value) || 0 })} />
                    <Button variant="ghost" size="icon" onClick={() => setLines(prev => prev.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                      <Icon name="close" size={14} />
                    </Button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--ink3)' }}>Labour: <strong style={{ color: 'var(--ink)' }}>{labourTotal.toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--ink3)' }}>Parts: <strong style={{ color: 'var(--ink)' }}>{partsTotal.toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--ink3)' }}>Tax (18%): <strong style={{ color: 'var(--ink)' }}>{Math.round(tax).toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--ink3)' }}>Total: <strong style={{ color: 'var(--teal)', fontSize: 14 }}>{Math.round(grand).toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving} loadingText="Creating…">Create Estimate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
