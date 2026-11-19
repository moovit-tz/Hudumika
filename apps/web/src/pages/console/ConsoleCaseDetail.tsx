import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import { LoadState, fmtDate, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { Empty, Facts, Notice, Panel, Pill, appName } from './console-ui.js';

function Choice({ label, value, options, onChange, disabled }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="console-field">{label}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

const EVENT_LABEL: Record<string, string> = {
  routed: 'Routed', rerouted: 'Routing re-run', claimed: 'Claimed', assigned: 'Assigned', updated: 'Updated',
  first_response: 'First reply to customer', replied: 'Replied to customer', internal_note: 'Internal note added',
  lens_linked: 'Linked to Lens', incident_linked: 'Linked to an incident', incident_unlinked: 'Removed from an incident',
  outcome_confirmed: 'Customer outcome confirmed', outcome_not_resolved: 'Customer said not resolved',
};

export function ConsoleCaseDetail() {
  const { id } = useParams();
  const { me } = useStaff();
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/cases/${id}`);
  const staff = useStaffData<any>(hasPerm(me, 'cases.assign') && hasPerm(me, 'staff.view') ? '/v1/staff/staff' : null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [lensId, setLensId] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = data?.case;

  const act = async (key: string, label: string, fn: () => Promise<unknown>) => {
    setMsg(null); setBusy(key);
    try { await fn(); setMsg({ ok: true, text: label }); await reload(); return true; }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'That did not work.' }); await reload(); return false; }
    finally { setBusy(null); }
  };
  const patch = (body: Record<string, unknown>) => act('patch', 'Saved.', () => apiFetch(`/v1/staff/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ version: c.version, ...body }) }));
  const open = c && (c.status === 'OPEN' || c.status === 'IN_PROGRESS');

  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {c && <div className="console-page">
        <PageHeader crumbs={['Console', 'Cases', c.ref_number]} titlePlain={c.subject}
          subtitle={<span className="console-row">
            <CompanyAvatar name={data.customer?.name ?? 'Customer'} logoUrl={data.customer?.logo_url} size={20} />
            <Link to={`/console/customers/${c.tenant_id}`} style={{ color: 'var(--ink2)', fontWeight: 600 }}>{data.customer?.name}</Link>
            {c.app && <><span aria-hidden>·</span><Link to={`/console/products/${c.app}`} style={{ color: 'var(--ink2)' }}>{appName(c.app)}</Link></>}
            <span aria-hidden>·</span><span>opened {fmtDate(c.created_at)}</span>
          </span>}
          actions={<div className="console-row">
            {data.allowed.claim && <Button loading={busy === 'claim'} onClick={() => act('claim', 'You own this case now.', () => apiFetch(`/v1/staff/cases/${id}/claim`, { method: 'POST', body: JSON.stringify({ version: c.version }) }))}>Claim case</Button>}
            {hasPerm(me, 'access.request') && <Button asChild variant="outline"><Link to={`/console/access/new?tenant=${c.tenant_id}&case=${c.id}${c.app ? `&app=${c.app}` : ''}`}>Request customer access</Link></Button>}
          </div>} />

        <div className="console-row" style={{ gap: 8 }}>
          <Pill kind="status" value={c.status} /><Pill kind="priority" value={c.priority} /><Pill kind="severity" value={c.severity} />
          {c.sla.paused ? <Pill kind="sla" value="paused" /> : (c.sla.resolutionBreached || c.sla.firstResponseBreached) ? <Pill kind="sla" value="breached" /> : open ? <Pill kind="sla" value="on_track" /> : null}
          {!open && <Pill kind="outcome" value={c.customer_outcome} />}
          {c.escalated && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 'var(--text-sm, 12px)' }}>Escalated</span>}
        </div>
        <Notice msg={msg} />

        <div className="console-main-side">
          {/* ── Main column: the conversation and the outcome ── */}
          <div className="console-page">
            <Panel title="Conversation" sub={`${data.messages.length} message${data.messages.length === 1 ? '' : 's'} · internal notes are never shown to the customer`} icon="messageSquare">
              <div className="console-thread">
                {data.messages.length ? data.messages.map((m: any) => (
                  <article key={m.id} className={`console-msg ${m.visibility === 'internal' ? 'console-msg-internal' : m.is_platform_staff ? 'console-msg-staff' : ''}`}>
                    <div className="console-msg-head">
                      <PersonAvatar userId={m.author_id} name={m.author_name} src={m.author_avatar_url} size={24} />
                      <strong style={{ color: 'var(--ink)' }}>{m.author_name}</strong>
                      <span className="console-muted">{m.visibility === 'internal' ? 'Internal note' : m.is_platform_staff ? 'Reply to customer' : 'Customer'} · {fmtDate(m.created_at)}</span>
                    </div>
                    <div className="console-msg-body">{m.content}</div>
                  </article>
                )) : <Empty icon="messageSquare" title="No messages yet" />}
              </div>
              {(data.allowed.reply || data.allowed.notes) && (
                <form className="console-stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}
                  onSubmit={async e => { e.preventDefault(); const path = mode === 'reply' ? 'reply' : 'notes'; if (await act('send', mode === 'reply' ? 'Reply sent to the customer.' : 'Note added.', () => apiFetch(`/v1/staff/cases/${id}/${path}`, { method: 'POST', body: JSON.stringify({ content: text }) }))) setText(''); }}>
                  {data.allowed.reply && data.allowed.notes && (
                    <Tabs value={mode} onValueChange={v => setMode(v as any)}>
                      <TabsList aria-label="Message type">
                        <TabsTrigger value="reply"><span className="ds-tabs-trigger-label">Reply to customer</span></TabsTrigger>
                        <TabsTrigger value="note"><span className="ds-tabs-trigger-label">Internal note</span></TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                  <Textarea aria-label={mode === 'reply' ? 'Reply' : 'Internal note'} value={text} onChange={e => setText(e.target.value)} rows={4}
                    placeholder={mode === 'reply' ? 'Write a reply — the customer will see this.' : 'Write a note — only staff with internal-note access see this.'} />
                  <div className="console-row" style={{ justifyContent: 'flex-end' }}>
                    <Button type="submit" disabled={!text.trim()} loading={busy === 'send'}>{mode === 'reply' ? 'Send reply' : 'Add note'}</Button>
                  </div>
                </form>
              )}
            </Panel>

            {data.allowed.verify && (
              <Panel title="Customer outcome" sub="Record what the customer actually confirmed. This is never set automatically — not even when Lens marks a fix done." icon="checkCircle">
                <Textarea aria-label="Outcome note" rows={2} value={outcomeNote} onChange={e => setOutcomeNote(e.target.value)} placeholder="How the customer confirmed (call, email, in-app reply)…" />
                <div className="console-row">
                  <Button disabled={outcomeNote.trim().length < 3} loading={busy === 'ok'} onClick={() => act('ok', 'Outcome recorded.', () => apiFetch(`/v1/staff/cases/${id}/outcome`, { method: 'POST', body: JSON.stringify({ outcome: 'confirmed', note: outcomeNote }) }))}>Customer confirmed</Button>
                  <Button variant="outline" disabled={outcomeNote.trim().length < 3} loading={busy === 'no'} onClick={() => act('no', 'Reopened — the customer still has the problem.', () => apiFetch(`/v1/staff/cases/${id}/outcome`, { method: 'POST', body: JSON.stringify({ outcome: 'not_resolved', note: outcomeNote }) }))}>Not resolved for them</Button>
                </div>
              </Panel>
            )}
          </div>

          {/* ── Side column: details, ownership, engineering, history ── */}
          <div className="console-page">
            <Panel title="Details" icon="fileText">
              <Facts items={[
                ['Owner', data.owner ? <><PersonAvatar userId={data.owner.id} name={data.owner.name} src={data.owner.avatar_url} size={22} />{data.owner.name}</> : <span style={{ color: 'var(--ink3)' }}>Unassigned</span>],
                ['Team', data.team?.name ?? '—'],
                ['First response', c.first_response_at ? <>{fmtDate(c.first_response_at)}{c.sla.firstResponseBreached ? <Pill kind="sla" value="breached" /> : null}</> : `Due ${fmtRel(c.first_response_due_at)}`],
                ['Resolution', c.resolved_at ? fmtDate(c.resolved_at) : c.sla.paused ? `Paused — waiting on customer since ${fmtRel(c.sla_paused_at)}` : <>Due {fmtRel(c.resolution_due_at)}{c.sla.resolutionBreached ? <Pill kind="sla" value="breached" /> : null}</>],
              ]} />
              <div className="console-muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><strong style={{ color: 'var(--ink2)' }}>Why it was routed here: </strong>{c.routing_reason ?? '—'}</div>
              {data.allowed.update && (
                <div className="console-fields" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <Choice label="Status" value={c.status} options={[['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['RESOLVED', 'Resolved'], ['CLOSED', 'Closed']]} onChange={v => patch({ status: v })} />
                  <Choice label="Priority" value={c.priority} options={[['URGENT', 'Urgent'], ['HIGH', 'High'], ['NORMAL', 'Normal'], ['LOW', 'Low']]} onChange={v => patch({ priority: v })} />
                  <Choice label="Severity" value={c.severity} options={[['S1', 'S1 · Critical'], ['S2', 'S2 · Major'], ['S3', 'S3 · Minor'], ['S4', 'S4 · Low']]} onChange={v => patch({ severity: v })} />
                  <Choice label="Waiting on" value={c.waiting_on ?? 'none'} options={[['none', 'Us'], ['customer', 'Customer (pauses SLA)'], ['engineering', 'Engineering'], ['third_party', 'Third party']]} onChange={v => patch({ waiting_on: v === 'none' ? null : v })} />
                </div>
              )}
              {data.allowed.update && <div><Button variant="outline" size="sm" onClick={() => patch({ escalated: !c.escalated })}>{c.escalated ? 'Remove escalation' : 'Escalate'}</Button></div>}
            </Panel>

            {data.allowed.assign && (
              <Panel title="Assign or hand off" sub="The change and its reason go into the case history" icon="users">
                <form className="console-stack" onSubmit={e => { e.preventDefault(); act('assign', 'Reassigned.', () => apiFetch(`/v1/staff/cases/${id}/assign`, { method: 'POST', body: JSON.stringify({ owner_user_id: assignTo === 'none' || !assignTo ? null : assignTo, version: c.version, reason }) })).then(ok => ok && setReason('')); }}>
                  <Choice label="New owner" value={assignTo || 'none'} options={[['none', 'Unassigned (team queue)'], ...((staff.data?.items ?? []).filter((s: any) => s.status === 'active').map((s: any) => [s.user_id, `${s.name} · ${s.open_cases} open`] as [string, string]))]} onChange={setAssignTo} />
                  <label className="console-field">Reason<Input required minLength={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Covering while Amani is on leave" /></label>
                  <div className="console-row">
                    <Button type="submit" size="sm" loading={busy === 'assign'}>Reassign</Button>
                    <Button size="sm" variant="outline" type="button" loading={busy === 'route'} onClick={() => act('route', 'Routing applied.', () => apiFetch(`/v1/staff/cases/${id}/route`, { method: 'POST', body: JSON.stringify({ apply: true, version: c.version }) }))}>Re-run routing</Button>
                  </div>
                </form>
              </Panel>
            )}

            <Panel title="Engineering" sub="Lens issues have their own lifecycle — a fix does not close this case" icon="activity">
              {data.lens?.restricted ? <span className="console-muted">Engineering issues are not visible with your access.</span> : (
                <>
                  {data.lens.length ? (
                    <ul className="console-list" style={{ margin: '-4px -20px' }}>
                      {data.lens.map((l: any) => (
                        <li key={l.id}>
                          <div className="console-list-main"><div className="console-list-title"><span className="console-mono">{l.ref}</span> {l.title}</div><div className="console-list-meta">Fix {String(l.verification_status).toLowerCase().replace(/_/g, ' ')}</div></div>
                          <span style={{ fontWeight: 700, fontSize: 'var(--text-xs, 11px)', color: l.status === 'DONE' ? 'var(--green)' : 'var(--blue)' }}>{String(l.status).replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <span className="console-muted">No linked engineering issue.</span>}
                  {data.allowed.link && !data.lens.length && <div><Button size="sm" variant="outline" loading={busy === 'lens'} onClick={() => act('lens', 'Sent to Lens as a new bug.', () => apiFetch(`/v1/staff/cases/${id}/lens/new`, { method: 'POST' }))}>Send to Lens as a new bug</Button></div>}
                  {data.allowed.link && (
                    <form className="console-row" onSubmit={e => { e.preventDefault(); act('link', 'Linked.', () => apiFetch(`/v1/staff/cases/${id}/lens`, { method: 'POST', body: JSON.stringify({ lens_item_id: lensId.trim() }) })); }}>
                      <Input aria-label="Existing Lens item id" placeholder="Link an existing Lens item id" value={lensId} onChange={e => setLensId(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                      <Button size="sm" variant="outline" type="submit" disabled={!lensId.trim()}>Link</Button>
                    </form>
                  )}
                </>
              )}
              {data.incident && <div className="console-muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>Part of incident <strong style={{ color: 'var(--ink)' }}>{data.incident.ref}</strong> — {data.incident.title} <Pill kind="incident" value={data.incident.status} /></div>}
            </Panel>

            <Panel title="History" sub="Assignment, routing and status changes" icon="clock">
              {data.events.length ? (
                <ol className="console-timeline">
                  {data.events.map((e: any) => (
                    <li key={e.id}><strong style={{ color: 'var(--ink)' }}>{EVENT_LABEL[e.event] ?? e.event.replace(/_/g, ' ')}</strong><div className="console-muted">{e.actor_name ?? 'System'} · {fmtDate(e.created_at)}</div></li>
                  ))}
                </ol>
              ) : <span className="console-muted">No history yet.</span>}
            </Panel>
          </div>
        </div>
      </div>}
    </LoadState>
  );
}
