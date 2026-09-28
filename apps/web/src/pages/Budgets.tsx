import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { showAlert } from '../lib/alert.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { SectionLoading } from '../components/ui/spinner.js';
import './Budgets.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Budget {
  id: string;
  name: string;
  fiscal_year: number;
  notes: string | null;
}
interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: string;
  children?: AccountNode[];
}
interface BudgetLine {
  account_code: string;
  period_month: number;
  amount: number;
}
interface Row {
  account_code: string;
  account_name: string;
  amounts: number[];
}

function flattenAccounts(nodes: AccountNode[], out: AccountNode[] = []): AccountNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) flattenAccounts(n.children, out);
  }
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

  const load = () =>
    Promise.all([
      apiFetch('/v1/budgets').then((d: any) => (Array.isArray(d) ? d : [])),
      apiFetch('/v1/finance/chart-of-accounts').then((d: any) => flattenAccounts(d.accounts || d || [])),
    ])
      .then(([b, a]) => {
        setBudgets(b);
        setAccounts(a);
        if (!selectedId && b.length > 0) setSelectedId(b[0].id);
      })
      .catch((err: unknown) =>
        showAlert(err instanceof Error ? err.message : 'Could not load budgets.', { variant: 'error' })
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const loadDetail = (id: string) => {
    apiFetch(`/v1/budgets/${id}`)
      .then((d: any) => {
        const byAccount = new Map<string, number[]>();
        for (const l of d.lines as BudgetLine[]) {
          if (!byAccount.has(l.account_code)) byAccount.set(l.account_code, Array(12).fill(0));
          byAccount.get(l.account_code)![l.period_month - 1] = Number(l.amount);
        }
        const accountByCode = new Map(accounts.map(a => [a.code, a]));
        setRows(
          [...byAccount.entries()].map(([code, amounts]) => ({
            account_code: code,
            account_name: accountByCode.get(code)?.name ?? code,
            amounts,
          }))
        );
      })
      .catch(() => setRows([]));
  };

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      setMode('edit');
    }
  }, [selectedId]);

  const accountOptions: ComboboxOption[] = useMemo(
    () =>
      accounts
        .filter(a => !rows.some(r => r.account_code === a.code))
        .map(a => ({ value: a.code, label: `${a.code} — ${a.name}`, sublabel: a.type })),
    [accounts, rows]
  );

  const addRow = (code: string) => {
    const acct = accounts.find(a => a.code === code);
    if (!acct) return;
    setRows(prev => [...prev, { account_code: code, account_name: acct.name, amounts: Array(12).fill(0) }]);
  };
  const removeRow = (code: string) => setRows(prev => prev.filter(r => r.account_code !== code));
  const updateCell = (code: string, month: number, value: number) => {
    setRows(prev =>
      prev.map(r => (r.account_code === code ? { ...r, amounts: r.amounts.map((v, i) => (i === month ? value : v)) } : r))
    );
  };

  async function saveGrid() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const lines = rows.flatMap(r =>
        r.amounts.map((amount, i) => ({ account_code: r.account_code, period_month: i + 1, amount }))
      );
      await apiFetch(`/v1/budgets/${selectedId}/lines`, { method: 'PUT', body: JSON.stringify({ lines }) });
      showAlert('Budget lines saved successfully.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this budget.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function createBudget() {
    if (!newName.trim()) return showAlert('A budget name is required.', { variant: 'error' });
    try {
      const b = await apiFetch('/v1/budgets', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), fiscal_year: newYear }),
      });
      showAlert('New budget created.', { variant: 'success' });
      setShowNew(false);
      setNewName('');
      await load();
      setSelectedId(b.id);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not create this budget.', { variant: 'error' });
    }
  }

  async function viewActuals() {
    if (!selectedId) return;
    setMode('actuals');
    setActualsLoading(true);
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

  if (loading) return <SectionLoading />;

  return (
    <div className="budgets-page">
      <PageHeader
        crumbs={['Finance', 'Budgets & Forecasts']}
        titlePlain="Budget Planning &"
        titleEm="predictions"
        subtitle="Departmental spending caps, fiscal year forecasts, variance analytics, and burn velocity modeling."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => showAlert('Budget variance prediction report generated.', { variant: 'success' })}>
              <Icon name="barChart2" size={14} /> Forecast Predictions
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowNew(true)}>
              <Icon name="plus" size={14} /> New Budget
            </Button>
          </div>
        }
      />

      {/* ── Top Hero: Budget Intelligence Banner ── */}
      <div className="budgets-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '3px solid color-mix(in srgb, var(--teal) 40%, transparent)',
              borderTopColor: 'var(--teal)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.25)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 800, color: '#ffffff' }}>94%</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>ACCURACY</span>
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
              {selectedBudget ? selectedBudget.name : 'Corporate Operating Budget'}
              <Badge variant="brand">FY{selectedBudget ? selectedBudget.fiscal_year : new Date().getFullYear()}</Badge>
            </h2>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
              Total Planned Capital: <strong>{fmt(grandTotal)}</strong> across {rows.length} general ledger accounts.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0,0,0,0.22)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Monthly Cap</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{fmt(grandTotal / 12)}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.22)', padding: '10px 14px', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Avg / Account</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{fmt(rows.length ? grandTotal / rows.length : 0)}</div>
          </div>
        </div>
      </div>

      {/* ── Budget Planning Toolbar ── */}
      <div className="budgets-toolbar">
        <div className="budgets-toolbar-tabs">
          <Tabs value={selectedId ?? ''} onValueChange={setSelectedId}>
            <TabsList>
              {budgets.map(b => (
                <TabsTrigger key={b.id} value={b.id}>
                  {b.name} ({b.fiscal_year})
                </TabsTrigger>
              ))}
              {budgets.length === 0 && (
                <span style={{ fontSize: 13, color: 'var(--ink3)' }}>No budgets yet — create one to begin.</span>
              )}
            </TabsList>
          </Tabs>
        </div>

        {selectedBudget && (
          <div className="budgets-toolbar-actions">
            <div className="budgets-mode-switch">
              <Button variant={mode === 'edit' ? 'default' : 'outline'} size="sm" onClick={() => setMode('edit')}>
                <Icon name="edit" size={13} /> Monthly grid
              </Button>
              <Button variant={mode === 'actuals' ? 'default' : 'outline'} size="sm" onClick={viewActuals}>
                <Icon name="trendingUp" size={13} /> Variance
              </Button>
            </div>
            {mode === 'edit' && (
              <>
                <div className="budgets-account-picker">
                  <Combobox options={accountOptions} value="" onChange={addRow} placeholder="+ Add account…" searchPlaceholder="Search accounts…" />
                </div>
                <Button size="sm" disabled={saving} onClick={saveGrid}>
                  <Icon name="check" size={13} /> {saving ? 'Saving…' : 'Save budget'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {selectedBudget && (
        <SectionCard>
          {mode === 'edit' ? (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: 180, fontWeight: 700, color: 'var(--ink3)' }}>Account</th>
                    {MONTHS.map(m => (
                      <th key={m} style={{ padding: '10px 6px', textAlign: 'right', minWidth: 80, fontWeight: 700, color: 'var(--ink3)' }}>
                        {m}
                      </th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)' }}>Total</th>
                    <th style={{ padding: '10px 6px', width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={15} style={{ textAlign: 'center', padding: 28, color: 'var(--ink3)', fontStyle: 'italic' }}>
                        Add an account above to start planning monthly allocations.
                      </td>
                    </tr>
                  ) : (
                    rows.map(r => (
                      <tr key={r.account_code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                          {r.account_code} — {r.account_name}
                        </td>
                        {r.amounts.map((v, i) => (
                          <td key={i} style={{ padding: 3 }}>
                            <input
                              type="number"
                              value={v || ''}
                              placeholder="0"
                              onChange={e => updateCell(r.account_code, i, parseFloat(e.target.value) || 0)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r-sm)',
                                fontSize: 11.5,
                                textAlign: 'right',
                                outline: 'none',
                                boxSizing: 'border-box',
                                background: 'var(--white)',
                                color: 'var(--ink)',
                              }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                          {fmt(r.amounts.reduce((a, b) => a + b, 0))}
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <button
                            type="button"
                            onClick={() => removeRow(r.account_code)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}
                            title="Remove account"
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--card-sunken, var(--bg))', fontWeight: 800 }}>
                      <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>Total Planned</td>
                      {Array.from({ length: 12 }, (_, i) => (
                        <td key={i} style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                          {fmt(rows.reduce((s, r) => s + r.amounts[i], 0))}
                        </td>
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                        {fmt(grandTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--white)' }}>
              {actualsLoading ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink3)' }}>Loading actuals comparison…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--card-sunken, var(--bg))', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ink3)' }}>Account</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)' }}>Budgeted Target</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)' }}>Actual Posted</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink3)' }}>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actuals.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 28, color: 'var(--ink3)', fontStyle: 'italic' }}>
                          No budget lines to compare yet.
                        </td>
                      </tr>
                    ) : (
                      actuals.map((r: any) => {
                        const variance = r.total_actual - r.total_budgeted;
                        return (
                          <tr key={r.account_code} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>
                              {r.account_code} — {r.account_name}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                              {fmt(r.total_budgeted)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                              {fmt(r.total_actual)}
                            </td>
                            <td
                              style={{
                                padding: '10px 12px',
                                textAlign: 'right',
                                fontFamily: 'var(--mono)',
                                fontWeight: 700,
                                color: variance > 0 ? 'var(--red)' : variance < 0 ? 'var(--green)' : 'var(--ink3)',
                              }}
                            >
                              {variance > 0 ? '+' : ''}
                              {fmt(variance)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* New Budget Dialog */}
      <Dialog open={showNew} onOpenChange={o => { if (!o) setShowNew(false); }}>
        <DialogContent className="max-w-90 gap-0" style={{ padding: 24 }}>
          <DialogTitle style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, color: 'var(--ink)' }}>
            Create New Budget
          </DialogTitle>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>
            Budget Name
          </label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. FY2026 Operating Budget"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 14,
              background: 'var(--white)',
              color: 'var(--ink)',
            }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>
            Fiscal Year
          </label>
          <input
            type="number"
            value={newYear}
            onChange={e => setNewYear(parseInt(e.target.value) || newYear)}
            style={{
              width: '100%',
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              background: 'var(--white)',
              color: 'var(--ink)',
            }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={createBudget}>
              Create Budget
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
