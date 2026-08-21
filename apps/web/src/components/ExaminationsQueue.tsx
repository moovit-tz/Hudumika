import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Textarea } from './ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js';

/**
 * The SEAL examination worklist for one shipment — see
 * seal-examinations.routes.ts's own comment for the backend (triage across
 * declarations, GREEN arrives pre-waived, an officer only ever acts on
 * YELLOW/RED). Examination is a step within a shipment's own clearance, not
 * a separate process, so this renders inline on ShipmentDetail rather than
 * as its own worklist page — it used to be a standalone "Examinations" view
 * mode on Ops Command's board/list toggle, which put it outside any one
 * shipment's context even though every row already carries a real (if soft)
 * link back to one. Examinations are keyed to a SEAL bonded lot, not
 * directly to a ClearOS shipment — `seal_lots.shipment_case_id` is a soft
 * reference, so a shipment with no bonded lot simply has no examinations.
 */

interface Examination {
  id: string;
  customsEntryId: string;
  lotDescription?: string;
  shipmentCaseId?: string;
  selectivityChannel: string;
  examinationType: string;
  status: 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'WAIVED';
  officerName: string | null;
  officerReference: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  outcome: string | null;
  findings: string | null;
  createdAt: string;
}

const CHANNEL_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  GREEN: 'success', YELLOW: 'warning', RED: 'error', BLUE: 'gray',
};
const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success'> = {
  REQUESTED: 'gray', SCHEDULED: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', WAIVED: 'gray',
};
const OUTCOME_OPTIONS = [
  { value: 'CLEARED', label: 'Cleared — no issue found' },
  { value: 'DISCREPANCY_FOUND', label: 'Discrepancy found' },
  { value: 'SEIZURE_RECOMMENDED', label: 'Seizure recommended' },
];

export function ExaminationsQueue({ shipmentId }: { shipmentId: string }) {
  const [rows, setRows] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [acting, setActing] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Examination | null>(null);
  const [outcome, setOutcome] = useState('');
  const [findings, setFindings] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/seal/examinations?shipment_case_id=${shipmentId}`)
      .then((res: any) => setRows(Array.isArray(res) ? res : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  useEffect(load, [load]);

  const visible = statusFilter === 'pending'
    ? rows.filter(r => r.status !== 'COMPLETED' && r.status !== 'WAIVED')
    : rows;

  const patch = async (id: string, body: Record<string, any>) => {
    setActing(id);
    try {
      await apiFetch(`/v1/seal/examinations/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this examination.', { variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const schedule = (row: Examination) => patch(row.id, { status: 'SCHEDULED' });
  const start = (row: Examination) => patch(row.id, { status: 'IN_PROGRESS' });
  const waive = async (row: Examination) => {
    const ok = await showConfirm('Waive this examination? It will be recorded as not requiring inspection.', { variant: 'warning', confirmLabel: 'Waive' });
    if (!ok) return;
    patch(row.id, { status: 'WAIVED' });
  };

  const openComplete = (row: Examination) => { setCompleting(row); setOutcome(''); setFindings(''); };
  const submitComplete = async () => {
    if (!completing || !outcome) return;
    await patch(completing.id, { status: 'COMPLETED', outcome, findings: findings.trim() || null });
    setCompleting(null);
  };

  if (!loading && rows.length === 0) return null;

  return (
    <div style={{ padding: '10px 24px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="search" size={13} color="var(--ink3)" /> Examination
        </div>
        {rows.length > 0 && (
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
            <SelectTrigger className="w-35 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Open only</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '12px 0', color: 'var(--ink3)', fontSize: 12.5 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: '8px 0 12px', color: 'var(--ink3)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="checkCircle" size={14} /> No examinations waiting on an officer right now.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lot</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channel</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Officer</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {visible.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.lotDescription ?? '—'}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={CHANNEL_VARIANT[row.selectivityChannel] ?? 'gray'}>{row.selectivityChannel}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.examinationType}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>{row.status.replace('_', ' ')}</Badge>
                    {row.status === 'COMPLETED' && row.outcome && (
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{row.outcome.replace(/_/g, ' ').toLowerCase()}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{row.officerName ?? '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {row.status === 'REQUESTED' && (
                        <Button size="xs" variant="outline" disabled={acting === row.id} onClick={() => schedule(row)}>Schedule</Button>
                      )}
                      {row.status === 'SCHEDULED' && (
                        <Button size="xs" variant="outline" disabled={acting === row.id} onClick={() => start(row)}>Start</Button>
                      )}
                      {(row.status === 'REQUESTED' || row.status === 'SCHEDULED' || row.status === 'IN_PROGRESS') && (
                        <>
                          <Button size="xs" disabled={acting === row.id} onClick={() => openComplete(row)}>Complete</Button>
                          <Button size="xs" variant="ghost" disabled={acting === row.id} onClick={() => waive(row)}>Waive</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!completing} onOpenChange={o => !o && setCompleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete examination</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Outcome</div>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue placeholder="Select an outcome" /></SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Findings (optional)</div>
              <Textarea value={findings} onChange={e => setFindings(e.target.value)} rows={4} placeholder="What the examining officer found…" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
              <Button disabled={!outcome || acting === completing?.id} onClick={submitComplete}>Save outcome</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
