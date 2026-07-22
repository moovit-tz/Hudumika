import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string | null;
  path: string;
}

const LIMIT = 6;

/**
 * GET /v1/search?q=... — cross-app keyword search used by the header search bar.
 * Covers the highest-traffic entity types (shipments, customers, invoices,
 * staff, drivers, vehicles) rather than every one of the ~150 tables in the
 * schema — each is a simple ILIKE across its main identifying columns,
 * tenant-scoped, capped at LIMIT rows per category so the dropdown stays fast
 * and scannable. Extend the categories array below to add more entity types.
 */
export async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const user = request.user;
    const q = ((request.query as any).q as string || '').trim();
    if (q.length < 2) return { data: {} };
    const like = `%${q}%`;

    return withTenant(user.tenant_id, async (trx) => {
      const [shipments, customers, invoices, staff, drivers, vehicles] = await Promise.all([
        trx.selectFrom('shipment_cases')
          .select(['id', 'ref_number', 'goods_desc', 'bl_number', 'awb_number', 'tansad_number'])
          .where('deleted_at', 'is', null)
          .where(eb => eb.or([
            eb('ref_number', 'ilike', like),
            eb('bl_number', 'ilike', like),
            eb('awb_number', 'ilike', like),
            eb('tansad_number', 'ilike', like),
            eb('goods_desc', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
        trx.selectFrom('customers')
          .select(['id', 'name', 'email', 'tax_id', 'phone_wa'])
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
            eb('tax_id', 'ilike', like),
            eb('phone_wa', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
        trx.selectFrom('sales_invoices')
          .select(['id', 'invoice_number', 'client_name', 'bl_number'])
          .where(eb => eb.or([
            eb('invoice_number', 'ilike', like),
            eb('client_name', 'ilike', like),
            eb('bl_number', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
        trx.selectFrom('users')
          .select(['id', 'name', 'email', 'role'])
          .where('active', '=', true)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
        trx.selectFrom('drivers')
          .select(['id', 'name', 'phone', 'license_number'])
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('license_number', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
        trx.selectFrom('vehicles')
          .select(['id', 'plate_number', 'make', 'model'])
          .where(eb => eb.or([
            eb('plate_number', 'ilike', like),
            eb('make', 'ilike', like),
            eb('model', 'ilike', like),
          ]))
          .limit(LIMIT).execute(),
      ]);

      const data: Record<string, SearchHit[]> = {};

      if (shipments.length) data.shipments = shipments.map(s => ({
        id: s.id, label: s.ref_number, sublabel: s.goods_desc || s.bl_number || s.awb_number || null,
        path: `/clearos/clearance/${s.id}`,
      }));
      if (customers.length) data.customers = customers.map(c => ({
        id: c.id, label: c.name, sublabel: c.email || c.phone_wa || null,
        path: `/crm/customers?id=${c.id}`,
      }));
      if (invoices.length) data.invoices = invoices.map(i => ({
        id: i.id, label: i.invoice_number, sublabel: i.client_name || i.bl_number || null,
        path: `/finops/invoices`,
      }));
      if (staff.length) data.staff = staff.map(u => ({
        id: u.id, label: u.name, sublabel: u.email,
        path: `/onepi/staff/${u.id}`,
      }));
      if (drivers.length) data.drivers = drivers.map(d => ({
        id: d.id, label: d.name, sublabel: d.license_number || d.phone || null,
        path: `/tracking/drivers/${d.id}`,
      }));
      if (vehicles.length) data.vehicles = vehicles.map(v => ({
        id: v.id, label: v.plate_number || `${v.make || ''} ${v.model || ''}`.trim(), sublabel: [v.make, v.model].filter(Boolean).join(' ') || null,
        path: `/tracking/vehicles/${v.id}`,
      }));

      return { data };
    });
  });
}
