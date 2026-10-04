import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Badge } from '../components/ui/badge.js';

interface PlanRow {
  department_id: string; department_name: string; fiscal_year: number;
  approved_headcount: number; current_headcount: number; open_vacancies: number; planned_hiring: number;
  budget_amount: string | null; budget_currency: string | null; notes: string | null;
}

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
            <Input type="number" min={0} autoFocus value={headcount} onChange={e => setHeadcount(e.target.value)} />
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Currently {row.current_headcount} assigned to this department.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Budget</label>
              <Input type="number" min={0} value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <Input value={budgetCurrency} onChange={e => setBudgetCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setRows(await apiFetch(`/v1/hr/workforce-planning?year=${year}`) ?? []); }
    catch { setRows([]); setLoadError('Could not load the workforce plan.'); }
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

  const columns: TableColumn<PlanRow>[] = [
    { key: 'department', header: 'Department', accessor: 'department_name', sortable: true },
    { key: 'approved', header: 'Approved', accessor: 'approved_headcount', sortable: true },
    { key: 'current', header: 'Current', accessor: 'current_headcount', sortable: true },
    { key: 'vacancies', header: 'Vacancies', render: row => <Badge variant={row.open_vacancies > 0 ? 'warning' : 'success'}>{row.open_vacancies}</Badge>, sortable: true },
    { key: 'planned', header: 'Planned hiring', accessor: 'planned_hiring', sortable: true },
    { key: 'budget', header: 'Budget', render: row => row.budget_amount ? `${row.budget_currency || ''} ${Number(row.budget_amount).toLocaleString()}`.trim() : '—' },
    { key: 'actions', header: '', align: 'right', width: 110, render: row => canEditPlan ? <Button size="sm" variant="outline" onClick={() => setEditing(row)}>Edit plan</Button> : null },
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

      <MetricsRow cards={[
        { title: 'Approved headcount', value: totals.approved.toLocaleString(), icon: 'target', loading, error: loadError ?? undefined, onRetry: load, emphasis: 'primary' },
        { title: 'Current headcount', value: totals.current.toLocaleString(), icon: 'users', loading, error: loadError ?? undefined, onRetry: load },
        { title: 'Open vacancies', value: totals.vacancies.toLocaleString(), icon: 'alertCircle', barHighlight: totals.vacancies > 0 ? 'var(--gold)' : 'var(--green)', loading, error: loadError ?? undefined, onRetry: load },
        { title: 'Planned hiring', value: totals.planned.toLocaleString(), icon: 'trendingUp', loading, error: loadError ?? undefined, onRetry: load },
      ]} />

      <DataTable
        columns={columns}
        rows={rows}
        idKey="department_id"
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && rows.length === 0}
        emptyIcon="building"
        emptyTitle="No departments to plan"
        emptyMessage="Add a department under People, then return here to set its approved headcount."
        defaultSortKey="department"
      />
    </div>
  );
}
