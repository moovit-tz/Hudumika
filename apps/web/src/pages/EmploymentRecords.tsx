import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { COUNTRIES } from '@hudumika/types';

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
  personId: string | null; hrName: string | null;
  employment: null | {
    employment_id: string; status: string; employment_type: string; start_date: string;
    base_salary: string | null; currency: string | null; pay_frequency: string | null;
  };
}
interface UnlinkedPerson {
  person_id: string; first_name: string; last_name: string; personal_email: string | null;
  employment?: RosterRow['employment'];
}
interface LegalEntity { id: string; legal_name: string; country_code: string; currency: string; employment_count: number }

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

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, e] = await Promise.all([apiFetch('/v1/hr/roster'), apiFetch('/v1/hr/legal-entities')]);
      setRoster(r?.roster ?? []);
      setUnlinked(r?.unlinkedPeople ?? []);
      setSummary(r?.summary ?? null);
      setEntities(Array.isArray(e) ? e : []);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load employment records.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unlinkedLogins = useMemo(() => roster.filter(r => !r.personId), [roster]);
  const linkedNoEmployment = useMemo(() => roster.filter(r => r.personId && !r.employment), [roster]);

  async function act(what: string, fn: () => Promise<any>) {
    setBusy(what); setError('');
    try { await fn(); await load(); setPane('none'); }
    catch (err: any) { setError(err?.message ?? 'That did not work.'); }
    finally { setBusy(''); }
  }

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading employment records…</div>;

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>Employment Records</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 3 }}>
          Contracts, job titles and agreed pay — the record behind each login.
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--red-l)', border: '1px solid var(--red-l)',
                      color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
      )}

      {/* Counts of the real states, not a completion score. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['Logins', summary?.logins ?? 0, 'var(--ink)'],
          ['With an HR record', summary?.withHrRecord ?? 0, 'var(--ink)'],
          ['With a contract', summary?.withEmployment ?? 0, 'var(--ink)'],
          ['HR records, no login', summary?.hrRecordsWithoutLogin ?? 0,
            (summary?.hrRecordsWithoutLogin ?? 0) > 0 ? 'var(--gold)' : 'var(--ink)'],
        ].map(([l, v, colour]) => (
          <div key={String(l)} style={{ ...card, padding: '11px 14px' }}>
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
        <Button type="button" variant="outline" onClick={() => setPane(pane === 'person' ? 'none' : 'person')}>
          <Icon name="userPlus" size={14} /> New HR record
        </Button>
        <Button type="button" disabled={entities.length === 0} onClick={() => setPane(pane === 'employment' ? 'none' : 'employment')}>
          <Icon name="fileText" size={14} color="white" /> New contract
        </Button>
      </div>

      {pane === 'entity'     && <EntityPane entities={entities} busy={busy} onCreate={d => act('entity', () => apiFetch('/v1/hr/legal-entities', { method: 'POST', body: JSON.stringify(d) }))} />}
      {pane === 'person'     && <PersonPane busy={busy} onCreate={d => act('person', () => apiFetch('/v1/hr/people', { method: 'POST', body: JSON.stringify(d) }))} />}
      {pane === 'employment' && (
        <EmploymentPane
          entities={entities}
          people={[...unlinked.map(u => ({ id: u.person_id, label: `${u.first_name} ${u.last_name}` })),
                   ...roster.filter(r => r.personId && !r.employment).map(r => ({ id: r.personId!, label: r.hrName || r.name || r.email }))]}
          managers={roster.filter(r => r.employment).map(r => ({ id: r.employment!.employment_id, label: r.name || r.email }))}
          busy={busy}
          onCreate={d => act('employment', () => apiFetch('/v1/hr/employments', { method: 'POST', body: JSON.stringify(d) }))}
        />
      )}

      {/* Logins with no HR record — the gap the bridge exists to close. */}
      {unlinkedLogins.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ ...label, color: 'var(--ink)' }}>{unlinkedLogins.length} login{unlinkedLogins.length === 1 ? '' : 's'} with no HR record</span>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
              They can sign in and be assigned work, but have no contract, job title or agreed pay on file.
            </div>
          </div>
          {unlinkedLogins.map(u => (
            <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{u.name || u.email}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{u.email} · {u.role}</div>
              </div>
              {!u.active && <Badge variant="gray">inactive</Badge>}
              <LinkPersonControl
                people={unlinked}
                busy={busy === 'link-' + u.userId}
                onLink={pid => act('link-' + u.userId, () => apiFetch(`/v1/hr/people/${pid}/user`, { method: 'PATCH', body: JSON.stringify({ user_id: u.userId }) }))}
              />
            </div>
          ))}
        </div>
      )}

      {/* HR records with no login yet. Their contracts are real and were
          otherwise invisible: the roster iterates logins, so a contract for
          someone who has not been given an account appeared nowhere at all. */}
      {unlinked.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ ...label, color: 'var(--ink)' }}>{unlinked.length} HR record{unlinked.length === 1 ? '' : 's'} with no login</span>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
              On file and employable, but they cannot sign in or be assigned work yet.
            </div>
          </div>
          {unlinked.map(u => (
            <div key={u.person_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{u.first_name} {u.last_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{u.personal_email || 'no personal email on file'}</div>
              </div>
              {u.employment
                ? <>
                    <Badge variant="brand">{u.employment.employment_type.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>from {String(u.employment.start_date).slice(0, 10)}</span>
                    {u.employment.base_salary != null
                      ? <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 650 }}>{u.employment.currency} {Number(u.employment.base_salary).toLocaleString()}</span>
                      : <span style={{ fontSize: 12, color: 'var(--gold)' }}>pay not agreed</span>}
                  </>
                : <Badge variant="gray">no contract</Badge>}
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
                  {['Person', 'Role', 'HR record', 'Contract', 'Job started', 'Agreed pay'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 14px', ...label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map(r => (
                  <tr key={r.userId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name || r.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.email}</div>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink2)' }}>{r.role}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {r.personId ? <Badge variant="success">linked</Badge> : <Badge variant="gray">none</Badge>}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {r.employment
                        ? <Badge variant="brand">{r.employment.employment_type.replace(/_/g, ' ').toLowerCase()}</Badge>
                        : <span style={{ color: 'var(--ink3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--ink2)' }}>
                      {r.employment ? String(r.employment.start_date).slice(0, 10) : '—'}
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
                          ? <span style={{ color: 'var(--gold)' }}>not agreed</span>
                          : <span style={{ color: 'var(--ink3)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {linkedNoEmployment.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 10 }}>
          {linkedNoEmployment.length} {linkedNoEmployment.length === 1 ? 'person has' : 'people have'} an HR record but no contract yet.
        </div>
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

function PersonPane({ busy, onCreate }: { busy: string; onCreate: (d: any) => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 4 }}>New HR record</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
        A person record can exist before they have a login — a hire partway through onboarding.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <div><div style={{ ...label, marginBottom: 4 }}>First name</div><Input value={first} onChange={e => setFirst(e.target.value)} placeholder="Given name" /></div>
        <div><div style={{ ...label, marginBottom: 4 }}>Last name</div><Input value={last} onChange={e => setLast(e.target.value)} placeholder="Family name" /></div>
        <div><div style={{ ...label, marginBottom: 4 }}>Personal email <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></div>
      </div>
      <Button type="button" style={{ marginTop: 12 }} disabled={!first.trim() || !last.trim() || !!busy}
        onClick={() => onCreate({ first_name: first.trim(), last_name: last.trim(), personal_email: email || null })}>
        {busy === 'person' ? 'Saving…' : 'Create record'}
      </Button>
    </div>
  );
}

function EmploymentPane({ entities, people, managers, busy, onCreate }: {
  entities: LegalEntity[]; people: { id: string; label: string }[]; managers: { id: string; label: string }[];
  busy: string; onCreate: (d: any) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [entityId, setEntityId] = useState(entities[0]?.id ?? '');
  const [jobTitle, setJobTitle] = useState('');
  const [type, setType] = useState('FULL_TIME');
  const [start, setStart] = useState<Date | undefined>(new Date());
  const [salary, setSalary] = useState('');
  const [managerId, setManagerId] = useState('__none__');

  const ready = personId && entityId && jobTitle.trim() && start;

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ ...label, color: 'var(--ink)', marginBottom: 12 }}>New contract</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Person</div>
          <Combobox options={people.map(p => ({ value: p.id, label: p.label }))} value={personId} onChange={setPersonId}
            placeholder={people.length ? 'Choose a person…' : 'No HR records without a contract'} emptyText="No person found." />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Employing company</div>
          <Combobox options={entities.map(e => ({ value: e.id, label: e.legal_name }))} value={entityId} onChange={setEntityId} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Job title</div>
          {/* Required, never defaulted — a title nobody agreed to is
              indistinguishable afterwards from one they did. */}
          <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Clearing Officer" />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Employment type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'].map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Start date</div>
          <DatePicker date={start} onChange={setStart} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Manager <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <Combobox
            options={[{ value: '__none__', label: 'No manager' }, ...managers.map(m => ({ value: m.id, label: m.label }))]}
            value={managerId} onChange={setManagerId} />
        </div>
        <div>
          <div style={{ ...label, marginBottom: 4 }}>Base salary <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <Input value={salary} onChange={e => setSalary(e.target.value.replace(/[^\d.]/g, ''))} placeholder="leave blank if not agreed" />
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 9 }}>
        Leaving the salary blank records no pay agreement at all, rather than a salary of zero.
      </div>
      <Button type="button" style={{ marginTop: 12 }} disabled={!ready || !!busy}
        onClick={() => onCreate({
          person_id: personId, legal_entity_id: entityId, job_title: jobTitle.trim(),
          employment_type: type, start_date: toDateOnlyString(start!),
          manager_id: managerId === '__none__' ? null : managerId,
          ...(salary ? { base_salary: Number(salary), currency: entities.find(e => e.id === entityId)?.currency ?? 'TZS' } : {}),
        })}>
        {busy === 'employment' ? 'Saving…' : 'Create contract'}
      </Button>
    </div>
  );
}

function LinkPersonControl({ people, busy, onLink }: { people: UnlinkedPerson[]; busy: boolean; onLink: (personId: string) => void }) {
  const [pick, setPick] = useState('');
  if (people.length === 0) {
    return <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>no unlinked HR record to attach</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ minWidth: 190 }}>
        <Combobox
          options={people.map(p => ({ value: p.person_id, label: `${p.first_name} ${p.last_name}`, sublabel: p.personal_email ?? undefined }))}
          value={pick} onChange={setPick} placeholder="Link an HR record…" emptyText="None available." />
      </div>
      <Button type="button" size="sm" variant="outline" disabled={!pick || busy} onClick={() => onLink(pick)}>
        {busy ? 'Linking…' : 'Link'}
      </Button>
    </div>
  );
}
