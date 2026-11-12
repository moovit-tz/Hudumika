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

interface Sla { pausedMs: number; elapsedMs: number; remainingMs: number; breached: boolean }
interface AogCase {
  id: string; customer_id: string | null; aircraft_reg: string | null; criticality: string;
  current_milestone: string; opened_at: string; target_resolution_at: string | null; sla: Sla | null;
}
interface Customer { id: string; name: string }

const MILESTONES = ['REQUEST_RECEIVED', 'PART_LOCATED', 'QUOTE_ISSUED', 'CUSTOMER_APPROVED', 'PO_PLACED', 'COLLECTED', 'IN_FLIGHT', 'LANDED', 'CUSTOMS_CLEARED', 'DELIVERED'];
const PAUSE_REASONS = ['AWAITING_CUSTOMER', 'PUBLIC_HOLIDAY', 'CARRIER_DELAY', 'CUSTOMS_QUERY'] as const;

const CRITICALITY_BADGE: Record<string, 'gray' | 'warning' | 'error'> = { low: 'gray', medium: 'gray', high: 'warning', critical: 'error' };

function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600_000);
  const mins = Math.floor((abs % 3600_000) / 60_000);
  return `${sign}${hours}h ${mins}m`;
}


export function GerejiAngaAog() {
  const [rows, setRows] = useState<AogCase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pauseDialog, setPauseDialog] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState<string>(PAUSE_REASONS[0]);

  const [customerId, setCustomerId] = useState('');
  const [aircraftReg, setAircraftReg] = useState('');
  const [criticality, setCriticality] = useState('high');
  const [targetHours, setTargetHours] = useState('24');
  const [notes, setNotes] = useState('');

  const reload = useCallback(() => {
    apiFetch('/v1/gereji/anga/aog-cases').then(d => setRows(d.cases ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/anga/customers').then(d => setCustomers(d.customers ?? []));
    // SLA clocks are time-based — refresh every 30s to keep remaining/breached current without a page reload.
    const interval = setInterval(reload, 30_000);
    return () => clearInterval(interval);
  }, [reload]);

  function resetForm() { setCustomerId(''); setAircraftReg(''); setCriticality('high'); setTargetHours('24'); setNotes(''); }

  async function create() {
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/aog-cases', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId || undefined, aircraft_reg: aircraftReg.trim() || undefined, criticality,
          target_resolution_at: targetHours ? new Date(Date.now() + Number(targetHours) * 3600_000).toISOString() : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to open AOG case.'); }
    finally { setSaving(false); }
  }

  async function advance(id: string) {
    try {
      await apiFetch(`/v1/gereji/anga/aog-cases/${id}/advance`, { method: 'POST' });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function pause(id: string) {
    try {
      await apiFetch(`/v1/gereji/anga/aog-cases/${id}/pause`, { method: 'POST', body: JSON.stringify({ reason: pauseReason }) });
      setPauseDialog(null);
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function resume(id: string) {
    try {
      await apiFetch(`/v1/gereji/anga/aog-cases/${id}/resume`, { method: 'POST' });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="AOG"
        titleEm="desk"
        subtitle="Aircraft-on-ground cases — milestone progress and live SLA tracking."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Open AOG Case</Button>}
      />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No AOG cases open.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Aircraft', 'Customer', 'Criticality', 'Milestone', 'SLA', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(c => {
                    const customer = customers.find(x => x.id === c.customer_id);
                    const isDelivered = c.current_milestone === 'DELIVERED';
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{c.aircraft_reg ?? '—'}</td>
                        <td style={TD}>{customer?.name ?? '—'}</td>
                        <td style={TD}><Badge variant={CRITICALITY_BADGE[c.criticality] ?? 'gray'}>{c.criticality}</Badge></td>
                        <td style={TD}>
                          <Badge variant={isDelivered ? 'success' : 'brand'}>{c.current_milestone.replace(/_/g, ' ')}</Badge>
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink3)' }}>step {MILESTONES.indexOf(c.current_milestone) + 1}/10</span>
                        </td>
                        <td style={TD}>
                          {c.sla ? (
                            <span style={{ color: c.sla.breached ? 'var(--error, #dc2626)' : 'var(--ink)', fontWeight: c.sla.breached ? 700 : 400 }}>
                              {c.sla.breached ? `Breached by ${formatDuration(-c.sla.remainingMs)}` : `${formatDuration(c.sla.remainingMs)} left`}
                            </span>
                          ) : <span style={{ color: 'var(--ink3)' }}>No target set</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isDelivered && <DropdownMenuItem onClick={() => advance(c.id)}>Advance to next milestone</DropdownMenuItem>}
                              {!isDelivered && <DropdownMenuItem onClick={() => setPauseDialog(c.id)}>Pause SLA clock</DropdownMenuItem>}
                              {!isDelivered && <DropdownMenuItem onClick={() => resume(c.id)}>Resume SLA clock</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Open AOG case</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Customer</label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><label style={LABEL}>Aircraft registration</label><Input value={aircraftReg} onChange={e => setAircraftReg(e.target.value)} placeholder="e.g. 5H-LVA" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Criticality</label>
                  <Select value={criticality} onValueChange={setCriticality}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><label style={LABEL}>Target resolution (hours from now)</label><Input type="number" min={1} value={targetHours} onChange={e => setTargetHours(e.target.value)} /></div>
              </div>
              <div><label style={LABEL}>Notes</label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Opening…">Open case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pauseDialog} onOpenChange={v => { if (!v) setPauseDialog(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Pause SLA clock</DialogTitle></DialogHeader>
          <DialogBody>
            <label style={LABEL}>Reason</label>
            <Select value={pauseReason} onValueChange={setPauseReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAUSE_REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialog(null)}>Cancel</Button>
            <Button onClick={() => pauseDialog && pause(pauseDialog)}>Pause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
