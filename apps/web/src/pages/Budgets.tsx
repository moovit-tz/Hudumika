import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Budget { id: string; name: string; fiscal_year: number; notes: string | null }
interface AccountNode { id: string; code: string; name: string; type: string; children?: AccountNode[] }
interface BudgetLine { account_code: string; period_month: number; amount: number }
interface Row { account_code: string; account_name: string; amounts: number[] }

function flattenAccounts(nodes: AccountNode[], out: AccountNode[] = []): AccountNode[] {
  for (const n of nodes) { out.push(n); if (n.children?.length) flattenAccounts(n.children, out); }
  return out;
}

export function Budgets() {
  const { fmt } = useCurrency();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<'edit' | 'actuals'>('edit');
  const [actuals, setActuals] = useState<any[]>([]);
  const [actualsLoading, setActualsLoading] = useState(false);

  const load = () => Promise.all([
    apiFetch('/v1/budgets').then((d: any) => Array.isArray(d) ? d : []),
    apiFetch('/v1/finance/chart-of-accounts').then((d: any) => flattenAccounts(d.accounts || d || [])),
  ]).then(([b, a]) => {
    setBudgets(b); setAccounts(a);
    if (!selectedId && b.length > 0) setSelectedId(b[0].id);
  }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = (id: string) => {
    apiFetch(`/v1/budgets/${id}`).then((d: any) => {
      const byAccount = new Map<string, number[]>();
      for (const l of (d.lines as BudgetLine[])) {
        if (!byAccount.has(l.account_code)) byAccount.set(l.account_code, Array(12).fill(0));
        byAccount.get(l.account_code)![l.period_month - 1] = Number(l.amount);
      }
      const accountByCode = new Map(accounts.map(a => [a.code, a]));
      setRows([...byAccount.entries()].map(([code, amounts]) => ({ account_code: code, account_name: accountByCode.get(code)?.name ?? code, amounts })));
    }).catch(() => setRows([]));
  };

  useEffect(() => { if (selectedId) { loadDetail(selectedId); setMode('edit'); } }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountOptions: ComboboxOption[] = useMemo(
    () => accounts.filter(a => !rows.some(r => r.account_code === a.code)).map(a => ({ value: a.code, label: `${a.code} — ${a.name}`, sublabel: a.type })),
    [accounts, rows],
  );

  const addRow = (code: string) => {
    const acct = accounts.find(a => a.code === code);
    if (!acct) return;
    setRows(prev => [...prev, { account_code: code, account_name: acct.name, amounts: Array(12).fill(0) }]);
  };
  const removeRow = (code: string) => setRows(prev => prev.filter(r => r.account_code !== code));
  const updateCell = (code: string, month: number, value: number) => {
    setRows(prev => prev.map(r => r.account_code === code ? { ...r, amounts: r.amounts.map((v, i) => i === month ? value : v) } : r));
  };

  async function saveGrid() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const lines = rows.flatMap(r => r.amounts.map((amount, i) => ({ account_code: r.account_code, period_month: i + 1, amount })));
      await apiFetch(`/v1/budgets/${selectedId}/lines`, { method: 'PUT', body: JSON.stringify({ lines }) });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this budget.');
    } finally {
      setSaving(false);
    }
  }

  async function createBudget() {
    if (!newName.trim()) return showAlert('A budget name is required.');
    try {
      const b = await apiFetch('/v1/budgets', { method: 'POST', body: JSON.stringify({ name: newName.trim(), fiscal_year: newYear }) });
      setShowNew(false); setNewName('');
      await load();
      setSelectedId(b.id);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not create this budget.');
    }
  }

  async function viewActuals() {
    if (!selectedId) return;
    setMode('actuals'); setActualsLoading(true);
    try {
      const r = await apiFetch(`/v1/budgets/${selectedId}/vs-actuals`);
      setActuals(r.rows || []);
    } catch {
      setActuals([]);
    } finally {
      setActualsLoading(false);
    }
  }

  const selectedBudget = budgets.find(b => b.id === selectedId);
  const grandTotal = rows.reduce((s, r) => s + r.amounts.reduce((a, b) => a + b, 0), 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>Loading budgets…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--white)', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Finance', 'Accounts']}
        titlePlain="Budget"
        titleEm="planning"
        subtitle="Plan spend and revenue by account and month, then compare against what actually posted."
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={13} /> New Budget
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {budgets.map(b => (
          <button key={b.id} type="button" onClick={() => setSelectedId(b.id)}
            style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: selectedId === b.id ? '1.5px solid var(--teal)' : '1px solid var(--border)', background: selectedId === b.id ? 'var(--teal-l)' : 'var(--white)', color: selectedId === b.id ? 'var(--teal)' : 'var(--ink2)' }}>
            {b.name} ({b.fiscal_year})
          </button>
        ))}
        {budgets.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink3)' }}>No budgets yet — create one to begin.</span>}
      </div>

      {selectedBudget && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={mode === 'edit' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setMode('edit')}>Edit</button>
              <button type="button" className={mode === 'actuals' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={viewActuals}>vs. Actuals</button>
            </div>
            {mode === 'edit' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Combobox options={accountOptions} value="" onChange={addRow} placeholder="+ Add account…" searchPlaceholder="Search accounts…" />
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={saveGrid}>{saving ? 'Saving…' : 'Save Budget'}</button>
              </div>
            )}
          </div>

          {mode === 'edit' ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="rtbl-wrap">
                <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 180 }}>Account</th>
                      {MONTHS.map(m => <th key={m} style={{ padding: '8px 6px', textAlign: 'right', minWidth: 80 }}>{m}</th>)}
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '8px 6px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={15} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>Add an account to start budgeting.</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.account_code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.account_code} — {r.account_name}</td>
                        {r.amounts.map((v, i) => (
                          <td key={i} style={{ padding: 2 }}>
                            <input type="number" value={v || ''} placeholder="0" onChange={e => updateCell(r.account_code, i, parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }} />
                          </td>
                        ))}
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(r.amounts.reduce((a, b) => a + b, 0))}</td>
                        <td style={{ padding: '6px 6px' }}>
                          <button type="button" onClick={() => removeRow(r.account_code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}><Icon name="x" size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg)', fontWeight: 800 }}>
                        <td style={{ padding: '8px 10px' }}>Total</td>
                        {Array.from({ length: 12 }, (_, i) => (
                          <td key={i} style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(rows.reduce((s, r) => s + r.amounts[i], 0))}</td>
                        ))}
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{fmt(grandTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {actualsLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading actuals…</div>
              ) : (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Account</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Budgeted</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actual</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actuals.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--ink3)', fontStyle: 'italic' }}>No budget lines to compare yet.</td></tr>
                      ) : actuals.map((r: any) => {
                        const variance = r.total_actual - r.total_budgeted;
                        return (
                          <tr key={r.account_code} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.account_code} — {r.account_name}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.total_budgeted)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.total_actual)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: variance > 0 ? 'var(--red)' : variance < 0 ? 'var(--green)' : 'var(--ink3)' }}>
                              {variance > 0 ? '+' : ''}{fmt(variance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showNew && (
        <>
          <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: 360 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>New Budget</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. FY2026 Operating Budget"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Fiscal Year</label>
              <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value) || newYear)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={createBudget}>Create</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
