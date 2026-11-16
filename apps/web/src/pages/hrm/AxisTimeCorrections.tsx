import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';

/**
 * Axis time corrections (hr_time_corrections, migration 912): every change to
 * time somebody had already recorded, with the original, who changed it and
 * why. Corrections to a period payroll had already approved or paid wait here
 * for a payroll reviewer — never the person who made the change.
 */

const fmtDate = (d: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtWhen = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const errText = (e: unknown) => ((e as any)?.message as string) || 'Something went wrong. Try again.';
const LABEL: Record<string, string> = {
  status: 'Status', clock_in: 'In', clock_out: 'Out', notes: 'Notes', clock_in_at: 'In', clock_out_at: 'Out',
  total_break_minutes: 'Break (min)', worked_minutes: 'Worked (min)', project_name: 'Project', source: 'Source',
};

function showValue(k: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (k.endsWith('_at')) return new Date(String(v)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (k === 'clock_in' || k === 'clock_out') return String(v).slice(0, 5);
  return String(v);
}

/** The fields that actually changed, as "In 08:00 → 09:10". */
function Changes({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = Object.keys(LABEL).filter((k) => k in after || k in before)
    .filter((k) => showValue(k, before?.[k]) !== showValue(k, after?.[k]) && k !== 'device_id');
  const added = !before || Object.keys(before).length === 0;
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {added && <li style={{ color: 'var(--ink3)' }}>New entry</li>}
      {keys.map((k) => (
        <li key={k}><span style={{ color: 'var(--ink3)' }}>{LABEL[k]}</span> {added ? '' : <>{showValue(k, before?.[k])} → </>}<strong>{showValue(k, after?.[k])}</strong></li>
      ))}
    </ul>
  );
}

export function AxisTimeCorrectionsPage() {
  usePageSEO('Time corrections', 'Changes to recorded time, and payroll review of changes to finalised periods.');
  const { user } = useAuth();
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const [data, setData] = useState<{ rows: any[]; canReview: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    setData(null);
    apiFetch(`/v1/hr/time-corrections${tab === 'PENDING' ? '?status=PENDING' : ''}`)
      .then((r: any) => setData({ rows: r.data, canReview: !!r.can_review }))
      .catch((e) => { showAlert(errText(e), { variant: 'error' }); setData({ rows: [], canReview: false }); });
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function review(row: any, outcome: 'NO_PAY_CHANGE' | 'ADJUST_NEXT_RUN') {
    const note = (document.getElementById(`note-${row.id}`) as HTMLInputElement | null)?.value.trim() || null;
    if (outcome === 'ADJUST_NEXT_RUN' && !note) { showAlert('Write what the next run needs to adjust in the box next to the correction.', { variant: 'warning' }); return; }
    setBusy(row.id);
    try { await apiFetch(`/v1/hr/time-corrections/${row.id}/review`, { method: 'POST', body: JSON.stringify({ outcome, note }) }); load(); }
    catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(null); }
  }

  const canReview = !!data?.canReview;
  const columns: TableColumn<any>[] = useMemo(() => [
    { key: 'who', header: 'Worker', render: (r: any) => (
      <Link to={`/nexushr/staff/${r.user_id}`} className="inline-flex items-center gap-2"><PersonAvatar userId={r.user_id} name={r.worker_name} src={r.worker_avatar_url} size={24} />{r.worker_name}</Link>
    ) },
    { key: 'day', header: 'Day', render: (r: any) => fmtDate(r.work_date) },
    { key: 'change', header: 'Change', render: (r: any) => <Changes before={r.before_values} after={r.after_values} /> },
    { key: 'why', header: 'Reason', hideAt: 'sm', render: (r: any) => r.reason },
    { key: 'by', header: 'Changed by', hideAt: 'md', render: (r: any) => (
      <span className="inline-flex items-center gap-2"><PersonAvatar userId={r.corrected_by} name={r.corrected_by_name} src={r.corrected_by_avatar_url} size={22} />
        <span className="flex flex-col"><span>{r.corrected_by_name}</span><span className="text-xs" style={{ color: 'var(--ink3)' }}>{fmtWhen(r.corrected_at)}</span></span></span>
    ) },
    { key: 'payroll', header: 'Payroll', render: (r: any) => {
      if (r.review_status === 'NOT_NEEDED') return <span className="text-xs" style={{ color: 'var(--ink3)' }}>Not yet paid</span>;
      if (r.review_status === 'REVIEWED') return (
        <span className="flex flex-col gap-1">
          <Badge variant={r.review_outcome === 'ADJUST_NEXT_RUN' ? 'warning' : 'secondary'}>{r.review_outcome === 'ADJUST_NEXT_RUN' ? 'Adjust next run' : 'No pay change'}</Badge>
          <span className="text-xs" style={{ color: 'var(--ink3)' }}>{r.reviewed_by_name}{r.review_note ? `: ${r.review_note}` : ''}</span>
        </span>
      );
      if (!canReview) return <Badge variant="warning">Waiting for payroll</Badge>;
      if (r.corrected_by === user?.id) return <span className="text-xs" style={{ color: 'var(--ink3)' }}>{r.payroll_run_name}: someone else reviews your change</span>;
      return (
        <div className="flex flex-col gap-2">
          <span className="text-xs" style={{ color: 'var(--ink3)' }}>{r.payroll_run_name} ({String(r.payroll_run_status).toLowerCase()})</span>
          <Input id={`note-${r.id}`} aria-label={`Payroll note for ${r.worker_name}'s correction`} placeholder="What to adjust, if anything" className="w-56" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => review(r, 'NO_PAY_CHANGE')}>No pay change</Button>
            <Button size="sm" loading={busy === r.id} onClick={() => review(r, 'ADJUST_NEXT_RUN')}>Adjust next run</Button>
          </div>
        </div>
      );
    } },
  ], [canReview, user?.id, busy]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={['Axis', 'Time corrections']} titlePlain="Time" titleEm="corrections"
        subtitle="Every change to time already recorded, with the original and the reason. Changes to a period payroll has approved or paid need a payroll review." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'PENDING' | 'ALL')}>
        <TabsList><TabsTrigger value="PENDING">Waiting for payroll</TabsTrigger><TabsTrigger value="ALL">All corrections</TabsTrigger></TabsList>
      </Tabs>
      <SectionCard title={tab === 'PENDING' ? 'Waiting for payroll' : 'All corrections'} padded={false} collapsible={false}>
        <DataTable columns={columns} rows={data?.rows ?? []} loading={!data} empty={!!data && !data.rows.length}
          emptyIcon="checkCircle" emptyTitle={tab === 'PENDING' ? 'Nothing waiting for payroll' : 'No corrections recorded'} />
      </SectionCard>
    </div>
  );
}
