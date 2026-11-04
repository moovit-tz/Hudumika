import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SealLot } from '@hudumika/types';
import { DatePicker, toDateOnlyString, parseDateOnly } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';

interface TransferLine {
  id: string;
  lot_id: string;
  qty_requested: string;
  qty_actual: string | null;
  notes: string | null;
  lot: any | null;
}

interface Transfer {
  id: string;
  transfer_ref: string;
  status: string;
  from_compartment_id: string | null;
  to_compartment_id: string | null;
  from_zone: string | null;
  to_zone: string | null;
  requested_by: string | null;
  approved_by: string | null;
  executed_by: string | null;
  requested_at: string;
  approved_at: string | null;
  executed_at: string | null;
  expected_at: string | null;
  notes: string | null;
  lines: TransferLine[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// Simplified colour palette – only brand and gray tokens
const STATUS_VARIANT: Record<string, 'brand' | 'gray'> = {
  DRAFT: 'gray',
  PENDING_APPROVAL: 'brand',
  APPROVED: 'brand',
  IN_PROGRESS: 'brand',
  COMPLETED: 'brand',
  CANCELLED: 'gray',
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
    fromCompartmentId: '',
    toCompartmentId: '',
    fromZone: '',
    toZone: '',
    expectedAt: '',
    notes: '',
    lines: [{ lotId: '', qtyRequested: '', notes: '' }],
  });
  const [compartments, setCompartments] = useState<Array<{ value: string; label: string }>>([]);
  const [lots, setLots] = useState<SealLot[]>([]);

  useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((r: any) =>
        setCompartments((Array.isArray(r) ? r : []).map((c: any) => ({ value: c.id, label: c.name })))
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    setForm(f => ({ ...f, lines: [{ lotId: '', qtyRequested: '', notes: '' }] }));
    if (!form.fromCompartmentId) {
      setLots([]);
      return;
    }
    apiFetch(`/v1/seal/lots?compartment_id=${form.fromCompartmentId}`)
      .then(setLots)
      .catch(e => showAlert(e.message));
  }, [form.fromCompartmentId]);

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { lotId: '', qtyRequested: '', notes: '' }] }));
  }

  function removeLine(i: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }

  function updateLine(i: number, field: keyof NewTransferForm['lines'][0], val: string) {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = form.lines.filter(l => l.lotId.trim() && Number(l.qtyRequested) > 0);
    if (validLines.length === 0) {
      showAlert('Add at least one lot to transfer.');
      return;
    }
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
          lines: validLines.map(l => ({
            lotId: l.lotId,
            qtyRequested: Number(l.qtyRequested),
            notes: l.notes || undefined,
          })),
        }),
      });
      navigate(`/seal/stock-transfers/${result.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create transfer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Stock Transfers', to: '/seal/stock-transfers' },
          'New',
        ]}
        titlePlain="New stock"
        titleEm="transfer"
        subtitle="Transfer whole, unallocated lots between warehouses or zones."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/seal/stock-transfers')}>
            <Icon name="arrowLeft" size={14} />
            <span>Back to Transfers</span>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} style={{ maxWidth: 840 }}>
        {/* Transfer Parameters Card */}
        <div className="seal-card" style={{ marginBottom: 16 }}>
          <div className="seal-card-hdr">
            <h3 className="seal-card-title">Transfer Routing & Schedule</h3>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  From Warehouse
                </label>
                <Combobox
                  options={compartments}
                  value={form.fromCompartmentId}
                  onChange={(v: string) => setForm(f => ({ ...f, fromCompartmentId: v }))}
                  placeholder="Choose origin warehouse"
                />
              </div>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  To Warehouse
                </label>
                <Combobox
                  options={compartments}
                  value={form.toCompartmentId}
                  onChange={(v: string) => setForm(f => ({ ...f, toCompartmentId: v }))}
                  placeholder="Choose destination warehouse"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  From Zone (optional)
                </label>
                <Input
                  value={form.fromZone}
                  onChange={e => setForm(f => ({ ...f, fromZone: e.target.value }))}
                  placeholder="e.g. RECEIVING-A"
                />
              </div>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  To Zone (optional)
                </label>
                <Input
                  value={form.toZone}
                  onChange={e => setForm(f => ({ ...f, toZone: e.target.value }))}
                  placeholder="e.g. BULK-02"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  Expected Completion Date
                </label>
                <DatePicker
                  date={parseDateOnly(form.expectedAt)}
                  onChange={date =>
                    setForm(f => ({ ...f, expectedAt: date ? toDateOnlyString(date) : '' }))
                  }
                  triggerClassName="w-full"
                />
              </div>
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Notes / Justification
              </label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Reason for transfer, special handling instructions..."
              />
            </div>
          </div>
        </div>

        {/* Transfer Lines Card */}
        <div className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-card-hdr">
            <h3 className="seal-card-title">Whole Lots to Transfer</h3>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Icon name="plus" size={14} />
              <span>Add Lot Line</span>
            </Button>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {form.lines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 2fr) minmax(100px, 1fr) minmax(150px, 1.5fr) auto',
                  gap: 10,
                  alignItems: 'end',
                }}
              >
                <div>
                  {i === 0 && (
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Lot ID & Description
                    </label>
                  )}
                  <Combobox
                    options={lots
                      .filter(l => l.qtyOnHand > 0 && l.qtyAllocated === 0)
                      .map(l => ({
                        value: l.id,
                        label: l.description,
                        sublabel: `${l.qtyOnHand} ${l.uom}`,
                      }))}
                    value={line.lotId}
                    onChange={value => {
                      const lot = lots.find(l => l.id === value);
                      setForm(f => ({
                        ...f,
                        lines: f.lines.map((l, index) =>
                          index === i
                            ? { ...l, lotId: value, qtyRequested: lot ? String(lot.qtyOnHand) : '' }
                            : l
                        ),
                      }));
                    }}
                    placeholder="Choose a stocked lot"
                  />
                </div>
                <div>
                  {i === 0 && (
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Transfer Qty
                    </label>
                  )}
                  <Input
                    type="number"
                    value={line.qtyRequested}
                    readOnly
                    aria-label="Whole lot quantity"
                    placeholder="0"
                  />
                </div>
                <div>
                  {i === 0 && (
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Line Notes
                    </label>
                  )}
                  <Input
                    type="text"
                    value={line.notes}
                    onChange={e => updateLine(i, 'notes', e.target.value)}
                    placeholder="Optional line notes"
                  />
                </div>
                <div>
                  {form.lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(i)}
                      aria-label="Remove line"
                      style={{ color: 'var(--red)' }}
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/seal/stock-transfers')}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Creating…' : 'Create Transfer'}
          </Button>
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

  useEffect(() => {
    load();
  }, [id]);

  async function doAction(action: 'approve' | 'execute' | 'cancel') {
    if (!id) return;
    const labels = { approve: 'Approve', execute: 'Execute', cancel: 'Cancel' };
    const ok = await showConfirm(`Are you sure you want to ${labels[action].toLowerCase()} this transfer?`, {
      title: `${labels[action]} Transfer`,
      confirmLabel: labels[action],
    });
    if (!ok) return;

    setActioning(true);
    try {
      const updated: any = await apiFetch(`/v1/seal/stock-transfers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      setTransfer(prev => (prev ? { ...prev, ...updated } : null));
    } catch (err: any) {
      showAlert(err.message || 'Action failed.');
    } finally {
      setActioning(false);
    }
  }

  if (loading) {
    return (
      <div className="seal-page">
        <SectionLoading label="Loading transfer details…" />
      </div>
    );
  }

  if (!transfer) return null;

  const t = transfer;
  const canApprove = ['DRAFT', 'PENDING_APPROVAL'].includes(t.status);
  const canExecute = ['APPROVED', 'IN_PROGRESS'].includes(t.status);
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(t.status);

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Stock Transfers', to: '/seal/stock-transfers' },
          t.transfer_ref,
        ]}
        titlePlain="Transfer"
        titleEm={t.transfer_ref.toLowerCase()}
        subtitle={`Requested ${new Date(t.requested_at).toLocaleDateString()} · ${t.lines.length} lot${
          t.lines.length !== 1 ? 's' : ''
        }`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/seal/stock-transfers')}>
              <Icon name="arrowLeft" size={14} />
              <span>All Transfers</span>
            </Button>
            {canApprove && (
              <Button
                variant="outline"
                size="sm"
                disabled={actioning}
                onClick={() => doAction('approve')}
              >
                Approve Transfer
              </Button>
            )}
            {canExecute && (
              <Button size="sm" disabled={actioning} onClick={() => doAction('execute')}>
                Execute Transfer
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                disabled={actioning}
                onClick={() => doAction('cancel')}
              >
                Cancel Transfer
              </Button>
            )}
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Transfer Summary Card */}
        <div className="seal-card">
          <div className="seal-card-hdr">
            <h3 className="seal-card-title">Transfer Overview</h3>
            <Badge variant={STATUS_VARIANT[t.status] ?? 'gray'}>
              {STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="seal-field-row">
                <span className="seal-field-label">Reference</span>
                <span className="seal-field-value seal-mono">{t.transfer_ref}</span>
              </div>
              <div className="seal-field-row">
                <span className="seal-field-label">Status</span>
                <span className="seal-field-value">
                  {STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="seal-field-row">
                <span className="seal-field-label">Origin</span>
                <span className="seal-field-value">{t.from_zone ?? t.from_compartment_id ?? '—'}</span>
              </div>
              <div className="seal-field-row">
                <span className="seal-field-label">Destination</span>
                <span className="seal-field-value">{t.to_zone ?? t.to_compartment_id ?? '—'}</span>
              </div>
              <div className="seal-field-row">
                <span className="seal-field-label">Expected Completion</span>
                <span className="seal-field-value">
                  {t.expected_at ? new Date(t.expected_at).toLocaleDateString() : '—'}
                </span>
              </div>
              <div className="seal-field-row">
                <span className="seal-field-label">Executed On</span>
                <span className="seal-field-value">
                  {t.executed_at ? new Date(t.executed_at).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>
            {t.notes && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  background: 'var(--card-sunken, var(--bg))',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                  color: 'var(--ink2)',
                }}
              >
                {t.notes}
              </div>
            )}
          </div>
        </div>

        {/* Workflow Progression Card */}
        <div className="seal-card">
          <div className="seal-card-hdr">
            <h3 className="seal-card-title">Audit Trail & Actors</h3>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Requested By', userId: t.requested_by, date: t.requested_at },
              { label: 'Approved By', userId: t.approved_by, date: t.approved_at },
              { label: 'Executed By', userId: t.executed_by, date: t.executed_at },
            ].map(row => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <PersonAvatar userId={row.userId} name={row.label} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>
                    {row.userId ? `User ${row.userId.slice(0, 8)}…` : 'Pending'}
                  </div>
                  {row.date && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
                      {new Date(row.date).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lines Card */}
      <div className="seal-card">
        <div className="seal-card-hdr">
          <h3 className="seal-card-title">Transfer Lines ({t.lines.length})</h3>
        </div>
        <div className="seal-card-body">
          {t.lines.length === 0 ? (
            <div className="seal-empty">No lines registered on this transfer.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot Ref</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Qty Requested</th>
                  <th style={{ textAlign: 'right' }}>Qty Actual</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {t.lines.map(l => (
                  <tr key={l.id}>
                    <td>
                      <span className="seal-mono" style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 12.5 }}>
                        {l.lot?.lot_ref ?? l.lot_id.slice(0, 12) + '…'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{l.lot?.description ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {parseFloat(l.qty_requested).toLocaleString()} {l.lot?.unit ?? ''}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: l.qty_actual ? 'var(--ink)' : 'var(--ink3)',
                        fontWeight: 600,
                      }}
                    >
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
