import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiFetchBlob } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.js';
import { SectionLoading, PageLoading } from '../../components/ui/spinner.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { PayrollSettingsModal } from '../PayrollSettingsModal.js';
import { Avatar, Badge, PageHeader, Card, TH, TD, Wrap, PrimaryBtn, ActionBtn, fmtTZS } from './shared.js';

const ltLabel: React.CSSProperties = { display:'block', fontSize:10.5, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 };
const ltInput: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', fontSize:13, fontFamily:'var(--font)', color:'var(--ink)', background:'var(--white)' };
type DesigRow = { id?: string; title: string; dept: string; department_id?: string | null; employees: number };
type DeptOption = { id: string; name: string };

function DesigForm({ depts, initial, onCancel, onSubmit }: {
  depts: DeptOption[]; initial?: DesigRow; onCancel: () => void; onSubmit: (v: { title: string; department_id: string }) => void;
}) {
  return (
    <Card>
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const deptId = fd.get('department_id') as string;
        onSubmit({ title: fd.get('title') as string, department_id: deptId === '__none__' ? '' : deptId });
      }} style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Title</label>
          <input name="title" required defaultValue={initial?.title} placeholder="e.g. Senior Officer" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Department</label>
          <Select name="department_id" defaultValue={initial?.department_id || '__none__'}>
            <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- None --</SelectItem>
              {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <PrimaryBtn label={initial ? 'Save' : 'Create'} type="submit" />
        <ActionBtn label="Cancel" onClick={onCancel} />
      </form>
    </Card>
  );
}

export function DesignationsPage() {
  const [desigs, setDesigs] = useState<DesigRow[]>([]);
  const [depts, setDepts] = useState<DeptOption[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<DesigRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/designations');
      const data = Array.isArray(res) ? res : [];
      setDesigs(data.map((d: any) => ({ id: d.id, title: d.title, dept: d.department_name || '', department_id: d.department_id, employees: d.employee_count || 0 })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  const loadDepts = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/departments');
      if (Array.isArray(res)) setDepts(res.map((d: any) => ({ id: d.id, name: d.name })));
    } catch { /* keep empty */ }
  }, []);
  useEffect(() => { load(); loadDepts(); }, [load, loadDepts]);

  async function handleDelete(id: string) {
    setDesigs(prev => prev.filter(d => d.id !== id));
    try { await apiFetch(`/v1/hr/designations/${id}`, { method: 'DELETE' }); } catch (error: any) { load(); showAlert(error?.message || 'Could not delete the designation.', { variant: 'error' }); }
  }
  async function create(v: { title: string; department_id: string }) {
    try {
      await apiFetch('/v1/hr/designations', { method: 'POST', body: JSON.stringify({ title: v.title, department_id: v.department_id || null }) });
      setShowNew(false); load();
    } catch (error: any) { showAlert(error?.message || 'Could not create the designation.', { variant: 'error' }); }
  }
  async function save(id: string, v: { title: string; department_id: string }) {
    try {
      await apiFetch(`/v1/hr/designations/${id}`, { method: 'PATCH', body: JSON.stringify({ title: v.title, department_id: v.department_id || null }) });
      setEditing(null); load();
    } catch (error: any) { showAlert(error?.message || 'Could not update the designation.', { variant: 'error' }); }
  }

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="award" title="Job Designations" sub="Job titles and role classifications" backTo="/nexushr">
        <PrimaryBtn label="Add Designation" icon="plus" onClick={() => { setEditing(null); setShowNew(v => !v); }} />
      </PageHeader>

      {showNew && <DesigForm depts={depts} onCancel={() => setShowNew(false)} onSubmit={create} />}
      {editing && <DesigForm depts={depts} initial={editing} onCancel={() => setEditing(null)} onSubmit={v => save(editing.id!, v)} />}

      <Wrap>
        <thead><tr><TH>Designation / Title</TH><TH>Department</TH><TH right>Employees</TH><TH right>Actions</TH></tr></thead>
        <tbody>
          {desigs.map(d => (
            <tr key={d.title} style={{ borderBottom:'1px solid var(--border)' }}>
              <TD bold>{d.title}</TD>
              <TD muted>{d.dept}</TD>
              <TD right bold>{d.employees}</TD>
              <TD right>{d.id && <><ActionBtn label="Edit" onClick={() => { setShowNew(false); setEditing(d); }} /><ActionBtn label="Delete" color="var(--red)" onClick={() => handleDelete(d.id!)} /></>}</TD>
            </tr>
          ))}
        </tbody>
      </Wrap>
    </div>
  );
}

type PayRun = { id: string; name: string; period_month: number; period_year: number; status: string; employee_count?: any; total_gross?: any; total_employee_deductions?: any; total_employer_cost?: any; total_remitted?: any; total_net?: any };
type Payslip = { id: string; user_id: string; name: string; email?: string; basic_pay: any; gross_pay: any; taxable_pay: any; income_tax: any; employee_contributions: any; other_deductions: any; total_deductions: any; employer_contributions: any; net_pay: any; lines?: any };

const RUN_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  DRAFT:            { bg:'var(--bg)',      fg:'var(--ink3)'  },
  CALCULATED:       { bg:'var(--blue-l)',  fg:'var(--blue)'  },
  PENDING_APPROVAL: { bg:'var(--gold-l)',  fg:'var(--gold)'  },
  APPROVED:         { bg:'var(--green-l)', fg:'var(--green)' },
  PAID:             { bg:'var(--green-l)', fg:'var(--green)' },
  CANCELLED:        { bg:'var(--red-l)',   fg:'var(--red)'   },
};
const payNum = (v: any) => Number(v || 0);
const payMoney = (v: any) => 'TZS ' + payNum(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const payM = (v: any) => 'TZS ' + (payNum(v) / 1_000_000).toFixed(2) + 'M';

// Rewired onto the real statutory payroll engine (/v1/payroll/*): runs are
// created, calculated (PAYE + social-security bands from payroll_tax_bands /
// contribution schemes), then approved. Replaces the old naive /v1/hr/payroll
// page whose deductions were a single number and whose "PAYE 70% / NSSF 30%"
// split was hardcoded.
export function PayrollPage() {
  const now = new Date();
  const { user } = useAuth();
  // Mirrors the API's PAYROLL_ROLES (payroll.routes.ts) — who may act on a run.
  const canRun = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'].includes(user?.role ?? '');
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ run: PayRun; payslips: Payslip[]; totals: any } | null>(null);
  const [busy, setBusy] = useState<'' | 'create' | 'calc' | 'approve' | 'distribute' | 'mark-paid' | 'delete'>('');
  const [search, setSearch] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payrollYear, setPayrollYear] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Payslip | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const r = await apiFetch('/v1/payroll/runs');
      const list: PayRun[] = Array.isArray(r) ? r : [];
      setRuns(list);
      setSelId(prev => (prev && list.some(x => x.id === prev)) ? prev : (list[0]?.id ?? null));
    } catch { setRuns([]); }
  }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await apiFetch(`/v1/payroll/runs/${id}`)); } catch { setDetail(null); }
  }, []);
  useEffect(() => { if (selId) loadDetail(selId); else setDetail(null); }, [selId, loadDetail]);

  const createRun = async () => {
    const period = `${now.toLocaleString('en', { month: 'long' })} ${now.getFullYear()}`;
    if (!(await showConfirm(`Start the ${period} payroll run?`, { confirmLabel: 'Start run' }))) return;
    setBusy('create'); setErr(null);
    try {
      const r = await apiFetch('/v1/payroll/runs', { method: 'POST', body: JSON.stringify({ period_month: now.getMonth() + 1, period_year: now.getFullYear() }) });
      await loadRuns(); if (r?.id) setSelId(r.id);
    } catch (e: any) { showAlert(e?.message || 'Could not create a run.'); }
    finally { setBusy(''); }
  };

  // The lifecycle (calculate → approve → mark paid → send payslips) existed
  // only in the API — the page could create a draft run and nothing more, so a
  // payroll could never actually be run from the UI. Every step is validated
  // server-side (409s carry a plain-language reason, surfaced as-is).
  const runAction = async (kind: 'calc' | 'approve' | 'mark-paid' | 'distribute' | 'delete') => {
    const run = detail?.run;
    if (!run || busy) return;
    const period = `${MONTH_ABBR[run.period_month - 1]} ${run.period_year}`;
    const confirmations: Record<string, [string, string]> = {
      approve: [`Approve the ${period} payroll? Once approved its figures are frozen and can no longer be recalculated.`, 'Approve'],
      'mark-paid': [`Mark the ${period} payroll as paid? This posts wages, PAYE and statutory liabilities to the general ledger and cannot be undone.`, 'Mark as paid'],
      distribute: [`Email each employee their ${period} payslip?`, 'Send payslips'],
      delete: [`Delete the draft ${period} payroll run?`, 'Delete'],
    };
    const ask = confirmations[kind];
    if (ask && !(await showConfirm(ask[0], { confirmLabel: ask[1], variant: kind === 'delete' ? 'danger' : undefined }))) return;
    setBusy(kind);
    try {
      const base = `/v1/payroll/runs/${run.id}`;
      if (kind === 'calc') {
        const r = await apiFetch(`${base}/calculate`, { method: 'POST' });
        if (r?.skipped?.length) {
          showAlert(`${r.skipped.length} ${r.skipped.length === 1 ? 'person was' : 'people were'} left out because no basic salary is recorded. Add a salary for them, then recalculate.`,
            { variant: 'warning', items: r.skipped.map((s: any) => s.name) });
        }
      } else if (kind === 'approve') {
        await apiFetch(`${base}/approve`, { method: 'POST' });
      } else if (kind === 'mark-paid') {
        await apiFetch(`${base}/mark-paid`, { method: 'POST' });
        showAlert('Payroll marked as paid and posted to the general ledger.', { variant: 'success' });
      } else if (kind === 'distribute') {
        const r = await apiFetch(`${base}/distribute`, { method: 'POST' });
        showAlert(`Sent ${r?.sent ?? 0} of ${r?.total ?? 0} payslips.`, { variant: r?.skipped ? 'warning' : 'success', items: r?.failures?.length ? r.failures : undefined });
      } else {
        await apiFetch(base, { method: 'DELETE' });
        setSelId(null);
      }
      await loadRuns();
      if (kind !== 'delete') await loadDetail(run.id);
    } catch (e: any) { showAlert(e?.message || 'That action failed.'); }
    finally { setBusy(''); }
  };

  const downloadRunFile = async (kind: 'bank' | 'paye') => {
    const run = detail?.run;
    if (!run) return;
    try {
      if (kind === 'bank') {
        const blob = await apiFetchBlob(`/v1/payroll/runs/${run.id}/bank-file`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `bank-file_${run.period_year}-${String(run.period_month).padStart(2, '0')}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } else {
        const blob = await apiFetchBlob(`/v1/payroll/runs/${run.id}/paye-return/pdf`);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e: any) { showAlert(e?.message || 'Could not download the file.'); }
  };

  const payslips = detail?.payslips ?? [];
  const filteredSlips = payslips.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (st: string) => {
    switch (st?.toUpperCase()) {
      case 'PAID':
      case 'APPROVED':
      case 'COMPLETED':
        return { bg: 'var(--blue-l)', color: 'var(--blue)', label: 'Completed' };
      case 'REJECTED':
      case 'REJECT':
        return { bg: 'var(--red-l)', color: 'var(--red)', label: 'Reject' };
      default:
        return { bg: 'var(--gold-l)', color: 'var(--gold)', label: 'Pending' };
    }
  };

  // Real overtime paid on a slip — the calculate step (payroll.routes.ts)
  // adds one earning line per rate with a code of the form OT_<KIND>, so
  // summing those (rather than a hardcoded figure) is the actual amount.
  const overtimePaid = (slip: Payslip): number => {
    const lines: any[] = Array.isArray(slip.lines) ? slip.lines : [];
    return lines.filter(l => String(l?.code || '').startsWith('OT_')).reduce((s, l) => s + payNum(l.amount), 0);
  };

  // Real per-run totals, calculated the same way summariseRun() on the
  // backend does — total_gross/total_net/total_employer_cost/
  // total_employee_deductions are real columns on payroll_runs, set once a
  // run is calculated (draft/uncalculated runs report 0, honestly, rather
  // than nothing rendering).
  const availableYears = Array.from(new Set(runs.map(r => r.period_year))).sort((a, b) => b - a);
  const effectiveYear = payrollYear ?? availableYears[0] ?? now.getFullYear();
  const yearRuns = runs
    .filter(r => r.period_year === effectiveYear)
    .sort((a, b) => a.period_month - b.period_month);

  const runCost = (r: PayRun) => {
    const net = payNum(r.total_net);
    const other = Math.max(0, payNum(r.total_gross) + payNum(r.total_employer_cost) - net);
    return { net, other, total: net + other };
  };
  const maxRunTotal = Math.max(1, ...yearRuns.map(r => runCost(r).total));

  const yearTotals = yearRuns.reduce((acc, r) => ({
    net: acc.net + payNum(r.total_net),
    deductions: acc.deductions + payNum(r.total_employee_deductions),
    employerCost: acc.employerCost + payNum(r.total_employer_cost),
  }), { net: 0, deductions: 0, employerCost: 0 });
  const yearGrandTotal = Math.max(1, yearTotals.net + yearTotals.deductions + yearTotals.employerCost);
  const donutSlices = [
    { label: 'Net pay', value: yearTotals.net, color: 'var(--blue)' },
    { label: 'Employee deductions', value: yearTotals.deductions, color: 'var(--gold)' },
    { label: 'Employer contributions', value: yearTotals.employerCost, color: 'var(--green)' },
  ].map(s => ({ ...s, pct: Math.round((s.value / yearGrandTotal) * 100) }));
  let donutCursor = 0;
  const donutGradient = donutSlices.map(s => {
    const from = donutCursor;
    donutCursor += (s.value / yearGrandTotal) * 360;
    return `${s.color} ${from}deg ${donutCursor}deg`;
  }).join(', ');

  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function downloadPayslipsCsv() {
    const header = ['Name', 'Email', 'Gross pay', 'Overtime', 'Net pay', 'Status'];
    const rows = filteredSlips.map(p => [
      p.name, p.email || '', payNum(p.gross_pay), overtimePaid(p), payNum(p.net_pay), (p as any).status || 'PAID',
    ]);
    const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslips-${detail?.run?.name || 'run'}.csv`.replace(/[^a-z0-9.-]+/gi, '-');
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* ðŸŒŸ Header Bar matching WorkDo Image 4 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Dashboard</span> <span style={{ color: 'var(--ink3)' }}>/</span> <span style={{ color: 'var(--ink2)' }}>Payroll</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
            Payroll
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={() => setShowSettings(true)}
            style={{ height: 38, borderRadius: 'var(--r)', padding: '0 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="sliders" size={15} /> Statutory rates
          </Button>
          <Button
            onClick={createRun}
            disabled={busy === 'create'}
            style={{ height: 38, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, borderRadius: 'var(--r)', padding: '0 16px', fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px hsl(var(--primary) / 0.3)' }}
          >
            <Icon name="plus" size={15} /> Add Payroll
          </Button>
        </div>
      </div>

      {showSettings && <PayrollSettingsModal onClose={() => setShowSettings(false)} />}

      {detail?.run && (() => {
        const run = detail.run;
        const st = String(run.status).toUpperCase();
        const steps = ['DRAFT', 'CALCULATED', 'APPROVED', 'PAID'];
        const at = Math.max(0, steps.indexOf(st === 'PENDING_APPROVAL' ? 'CALCULATED' : st));
        const stepLabel: Record<string, string> = { DRAFT: 'Draft', CALCULATED: 'Calculated', APPROVED: 'Approved', PAID: 'Paid' };
        const btn: React.CSSProperties = { height: 34, fontSize: 12.5, borderRadius: 'var(--r)', padding: '0 14px' };
        return (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{run.name}</span>
                {runs.length > 1 && (
                  <Select value={selId ?? ''} onValueChange={setSelId}>
                    <SelectTrigger aria-label="Payroll run" style={{ height: 30, width: 190, fontSize: 12 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {runs.map(r => <SelectItem key={r.id} value={r.id}>{MONTH_ABBR[r.period_month - 1]} {r.period_year} · {String(r.status).toLowerCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Run progress">
                {steps.map((s, i) => (
                  <React.Fragment key={s}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: i <= at ? 'var(--teal-l)' : 'var(--bg)', color: i <= at ? 'var(--teal)' : 'var(--ink3)', border: `1px solid ${i === at ? 'var(--teal)' : 'transparent'}` }}>{stepLabel[s]}</span>
                    {i < steps.length - 1 && <span style={{ color: 'var(--ink3)', fontSize: 11 }}>›</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {canRun ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {st === 'DRAFT' && <>
                  <Button style={btn} disabled={!!busy} onClick={() => runAction('calc')}>{busy === 'calc' ? 'Calculating…' : 'Calculate payroll'}</Button>
                  <Button variant="secondary" style={{ ...btn, color: 'var(--red)' }} disabled={!!busy} onClick={() => runAction('delete')}>Delete draft</Button>
                </>}
                {(st === 'CALCULATED' || st === 'PENDING_APPROVAL') && <>
                  <Button style={btn} disabled={!!busy} onClick={() => runAction('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>
                  <Button variant="secondary" style={btn} disabled={!!busy} onClick={() => runAction('calc')}>{busy === 'calc' ? 'Calculating…' : 'Recalculate'}</Button>
                </>}
                {st === 'APPROVED' && (
                  <Button style={btn} disabled={!!busy} onClick={() => runAction('mark-paid')}>{busy === 'mark-paid' ? 'Posting…' : 'Mark as paid'}</Button>
                )}
                {(st === 'APPROVED' || st === 'PAID') && <>
                  <Button variant="secondary" style={btn} disabled={!!busy} onClick={() => runAction('distribute')}>{busy === 'distribute' ? 'Sending…' : 'Send payslips'}</Button>
                  <Button variant="secondary" style={btn} disabled={!!busy} onClick={() => downloadRunFile('bank')}>Bank file (CSV)</Button>
                  <Button variant="secondary" style={btn} disabled={!!busy} onClick={() => downloadRunFile('paye')}>PAYE return (PDF)</Button>
                </>}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Running payroll is limited to administrators and finance.</div>
            )}
          </div>
        );
      })()}

      {/* ðŸ“Š Top Charts Row (Payroll Summary + Company Pay Donut) — both real,
          computed from payroll_runs' own stored totals (set once a run is
          calculated), not a formula. Replaces a mock that generated bar
          heights from `50 + (idx % 4) * 10` and a donut whose 5 hardcoded
          percentages didn't even sum to 100. */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left Card: Payroll Summary Bar Chart */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Payroll Summary</span>
            {availableYears.length > 0 && (
              <Select value={String(effectiveYear)} onValueChange={v => setPayrollYear(Number(v))}>
                <SelectTrigger style={{ height: 30, borderRadius: 'var(--r-sm)', fontSize: 11.5 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {yearRuns.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No calculated payroll runs for {effectiveYear} yet.
            </div>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)', position: 'relative' }}>
              {yearRuns.map(r => {
                const { net, other, total } = runCost(r);
                const heightPct = (total / maxRunTotal) * 100;
                return (
                  <div key={r.id} title={`${payMoney(total)} total cost`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: 16, borderRadius: 'var(--r-sm)', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', height: `${heightPct}%`, maxHeight: '100%' }}>
                      <div style={{ height: total > 0 ? `${(net / total) * 100}%` : '0%', background: 'var(--blue)' }} />
                      <div style={{ height: total > 0 ? `${(other / total) * 100}%` : '0%', background: 'var(--gold)' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--ink2)' }}>{MONTH_ABBR[r.period_month - 1]}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 12, color: 'var(--ink2)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--blue)' }} /> Net pay</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)' }} /> Deductions &amp; employer cost</span>
          </div>
        </div>

        {/* Right Card: Company Pay Donut Chart */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Company Pay — {effectiveYear}</span>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '14px 0' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: yearGrandTotal > 1 ? `conic-gradient(${donutGradient})` : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'var(--white)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{yearRuns.reduce((s, r) => s + payNum(r.employee_count), 0)}</span>
                <span style={{ fontSize: 8, color: 'var(--ink3)' }}>Employees paid</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
              {donutSlices.map(s => (
                <span key={s.label} style={{ color: s.color }}>
                  ● {s.pct}% <span style={{ color: 'var(--ink2)', fontWeight: 400 }}>{s.label}</span>
                </span>
              ))}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={downloadPayslipsCsv} disabled={filteredSlips.length === 0} style={{ height: 32, fontSize: 12, borderRadius: 'var(--r)', borderColor: 'var(--border)', width: '100%' }}>
            Download Report
          </Button>
        </div>
      </div>

      {/* ðŸ“‹ Main Data Table Container (WorkDo Payroll Style) */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
        {/* Table Filter Controls Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Payroll List</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', background: 'var(--card-sunken)', color: 'var(--ink)' }}
              />
            </div>

            <Button variant="outline" size="sm" onClick={downloadPayslipsCsv} disabled={filteredSlips.length === 0} style={{ height: 34, fontSize: 12, borderRadius: 'var(--r)', borderColor: 'var(--border)' }}>
              Download Report
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Total Salary</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Over Time</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSlips.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No payroll slips found in this run.
                  </td>
                </tr>
              ) : (
                filteredSlips.map(p => {
                  const st = getStatusBadge((p as any).status || 'PAID');
                  const ot = overtimePaid(p);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar name={p.name} size={30} userId={p.user_id} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
                        {payMoney(p.gross_pay)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)', fontFamily: 'var(--font)' }}>
                        {ot > 0 ? payMoney(ot) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                              <Icon name="moreHorizontal" size={18} color="var(--ink3)" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setViewing(p)}>View payslip</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => printPayslipPdf({ ...p, run_name: detail?.run?.name })}>Download PDF</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Every loaded payslip for this run renders above — nothing is
            truncated, so this states that plainly rather than pairing it
            with a page-number control that has no second page to go to. */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink2)' }}>
          Showing all {filteredSlips.length} of {payslips.length} entries
        </div>
      </div>

      {viewing && <PayslipDetailModal slip={viewing} runName={detail?.run?.name ?? ''} onClose={() => setViewing(null)} />}
    </div>
  );
}

// Print a payslip via a clean pop-up the browser can save as PDF — no server
// PDF dependency. Reads whatever fields the slip carries; a manager's slip and
// an employee's own /payslips/:id both fit.
function printPayslipPdf(slip: any) {
  const money = (v: any) => 'TZS ' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const period = (slip.period_year && slip.period_month)
    ? new Date(slip.period_year, slip.period_month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (slip.run_name ?? '');
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
  const row = (label: string, value: any, opts: { strong?: boolean; neg?: boolean } = {}) =>
    `<tr><td class="l${opts.strong ? ' b' : ''}">${esc(label)}</td><td class="v${opts.strong ? ' b' : ''}${opts.neg ? ' neg' : ''}">${opts.neg && Number(value) > 0 ? '−' : ''}${money(value)}</td></tr>`;
  const lines: any[] = Array.isArray(slip.lines) ? slip.lines : [];
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip — ${esc(slip.name)} — ${esc(period)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:40px;background:#fff}
      .wrap{max-width:640px;margin:0 auto}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:20px}
      .hd h1{font-size:20px;margin:0} .hd .sub{font-size:12px;color:#666;margin-top:4px}
      .hd .pd{text-align:right;font-size:12px;color:#666}
      table{width:100%;border-collapse:collapse} td{padding:8px 0;border-bottom:1px solid #eee;font-size:13px}
      td.v{text-align:right;font-variant-numeric:tabular-nums} td.b{font-weight:700} td.neg{color:#b91c1c}
      .net{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:2px solid #111}
      .net .lab{font-size:15px;font-weight:800} .net .amt{font-size:18px;font-weight:800;color:#047857}
      .foot{margin-top:20px;font-size:11px;color:#888} h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:20px 0 6px}
      @media print{body{padding:0}}
    </style></head><body><div class="wrap">
      <div class="hd"><div><h1>${esc(slip.name)}</h1><div class="sub">${esc(slip.email ?? '')}</div></div>
        <div class="pd"><div><b>Payslip</b></div><div>${esc(period)}</div><div>${esc(slip.run_name ?? '')}</div></div></div>
      <table>
        ${slip.basic_pay !== undefined ? row('Basic pay', slip.basic_pay) : ''}
        ${row('Gross pay', slip.gross_pay, { strong: true })}
        ${row('Taxable pay', slip.taxable_pay)}
        ${row('Income tax (PAYE)', slip.income_tax, { neg: true })}
        ${row('Employee contributions', slip.employee_contributions, { neg: true })}
        ${row('Other deductions', slip.other_deductions, { neg: true })}
        ${row('Total deductions', slip.total_deductions, { neg: true, strong: true })}
      </table>
      <div class="net"><span class="lab">Net pay</span><span class="amt">${money(slip.net_pay)}</span></div>
      ${lines.length ? `<h3>Breakdown</h3><table>${lines.map(l => row(l.label ?? l.name ?? l.code ?? 'Line', l.amount ?? l.value ?? 0)).join('')}</table>` : ''}
      ${slip.employer_contributions !== undefined ? `<div class="foot">Employer cost on top of gross: ${money(slip.employer_contributions)} in employer contributions. This payslip is computer-generated.</div>` : '<div class="foot">This payslip is computer-generated.</div>'}
    </div><script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
}

function PayslipDetailModal({ slip, runName, onClose }: { slip: Payslip; runName: string; onClose: () => void }) {
  const Row = ({ label, value, strong, negative }: { label: string; value: any; strong?: boolean; negative?: boolean }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:13, color: strong ? 'var(--ink)' : 'var(--ink2)', fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontSize:13, fontFamily:'var(--font)', fontWeight: strong ? 700 : 500, color: negative ? 'var(--red)' : 'var(--ink)' }}>{negative && payNum(value) > 0 ? '−' : ''}{payMoney(value)}</span>
    </div>
  );
  const lines: any[] = Array.isArray(slip.lines) ? slip.lines : [];
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-110 max-h-[88vh] overflow-y-auto gap-0">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 12 }}>
          <div>
            <DialogTitle style={{ fontSize:16 }}>{slip.name}</DialogTitle>
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>{runName}{slip.email ? ` · ${slip.email}` : ''}</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:4 }}><Icon name="x" size={18} /></button>
        </div>
        <div>{/* body */}
          <Row label="Basic pay" value={slip.basic_pay} />
          <Row label="Gross pay" value={slip.gross_pay} strong />
          <Row label="Taxable pay" value={slip.taxable_pay} />
          <Row label="Income tax (PAYE)" value={slip.income_tax} negative />
          <Row label="Employee contributions" value={slip.employee_contributions} negative />
          <Row label="Other deductions" value={slip.other_deductions} negative />
          <Row label="Total deductions" value={slip.total_deductions} negative />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0 4px', marginTop:6, borderTop:'2px solid var(--border)' }}>
            <span style={{ fontSize:14, fontWeight:800, color:'var(--ink)' }}>Net pay</span>
            <span style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font)', color:'var(--green)' }}>{payMoney(slip.net_pay)}</span>
          </div>
          <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:10 }}>Employer cost (on top of gross): {payMoney(slip.employer_contributions)} in employer contributions.</div>

          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
            <Button size="sm" variant="outline" onClick={() => printPayslipPdf({ ...slip, run_name: runName })}>
              <Icon name="download" size={13} /> Print / Save PDF
            </Button>
          </div>

          {lines.length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>Breakdown</div>
              {lines.map((ln, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:'var(--ink2)' }}>
                  <span>{ln.label ?? ln.name ?? ln.code ?? `Line ${i + 1}`}</span>
                  <span style={{ fontFamily:'var(--font)' }}>{payMoney(ln.amount ?? ln.value ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Employee salary-components editor. Components are effective-dated and add-only
// on the server (a new row supersedes; the calculator reads whatever is in force
// on the run's period-end), so this adds — it never edits or deletes in place.
// A person with no basic-pay component is *skipped and named* by /calculate,
// which is why setting pay here is the prerequisite for paying a new hire.
function PayComponentsModal({ onClose }: { onClose: () => void }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [userId, setUserId] = useState('');
  const [components, setComponents] = useState<any[]>([]);
  const [typeId, setTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    apiFetch('/v1/hr/staff').then(d => { if (Array.isArray(d)) setStaff(d); }).catch(() => {});
    apiFetch('/v1/payroll/settings').then(s => setTypes(s?.component_types ?? [])).catch(() => {});
  }, []);

  const loadComponents = useCallback(async (uid: string) => {
    if (!uid) { setComponents([]); return; }
    try { setComponents(await apiFetch(`/v1/payroll/employees/${uid}/components`) ?? []); } catch { setComponents([]); }
  }, []);
  useEffect(() => { loadComponents(userId); }, [userId, loadComponents]);

  const add = async () => {
    if (!userId || !typeId || amount === '') { setMsg({ text: 'Pick an employee, a component and an amount.', kind: 'err' }); return; }
    setSaving(true); setMsg(null);
    try {
      await apiFetch(`/v1/payroll/employees/${userId}/components`, {
        method: 'POST',
        body: JSON.stringify({ component_type_id: typeId, amount: Number(amount) }),
      });
      setAmount(''); setTypeId('');
      setMsg({ text: 'Component added — effective today.', kind: 'ok' });
      loadComponents(userId);
    } catch (e: any) { setMsg({ text: e?.message || 'Could not add the component.', kind: 'err' }); }
    finally { setSaving(false); }
  };

  const isEarn = (dir: string) => String(dir || '').toUpperCase().startsWith('EARN');

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-130 max-h-[88vh] overflow-y-auto gap-0">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 14 }}>
          <div>
            <DialogTitle style={{ fontSize:16 }}>Employee pay setup</DialogTitle>
            <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Set the salary components a payroll run reads to calculate pay.</div>
          </div>
          <button type="button" onClick={onClose} title="Close" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink3)', padding:4 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={ltLabel}>Employee</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger style={{ width:'100%' }}><SelectValue placeholder="Select an employee" /></SelectTrigger>
              <SelectContent>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {userId && (
            <div>
              <div style={ltLabel}>Current components</div>
              {components.length === 0 ? (
                <div style={{ fontSize:12.5, color:'var(--ink3)', background:'var(--bg)', border:'1px dashed var(--border)', borderRadius: 'var(--r)', padding:'12px' }}>
                  None yet. A run will skip this person until a basic-pay component is set.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {components.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', border:'1px solid var(--border)', borderRadius: 'var(--r)', background:'var(--card-sunken)' }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background: isEarn(c.direction) ? 'var(--green)' : 'var(--red)', flexShrink:0 }} />
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)', flex:1 }}>{c.name}
                        {c.taxable && <span style={{ marginLeft:8, fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius: 'var(--r)', background:'var(--gold-l)', color:'var(--gold)' }}>TAXABLE</span>}
                      </span>
                      <span style={{ fontSize:11, color:'var(--ink3)' }}>from {String(c.effective_from).slice(0,10)}</span>
                      <span style={{ fontSize:13, fontFamily:'var(--font)', fontWeight:700, color: isEarn(c.direction) ? 'var(--ink)' : 'var(--red)' }}>{isEarn(c.direction) ? '' : '−'}{payMoney(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {userId && (
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={ltLabel}>Add a component</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                <div style={{ flex:'1 1 200px' }}>
                  <Select value={typeId} onValueChange={setTypeId}>
                    <SelectTrigger style={{ width:'100%' }}><SelectValue placeholder="Pay component" /></SelectTrigger>
                    <SelectContent>
                      {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{isEarn(t.direction) ? '' : ' (deduction)'}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ flex:'0 1 160px' }}>
                  <input style={ltInput} type="number" min="0" step="1000" placeholder="Amount (TZS)" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <Button size="sm" disabled={saving} onClick={add}>
                  {saving ? 'Adding…' : 'Add'}
                </Button>
              </div>
              {msg && <div style={{ fontSize:12, fontWeight:500, color: msg.kind === 'err' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Employee self-service: your own approved payslips. Not manager-gated — the
// server (/me/payslips, /payslips/:id) only ever returns the caller's own,
// approved slips, so identity comes from the token, not this route's guard.
export function MyPayslipsPage() {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    apiFetch('/v1/payroll/me/payslips')
      .then(d => setSlips(Array.isArray(d) ? d : []))
      .catch(() => setSlips([]))
      .finally(() => setLoading(false));
  }, []);

  const period = (p: any) => (p.period_year && p.period_month)
    ? new Date(p.period_year, p.period_month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (p.run_name ?? '');
  const openFull = async (id: string) => { try { setViewing(await apiFetch(`/v1/payroll/payslips/${id}`)); } catch (error: any) { showAlert(error?.message || 'Could not open the payslip.', { variant: 'error' }); } };
  const pdf = async (id: string) => { try { printPayslipPdf(await apiFetch(`/v1/payroll/payslips/${id}`)); } catch (error: any) { showAlert(error?.message || 'Could not export the payslip.', { variant: 'error' }); } };

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="dollarSign" title="My Payslips" sub="Your approved payslips and pay history" backTo="/nexushr" />
      {loading ? (
        <PageLoading />
      ) : slips.length === 0 ? (
        <div style={{ background:'var(--white)', border:'1px dashed var(--border)', borderRadius: 'var(--r)', padding:'48px 20px', textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>No payslips yet</div>
          <div style={{ fontSize:12.5, color:'var(--ink3)' }}>Once a payroll run that includes you is approved, your payslip appears here.</div>
        </div>
      ) : (
        <Wrap>
          <thead><tr><TH>Period</TH><TH>Run</TH><TH right>Gross</TH><TH right>PAYE</TH><TH right>Deductions</TH><TH right>Net pay</TH><TH right>Actions</TH></tr></thead>
          <tbody>
            {slips.map(s => (
              <tr key={s.id} style={{ borderBottom:'1px solid var(--border)' }}>
                <TD bold>{period(s)}</TD>
                <TD muted>{s.run_name}</TD>
                <TD right mono muted>{payMoney(s.gross_pay)}</TD>
                <TD right mono muted>{payMoney(s.income_tax)}</TD>
                <TD right mono muted>{payMoney(s.total_deductions)}</TD>
                <TD right mono bold>{payMoney(s.net_pay)}</TD>
                <TD right><ActionBtn label="View" onClick={() => openFull(s.id)} /><ActionBtn label="PDF" onClick={() => pdf(s.id)} /></TD>
              </tr>
            ))}
          </tbody>
        </Wrap>
      )}
      {viewing && <PayslipDetailModal slip={viewing} runName={viewing.run_name ?? ''} onClose={() => setViewing(null)} />}
    </div>
  );
}

type AnnRow = { id: string; title: string; category: string; body: string; author: string; date: string; audience: string };

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AnnRow[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/announcements');
      const data = Array.isArray(res) ? res : [];
      setAnnouncements(data.map((a: any) => ({
        id: a.id, title: a.title, category: a.category, body: a.body,
        author: a.author_name || a.author || '', date: String(a.created_at || a.date || '').slice(0,10),
        audience: a.audience,
      })));
    } catch { /* leave the list empty — see note at top of file */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    try { await apiFetch(`/v1/hr/announcements/${id}`, { method: 'DELETE' }); } catch (error: any) { load(); showAlert(error?.message || 'Could not delete the announcement.', { variant: 'error' }); }
  }

  const catColor: Record<string, string> = { HR:'var(--purple)', Policy:'var(--teal)', IT:'var(--blue)' };
  const catBg: Record<string, string> = { HR:'var(--purple-l)', Policy:'var(--teal-l)', IT:'var(--blue-l)' };
  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <PageHeader icon="volume2" title="Company Announcements" sub="Company-wide announcements and notices" backTo="/nexushr">
        <PrimaryBtn label="Post Announcement" icon="plus" onClick={() => setShowNew(v => !v)} />
      </PageHeader>

      {showNew && (
        <Card>
          <form onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = fd.get('title') as string;
            const body = fd.get('body') as string;
            const category = fd.get('category') as string;
            const audience = fd.get('audience') as string;
            if (!title || !body) return;
            try {
              await apiFetch('/v1/hr/announcements', { method: 'POST', body: JSON.stringify({ title, body, category, audience }) });
              setShowNew(false); load();
            } catch (error: any) { showAlert(error?.message || 'Could not publish the announcement.', { variant: 'error' }); }
          }} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Title</label>
                <input name="title" required placeholder="e.g. Office closed for public holiday" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Category</label>
                <Select name="category" defaultValue="HR">
                  <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Policy">Policy</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Audience</label>
                <Select name="audience" defaultValue="All Staff">
                  <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Staff">All Staff</SelectItem>
                    <SelectItem value="Management">Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Message</label>
              <textarea name="body" required rows={4} placeholder="Write the announcement..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' as const, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <PrimaryBtn label="Post" icon="send" type="submit" />
              <ActionBtn label="Cancel" onClick={() => setShowNew(false)} />
            </div>
          </form>
        </Card>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {announcements.map(a => (
          <div key={a.id} style={{ background:'var(--white)', borderRadius: 'var(--r)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:10 }}>
              <div>
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius: 'var(--r-sm)', background:catBg[a.category]||'var(--bg)', color:catColor[a.category]||'var(--ink2)', marginRight:8 }}>{a.category}</span>
                <span style={{ fontSize:11, color:'var(--ink3)' }}>Visible to: {a.audience}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <span style={{ fontSize:11.5, color:'var(--ink3)' }}>{a.date}</span>
                <ActionBtn label="Delete" color="var(--red)" onClick={() => handleDelete(a.id)} />
              </div>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>{a.title}</div>
            <p style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.65, margin:'0 0 12px' }}>{a.body}</p>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink3)' }}>
              <Avatar name={a.author} size={20} />
              Posted by <strong style={{ color:'var(--ink)' }}>{a.author}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}