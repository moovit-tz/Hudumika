import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import './Petti.css';

// Petti-disbursed cash advances, sourced from real finance_expenses rows —
// PettiService.disburseWithdrawal stamps retirement_status:'pending' on each
// one at disbursement time (276_petti_workflows.sql). Retiring here calls
// the same real endpoint FinOps's own Expenses screen uses
// (PATCH /v1/finance/expenses/:id/retire) — this used to be a page-local
// setTimeout that pushed into React state and vanished on refresh; nothing
// ever reached finance_expenses.retirement_status, so FinOps kept showing
// every one of these as permanently 'pending' no matter what a user did here.
type RetirementStatus = 'pending' | 'retired' | 'short' | 'written_off';

interface FinanceExpense {
  id: string; name: string; amount: number; date: string; category: string;
  retirement_status: RetirementStatus | string;
}

const STATUS_VARIANT: Record<string, 'gray' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'warning', retired: 'success', short: 'error', written_off: 'gray',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending retirement', retired: 'Retired', short: 'Short', written_off: 'Written off',
};

export function PettiRetirements() {
  usePageSEO('Expense Retirements', 'Retire Petti cash advances against real receipts, recorded in FinOps.');
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

  const pending = expenses.filter(e => e.retirement_status === 'pending');
  const resolved = expenses.filter(e => e.retirement_status !== 'pending');

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
      showAlert('Attach a receipt image before marking this fully retired.');
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
      showAlert('Expense retirement recorded.', { variant: 'success' });
      setRetiring(null);
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to record retirement.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Activities', 'Expense Retirements']}
        titlePlain="Expense"
        titleEm="retirements"
        subtitle="Reconcile disbursed cash advances against real receipts — recorded on the FinOps expense itself."
      />

      <SectionCard title={`Awaiting Retirement (${pending.length})`} padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : pending.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Nothing awaiting retirement — every disbursed cash advance has been accounted for.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Date', 'Description', 'Category', 'Amount', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pending.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(e.date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{e.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink2)' }}>{e.category || 'General'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--ink)' }}>{Number(e.amount).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[e.retirement_status] || 'gray'}>{STATUS_LABEL[e.retirement_status] || e.retirement_status}</Badge></td>
                  <td style={{ padding: '12px 16px' }}>
                    <Button size="xs" onClick={() => openRetire(e)}>Retire</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>

      <div style={{ height: 20 }} />

      <SectionCard title={`Retirement History (${resolved.length})`} padded={false} collapsible={false}>
        {resolved.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No retirements recorded yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Date', 'Description', 'Amount', 'Outcome'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {resolved.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink3)' }}>{new Date(e.date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{e.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--ink)' }}>{Number(e.amount).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[e.retirement_status] || 'gray'}>{STATUS_LABEL[e.retirement_status] || e.retirement_status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>

      <Dialog open={!!retiring} onOpenChange={o => { if (!o) setRetiring(null); }}>
        <DialogContent className="sm:max-w-md">
          {retiring && (
            <>
              <DialogHeader>
                <DialogTitle>Retire — {retiring.name}</DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                  Advance amount: <strong>{Number(retiring.amount).toLocaleString()}</strong>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Receipt Image</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => onFileSelected(e.target.files?.[0] ?? null)} />
                  {receiptDataUrl && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--green)' }}><Icon name="check" size={12} /> Receipt attached.</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Note</label>
                  <textarea
                    value={note} onChange={e => setNote(e.target.value)} rows={2}
                    placeholder="Optional — e.g. why this is short, or written off"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => submitRetirement('written_off')}>Write off</Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => submitRetirement('short')}>Mark short</Button>
                <Button type="button" size="sm" disabled={saving} onClick={() => submitRetirement('retired')}>{saving ? 'Saving…' : 'Fully retired'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
