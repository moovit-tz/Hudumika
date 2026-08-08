import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { FormPage } from '../components/FormPage.js';
import { apiFetch } from '../lib/api.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type { ChartOfAccount, AccountType } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

/** Top-level accounts per page. Matches the rest of the platform's lists
 *  (products, landed-cost history, Bliss notifications). */
const PAGE_SIZE = 25;

/** How many rows one top-level account actually paints, following only the
 *  branches the user has opened — a collapsed parent is one row however many
 *  accounts hang beneath it. */
function countVisible(account: ChartOfAccount, expanded: Set<string>): number {
  if (!expanded.has(account.id) || !account.children?.length) return 1;
  return 1 + account.children.reduce((n, c) => n + countVisible(c, expanded), 0);
}

function flattenTree(tree: ChartOfAccount[]): ChartOfAccount[] {
  const result: ChartOfAccount[] = [];
  function walk(accounts: ChartOfAccount[]) {
    for (const a of accounts) { result.push(a); if (a.children?.length) walk(a.children); }
  }
  walk(tree);
  return result;
}

// `plural` is stated rather than derived: the cards and tabs used to append
// an "s" to the singular, which reads Liabilitys and Equitys.
const TYPE_CFG: Record<AccountType, { label: string; plural: string; color: string; bg: string }> = {
  ASSET:     { label: 'Asset',     plural: 'Assets',      color: '#0891b2', bg: '#ecfeff' },
  LIABILITY: { label: 'Liability', plural: 'Liabilities', color: 'var(--red)', bg: 'var(--red-l)' },
  EQUITY:    { label: 'Equity',    plural: 'Equity',      color: '#7c3aed', bg: 'var(--purple-l)' },
  REVENUE:   { label: 'Revenue',   plural: 'Revenue',     color: '#059669', bg: 'var(--green-l)' },
  EXPENSE:   { label: 'Expense',   plural: 'Expenses',    color: 'var(--gold)', bg: 'var(--gold-l)' },
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
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | 'ALL'>('ALL');
  const [coaTree, setCoaTree] = useState<ChartOfAccount[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ChartOfAccount | null>(null);
  const [page, setPage] = useState(1);
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

  /**
   * Pages top-level accounts, not rows. A parent carries its whole subtree, so
   * counting rendered rows would split a parent from its children across a
   * page boundary — an "Assets" heading on page 1 and half its accounts on
   * page 2 is worse than no pagination at all.
   */
  const pageCount = Math.max(1, Math.ceil(displayTree.length / PAGE_SIZE));
  // Clamped rather than trusted: filtering to a shorter list while standing on
  // a later page would otherwise show an empty table with nothing explaining why.
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const pagedTree = displayTree.slice(offset, offset + PAGE_SIZE);
  /** Rows actually on screen, counting expanded children — what the footer
   *  reports, since "25 accounts" would be untrue of a page showing 60. */
  const rowsOnPage = pagedTree.reduce((n, a) => n + countVisible(a, expanded), 0);

  useEffect(() => { setPage(1); }, [search, typeFilter]);

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

  // Full page, matching Quotations — the form replaces the list instead of
  // floating over it. Rendering it as an absolutely-positioned layer inside
  // the page escaped its container and covered the sidebar and top bar.
  if (showForm) {
    return (
      <FormPage
        title={editing ? `Edit ${editing.code}` : 'New Account'}
        subtitle="Where this account sits in the chart and how it is classified."
        onCancel={() => setShowForm(false)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveAccount} disabled={saving}>{saving ? 'Saving…' : 'Save Account'}</button>
          </>
        }
      >
        <div className="card" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
      </FormPage>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>

      {/* Header */}
      <PageHeader
        crumbs={['Finance', 'Chart of Accounts']}
        titlePlain="Chart of"
        titleEm="accounts"
        subtitle={`${flat.length} accounts · ${TYPE_ORDER.length} types`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        }
      />

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {TYPE_ORDER.map(t => {
          const cfg = TYPE_CFG[t];
          const count = stats[t] ?? 0;
          return (
            // Selection is shown by the border and a tinted label, not by a
            // coloured bar across the top and a pastel fill. Five cards each
            // wearing their own accent read as decoration competing with the
            // figures; the number is what the card is for. Same treatment the
            // Ops KPI cards already carry.
            <div
              key={t}
              className="card"
              aria-pressed={typeFilter === t}
              style={{
                padding: '12px 14px',
                cursor: 'pointer',
                background: 'var(--white)',
                borderColor: typeFilter === t ? 'var(--teal)' : undefined,
                boxShadow: typeFilter === t ? 'inset 0 0 0 1px var(--teal)' : undefined,
              }}
              onClick={() => setTypeFilter(typeFilter === t ? 'ALL' : t)}
            >
              <div style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
                color: typeFilter === t ? 'var(--teal)' : 'var(--ink3)',
              }}>
                {cfg.plural}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{count}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>accounts</div>
            </div>
          );
        })}
      </div>

      {/* Table Card Container */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', background: 'var(--white)' }}>

        {/* Toolbar Header: Tabs on Left, Search on Right */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as AccountType | 'ALL')} variant="pill">
            <TabsList>
              <TabsTrigger value="ALL">All ({flat.length})</TabsTrigger>
              {TYPE_ORDER.map(t => (
                <TabsTrigger key={t} value={t}>
                  {TYPE_CFG[t].plural} ({stats[t] ?? 0})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
            <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' } as React.CSSProperties} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or name…"
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r, 6px)',
                fontSize: 13,
                fontFamily: 'var(--font)',
                background: 'var(--white)',
                color: 'var(--ink)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

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
          pagedTree.map(account => (
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

        {/* Hidden when it would only ever read "Page 1 of 1". */}
        {displayTree.length > PAGE_SIZE && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap', padding: '14px 16px', borderTop: '1px solid var(--border)',
            fontSize: 12.5, color: 'var(--ink3)',
          }}>
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, displayTree.length)} of {displayTree.length} top-level
              account{displayTree.length === 1 ? '' : 's'}
              {/* The two numbers differ whenever anything is expanded, and not
                  saying so makes the first one look wrong. */}
              {rowsOnPage !== pagedTree.length && <> · {rowsOnPage} rows shown</>}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary btn-sm"
                disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <Icon name="arrowLeft" size={12} /> Previous
              </button>
              <span style={{ minWidth: 70, textAlign: 'center' }}>Page {currentPage} of {pageCount}</span>
              <button type="button" className="btn btn-secondary btn-sm"
                disabled={currentPage === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
                Next <Icon name="arrowRight" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selected account detail panel */}
      {selected && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: 320,
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--elev-lg)',
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

    </div>
  );
};
