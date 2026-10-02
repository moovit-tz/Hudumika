import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface TransferLine { id: string; lot_id: string; qty_requested: string; qty_actual: string | null; notes: string | null; lot: any | null; }
interface Transfer {
  id: string; transfer_ref: string; status: string;
  from_compartment_id: string | null; to_compartment_id: string | null;
  from_zone: string | null; to_zone: string | null;
  requested_by: string | null; approved_by: string | null; executed_by: string | null;
  requested_at: string; approved_at: string | null; executed_at: string | null; expected_at: string | null;
  notes: string | null; lines: TransferLine[];
}

const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'gray'> = {
  DRAFT: 'gray', PENDING_APPROVAL: 'warning', APPROVED: 'brand',
  IN_PROGRESS: 'brand', COMPLETED: 'success', CANCELLED: 'error',
};

// ── New Transfer form ───────────────────────────────────────────────────────
interface NewTransferForm {
  fromCompartmentId: string;
  toCompartmentId: string;
  fromZone: string;
  toZone: string;
  expectedAt: string;
  notes: string;
  lines: Array<{ lotId: string; qtyRequested: string; notes: string }>;
}

export function SealStockTransferNew() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NewTransferForm>({
    fromCompartmentId: '', toCompartmentId: '', fromZone: '', toZone: '',
    expectedAt: '', notes: '',
    lines: [{ lotId: '', qtyRequested: '', notes: '' }],
  });
  const [compartments, setCompartments] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((r: any) => setCompartments((Array.isArray(r) ? r : []).map((c: any) => ({ value: c.id, label: c.name }))))
      .catch(() => {});
  }, []);

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { lotId: '', qtyRequested: '', notes: '' }] }));
  }
  function removeLine(i: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }
  function updateLine(i: number, field: keyof NewTransferForm['lines'][0], val: string) {
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: val } : l) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = form.lines.filter(l => l.lotId.trim() && Number(l.qtyRequested) > 0);
    if (validLines.length === 0) { showAlert('Add at least one lot to transfer.'); return; }
    setSaving(true);
    try {
      const result: any = await apiFetch('/v1/seal/stock-transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromCompartmentId: form.fromCompartmentId || undefined,
          toCompartmentId: form.toCompartmentId || undefined,
          fromZone: form.fromZone || undefined,
          toZone: form.toZone || undefined,
          expectedAt: form.expectedAt || undefined,
          notes: form.notes || undefined,
          lines: validLines.map(l => ({ lotId: l.lotId, qtyRequested: Number(l.qtyRequested), notes: l.notes || undefined })),
        }),
      });
      navigate(`/seal/stock-transfers/${result.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create transfer.');
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  return (
    <div className="seal-page">
      <PageHeader crumbs={['SEAL', 'Stock Transfers', 'New']} titlePlain="New stock" titleEm="transfer" subtitle="Request a movement of lots between warehouses or zones." />
      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div className="seal-card" style={{ marginBottom: 16 }}>
          <div className="seal-card-header">Transfer Details</div>
          <div className="seal-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>From Warehouse</label>
                <Combobox options={compartments} value={form.fromCompartmentId} onChange={(v: string) => setForm(f => ({ ...f, fromCompartmentId: v }))} placeholder="Any compartment" />
              </div>
              <div>
                <label style={lbl}>To Warehouse</label>
                <Combobox options={compartments} value={form.toCompartmentId} onChange={(v: string) => setForm(f => ({ ...f, toCompartmentId: v }))} placeholder="Any compartment" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>From Zone</label>
                <input type="text" style={inp} value={form.fromZone} onChange={e => setForm(f => ({ ...f, fromZone: e.target.value }))} placeholder="e.g. RECEIVING-A" />
              </div>
              <div>
                <label style={lbl}>To Zone</label>
                <input type="text" style={inp} value={form.toZone} onChange={e => setForm(f => ({ ...f, toZone: e.target.value }))} placeholder="e.g. BULK-02" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Expected Completion</label>
                <input type="date" style={inp} value={form.expectedAt} onChange={e => setForm(f => ({ ...f, expectedAt: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="seal-card" style={{ marginBottom: 16 }}>
          <div className="seal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Lots to Transfer</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}><Icon name="plus" size={12} /> Add Line</button>
          </div>
          <div className="seal-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form.lines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  {i === 0 && <label style={lbl}>Lot ID</label>}
                  <input type="text" style={inp} value={line.lotId} onChange={e => updateLine(i, 'lotId', e.target.value)} placeholder="Lot identifier" />
                </div>
                <div>
                  {i === 0 && <label style={lbl}>Qty</label>}
                  <input type="number" style={inp} min="0.0001" step="any" value={line.qtyRequested} onChange={e => updateLine(i, 'qtyRequested', e.target.value)} placeholder="0" />
                </div>
                <div>
                  {i === 0 && <label style={lbl}>Notes</label>}
                  <input type="text" style={inp} value={line.notes} onChange={e => updateLine(i, 'notes', e.target.value)} placeholder="Optional" />
                </div>
                <div style={{ paddingBottom: 1 }}>
                  {form.lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '9px 6px', display: 'flex', alignItems: 'center' }}>
                      <Icon name="trash2" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Transfer'}</Button>
        </div>
      </form>
    </div>
  );
}

// ── Transfer Detail ─────────────────────────────────────────────────────────
export function SealStockTransferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/stock-transfers/${id}`)
      .then((r: any) => setTransfer(r))
      .catch(() => navigate('/seal/stock-transfers'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]);

  async function doAction(action: 'approve' | 'execute' | 'cancel') {
    if (!id) return;
    const labels = { approve: 'Approve', execute: 'Execute', cancel: 'Cancel' };
    if (!window.confirm(`${labels[action]} this transfer?`)) return;
    setActioning(true);
    try {
      const updated: any = await apiFetch(`/v1/seal/stock-transfers/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      setTransfer(prev => prev ? { ...prev, ...updated } : null);
    } catch (err: any) {
      showAlert(err.message || 'Action failed.');
    } finally {
      setActioning(false);
    }
  }

  if (loading) return <div className="seal-page"><SectionLoading /></div>;
  if (!transfer) return null;

  const t = transfer;
  const canApprove  = t.status === 'PENDING_APPROVAL';
  const canExecute  = ['APPROVED', 'IN_PROGRESS'].includes(t.status);
  const canCancel   = !['COMPLETED', 'CANCELLED'].includes(t.status);

  const dt: React.CSSProperties = { fontSize: 13, color: 'var(--ink)' };
  const dd: React.CSSProperties = { fontSize: 12, color: 'var(--ink3)', marginBottom: 14 };

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Stock Transfers', t.transfer_ref]}
        titlePlain="Transfer"
        titleEm={t.transfer_ref.toLowerCase()}
        subtitle={`Requested ${new Date(t.requested_at).toLocaleDateString()} · ${t.lines.length} lot${t.lines.length !== 1 ? 's' : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canApprove  && <button className="btn btn-secondary btn-sm" disabled={actioning} onClick={() => doAction('approve')}>Approve</button>}
            {canExecute  && <Button disabled={actioning} onClick={() => doAction('execute')}>Execute Transfer</Button>}
            {canCancel   && <button className="btn btn-sm" style={{ background: 'var(--red-l)', color: 'var(--red)', border: 'none' }} disabled={actioning} onClick={() => doAction('cancel')}>Cancel</button>}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Header card */}
        <div className="seal-card">
          <div className="seal-card-header">Transfer Summary</div>
          <div className="seal-card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={dt}>Status</div>
                <div style={dd}><Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>{t.status.replace(/_/g, ' ')}</Badge></div>
              </div>
              <div>
                <div style={dt}>Reference</div>
                <div style={{ ...dd, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>{t.transfer_ref}</div>
              </div>
              <div>
                <div style={dt}>From</div>
                <div style={dd}>{t.from_zone ?? t.from_compartment_id ?? '—'}</div>
              </div>
              <div>
                <div style={dt}>To</div>
                <div style={dd}>{t.to_zone ?? t.to_compartment_id ?? '—'}</div>
              </div>
              <div>
                <div style={dt}>Expected By</div>
                <div style={{ ...dd, color: t.expected_at && !['COMPLETED','CANCELLED'].includes(t.status) && new Date(t.expected_at) < new Date() ? 'var(--red)' : 'var(--ink3)' }}>
                  {t.expected_at ? new Date(t.expected_at).toLocaleDateString() : '—'}
                </div>
              </div>
              <div>
                <div style={dt}>Executed At</div>
                <div style={dd}>{t.executed_at ? new Date(t.executed_at).toLocaleDateString() : '—'}</div>
              </div>
            </div>
            {t.notes && <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink2)' }}>{t.notes}</div>}
          </div>
        </div>

        {/* Actors card */}
        <div className="seal-card">
          <div className="seal-card-header">Workflow</div>
          <div className="seal-card-body">
            {[
              { label: 'Requested By', userId: t.requested_by, date: t.requested_at },
              { label: 'Approved By',  userId: t.approved_by,  date: t.approved_at },
              { label: 'Executed By',  userId: t.executed_by,  date: t.executed_at },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <PersonAvatar userId={row.userId} name={row.label} size={28} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                    {row.userId ? row.userId.slice(0, 8) + '…' : '—'}
                    {row.date && <span style={{ color: 'var(--ink3)', marginLeft: 8, fontSize: 11 }}>{new Date(row.date).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="seal-card">
        <div className="seal-card-header">Transfer Lines ({t.lines.length})</div>
        <div className="seal-card-body">
          {t.lines.length === 0 ? (
            <div className="seal-empty">No lines on this transfer.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot Ref</th>
                  <th>Description</th>
                  <th>Qty Requested</th>
                  <th>Qty Actual</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {t.lines.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                      {l.lot?.lot_ref ?? l.lot_id.slice(0, 12) + '…'}
                    </td>
                    <td style={{ fontSize: 13 }}>{l.lot?.description ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{parseFloat(l.qty_requested).toLocaleString()} {l.lot?.unit ?? ''}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: l.qty_actual ? 'var(--ink)' : 'var(--ink3)' }}>
                      {l.qty_actual ? parseFloat(l.qty_actual).toLocaleString() : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{l.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
