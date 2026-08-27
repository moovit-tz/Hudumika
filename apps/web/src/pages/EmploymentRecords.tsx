import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { COUNTRIES } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';

/**
 * Employment records — the contractual side of NexusHR.
 *
 * NexusHR has carried two person models: `users`, which everything visible
 * hangs off (attendance, leave, payroll), and `hr_people` -> `hr_employments`,
 * which the richer tables hang off (compensation, documents, goals, reviews).
 * Migration 172 joined them; this screen is where that join is made and seen.
 *
 * It shows the states that actually exist rather than implying everyone is set
 * up: a login with no HR record, an HR record with no login, an employment
 * with no salary agreed. None of those are errors — they are what onboarding
 * looks like midway through — so each is named instead of hidden or defaulted.
 */

interface RosterRow {
  userId: string; name: string | null; email: string; role: string; active: boolean;
  employment: null | {
    // All nullable, and they mean it: someone can have a salary on file with no
    // contract, in which case there is an employment block with a null type and
    // no dates. Declaring these non-null is what let `employment_type.replace()`
    // typecheck and then throw, blanking the whole page.
    employment_id: string | null; status: string; employment_type: string | null;
    start_date: string | null; end_date: string | null;
    base_salary: string | null; currency: string | null; pay_frequency: string | null;
    // A raise already agreed but not yet in force. Shown separately — it is
    // not what they earn today, and it is not nothing either.
    upcoming: null | { base_salary: string; currency: string; pay_frequency: string; effective_date: string };
  };
}
interface UnlinkedPerson {
  person_id: string; first_name: string; last_name: string; personal_email: string | null;
  employment?: RosterRow['employment'];
}
interface LegalEntity { id: string; legal_name: string; country_code: string; currency: string; employment_count: number }
interface CompRow {
  id: string; effective_date: string; end_date: string | null;
  base_salary: string | number; currency: string; pay_frequency: string;
}
interface PvcRow {
  userId: string; name: string | null; email: string; paid: number; status: string;
  contracted: number | null; currency?: string; variance: number | null; note: string | null;
}
interface PvcResult {
  period: { month: number; year: number };
  rows: PvcRow[];
  notPaidThisPeriod: { userId: string; contracted: number; currency: string }[];
  summary: {
    payrollRows: number; comparable: number; matching: number;
    differing: number; noContract: number; activeContractsUnpaid: number;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function money(v: number | string, currency?: string | null) {
  return `${currency ? currency + ' ' : ''}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card-bg, var(--white))', overflow: 'hidden',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink3)',
};

export function EmploymentRecords() {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedPerson[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pane, setPane] = useState<'none' | 'entity' | 'person' | 'employment'>('none');
  const [openComp, setOpenComp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, e] = await Promise.all([apiFetch('/v1/hr/roster'), apiFetch('/v1/hr/legal-entities')]);
      setRoster(r?.roster ?? []);
      setSummary(r?.summary ?? null);
      setEntities(Array.isArray(e) ? e : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load employment records.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // "No contract on file" is the one gap left worth naming. The old pair of
  // groups — logins without an HR record, HR records without a login — were
  // both about a second person model that no longer exists.
  const noContract = useMemo(() => roster.filter(r => !r.employment?.employment_id), [roster]);

  async function act(what: string, fn: () => Promise<any>) {
    setBusy(what); setError('');
    try { await fn(); await load(); setPane('none'); }
    catch (err: any) { setError(err?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading employment records…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['NexusHR', 'People']}
        titlePlain="Employment"
        titleEm="records"
        subtitle="Contracts, job titles and agreed pay — the record behind each login."
      />

      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--red-l)', border: '1px solid var(--red-l)',
                      color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {/* Counts of the real states, not a completion score. */}
      <div className="mc-row">
        {[
          // Two of these used to count the second person model and read 0
          // forever; a third read a summary key the API no longer sends, so it
          // showed 0 whatever the truth was. These are the states that exist now.
          ['People', summary?.logins ?? 0, 'var(--ink)'],
          ['With a contract', summary?.withContract ?? 0, 'var(--ink)'],
          ['With pay on file', summary?.withPay ?? 0, 'var(--ink)'],
          ['Nothing on file', summary?.withNeither ?? 0,
            (summary?.withNeither ?? 0) > 0 ? 'var(--gold)' : 'var(--ink)'],
        ].map(([l, v, colour]) => (
          <div key={String(l)} className="mc-card">
            <div style={label}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colour as string, marginTop: 3 }}>{v as number}</div>
          </div>
        ))}
      </div>

      {/* A legal entity must exist before any employment can: the FK is NOT NULL
          with RESTRICT. Say so rather than letting the create fail. */}
      {entities.length === 0 && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 16, background: 'var(--gold-l)', borderColor: 'var(--gold-l)' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Icon name="alertTriangle" size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>No employing company recorded yet</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.55 }}>
                Every contract belongs to a legal entity, so one has to exist before anyone can be employed.
              </div>
              <Button type="button" size="sm" style={{ marginTop: 10 }} onClick={() => setPane('entity')}>
                Add the employing company
              </Button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button type="button" variant="outline" onClick={() => setPane(pane === 'entity' ? 'none' : 'entity')}>
          <Icon name="building" size={14} /> Legal entities ({entities.length})
        </Button>
        <Button type="button" disabled={entities.length === 0} onClick={() => setPane(pane === 'employment' ? 'none' : 'employment')}>
          <Icon name="fileText" size={14} color="hsl(var(--primary-foreground))" /> New contract
        </Button>
      </div>

      {pane === 'entity'     && <EntityPane entities={entities} busy={busy} onCreate={d => act('entity', () => apiFetch('/v1/hr/legal-entities', { method: 'POST', body: JSON.stringify(d) }))} />}
      {pane === 'employment' && (
        <EmploymentPane
          entities={entities}
          people={noContract.map(r => ({ id: r.userId, label: r.name || r.email }))}
          managers={roster.filter(r => r.employment).map(r => ({ id: r.userId, label: r.name || r.email }))}
          busy={busy}
          onCreate={d => act('employment', () => apiFetch(`/v1/hr/staff/${d.user_id}/contracts`, {
            method: 'POST',
            body: JSON.stringify({
              contract_type: d.employment_type,
              start_date: d.start_date,
              end_date: d.end_date || null,
              reference: d.reference || null,
            }),
          }))}
        />
      )}

      {/* One gap now, not two. There is no second person model to reconcile
          against: a login IS the person, so the only question left is whether
          they have a contract on file. */}
      {noContract.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ ...label, color: 'var(--ink)' }}>{noContract.length} {noContract.length === 1 ? 'person has' : 'people have'} no contract on file</span>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
              They can sign in and be assigned work. Nothing records what they were engaged to do, or until when.
            </div>
          </div>
          {noContract.map(u => (
            <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{u.name || u.email}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{u.email} · {u.role}</div>
              </div>
              {!u.active && <Badge variant="gray">inactive</Badge>}
              {u.employment?.base_salary
                ? <span style={{ fontSize: 12, color: 'var(--ink3)' }}>pay on file, no contract</span>
                : <Badge variant="gray">nothing on file</Badge>}
            </div>
          ))}
        </div>
      )}

      {/* The roster itself */}
      <div style={card}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ ...label, color: 'var(--ink)' }}>Roster</span>
        </div>
        {roster.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="users" size={20} /></FeaturedIcon>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>No staff yet.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Person', 'Role', 'Status', 'Contract', 'Job started', 'Agreed pay', ''].map((h, i) => (
                    <th key={h || i} style={{ textAlign: 'left', padding: '8px 14px', ...label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map(r => (
                  <React.Fragment key={r.userId}>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={r.userId} name={r.name || r.email} size={26} />
                        <div>
                          <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name || r.email}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink2)' }}>{r.role}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {/* Was "HR record: linked / none", which described the
                          second person model. There is one record now, so the
                          useful thing to say is whether they still work here. */}
                      {r.active ? <Badge variant="success">active</Badge> : <Badge variant="gray">inactive</Badge>}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {r.employment?.employment_type
                        ? <Badge variant="brand">{r.employment.employment_type.replace(/_/g, ' ').toLowerCase()}</Badge>
                        : <span style={{ color: 'var(--ink3)' }}>none on file</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink2)' }}>
                      {r.employment?.start_date ? String(r.employment.start_date).slice(0, 10) : '—'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {/* Absent, not zero. A contract with no salary agreed yet
                          shows "not agreed" rather than a figure nobody set. */}
                      {r.employment?.base_salary != null
                        ? <span style={{ color: 'var(--ink)', fontWeight: 650 }}>
                            {r.employment.currency} {Number(r.employment.base_salary).toLocaleString()}
                            <span style={{ color: 'var(--ink3)', fontWeight: 400 }}> /{(r.employment.pay_frequency ?? '').toLowerCase()}</span>
                          </span>
                        : r.employment
                          ? <span style={{ color: 'var(--gold)' }}>
                              {r.employment.upcoming ? 'none in force today' : 'not agreed'}
                            </span>
                          : <span style={{ color: 'var(--ink3)' }}>—</span>}
                      {/* Agreed, dated, and not yet started. */}
                      {r.employment?.upcoming && (
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                          {money(r.employment.upcoming.base_salary, r.employment.upcoming.currency)} from{' '}
                          {String(r.employment.upcoming.effective_date).slice(0, 10)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {/* Pay history hangs off the person, not the contract, so
                          everyone has one — including the people who have a
                          salary on file and no contract yet. */}
                      <Button type="button" size="sm" variant="ghost"
                        onClick={() => setOpenComp(openComp === r.userId ? null : r.userId)}>
                        <Icon name={openComp === r.userId ? 'chevronUp' : 'chevronDown'} size={13} />
                        Pay history
                      </Button>
                    </td>
                  </tr>
                  {openComp === r.userId && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                        <CompensationPanel
                          userId={r.userId}
                          who={r.name || r.email}
                          defaultCurrency={r.employment?.currency ?? entities[0]?.currency ?? 'TZS'}
                          defaultFrequency={r.employment?.pay_frequency ?? 'MONTHLY'}
                          onChanged={load}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PayrollVsContractPanel roster={roster} />
    </div>
  );
}

/* ══ Compensation ════════════════════════════════════════════════ */

/**
 * Effective-dated pay history for one contract.
 *
 * Pay changes are recorded as a sequence rather than by overwriting a single
 * figure, so "what were they earning last March" stays answerable. The API
 * closes the previous open record the day before the new one starts; this
 * shows that boundary rather than hiding it, and says plainly when a contract
 * has no agreed pay at all instead of showing zero.
 */
function CompensationPanel({ userId, who, defaultCurrency, defaultFrequency, onChanged }: {
  userId: string; who: string; defaultCurrency: string; defaultFrequency: string; onChanged: () => void;
}) {
  const [rows, setRows] = useState<CompRow[] | null>(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [salary, setSalary] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [frequency, setFrequency] = useState(defaultFrequency);
  const [effective, setEffective] = useState<Date | undefined>(new Date());

  const load = useCallback(async () => {
    setErr('');
    try { setRows(await apiFetch(`/v1/hr/employments/${userId}/compensation`)); }
    catch (e: any) { setErr(e?.message ?? 'Could not load pay history.'); setRows([]); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!salary || !effective) return;
    setSaving(true); setErr('');
    try {
      await apiFetch(`/v1/hr/employments/${userId}/compensation`, {
        method: 'POST',
        body: JSON.stringify({
          base_salary: Number(salary), currency, pay_frequency: frequency,
          effective_date: toDateOnlyString(effective),
        }),
      });
      setSalary(''); setAdding(false);
      await load();
      onChanged();          // the roster's "agreed pay" column reads the current record
    } catch (e: any) {
      setErr(e?.message ?? 'Could not record that pay change.');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FeaturedIcon variant="brand" size="sm" shape="circle"><Icon name="wallet" size={13} /></FeaturedIcon>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Pay history — {who}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Each row is what was agreed from a date until the next change.</div>
        </div>
        <Button type="button" size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding(a => !a)}>
          {adding ? 'Cancel' : <><Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> Record a pay change</>}
        </Button>
      </div>

      {err && (
        <div style={{ padding: '8px 11px', borderRadius: 8, background: 'var(--red-l)',
                      color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{err}</div>
      )}

      {adding && (
        <div style={{ ...card, padding: 13, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            <div>
              <div style={{ ...label, marginBottom: 4 }}>Base salary</div>
              <Input value={salary} onChange={e => setSalary(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
            </div>
            <div>
              <div style={{ ...label, marginBottom: 4 }}>Currency</div>
              <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} />
            </div>
            <div>
              <div style={{ ...label, marginBottom: 4 }}>Paid</div>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['MONTHLY', 'ANNUAL', 'WEEKLY', 'DAILY', 'HOURLY'].map(f => (
                    <SelectItem key={f} value={f}>{f.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div style={{ ...label, marginBottom: 4 }}>Effective from</div>
              <DatePicker date={effective} onChange={setEffective} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 9, lineHeight: 1.5 }}>
            The record currently in force will be closed the day before this date. Backdating is allowed — it rewrites
            what the history says was agreed, not what was actually paid, which stays in the payroll runs.
          </div>
          <Button type="button" size="sm" style={{ marginTop: 11 }} disabled={!salary || !effective || saving} onClick={save}>
            {saving ? 'Saving…' : 'Record pay change'}
          </Button>
        </div>
      )}

      {rows === null ? (
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading pay history…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--gold)' }}>
          No pay has been agreed on this contract yet — nothing to show, and payroll has nothing to check against.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{['From', 'Until', 'Amount', 'Paid', ''].map((h, i) => (
              <th key={h || i} style={{ textAlign: 'left', padding: '6px 10px', ...label }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 10px', color: 'var(--ink2)' }}>{String(c.effective_date).slice(0, 10)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--ink3)' }}>
                  {c.end_date ? String(c.end_date).slice(0, 10) : 'still in force'}
                </td>
                <td style={{ padding: '7px 10px', color: 'var(--ink)', fontWeight: 650 }}>{money(c.base_salary, c.currency)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--ink2)' }}>{String(c.pay_frequency).toLowerCase()}</td>
                <td style={{ padding: '7px 10px' }}>
                  {!c.end_date && <Badge variant="success">current</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * What was paid against what the contract says.
 *
 * The two figures live in different families — payroll on `users`, pay
 * agreements on `hr_employments` — and could disagree indefinitely with
 * nothing able to notice until migration 172 joined them.
 *
 * Where the comparison genuinely cannot be made the API says so per row, and
 * this renders that sentence rather than a variance of zero: a person with no
 * contract on file and a person paid exactly right must not look the same.
 */
function PayrollVsContractPanel({ roster }: { roster: RosterRow[] }) {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<PvcResult | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const nameOf = useCallback((userId: string) => {
    const r = roster.find(x => x.userId === userId);
    return r ? (r.name || r.email) : userId;
  }, [roster]);

  useEffect(() => {
    let live = true;
    setLoading(true); setErr('');
    apiFetch(`/v1/hr/payroll-vs-contract?month=${month}&year=${year}`)
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) { setErr(e?.message ?? 'Could not run the comparison.'); setData(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [month, year]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2].map(String);
  }, []);

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="scale" size={13} /></FeaturedIcon>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Paid vs contracted</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>What payroll actually paid, against what the contract says.</div>
        </div>
        <div style={{ minWidth: 130 }}>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div style={{ minWidth: 95 }}>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {err && (
        <div style={{ padding: '11px 14px', color: 'var(--red)', fontSize: 12.5, background: 'var(--red-l)' }}>{err}</div>
      )}

      {loading && <div style={{ padding: '16px 14px', fontSize: 12.5, color: 'var(--ink3)' }}>Comparing…</div>}

      {!loading && !err && data && (
        data.rows.length === 0 && data.notPaidThisPeriod.length === 0 ? (
          <div style={{ padding: '22px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
              No payroll was run for {MONTHS[month - 1]} {year}, and no active contract covers that period.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              {([
                ['Payslips', data.summary.payrollRows, 'var(--ink)'],
                ['Match the contract', data.summary.matching, 'var(--green)'],
                ['Differ', data.summary.differing, data.summary.differing > 0 ? 'var(--gold)' : 'var(--ink)'],
                ['Not comparable', data.summary.noContract, data.summary.noContract > 0 ? 'var(--ink2)' : 'var(--ink)'],
                ['Contracted, unpaid', data.summary.activeContractsUnpaid,
                  data.summary.activeContractsUnpaid > 0 ? 'var(--red)' : 'var(--ink)'],
              ] as const).map(([l, v, colour]) => (
                <div key={l}>
                  <div style={label}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 750, color: colour, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {data.rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Person', 'Payslip', 'Paid', 'Contract says', 'Difference'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 14px', ...label }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={r.userId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PersonAvatar userId={r.userId} name={r.name || r.email} size={26} />
                            <div>
                              <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name || r.email}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <Badge variant={r.status === 'PAID' ? 'success' : 'gray'}>{String(r.status).toLowerCase()}</Badge>
                        </td>
                        <td style={{ padding: '9px 14px', color: 'var(--ink)' }}>{money(r.paid, r.currency)}</td>
                        {/* The API's own sentence, verbatim. A row it cannot
                            compare is not a row that matched. */}
                        {r.note ? (
                          <td colSpan={2} style={{ padding: '9px 14px', color: 'var(--ink3)', fontStyle: 'italic' }}>{r.note}</td>
                        ) : (
                          <>
                            <td style={{ padding: '9px 14px', color: 'var(--ink2)' }}>{money(r.contracted!, r.currency)}</td>
                            <td style={{ padding: '9px 14px' }}>
                              {r.variance === 0
                                ? <Badge variant="success">exact match</Badge>
                                : <span style={{ color: r.variance! < 0 ? 'var(--red)' : 'var(--gold)', fontWeight: 650 }}>
                                    {r.variance! > 0 ? '+' : ''}{Number(r.variance).toLocaleString()}
                                  </span>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Active contracts nobody was paid against — invisible in a
                payroll-only view, because there is no payslip to list. */}
            {data.notPaidThisPeriod.length > 0 && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--red-l)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {data.notPaidThisPeriod.length} active contract{data.notPaidThisPeriod.length === 1 ? '' : 's'} with no payslip
                  for {MONTHS[month - 1]} {year}
                </div>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.notPaidThisPeriod.map(u => (
                    <div key={u.userId} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                      <span style={{ flex: 1, color: 'var(--ink)' }}>{nameOf(u.userId)}</span>
                      <span style={{ color: 'var(--ink2)' }}>contracted {money(u.contracted, u.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

/* ══ Panes ═══════════════════════════════════════════════════════ */

function EntityPane({ entities, busy, onCreate }: { entities: LegalEntity[]; busy: string; onCreate: (d: any) => void }) {
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('TZ');
  const [currency, setCurrency] = useState('TZS');
  const [taxId, setTaxId] = useState('');

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 10 }}>Employing companies</div>
      {entities.map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1, color: 'var(--ink)' }}>{e.legal_name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{e.country_code} · {e.currency}</span>
          <Badge variant={e.employment_count > 0 ? 'brand' : 'gray'}>{e.employment_count} employed</Badge>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 14 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Legal name</div>
          <Input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="e.g. Moovit Mobility Limited" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Country</div>
          <Combobox options={COUNTRIES.map(c => ({ value: c.code, label: c.name }))} value={country} onChange={setCountry} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Currency</div>
          <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="TZS" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Tax ID <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <Input value={taxId} onChange={e => setTaxId(e.target.value)} />
        </div>
      </div>
      <Button type="button" style={{ marginTop: 12 }} disabled={!legalName.trim() || !!busy}
        onClick={() => onCreate({ legal_name: legalName.trim(), country_code: country, currency, tax_id: taxId || null })}>
        {busy === 'entity' ? 'Saving…' : 'Add company'}
      </Button>
    </div>
  );
}

function EmploymentPane({ entities, people, managers, busy, onCreate }: {
  entities: LegalEntity[]; people: { id: string; label: string }[]; managers: { id: string; label: string }[];
  busy: string; onCreate: (d: any) => void;
}) {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('FIXED_TERM');
  const [start, setStart] = useState<Date | undefined>(new Date());
  const [end, setEnd] = useState<Date | undefined>(undefined);
  const [reference, setReference] = useState('');

  // A permanent contract is the only one with no end date, so the field goes
  // away rather than sitting there inviting a value the API will refuse.
  const openEnded = type === 'PERMANENT';
  const ready = !!userId && !!start && (openEnded || !!end);

  return (
    <div style={{ ...card, marginBottom: 16, padding: 14 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 10 }}>New contract</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Person</div>
          <Combobox options={people.map(p => ({ value: p.id, label: p.label }))} value={userId} onChange={setUserId}
            placeholder={people.length ? 'Choose a person…' : 'Everyone already has a contract'} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['PERMANENT', 'FIXED_TERM', 'PROBATION', 'CASUAL', 'INTERNSHIP'].map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Starts</div>
          <DatePicker date={start} onChange={setStart} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>
            Ends {openEnded && <span style={{ color: 'var(--ink4)' }}>— permanent, so none</span>}
          </div>
          {!openEnded && <DatePicker date={end} onChange={setEnd} />}
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>Reference</div>
          <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="optional" />
        </div>
      </div>
      {/* Job title, manager and pay are not on the contract: the first two live
          on the profile and pay is effective-dated in its own history, which a
          single figure typed here would silently contradict. */}
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8 }}>
        Job title and reporting line live on the profile. Pay is recorded separately, so it can change without rewriting the contract.
      </div>
      <Button
        type="button"
        disabled={!ready || busy === 'employment'}
        style={{ marginTop: 12 }}
        onClick={() => onCreate({
          user_id: userId,
          employment_type: type,
          start_date: toDateOnlyString(start!),
          end_date: openEnded ? null : (end ? toDateOnlyString(end) : null),
          reference: reference.trim() || null,
        })}>
        {busy === 'employment' ? 'Saving…' : 'Create contract'}
      </Button>
    </div>
  );
}
