import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Banner } from '../components/ui/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonLink } from '../components/PersonLink.js';
import { Button } from '../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker } from '../components/ui/date-picker.js';
import { fetchPeople, type Person } from '../lib/identity.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { MetricsRow } from '../components/MetricCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Badge } from '../components/ui/badge.js';

/**
 * Overtime — claiming it and deciding on it.
 *
 * The rate is not a field on this form. Whether a day was ordinary, a rest day
 * or a public holiday decides 1.5x against 2x, and the server derives it from
 * the tenant's calendar. Offering the choice here would mean somebody picking
 * it, and they would pick the cheaper one. The form shows what the server
 * decided once a date is entered, so the rate is visible without being
 * editable.
 */

interface OvertimeRow {
  id: string; user_id: string; date: string; hours: string;
  kind: 'NORMAL' | 'REST_DAY' | 'PUBLIC_HOLIDAY';
  rate_multiplier: string; reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decision_note: string | null; approved_at: string | null;
  paid_in_run_id: string | null;
  employee_name: string; approved_by_name: string | null;
}

const KIND_LABEL: Record<string, string> = {
  NORMAL: 'Working day', REST_DAY: 'Rest day', PUBLIC_HOLIDAY: 'Public holiday',
};

const STATUS_BADGE: Record<string, 'warning' | 'success' | 'error' | 'gray'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'gray',
};

export function OvertimePage() {
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [fPerson, setFPerson] = useState('');
  const [fDate, setFDate] = useState('');
  const [fHours, setFHours] = useState('');
  const [fReason, setFReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setRows(await apiFetch('/v1/hr/overtime') ?? []); }
    catch { setRows([]); setLoadError('Could not load overtime claims.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); fetchPeople({ limit: 200 }).then(setPeople); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fPerson || !fDate || !fHours) { setError('Employee, date and hours are all required.'); return; }
    try {
      const created = await apiFetch('/v1/hr/overtime', {
        method: 'POST',
        // No rate sent. The server derives it from the date.
        body: JSON.stringify({ user_id: fPerson, date: fDate, hours: Number(fHours), reason: fReason || null }),
      });
      setShowNew(false);
      setFPerson(''); setFDate(''); setFHours(''); setFReason('');
      setError(null);
      // Surfaced rather than swallowed: the rate was decided for them, and a
      // cap refusal is the most likely outcome of a large claim.
      if (created?.rate_explanation) {
        setNotice(`${created.hours} hour(s) claimed. ${created.rate_explanation} ${created.remaining_in_window} hour(s) remain in the four-week window.`);
      }
      load();
    } catch (err: any) {
      setError(err?.message ?? 'The claim could not be submitted.');
    }
  }

  const [notice, setNotice] = useState<string | null>(null);

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    setError(null);
    let note = '';
    if (status === 'REJECTED') {
      // Required by the API. Asking here beats a 400 the person cannot act on.
      note = window.prompt('Why is this being rejected? The person will see this.') ?? '';
      if (!note.trim()) return;
    }
    setBusy(id);
    try {
      await apiFetch(`/v1/hr/overtime/${id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status, decision_note: note || undefined }),
      });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'The decision could not be recorded.');
    } finally { setBusy(null); }
  }

  const shown = filter ? rows.filter(r => r.status === filter) : rows;
  const pending = rows.filter(r => r.status === 'PENDING');
  const approvedHours = rows.filter(r => r.status === 'APPROVED').reduce((t, r) => t + Number(r.hours), 0);
  const holidayHours = rows.filter(r => r.status === 'APPROVED' && r.kind !== 'NORMAL')
    .reduce((t, r) => t + Number(r.hours), 0);
  const columns: TableColumn<OvertimeRow>[] = [
    { key: 'employee', header: 'Employee', sortable: true, render: row => <PersonLink userId={row.user_id} name={row.employee_name} size={24} /> },
    { key: 'date', header: 'Date', accessor: 'date', sortable: true },
    { key: 'hours', header: 'Hours', align: 'right', render: row => Number(row.hours), sortable: true },
    { key: 'day', header: 'Day', render: row => <Badge variant={row.kind === 'NORMAL' ? 'gray' : 'info'}>{KIND_LABEL[row.kind] ?? row.kind}</Badge> },
    { key: 'rate', header: 'Rate', align: 'right', render: row => `${Number(row.rate_multiplier)}×` },
    { key: 'reason', header: 'Reason', render: row => <span>{row.reason ?? '—'}{row.status === 'REJECTED' && row.decision_note && <small style={{ display: 'block', color: 'var(--red)', marginTop: 2 }}>{row.decision_note}</small>}</span>, hideAt: 'sm' },
    { key: 'status', header: 'Status', render: row => <span><Badge variant={STATUS_BADGE[row.status]}>{row.status}</Badge>{row.paid_in_run_id && <small style={{ display: 'block', color: 'var(--ink3)', marginTop: 3 }}>Paid</small>}</span>, sortable: true },
    { key: 'decision', header: 'Decision', align: 'right', width: 190, render: row => row.status === 'PENDING' ? <span style={{ display: 'inline-flex', gap: 6 }}><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, 'APPROVED')}>Approve</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, 'REJECTED')}>Reject</Button></span> : <span style={{ color: 'var(--ink3)', fontSize: 12 }}>{row.approved_by_name ? `by ${row.approved_by_name}` : '—'}</span> },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['NexusHR', 'Overtime']}
        titlePlain="Overtime"
        titleEm="claims"
        subtitle="Hours worked beyond a shift, and the decision to pay for them."
        actions={<Button onClick={() => setShowNew(v => !v)}><Icon name="plus" size={14} /> New claim</Button>}
      />

      {notice && (
        <Banner variant="success" onDismiss={() => setNotice(null)}>{notice}</Banner>
      )}
      {error && (
        <div style={{ margin: '0 0 14px' }}><Banner variant="error">{error}</Banner></div>
      )}

      {showNew && (
        <div style={{ marginBottom: 16 }}>
        <SectionCard>
        <form onSubmit={submit} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Employee</label>
            <Select value={fPerson} onValueChange={setFPerson}>
              <SelectTrigger style={{ width: 200 }}><SelectValue placeholder="-- Select --" /></SelectTrigger>
              <SelectContent>
                {people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Date worked</label>
            {/* Local parts, not toISOString(): a date picked in a timezone ahead
                of UTC would otherwise submit as the previous day, and overtime
                would land on the wrong side of a public holiday. */}
            <DatePicker
              date={fDate ? new Date(fDate + 'T00:00:00') : undefined}
              onChange={(d) => {
                if (!d) { setFDate(''); return; }
                const p = (n: number) => String(n).padStart(2, '0');
                setFDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
              }}
              triggerClassName="w-auto"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Hours</label>
            <Input value={fHours} onChange={e => setFHours(e.target.value)} type="number" step="0.5" min="0.5" max="12" className="w-24" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason</label>
            <Input value={fReason} onChange={e => setFReason(e.target.value)} placeholder="Why was the extra time needed?" />
          </div>
          <Button type="submit">Submit</Button>
          <Button type="button" variant="outline" onClick={() => { setShowNew(false); setError(null); }}>Cancel</Button>
          {/* There is deliberately no rate field. */}
          <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--ink3)', paddingTop: 2 }}>
            The rate is worked out from the date — 1.5&times; on a working day, 2&times; on a rest day or public holiday.
          </div>
        </form>
        </SectionCard>
        </div>
      )}

      <MetricsRow cards={[
        { title: 'Awaiting a decision', value: String(pending.length), icon: 'clock', barHighlight: 'var(--gold)', loading, error: loadError ?? undefined, onRetry: load, emphasis: 'primary' },
        { title: 'Approved hours', value: String(Math.round(approvedHours * 10) / 10), icon: 'checkCircle', barHighlight: 'var(--green)', loading, error: loadError ?? undefined, onRetry: load },
        { title: 'At double time', value: String(Math.round(holidayHours * 10) / 10), icon: 'calendar', barHighlight: 'var(--blue)', loading, error: loadError ?? undefined, onRetry: load },
      ]} />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList style={{ marginBottom: 14, display: 'inline-flex' }}>
          {[['', 'All'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']].map(([v, l]) => (
            <TabsTrigger key={v || 'all'} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={shown}
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && !filter && rows.length === 0}
        emptyIcon="clock"
        emptyTitle="No overtime claims yet"
        emptyMessage="Submitted overtime claims will appear here for review."
        filteredEmpty={!loading && !loadError && !!filter && shown.length === 0}
        filteredEmptyMessage={`No ${filter.toLowerCase()} claims.`}
        defaultSortKey="date"
        defaultSortDir="desc"
      />
    </div>
  );
}
