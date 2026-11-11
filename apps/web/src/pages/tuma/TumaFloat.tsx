import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { formatAmount } from '../../lib/currency.js';
import { showAlert } from '../../lib/alert.js';

interface FloatAccount {
  id: string;
  user_id: string;
  total_float: number;
  used_float: number;
  available_float: number;
  is_pool: boolean;
  last_replenished: string | null;
  created_at: string;
}

export function TumaFloat() {
  const [accounts, setAccounts] = useState<FloatAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [actionDialog, setActionDialog] = useState<{ type: 'settle' | 'replenish'; account: FloatAccount } | null>(null);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    apiFetch('/v1/tuma/float')
      .then(r => setAccounts(r.accounts ?? []))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionDialog || !amount) return;
    setSaving(true);
    const endpoint = actionDialog.type === 'settle' ? '/v1/tuma/float/settle' : '/v1/tuma/float/replenish';
    const body: Record<string, unknown> = {
      float_account_id: actionDialog.account.id,
      amount: parseFloat(amount),
      description: desc.trim() || (actionDialog.type === 'settle' ? 'Agent float settlement' : 'Float replenishment'),
    };
    if (ref.trim()) body.payment_reference = ref.trim();
    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      setActionDialog(null); setAmount(''); setDesc(''); setRef('');
      reload();
    } catch (err: any) { showAlert(err.message); } finally { setSaving(false); }
  }

  const fmt = (n: number) => formatAmount(n, 'TZS');

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'Finance']}
        titlePlain="Agent"
        titleEm="float"
        subtitle="Working capital balances, mobile money top-ups and pool float management. Settlement and replenishment post to the GL automatically."
      />
      <SectionCard title="Float Accounts" collapsible={false}>
        {loading ? <SectionLoading /> : accounts.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No float accounts yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Agent</th><th>Total Float</th><th>Used</th><th>Available</th><th>Pool</th><th>Last Replenished</th><th style={{ width: 48 }} />
              </tr></thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{a.user_id.slice(0, 8)}...</td>
                    <td style={{ fontWeight: 500 }}>{fmt(a.total_float)}</td>
                    <td style={{ color: 'var(--red)' }}>{fmt(a.used_float)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>{fmt(a.available_float)}</td>
                    <td><Badge variant={a.is_pool ? 'brand' : 'gray'}>{a.is_pool ? 'Pool' : 'Agent'}</Badge></td>
                    <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{a.last_replenished ? new Date(a.last_replenished).toLocaleDateString() : '—'}</td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button data-ui-native-button="" type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: "var(--action-py) var(--space-md)", color: 'var(--ink3)' }}><Icon name="moreHorizontal" size={16} /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => setActionDialog({ type: 'replenish', account: a })}><Icon name="plus" size={14} /> Replenish Float</DropdownMenuItem>
                          {a.used_float > 0 && (
                            <DropdownMenuItem onClick={() => setActionDialog({ type: 'settle', account: a })}><Icon name="minus" size={14} /> Settle Float</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => window.open('/finops/journal', '_self')}><Icon name="invoice" size={14} /> View in FinOps</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{actionDialog?.type === 'settle' ? 'Settle Float' : 'Replenish Float'}</DialogTitle></DialogHeader>
          <form onSubmit={handleAction}>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Amount (TZS)</label>
                  <Input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                  {actionDialog?.type === 'settle' && (
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>Max settable: {fmt(actionDialog.account.used_float)}</div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Description</label>
                  <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={actionDialog?.type === 'settle' ? 'Agent float settlement' : 'Float top-up'} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Payment Reference (optional)</label>
                  <Input value={ref} onChange={e => setRef(e.target.value)} placeholder="M-Pesa/bank ref" />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="submit" disabled={saving || !amount}>
                {saving ? 'Processing…' : actionDialog?.type === 'settle' ? 'Settle' : 'Replenish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
