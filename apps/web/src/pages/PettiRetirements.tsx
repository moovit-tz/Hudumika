import React, { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Textarea } from '../components/ui/textarea.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

type RetirementStatus = 'pending' | 'retired' | 'short' | 'written_off';

interface FinanceExpense {
  id: string; name: string; amount: number; date: string; category: string;
  retirement_status: RetirementStatus | string;
}

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', retired: 'success', short: 'error', written_off: 'gray',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending retirement', retired: 'Fully Retired', short: 'Short / Partial', written_off: 'Written off',
};

export function PettiRetirements() {
  usePageSEO('Expense Retirements', 'Reconcile disbursed petty cash advances against real receipts, recorded directly into FinOps.');
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [retiring, setRetiring] = useState<FinanceExpense | null>(null);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    apiFetch('/v1/finance/expenses')
      .then((rows: any[]) => setExpenses((rows || []).filter(r => r.retirement_status && r.retirement_status !== 'not_required')))
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const pending = useMemo(() => expenses.filter(e => e.retirement_status === 'pending'), [expenses]);
  const resolved = useMemo(() => expenses.filter(e => e.retirement_status !== 'pending'), [expenses]);

  const pendingAmount = useMemo(() => pending.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [pending]);
  const resolvedAmount = useMemo(() => resolved.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [resolved]);

  function openRetire(exp: FinanceExpense) {
    setRetiring(exp);
    setReceiptDataUrl(null);
    setNote('');
  }

  function onFileSelected(file: File | null) {
    if (!file) { setReceiptDataUrl(null); return; }
    const reader = new FileReader();
    reader.onload = () => setReceiptDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submitRetirement(status: 'retired' | 'short' | 'written_off') {
    if (!retiring) return;
    if (status === 'retired' && !receiptDataUrl) {
      showAlert('Please attach a verified receipt image before marking this advance as fully retired.');
      return;
    }
    setSaving(true);
    try {
      if (receiptDataUrl) {
        await apiFetch(`/v1/finance/expenses/${retiring.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ attachment_data: receiptDataUrl }),
        });
      }
      await apiFetch(`/v1/finance/expenses/${retiring.id}/retire`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      });
      showAlert('Expense retirement successfully recorded.', { variant: 'success' });
      setRetiring(null);
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to record retirement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="petti-container">
      <PageHeader
        crumbs={['Petti', 'Activities', 'Expense Retirements']}
        titlePlain="Expense"
        titleEm="retirements"
        subtitle="Reconcile disbursed petty cash advances against verified receipts — synchronized directly with FinOps."
      />

      {/* Summary Metrics */}
      <div className="petti-stats-grid">
        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Awaiting Reconciliation</span>
            <Badge variant={pending.length > 0 ? 'warning' : 'success'}>
              {pending.length} Unreconciled
            </Badge>
          </div>
          <div className="petti-stat-value" style={{ color: pending.length > 0 ? 'var(--gold, #f59e0b)' : 'var(--green)' }}>
            {pendingAmount.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <span>Outstanding advance total</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Reconciled Volume</span>
            <Badge variant="success">RESOLVED</Badge>
          </div>
          <div className="petti-stat-value">
            {resolvedAmount.toLocaleString()}
          </div>
          <div className="petti-stat-sub">
            <span>{resolved.length} completed reconciliations</span>
          </div>
        </div>

        <div className="petti-stat-card">
          <div className="petti-stat-card-header">
            <span className="petti-stat-label">Audit Compliance</span>
            <Icon name="checkCircle" size={16} color="var(--teal)" />
          </div>
          <div className="petti-stat-value">
            {expenses.length > 0 ? `${Math.round((resolved.length / expenses.length) * 100)}%` : '100%'}
          </div>
          <div className="petti-stat-sub">
            <span>Receipt attachment rate</span>
          </div>
        </div>
      </div>

      {/* Awaiting Retirement Queue */}
      <SectionCard title={`Awaiting Receipt Retirement (${pending.length})`} padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : pending.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
            All cash advances have been fully accounted for and reconciled.
          </div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Date', 'Description', 'Category', 'Advance Amount', 'Status', 'Action'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(e.date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink2)' }}>{e.category || 'General'}</td>
                    <td style={{ fontFamily: 'var(--font)', fontWeight: 800, color: 'var(--teal)' }}>
                      {Number(e.amount).toLocaleString()}
                    </td>
                    <td><Badge variant={STATUS_VARIANT[e.retirement_status] || 'gray'}>{STATUS_LABEL[e.retirement_status] || e.retirement_status}</Badge></td>
                    <td>
                      <Button size="sm" onClick={() => openRetire(e)}>
                        <Icon name="check" size={13} /> Reconcile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Resolved History */}
      <SectionCard title={`Reconciled History (${resolved.length})`} padded={false} collapsible={false}>
        {resolved.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No resolved retirements recorded yet.</div>
        ) : (
          <div className="petti-table-wrap">
            <table className="petti-table">
              <thead>
                <tr>
                  {['Date', 'Description', 'Amount', 'Reconciliation Outcome'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolved.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, color: 'var(--ink3)' }}>{new Date(e.date).toLocaleDateString()}</td>
                    <td style={{ color: 'var(--ink)' }}>{e.name}</td>
                    <td style={{ fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink)' }}>{Number(e.amount).toLocaleString()}</td>
                    <td><Badge variant={STATUS_VARIANT[e.retirement_status] || 'gray'}>{STATUS_LABEL[e.retirement_status] || e.retirement_status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Retirement Dialog */}
      <Dialog open={!!retiring} onOpenChange={o => { if (!o) setRetiring(null); }}>
        <DialogContent size="sm">
          {retiring && (
            <>
              <DialogHeader>
                <DialogTitle>Reconcile Advance — {retiring.name}</DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Cash Advance Amount</div>
                  <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--font)', color: 'var(--teal)', marginTop: 2 }}>
                    {Number(retiring.amount).toLocaleString()}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Upload Receipt / Proof of Spend *</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => onFileSelected(e.target.files?.[0] ?? null)}
                    style={{ fontSize: 12, width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}
                  />
                  {receiptDataUrl && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="check" size={13} /> Receipt image attached and ready.
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Reconciliation Note</label>
                  <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional — e.g. details on exact receipt total, change returned, or discrepancy" />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => submitRetirement('written_off')}>Write Off</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => submitRetirement('short')}>Mark Short</Button>
                <Button type="button" size="sm" disabled={saving} onClick={() => submitRetirement('retired')}>{saving ? 'Saving…' : 'Fully Retired'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
