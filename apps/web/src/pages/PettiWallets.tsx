import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { showAlert } from '../lib/alert.js';
import './Petti.css';

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

  /* View Mode & Filters */
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');

  /* Edit Modal State */
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', currency: 'TZS' });
  const [updating, setUpdating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/petti/wallets').then(res => setWallets(res.data || [])).catch(() => setWallets([])).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const filteredWallets = useMemo(() => {
    return wallets.filter(w => {
      const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase()) || (w.description || '').toLowerCase().includes(search.toLowerCase());
      const matchCurr = currencyFilter === 'ALL' || w.currency === currencyFilter;
      return matchSearch && matchCurr;
    });
  }, [wallets, search, currencyFilter]);

  const currencies = useMemo(() => Array.from(new Set(wallets.map(w => w.currency))), [wallets]);

  async function saveNewWallet() {
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

  async function handleToggleStatus(w: Wallet) {
    const nextStatus = w.status === 'active' ? 'closed' : 'active';
    try {
      await apiFetch(`/v1/petti/wallets/${w.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      showAlert(`Wallet ${nextStatus === 'closed' ? 'closed' : 'reopened'} successfully.`, { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to update wallet status.');
    }
  }

  function openEditModal(w: Wallet) {
    setEditingWallet(w);
    setEditForm({ name: w.name, description: w.description || '', currency: w.currency });
  }

  async function saveEditWallet() {
    if (!editingWallet) return;
    if (!editForm.name.trim()) { showAlert('Wallet name is required.'); return; }
    setUpdating(true);
    try {
      await apiFetch(`/v1/petti/wallets/${editingWallet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editForm.name.trim(), description: editForm.description.trim() || null }),
      });
      showAlert('Wallet updated successfully.', { variant: 'success' });
      setEditingWallet(null);
      load();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to update wallet.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Petti', 'Wallets']}
        titlePlain="Petty cash"
        titleEm="wallets"
        subtitle="Deposit funds, then request, approve and disburse petty cash — every disbursement lands in FinOps's own Expenses view automatically."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View Switcher */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: 2 }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Card Grid View"
                style={{
                  padding: '4px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: viewMode === 'grid' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--teal)' : 'var(--ink3)',
                  boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Icon name="grid" size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Table List View"
                style={{
                  padding: '4px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: viewMode === 'list' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--teal)' : 'var(--ink3)',
                  boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Icon name="list" size={14} />
              </button>
            </div>

            {canManage && (
              <Button onClick={() => setShowForm(s => !s)}>
                <Icon name="plus" size={14} /> New Wallet
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 400 }}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search wallets by name or description…"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>Currency:</span>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger style={{ width: 160 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Currencies</SelectItem>
              {currencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showForm && (
        <SectionCard title="New Wallet" collapsible={false}>
          <div className="petti-grid-3col" style={{ marginBottom: 16 }}>
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
            <Button disabled={saving} onClick={saveNewWallet}>{saving ? 'Creating…' : 'Create Wallet'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </SectionCard>
      )}

      {/* Grid View Mode */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading wallets…</div>
          ) : filteredWallets.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', gridColumn: '1 / -1' }}>No wallets found.</div>
          ) : (
            filteredWallets.map(w => (
              <div key={w.id} className="petti-card-interactive" style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Badge variant={w.status === 'active' ? 'success' : 'gray'}>{w.status}</Badge>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 12 }}>{w.currency}</span>
                  </div>

                  <h3 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
                    <Link to={`/petti/wallets/${w.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{w.name}</Link>
                  </h3>
                  <p style={{ margin: '0 0 16px 0', fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.45 }}>
                    {w.description || 'No description provided.'}
                  </p>

                  <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Liquidity Balance</div>
                  <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'var(--mono)', color: w.balance < 0 ? 'var(--red)' : 'var(--ink)', margin: '4px 0 0 0' }}>
                    {w.balance.toLocaleString()} <span style={{ fontSize: 15, fontWeight: 700 }}>{w.currency}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                  {canManage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => openEditModal(w)}
                        title="Edit wallet"
                        style={{ display: 'flex', alignItems: 'center', color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(w)}
                        style={{ fontSize: 11.5, fontWeight: 600, color: w.status === 'active' ? 'var(--red)' : 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {w.status === 'active' ? 'Close Wallet' : 'Reopen Wallet'}
                      </button>
                    </div>
                  )}

                  <Link to={`/petti/wallets/${w.id}`} style={{ marginLeft: 'auto' }}>
                    <Button size="sm" variant="outline">
                      Open Detail <Icon name="arrowRight" size={13} />
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* List View Mode */
        <SectionCard title="Wallets Directory" padded={false} collapsible={false}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
          ) : filteredWallets.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No wallets found.</div>
          ) : (
            <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Wallet Name', 'Description', 'Balance', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredWallets.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                      <Link to={`/petti/wallets/${w.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{w.name}</Link>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{w.description || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800, color: w.balance < 0 ? 'var(--red)' : 'var(--ink)' }}>{w.balance.toLocaleString()} {w.currency}</td>
                    <td style={{ padding: '12px 16px' }}><Badge variant={w.status === 'active' ? 'success' : 'gray'}>{w.status}</Badge></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        {canManage && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEditModal(w)}><Icon name="edit" size={13} /></Button>
                            <Button size="sm" variant="outline" onClick={() => handleToggleStatus(w)}>
                              {w.status === 'active' ? 'Close' : 'Reopen'}
                            </Button>
                          </>
                        )}
                        <Link to={`/petti/wallets/${w.id}`}><Button size="sm">Open <Icon name="arrowRight" size={13} /></Button></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      )}

      <Dialog open={!!editingWallet} onOpenChange={o => { if (!o) setEditingWallet(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Wallet</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Description</label>
              <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
              <Input value={editForm.currency} disabled />
              <p style={{ margin: '5px 0 0 0', fontSize: 11, color: 'var(--ink3)' }}>Currency can't change after a wallet has been created — it's baked into every past transaction.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWallet(null)}>Cancel</Button>
            <Button disabled={updating} onClick={saveEditWallet}>{updating ? 'Saving…' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
