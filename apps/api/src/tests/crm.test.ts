// CRM regression suite — leads/deals/labels/smart-views/lead-scoring/custom
// fields/pipeline-stages had zero automated coverage before this. Real HTTP
// calls through the actual app (fastify.inject), a real Postgres tenant,
// RLS genuinely enforced — not a mock. Also proves the entitlement-gating
// fix (requireEntitlement('crm')) actually blocks a tenant it's set false
// for, which is the bug this suite exists to guard against regressing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('CRM — leads, deals, pipeline stages, and the rest', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => {
    await A.cleanup();
    await B.cleanup();
  });

  it('a tenant with crm explicitly disabled is refused, not just role-checked', async () => {
    const app = await getApp();
    const off = await createTestTenant('TENANT_ADMIN');
    try {
      await dbPlatform.insertInto('tenant_settings')
        .values({ tenant_id: off.tenantId, settings: JSON.stringify({ 'enabled-apps': { crm: false } }) as any })
        .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { crm: false } }) as any }))
        .execute();

      for (const path of ['/v1/leads', '/v1/deals', '/v1/crm/labels', '/v1/crm/pipeline-stages', '/v1/crm/smart-views', '/v1/crm/custom-fields/defs', '/v1/crm/lead-scoring/rules']) {
        const res = await app.inject({ method: 'GET', url: path, headers: authHeaders(off.token) });
        expect(res.statusCode, path).toBe(403);
      }
    } finally {
      await off.cleanup();
    }
  });

  it('crm_pipeline_stages has RLS enabled + FORCEd + a tenant_isolation_policy', async () => {
    const rows = await sql<{ relname: string; rls: boolean; forced: boolean; pols: string }>`
      SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation_policy') AS pols
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'crm_pipeline_stages'
    `.execute(dbPlatform);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].rls).toBe(true);
    expect(rows.rows[0].forced).toBe(true);
    expect(Number(rows.rows[0].pols)).toBe(1);
  });

  let leadId: string;

  it('creates a lead, lists it, patches it', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/leads', headers: authHeaders(A.token),
      payload: { company: 'Zanzibar Spice Traders', contact_name: 'Amina Juma', contact_email: 'amina@zst.test', value: 12_000_000, source: 'referral' },
    });
    expect(created.statusCode).toBe(200);
    leadId = created.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/leads', headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((l: any) => l.id === leadId)).toBe(true);

    const patched = await app.inject({
      method: 'PATCH', url: `/v1/leads/${leadId}`, headers: authHeaders(A.token),
      payload: { priority: 'HIGH' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().priority).toBe('HIGH');
  });

  it('fuzzy-detects a near-duplicate lead by company name and merges them', async () => {
    const app = await getApp();
    const dup = await app.inject({
      method: 'POST', url: '/v1/leads', headers: authHeaders(A.token),
      payload: { company: 'Zanzibar Spice Trader', contact_name: 'A. Juma' }, // near-identical, one letter short
    });
    expect(dup.statusCode).toBe(200);
    const dupId = dup.json().id;

    const dupes = await app.inject({ method: 'GET', url: '/v1/leads/duplicates', headers: authHeaders(A.token) });
    expect(dupes.statusCode).toBe(200);
    const groups = dupes.json();
    const hit = groups.some((g: any) => g.leads.some((l: any) => l.id === leadId) && g.leads.some((l: any) => l.id === dupId));
    expect(hit).toBe(true);

    const merged = await app.inject({
      method: 'POST', url: '/v1/leads/merge', headers: authHeaders(A.token),
      payload: { primary_id: leadId, duplicate_ids: [dupId] },
    });
    expect(merged.statusCode).toBe(200);
    const afterMerge = await app.inject({ method: 'GET', url: `/v1/leads`, headers: authHeaders(A.token) });
    expect(afterMerge.json().some((l: any) => l.id === dupId)).toBe(false);
  });

  it("tenant B never sees tenant A's lead", async () => {
    const app = await getApp();
    const list = await app.inject({ method: 'GET', url: '/v1/leads', headers: authHeaders(B.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((l: any) => l.id === leadId)).toBe(false);
    const direct = await app.inject({ method: 'PATCH', url: `/v1/leads/${leadId}`, headers: authHeaders(B.token), payload: { priority: 'LOW' } });
    expect(direct.statusCode).toBe(404);
  });

  it('lists the 5 default pipeline stages, seeded lazily on first read', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    const stages = res.json();
    expect(stages.map((s: any) => s.key).sort()).toEqual(['LOST', 'NEGOTIATION', 'PROPOSAL', 'QUALIFICATION', 'WON'].sort());
    expect(stages.find((s: any) => s.key === 'WON').is_won).toBe(true);
    expect(stages.find((s: any) => s.key === 'LOST').is_lost).toBe(true);
  });

  let dealId: string;

  it('converts the lead to a deal, landing in the default entry stage', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: `/v1/leads/${leadId}/convert`, headers: authHeaders(A.token), payload: {} });
    expect(res.statusCode).toBe(200);
    dealId = res.json().id;
    expect(res.json().stage).toBe('QUALIFICATION'); // the seeded default's entry stage
  });

  it('adds a custom "Contract Sent" stage and moves the deal through it', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token),
      payload: { label: 'Contract Sent', color: 'purple' },
    });
    expect(created.statusCode).toBe(200);
    const customKey = created.json().key;
    expect(customKey).not.toBe('WON');

    const moved = await app.inject({
      method: 'PATCH', url: `/v1/deals/${dealId}/stage`, headers: authHeaders(A.token),
      payload: { stage: customKey },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().stage).toBe(customKey);
    expect(moved.json().closed_at).toBeFalsy(); // not won/lost — an open custom stage

    // reject an unknown stage key outright
    const bad = await app.inject({
      method: 'PATCH', url: `/v1/deals/${dealId}/stage`, headers: authHeaders(A.token),
      payload: { stage: 'NOT_A_REAL_STAGE' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('moving a deal into a real Won stage stamps closed_at and shows in metrics', async () => {
    const app = await getApp();
    const stages = (await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token) })).json();
    const won = stages.find((s: any) => s.key === 'WON');

    const moved = await app.inject({
      method: 'PATCH', url: `/v1/deals/${dealId}/stage`, headers: authHeaders(A.token),
      payload: { stage: won.key },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().closed_at).toBeTruthy();

    const metrics = await app.inject({ method: 'GET', url: '/v1/deals/metrics', headers: authHeaders(A.token) });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().by_stage.WON.count).toBeGreaterThanOrEqual(1);
  });

  it('a stage in use cannot be deleted; an empty custom stage can be', async () => {
    const app = await getApp();
    const stages = (await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token) })).json();
    const won = stages.find((s: any) => s.key === 'WON');
    const blocked = await app.inject({ method: 'DELETE', url: `/v1/crm/pipeline-stages/${won.id}`, headers: authHeaders(A.token) });
    expect(blocked.statusCode).toBe(400);

    const empty = await app.inject({
      method: 'POST', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token),
      payload: { label: 'Throwaway', color: 'gold' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/v1/crm/pipeline-stages/${empty.json().id}`, headers: authHeaders(A.token) });
    expect(del.statusCode).toBe(204);
  });

  it('reorders stages', async () => {
    const app = await getApp();
    const stages = (await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token) })).json();
    const reversedIds = stages.map((s: any) => s.id).reverse();
    const res = await app.inject({
      method: 'POST', url: '/v1/crm/pipeline-stages/reorder', headers: authHeaders(A.token),
      payload: { ids: reversedIds },
    });
    expect(res.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(A.token) })).json();
    expect(after.map((s: any) => s.id)).toEqual(reversedIds);
  });

  it("tenant B's own pipeline stages are independent of tenant A's edits", async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/v1/crm/pipeline-stages', headers: authHeaders(B.token) });
    const keys = res.json().map((s: any) => s.key).sort();
    expect(keys).toEqual(['LOST', 'NEGOTIATION', 'PROPOSAL', 'QUALIFICATION', 'WON'].sort());
  });

  it('labels: create, assign to the deal, list back', async () => {
    const app = await getApp();
    const label = await app.inject({ method: 'POST', url: '/v1/crm/labels', headers: authHeaders(A.token), payload: { name: 'VIP' } });
    expect(label.statusCode).toBe(200);
    const assign = await app.inject({
      method: 'POST', url: `/v1/crm/labels/${label.json().id}/assign`, headers: authHeaders(A.token),
      payload: { subject_type: 'deal', subject_id: dealId },
    });
    expect(assign.statusCode).toBe(200);
    const forDeal = await app.inject({ method: 'GET', url: `/v1/crm/labels/for?subject_type=deal&subject_id=${dealId}`, headers: authHeaders(A.token) });
    expect(forDeal.statusCode).toBe(200);
    expect(forDeal.json().some((l: any) => l.name === 'VIP')).toBe(true);
  });

  it('smart views: creates a "big leads" saved view and evaluates it', async () => {
    const app = await getApp();
    const view = await app.inject({
      method: 'POST', url: '/v1/crm/smart-views', headers: authHeaders(A.token),
      payload: { entity_type: 'lead', name: 'Big leads', match_type: 'all', rules: [{ field: 'value', op: 'gte', value: 1000 }] },
    });
    expect(view.statusCode).toBe(200);
    const results = await app.inject({ method: 'GET', url: `/v1/crm/smart-views/${view.json().id}/results`, headers: authHeaders(A.token) });
    expect(results.statusCode).toBe(200);
    expect(Array.isArray(results.json())).toBe(true);
    expect(results.json().some((l: any) => l.id === leadId)).toBe(true);
  });

  it('lead scoring: a rule contributes points visible on the lead', async () => {
    const app = await getApp();
    const rule = await app.inject({
      method: 'POST', url: '/v1/crm/lead-scoring/rules', headers: authHeaders(A.token),
      payload: { label: 'High priority', field: 'priority', op: 'eq', value: 'HIGH', points: 25 },
    });
    expect(rule.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/v1/leads', headers: authHeaders(A.token) });
    const scored = list.json().find((l: any) => l.id === leadId);
    expect(scored?.score ?? 0).toBeGreaterThanOrEqual(25);
  });

  it('custom fields: defines a field, sets a value on the deal, reads it back', async () => {
    const app = await getApp();
    const def = await app.inject({
      method: 'POST', url: '/v1/crm/custom-fields/defs', headers: authHeaders(A.token),
      payload: { entity_type: 'deal', label: 'Contract Number', type: 'text' },
    });
    expect(def.statusCode).toBe(200);
    const put = await app.inject({
      method: 'PUT', url: '/v1/crm/custom-fields/values', headers: authHeaders(A.token),
      payload: { entity_type: 'deal', subject_id: dealId, values: { [def.json().id]: 'CN-2026-0913' } },
    });
    expect(put.statusCode).toBe(200);
    const values = await app.inject({ method: 'GET', url: `/v1/crm/custom-fields/values?entity_type=deal&subject_id=${dealId}`, headers: authHeaders(A.token) });
    expect(values.statusCode).toBe(200);
  });
});
