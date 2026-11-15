// Pulse journeys (migration 773): definitions are validated, events and
// audiences enter people, steps run once per person even when two workers
// race, waits and branches route correctly, CRM tasks land for the owner,
// "only new people" really excludes the existing audience, quiet hours hold
// messages, and nothing crosses tenants.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
// Loaded after the app boots: the service sits in the subscriber import graph.
let runPulseJourneysFor: typeof import('../services/pulse-journeys.service.js').runPulseJourneysFor;
let quietUntil: typeof import('../services/pulse-journeys.service.js').quietUntil;
let journeyProblems: typeof import('../services/pulse-journeys.service.js').journeyProblems;

describe('Pulse journeys', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;

  const call = (token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: authHeaders(token), payload: payload as any });
  const enrollments = (journeyId: string) => withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_journey_enrollments').selectAll()
    .where('tenant_id', '=', A.tenantId).where('journey_id', '=', journeyId).orderBy('entered_at').execute());
  const makeDue = (journeyId: string) => withTenant(A.tenantId, (trx) => trx.updateTable('pulse_journey_enrollments')
    .set({ next_run_at: new Date(Date.now() - 1000) }).where('journey_id', '=', journeyId).where('status', '=', 'active').execute());
  const noQuiet = (id: string) => withTenant(A.tenantId, (trx) => trx.updateTable('pulse_journeys').set({ quiet_hours: null }).where('id', '=', id).execute());

  beforeAll(async () => {
    app = await getApp();
    ({ runPulseJourneysFor, quietUntil, journeyProblems } = await import('../services/pulse-journeys.service.js'));
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    for (const t of [A, B]) await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', t.tenantId).execute();
  }, 120_000);
  afterAll(async () => { await A?.cleanup(); await B?.cleanup(); }, 240_000);

  it('rejects broken definitions with readable reasons', () => {
    const backwards = journeyProblems({ source: 'leads', trigger: { type: 'manual' }, steps: [
      { id: 'a', type: 'sms', body_text: 'hi' },
      { id: 'b', type: 'branch', condition: { kind: 'opened', step_id: 'a' }, yes: 'a', no: 'next' },
    ] });
    expect(backwards.join(' ')).toMatch(/only jump forward/);
    expect(backwards.join(' ')).toMatch(/opens are only tracked for email/);
    expect(journeyProblems({ source: 'contacts', trigger: { type: 'manual' }, steps: [{ id: 't', type: 'task', title: 'x', due_days: 1, assign: 'owner' }] }).join(' ')).toMatch(/CRM leads only/);
    expect(journeyProblems({ source: 'contacts', trigger: { type: 'event', event_type: 'deal.won' }, steps: [{ id: 'e', type: 'exit' }] }).join(' ')).toMatch(/doesn’t apply/);
  });

  it('holds messages during quiet hours, overnight windows included', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 15, h, 30));
    expect(quietUntil(at(22), 'UTC', { start: '21:00', end: '08:00' })?.toISOString()).toBe('2026-11-16T08:00:00.000Z');
    expect(quietUntil(at(3), 'UTC', { start: '21:00', end: '08:00' })?.toISOString()).toBe('2026-11-15T08:00:00.000Z');
    expect(quietUntil(at(12), 'UTC', { start: '21:00', end: '08:00' })).toBeNull();
    expect(quietUntil(at(12), 'UTC', null)).toBeNull();
  });

  let nurture: string, leadId: string;
  it('enters a new lead from the CRM event and sends the first email', async () => {
    const j = await call(A.token, 'POST', '/v1/pulse/journeys', { template: 'nurture' });
    expect(j.statusCode).toBe(201);
    nurture = j.json().data.id;
    await noQuiet(nurture);
    expect((await call(A.token, 'POST', `/v1/pulse/journeys/${nurture}/publish`)).statusCode).toBe(200);
    const lead = await call(A.token, 'POST', '/v1/leads', { company: 'Kilimanjaro Coffee', contact_name: 'Neema Lyimo', contact_email: 'neema@example.test' });
    expect(lead.statusCode).toBeLessThan(300);
    leadId = (lead.json().data ?? lead.json()).id;
    await withTenant(A.tenantId, (trx) => trx.updateTable('leads').set({ assigned_to_id: A.userId }).where('id', '=', leadId).execute());
    // The subscriber runs after commit; give it a moment, then run the journey.
    for (let i = 0; i < 20 && !(await enrollments(nurture)).length; i++) await new Promise((r) => setTimeout(r, 150));
    const [e] = await enrollments(nurture);
    expect(e).toMatchObject({ source: 'leads', source_id: leadId, status: 'active' });
    await runPulseJourneysFor(A.tenantId);
    const outbox = await withTenant(A.tenantId, (trx) => trx.selectFrom('email_outbox').select(['subject', 'body_html'])
      .where('tenant_id', '=', A.tenantId).where('to_address', '=', 'neema@example.test').execute());
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe('Thanks for your interest');
    const after = (await enrollments(nurture))[0];
    expect(after.step_index).toBe(2); // parked after the 2-day wait
    expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
  });

  it('runs each step once even when two workers race', async () => {
    await makeDue(nurture);
    // Nothing clicked yet → the "no" path: a reminder email.
    await Promise.all([runPulseJourneysFor(A.tenantId), runPulseJourneysFor(A.tenantId)]);
    const outbox = await withTenant(A.tenantId, (trx) => trx.selectFrom('email_outbox').select('subject')
      .where('tenant_id', '=', A.tenantId).where('to_address', '=', 'neema@example.test').orderBy('created_at').execute());
    expect(outbox.map((o) => o.subject)).toEqual(['Thanks for your interest', 'Any questions?']);
    const runs = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_journey_step_runs').select(['step_id', 'detail'])
      .where('journey_id', '=', nurture).execute());
    const branch = runs.find((r) => r.step_id === 'check')!;
    expect((typeof branch.detail === 'string' ? JSON.parse(branch.detail) : branch.detail).result).toBe('no');
  });

  it('finishes with a call task for the lead’s owner', async () => {
    await makeDue(nurture);
    await runPulseJourneysFor(A.tenantId);
    const [e] = await enrollments(nurture);
    expect(e.status).toBe('completed');
    const tasks = await withTenant(A.tenantId, (trx) => trx.selectFrom('crm_tasks').selectAll().where('tenant_id', '=', A.tenantId).where('subject_id', '=', leadId).execute());
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assigned_to).toBe(A.userId);
    const detail = (await call(A.token, 'GET', `/v1/pulse/journeys/${nurture}`)).json().data;
    expect(detail.step_stats.find((s: any) => s.id === 'intro').message.sent).toBe(1);
  });

  it('“only new people” skips the existing audience and enters newcomers', async () => {
    const add = (first: string) => withTenant(A.tenantId, (trx) => trx.insertInto('contacts').values({ tenant_id: A.tenantId, first_name: first, email: `${first.toLowerCase()}@example.test`, company: 'Journey Co' } as any).returning('id').executeTakeFirstOrThrow());
    const old = await add('Oldtimer');
    const seg = await call(A.token, 'POST', '/v1/pulse/segments', { name: 'Journey Co', source: 'contacts', match_type: 'all', rules: [{ field: 'company', op: 'eq', value: 'Journey Co' }] });
    const j = await call(A.token, 'POST', '/v1/pulse/journeys', {
      name: 'Newcomers', source: 'contacts', trigger: { type: 'segment', segment_id: seg.json().data.id, include_existing: false },
      steps: [{ id: 'hello', type: 'email', subject: 'Welcome', body_html: '<p>Hi</p>' }],
    });
    const id = j.json().data.id;
    expect((await call(A.token, 'POST', `/v1/pulse/journeys/${id}/publish`)).statusCode).toBe(200);
    const fresh = await add('Newcomer');
    await runPulseJourneysFor(A.tenantId);
    const rows = await enrollments(id);
    expect(rows.find((r) => r.source_id === old.id)?.status).toBe('excluded');
    expect(rows.find((r) => r.source_id === fresh.id)?.status).toBe('completed');
    const mail = await withTenant(A.tenantId, (trx) => trx.selectFrom('email_outbox').select('to_address').where('tenant_id', '=', A.tenantId).where('subject', '=', 'Welcome').execute());
    expect(mail.map((m) => m.to_address)).toEqual(['newcomer@example.test']);
  });

  it('must be paused before editing, and keeps other tenants out', async () => {
    expect((await call(A.token, 'PATCH', `/v1/pulse/journeys/${nurture}`, { name: 'x' })).statusCode).toBe(409);
    expect((await call(B.token, 'GET', `/v1/pulse/journeys/${nurture}`)).statusCode).toBe(404);
    const leaked = await withTenant(B.tenantId, (trx) => trx.selectFrom('pulse_journey_enrollments').select('id').where('journey_id', '=', nurture).execute());
    expect(leaked).toHaveLength(0);
  });
});
