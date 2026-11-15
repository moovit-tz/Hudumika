// Zentra hardening suite (migrations 767/768, zentra-telemetry.service.ts,
// zentra-alerts.service.ts). Drives the real app through server.inject()
// against throwaway tenants, and checks what an auditor would rely on:
//
//  - the plan gate, and that plan refusals are not counted as security denials;
//  - refused requests and exports reach the audit log and trip their rules;
//  - the money rule matches what the apps actually emit;
//  - alerts go to admins, not to the person under suspicion;
//  - the audit log is append-only, retention cuts wait 30 days, a legal hold
//    stops purges, and case evidence survives a purge;
//  - Zentra audits its own changes, the evidence pack checksum verifies, and
//    one tenant can't read another's audit log.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { processZentraOutboxBatch } from '../services/zentra-outbox.service.js';
import { enforceZentraRetention } from '../services/zentra-event.service.js';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Zentra hardening', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant;        // Enterprise: has Zentra
  let B: TestTenant;        // Starter: does not
  let junior: { userId: string; token: string };

  const get = (token: string, url: string) => app.inject({ method: 'GET', url, headers: authHeaders(token) });
  const send = (token: string, method: 'POST' | 'PATCH', url: string, payload: unknown) =>
    app.inject({ method, url, headers: authHeaders(token), payload: payload as any });

  /** The telemetry hook queues after the response; wait for it, then run the outbox job. */
  async function drain(tenantId: string) {
    for (let i = 0; i < 20; i++) {
      const pending = await dbPlatform.selectFrom('zentra_event_outbox').select('id')
        .where('tenant_id', '=', tenantId).where('status', '=', 'pending').execute();
      if (pending.length) break;
      await sleep(100);
    }
    await sleep(200);
    for (let i = 0; i < 10; i++) {
      const r = await processZentraOutboxBatch(100);
      if (r.processed === 0) break;
    }
  }
  const events = (tenantId: string) => withTenant(tenantId, trx => trx.selectFrom('zentra_audit_events').selectAll()
    .where('tenant_id', '=', tenantId).orderBy('created_at', 'asc').execute());
  const signals = (tenantId: string) => withTenant(tenantId, trx => trx.selectFrom('zentra_risk_signals').selectAll()
    .where('tenant_id', '=', tenantId).execute());

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', A.tenantId).execute();
    junior = await A.addUser('JUNIOR');
    const r = await get(A.token, '/v1/zentra/settings'); // creates the settings row and default rules
    expect(r.statusCode).toBe(200);
  }, 60_000);

  afterAll(async () => {
    // Deleting a tenant must still work: the append-only guard allows the cascade.
    await A?.cleanup();
    await B?.cleanup();
    const left = await dbPlatform.selectFrom('zentra_audit_events').select('id').where('tenant_id', 'in', [A.tenantId, B.tenantId]).execute();
    expect(left).toHaveLength(0);
  }, 240_000); // deleting a tenant cascades through hundreds of tables

  it('gates Zentra by plan, and does not count plan refusals as denials', async () => {
    const r = await get(B.token, '/v1/zentra/overview');
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('PLAN_UPGRADE_REQUIRED');
    await sleep(300);
    const queued = await dbPlatform.selectFrom('zentra_event_outbox').select('event_name')
      .where('tenant_id', '=', B.tenantId).where('event_name', '=', 'permission.denied').execute();
    expect(queued).toHaveLength(0);
    expect((await get(A.token, '/v1/zentra/overview')).statusCode).toBe(200);
  });

  it('records refused requests and raises the repeated-denials signal', async () => {
    for (const url of ['/v1/zentra/overview', '/v1/zentra/settings', '/v1/zentra/cases']) {
      expect((await get(junior.token, url)).statusCode).toBe(403);
    }
    await drain(A.tenantId);
    const denied = (await events(A.tenantId)).filter(e => e.event_name === 'permission.denied' && e.actor_id === junior.userId);
    expect(denied.length).toBeGreaterThanOrEqual(3);
    expect(denied.every(e => e.outcome === 'denied')).toBe(true);
    const sig = (await signals(A.tenantId)).find(s => s.rule_code === 'RULE_REPEATED_ACCESS_DENIED');
    expect(sig?.actor_id).toBe(junior.userId);
  });

  it('alerts admins, not the person the signal is about', async () => {
    const notes = await dbPlatform.selectFrom('notifications').select(['user_id', 'app'])
      .where('tenant_id', '=', A.tenantId).where('app', '=', 'zentra').execute();
    expect(notes.some(n => n.user_id === A.userId)).toBe(true);
    expect(notes.some(n => n.user_id === junior.userId)).toBe(false);
  });

  it('records CSV exports with their row count', async () => {
    const r = await get(A.token, '/v1/zentra/activity/export.csv');
    expect(r.statusCode).toBe(200);
    const rows = r.body.split(/\r?\n/).filter(l => l.trim()).length - 1;
    expect(rows).toBeGreaterThan(0);
    await drain(A.tenantId);
    const exp = (await events(A.tenantId)).find(e => e.event_name === 'record.exported');
    expect(Number((exp?.safe_metadata as any)?.count)).toBe(rows);
  });

  it('matches the money rule to what finance actually emits', async () => {
    await withTenant(A.tenantId, trx => trx.insertInto('zentra_event_outbox').values({
      tenant_id: A.tenantId, app_id: 'finops', event_name: 'invoice.payment_recorded', status: 'pending',
      payload: JSON.stringify({ actor_id: A.userId, resource_type: 'invoice', resource_id: 'test-invoice', action: 'payment_recorded',
        outcome: 'success', safe_metadata: { amount: 50_000 } }),
    } as any).execute());
    await drain(A.tenantId);
    expect((await signals(A.tenantId)).some(s => s.rule_code === 'RULE_HIGH_VALUE_FINANCE_APPROVAL')).toBe(true);
  });

  it('keeps the audit log append-only', async () => {
    const [e] = await events(A.tenantId);
    await expect(sql`UPDATE zentra_audit_events SET safe_summary = 'tampered' WHERE id = ${e.id}`.execute(dbPlatform)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM zentra_audit_events WHERE id = ${e.id}`.execute(dbPlatform)).rejects.toThrow(/append-only/);
  });

  it('defers a shorter retention period by 30 days', async () => {
    const r = await send(A.token, 'PATCH', '/v1/zentra/settings', { retention_days: 90 });
    expect(r.statusCode).toBe(200);
    expect(r.json().retention_days).toBe(365);
    expect(r.json().retention_pending_days).toBe(90);
    const days = (new Date(r.json().retention_pending_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    const back = await send(A.token, 'PATCH', '/v1/zentra/settings', { retention_days: 365 });
    expect(back.json().retention_pending_days).toBeNull();
  });

  it('purges expired events but never case evidence, and nothing under legal hold', async () => {
    const old = new Date(Date.now() - 800 * 86_400_000);
    const seed = (label: string) => withTenant(A.tenantId, trx => trx.insertInto('zentra_audit_events').values({
      tenant_id: A.tenantId, app_id: 'workspace', event_name: 'test.seed', actor_id: 'test', resource_type: 'probe',
      resource_id: label, action: 'probe', outcome: 'success', created_at: old,
    } as any).returning('id').executeTakeFirstOrThrow());
    const keep = (await seed('evidence')).id, drop = (await seed('expendable')).id;
    const c = await send(A.token, 'POST', '/v1/zentra/cases', { title: 'Evidence holder', severity: 'LOW', evidence_event_ids: [keep] });
    expect(c.statusCode).toBeLessThan(300);

    await send(A.token, 'PATCH', '/v1/zentra/settings', { legal_hold: true });
    expect(await enforceZentraRetention(A.tenantId)).toBe(0);
    await send(A.token, 'PATCH', '/v1/zentra/settings', { legal_hold: false });
    await enforceZentraRetention(A.tenantId);
    const left = (await events(A.tenantId)).map(e => e.id);
    expect(left).toContain(keep);
    expect(left).not.toContain(drop);
  });

  it("audits Zentra's own changes", async () => {
    const own = (await events(A.tenantId)).filter(e => e.app_id === 'zentra').map(e => e.event_name);
    expect(own).toEqual(expect.arrayContaining(['zentra.settings_changed', 'zentra.case_opened']));
  });

  it('produces an evidence pack whose checksum verifies', async () => {
    const list = await get(A.token, '/v1/zentra/cases');
    const caseId = (list.json().cases ?? list.json())[0].id;
    const r = await get(A.token, `/v1/zentra/cases/${caseId}/evidence-pack`);
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(createHash('sha256').update(JSON.stringify(body.pack, null, 2)).digest('hex')).toBe(body.sha256_of_pack);
    expect(body.pack.history_chain_intact).toBe(true);
    expect(body.pack.evidence_events.length).toBeGreaterThan(0);
  });

  it("does not let one tenant read another's audit log", async () => {
    const fromB = await withTenant(B.tenantId, trx => trx.selectFrom('zentra_audit_events').select('id')
      .where('tenant_id', '=', A.tenantId).execute());
    expect(fromB).toHaveLength(0);
  });
});
