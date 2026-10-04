import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    Promise.all([
      apiFetch(`/v1/hr/cases${qs}`),
      apiFetch('/v1/hr/staff'),
    ]).then(([c, s]) => {
      setCases(Array.isArray(c) ? c : []);
      setStaff(Array.isArray(s) ? s : (s?.data ?? []));
    }).catch(() => {
      setCases([]);
      setStaff([]);
      setLoadError('Could not load HR cases.');
    }).finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const columns: TableColumn<CaseRow>[] = [
    { key: 'employee', header: 'Employee', sortable: true, render: row => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PersonAvatar userId={row.employee_id} name={row.employee_name} size={26} />{row.employee_name}</span> },
    { key: 'type', header: 'Type', sortable: true, render: row => CASE_TYPE_LABEL[row.case_type] ?? row.case_type },
    { key: 'title', header: 'Title', accessor: 'title', sortable: true },
    { key: 'severity', header: 'Severity', sortable: true, render: row => <Badge variant={SEVERITY_VARIANT[row.severity]}>{row.severity}</Badge> },
    { key: 'status', header: 'Status', sortable: true, render: row => <Badge variant={STATUS_VARIANT[row.status]}>{row.status.replace('_', ' ')}</Badge> },
    { key: 'opened', header: 'Opened', sortable: true, render: row => new Date(row.created_at).toLocaleDateString() },
  ];

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

      <DataTable
        columns={columns}
        rows={cases}
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && !statusFilter && cases.length === 0}
        emptyIcon="briefcase"
        emptyTitle="No cases yet"
        emptyMessage="Warnings, grievances, and performance plans will appear here."
        filteredEmpty={!loading && !loadError && !!statusFilter && cases.length === 0}
        filteredEmptyMessage="No cases match this status."
        onRowClick={row => setOpenCaseId(row.id)}
        defaultSortKey="opened"
        defaultSortDir="desc"
      />

      {showNew && <NewCaseModal staff={staff} onClose={() => setShowNew(false)} onCreated={load} />}
      {openCaseId && <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} onChanged={load} />}
    </div>
  );
}

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
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-140 max-w-[94vw] max-h-[88vh] overflow-y-auto">
      <form onSubmit={submit}>
        <DialogHeader><DialogTitle>New case</DialogTitle></DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
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
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="w-140 max-w-[94vw] max-h-[88vh] overflow-y-auto">
        {loading || !item ? (
          <SectionLoading />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
            </DialogHeader>
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
                <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r)' }}>
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
      </DialogContent>
    </Dialog>
  );
}

export default CaseManagement;
