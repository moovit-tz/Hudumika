import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

interface TrustAccount { id: string; account_name: string; account_number: string | null; bank_name: string | null; currency: string; balance: number; client_id: string | null; status: string; }
interface TrustTxn { id: string; type: string; amount: number; balance_after: number; description: string; reference: string | null; payee: string | null; created_at: string; }

export function LexCoreTrustAccounts() {
  const [rows, setRows] = useState<TrustAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [accNo, setAccNo] = useState('');
  const [bank, setBank] = useState('');
  const [currency, setCurrency] = useState('TZS');

  const [txnDialog, setTxnDialog] = useState<{ type: 'deposit' | 'disburse'; account: TrustAccount } | null>(null);
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDesc, setTxnDesc] = useState('');
  const [txnPayee, setTxnPayee] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [txnSaving, setTxnSaving] = useState(false);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [txns, setTxns] = useState<TrustTxn[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);

  function reload() {
    apiFetch('/v1/legal/trust/accounts').then(d => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  const loadTxns = useCallback((accountId: string) => {
    setTxnLoading(true);
    apiFetch(`/v1/legal/trust/accounts/${accountId}/transactions`)
      .then(d => setTxns(d.rows ?? []))
      .finally(() => setTxnLoading(false));
  }, []);

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadTxns(id);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/legal/trust/accounts', { method: 'POST', body: JSON.stringify({ account_name: name.trim(), account_number: accNo.trim() || undefined, bank_name: bank.trim() || undefined, currency }) });
      setOpen(false); setName(''); setAccNo(''); setBank(''); setCurrency('TZS');
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  async function handleTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!txnDialog || !txnAmount || !txnDesc.trim()) return;
    setTxnSaving(true);
    const endpoint = txnDialog.type === 'deposit'
      ? `/v1/legal/trust/accounts/${txnDialog.account.id}/deposit`
      : `/v1/legal/trust/accounts/${txnDialog.account.id}/disburse`;
    const body: Record<string, unknown> = { amount: parseFloat(txnAmount), description: txnDesc.trim() };
    if (txnRef.trim()) body.reference = txnRef.trim();
    if (txnDialog.type === 'disburse' && txnPayee.trim()) body.payee = txnPayee.trim();
    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      setTxnDialog(null); setTxnAmount(''); setTxnDesc(''); setTxnPayee(''); setTxnRef('');
      reload();
      if (expanded === txnDialog.account.id) loadTxns(txnDialog.account.id);
    } catch (err: any) { showAlert(err.message); } finally { setTxnSaving(false); }
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const TXN_BADGE: Record<string, 'success' | 'warning' | 'info' | 'gray'> = {
    deposit: 'success', disbursement: 'warning', transfer: 'info', interest: 'brand' as any, fee: 'gray',
  };

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Trust']}
        titlePlain="Client trust"
        titleEm="accounts"
        subtitle="Funds held on behalf of clients — deposits, disbursements and three-way reconciliation. Each transaction posts to the GL automatically."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Trust Account</Button>}
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No trust accounts.</div> : (
            <table className="lc-table">
              <thead><tr><th>Account</th><th>Bank</th><th>Acc. Number</th><th>Currency</th><th>Balance</th><th>Status</th><th style={{ width: 48 }} /></tr></thead>
              <tbody>
                {rows.map(a => (
                  <React.Fragment key={a.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(a.id)}>
                      <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                      <td>{a.bank_name || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.account_number || '—'}</td>
                      <td>{a.currency}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(a.balance)}</td>
                      <td><Badge variant={a.status === 'active' ? 'success' : 'gray'}>{a.status}</Badge></td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button data-ui-native-button="" type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: "var(--action-py) var(--space-md)", color: 'var(--ink3)' }} onClick={e => e.stopPropagation()}><Icon name="moreHorizontal" size={16} /></button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => { setTxnDialog({ type: 'deposit', account: a }); }}><Icon name="plus" size={14} /> Deposit Funds</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setTxnDialog({ type: 'disburse', account: a }); }}><Icon name="minus" size={14} /> Disburse Funds</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open('/finops/journal', '_self')}><Icon name="invoice" size={14} /> View in FinOps</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {expanded === a.id && (
                      <tr><td colSpan={7} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                        <div style={{ padding: '12px 18px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Transaction History</div>
                          {txnLoading ? <SectionLoading /> : txns.length === 0 ? (
                            <div style={{ color: 'var(--ink3)', fontSize: 13, padding: '12px 0' }}>No transactions yet.</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead><tr>{['Date', 'Type', 'Description', 'Amount', 'Balance After'].map(h => <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {txns.map(t => (
                                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-muted, var(--border))' }}>
                                    <td style={{ padding: '8px 12px', color: 'var(--ink3)' }}>{formatDate(t.created_at)}</td>
                                    <td style={{ padding: '8px 12px' }}><Badge variant={TXN_BADGE[t.type] ?? 'gray'}>{t.type}</Badge></td>
                                    <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>{t.description}{t.payee ? ` → ${t.payee}` : ''}</td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: t.type === 'deposit' ? 'var(--green)' : 'var(--red)' }}>
                                      {t.type === 'deposit' ? '+' : '−'}{fmt(t.amount)}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{fmt(t.balance_after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      {/* Create account dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New Trust Account</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate}>
            <DialogBody>
              <div className="lc-form-grid">
                <div className="lc-field lc-field-full"><label>Account Name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Client trust account" /></div>
                <div className="lc-field"><label>Bank</label><Input value={bank} onChange={e => setBank(e.target.value)} placeholder="Bank name" /></div>
                <div className="lc-field"><label>Account Number</label><Input value={accNo} onChange={e => setAccNo(e.target.value)} placeholder="Account number" /></div>
                <div className="lc-field"><label>Currency</label><Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="TZS" /></div>
              </div>
            </DialogBody>
            <DialogFooter><Button type="submit" loading={saving} disabled={!name.trim()} loadingText="Saving…">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deposit / Disburse dialog */}
      <Dialog open={!!txnDialog} onOpenChange={() => setTxnDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{txnDialog?.type === 'deposit' ? 'Deposit Funds' : 'Disburse Funds'}</DialogTitle></DialogHeader>
          <form onSubmit={handleTxn}>
            <DialogBody>
              <div className="lc-form-grid">
                <div className="lc-field lc-field-full">
                  <label>Amount ({txnDialog?.account.currency ?? 'TZS'})</label>
                  <Input type="number" min="0.01" step="0.01" value={txnAmount} onChange={e => setTxnAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="lc-field lc-field-full">
                  <label>Description</label>
                  <Input value={txnDesc} onChange={e => setTxnDesc(e.target.value)} placeholder={txnDialog?.type === 'deposit' ? 'Client retainer deposit' : 'Court filing fee'} />
                </div>
                {txnDialog?.type === 'disburse' && (
                  <div className="lc-field lc-field-full">
                    <label>Payee</label>
                    <Input value={txnPayee} onChange={e => setTxnPayee(e.target.value)} placeholder="Payee name" />
                  </div>
                )}
                <div className="lc-field lc-field-full">
                  <label>Reference (optional)</label>
                  <Input value={txnRef} onChange={e => setTxnRef(e.target.value)} placeholder="Check/transfer reference" />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="submit" disabled={txnSaving || !txnAmount || !txnDesc.trim() || (txnDialog?.type === 'disburse' && !txnPayee.trim())}>
                {txnSaving ? 'Processing…' : txnDialog?.type === 'deposit' ? 'Deposit' : 'Disburse'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
