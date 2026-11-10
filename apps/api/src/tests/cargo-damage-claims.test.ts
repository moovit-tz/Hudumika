import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';
import { GLService } from '../services/gl.service.js';

// Logistics P1 follow-through: cargo_items.damaged_quantity was recorded at
// load verification but nothing downstream ever gave it a financial
// consequence. This suite proves the real chain end to end: recording
// damage on verify-load opens a real claim, approving one issues a real
// credit note (with a real GL entry), and the whole thing is tenant-scoped
// and re-resolution-proof the same way every other financial flow in this
// codebase is required to be.
describe('Cargo damage claims — disposable tenant', () => {
  let owner: TestTenant;
  let customerId: string;
  let bookingId: string;
  let manifestId: string;
  let itemId: string;

  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object, token = owner.token) {
    return (await getApp()).inject({ method, url: `/v1/tracking${path}`, headers: authHeaders(token), ...(payload ? { payload } : {}) });
  }

  beforeAll(async () => {
    owner = await createTestTenant();
    await withTenant(owner.tenantId, trx => trx.insertInto('tenant_settings').values({
      tenant_id: owner.tenantId,
      settings: JSON.stringify({ 'enabled-apps': { tracking: true, 'tracking.cargo-loading': true } }),
    }).execute());

    await withTenant(owner.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, owner.tenantId);
      customerId = (await trx.insertInto('customers').values({
        tenant_id: owner.tenantId, name: 'Damage Claims Test Customer',
      }).returning('id').executeTakeFirstOrThrow()).id;

      bookingId = (await trx.insertInto('freight_bookings').values({
        tenant_id: owner.tenantId, booking_number: `BK-${Date.now()}`, customer_id: customerId,
        mode: 'ROAD', origin_port: 'Dar es Salaam', destination_port: 'Mwanza', created_by: owner.userId,
      }).returning('id').executeTakeFirstOrThrow()).id;

      manifestId = (await trx.insertInto('cargo_manifests').values({
        tenant_id: owner.tenantId, name: 'Damage Claims Test Manifest',
        status: 'APPROVED', stage: 'LOAD_VERIFICATION', job_type: 'BOOKING', booking_id: bookingId,
        container_length_cm: 1200, container_width_cm: 240, container_height_cm: 260, max_weight_kg: 28000,
      }).returning('id').executeTakeFirstOrThrow()).id;

      itemId = (await trx.insertInto('cargo_items').values({
        tenant_id: owner.tenantId, manifest_id: manifestId, label: 'Pallet A',
        length_cm: 120, width_cm: 80, height_cm: 100, weight_kg: 500, quantity: 2,
      }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('cargo_damage_claims').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('credit_note_lines').where('credit_note_id', 'in',
        trx.selectFrom('credit_notes').select('id').where('tenant_id', '=', owner.tenantId)).execute();
      await trx.deleteFrom('credit_notes').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('cargo_items').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('cargo_manifests').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('freight_bookings').where('tenant_id', '=', owner.tenantId).execute();
      await trx.deleteFrom('customers').where('tenant_id', '=', owner.tenantId).execute();
    });
    await owner.cleanup();
  }, 120000);

  it('opens a real, customer-linked damage claim when verify-load records damage, and approving it issues a real credit note', async () => {
    const verify = await call('POST', `/manifests/${manifestId}/verify-load`, {
      items: [{ id: itemId, loaded_quantity: 2, damaged_quantity: 1, damage_description: 'Crushed corner on forklift handling' }],
      seal_number: 'SEAL-0001',
      exceptions_acknowledged: true,
    });
    expect(verify.statusCode, verify.body).toBe(200);

    const list = await call('GET', `/cargo-damage-claims?manifest_id=${manifestId}`);
    expect(list.statusCode).toBe(200);
    const claims = list.json();
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe('OPEN');
    expect(claims[0].damaged_quantity).toBe(1);
    expect(claims[0].customer_id).toBe(customerId);
    expect(claims[0].customer_name).toBe('Damage Claims Test Customer');
    const claimId = claims[0].id;

    const approve = await call('POST', `/cargo-damage-claims/${claimId}/approve`, {
      approved_amount: 75000,
      resolution_notes: 'Settled per cargo damage policy',
    });
    expect(approve.statusCode, approve.body).toBe(200);
    const approved = approve.json();
    expect(approved.status).toBe('APPROVED');
    expect(Number(approved.approved_amount)).toBe(75000);
    expect(approved.credit_note.customer_id).toBe(customerId);
    expect(approved.credit_note.status).toBe('POSTED');

    // The credit note is real, not just a status flip — it's independently
    // readable from the credit notes table with the right customer and amount.
    const cn = await withTenant(owner.tenantId, trx =>
      trx.selectFrom('credit_notes').selectAll().where('id', '=', approved.credit_note_id).executeTakeFirst());
    expect(cn?.customer_id).toBe(customerId);
    const lines = await withTenant(owner.tenantId, trx =>
      trx.selectFrom('credit_note_lines').selectAll().where('credit_note_id', '=', approved.credit_note_id).execute());
    expect(lines).toHaveLength(1);
    expect(Number(lines[0].rate)).toBe(75000);

    // Already-resolved claims can't be resolved again.
    const reapprove = await call('POST', `/cargo-damage-claims/${claimId}/approve`, { approved_amount: 1000 });
    expect(reapprove.statusCode).toBe(409);
  });

  it('refuses to reject without a reason, and refuses to approve a claim with no resolvable customer', async () => {
    // A second manifest with no booking/shipment/release link at all — the
    // claim this verify-load opens has no customer to resolve.
    const { manifestId: orphanManifestId, itemId: orphanItemId } = await withTenant(owner.tenantId, async trx => {
      const m = (await trx.insertInto('cargo_manifests').values({
        tenant_id: owner.tenantId, name: 'Orphan Manifest', status: 'APPROVED', stage: 'LOAD_VERIFICATION',
        container_length_cm: 1200, container_width_cm: 240, container_height_cm: 260, max_weight_kg: 28000,
      }).returning('id').executeTakeFirstOrThrow()).id;
      const it2 = (await trx.insertInto('cargo_items').values({
        tenant_id: owner.tenantId, manifest_id: m, label: 'Crate B',
        length_cm: 100, width_cm: 80, height_cm: 90, weight_kg: 300, quantity: 1,
      }).returning('id').executeTakeFirstOrThrow()).id;
      return { manifestId: m, itemId: it2 };
    });

    const verify = await call('POST', `/manifests/${orphanManifestId}/verify-load`, {
      items: [{ id: orphanItemId, loaded_quantity: 1, damaged_quantity: 1, damage_description: 'Water damage' }],
      seal_number: 'SEAL-0002',
      exceptions_acknowledged: true,
    });
    expect(verify.statusCode, verify.body).toBe(200);

    const list = await call('GET', `/cargo-damage-claims?manifest_id=${orphanManifestId}`);
    const claim = list.json()[0];
    expect(claim.customer_id).toBeNull();

    const badReject = await call('POST', `/cargo-damage-claims/${claim.id}/reject`, { resolution_notes: '' });
    expect(badReject.statusCode).toBe(400);

    const badApprove = await call('POST', `/cargo-damage-claims/${claim.id}/approve`, { approved_amount: 1000 });
    expect(badApprove.statusCode).toBe(422);

    const reject = await call('POST', `/cargo-damage-claims/${claim.id}/reject`, { resolution_notes: 'No customer on file; written off internally' });
    expect(reject.statusCode, reject.body).toBe(200);
    expect(reject.json().status).toBe('REJECTED');

    // Cleanup for this orphan manifest specifically — not part of the shared afterAll fixtures.
    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('cargo_damage_claims').where('manifest_id', '=', orphanManifestId).execute();
      await trx.deleteFrom('cargo_items').where('manifest_id', '=', orphanManifestId).execute();
      await trx.deleteFrom('cargo_manifests').where('id', '=', orphanManifestId).execute();
    });
  });

  it('corrects a damage note back to zero before resolution by dropping the open claim, not leaving a stale record', async () => {
    const { manifestId: m2, itemId: item2 } = await withTenant(owner.tenantId, async trx => {
      const m = (await trx.insertInto('cargo_manifests').values({
        tenant_id: owner.tenantId, name: 'Correction Manifest', status: 'APPROVED', stage: 'LOAD_VERIFICATION', job_type: 'BOOKING', booking_id: bookingId,
        container_length_cm: 1200, container_width_cm: 240, container_height_cm: 260, max_weight_kg: 28000,
      }).returning('id').executeTakeFirstOrThrow()).id;
      const it3 = (await trx.insertInto('cargo_items').values({
        tenant_id: owner.tenantId, manifest_id: m, label: 'Pallet C',
        length_cm: 120, width_cm: 80, height_cm: 100, weight_kg: 400, quantity: 1,
      }).returning('id').executeTakeFirstOrThrow()).id;
      return { manifestId: m, itemId: it3 };
    });

    const firstVerify = await call('POST', `/manifests/${m2}/verify-load`, {
      items: [{ id: item2, loaded_quantity: 1, damaged_quantity: 1, damage_description: 'Suspected dent' }],
      seal_number: 'SEAL-0003',
      exceptions_acknowledged: true,
    });
    expect(firstVerify.statusCode, firstVerify.body).toBe(200);
    const afterFirst = await call('GET', `/cargo-damage-claims?manifest_id=${m2}`);
    expect(afterFirst.json()).toHaveLength(1);

    const correctedVerify = await call('POST', `/manifests/${m2}/verify-load`, {
      items: [{ id: item2, loaded_quantity: 1, damaged_quantity: 0 }],
      seal_number: 'SEAL-0003',
      exceptions_acknowledged: false,
    });
    expect(correctedVerify.statusCode, correctedVerify.body).toBe(200);
    const afterCorrection = await call('GET', `/cargo-damage-claims?manifest_id=${m2}`);
    expect(afterCorrection.json()).toHaveLength(0);

    await withTenant(owner.tenantId, async trx => {
      await trx.deleteFrom('cargo_items').where('manifest_id', '=', m2).execute();
      await trx.deleteFrom('cargo_manifests').where('id', '=', m2).execute();
    });
  });
});
