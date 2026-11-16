import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { Badge } from '../../components/ui/badge.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useAuth } from '../../hooks/useAuth.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';

/** Axis job history (hr_assignments): what a worker did, where, for whom, and when. */

const HR_ADMIN = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];
const REASON: Record<string, string> = {
  HIRE: 'Hired', TRANSFER: 'Transferred', PROMOTION: 'Promoted', REHIRE: 'Rehired', ADDITIONAL: 'Extra assignment', CORRECTION: 'Corrected', BACKFILL: 'Existing job',
  RESIGNATION: 'Resigned', TERMINATION: 'Terminated', END_OF_CONTRACT: 'Contract ended', RETIREMENT: 'Retired', DEATH: 'Deceased', REDUNDANCY: 'Redundancy', OTHER: 'Ended',
};
const TYPE: Record<string, string> = { EMPLOYEE: 'Employee', CONTRACTOR: 'Contractor', CASUAL: 'Casual', INTERN: 'Intern' };
const fmt = (d: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const errText = (e: unknown) => ((e as any)?.message as string) || 'Something went wrong. Try again.';

export interface Assignment {
  id: string; worker_type: string; is_primary: boolean; job_title: string | null; fte: string; start_date: string; end_date: string | null;
  start_reason: string; end_reason: string | null; status: 'PENDING' | 'ACTIVE' | 'VOIDED'; notes: string | null; void_reason: string | null;
  corrects_id: string | null; department_name: string | null; designation_name: string | null; location_name: string | null; legal_entity_name: string | null;
  manager_id: string | null; manager_name: string | null; manager_avatar: string | null; approved_by_name: string | null; requested_by_name: string | null;
  department_id: string | null; designation_id: string | null; location_id: string | null; legal_entity_id: string | null;
}

/** The Job history tab on the staff profile. */
export function AxisJobHistory({ userId, name }: { userId: string; name: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHr = HR_ADMIN.includes(user?.role ?? '');
  const [rows, setRows] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const load = useCallback(() => apiFetch(`/v1/hr/workers/${userId}/assignments`).then((r: any) => { setRows(r.data); setError(null); }).catch((e) => setError(errText(e))), [userId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>;
  if (!rows) return <SectionLoading />;
  const shown = rows.filter((r) => showVoided || r.status !== 'VOIDED');
  const today = new Date().toISOString().slice(0, 10);
  const current = rows.find((r) => r.status === 'ACTIVE' && r.is_primary && r.start_date.slice(0, 10) <= today && (!r.end_date || r.end_date.slice(0, 10) >= today));
  const go = (action: string) => navigate(`/nexushr/staff/${userId}/job/${action}`);

  const columns: TableColumn<Assignment>[] = [
    { key: 'when', header: 'Dates', render: (a) => <div><div className="font-semibold">{fmt(a.start_date)} – {a.end_date ? fmt(a.end_date) : 'now'}</div>
      <div className="text-xs" style={{ color: 'var(--ink3)' }}>{REASON[a.start_reason] ?? a.start_reason}{a.end_reason ? ` · ${REASON[a.end_reason] ?? a.end_reason}` : ''}</div></div> },
    { key: 'job', header: 'Job', render: (a) => <div><div>{a.job_title || a.designation_name || '—'}{!a.is_primary && <Badge variant="gray">Extra</Badge>}</div>
      <div className="text-xs" style={{ color: 'var(--ink3)' }}>{[a.department_name, a.location_name, a.legal_entity_name].filter(Boolean).join(' · ') || 'No placement recorded'}</div></div> },
    { key: 'manager', header: 'Reports to', hideAt: 'sm', render: (a) => a.manager_name
      ? <span className="inline-flex items-center gap-2"><PersonAvatar userId={a.manager_id} name={a.manager_name} src={a.manager_avatar} size={22} />{a.manager_name}</span> : '—' },
    { key: 'type', header: 'Type', hideAt: 'md', render: (a) => `${TYPE[a.worker_type] ?? a.worker_type}${Number(a.fte) < 1 ? ` · ${Math.round(Number(a.fte) * 100)}%` : ''}` },
    { key: 'status', header: 'Status', render: (a) => a.status === 'PENDING' ? <Badge variant="warning">Waiting for HR</Badge>
      : a.status === 'VOIDED' ? <span title={a.void_reason ?? ''}><Badge variant="gray">Replaced</Badge></span>
        : a === current ? <Badge variant="success">Current</Badge> : <Badge variant="gray">In force</Badge> },
    ...(isHr ? [{ key: 'fix', header: '', render: (a: Assignment) => a.status === 'ACTIVE'
      ? <Button variant="ghost" size="sm" onClick={() => navigate(`/nexushr/staff/${userId}/job/correct?assignment=${a.id}`)}>Correct</Button> : null }] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => go('move')}><Icon name="arrowRight" size={14} /> {isHr ? 'Transfer or promote' : 'Request a change'}</Button>
        {isHr && <>
          <Button size="sm" variant="outline" onClick={() => go('extra')}><Icon name="plus" size={14} /> Extra assignment</Button>
          {current ? <Button size="sm" variant="outline" onClick={() => go('offboard')}><Icon name="logOut" size={14} /> Offboard</Button>
            : <Button size="sm" variant="outline" onClick={() => go('start')}><Icon name="play" size={14} /> {rows.some((r) => r.status === 'ACTIVE') ? 'Rehire' : 'Start job'}</Button>}
        </>}
        <div className="ml-auto inline-flex items-center gap-2 text-xs" style={{ color: 'var(--ink3)' }}>
          <Checkbox id="jh-voided" checked={showVoided} onCheckedChange={(v) => setShowVoided(v === true)} />
          <Label htmlFor="jh-voided">Show replaced entries</Label>
        </div>
      </div>
      <DataTable columns={columns} rows={shown} empty={!shown.length} emptyIcon="briefcase" emptyTitle="No job history yet"
        emptyMessage={isHr ? `Record ${name}'s job with "Start job".` : 'Ask HR to record this job.'} />
      <p className="text-xs" style={{ color: 'var(--ink3)' }}>Nothing here is deleted. A correction replaces an entry and keeps the original, with the reason.</p>
    </div>
  );
}

function useLookups() {
  const [l, setL] = useState<{ departments: any[]; designations: any[]; locations: any[]; entities: any[]; staff: { value: string; label: string }[] }>({ departments: [], designations: [], locations: [], entities: [], staff: [] });
  useEffect(() => {
    const get = (p: string, k: keyof typeof l, map: (r: any[]) => any[] = (r) => r) => apiFetch(p).then((r: any) => setL((x) => ({ ...x, [k]: map(Array.isArray(r) ? r : r?.data ?? r?.items ?? []) }))).catch(() => {});
    get('/v1/hr/departments', 'departments'); get('/v1/hr/designations', 'designations'); get('/v1/locations', 'locations');
    get('/v1/hr/legal-entities', 'entities');
    get('/v1/hr/staff?search=', 'staff', (r) => r.map((u: any) => ({ value: u.id, label: u.name })));
  }, []);
  return l;
}

const NONE = '__none';
function Pick({ id, label, value, onChange, options, nameKey = 'name' }: { id: string; label: string; value: string; onChange: (v: string) => void; options: any[]; nameKey?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Keep / none</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o[nameKey] ?? o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One form page for every job change: /nexushr/staff/:id/job/:action */
export function AxisJobChangePage() {
  const { id = '', action = 'move' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHr = HR_ADMIN.includes(user?.role ?? '');
  const look = useLookups();
  const assignmentId = new URLSearchParams(window.location.search).get('assignment');
  const [person, setPerson] = useState<{ name: string; avatar_url: string | null } | null>(null);
  const [orig, setOrig] = useState<Assignment | null>(null);
  const [f, setF] = useState<Record<string, string>>({ date: new Date().toISOString().slice(0, 10), reason: action === 'offboard' ? 'RESIGNATION' : 'TRANSFER', worker_type: 'EMPLOYEE', fte: '1' });
  const [busy, setBusy] = useState(false);
  const titles: Record<string, string> = { move: isHr ? 'Transfer or promote' : 'Request a job change', extra: 'Add an extra assignment', offboard: 'Offboard', start: 'Start a job', correct: 'Correct a job entry' };
  usePageSEO(titles[action] ?? 'Job change', 'Change a worker’s job in Axis.');
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    apiFetch(`/v1/hr/staff/${id}`).then((r: any) => setPerson({ name: r.name ?? r.data?.name ?? 'Worker', avatar_url: r.avatar_url ?? r.data?.avatar_url ?? null })).catch(() => setPerson({ name: 'Worker', avatar_url: null }));
    if (action === 'correct' && assignmentId) {
      apiFetch(`/v1/hr/workers/${id}/assignments`).then((r: any) => {
        const a = (r.data as Assignment[]).find((x) => x.id === assignmentId);
        if (!a) return;
        setOrig(a);
        setF((x) => ({ ...x, date: a.start_date.slice(0, 10), end_date: a.end_date?.slice(0, 10) ?? '', department_id: a.department_id ?? '', designation_id: a.designation_id ?? '',
          location_id: a.location_id ?? '', legal_entity_id: a.legal_entity_id ?? '', manager_id: a.manager_id ?? '', job_title: a.job_title ?? '', worker_type: a.worker_type, fte: String(Number(a.fte)) }));
      }).catch(() => {});
    }
  }, [id, action, assignmentId]);

  const jobBody = () => {
    const out: Record<string, unknown> = {};
    for (const k of ['department_id', 'designation_id', 'location_id', 'legal_entity_id', 'manager_id']) if (f[k] !== undefined && (f[k] || action === 'correct')) out[k] = f[k] || null;
    if (f.job_title !== undefined && (f.job_title || action === 'correct')) out.job_title = f.job_title || null;
    if (action !== 'move' || f.worker_type !== 'EMPLOYEE') out.worker_type = f.worker_type;
    if (f.fte) out.fte = Number(f.fte);
    if (f.notes) out.notes = f.notes;
    return out;
  };

  async function submit() {
    const paths: Record<string, [string, Record<string, unknown>]> = {
      move: [`/v1/hr/workers/${id}/move`, { effective_date: f.date, reason: f.reason, ...jobBody() }],
      extra: [`/v1/hr/workers/${id}/extra-assignment`, { start_date: f.date, end_date: f.end_date || null, ...jobBody() }],
      start: [`/v1/hr/workers/${id}/start-job`, { start_date: f.date, ...jobBody() }],
      offboard: [`/v1/hr/workers/${id}/offboard`, { last_day: f.date, reason: f.reason, notes: f.notes || null }],
      correct: [`/v1/hr/assignments/${assignmentId}/correct`, { start_date: f.date, end_date: f.end_date || null, reason: f.correction_reason, ...jobBody() }],
    };
    const [path, body] = paths[action] ?? paths.move;
    if (action === 'offboard' && !(await showConfirm(`Offboard ${person?.name}? Every job running on ${fmt(f.date)} ends that day, later ones are cancelled, and sign-in stops after that day.`, { title: 'Offboard', variant: 'danger', confirmLabel: 'Offboard' }))) return;
    setBusy(true);
    try {
      const r: any = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      showAlert(r.data?.status === 'PENDING' ? 'Sent to HR for approval.' : 'Saved.', { variant: 'success' });
      navigate(`/nexushr/staff/${id}?tab=Job%20history`);
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }

  if (!person) return <SectionLoading />;
  const placement = action !== 'offboard';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="create" backTo={`/nexushr/staff/${id}`} backLabel={person.name} crumbs={['Axis', { label: person.name, to: `/nexushr/staff/${id}` }, 'Job']} title={titles[action] ?? 'Job change'} />
      <SectionCard title="Details" collapsible={false}>
        <div className="grid gap-4" style={{ maxWidth: 640 }}>
          <div className="inline-flex items-center gap-2"><PersonAvatar userId={id} name={person.name} src={person.avatar_url} size={28} /><span className="font-semibold">{person.name}</span></div>
          {!isHr && action === 'move' && <p className="text-sm" style={{ color: 'var(--ink3)' }}>Your request goes to HR. Nothing changes until someone in HR approves it.</p>}
          {action === 'correct' && orig && <p className="text-sm" style={{ color: 'var(--ink3)' }}>The current entry is kept and marked as replaced, with your reason.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jc-date">{action === 'offboard' ? 'Last working day' : action === 'move' ? 'Takes effect on' : 'Start date'}</Label>
              <Input id="jc-date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            {(action === 'extra' || action === 'correct') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jc-end">End date (optional)</Label>
                <Input id="jc-end" type="date" value={f.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} />
              </div>
            )}
            {action === 'move' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jc-reason">This is a</Label>
                <Select value={f.reason} onValueChange={(v) => set('reason', v)}><SelectTrigger id="jc-reason"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="TRANSFER">Transfer</SelectItem><SelectItem value="PROMOTION">Promotion</SelectItem></SelectContent></Select>
              </div>
            )}
            {action === 'offboard' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jc-leave">Reason for leaving</Label>
                <Select value={f.reason} onValueChange={(v) => set('reason', v)}><SelectTrigger id="jc-leave"><SelectValue /></SelectTrigger>
                  <SelectContent>{['RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'REDUNDANCY', 'DEATH', 'OTHER'].map((r) => <SelectItem key={r} value={r}>{REASON[r]}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
          </div>
          {placement && <>
            <p className="text-xs" style={{ color: 'var(--ink3)' }}>{action === 'move' ? 'Only change what is different; everything else carries over from the current job.' : ''}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Pick id="jc-dept" label="Department" value={f.department_id ?? ''} onChange={(v) => set('department_id', v)} options={look.departments} />
              <Pick id="jc-role" label="Role" value={f.designation_id ?? ''} onChange={(v) => set('designation_id', v)} options={look.designations} nameKey="title" />
              <Pick id="jc-branch" label="Branch" value={f.location_id ?? ''} onChange={(v) => set('location_id', v)} options={look.locations} />
              <Pick id="jc-entity" label="Employing company" value={f.legal_entity_id ?? ''} onChange={(v) => set('legal_entity_id', v)} options={look.entities} nameKey="legal_name" />
              <div className="flex flex-col gap-1.5">
                <Label>Reports to</Label>
                <Combobox aria-label="Reports to" options={look.staff.filter((s) => s.value !== id)} value={f.manager_id ?? ''} onChange={(v) => set('manager_id', v)} placeholder="Keep / none" />
              </div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="jc-title">Job title</Label><Input id="jc-title" value={f.job_title ?? ''} onChange={(e) => set('job_title', e.target.value)} maxLength={160} /></div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="jc-type">Works as</Label>
                <Select value={f.worker_type} onValueChange={(v) => set('worker_type', v)}><SelectTrigger id="jc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="jc-fte">Working fraction (1 = full time)</Label><Input id="jc-fte" type="number" min={0.05} max={1} step={0.05} value={f.fte} onChange={(e) => set('fte', e.target.value)} /></div>
            </div>
          </>}
          {action === 'correct'
            ? <div className="flex flex-col gap-1.5"><Label htmlFor="jc-why">Why is this being corrected?</Label><Textarea id="jc-why" rows={2} value={f.correction_reason ?? ''} onChange={(e) => set('correction_reason', e.target.value)} maxLength={500} /></div>
            : <div className="flex flex-col gap-1.5"><Label htmlFor="jc-notes">Notes (optional)</Label><Textarea id="jc-notes" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={2000} /></div>}
          <div className="flex gap-2">
            <Button onClick={submit} loading={busy} disabled={!f.date || (action === 'correct' && !(f.correction_reason ?? '').trim())}>{action === 'move' && !isHr ? 'Send to HR' : 'Save'}</Button>
            <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/** /nexushr/workers/new — a worker who has a record but never signs in. */
export function AxisNewWorkerPage() {
  usePageSEO('Add a worker without sign-in', 'Record a casual, contractor or shared-device worker in Axis.');
  const navigate = useNavigate();
  const look = useLookups();
  const [f, setF] = useState<Record<string, string>>({ start_date: new Date().toISOString().slice(0, 10), worker_type: 'CASUAL', fte: '1' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: f.name, phone: f.phone || null, email: f.email || null, start_date: f.start_date, worker_type: f.worker_type, fte: Number(f.fte) || 1 };
      for (const k of ['department_id', 'designation_id', 'location_id', 'legal_entity_id', 'manager_id', 'job_title']) if (f[k]) body[k] = f[k];
      const r: any = await apiFetch('/v1/hr/workers', { method: 'POST', body: JSON.stringify(body) });
      navigate(`/nexushr/staff/${r.data.user.id}?tab=Job%20history`);
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader variant="create" backTo="/nexushr/employees" backLabel="Employees" crumbs={['Axis', { label: 'Employees', to: '/nexushr/employees' }, 'New worker']} title="Add a worker without sign-in"
        subtitle="For casual staff, contractors and people on a shared device: they get attendance, leave and pay, but no account. You can turn sign-in on later." />
      <SectionCard title="Worker" collapsible={false}>
        <div className="grid gap-4 sm:grid-cols-2" style={{ maxWidth: 720 }}>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nw-name">Full name</Label><Input id="nw-name" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={160} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nw-phone">Phone (optional)</Label><Input id="nw-phone" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nw-email">Email (optional)</Label><Input id="nw-email" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nw-start">Start date</Label><Input id="nw-start" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nw-type">Works as</Label>
            <Select value={f.worker_type} onValueChange={(v) => set('worker_type', v)}><SelectTrigger id="nw-type"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nw-title">Job title</Label><Input id="nw-title" value={f.job_title ?? ''} onChange={(e) => set('job_title', e.target.value)} maxLength={160} /></div>
          <Pick id="nw-dept" label="Department" value={f.department_id ?? ''} onChange={(v) => set('department_id', v)} options={look.departments} />
          <Pick id="nw-branch" label="Branch" value={f.location_id ?? ''} onChange={(v) => set('location_id', v)} options={look.locations} />
          <div className="flex flex-col gap-1.5"><Label>Reports to</Label><Combobox aria-label="Reports to" options={look.staff} value={f.manager_id ?? ''} onChange={(v) => set('manager_id', v)} placeholder="Choose a manager" /></div>
        </div>
        <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy} disabled={!(f.name ?? '').trim() || !f.start_date}>Add worker</Button><Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button></div>
      </SectionCard>
    </div>
  );
}

/** /nexushr/job-changes — managers' requests waiting for HR. */
export function AxisPendingChangesPage() {
  usePageSEO('Job changes to approve', 'Transfers and promotions managers have asked for.');
  const { user } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => apiFetch('/v1/hr/assignments/pending').then((r: any) => setRows(r.data)).catch((e) => { showAlert(errText(e), { variant: 'error' }); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);
  async function decide(row: any, decision: 'approve' | 'reject') {
    let reason: string | undefined;
    if (decision === 'reject') {
      const el = document.getElementById(`why-${row.id}`) as HTMLInputElement | null;
      reason = el?.value.trim();
      if (!reason) { showAlert('Write why you are declining in the box next to the request.', { variant: 'warning' }); return; }
    }
    try { await apiFetch(`/v1/hr/assignments/${row.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) }); load(); }
    catch (e) { showAlert(errText(e), { variant: 'error' }); }
  }
  const columns: TableColumn<any>[] = useMemo(() => [
    { key: 'who', header: 'Worker', render: (r: any) => <Link to={`/nexushr/staff/${r.user_id}?tab=Job%20history`} className="inline-flex items-center gap-2"><PersonAvatar userId={r.user_id} name={r.worker_name} src={r.worker_avatar} size={24} />{r.worker_name}</Link> },
    { key: 'what', header: 'Change', render: (r: any) => `${REASON[r.start_reason] ?? r.start_reason} from ${fmt(r.start_date)}` },
    { key: 'by', header: 'Requested by', hideAt: 'sm', render: (r: any) => r.requested_by_name ? <span className="inline-flex items-center gap-2"><PersonAvatar userId={r.requested_by} name={r.requested_by_name} size={22} />{r.requested_by_name}</span> : '—' },
    { key: 'act', header: '', render: (r: any) => r.requested_by === user?.id ? <span className="text-xs" style={{ color: 'var(--ink3)' }}>Someone else decides</span> : (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => decide(r, 'approve')}>Approve</Button>
        <Input id={`why-${r.id}`} aria-label={`Reason for declining ${r.worker_name}'s change`} placeholder="Reason, to decline" className="w-44" />
        <Button size="sm" variant="outline" onClick={() => decide(r, 'reject')}>Decline</Button>
      </div>
    ) },
  ], [user?.id]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader crumbs={['Axis', 'Job changes']} titlePlain="Job changes to" titleEm="approve" subtitle="Transfers and promotions managers asked for. Nothing changes until approved here." />
      <SectionCard title="Waiting" padded={false} collapsible={false}>
        <DataTable columns={columns} rows={rows ?? []} loading={!rows} empty={!!rows && !rows.length} emptyIcon="checkCircle" emptyTitle="Nothing waiting" />
      </SectionCard>
    </div>
  );
}
