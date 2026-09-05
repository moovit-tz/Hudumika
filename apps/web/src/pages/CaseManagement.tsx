import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';

/**
 * Disciplinary / case management — confirmed entirely absent in the
 * platform-wide audit (no HR case tracking, PIPs, or grievance workflow
 * anywhere). MGMT_ROLES-only, matching the backend gate: this is HR/manager
 * working data about a person, not something the person themself browses.
 */

const CASE_TYPE_LABEL: Record<string, string> = {
  verbal_warning: 'Verbal warning', written_warning: 'Written warning', pip: 'Performance improvement plan',
  suspension: 'Suspension', termination: 'Termination', grievance: 'Grievance', other: 'Other',
};
const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'gray'> = {
  open: 'warning', in_progress: 'info', resolved: 'success', closed: 'gray',
};
const SEVERITY_VARIANT: Record<string, 'gray' | 'warning' | 'error'> = { low: 'gray', medium: 'warning', high: 'error' };

interface CaseRow {
  id: string; employee_id: string; employee_name: string; case_type: string; title: string;
  severity: string; status: string; created_at: string; opened_by_name: string | null;
}
interface Staff { id: string; name: string; email: string }

export function CaseManagement() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    Promise.all([
      apiFetch(`/v1/hr/cases${qs}`).catch(() => []),
      apiFetch('/v1/hr/staff').catch(() => []),
    ]).then(([c, s]) => {
      setCases(Array.isArray(c) ? c : []);
      setStaff(Array.isArray(s) ? s : (s?.data ?? []));
    }).finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        crumbs={['NexusHR', 'Cases']}
        titlePlain="Case"
        titleEm="management"
        subtitle="Warnings, PIPs, suspensions and grievances — visible to management only."
        actions={<Button onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> New case</Button>}
      />

      <div style={{ display: 'flex', gap: 10 }}>
        <SingleSelectFilter
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </div>

      <SectionCard padded={false}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>Loading cases…</div>
        ) : cases.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>No cases{statusFilter ? ' match this filter' : ' yet'}.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Employee', 'Type', 'Title', 'Severity', 'Status', 'Opened', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setOpenCaseId(c.id)}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={c.employee_id} name={c.employee_name} size={26} />
                        {c.employee_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{CASE_TYPE_LABEL[c.case_type] ?? c.case_type}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>{c.title}</td>
                    <td style={{ padding: '12px 14px' }}><Badge variant={SEVERITY_VARIANT[c.severity]}>{c.severity}</Badge></td>
                    <td style={{ padding: '12px 14px' }}><Badge variant={STATUS_VARIANT[c.status]}>{c.status.replace('_', ' ')}</Badge></td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ink3)' }}><Icon name="chevronRight" size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showNew && <NewCaseModal staff={staff} onClose={() => setShowNew(false)} onCreated={load} />}
      {openCaseId && <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} onChanged={load} />}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', borderRadius: 12, padding: 24, width: 560, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--elev-lg)' };

function NewCaseModal({ staff, onClose, onCreated }: { staff: Staff[]; onClose: () => void; onCreated: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [caseType, setCaseType] = useState('verbal_warning');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !title.trim()) { setError('Employee and title are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/hr/cases', {
        method: 'POST',
        body: JSON.stringify({ employee_id: employeeId, case_type: caseType, title: title.trim(), description: description.trim() || undefined, severity }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not create that case.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={cardStyle} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>New case</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Employee</label>
            <Combobox
              options={staff.map(s => ({ value: s.id, label: `${s.name} — ${s.email}` }))}
              value={employeeId} onChange={setEmployeeId} placeholder="Search staff…"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Case type</label>
            <Select value={caseType} onValueChange={setCaseType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CASE_TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Repeated late arrival" required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Severity</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger style={{ width: 160 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create case'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface CaseDetail {
  id: string; employee_id: string; employee_name: string; employee_email: string; case_type: string;
  title: string; description: string | null; severity: string; status: string; resolution: string | null;
  created_at: string; opened_by_name: string | null;
  notes: { id: string; note: string; created_at: string; author_name: string | null }[];
}

function CaseDetailModal({ caseId, onClose, onChanged }: { caseId: string; onClose: () => void; onChanged: () => void }) {
  const [item, setItem] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/hr/cases/${caseId}`).then((d: CaseDetail) => { setItem(d); setResolution(d.resolution ?? ''); }).finally(() => setLoading(false));
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  async function updateStatus(status: string) {
    setBusy(true);
    try {
      await apiFetch(`/v1/hr/cases/${caseId}`, { method: 'PATCH', body: JSON.stringify({ status, ...(status === 'resolved' ? { resolution: resolution.trim() || undefined } : {}) }) });
      load();
      onChanged();
    } catch (err: any) {
      showAlert(err.message || 'Could not update this case.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/hr/cases/${caseId}/notes`, { method: 'POST', body: JSON.stringify({ note: newNote.trim() }) });
      setNewNote('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not add that note.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {loading || !item ? (
          <SectionLoading />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{item.title}</div>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <PersonAvatar userId={item.employee_id} name={item.employee_name} size={22} />
              <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{item.employee_name}</span>
              <Badge variant={SEVERITY_VARIANT[item.severity]}>{item.severity}</Badge>
              <Badge variant={STATUS_VARIANT[item.status]}>{item.status.replace('_', ' ')}</Badge>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{CASE_TYPE_LABEL[item.case_type]} · opened by {item.opened_by_name ?? '—'}</span>
            </div>
            {item.description && <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 16, lineHeight: 1.5 }}>{item.description}</div>}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {['open', 'in_progress', 'resolved', 'closed'].filter(s => s !== item.status).map(s => (
                <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => updateStatus(s)}>Mark {s.replace('_', ' ')}</Button>
              ))}
            </div>

            {(item.status === 'resolved' || item.status === 'closed') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Resolution</label>
                <Textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2} placeholder="What happened, what was decided" />
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Timeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 220, overflowY: 'auto' }}>
              {item.notes.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No notes yet.</div>
              ) : item.notes.map(n => (
                <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{n.note}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{n.author_name ?? '—'} · {new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note…" style={{ flex: 1 }} />
              <Button size="sm" onClick={addNote} disabled={busy || !newNote.trim()}>Add</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CaseManagement;
