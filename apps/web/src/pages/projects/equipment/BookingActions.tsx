import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { Textarea } from '../../../components/ui/textarea.js';
import { Combobox } from '../../../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select.js';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../../components/ui/date-picker.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu.js';
import { Icon } from '../../../components/Icon.js';
import { apiFetch } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { type Booking, CONDITIONS, titleCase, errText, todayIso } from './equipmentShared.js';

type Step = 'issue' | 'return' | 'reassign' | 'cancel' | null;

/**
 * The next step on a booking as one button, and the rarer ones (reassign,
 * cancel) in the overflow menu. The server decides who may act; the buttons
 * follow `can_handle` (equipment manager or the asset's custodian) so people
 * aren't offered actions that would be refused.
 */
export function BookingActions({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const handler = !!booking.can_handle;
  const isRequester = booking.requested_by_name != null && booking.requested_by_name === user?.name;
  const canCancel = ['requested', 'confirmed'].includes(booking.status) && (handler || isRequester);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/v1/project-equipment/allocations/${booking.id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
      setStep(null); onDone();
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }

  const primary = handler && booking.status === 'requested' ? <Button size="sm" loading={busy} onClick={e => { e.stopPropagation(); post('reserve'); }}>Reserve</Button>
    : handler && booking.status === 'confirmed' ? <Button size="sm" onClick={e => { e.stopPropagation(); setStep('issue'); }}>Issue</Button>
      : handler && booking.status === 'issued' ? <Button size="sm" variant={booking.overdue ? 'default' : 'outline'} onClick={e => { e.stopPropagation(); setStep('return'); }}>Receive back</Button>
        : null;
  const more = [
    handler && booking.status === 'issued' && { label: 'Move to another project', icon: 'arrowRight' as const, step: 'reassign' as const },
    canCancel && { label: booking.status === 'requested' && !isRequester ? 'Decline request' : 'Cancel booking', icon: 'x' as const, step: 'cancel' as const },
  ].filter(Boolean) as Array<{ label: string; icon: any; step: Step }>;

  if (!primary && !more.length) return null;
  return (
    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
      {primary}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More actions for ${booking.resource_name ?? 'this booking'}`}><Icon name="moreVertical" size={16} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">{more.map(m => <DropdownMenuItem key={m.label} onClick={() => setStep(m.step)}><Icon name={m.icon} size={14} /> {m.label}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      )}
      {step === 'issue' && <IssueDialog booking={booking} busy={busy} onClose={() => setStep(null)} onSubmit={b => post('issue', b)} />}
      {step === 'return' && <ReturnDialog booking={booking} busy={busy} onClose={() => setStep(null)} onSubmit={b => post('return', b)} />}
      {step === 'reassign' && <ReassignDialog booking={booking} busy={busy} onClose={() => setStep(null)} onSubmit={b => post('reassign', b)} />}
      {step === 'cancel' && <CancelDialog booking={booking} busy={busy} onClose={() => setStep(null)} onSubmit={b => post('cancel', b)} />}
    </div>
  );
}

type DialogProps = { booking: Booking; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void };
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')));

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span>{children}{hint && <span className="text-xs" style={{ color: 'var(--ink3)' }}>{hint}</span>}</label>;
}

function ConditionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Condition"><SelectValue /></SelectTrigger>
      <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function usePeople() {
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { apiFetch('/v1/hr/staff').then((r: any) => setPeople((Array.isArray(r) ? r : r.data ?? []).map((u: any) => ({ value: u.id, label: u.name })))).catch(() => undefined); }, []);
  return people;
}

function Shell({ title, description, busy, onClose, submit, submitLabel, children, disabled }: { title: string; description: string; busy: boolean; onClose: () => void; submit: () => void; submitLabel: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <DialogBody><form id="eq-step" className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); submit(); }}>{children}</form></DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Back</Button>
          <Button type="submit" form="eq-step" loading={busy} disabled={disabled}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueDialog({ booking, busy, onClose, onSubmit }: DialogProps) {
  const people = usePeople();
  const [condition, setCondition] = useState('GOOD');
  const [meter, setMeter] = useState('');
  const [handedTo, setHandedTo] = useState('');
  const [location, setLocation] = useState('');
  return (
    <Shell title={`Issue ${booking.resource_name}`} description={`Hand it over to ${booking.project_name ?? 'the project'}. Eligibility is checked again now.`}
      busy={busy} onClose={onClose} submitLabel="Issue" submit={() => onSubmit({ condition, meter: num(meter), handed_to: handedTo || null, location: location || null })}>
      <Field label="Condition at handover"><ConditionSelect value={condition} onChange={setCondition} /></Field>
      <Field label="Meter reading" hint="Leave blank if the asset has no meter."><Input inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)} /></Field>
      <Field label="Handed to"><Combobox options={people} value={handedTo} onChange={setHandedTo} placeholder="Who receives it on site" aria-label="Handed to" /></Field>
      <Field label="Site location" hint="Defaults to the project's name."><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Chainage 12+400" /></Field>
    </Shell>
  );
}

function ReturnDialog({ booking, busy, onClose, onSubmit }: DialogProps) {
  const [condition, setCondition] = useState('GOOD');
  const [meter, setMeter] = useState('');
  const [location, setLocation] = useState('');
  const [result, setResult] = useState('PASS');
  const [defects, setDefects] = useState('');
  const failing = result === 'FAIL';
  return (
    <Shell title={`Receive ${booking.resource_name}`} description="Record its condition and a return inspection. A failed inspection or damage takes it out of service until repaired."
      busy={busy} onClose={onClose} submitLabel="Receive back" disabled={(failing || result === 'PASS_WITH_DEFECTS') && !defects.trim()}
      submit={() => onSubmit({ condition, meter: num(meter), location: location || null, inspection: { result, defects: defects || null } })}>
      <Field label="Condition on return"><ConditionSelect value={condition} onChange={setCondition} /></Field>
      <Field label="Meter reading"><Input inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)} /></Field>
      <Field label="Return inspection">
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger aria-label="Return inspection"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="PASS">Pass</SelectItem><SelectItem value="PASS_WITH_DEFECTS">Pass with defects</SelectItem><SelectItem value="FAIL">Fail</SelectItem></SelectContent>
        </Select>
      </Field>
      {result !== 'PASS' && <Field label="Defects found"><Textarea value={defects} onChange={e => setDefects(e.target.value)} rows={3} /></Field>}
      <Field label="Returned to" hint="Defaults to the asset's home yard."><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
    </Shell>
  );
}

function ReassignDialog({ booking, busy, onClose, onSubmit }: DialogProps) {
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [end, setEnd] = useState(booking.end_date > todayIso() ? booking.end_date : todayIso());
  const [location, setLocation] = useState('');
  useEffect(() => { apiFetch('/v1/tasks/projects').then((r: any) => setProjects((Array.isArray(r) ? r : r.data ?? []).filter((p: any) => p.id !== booking.project_id).map((p: any) => ({ value: p.id, label: p.name })))).catch(() => undefined); }, [booking.project_id]);
  return (
    <Shell title={`Move ${booking.resource_name}`} description={`Close the booking on ${booking.project_name ?? 'this project'} today and issue it straight to another project.`}
      busy={busy} onClose={onClose} submitLabel="Move" disabled={!projectId} submit={() => onSubmit({ project_id: projectId, end_date: end, location: location || null })}>
      <Field label="New project"><Combobox options={projects} value={projectId} onChange={setProjectId} placeholder="Choose a project" aria-label="New project" /></Field>
      <Field label="Needed until"><DatePicker date={parseDateOnly(end)} onChange={d => d && setEnd(toDateOnlyString(d))} /></Field>
      <Field label="Site location"><Input value={location} onChange={e => setLocation(e.target.value)} /></Field>
    </Shell>
  );
}

function CancelDialog({ booking, busy, onClose, onSubmit }: DialogProps) {
  const [reason, setReason] = useState('');
  return (
    <Shell title={booking.status === 'requested' ? 'Decline or withdraw this request' : 'Cancel this booking'} description={`${booking.resource_name} will be free for these dates again.`}
      busy={busy} onClose={onClose} submitLabel="Cancel booking" submit={() => onSubmit({ reason: reason || null })}>
      <Field label="Reason" hint="Shown in the asset's history."><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} /></Field>
    </Shell>
  );
}
