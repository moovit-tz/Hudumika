import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { hashApiKey } from '../middleware/auth.js';
import { createTestTenant, getApp, type TestTenant } from './helpers.js';

// Platform foundation Phase 2 + 3: vehicle_vendors joins the canonical party
// model (migration 740, cloned from suppliers' own 506), and a new scoped
// /v1/platform/parties surface lets a genuinely independent app (tuma-web)
// search-or-create parties through a tenant-scoped x-api-key — no new auth
// mechanism, just the existing one wired to a new call site. This proves
// both the trigger and the scope/tenant-isolation gates for real.
describe('Platform foundation: vehicle_vendors party sync + scoped parties API', () => {
  let owner: TestTenant;
  let other: TestTenant;
  let fullKey: string;
  let scopelessKey: string;
  let readOnlyKey: string;
  let otherTenantKey: string;

  async function issueKey(tenantId: string, scopes: string[], readOnly = false) {
    const raw = `hdk_test_${randomUUID().replace(/-/g, '')}`;
    await dbPlatform.insertInto('api_keys').values({
      tenant_id: tenantId, name: 'test key', key_prefix: raw.slice(0, 12), key_hash: hashApiKey(raw),
      scopes: JSON.stringify(scopes) as unknown as string[], acting_role: 'TENANT_ADMIN', read_only: readOnly,
    }).execute();
    return raw;
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    other = await createTestTenant();
    fullKey = await issueKey(owner.tenantId, ['platform.parties']);
    scopelessKey = await issueKey(owner.tenantId, ['some.other.scope']);
    readOnlyKey = await issueKey(owner.tenantId, ['platform.parties'], true);
    otherTenantKey = await issueKey(other.tenantId, ['platform.parties']);
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, trx => trx.deleteFrom('vehicle_vendors').where('tenant_id', '=', owner.tenantId).execute());
    await owner.cleanup();
    await other.cleanup();
  }, 120000);

  it('vehicle_vendors INSERT creates a mirrored ORGANIZATION party, and UPDATE keeps it in sync', async () => {
    const vendor = await withTenant(owner.tenantId, trx => trx.insertInto('vehicle_vendors').values({
      tenant_id: owner.tenantId, name: 'Acme Fleet Parts', email: 'parts@acme.test', phone: '+255700000001',
    }).returningAll().executeTakeFirstOrThrow());
    expect(vendor.party_id).toBe(vendor.id);

    const party = await withTenant(owner.tenantId, trx => trx.selectFrom('parties').selectAll()
      .where('id', '=', vendor.party_id!).where('tenant_id', '=', owner.tenantId).executeTakeFirstOrThrow());
    expect(party.party_type).toBe('ORGANIZATION');
    expect(party.display_name).toBe('Acme Fleet Parts');
    expect(party.status).toBe('ACTIVE');

    await withTenant(owner.tenantId, trx => trx.updateTable('vehicle_vendors').set({ name: 'Acme Fleet Parts Ltd', active: false })
      .where('id', '=', vendor.id).where('tenant_id', '=', owner.tenantId).execute());
    const updated = await withTenant(owner.tenantId, trx => trx.selectFrom('parties').selectAll()
      .where('id', '=', vendor.party_id!).where('tenant_id', '=', owner.tenantId).executeTakeFirstOrThrow());
    expect(updated.display_name).toBe('Acme Fleet Parts Ltd');
    expect(updated.status).toBe('INACTIVE');
  });

  it('rejects a key without the platform.parties scope', async () => {
    const res = await (await getApp()).inject({ method: 'GET', url: '/v1/platform/parties/search?q=Acme', headers: { 'x-api-key': scopelessKey } });
    expect(res.statusCode).toBe(403);
  });

  it('creates a party via the scoped API, is idempotent on external_ref, and a read-only key cannot write', async () => {
    const createRes = await (await getApp()).inject({
      method: 'POST', url: '/v1/platform/parties', headers: { 'x-api-key': fullKey },
      payload: { type: 'ORGANIZATION', legal_name: 'Tuma Pilot Shipper Co', email: 'shipper@tuma-pilot.test', external_ref: 'tuma-shipment-1' },
    });
    expect(createRes.statusCode, createRes.body).toBe(201);
    const first = createRes.json();
    expect(first.created).toBe(true);
    const partyId = first.party.id;

    const retryRes = await (await getApp()).inject({
      method: 'POST', url: '/v1/platform/parties', headers: { 'x-api-key': fullKey },
      payload: { type: 'ORGANIZATION', legal_name: 'Tuma Pilot Shipper Co (should be ignored)', external_ref: 'tuma-shipment-1' },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.json().created).toBe(false);
    expect(retryRes.json().party.id).toBe(partyId);

    const searchRes = await (await getApp()).inject({ method: 'GET', url: '/v1/platform/parties/search?q=Tuma+Pilot', headers: { 'x-api-key': fullKey } });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().parties.some((p: { id: string }) => p.id === partyId)).toBe(true);

    const readOnlyAttempt = await (await getApp()).inject({
      method: 'POST', url: '/v1/platform/parties', headers: { 'x-api-key': readOnlyKey },
      payload: { type: 'PERSON', first_name: 'Should Not', last_name: 'Be Created' },
    });
    expect(readOnlyAttempt.statusCode).toBe(403);
  });

  it('never leaks another tenant\'s parties', async () => {
    const res = await (await getApp()).inject({ method: 'GET', url: '/v1/platform/parties/search?q=Tuma+Pilot', headers: { 'x-api-key': otherTenantKey } });
    expect(res.statusCode).toBe(200);
    expect(res.json().parties).toHaveLength(0);
  });
});
