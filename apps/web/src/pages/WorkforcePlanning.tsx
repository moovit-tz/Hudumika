import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';

interface PlanRow {
  department_id: string; department_name: string; fiscal_year: number;
  approved_headcount: number; current_headcount: number; open_vacancies: number; planned_hiring: number;
  budget_amount: string | null; budget_currency: string | null; notes: string | null;
}

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };

function EditPlanDialog({ row, onClose, onSaved }: { row: PlanRow; onClose: () => void; onSaved: () => void }) {
  const [headcount, setHeadcount] = useState(String(row.approved_headcount));
  const [budgetAmount, setBudgetAmount] = useState(row.budget_amount || '');
  const [budgetCurrency, setBudgetCurrency] = useState(row.budget_currency || 'TZS');
  const [notes, setNotes] = useState(row.notes || '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/v1/hr/workforce-planning', {
        method: 'POST',
        body: JSON.stringify({
          department_id: row.department_id, fiscal_year: row.fiscal_year,
          approved_headcount: Number(headcount) || 0,
          budget_amount: budgetAmount || undefined, budget_currency: budgetCurrency || undefined,
          notes: notes || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not save the headcount plan.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{row.department_name} — {row.fiscal_year}</DialogTitle></DialogHeader>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Approved headcount</label>
            <input type="number" min={0} autoFocus value={headcount} onChange={e => setHeadcount(e.target.value)} style={inp} />
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Currently {row.current_headcount} assigned to this department.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Budget</label>
              <input type="number" min={0} value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <input value={budgetCurrency} onChange={e => setBudgetCurrency(e.target.value.toUpperCase())} maxLength={3} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkforcePlanning() {
  const { user } = useAuth();
  // Setting a plan is admin-tier on the backend (POST /workforce-planning) —
  // this only decides whether to show an edit action a MANAGER's click
  // would just get refused; the API enforces the real rule.
  const canEditPlan = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await apiFetch(`/v1/hr/workforce-planning?year=${year}`) ?? []); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    approved: acc.approved + r.approved_headcount,
    current: acc.current + r.current_headcount,
    vacancies: acc.vacancies + r.open_vacancies,
    planned: acc.planned + r.planned_hiring,
  }), { approved: 0, current: 0, vacancies: 0, planned: 0 }), [rows]);

  const YEARS = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  const KPIS = [
    { label: 'Approved headcount', value: totals.approved, icon: 'target', variant: 'brand' as const },
    { label: 'Current headcount', value: totals.current, icon: 'users', variant: 'info' as const },
    { label: 'Open vacancies', value: totals.vacancies, icon: 'alertCircle', variant: totals.vacancies > 0 ? 'warning' as const : 'success' as const },
    { label: 'Planned hiring', value: totals.planned, icon: 'trendingUp', variant: 'brand' as const },
  ];

  return (
    <div>
      {editing && <EditPlanDialog row={editing} onClose={() => setEditing(null)} onSaved={load} />}

      <PageHeader
        crumbs={['NexusHR', 'People']}
        titlePlain="Workforce"
        titleEm="planning"
        subtitle="Approved headcount, who's actually in the seat, and who's already in motion to fill it — three separate numbers, on purpose."
        actions={
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger style={{ width: 110, height: 36 }}><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        {KPIS.map(k => (
          <SectionCard key={k.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FeaturedIcon variant={k.variant} size="sm"><Icon name={k.icon as any} size={16} /></FeaturedIcon>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{k.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{k.label}</div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard padded={false}>
        {loading ? <SectionLoading /> : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No departments yet — add one under People ▸ Departments first.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Department', 'Approved', 'Current', 'Vacancies', 'Planned hiring', 'Budget', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === '' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.department_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.department_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.approved_headcount}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.current_headcount}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-sm)', background: r.open_vacancies > 0 ? 'var(--gold-l)' : 'var(--green-l)', color: r.open_vacancies > 0 ? 'var(--gold)' : 'var(--green)' }}>
                        {r.open_vacancies}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.planned_hiring}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.budget_amount ? `${r.budget_currency || ''} ${Number(r.budget_amount).toLocaleString()}`.trim() : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {canEditPlan && <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit plan</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
