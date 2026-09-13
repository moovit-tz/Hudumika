import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { DateTimePicker, DatePicker, toDateOnlyString, parseDateOnly } from '../components/ui/date-picker.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';

// -- shared shapes -------------------------------------------------------

interface Opening {
  id: string; title: string; department: string | null; location: string | null;
  employment_type: string; status: string; description: string | null;
  openings_count: number; candidate_count?: number; created_by_name?: string | null;
  requisition_id?: string | null;
}
interface Interview { id: string; scheduled_at: string; mode: string; status: string; interviewer_id: string | null; interviewer_name: string | null; notes: string | null }
/** One candidate's application to one job opening — the pipeline unit
 *  (migration 399). A person can have several of these across different
 *  openings; this row is always scoped to a single one. */
interface Application {
  id: string; candidate_id: string; job_opening_id: string;
  candidate_name: string; candidate_email: string | null; candidate_phone: string | null;
  stage: string; rating: number | null; source: string | null; notes: string | null; rejected_reason: string | null;
  applied_at: string;
  screening_score: number | string | null; screening_passed: boolean | null;
  interviews?: Interview[]; next_interview?: Interview | null;
}
interface CandidateProfile {
  id: string; name: string; email: string | null; phone: string | null;
  resume_storage_key: string | null; resume_filename: string | null;
  cover_letter: string | null; skills: string | null; education: string | null;
}
interface UpcomingInterview {
  id: string; scheduled_at: string; mode: string; status: string;
  candidate_id: string; candidate_name: string; interviewer_name: string | null;
}
interface Requisition {
  id: string; title: string;
  department_id: string | null; department_name: string | null;
  designation_id: string | null; designation_title: string | null;
  hiring_manager_id: string | null; hiring_manager_name: string | null;
  openings_count: number; employment_type: string; location: string | null;
  description: string | null; requirements: string | null;
  salary_min: string | null; salary_max: string | null; salary_currency: string | null;
  priority: string; reason: string; replacement_for_id: string | null;
  status: string; rejected_reason: string | null;
  created_by: string | null; submitted_at: string | null;
  approved_by: string | null; approved_at: string | null;
  created_at: string; updated_at: string;
  job_opening?: { id: string; status: string } | null;
}
interface Offer {
  id: string; application_id: string; position_title: string;
  compensation_amount: string | null; compensation_currency: string | null; compensation_period: string;
  start_date: string | null; expiry_date: string | null;
  status: string; revision: number; supersedes_offer_id: string | null;
  decline_reason: string | null;
  approved_by: string | null; approved_at: string | null;
  sent_at: string | null; viewed_at: string | null; responded_at: string | null;
  sign_envelope_id: string | null;
  created_at: string; updated_at: string;
}

const STAGES: { key: string; label: string; color: string; tint: string }[] = [
  { key: 'APPLIED',   label: 'Applied',   color: 'var(--ink3)',   tint: 'var(--bg)' },
  { key: 'SCREENING', label: 'Screening', color: 'var(--blue)',   tint: 'var(--blue-l)' },
  { key: 'INTERVIEW', label: 'Interview', color: 'var(--purple)', tint: 'var(--purple-l)' },
  { key: 'OFFER',     label: 'Offer',     color: 'var(--gold)',   tint: 'var(--gold-l)' },
  { key: 'HIRED',     label: 'Hired',     color: 'var(--green)',  tint: 'var(--green-l)' },
  { key: 'REJECTED',  label: 'Rejected',  color: 'var(--red)',    tint: 'var(--red-l)' },
];
const stageInfo = (stage: string) => STAGES.find(s => s.key === (stage || '').toUpperCase()) || STAGES[0];

const REQ_STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error' | 'brand'> = {
  DRAFT: 'gray', SUBMITTED: 'info', APPROVED: 'brand', REJECTED: 'error',
  OPEN: 'success', CLOSED: 'gray', CANCELLED: 'error',
};
const OFFER_STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error' | 'brand'> = {
  DRAFT: 'gray', PENDING_APPROVAL: 'warning', APPROVED: 'brand', SENT: 'info', VIEWED: 'info',
  ACCEPTED: 'success', DECLINED: 'error', WITHDRAWN: 'gray', EXPIRED: 'gray', SUPERSEDED: 'gray',
};

const INTERVIEW_MODES = ['PHONE', 'VIDEO', 'ONSITE'];
const EMP_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const REASONS = ['NEW_POSITION', 'REPLACEMENT', 'OTHER'];
const HIRE_ROLES = ['ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'TENANT_ADMIN', 'OFFICER'];
const prettyType = (t: string) => (t || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (amount: string | null, currency: string | null, period: string) =>
  amount ? `${currency || ''} ${Number(amount).toLocaleString()} / ${period === 'ANNUAL' ? 'yr' : 'mo'}`.trim() : '—';

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };

function StageBadge({ stage }: { stage: string }) {
  const s = stageInfo(stage);
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: s.tint, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

/** Client-side CSV of exactly what's on screen — no backend report endpoint
 *  exists, and none is needed for "export the current application list". */
function downloadApplicationsCsv(applications: Application[], openings: Opening[], openingTitle: string) {
  const header = ['Name', 'Department', 'Phone', 'Email', 'Stage', 'Next interview'];
  const rows = applications.map(a => {
    const dept = openings.find(o => o.id === a.job_opening_id)?.department || '';
    const interview = a.next_interview ? `${fmtDateTime(a.next_interview.scheduled_at)} (${prettyType(a.next_interview.mode)})` : '';
    return [a.candidate_name, dept, a.candidate_phone || '', a.candidate_email || '', stageInfo(a.stage).label, interview];
  });
  const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `applications-${openingTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'export'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// -- pipeline modals ------------------------------------------------------

function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [openingsCount, setOpeningsCount] = useState('1');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const r = await apiFetch('/v1/hr/recruitment/openings', {
        method: 'POST',
        body: JSON.stringify({ title, department, location, employment_type: employmentType, openings_count: Number(openingsCount) || 1 }),
      });
      onCreated(r.id);
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create the opening.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New job opening</DialogTitle></DialogHeader>
        <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>
          A lighter path than a requisition — this goes straight to OPEN with no approval step.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Title</label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Department</label>
              <input value={department} onChange={e => setDepartment(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Remote, Dar es Salaam…" style={inp} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Employment type</label>
              <Select value={employmentType} onValueChange={setEmploymentType}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMP_TYPES.map(t => <SelectItem key={t} value={t}>{prettyType(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Positions</label>
              <input type="number" min={1} value={openingsCount} onChange={e => setOpeningsCount(e.target.value)} style={inp} />
            </div>
          </div>
          <DialogFooter style={{ marginTop: 6 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create opening'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCandidateModal({ jobOpeningId, jobTitle, onClose, onCreated }: { jobOpeningId: string; jobTitle: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/hr/recruitment/candidates', {
        method: 'POST',
        body: JSON.stringify({ job_opening_id: jobOpeningId, name, email: email || undefined, phone: phone || undefined, source: source || undefined }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not add the candidate.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>Applying to <strong>{jobTitle}</strong> — an existing candidate with this email is reused, not duplicated.</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Full name</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Source</label>
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="LinkedIn, referral, walk-in…" style={inp} />
          </div>
          <DialogFooter style={{ marginTop: 6 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Adding…' : 'Add candidate'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleInterviewModal({ application, staff, onClose, onScheduled }: {
  application: Application; staff: { id: string; name: string }[]; onClose: () => void; onScheduled: () => void;
}) {
  const [when, setWhen] = useState<Date | undefined>(undefined);
  const [interviewerId, setInterviewerId] = useState('');
  const [mode, setMode] = useState('VIDEO');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const staffOptions: ComboboxOption[] = staff.map(s => ({ value: s.id, label: s.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when) { showAlert('Pick a date and time first.'); return; }
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/recruitment/applications/${application.id}/interviews`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: when.toISOString(), interviewer_id: interviewerId || undefined, mode, notes: notes || undefined }),
      });
      onScheduled();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not schedule the interview.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule interview</DialogTitle></DialogHeader>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>With <strong>{application.candidate_name}</strong></div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Date & time</label>
            <DateTimePicker date={when} onChange={setWhen} triggerClassName="w-full" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Mode</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVIEW_MODES.map(m => <SelectItem key={m} value={m}>{prettyType(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Interviewer</label>
              <Combobox options={staffOptions} value={interviewerId} onChange={setInterviewerId} placeholder="Select staff…" searchPlaceholder="Search staff…" emptyText="No staff found" />
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <DialogFooter style={{ marginTop: 6 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !when}>{saving ? 'Scheduling…' : 'Schedule'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -- requisition modals ---------------------------------------------------

function CreateRequisitionModal({ staff, onClose, onCreated }: {
  staff: { id: string; name: string }[]; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [designations, setDesignations] = useState<{ id: string; title: string }[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [hiringManagerId, setHiringManagerId] = useState('');
  const [openingsCount, setOpeningsCount] = useState('1');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('TZS');
  const [priority, setPriority] = useState('MEDIUM');
  const [reason, setReason] = useState('NEW_POSITION');
  const [replacementForId, setReplacementForId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/hr/departments').then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/v1/hr/designations').then(d => setDesignations(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const staffOptions: ComboboxOption[] = staff.map(s => ({ value: s.id, label: s.name }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/hr/recruitment/requisitions', {
        method: 'POST',
        body: JSON.stringify({
          title, department_id: departmentId || undefined, designation_id: designationId || undefined,
          hiring_manager_id: hiringManagerId || undefined, openings_count: Number(openingsCount) || 1,
          employment_type: employmentType, location: location || undefined,
          description: description || undefined, requirements: requirements || undefined,
          salary_min: salaryMin || undefined, salary_max: salaryMax || undefined, salary_currency: salaryCurrency || undefined,
          priority, reason, replacement_for_id: reason === 'REPLACEMENT' ? (replacementForId || undefined) : undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create the requisition.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New requisition</DialogTitle></DialogHeader>
        <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>
          Saved as a draft — submit it for approval when it's ready, and publish it as a job opening once approved.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Position title</label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Senior Accountant" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Department</label>
              <Combobox options={departments.map(d => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} placeholder="Select…" emptyText="No departments yet" />
            </div>
            <div>
              <label style={lbl}>Designation</label>
              <Combobox options={designations.map(d => ({ value: d.id, label: d.title }))} value={designationId} onChange={setDesignationId} placeholder="Select…" emptyText="No designations yet" />
            </div>
          </div>
          <div>
            <label style={lbl}>Hiring manager</label>
            <Combobox options={staffOptions} value={hiringManagerId} onChange={setHiringManagerId} placeholder="Select staff…" searchPlaceholder="Search staff…" emptyText="No staff found" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Employment type</label>
              <Select value={employmentType} onValueChange={setEmploymentType}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>{EMP_TYPES.map(t => <SelectItem key={t} value={t}>{prettyType(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Openings</label>
              <input type="number" min={1} value={openingsCount} onChange={e => setOpeningsCount(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{prettyType(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label style={lbl}>Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Remote, Dar es Salaam…" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Reason for hiring</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{prettyType(r)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {reason === 'REPLACEMENT' && (
              <div>
                <label style={lbl}>Replacing</label>
                <Combobox options={staffOptions} value={replacementForId} onChange={setReplacementForId} placeholder="Select staff…" searchPlaceholder="Search staff…" emptyText="No staff found" />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Salary min</label>
              <input type="number" min={0} value={salaryMin} onChange={e => setSalaryMin(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Salary max</label>
              <input type="number" min={0} value={salaryMax} onChange={e => setSalaryMax(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <input value={salaryCurrency} onChange={e => setSalaryCurrency(e.target.value.toUpperCase())} maxLength={3} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div>
            <label style={lbl}>Requirements</label>
            <textarea value={requirements} onChange={e => setRequirements(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <DialogFooter style={{ marginTop: 6 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save as draft'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -- offers modal -----------------------------------------------------

function CreateOfferModal({ applicationId, positionTitle, supersedesOfferId, onClose, onCreated }: {
  applicationId: string; positionTitle: string; supersedesOfferId?: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState(positionTitle);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [period, setPeriod] = useState('MONTHLY');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/hr/recruitment/offers', {
        method: 'POST',
        body: JSON.stringify({
          application_id: applicationId, position_title: title,
          compensation_amount: amount || undefined, compensation_currency: currency || undefined, compensation_period: period,
          start_date: startDate ? toDateOnlyString(startDate) : undefined,
          expiry_date: expiryDate ? toDateOnlyString(expiryDate) : undefined,
          supersedes_offer_id: supersedesOfferId,
        }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create the offer.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{supersedesOfferId ? 'Revise offer' : 'New offer'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Position title</label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Amount</label>
              <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Currency</label>
              <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} style={inp} />
            </div>
            <div>
              <label style={lbl}>Period</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger style={inp}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="MONTHLY">Monthly</SelectItem><SelectItem value="ANNUAL">Annual</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Start date</label>
              <DatePicker date={startDate} onChange={setStartDate} triggerClassName="w-full" />
            </div>
            <div>
              <label style={lbl}>Expiry date</label>
              <DatePicker date={expiryDate} onChange={setExpiryDate} triggerClassName="w-full" />
            </div>
          </div>
          <DialogFooter style={{ marginTop: 6 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save as draft'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CandidateProfileModal({ candidateId, candidateName, onClose }: { candidateId: string; candidateName: string; onClose: () => void }) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [skills, setSkills] = useState('');
  const [education, setEducation] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/v1/hr/recruitment/candidates/${candidateId}/applications`);
      const c: CandidateProfile = data.candidate;
      setProfile(c);
      setCoverLetter(c.cover_letter || '');
      setSkills(c.skills || '');
      setEducation(c.education || '');
    } catch { setProfile(null); }
    finally { setLoading(false); }
  }, [candidateId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/recruitment/candidates/${candidateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ cover_letter: coverLetter || null, skills: skills || null, education: education || null }),
      });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not save the candidate profile.');
    } finally { setSaving(false); }
  }

  async function uploadResume(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch(`/v1/hr/recruitment/candidates/${candidateId}/resume`, { method: 'POST', body: form });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not upload the résumé.');
    } finally { setUploading(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="w-130 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
          <DialogTitle>Candidate profile</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
        </DialogHeader>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>{candidateName}</div>

        {loading ? <SectionLoading /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>Résumé</label>
              {profile?.resume_storage_key ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button variant="outline" size="sm" onClick={() => window.open(`/v1/hr/recruitment/candidates/${candidateId}/resume/download`, '_blank')}>
                    <Icon name="download" size={13} /> {profile.resume_filename || 'Download résumé'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? 'Uploading…' : 'Replace'}</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  <Icon name="upload" size={13} /> {uploading ? 'Uploading…' : 'Upload résumé'}
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadResume(f); e.target.value = ''; }} />
            </div>
            <div>
              <label style={lbl}>Cover letter</label>
              <textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div>
              <label style={lbl}>Skills</label>
              <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="e.g. Kysely, Fastify, React" style={inp} />
            </div>
            <div>
              <label style={lbl}>Education</label>
              <textarea value={education} onChange={e => setEducation(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save profile'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScreeningDialog({ application, onClose, onSaved }: { application: Application; onClose: () => void; onSaved: () => void }) {
  const [score, setScore] = useState(application.screening_score != null ? String(application.screening_score) : '');
  const [passed, setPassed] = useState<'pass' | 'fail' | ''>(application.screening_passed === true ? 'pass' : application.screening_passed === false ? 'fail' : '');
  const [reason, setReason] = useState(application.rejected_reason || '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/recruitment/applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          screening_score: score !== '' ? Number(score) : null,
          screening_passed: passed === 'pass' ? true : passed === 'fail' ? false : null,
          rejected_reason: passed === 'fail' ? (reason || null) : undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not save the screening result.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Screening result — {application.candidate_name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Score (0–100)</label>
            <input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Outcome</label>
            <Select value={passed} onValueChange={v => setPassed(v as any)}>
              <SelectTrigger style={inp}><SelectValue placeholder="Not yet decided" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Passed</SelectItem>
                <SelectItem value="fail">Failed / disqualified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {passed === 'fail' && (
            <div>
              <label style={lbl}>Disqualification reason</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save result'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OffersModal({ application, jobTitle, onClose, onChanged }: { application: Application; jobTitle: string; onClose: () => void; onChanged: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<{ supersedes?: string } | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<Offer | null>(null);
  const [hireRole, setHireRole] = useState('JUNIOR');

  const load = useCallback(async () => {
    setLoading(true);
    try { setOffers(await apiFetch(`/v1/hr/recruitment/applications/${application.id}/offers`) ?? []); }
    catch { setOffers([]); }
    finally { setLoading(false); }
  }, [application.id]);
  useEffect(() => { load(); }, [load]);

  async function act(offer: Offer, action: string, body?: Record<string, unknown>) {
    setBusyId(offer.id);
    try {
      await apiFetch(`/v1/hr/recruitment/offers/${offer.id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load();
      onChanged();
    } catch (e: any) {
      showAlert(e?.message || 'That action could not be completed.');
    } finally { setBusyId(null); }
  }

  async function decline(offer: Offer) {
    const reason = await showPrompt('Why is this offer being declined?', { title: 'Decline offer', placeholder: 'Reason (optional)' });
    if (reason === null) return;
    act(offer, 'decline', { reason: reason || undefined });
  }

  async function withdraw(offer: Offer) {
    if (!(await showConfirm('Withdraw this offer? The candidate can no longer accept it.'))) return;
    act(offer, 'withdraw');
  }

  async function copySigningLink(offer: Offer) {
    try {
      const { signing_url } = await apiFetch(`/v1/hr/recruitment/offers/${offer.id}/signing-link`);
      await navigator.clipboard.writeText(signing_url);
      showAlert('Signing link copied — share it with the candidate however you normally reach them (there is no automatic offer email yet).', { variant: 'success', title: 'Link copied' });
    } catch (e: any) {
      showAlert(e?.message || 'Could not get the signing link.');
    }
  }

  async function confirmAccept() {
    if (!acceptTarget) return;
    await act(acceptTarget, 'accept', { role: hireRole });
    setAcceptTarget(null);
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="w-160 max-w-[92vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
          <DialogTitle>Offers</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={18} /></button>
        </DialogHeader>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -8, marginBottom: 4 }}>For <strong>{application.candidate_name}</strong></div>

        {loading ? <SectionLoading /> : offers.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No offers yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {offers.map(o => {
              const busy = busyId === o.id;
              return (
                <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, opacity: busy ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{o.position_title} <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>rev. {o.revision}</span></div>
                      <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{fmtMoney(o.compensation_amount, o.compensation_currency, o.compensation_period)}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Start {fmtDate(o.start_date)} · Expires {fmtDate(o.expiry_date)}</div>
                      {o.status === 'DECLINED' && o.decline_reason && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Declined: {o.decline_reason}</div>}
                      {o.sign_envelope_id && <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="fileText" size={11} /> Real offer letter generated — signable, no login needed</div>}
                    </div>
                    <Badge variant={OFFER_STATUS_VARIANT[o.status] || 'gray'}>{prettyType(o.status)}</Badge>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {o.status === 'DRAFT' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(o, 'submit')}>Submit for approval</Button>}
                    {o.status === 'PENDING_APPROVAL' && <Button size="sm" disabled={busy} onClick={() => act(o, 'approve')}>Approve</Button>}
                    {o.status === 'APPROVED' && <Button size="sm" disabled={busy} onClick={() => act(o, 'send')}>Mark sent</Button>}
                    {o.status === 'SENT' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(o, 'mark-viewed')}>Mark viewed</Button>}
                    {o.sign_envelope_id && <Button size="sm" variant="outline" disabled={busy} onClick={() => copySigningLink(o)}>Copy signing link</Button>}
                    {(o.status === 'SENT' || o.status === 'VIEWED') && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => { setAcceptTarget(o); setHireRole('JUNIOR'); }}>Accept</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => decline(o)}>Decline</Button>
                      </>
                    )}
                    {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED'].includes(o.status) && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(o)}>Withdraw</Button>
                    )}
                    {['SENT', 'VIEWED', 'DECLINED', 'EXPIRED'].includes(o.status) && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowCreate({ supersedes: o.id })}>Revise with a new offer</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button variant="outline" onClick={() => setShowCreate({})}><Icon name="plus" size={14} /> New offer</Button>

        {showCreate && (
          <CreateOfferModal
            applicationId={application.id} positionTitle={jobTitle}
            supersedesOfferId={showCreate.supersedes}
            onClose={() => setShowCreate(null)}
            onCreated={load}
          />
        )}

        <Dialog open={!!acceptTarget} onOpenChange={o => { if (!o) setAcceptTarget(null); }}>
          <DialogContent className="sm:max-w-sm">
            {acceptTarget && (
              <>
                <DialogHeader><DialogTitle>Accept this offer?</DialogTitle></DialogHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>
                    This sends a real staff invitation to <strong>{application.candidate_email}</strong>. Choose the role they'll join with.
                  </p>
                  <Select value={hireRole} onValueChange={setHireRole}>
                    <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                    <SelectContent>{HIRE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAcceptTarget(null)}>Cancel</Button>
                  <Button variant="default" onClick={confirmAccept}>Accept &amp; invite</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// -- requisitions tab -------------------------------------------------

function RequisitionsTab({ staff }: { staff: { id: string; name: string }[] }) {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      setRequisitions(await apiFetch(`/v1/hr/recruitment/requisitions${q}`) ?? []);
    } catch { setRequisitions([]); }
    finally { setLoading(false); }
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function act(r: Requisition, action: string, body?: Record<string, unknown>) {
    setBusyId(r.id);
    try {
      await apiFetch(`/v1/hr/recruitment/requisitions/${r.id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'That action could not be completed.');
    } finally { setBusyId(null); }
  }

  async function reject(r: Requisition) {
    const reason = await showPrompt('Why is this requisition being rejected?', { title: 'Reject requisition', placeholder: 'Reason (optional)' });
    if (reason === null) return;
    act(r, 'reject', { reason: reason || undefined });
  }

  async function cancel(r: Requisition) {
    if (!(await showConfirm(`Cancel the "${r.title}" requisition?`))) return;
    act(r, 'cancel');
  }

  const STATUS_FILTERS = ['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OPEN', 'CLOSED', 'CANCELLED'];

  return (
    <div>
      {showCreate && <CreateRequisitionModal staff={staff} onClose={() => setShowCreate(false)} onCreated={load} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Tabs value={statusFilter} onValueChange={setStatusFilter} variant="segmented">
          <TabsList>
            {STATUS_FILTERS.map(s => <TabsTrigger key={s} value={s}>{s ? prettyType(s) : 'All'}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Button onClick={() => setShowCreate(true)}><Icon name="plus" size={15} /> New requisition</Button>
      </div>

      <SectionCard padded={false}>
        {loading ? <SectionLoading /> : requisitions.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No requisitions{statusFilter ? ` in ${prettyType(statusFilter)}` : ''}.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Title', 'Department', 'Hiring manager', 'Priority', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === '' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requisitions.map(r => {
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: busy ? 0.6 : 1 }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.title}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.department_name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{r.hiring_manager_name || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{prettyType(r.priority)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={REQ_STATUS_VARIANT[r.status] || 'gray'}>{prettyType(r.status)}</Badge></td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                              <Icon name="moreHorizontal" size={18} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {r.status === 'DRAFT' && <DropdownMenuItem onSelect={() => act(r, 'submit')}>Submit for approval</DropdownMenuItem>}
                            {r.status === 'SUBMITTED' && <DropdownMenuItem onSelect={() => act(r, 'approve')}>Approve</DropdownMenuItem>}
                            {r.status === 'SUBMITTED' && <DropdownMenuItem onSelect={() => reject(r)}>Reject</DropdownMenuItem>}
                            {r.status === 'APPROVED' && <DropdownMenuItem onSelect={() => act(r, 'publish')}>Publish as job opening</DropdownMenuItem>}
                            {r.status === 'OPEN' && <DropdownMenuItem onSelect={() => act(r, 'close')}>Close</DropdownMenuItem>}
                            {!['CLOSED', 'CANCELLED', 'REJECTED'].includes(r.status) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => cancel(r)}>Cancel</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// -- pipeline tab ------------------------------------------------------

const PAGE_SIZE = 10;

function PipelineTab() {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingInterview[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [showJob, setShowJob] = useState(false);
  const [showCand, setShowCand] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Application | null>(null);
  const [offersFor, setOffersFor] = useState<Application | null>(null);
  const [screeningFor, setScreeningFor] = useState<Application | null>(null);
  const [profileFor, setProfileFor] = useState<Application | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiFetch('/v1/hr/staff').then(d => { if (Array.isArray(d)) setStaff(d); }).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/v1/hr/recruitment/interviews/upcoming').then(d => { if (Array.isArray(d)) setUpcoming(d); }).catch(() => {}); }, []);

  const loadOpenings = useCallback(async () => {
    try {
      const r = await apiFetch('/v1/hr/recruitment/openings');
      const list: Opening[] = Array.isArray(r) ? r : [];
      setOpenings(list);
      setSelId(prev => (prev && list.some(o => o.id === prev)) ? prev : (list[0]?.id ?? null));
    } catch { setOpenings([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadOpenings(); }, [loadOpenings]);

  const loadApplications = useCallback(async (id: string) => {
    try { setApplications(await apiFetch(`/v1/hr/recruitment/openings/${id}/applications`) ?? []); } catch { setApplications([]); }
  }, []);
  useEffect(() => { setPage(1); if (selId) loadApplications(selId); else setApplications([]); }, [selId, loadApplications]);

  const refreshUpcoming = useCallback(() => {
    apiFetch('/v1/hr/recruitment/interviews/upcoming').then(d => { if (Array.isArray(d)) setUpcoming(d); }).catch(() => {});
  }, []);

  const selectedOpening = openings.find(o => o.id === selId) || null;

  const filteredApplications = applications.filter(a => !search || a.candidate_name.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredApplications.length / PAGE_SIZE));
  const pageApplications = filteredApplications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const totalApplications = openings.reduce((s, o) => s + (o.candidate_count || 0), 0);
    const byStage = (key: string) => applications.filter(a => a.stage?.toUpperCase() === key).length;
    return {
      openings: openings.length,
      applications: totalApplications,
      screening: byStage('SCREENING'),
      interview: byStage('INTERVIEW'),
      rejected: byStage('REJECTED'),
      hired: byStage('HIRED'),
    };
  }, [openings, applications]);

  // Moving an application to Hired now also invites the candidate directly
  // (bypassing a formal offer) — see hr.routes.ts's PATCH
  // /recruitment/applications/:id, which creates a real hr_invitations row
  // (and sends the invite email) on that exact transition. That needs a
  // role to invite them with, the same explicit choice Team ▸ Invite Staff
  // already asks for — never auto-guessed from the job opening's free-text
  // title. Hiring through a formal Offer (Actions ▸ Offers ▸ Accept) does
  // the same thing without going through this stage dropdown at all.
  const [hiring, setHiring] = useState<Application | null>(null);
  const [hireRole, setHireRole] = useState('JUNIOR');
  const [hiringBusy, setHiringBusy] = useState(false);

  async function setStage(a: Application, stage: string) {
    if (stage === 'HIRED') { setHiring(a); setHireRole('JUNIOR'); return; }
    setApplications(prev => prev.map(x => x.id === a.id ? { ...x, stage } : x));
    try { await apiFetch(`/v1/hr/recruitment/applications/${a.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) }); }
    catch (e: any) { showAlert(e?.message || 'Could not update stage.'); if (selId) loadApplications(selId); }
  }

  async function confirmHire() {
    if (!hiring) return;
    setHiringBusy(true);
    try {
      await apiFetch(`/v1/hr/recruitment/applications/${hiring.id}`, { method: 'PATCH', body: JSON.stringify({ stage: 'HIRED', role: hireRole }) });
      setApplications(prev => prev.map(x => x.id === hiring.id ? { ...x, stage: 'HIRED' } : x));
      setHiring(null);
    } catch (e: any) {
      showAlert(e?.message || 'Could not mark this application hired.');
    } finally {
      setHiringBusy(false);
    }
  }

  async function markInterview(interviewId: string, status: 'COMPLETED' | 'CANCELLED') {
    if (status === 'CANCELLED' && !(await showConfirm('Cancel this interview?'))) return;
    try {
      await apiFetch(`/v1/hr/recruitment/interviews/${interviewId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (selId) loadApplications(selId);
      refreshUpcoming();
    } catch (e: any) { showAlert(e?.message || 'Could not update the interview.'); }
  }

  async function rejectApplication(a: Application) {
    if (!(await showConfirm(`Reject ${a.candidate_name}?`))) return;
    setStage(a, 'REJECTED');
  }

  const KPIS = [
    { label: 'Job Openings', value: totals.openings, icon: 'package', variant: 'brand' as const },
    { label: 'Applications', value: totals.applications, icon: 'fileText', variant: 'info' as const },
    { label: 'Screening', value: totals.screening, icon: 'users', variant: 'info' as const },
    { label: 'In Interview', value: totals.interview, icon: 'video', variant: 'brand' as const },
    { label: 'Rejected', value: totals.rejected, icon: 'x', variant: 'error' as const },
    { label: 'Hired', value: totals.hired, icon: 'checkCircle', variant: 'success' as const },
  ];

  return (
    <div>
      {showJob && <CreateJobModal onClose={() => setShowJob(false)} onCreated={id => { loadOpenings(); setSelId(id); }} />}
      {showCand && selectedOpening && (
        <AddCandidateModal jobOpeningId={selectedOpening.id} jobTitle={selectedOpening.title} onClose={() => setShowCand(false)} onCreated={() => { loadOpenings(); if (selId) loadApplications(selId); }} />
      )}
      {scheduleFor && (
        <ScheduleInterviewModal application={scheduleFor} staff={staff} onClose={() => setScheduleFor(null)} onScheduled={() => { if (selId) loadApplications(selId); refreshUpcoming(); }} />
      )}
      {offersFor && (
        <OffersModal
          application={offersFor}
          jobTitle={openings.find(o => o.id === offersFor.job_opening_id)?.title || ''}
          onClose={() => setOffersFor(null)}
          onChanged={() => { if (selId) loadApplications(selId); }}
        />
      )}
      {screeningFor && (
        <ScreeningDialog application={screeningFor} onClose={() => setScreeningFor(null)} onSaved={() => { if (selId) loadApplications(selId); }} />
      )}
      {profileFor && (
        <CandidateProfileModal candidateId={profileFor.candidate_id} candidateName={profileFor.candidate_name} onClose={() => setProfileFor(null)} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button onClick={() => setShowJob(true)}><Icon name="plus" size={15} /> Create job directly</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start', marginBottom: 20 }}>
        <SectionCard title="Job openings" padded={false}>
          {loading ? (
            <SectionLoading />
          ) : openings.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No job openings yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: 16 }}>
              {openings.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelId(o.id)}
                  style={{
                    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
                    borderRadius: 'var(--r)', border: `1px solid ${o.id === selId ? 'var(--teal)' : 'var(--border)'}`,
                    background: o.id === selId ? 'var(--teal-l)' : 'var(--white)', cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <FeaturedIcon variant="brand" size="sm"><Icon name="briefcase" size={16} /></FeaturedIcon>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{o.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{prettyType(o.employment_type)}{o.location ? ` • ${o.location}` : ''}{o.requisition_id ? ' • via requisition' : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{o.candidate_count ?? 0}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Applications</div>
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{o.openings_count}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Positions</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Upcoming interviews">
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>Nothing scheduled.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map(iv => (
                <div key={iv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <PersonAvatar name={iv.candidate_name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.candidate_name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{prettyType(iv.mode)}{iv.interviewer_name ? ` · ${iv.interviewer_name}` : ''}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDateTime(iv.scheduled_at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard padded={false}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            Applications{selectedOpening ? ` — ${selectedOpening.title}` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text" placeholder="Search candidates…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ ...inp, paddingLeft: 30 }}
              />
            </div>
            <Button variant="outline" size="sm" disabled={filteredApplications.length === 0} onClick={() => downloadApplicationsCsv(filteredApplications, openings, selectedOpening?.title || '')}>
              <Icon name="download" size={14} /> Export CSV
            </Button>
            <Button size="sm" disabled={!selectedOpening} onClick={() => setShowCand(true)}>
              <Icon name="plus" size={14} /> Add candidate
            </Button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Name', 'Department', 'Phone', 'Email', 'Stage', 'Interview', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === '' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageApplications.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    {selectedOpening ? 'No applications found for this opening.' : 'Select a job opening above to see its applications.'}
                  </td>
                </tr>
              ) : (
                pageApplications.map(a => {
                  const dept = openings.find(o => o.id === a.job_opening_id)?.department || '—';
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar name={a.candidate_name} size={30} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{a.candidate_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{dept}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{a.candidate_phone || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{a.candidate_email || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Select value={a.stage?.toUpperCase() || 'APPLIED'} onValueChange={v => setStage(a, v)}>
                          <SelectTrigger style={{ width: 130, height: 30, fontSize: 11.5, border: 'none', background: stageInfo(a.stage).tint, color: stageInfo(a.stage).color, fontWeight: 700 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {a.screening_score != null && (
                          <div style={{ fontSize: 10.5, color: a.screening_passed === false ? 'var(--red)' : 'var(--ink3)', marginTop: 3 }}>
                            Screen: {a.screening_score}{a.screening_passed != null ? (a.screening_passed ? ' · passed' : ' · failed') : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.next_interview ? (
                          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                            <div style={{ fontWeight: 600 }}>{fmtDateTime(a.next_interview.scheduled_at)}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{prettyType(a.next_interview.mode)} · {a.next_interview.status === 'SCHEDULED' ? 'Scheduled' : prettyType(a.next_interview.status)}</div>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setScheduleFor(a)}>Schedule</Button>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                              <Icon name="moreHorizontal" size={18} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setScheduleFor(a)}>
                              {a.next_interview ? 'Reschedule interview' : 'Schedule interview'}
                            </DropdownMenuItem>
                            {a.next_interview && a.next_interview.status === 'SCHEDULED' && (
                              <>
                                <DropdownMenuItem onSelect={() => markInterview(a.next_interview!.id, 'COMPLETED')}>Mark interview completed</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => markInterview(a.next_interview!.id, 'CANCELLED')}>Cancel interview</DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onSelect={() => setScreeningFor(a)}>Record screening result…</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setProfileFor(a)}>Candidate profile…</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setOffersFor(a)}>Offers…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => rejectApplication(a)}>Reject application</DropdownMenuItem>
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

        {filteredApplications.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--ink3)' }}>
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredApplications.length)} of {filteredApplications.length}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span>Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!hiring} onOpenChange={o => { if (!o) setHiring(null); }}>
        <DialogContent className="sm:max-w-sm">
          {hiring && (
            <>
              <DialogHeader>
                <DialogTitle>Hire {hiring.candidate_name}?</DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>
                  This sends a real staff invitation to <strong>{hiring.candidate_email}</strong>. Choose the role they'll join with.
                </p>
                <Select value={hireRole} onValueChange={setHireRole}>
                  <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HIRE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHiring(null)}>Cancel</Button>
                <Button variant="default" disabled={hiringBusy} onClick={confirmHire}>{hiringBusy ? 'Inviting…' : 'Hire & invite'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- page ----------------------------------------------------------------

export function RecruitmentPage() {
  const [tab, setTab] = useState<'pipeline' | 'requisitions'>('pipeline');
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { apiFetch('/v1/hr/staff').then(d => { if (Array.isArray(d)) setStaff(d); }).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader
        crumbs={['NexusHR', 'People']}
        titlePlain="Talent"
        titleEm="recruitment"
        subtitle="Requisitions, job openings, candidate pipeline, interviews and offers — real data, not a preview."
        actions={
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} variant="segmented">
            <TabsList>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {tab === 'requisitions' ? <RequisitionsTab staff={staff} /> : <PipelineTab />}
    </div>
  );
}
