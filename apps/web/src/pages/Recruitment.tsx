import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { DateTimePicker } from '../components/ui/date-picker.js';
import { Button } from '../components/ui/button.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface Opening {
  id: string; title: string; department: string | null; location: string | null;
  employment_type: string; status: string; description: string | null;
  openings_count: number; candidate_count?: number; created_by_name?: string | null;
}
interface Interview { id: string; scheduled_at: string; mode: string; status: string; interviewer_id: string | null; interviewer_name: string | null; notes: string | null }
interface Candidate {
  id: string; job_opening_id: string; name: string; email: string | null;
  phone: string | null; stage: string; rating: number | null; source: string | null; notes: string | null;
  interviews?: Interview[]; next_interview?: Interview | null;
}
interface UpcomingInterview {
  id: string; scheduled_at: string; mode: string; status: string;
  candidate_id: string; candidate_name: string; interviewer_name: string | null;
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

const INTERVIEW_MODES = ['PHONE', 'VIDEO', 'ONSITE'];
const EMP_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'];
const prettyType = (t: string) => t.replace('_', ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalCard: React.CSSProperties = { background: 'var(--white)', borderRadius: 'var(--r)', padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' };
const modalTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 };
const modalActions: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 };

function StageBadge({ stage }: { stage: string }) {
  const s = stageInfo(stage);
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: s.tint, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

/** Client-side CSV of exactly what's on screen — no backend report endpoint
 *  exists, and none is needed for "export the current candidate list". */
function downloadCandidatesCsv(candidates: Candidate[], openings: Opening[], openingTitle: string) {
  const header = ['Name', 'Department', 'Phone', 'Email', 'Stage', 'Next interview'];
  const rows = candidates.map(c => {
    const dept = openings.find(o => o.id === c.job_opening_id)?.department || '';
    const interview = c.next_interview ? `${fmtDateTime(c.next_interview.scheduled_at)} (${prettyType(c.next_interview.mode)})` : '';
    return [c.name, dept, c.phone || '', c.email || '', stageInfo(c.stage).label, interview];
  });
  const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `candidates-${openingTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'export'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

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
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={modalTitle}>New job opening</div>
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
          <div style={modalActions}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create opening'}</Button>
          </div>
        </form>
      </div>
    </div>
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
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={modalTitle}>Add candidate</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -12, marginBottom: 18 }}>Applying to <strong>{jobTitle}</strong></div>
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
          <div style={modalActions}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Adding…' : 'Add candidate'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScheduleInterviewModal({ candidate, staff, onClose, onScheduled }: {
  candidate: Candidate; staff: { id: string; name: string }[]; onClose: () => void; onScheduled: () => void;
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
      await apiFetch(`/v1/hr/recruitment/candidates/${candidate.id}/interviews`, {
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
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={modalTitle}>Schedule interview</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: -12, marginBottom: 18 }}>With <strong>{candidate.name}</strong></div>
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
          <div style={modalActions}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !when}>{saving ? 'Scheduling…' : 'Schedule'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

export function RecruitmentPage() {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingInterview[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [showJob, setShowJob] = useState(false);
  const [showCand, setShowCand] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Candidate | null>(null);
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

  const loadCandidates = useCallback(async (id: string) => {
    try { setCandidates(await apiFetch(`/v1/hr/recruitment/openings/${id}/candidates`) ?? []); } catch { setCandidates([]); }
  }, []);
  useEffect(() => { setPage(1); if (selId) loadCandidates(selId); else setCandidates([]); }, [selId, loadCandidates]);

  const refreshUpcoming = useCallback(() => {
    apiFetch('/v1/hr/recruitment/interviews/upcoming').then(d => { if (Array.isArray(d)) setUpcoming(d); }).catch(() => {});
  }, []);

  const selectedOpening = openings.find(o => o.id === selId) || null;

  const filteredCandidates = candidates.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
  const pageCandidates = filteredCandidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const totalApplications = openings.reduce((s, o) => s + (o.candidate_count || 0), 0);
    const byStage = (key: string) => candidates.filter(c => c.stage?.toUpperCase() === key).length;
    return {
      openings: openings.length,
      applications: totalApplications,
      screening: byStage('SCREENING'),
      interview: byStage('INTERVIEW'),
      rejected: byStage('REJECTED'),
      hired: byStage('HIRED'),
    };
  }, [openings, candidates]);

  async function setStage(c: Candidate, stage: string) {
    setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, stage } : x));
    try { await apiFetch(`/v1/hr/recruitment/candidates/${c.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) }); }
    catch (e: any) { showAlert(e?.message || 'Could not update stage.'); if (selId) loadCandidates(selId); }
  }

  async function markInterview(interviewId: string, status: 'COMPLETED' | 'CANCELLED') {
    if (status === 'CANCELLED' && !(await showConfirm('Cancel this interview?'))) return;
    try {
      await apiFetch(`/v1/hr/recruitment/interviews/${interviewId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (selId) loadCandidates(selId);
      refreshUpcoming();
    } catch (e: any) { showAlert(e?.message || 'Could not update the interview.'); }
  }

  async function rejectCandidate(c: Candidate) {
    if (!(await showConfirm(`Reject ${c.name}?`))) return;
    setStage(c, 'REJECTED');
  }

  const KPIS = [
    { label: 'Job Openings', value: totals.openings, icon: 'package', variant: 'brand' as const },
    { label: 'Applications', value: totals.applications, icon: 'fileText', variant: 'info' as const },
    { label: 'Screening', value: totals.screening, icon: 'users', variant: 'info' as const },
    { label: 'In Interview', value: totals.interview, icon: 'video', variant: 'brand' as const },
    { label: 'Rejected', value: totals.rejected, icon: 'x', variant: 'error' as const },
    { label: 'Hired', value: totals.hired, icon: 'checkCircle', variant: 'success' as const },
  ];
  const VARIANT_COLOR: Record<string, string> = { brand: 'var(--teal)', info: 'var(--blue)', error: 'var(--red)', success: 'var(--green)' };

  return (
    <div>
      {showJob && <CreateJobModal onClose={() => setShowJob(false)} onCreated={id => { loadOpenings(); setSelId(id); }} />}
      {showCand && selectedOpening && (
        <AddCandidateModal jobOpeningId={selectedOpening.id} jobTitle={selectedOpening.title} onClose={() => setShowCand(false)} onCreated={() => { loadOpenings(); if (selId) loadCandidates(selId); }} />
      )}
      {scheduleFor && (
        <ScheduleInterviewModal candidate={scheduleFor} staff={staff} onClose={() => setScheduleFor(null)} onScheduled={() => { if (selId) loadCandidates(selId); refreshUpcoming(); }} />
      )}

      <PageHeader
        crumbs={['NexusHR', 'People']}
        titlePlain="Talent"
        titleEm="recruitment"
        subtitle="Job openings, candidate pipeline and interview scheduling — real data, not a preview."
        actions={<Button onClick={() => setShowJob(true)}><Icon name="plus" size={15} /> Create job</Button>}
      />

      {/* KPI row — real counts: openings/applications are platform-wide, the
          per-stage counts are scoped to the selected opening below, matching
          how the candidate table is already scoped. */}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start', marginBottom: 20 }}>
        {/* Openings grid */}
        <SectionCard title="Job openings" padded={false}>
          {loading ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
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
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{prettyType(o.employment_type)}{o.location ? ` • ${o.location}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{o.candidate_count ?? 0}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)' }}>Applied</div>
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

        {/* Real upcoming interviews, platform-wide */}
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

      {/* Candidate pipeline for the selected opening */}
      <SectionCard padded={false}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            Candidates{selectedOpening ? ` — ${selectedOpening.title}` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text" placeholder="Search candidates…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ ...inp, paddingLeft: 30 }}
              />
            </div>
            <Button variant="outline" size="sm" disabled={filteredCandidates.length === 0} onClick={() => downloadCandidatesCsv(filteredCandidates, openings, selectedOpening?.title || '')}>
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
              {pageCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    {selectedOpening ? 'No candidates found for this opening.' : 'Select a job opening above to see its candidates.'}
                  </td>
                </tr>
              ) : (
                pageCandidates.map(c => {
                  const dept = openings.find(o => o.id === c.job_opening_id)?.department || '—';
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar name={c.name} size={30} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{dept}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{c.email || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Select value={c.stage?.toUpperCase() || 'APPLIED'} onValueChange={v => setStage(c, v)}>
                          <SelectTrigger style={{ width: 130, height: 30, fontSize: 11.5, border: 'none', background: stageInfo(c.stage).tint, color: stageInfo(c.stage).color, fontWeight: 700 }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {c.next_interview ? (
                          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                            <div style={{ fontWeight: 600 }}>{fmtDateTime(c.next_interview.scheduled_at)}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{prettyType(c.next_interview.mode)} · {c.next_interview.status === 'SCHEDULED' ? 'Scheduled' : prettyType(c.next_interview.status)}</div>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setScheduleFor(c)}>Schedule</Button>
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
                            <DropdownMenuItem onSelect={() => setScheduleFor(c)}>
                              {c.next_interview ? 'Reschedule interview' : 'Schedule interview'}
                            </DropdownMenuItem>
                            {c.next_interview && c.next_interview.status === 'SCHEDULED' && (
                              <>
                                <DropdownMenuItem onSelect={() => markInterview(c.next_interview!.id, 'COMPLETED')}>Mark interview completed</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => markInterview(c.next_interview!.id, 'CANCELLED')}>Cancel interview</DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => rejectCandidate(c)}>Reject candidate</DropdownMenuItem>
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

        {filteredCandidates.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--ink3)' }}>
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span>Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
