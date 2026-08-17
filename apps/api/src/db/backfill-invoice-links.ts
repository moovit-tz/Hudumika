// One-off backfill: link the seeded demo sales_invoices to their real
// customer records (customer_id) and a real shipment_cases record
// (shipment_ref), for invoices that predate seed.ts's linking logic.
// Safe to re-run — skips any invoice that's already linked.
import { db, withTenant } from './client.js';
import type { ClearanceStage, ShipmentType } from '@hudumika/types';

function typeFromMode(mode: string | null): ShipmentType {
  if (mode === 'AIR') return 'AIR';
  if (mode === 'ROAD') return 'ROAD';
  return 'SEA_FCL';
}

function stageFromStatus(status: string): ClearanceStage {
  if (status === 'Paid') return 'CLOSED';
  if (status === 'Draft') return 'DOCS_RECEIVED';
  return 'INVOICING';
}

async function main() {
  const tenant = await db.selectFrom('tenants').select(['id', 'name']).where('slug', '=', 'msomi-freight').executeTakeFirstOrThrow();
  console.log(`Tenant: ${tenant.name}`);

  await withTenant(tenant.id, async (trx) => {
    const invoices = await trx.selectFrom('sales_invoices').selectAll().where('tenant_id', '=', tenant.id).execute();
    const customers = await trx.selectFrom('customers').select(['id', 'name']).where('tenant_id', '=', tenant.id).execute();
    const custByName = new Map(customers.map(c => [c.name.trim().toLowerCase(), c.id]));

    const existingRefs = await trx.selectFrom('shipment_cases').select('ref_number').where('tenant_id', '=', tenant.id).execute();
    const refNums = existingRefs.map(r => parseInt(r.ref_number.match(/\d+$/)?.[0] || '0', 10));
    let nextRefNum = Math.max(0, ...refNums) + 1;

    for (const inv of invoices) {
      if (!inv.client_name) { console.log(`skip ${inv.invoice_number}: no client_name`); continue; }
      let customerId = inv.customer_id;
      if (!customerId) {
        customerId = custByName.get(inv.client_name.trim().toLowerCase()) || null;
        if (customerId) {
          await trx.updateTable('sales_invoices').set({ customer_id: customerId }).where('id', '=', inv.id).execute();
          console.log(`linked customer: ${inv.invoice_number} -> ${inv.client_name}`);
        } else {
          console.log(`skip ${inv.invoice_number}: no matching customer for "${inv.client_name}"`);
          continue;
        }
      }

      if (!inv.shipment_ref && customerId) {
        const refNumber = `CLR-2026-${String(nextRefNum++).padStart(4, '0')}`;
        await trx.insertInto('shipment_cases').values({
          tenant_id: tenant.id,
          ref_number: refNumber,
          customer_id: customerId,
          type: typeFromMode(inv.mode),
          goods_desc: 'General cargo (linked from invoice)',
          vessel: '',
          bl_number: inv.mode === 'AIR' ? null : inv.bl_number,
          awb_number: inv.mode === 'AIR' ? inv.bl_number : null,
          origin_port: inv.origin || '',
          dest_port: inv.destination || '',
          stage: stageFromStatus(inv.status),
          containers: JSON.stringify([]),
          // bill_date is a DATE ('YYYY-MM-DD'); created_at is a TIMESTAMPTZ.
          created_at: inv.bill_date ? new Date(inv.bill_date) : new Date(),
          updated_at: new Date(),
        }).execute();
        await trx.updateTable('sales_invoices').set({ shipment_ref: refNumber }).where('id', '=', inv.id).execute();
        console.log(`linked shipment: ${inv.invoice_number} -> ${refNumber}`);
      }
    }
  });

  console.log('Done.');
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
