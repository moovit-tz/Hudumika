import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';

interface Course {
  id: string; title: string; description: string | null; category: string | null;
  provider: string | null; duration_hours: string | null; is_certification: boolean;
  validity_months: number | null; active: boolean;
}
interface MyEnrollment {
  id: string; course_id: string; course_title: string; category: string | null; is_certification: boolean;
  status: string; enrolled_at: string; completed_at: string | null; score: string | null; certificate_expiry_date: string | null;
}
interface Enrollment {
  id: string; course_id: string; course_title: string; is_certification: boolean;
  user_id: string; user_name: string; status: string; enrolled_at: string; completed_at: string | null;
  score: string | null; notes: string | null; certificate_expiry_date: string | null;
}

const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error'> = {
  ENROLLED: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', FAILED: 'error', CANCELLED: 'gray',
};
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };
const prettyStatus = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function CreateCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [provider, setProvider] = useState('');
  const [description, setDescription] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [isCert, setIsCert] = useState(false);
  const [validityMonths, setValidityMonths] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/hr/training/courses', {
        method: 'POST',
        body: JSON.stringify({
          title, category: category || undefined, provider: provider || undefined,
          description: description || undefined, duration_hours: durationHours ? Number(durationHours) : undefined,
          is_certification: isCert, validity_months: isCert && validityMonths ? Number(validityMonths) : undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create the course.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New training course</DialogTitle></DialogHeader>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lbl}>Title</label><input required autoFocus value={title} onChange={e => setTitle(e.target.value)} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Category</label><input value={category} onChange={e => setCategory(e.target.value)} placeholder="Compliance, Technical…" style={inp} /></div>
            <div><label style={lbl}>Provider</label><input value={provider} onChange={e => setProvider(e.target.value)} style={inp} /></div>
          </div>
          <div><label style={lbl}>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Duration (hours)</label><input type="number" min={0} value={durationHours} onChange={e => setDurationHours(e.target.value)} style={inp} /></div>
            <div>
              <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <Checkbox checked={isCert} onCheckedChange={c => setIsCert(c === true)} /> Certification
              </label>
              {isCert && <input type="number" min={1} value={validityMonths} onChange={e => setValidityMonths(e.target.value)} placeholder="Valid for (months)" style={inp} />}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create course'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CatalogueAndMyTraining({ canManage }: { canManage: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<MyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([
        apiFetch('/v1/hr/training/courses').catch(() => []),
        apiFetch('/v1/hr/training/my-enrollments').catch(() => []),
      ]);
      setCourses(Array.isArray(c) ? c : []);
      setMyEnrollments(Array.isArray(e) ? e : []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const enrolledCourseIds = new Set(myEnrollments.filter(e => e.status !== 'CANCELLED').map(e => e.course_id));

  async function enroll(courseId: string) {
    setBusyId(courseId);
    try {
      await apiFetch('/v1/hr/training/enrollments', { method: 'POST', body: JSON.stringify({ course_id: courseId }) });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not enroll in this course.');
    } finally { setBusyId(null); }
  }

  async function cancel(enrollmentId: string) {
    if (!(await showConfirm('Withdraw from this course?'))) return;
    setBusyId(enrollmentId);
    try {
      await apiFetch(`/v1/hr/training/enrollments/${enrollmentId}/cancel`, { method: 'POST' });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not withdraw.');
    } finally { setBusyId(null); }
  }

  if (loading) return <SectionLoading />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
      {showCreate && <CreateCourseDialog onClose={() => setShowCreate(false)} onCreated={load} />}

      <SectionCard title="Course catalogue" padded={false}>
        {canManage && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={() => setShowCreate(true)}><Icon name="plus" size={14} /> New course</Button>
          </div>
        )}
        {courses.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No courses in the catalogue yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {courses.map(c => {
              const enrolled = enrolledCourseIds.has(c.id);
              return (
                <div key={c.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.title}</span>
                      {c.is_certification && <Badge variant="brand">Certification</Badge>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                      {[c.category, c.provider, c.duration_hours ? `${c.duration_hours}h` : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <Button size="sm" variant={enrolled ? 'outline' : 'default'} disabled={enrolled || busyId === c.id} onClick={() => enroll(c.id)}>
                    {enrolled ? 'Enrolled' : busyId === c.id ? 'Enrolling…' : 'Enroll'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="My training">
        {myEnrollments.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>Not enrolled in anything yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myEnrollments.map(e => (
              <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{e.course_title}</span>
                  <Badge variant={STATUS_VARIANT[e.status] || 'gray'}>{prettyStatus(e.status)}</Badge>
                </div>
                {e.status === 'COMPLETED' && (
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                    Completed {fmtDate(e.completed_at)}{e.score ? ` · Score ${e.score}` : ''}
                    {e.certificate_expiry_date && ` · Certificate expires ${fmtDate(e.certificate_expiry_date)}`}
                  </div>
                )}
                {['ENROLLED', 'IN_PROGRESS'].includes(e.status) && (
                  <Button size="sm" variant="ghost" disabled={busyId === e.id} onClick={() => cancel(e.id)} style={{ marginTop: 6 }}>Withdraw</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ManageEnrollmentsTab() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [expiring, setExpiring] = useState<{ id: string; course_title: string; user_name: string; certificate_expiry_date: string; days_left: number; already_expired: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollFor, setEnrollFor] = useState<{ userId: string; courseId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, x, s, c] = await Promise.all([
        apiFetch('/v1/hr/training/enrollments').catch(() => []),
        apiFetch('/v1/hr/training/certifications/expiring').catch(() => []),
        apiFetch('/v1/hr/staff').catch(() => []),
        apiFetch('/v1/hr/training/courses').catch(() => []),
      ]);
      setEnrollments(Array.isArray(e) ? e : []);
      setExpiring(Array.isArray(x) ? x : []);
      setStaff(Array.isArray(s) ? s : []);
      setCourses(Array.isArray(c) ? c : []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function markOutcome(id: string, status: 'COMPLETED' | 'FAILED') {
    setBusyId(id);
    try {
      await apiFetch(`/v1/hr/training/enrollments/${id}/outcome`, { method: 'POST', body: JSON.stringify({ status }) });
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not record that outcome.');
    } finally { setBusyId(null); }
  }

  async function enrollSomeone() {
    if (!enrollFor) return;
    try {
      await apiFetch('/v1/hr/training/enrollments', { method: 'POST', body: JSON.stringify({ course_id: enrollFor.courseId, user_id: enrollFor.userId }) });
      setEnrollFor(null);
      await load();
    } catch (e: any) {
      showAlert(e?.message || 'Could not enroll them.');
    }
  }

  const staffOptions: ComboboxOption[] = staff.map(s => ({ value: s.id, label: s.name }));
  const courseOptions: ComboboxOption[] = courses.map(c => ({ value: c.id, label: c.title }));

  if (loading) return <SectionLoading />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {expiring.length > 0 && (
        <SectionCard title="Certifications expiring soon">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expiring.map(x => (
              <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: x.already_expired ? 'var(--red-l)' : 'var(--gold-l)', borderRadius: 'var(--r-sm)', padding: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}><strong>{x.user_name}</strong> · {x.course_title}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: x.already_expired ? 'var(--red)' : 'var(--gold)' }}>
                  {x.already_expired ? `Expired ${Math.abs(x.days_left)}d ago` : `Expires in ${x.days_left}d`}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Enroll someone">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <label style={lbl}>Employee</label>
            <Combobox options={staffOptions} value={enrollFor?.userId || ''} onChange={v => setEnrollFor(prev => ({ userId: v, courseId: prev?.courseId || '' }))} placeholder="Select staff…" searchPlaceholder="Search…" emptyText="No staff found" />
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={lbl}>Course</label>
            <Combobox options={courseOptions} value={enrollFor?.courseId || ''} onChange={v => setEnrollFor(prev => ({ userId: prev?.userId || '', courseId: v }))} placeholder="Select course…" emptyText="No courses yet" />
          </div>
          <Button disabled={!enrollFor?.userId || !enrollFor?.courseId} onClick={enrollSomeone}>Enroll</Button>
        </div>
      </SectionCard>

      <SectionCard title="All enrollments" padded={false}>
        {enrollments.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No enrollments yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Employee', 'Course', 'Status', 'Score', 'Certificate expiry', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === '' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => {
                  const busy = busyId === e.id;
                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid var(--border)', opacity: busy ? 0.6 : 1 }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink)' }}>{e.user_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{e.course_title}</td>
                      <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[e.status] || 'gray'}>{prettyStatus(e.status)}</Badge></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{e.score ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink2)' }}>{fmtDate(e.certificate_expiry_date)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {['ENROLLED', 'IN_PROGRESS'].includes(e.status) && (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => markOutcome(e.id, 'COMPLETED')}>Mark completed</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => markOutcome(e.id, 'FAILED')}>Mark failed</Button>
                          </div>
                        )}
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

export function Training() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'].includes(user?.role ?? '');
  const [tab, setTab] = useState<'catalogue' | 'manage'>('catalogue');

  return (
    <div>
      <PageHeader
        crumbs={['NexusHR', 'People']}
        titlePlain="Training &"
        titleEm="development"
        subtitle="A course catalogue employees can browse and enroll in, with certification expiry tracked for real."
        actions={canManage ? (
          <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} variant="segmented">
            <TabsList>
              <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
              <TabsTrigger value="manage">Manage</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : undefined}
      />
      {tab === 'manage' && canManage ? <ManageEnrollmentsTab /> : <CatalogueAndMyTraining canManage={canManage} />}
    </div>
  );
}
