import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';

/**
 * Performance — goals and review cycles.
 *
 * Both key on `users` — the staff record every other module uses. They used to
 * key on `hr_employments`, which holds no rows because nothing in the product
 * creates one, so the owner list was always empty and no goal could be created
 * for anybody. That, and not an unfinished feature, is why these tables sat at
 * zero.
 *
 * Progress is whatever the recorded check-ins say. A goal with no target has
 * no percentage and is shown as a raw count instead of a bar at 0%, and a
 * cycle nobody has been reviewed in says so instead of appearing underway.
 */

interface Goal {
  id: string; title: string; description: string | null; goal_type: string;
  target_value: number; current_value: number; unit: string; weight: number;
  due_date: string | null; status: string; owner_id: string; owner_name: string | null;
  progress_pct: number | null; checkin_count: number;
  last_checkin: null | { current_value: number; comment: string | null; at: string };
}
interface Cycle {
  id: string; name: string; type: string; start_date: string; end_date: string; status: string;
  instance_count: number; self_done: number; manager_done: number; final_done: number;
  average_final: number | null;
}
interface Instance {
  id: string; person_name: string | null; template_name: string | null; rating_scale: string | null;
  self_rating: number | null; manager_rating: number | null; final_rating: number | null;
  calibration_notes: string | null;
}
/** A member of staff who can own a goal or be reviewed. */
interface PersonOption { id: string; name: string; email?: string }

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card-bg, var(--white))', overflow: 'hidden',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink3)',
};

const GOAL_STATUS: Record<string, 'success' | 'warning' | 'error' | 'brand' | 'gray'> = {
  ACHIEVED: 'success', ACTIVE: 'brand', AT_RISK: 'warning', BEHIND: 'error',
  CANCELLED: 'gray', DRAFT: 'gray',
};

export function Performance() {
  const [tab, setTab] = useState<'goals' | 'reviews'>('goals');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pane, setPane] = useState<'none' | 'goal' | 'cycle'>('none');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [g, c, e] = await Promise.all([
        apiFetch('/v1/hr/goals'),
        apiFetch('/v1/hr/reviews/cycles'),
        // Real staff. This was /v1/hr/employments, which returns [].
        apiFetch('/v1/identity/people'),
      ]);
      setGoals(Array.isArray(g) ? g : []);
      setCycles(Array.isArray(c) ? c : []);
      setPeople(Array.isArray(e) ? e : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load performance data.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(what: string, fn: () => Promise<any>) {
    setBusy(what); setError('');
    try { await fn(); await load(); setPane('none'); }
    catch (err: any) { setError(err?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading performance…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['NexusHR', 'Performance']}
        titlePlain="Goals &"
        titleEm="reviews"
        subtitle="Goals people are working towards, and the cycles they are reviewed in."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {tab === 'goals'
              ? <button type="button" className="btn btn-primary btn-sm" disabled={people.length === 0} onClick={() => setPane(pane === 'goal' ? 'none' : 'goal')}>
                  <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Goal
                </button>
              : <button type="button" className="btn btn-primary btn-sm" onClick={() => setPane(pane === 'cycle' ? 'none' : 'cycle')}>
                  <Icon name="plus" size={13} color="hsl(var(--primary-foreground))" /> New Cycle
                </button>}
          </div>
        }
      />

      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--red-l)',
                      color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {/* Kept, but it now means what it says: no active staff at all, rather
          than "nobody has a contract" — which was true of everyone. */}
      {people.length === 0 && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 16, background: 'var(--gold-l)', borderColor: 'var(--gold-l)' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Icon name="alertTriangle" size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>No staff on file</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.55 }}>
                A goal belongs to somebody and a review is of somebody, so add staff before either.
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button type="button" variant={tab === 'goals' ? 'default' : 'outline'} onClick={() => { setTab('goals'); setPane('none'); }}>
          <Icon name="target" size={14} color={tab === 'goals' ? 'white' : undefined} /> Goals ({goals.length})
        </Button>
        <Button type="button" variant={tab === 'reviews' ? 'default' : 'outline'} onClick={() => { setTab('reviews'); setPane('none'); }}>
          <Icon name="star" size={14} color={tab === 'reviews' ? 'white' : undefined} /> Review cycles ({cycles.length})
        </Button>
      </div>

      {pane === 'goal' && (
        <GoalPane people={people} busy={busy}
          onCreate={d => act('goal', () => apiFetch('/v1/hr/goals', { method: 'POST', body: JSON.stringify(d) }))} />
      )}
      {pane === 'cycle' && (
        <CyclePane busy={busy}
          onCreate={d => act('cycle', () => apiFetch('/v1/hr/reviews/cycles', { method: 'POST', body: JSON.stringify(d) }))} />
      )}

      {tab === 'goals' ? <GoalList goals={goals} onChanged={load} /> : <CycleList cycles={cycles} />}
    </div>
  );
}

/* ══ Goals ═══════════════════════════════════════════════════════ */

function GoalList({ goals, onChanged }: { goals: Goal[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);

  if (goals.length === 0) {
    return (
      <div style={{ ...card, padding: 34, textAlign: 'center' }}>
        <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="target" size={20} /></FeaturedIcon>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>No goals have been set.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {goals.map(g => (
        <div key={g.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 15px' }}>
            <FeaturedIcon variant={g.status === 'ACHIEVED' ? 'success' : 'brand'} size="sm" shape="square">
              <Icon name="target" size={13} />
            </FeaturedIcon>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{g.title}</span>
                <Badge variant={GOAL_STATUS[g.status] ?? 'gray'}>{g.status.replace(/_/g, ' ').toLowerCase()}</Badge>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 3 }}>
                {/* owner_id is an employment; a goal whose employment was removed
                    has no name to show and says that rather than showing a uuid. */}
                {g.owner_name ?? 'owner no longer on file'}
                {g.due_date && <> · due {String(g.due_date).slice(0, 10)}</>}
                {g.checkin_count > 0
                  ? <> · {g.checkin_count} check-in{g.checkin_count === 1 ? '' : 's'}</>
                  : <> · never checked in</>}
              </div>
              {g.description && (
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 5, lineHeight: 1.5 }}>{g.description}</div>
              )}

              <div style={{ marginTop: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--ink2)' }}>
                    {/* "5 of 0 units" reads as a target of zero rather than as
                        no target at all. */}
                    {g.progress_pct !== null
                      ? `${g.current_value.toLocaleString()} of ${g.target_value.toLocaleString()} ${g.unit}`
                      : `${g.current_value.toLocaleString()} ${g.unit} recorded`}
                  </span>
                  {/* No target means no percentage. A bar at 0% would read as
                      "no progress" when the truth is "nothing to measure against". */}
                  <span style={{ color: 'var(--ink3)' }}>
                    {g.progress_pct !== null ? `${g.progress_pct}%` : 'no target set'}
                  </span>
                </div>
                {g.progress_pct !== null && (
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, g.progress_pct)}%`, height: '100%', borderRadius: 999,
                      background: g.progress_pct >= 100 ? 'var(--green)' : 'var(--teal)',
                    }} />
                  </div>
                )}
              </div>

              {g.last_checkin && (
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 7 }}>
                  Last check-in {g.last_checkin.current_value.toLocaleString()} {g.unit}
                  {g.last_checkin.comment && <> — “{g.last_checkin.comment}”</>}
                </div>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(open === g.id ? null : g.id)}>
              {open === g.id ? 'Cancel' : 'Check in'}
            </Button>
          </div>
          {open === g.id && (
            <CheckInForm goal={g} onDone={() => { setOpen(null); onChanged(); }} />
          )}
        </div>
      ))}
    </div>
  );
}

function CheckInForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [value, setValue] = useState(String(goal.current_value));
  const [status, setStatus] = useState(goal.status);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      await apiFetch(`/v1/hr/goals/${goal.id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ current_value: Number(value), status, comment: comment || null }),
      });
      onDone();
    } catch (e: any) { setErr(e?.message ?? 'Could not record that check-in.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: '13px 15px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 9 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Where it stands now ({goal.unit})</div>
          <Input value={value} onChange={e => setValue(e.target.value.replace(/[^\d.-]/g, ''))} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Status</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['ACTIVE', 'AT_RISK', 'BEHIND', 'ACHIEVED', 'CANCELLED'].map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ ...label, marginBottom: 4 }}>Comment <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
        <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="What changed since the last check-in?" />
      </div>
      <Button type="button" size="sm" style={{ marginTop: 11 }} disabled={value === '' || busy} onClick={save}>
        {busy ? 'Saving…' : 'Record check-in'}
      </Button>
    </div>
  );
}

function GoalPane({ people, busy, onCreate }: {
  people: PersonOption[]; busy: string; onCreate: (d: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('OKR_OBJECTIVE');
  const [unit, setUnit] = useState('%');
  const [target, setTarget] = useState('100');
  const [due, setDue] = useState<Date | undefined>(undefined);

  // Percent is the only unit with an implied scale; anything else needs a real
  // target, and the API refuses without one rather than assuming 100.
  const needsTarget = unit !== '%';
  const ready = title.trim() && owner && (!needsTarget || target !== '');

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 12 }}>New goal</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ ...label, marginBottom: 4 }}>What is the goal</div>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clear 40 containers this quarter" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Whose goal</div>
          <Combobox
            options={people.map(p => ({ value: p.id, label: p.name }))}
            value={owner} onChange={setOwner} placeholder="Choose a person…" emptyText="No person found." />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['OKR_OBJECTIVE', 'KPI', 'PERSONAL_DEVELOPMENT', 'PROJECT'].map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Measured in</div>
          <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="% / containers / shipments" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Target{needsTarget ? '' : ' (percent defaults to 100)'}</div>
          <Input value={target} onChange={e => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="40" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Due <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <DatePicker date={due} onChange={setDue} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ ...label, marginBottom: 4 }}>Detail <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      </div>
      {needsTarget && target === '' && (
        <div style={{ fontSize: 11.5, color: 'var(--gold)', marginTop: 9 }}>
          A goal measured in {unit} needs a target — there is no implied scale to measure progress against.
        </div>
      )}
      <Button type="button" style={{ marginTop: 12 }} disabled={!ready || !!busy}
        onClick={() => onCreate({
          title: title.trim(), owner_id: owner, description: description || null,
          goal_type: type, unit, target_value: target === '' ? undefined : Number(target),
          due_date: due ? toDateOnlyString(due) : null,
        })}>
        {busy === 'goal' ? 'Saving…' : 'Create goal'}
      </Button>
    </div>
  );
}

/* ══ Review cycles ═══════════════════════════════════════════════ */

function CycleList({ cycles }: { cycles: Cycle[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (cycles.length === 0) {
    return (
      <div style={{ ...card, padding: 34, textAlign: 'center' }}>
        <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="star" size={20} /></FeaturedIcon>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 10 }}>No review cycles yet.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cycles.map(c => (
        <div key={c.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', flexWrap: 'wrap' }}>
            <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="star" size={13} /></FeaturedIcon>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                {c.type.replace(/_/g, ' ').toLowerCase()} · {String(c.start_date).slice(0, 10)} to {String(c.end_date).slice(0, 10)}
              </div>
            </div>
            <Badge variant={c.status === 'CLOSED' ? 'gray' : c.status === 'ACTIVE' ? 'success' : 'brand'}>
              {c.status.toLowerCase()}
            </Badge>
            {c.instance_count > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>
                {open === c.id ? 'Hide' : 'See reviews'}
              </Button>
            )}
          </div>

          {/* A cycle with no reviews in it is a window nobody has been reviewed
              in. Showing 0/0 progress would read as a cycle underway. */}
          {c.instance_count === 0 ? (
            <div style={{ padding: '10px 15px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--gold)' }}>
              Nobody has been put into this cycle yet, so there is nothing to review.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, padding: '10px 15px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              {([
                ['People in it', c.instance_count],
                ['Self-rated', `${c.self_done} of ${c.instance_count}`],
                ['Manager-rated', `${c.manager_done} of ${c.instance_count}`],
                ['Finalised', `${c.final_done} of ${c.instance_count}`],
                // Averaged over the finalised ratings only — an unrated cycle
                // has no average, which is not the same as an average of zero.
                ['Average final', c.average_final !== null ? c.average_final : 'none finalised yet'],
              ] as const).map(([l, v]) => (
                <div key={l}>
                  <div style={label}>{l}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {open === c.id && <CycleInstances cycleId={c.id} />}
        </div>
      ))}
    </div>
  );
}

function CycleInstances({ cycleId }: { cycleId: string }) {
  const [rows, setRows] = useState<Instance[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/hr/reviews/cycles/${cycleId}/instances`)
      .then(d => { if (live) setRows(Array.isArray(d) ? d : []); })
      .catch(e => { if (live) { setErr(e?.message ?? 'Could not load the reviews.'); setRows([]); } });
    return () => { live = false; };
  }, [cycleId]);

  if (err) return <div style={{ padding: '11px 15px', borderTop: '1px solid var(--border)', color: 'var(--red)', fontSize: 12 }}>{err}</div>;
  if (rows === null) return <div style={{ padding: '11px 15px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>;

  return (
    <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {['Person', 'Template', 'Self', 'Manager', 'Final'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 15px', ...label }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 15px', color: 'var(--ink)' }}>{r.person_name ?? 'no longer on file'}</td>
              <td style={{ padding: '8px 15px', color: 'var(--ink3)' }}>{r.template_name ?? '—'}</td>
              {/* A rating that has not been given is not a zero. */}
              {[r.self_rating, r.manager_rating, r.final_rating].map((v, i) => (
                <td key={i} style={{ padding: '8px 15px' }}>
                  {/* Ratings come back from a numeric column as "4.00"; a
                      rating out of 5 reads as 4, not 4.00. */}
                  {v != null
                    ? <span style={{ color: 'var(--ink)', fontWeight: 650 }}>{Number(v)}{r.rating_scale ? ` / ${r.rating_scale}` : ''}</span>
                    : <span style={{ color: 'var(--ink3)' }}>not rated</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CyclePane({ busy, onCreate }: { busy: string; onCreate: (d: any) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ANNUAL');
  const [start, setStart] = useState<Date | undefined>(undefined);
  const [end, setEnd] = useState<Date | undefined>(undefined);
  const backwards = !!(start && end && end < start);

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 12 }}>New review cycle</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Name</div>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. H2 2026" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'PROBATION', 'AD_HOC'].map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Starts</div>
          <DatePicker date={start} onChange={setStart} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Ends</div>
          <DatePicker date={end} onChange={setEnd} />
        </div>
      </div>
      {backwards && (
        <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 9 }}>
          The cycle would end before it starts.
        </div>
      )}
      <Button type="button" style={{ marginTop: 12 }}
        disabled={!name.trim() || !start || !end || backwards || !!busy}
        onClick={() => onCreate({ name: name.trim(), type, start_date: toDateOnlyString(start!), end_date: toDateOnlyString(end!) })}>
        {busy === 'cycle' ? 'Saving…' : 'Create cycle'}
      </Button>
    </div>
  );
}
