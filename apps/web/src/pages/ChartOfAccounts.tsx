import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import type { ChartOfAccount, AccountType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

function flattenTree(tree: ChartOfAccount[]): ChartOfAccount[] {
  const result: ChartOfAccount[] = [];
  function walk(accounts: ChartOfAccount[]) {
    for (const a of accounts) { result.push(a); if (a.children?.length) walk(a.children); }
  }
  walk(tree);
  return result;
}

const TYPE_CFG: Record<AccountType, { label: string; color: string; bg: string }> = {
  ASSET:     { label: 'Asset',     color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liability', color: '#ef4444', bg: '#fef2f2' },
  EQUITY:    { label: 'Equity',    color: '#7c3aed', bg: '#ede9fe' },
  REVENUE:   { label: 'Revenue',   color: '#059669', bg: '#ecfdf5' },
  EXPENSE:   { label: 'Expense',   color: '#d97706', bg: '#fef3c7' },
};

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

function AccountRow({
  account, depth, expanded, onToggle, onSelect, selected,
}: {
  account: ChartOfAccount;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (a: ChartOfAccount) => void;
  selected: string | null;
}) {
  const cfg = TYPE_CFG[account.type];
  const hasChildren = (account.children?.length ?? 0) > 0;
  const isOpen = expanded.has(account.id);
  const isSelected = selected === account.id;

  return (
    <>
      <div
        onClick={() => onSelect(account)}
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 100px 1fr 90px 80px 80px',
          alignItems: 'center',
          padding: '9px 16px',
          paddingLeft: 16 + depth * 20,
          borderBottom: '1px solid var(--border)',
          background: isSelected ? '#eff6ff' : depth === 0 ? 'var(--bg)' : 'var(--white)',
          cursor: 'pointer',
          transition: 'background .1s',
        }}
      >
        {/* Expand toggle */}
        <span
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(account.id); }}
          style={{
            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, cursor: hasChildren ? 'pointer' : 'default',
            color: hasChildren ? cfg.color : 'transparent',
            fontSize: 11, fontWeight: 800,
          }}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </span>

        {/* Code */}
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink3)', fontWeight: 600 }}>
          {account.code}
        </span>

        {/* Name */}
        <span style={{ fontSize: 13, fontWeight: depth === 0 ? 700 : 400, color: 'var(--ink)' }}>
          {account.name}
        </span>

        {/* Type badge */}
        <span>
          {depth === 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg,
              padding: '2px 7px', borderRadius: 9, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {cfg.label}
            </span>
          )}
        </span>

        {/* Normal balance */}
        <span style={{
          fontSize: 11, fontWeight: 600, textAlign: 'center',
          color: account.normal_balance === 'DEBIT' ? '#0891b2' : '#7c3aed',
        }}>
          {account.normal_balance === 'DEBIT' ? 'Dr' : 'Cr'}
        </span>

        {/* Status */}
        <span style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: account.is_active ? '#059669' : '#94a3b8',
            background: account.is_active ? '#ecfdf5' : '#f1f5f9',
            padding: '2px 7px', borderRadius: 9,
          }}>
            {account.is_active ? 'Active' : 'Inactive'}
          </span>
        </span>
      </div>

      {/* Children */}
      {isOpen && account.children?.map(child => (
        <AccountRow
          key={child.id}
          account={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selected={selected}
        />
      ))}
    </>
  );
}

export const ChartOfAccounts: React.FC = () => {
  const isFullLayout = useFullLayout();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL');
  const [coaTree, setCoaTree] = useState<ChartOfAccount[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ChartOfAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<ChartOfAccount | null>(null);
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fType, setFType] = useState<AccountType>('ASSET');
  const [fParentId, setFParentId] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccounts = React.useCallback(() => {
    return apiFetch('/v1/finance/chart-of-accounts')
      .then((res: { accounts: ChartOfAccount[] }) => {
        const accounts = res.accounts ?? [];
        setCoaTree(accounts);
        setExpanded(new Set(flattenTree(accounts).map(a => a.id)));
      })
      .catch((err: any) => setLoadError(err.message || 'Failed to load chart of accounts'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  function openNewAccountForm() {
    setEditing(null);
    setFCode(''); setFName(''); setFType('ASSET'); setFParentId(''); setFDescription('');
    setShowForm(true);
  }

  function openEditForm(a: ChartOfAccount) {
    setEditing(a);
    setFCode(a.code); setFName(a.name); setFType(a.type); setFParentId(a.parent_id ?? ''); setFDescription(a.description ?? '');
    setShowForm(true);
  }

  async function handleSaveAccount() {
    if (!fCode.trim() || !fName.trim()) { showAlert('Code and name are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/v1/finance/chart-of-accounts/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: fName, description: fDescription || null, parent_id: fParentId || null }),
        });
      } else {
        await apiFetch('/v1/finance/chart-of-accounts', {
          method: 'POST',
          body: JSON.stringify({ code: fCode, name: fName, type: fType, parent_id: fParentId || null, description: fDescription || undefined }),
        });
      }
      setShowForm(false);
      await loadAccounts();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(a: ChartOfAccount) {
    if (!(await showConfirm(`Delete account "${a.code} — ${a.name}"?`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/finance/chart-of-accounts/${a.id}`, { method: 'DELETE' });
      setSelected(null);
      await loadAccounts();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete account');
    }
  }

  const flat = useMemo(() => flattenTree(coaTree), [coaTree]);

  const stats = useMemo(() => {
    const counts: Partial<Record<AccountType, number>> = {};
    flat.forEach(a => { counts[a.type] = (counts[a.type] ?? 0) + 1; });
    return counts;
  }, [flat]);

  const matchesFilter = useMemo(() => {
    const q = search.toLowerCase();
    const typeOk = (a: ChartOfAccount) => typeFilter === 'ALL' || a.type === typeFilter;
    const textOk = (a: ChartOfAccount) =>
      !q || a.name.toLowerCase().includes(q) || a.code.includes(q) || (a.description ?? '').toLowerCase().includes(q);

    const visible = new Set<string>();
    function check(a: ChartOfAccount): boolean {
      const self = typeOk(a) && textOk(a);
      const childMatch = (a.children ?? []).some(c => check(c));
      if (self || childMatch) { visible.add(a.id); return true; }
      return false;
    }
    coaTree.forEach(a => check(a));
    return visible;
  }, [search, typeFilter, coaTree]);

  function filterTree(accounts: ChartOfAccount[]): ChartOfAccount[] {
    return accounts
      .filter(a => matchesFilter.has(a.id))
      .map(a => ({ ...a, children: a.children ? filterTree(a.children) : undefined }));
  }

  const displayTree = filterTree(coaTree);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() { setExpanded(new Set(flat.map(a => a.id))); }
  function collapseAll() { setExpanded(new Set()); }

  function exportCsv() {
    const rows = [
      ['Code', 'Name', 'Type', 'Description', 'Status'],
      ...flat.map(a => [a.code ?? '', a.name, TYPE_CFG[a.type]?.label ?? a.type, a.description ?? '', a.is_active ? 'Active' : 'Inactive']),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: isFullLayout ? 'none' : 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <PageHeader
            crumbs={['FinOps', 'Chart of Accounts']}
            titlePlain="Chart of"
            titleEm="accounts"
          />
          <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>
            {flat.length} accounts · {TYPE_ORDER.length} types
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={expandAll} title="Expand all">
            <Icon name="chevronDown" size={13} /> All
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={collapseAll} title="Collapse all">
            <Icon name="chevronUp" size={13} /> Collapse
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} title="Export CSV">
            <Icon name="download" size={13} /> Export CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openNewAccountForm} title="New account">
            <Icon name="plus" size={13} color="#fff" /> New Account
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {TYPE_ORDER.map(t => {
          const cfg = TYPE_CFG[t];
          const count = stats[t] ?? 0;
          return (
            <div
              key={t} className="card"
              style={{ padding: '12px 14px', borderTop: `3px solid ${cfg.color}`, cursor: 'pointer',
                background: typeFilter === t ? cfg.bg : undefined }}
              onClick={() => setTypeFilter(typeFilter === t ? 'ALL' : t)}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {cfg.label}s
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{count}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>accounts</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Icon name="search" size={13} color="var(--ink3)"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or name…"
            className="input-field"
            style={{ paddingLeft: 32, height: 34, fontSize: 13, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', ...TYPE_ORDER] as const).map(t => (
            <button key={t} type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                background: typeFilter === t ? (t === 'ALL' ? 'var(--teal)' : TYPE_CFG[t].color) : 'var(--white)',
                color: typeFilter === t ? '#fff' : 'var(--ink3)',
              }}>
              {t === 'ALL' ? 'All' : TYPE_CFG[t].label + 's'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 100px 1fr 90px 80px 80px',
          padding: '9px 16px', background: 'var(--bg)', borderBottom: '2px solid var(--border)',
        }}>
          {['', 'Code', 'Account Name', 'Type', 'Normal', 'Status'].map((h, i) => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: 'var(--ink3)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              textAlign: i >= 4 ? 'center' : 'left',
            }}>{h}</span>
          ))}
        </div>

        {/* Tree rows */}
        {loading ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--ink3)' }}>Loading chart of accounts…</div>
        ) : loadError ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--red, #dc2626)' }}>{loadError}</div>
        ) : coaTree.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--ink3)' }}>
            <Icon name="folder" size={28} color="var(--ink3)" />
            <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>No accounts configured yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Add your first account to get started</div>
          </div>
        ) : displayTree.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: 'var(--ink3)' }}>
            <Icon name="search" size={28} color="var(--ink3)" />
            <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>No accounts match</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Try a different search or type filter</div>
          </div>
        ) : (
          displayTree.map(account => (
            <AccountRow
              key={account.id}
              account={account}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onSelect={setSelected}
              selected={selected?.id ?? null}
            />
          ))
        )}
      </div>

      {/* Selected account detail panel */}
      {selected && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: 320,
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,.08), 0 12px 40px rgba(0,0,0,.14)',
          zIndex: 200, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: TYPE_CFG[selected.type].bg,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: TYPE_CFG[selected.type].color, display: 'inline-block',
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>
                {selected.code}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{selected.name}</span>
            </div>
            <button type="button" onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Type', value: TYPE_CFG[selected.type].label },
              { label: 'Subtype', value: selected.subtype?.replace(/_/g, ' ') ?? '—' },
              { label: 'Normal balance', value: selected.normal_balance === 'DEBIT' ? 'Debit (Dr)' : 'Credit (Cr)' },
              { label: 'Currency', value: selected.currency },
              { label: 'System account', value: selected.is_system ? 'Yes' : 'No' },
              { label: 'Status', value: selected.is_active ? 'Active' : 'Inactive' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{row.value}</span>
              </div>
            ))}
            {selected.description && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                {selected.description}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openEditForm(selected)}>
                <Icon name="edit" size={12} /> Edit
              </button>
              {!selected.is_system && (
                <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDeleteAccount(selected)}>
                  <Icon name="trash2" size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Account modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: '28px 32px', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 20 }}>{editing ? 'Edit Account' : 'New Account'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Code</label>
                <input className="input-field" style={{ width: '100%' }} placeholder="e.g. 1150" value={fCode} onChange={e => setFCode(e.target.value)} disabled={!!editing} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Name</label>
                <input className="input-field" style={{ width: '100%' }} placeholder="Account name" value={fName} onChange={e => setFName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Type</label>
                <Select value={fType} onValueChange={v => setFType(v as AccountType)} disabled={!!editing}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_ORDER.map(t => <SelectItem key={t} value={t}>{TYPE_CFG[t].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Parent Account</label>
                <Combobox
                  options={[{ value: '', label: '— None (top-level) —' }, ...flat.filter(a => a.id !== editing?.id).map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }))]}
                  value={fParentId} onChange={setFParentId}
                  placeholder="— None (top-level) —"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Description</label>
                <input className="input-field" style={{ width: '100%' }} placeholder="Optional" value={fDescription} onChange={e => setFDescription(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveAccount} disabled={saving}>{saving ? 'Saving…' : 'Save Account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
