import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker } from '../components/ui/date-picker.js';
import { fetchPeople, type Person } from '../lib/identity.js';

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

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PENDING:   { bg: 'var(--gold-l)',  fg: 'var(--gold)'  },
  APPROVED:  { bg: 'var(--green-l)', fg: 'var(--green)' },
  REJECTED:  { bg: 'var(--red-l)',   fg: 'var(--red)'   },
  CANCELLED: { bg: 'var(--bg)',      fg: 'var(--ink3)'  },
};

function Pill({ text, tone }: { text: string; tone?: { bg: string; fg: string } }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
      background: tone?.bg ?? 'var(--bg)', color: tone?.fg ?? 'var(--ink3)',
    }}>{text}</span>
  );
}

const cell: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--ink2)', verticalAlign: 'middle' };
const head: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
};

export function OvertimePage() {
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [fPerson, setFPerson] = useState('');
  const [fDate, setFDate] = useState('');
  const [fHours, setFHours] = useState('');
  const [fReason, setFReason] = useState('');

  const load = useCallback(async () => {
    try { setRows(await apiFetch('/v1/hr/overtime') ?? []); }
    catch { setRows([]); }
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
        <div style={{ margin: '0 0 14px', padding: '11px 14px', borderRadius: 8, fontSize: 13,
                      background: 'var(--green-l)', border: '1px solid var(--green)', color: 'var(--ink)' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ margin: '0 0 14px', padding: '11px 14px', borderRadius: 8, fontSize: 13,
                      background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--ink)' }}>
          {error}
        </div>
      )}

      {showNew && (
        <form onSubmit={submit} style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
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
            <input value={fHours} onChange={e => setFHours(e.target.value)} type="number" step="0.5" min="0.5" max="12"
              style={{ width: 90, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
                       fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Reason</label>
            <input value={fReason} onChange={e => setFReason(e.target.value)} placeholder="Why was the extra time needed?"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
                       fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <Button type="submit">Submit</Button>
          <Button type="button" variant="outline" onClick={() => { setShowNew(false); setError(null); }}>Cancel</Button>
          {/* There is deliberately no rate field. */}
          <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--ink3)', paddingTop: 2 }}>
            The rate is worked out from the date — 1.5&times; on a working day, 2&times; on a rest day or public holiday.
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Awaiting a decision', value: String(pending.length), tone: 'var(--gold)' },
          { label: 'Approved hours', value: String(Math.round(approvedHours * 10) / 10), tone: 'var(--green)' },
          { label: 'At double time', value: String(Math.round(holidayHours * 10) / 10), tone: 'var(--blue)' },
        ].map(m => (
          <div key={m.label} style={{
            background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '12px 16px', minWidth: 150, borderLeft: `3px solid ${m.tone}`,
          }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['', 'All'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']].map(([v, l]) => (
          <button key={v || 'all'} type="button" onClick={() => setFilter(v)} style={{
            padding: 'var(--ds-btn-py-sm) 14px', fontSize: 12, fontWeight: 600, border: 'none',
            borderRadius: 'var(--r)', cursor: 'pointer', fontFamily: 'var(--font)',
            minHeight: 'var(--ctl-h-sm)', lineHeight: 1.25,
            background: filter === v ? 'var(--teal)' : 'var(--bg)', color: filter === v ? '#fff' : 'var(--ink2)',
          }}>{l}</button>
        ))}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink3)' }}>
            {filter ? `No ${filter.toLowerCase()} claims.` : 'No overtime has been claimed yet.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>
                <th style={head}>Employee</th><th style={head}>Date</th>
                <th style={{ ...head, textAlign: 'right' }}>Hours</th>
                <th style={head}>Day</th><th style={{ ...head, textAlign: 'right' }}>Rate</th>
                <th style={head}>Reason</th><th style={head}>Status</th>
                <th style={{ ...head, textAlign: 'right' }}>Decision</th>
              </tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={cell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={r.user_id} name={r.employee_name} size={24} />
                        {r.employee_name}
                      </div>
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>{Number(r.hours)}</td>
                    <td style={cell}>
                      {/* The rate is a consequence of this, so they sit together. */}
                      <Pill text={KIND_LABEL[r.kind] ?? r.kind}
                            tone={r.kind === 'NORMAL' ? undefined : { bg: 'var(--blue-l)', fg: 'var(--blue)' }} />
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(r.rate_multiplier)}&times;
                    </td>
                    <td style={{ ...cell, maxWidth: 260 }}>
                      {r.reason ?? '—'}
                      {r.status === 'REJECTED' && r.decision_note && (
                        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{r.decision_note}</div>
                      )}
                    </td>
                    <td style={cell}>
                      <Pill text={r.status} tone={STATUS_TONE[r.status]} />
                      {r.paid_in_run_id && (
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>paid</div>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.status === 'PENDING' ? (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === r.id}
                                  onClick={() => decide(r.id, 'APPROVED')}>Approve</Button>{' '}
                          <Button size="sm" variant="outline" disabled={busy === r.id}
                                  onClick={() => decide(r.id, 'REJECTED')}>Reject</Button>
                        </>
                      ) : (
                        // Once paid it cannot be changed, so no control is offered
                        // rather than one that fails.
                        <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                          {r.approved_by_name ? `by ${r.approved_by_name}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
