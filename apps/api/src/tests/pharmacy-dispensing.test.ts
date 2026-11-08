// Pharmaceutical dispensing (industry-readiness backlog item 23, the
// dispensing half of the business's "both" scope decision). Exercises the
// backlog's own named controls for real against a disposable tenant:
// pharmacist-approval gate, FEFO batch selection, expired-batch refusal,
// quarantine-hold refusal, return, and recall traceability.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { InventoryService } from '../services/inventory.service.js';
import { GLService } from '../services/gl.service.js';
import { createIndustryWork } from '../services/finance-industry-work.service.js';
import {
  createMedication, createPrescriptionForDispensing, approvePrescription, rejectPrescription,
  dispenseMedication, returnDispensedMedication, holdBatch, releaseBatchHold, recallReport,
} from '../services/pharmacy.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Pharmacy dispensing (batch/expiry/FEFO/quarantine/recall)', () => {
  let tenant: TestTenant;
  let customerId: string, itemId: string, productId: string, locationId: string, workId: string, medicationId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    productId = randomUUID();
    await withTenant(tenant.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);
      customerId = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Pharmacy Test Client' }).returning('id').executeTakeFirstOrThrow()).id;
      const warehouse = await trx.insertInto('inventory_warehouses').values({ tenant_id: tenant.tenantId, name: 'Pharmacy WH', code: 'PHW', address: null }).returning('id').executeTakeFirstOrThrow();
      locationId = (await trx.insertInto('inventory_locations').values({ tenant_id: tenant.tenantId, warehouse_id: warehouse.id, code: 'PHL', name: 'Pharmacy shelf' }).returning('id').executeTakeFirstOrThrow()).id;
      await trx.insertInto('products').values({ id: productId, tenant_id: tenant.tenantId, code: 'AMOX500', name: 'Amoxicillin 500mg', sale_price: 500, currency: 'TZS', type: 'product', track_inventory: true }).execute();
      itemId = (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'AMOX500', name: 'Amoxicillin 500mg', product_id: productId, base_uom: 'EA' }).returning('id').executeTakeFirstOrThrow()).id;
    });
    const work = await createIndustryWork(tenant.tenantId, tenant.userId, {
      industry: 'pharmaceutical', name: 'Pharmacy Counter', customer_id: customerId, currency: 'TZS', budget: 0, specifications: {},
    });
    workId = work.id;
    await withTenant(tenant.tenantId, trx => trx.updateTable('finance_industry_work').set({ status: 'active' }).where('id', '=', workId).execute());
    medicationId = (await createMedication(tenant.tenantId, { item_id: itemId, name: 'Amoxicillin', strength: '500mg', form: 'capsule', pack_size: '10s' })).id;
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('pharmacy_batch_holds').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('pharmacy_dispensations').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('pharmacy_prescriptions').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('pharmacy_medications').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_industry_work').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  async function receiveBatch(batchNo: string, qty: number, expiryDate: string | null) {
    await withTenant(tenant.tenantId, trx =>
      InventoryService.recordMovement(trx, tenant.tenantId, {
        actorId: tenant.userId, movementType: 'receipt', itemId, toLocationId: locationId,
        enteredQty: qty, enteredUom: 'EA', unitCost: 50, batchNo, expiryDate: expiryDate ?? undefined,
      })
    );
  }

  async function newPrescription(qty: number) {
    return createPrescriptionForDispensing(tenant.tenantId, tenant.userId, workId, {
      medication_id: medicationId, patient_name: 'Zainab Hassan', patient_contact: '+255701234567',
      prescriber_name: 'Dr. Juma', prescriber_license: 'MD-4471', dosage: '1 capsule 3x daily', quantity_prescribed: qty,
    });
  }

  it('refuses dispensing before pharmacist approval, then dispenses via FEFO against the soonest-expiring batch', async () => {
    await receiveBatch('BATCH-LATE', 100, '2027-06-01');
    await receiveBatch('BATCH-SOON', 50, '2026-11-20');

    const rx = await newPrescription(20);
    await expect(dispenseMedication(tenant.tenantId, tenant.userId, rx.id, { location_id: locationId }))
      .rejects.toThrow('Only an approved prescription can be dispensed.');

    const rejected = await newPrescription(5);
    await rejectPrescription(tenant.tenantId, tenant.userId, rejected.id, 'Duplicate request.');
    await expect(dispenseMedication(tenant.tenantId, tenant.userId, rejected.id, { location_id: locationId }))
      .rejects.toThrow('Only an approved prescription can be dispensed.');

    const approved = await approvePrescription(tenant.tenantId, tenant.userId, rx.id);
    expect(approved.status).toBe('approved');

    // No batch_no given — FEFO must pick BATCH-SOON (expires first), not BATCH-LATE.
    const dispensation = await dispenseMedication(tenant.tenantId, tenant.userId, rx.id, { location_id: locationId });
    expect(dispensation.batch_no).toBe('BATCH-SOON');
    expect(Number(dispensation.quantity)).toBe(20);

    const rxAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('pharmacy_prescriptions').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', rx.id).executeTakeFirstOrThrow());
    expect(rxAfter.status).toBe('dispensed');

    const stockSoon = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId).where('batch_no', '=', 'BATCH-SOON').executeTakeFirstOrThrow());
    expect(Number(stockSoon.qty_on_hand)).toBe(30);
  });

  it('refuses dispensing from an expired batch and from a batch under an active quarantine hold, then allows it once released', async () => {
    await receiveBatch('BATCH-EXPIRED', 30, '2020-01-01');
    const rxExpired = await newPrescription(5);
    await approvePrescription(tenant.tenantId, tenant.userId, rxExpired.id);
    await expect(dispenseMedication(tenant.tenantId, tenant.userId, rxExpired.id, { location_id: locationId, batch_no: 'BATCH-EXPIRED' }))
      .rejects.toThrow(/expired on 2020-01-01/);

    await receiveBatch('BATCH-RECALLED', 40, '2027-01-01');
    const hold = await holdBatch(tenant.tenantId, tenant.userId, { item_id: itemId, batch_no: 'BATCH-RECALLED', reason: 'Supplier quality recall notice #881.' });
    expect(hold.status).toBe('active');

    const rxHeld = await newPrescription(5);
    await approvePrescription(tenant.tenantId, tenant.userId, rxHeld.id);
    await expect(dispenseMedication(tenant.tenantId, tenant.userId, rxHeld.id, { location_id: locationId, batch_no: 'BATCH-RECALLED' }))
      .rejects.toThrow(/quarantine hold/);

    await releaseBatchHold(tenant.tenantId, tenant.userId, hold.id);
    const dispensation = await dispenseMedication(tenant.tenantId, tenant.userId, rxHeld.id, { location_id: locationId, batch_no: 'BATCH-RECALLED' });
    expect(dispensation.batch_no).toBe('BATCH-RECALLED');
  });

  it('returns a dispensation back into stock and produces a real recall report by batch', async () => {
    await receiveBatch('BATCH-TRACE', 20, '2027-03-01');
    const rx = await newPrescription(8);
    await approvePrescription(tenant.tenantId, tenant.userId, rx.id);
    const dispensation = await dispenseMedication(tenant.tenantId, tenant.userId, rx.id, { location_id: locationId, batch_no: 'BATCH-TRACE' });

    const stockAfterDispense = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId).where('batch_no', '=', 'BATCH-TRACE').executeTakeFirstOrThrow());
    expect(Number(stockAfterDispense.qty_on_hand)).toBe(12);

    const returned = await returnDispensedMedication(tenant.tenantId, tenant.userId, dispensation.id, { location_id: locationId });
    expect(returned.returned_at).not.toBeNull();
    await expect(returnDispensedMedication(tenant.tenantId, tenant.userId, dispensation.id, { location_id: locationId }))
      .rejects.toThrow('already been returned');

    const stockAfterReturn = await withTenant(tenant.tenantId, trx => trx.selectFrom('inventory_stock_levels').select('qty_on_hand').where('tenant_id', '=', tenant.tenantId).where('item_id', '=', itemId).where('batch_no', '=', 'BATCH-TRACE').executeTakeFirstOrThrow());
    expect(Number(stockAfterReturn.qty_on_hand)).toBe(20);

    const recall = await recallReport(tenant.tenantId, itemId, 'BATCH-TRACE');
    expect(recall.some(r => r.id === dispensation.id && r.patient_name === 'Zainab Hassan')).toBe(true);
  });

  it('requires a reason when substituting a different item at dispensing time', async () => {
    const otherProductId = randomUUID();
    const otherItemId = await withTenant(tenant.tenantId, async trx => {
      await trx.insertInto('products').values({ id: otherProductId, tenant_id: tenant.tenantId, code: 'AMOXGEN', name: 'Amoxicillin (generic)', sale_price: 400, currency: 'TZS', type: 'product', track_inventory: true }).execute();
      return (await trx.insertInto('inventory_items').values({ tenant_id: tenant.tenantId, sku: 'AMOXGEN', name: 'Amoxicillin (generic)', product_id: otherProductId, base_uom: 'EA' }).returning('id').executeTakeFirstOrThrow()).id;
    });
    await withTenant(tenant.tenantId, trx =>
      InventoryService.recordMovement(trx, tenant.tenantId, { actorId: tenant.userId, movementType: 'receipt', itemId: otherItemId, toLocationId: locationId, enteredQty: 10, enteredUom: 'EA', unitCost: 40, batchNo: 'GEN-BATCH', expiryDate: '2027-01-01' })
    );
    const rx = await newPrescription(3);
    await approvePrescription(tenant.tenantId, tenant.userId, rx.id);
    await expect(dispenseMedication(tenant.tenantId, tenant.userId, rx.id, { location_id: locationId, substituted_item_id: otherItemId }))
      .rejects.toThrow('A substitution requires a reason.');
    const dispensation = await dispenseMedication(tenant.tenantId, tenant.userId, rx.id, {
      location_id: locationId, substituted_item_id: otherItemId, substitution_reason: 'Brand-name out of stock; generic equivalent approved.',
    });
    expect(dispensation.substituted_item_id).toBe(otherItemId);
  });
});
