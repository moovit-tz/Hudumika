import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePageSEO } from '../hooks/usePageSEO.js';

// Wallet administration is "the finance manager acts as admin" — deliberately
// excludes MANAGER, which is now the department-approval actor (configured
// per-wallet on the wallet detail page), not a wallet administrator.
const FINANCE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE']);

interface Wallet {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: 'active' | 'closed';
  balance: number;
  created_at: string;
}

export function PettiWallets() {
  usePageSEO('Petty Cash Wallets', 'Deposit funds, then request, approve and disburse petty cash — every disbursement lands in FinOps’s own Expenses view automatically.');
  const { user } = useAuth();
  const canManage = !!user && FINANCE_ROLES.has(user.role);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', currency: 'TZS' });

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data || [])).catch(() => setWallets([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!form.name.trim()) { setError('Wallet name is required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/petti/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || undefined, currency: form.currency.trim() || undefined }),
      });
      setForm({ name: '', description: '', currency: 'TZS' });
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to create wallet'); }
    finally { setSaving(false); }
  }

  const totalBalance = wallets.filter(w => w.status === 'active').reduce((s, w) => s + w.balance, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Wallets']}
        titlePlain="Petty cash"
        titleEm="wallets"
        subtitle="Deposit funds, then request, approve and disburse petty cash — every disbursement lands in FinOps's own Expenses view automatically."
        actions={canManage ? <Button onClick={() => setShowForm(s => !s)}><Icon name="plus" size={14} /> New wallet</Button> : undefined}
      />

      {!loading && wallets.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="wallet" size={18} /></FeaturedIcon>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total across active wallets</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{totalBalance.toLocaleString()} TZS</div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <SectionCard title="New wallet" collapsible={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ops Petty Cash" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
              <Input value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={5} />
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Description</label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this wallet is used for" rows={2} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button disabled={saving} onClick={save}>{saving ? 'Creating…' : 'Create wallet'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Wallets" padded={false} collapsible={false}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : wallets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
            No wallets yet.{canManage ? ' Create one to start depositing and tracking petty cash.' : ' Ask a finance admin to create one.'}
          </div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Wallet', 'Description', 'Balance', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {wallets.map(w => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    <Link to={`/petti/wallets/${w.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{w.name}</Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{w.description || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: w.balance < 0 ? 'var(--red)' : 'var(--ink)' }}>{w.balance.toLocaleString()} {w.currency}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={w.status === 'active' ? 'success' : 'gray'}>{w.status}</Badge></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <Link to={`/petti/wallets/${w.id}`}><Button size="sm" variant="outline">Open <Icon name="arrowRight" size={13} /></Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  );
}
