// Seed script for SEAL demo data — idempotent and re-runnable, same
// convention as seed-complyos-sample-data.ts. Targets the same demo tenant
// ComplyOS's seed script uses (real CRM customers already populated). Also
// flips on the 'seal' entitlement for every tenant via
// tenant_settings['enabled-apps'] so this doesn't depend on plan/package
// wiring to be testable.
import { db, withTenant } from '../db/client.js';
import { SealService } from '../services/seal.service.js';

async function main() {
  const tenants = await db.selectFrom('tenants').select(['id', 'name']).execute();
  for (const t of tenants) {
    const row = await db.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', t.id).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings as any) : row.settings) : {};
    const enabledApps = { ...(settings as any)['enabled-apps'], seal: true };
    const next = { ...(settings as any), 'enabled-apps': enabledApps };
    if (row) {
      await db.updateTable('tenant_settings').set({ settings: JSON.stringify(next) as any }).where('tenant_id', '=', t.id).execute();
    } else {
      await db.insertInto('tenant_settings').values({ tenant_id: t.id, settings: JSON.stringify(next) as any }).execute();
    }
  }
  console.log(`✅ Enabled 'seal' for ${tenants.length} tenant(s).`);

  const target = tenants.find(t => t.name?.toLowerCase().includes('moovit')) ?? tenants[0];
  if (!target) { console.log('No tenant found — skipping sample data.'); return; }
  console.log(`Seeding SEAL sample data for tenant: ${target.name} (${target.id})`);

  const customers = await db.selectFrom('customers').select(['id', 'name']).where('tenant_id', '=', target.id).limit(3).execute();
  if (customers.length === 0) {
    console.log('Target tenant has no customers — skipping lot seeding (compartments/zones/locations only).');
  }

  await withTenant(target.id, async (trx) => {
    const existing = await trx.selectFrom('seal_compartments').select('id').where('code', '=', 'CFS-DSM-01').executeTakeFirst();
    if (existing) {
      console.log('Sample compartment already exists — skipping (idempotent).');
      return;
    }

    const compartment = await trx.insertInto('seal_compartments').values({
      tenant_id: target.id,
      code: 'CFS-DSM-01',
      name: 'Dar es Salaam Container Freight Station',
      warehouse_type: 'cfs',
      licence_number: 'TRA-CFS-2026-0041',
      licence_expiry: new Date('2027-06-30'),
      customs_office_code: 'TZDSM',
      jurisdiction: 'TZ',
      default_storage_days: 180,
    }).returningAll().executeTakeFirstOrThrow();

    const zoneReceiving = await trx.insertInto('seal_zones').values({
      tenant_id: target.id, compartment_id: compartment.id, code: 'RCV', name: 'Receiving', zone_type: 'receiving',
    }).returningAll().executeTakeFirstOrThrow();
    const zoneBulk = await trx.insertInto('seal_zones').values({
      tenant_id: target.id, compartment_id: compartment.id, code: 'BLK', name: 'Bulk Storage', zone_type: 'bulk',
    }).returningAll().executeTakeFirstOrThrow();
    const zoneQuarantine = await trx.insertInto('seal_zones').values({
      tenant_id: target.id, compartment_id: compartment.id, code: 'QTN', name: 'Quarantine', zone_type: 'quarantine',
    }).returningAll().executeTakeFirstOrThrow();

    const locA1 = await trx.insertInto('seal_locations').values({
      tenant_id: target.id, compartment_id: compartment.id, zone_id: zoneBulk.id, code: 'BLK-A1', location_type: 'rack',
    }).returningAll().executeTakeFirstOrThrow();
    const locA2 = await trx.insertInto('seal_locations').values({
      tenant_id: target.id, compartment_id: compartment.id, zone_id: zoneBulk.id, code: 'BLK-A2', location_type: 'rack',
    }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('seal_locations').values({
      tenant_id: target.id, compartment_id: compartment.id, zone_id: zoneQuarantine.id, code: 'QTN-01', location_type: 'floor',
    }).execute();
    await trx.insertInto('seal_locations').values({
      tenant_id: target.id, compartment_id: compartment.id, zone_id: zoneReceiving.id, code: 'RCV-DOCK-1', location_type: 'dock',
    }).execute();

    if (customers.length > 0) {
      const owner1 = customers[0];
      const owner2 = customers[1] ?? customers[0];

      await SealService.receiveLot(trx, target.id, null, {
        compartmentId: compartment.id, ownerId: owner1.id,
        description: 'Steel Reinforcement Bars (Rebar) — 12mm, 500 bundles',
        hsCode: '7214.20', countryOfOrigin: 'CN',
        customsStatus: 'FOREIGN_DUTY_SUSPENDED',
        entryReference: 'WH-2026-000412',
        locationId: locA1.id, qty: 500, uom: 'BDL',
        customsValue: 84500, currency: 'USD',
        warehousedOn: new Date(Date.now() - 150 * 86400000).toISOString(),
        expiresOn: new Date(Date.now() + 25 * 86400000).toISOString(), // inside 30 days — shows on the expiring worklist
        batch: 'RB-2026-0091',
      });

      await SealService.receiveLot(trx, target.id, null, {
        compartmentId: compartment.id, ownerId: owner2.id,
        description: 'Ceramic Floor Tiles — 60x60cm, Grade A',
        hsCode: '6907.21', countryOfOrigin: 'IN',
        customsStatus: 'FOREIGN_DUTY_SUSPENDED',
        entryReference: 'WH-2026-000418',
        locationId: locA2.id, qty: 1200, uom: 'CTN',
        customsValue: 46200, currency: 'USD',
        warehousedOn: new Date(Date.now() - 40 * 86400000).toISOString(),
        expiresOn: new Date(Date.now() + 140 * 86400000).toISOString(),
        batch: 'CT-2026-0134',
      });

      const lot3 = await SealService.receiveLot(trx, target.id, null, {
        compartmentId: compartment.id, ownerId: owner1.id,
        description: 'Office Furniture — assorted, domestic supplier',
        countryOfOrigin: 'TZ',
        customsStatus: 'DOMESTIC',
        locationId: locA2.id, qty: 40, uom: 'PCS',
      });
      // Demonstrate a legal transition + the hash chain having more than
      // one link: move this domestic lot's location (no fiscal effect).
      await SealService.recordMovement(trx, target.id, {
        actorId: null, movementType: 'transfer', lotId: lot3.id,
        toLocationId: locA1.id, qtyDelta: 0, reasonCode: 'RE_SLOT',
      });
    }

    console.log('✅ SEAL sample data seeded: 1 compartment, 3 zones, 4 locations' + (customers.length > 0 ? ', 3 lots.' : '.'));
  });

  // Increment 2: guarantee + a lot consuming most of its headroom (so the
  // gauge shows something), plus a consignment with one container ready for
  // gate-in. Each has its own idempotency check (rather than being nested in
  // the block above) since Increment 1's seeding already ran and returns
  // early on a re-run.
  await withTenant(target.id, async (trx) => {
    const compartment = await trx.selectFrom('seal_compartments').select('id').where('code', '=', 'CFS-DSM-01').executeTakeFirst();
    if (!compartment) { console.log('Compartment not found — Increment 1 seeding must run first.'); return; }

    let guarantee = await trx.selectFrom('seal_guarantees').select(['id', 'face_value']).where('reference', '=', 'BG-2026-0041').executeTakeFirst();
    if (!guarantee) {
      guarantee = await trx.insertInto('seal_guarantees').values({
        tenant_id: target.id, instrument_type: 'bank_guarantee', issuer: 'CRDB Bank PLC',
        reference: 'BG-2026-0041', face_value: '50000000', currency: 'TZS',
        effective_from: new Date('2026-01-01'), expires_on: new Date('2026-12-31'),
      }).returningAll().executeTakeFirstOrThrow();
      console.log('✅ Created guarantee BG-2026-0041 (face value 50,000,000 TZS).');
    }
    await trx.updateTable('seal_compartments').set({ guarantee_id: guarantee.id }).where('id', '=', compartment.id).execute();

    if (customers.length > 0) {
      const highDutyLot = await trx.selectFrom('seal_lots').select('id').where('entry_reference', '=', 'WH-2026-000499').executeTakeFirst();
      if (!highDutyLot) {
        // ~74% of the guarantee's face value, so the headroom gauge on the
        // dashboard reads as genuinely near its limit, not empty.
        await SealService.receiveLot(trx, target.id, null, {
          compartmentId: compartment.id, ownerId: customers[0].id,
          description: 'Imported Machinery Parts — high-duty line',
          hsCode: '8431.49', countryOfOrigin: 'DE',
          customsStatus: 'FOREIGN_DUTY_SUSPENDED', entryReference: 'WH-2026-000499',
          qty: 25, uom: 'PCS', customsValue: 92000, currency: 'TZS',
          dutyAtRisk: 27000000, taxAtRisk: 10000000,
        });
        console.log('✅ Created a lot consuming ~74% of the guarantee\'s headroom.');
      }

      const consignment = await trx.selectFrom('seal_consignments').select('id').where('transport_doc_number', '=', 'MEDU7291840').executeTakeFirst();
      if (!consignment) {
        const c = await trx.insertInto('seal_consignments').values({
          tenant_id: target.id, compartment_id: compartment.id, owner_id: customers[0].id,
          transport_doc_type: 'BL', transport_doc_number: 'MEDU7291840',
          expected_arrival: new Date(), goods_description: 'General cargo — mixed hardware',
          status: 'ARRIVED_AT_GATE',
        }).returningAll().executeTakeFirstOrThrow();
        // CSQU3054383 is the canonical ISO 6346 worked example — a genuinely
        // valid check digit, not a made-up placeholder.
        await trx.insertInto('seal_containers').values({
          tenant_id: target.id, consignment_id: c.id, container_number: 'CSQU3054383', container_size: '40GP',
        }).execute();
        console.log('✅ Created a consignment (MEDU7291840) with one container ready for gate-in.');
      }
    }
  });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
