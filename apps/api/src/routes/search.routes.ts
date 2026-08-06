import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string | null;
  path: string;
}

const LIMIT = 6;
/** How many rows a category gets when it belongs to the app you are in. */
const FOCUSED_LIMIT = 10;
/** …and how many when it does not, so the rest stays a summary. */
const OTHER_LIMIT = 3;

/**
 * Which app owns each category. This is what lets the search prioritise where
 * you already are: searching "MAEU" from ClearOS should lead with shipments,
 * the same search from FinOps should lead with invoices, and both should still
 * show the other.
 */
const CATEGORY_APP: Record<string, string> = {
  shipments: 'clearos',
  customers: 'crm',
  invoices:  'finops',
  staff:     'nexushr',
  drivers:   'tracking',
  vehicles:  'tracking',
};

/**
 * GET /v1/search?q=…&app=… — cross-app keyword search used by the header
 * search bar.
 *
 * Covers the highest-traffic entity types (shipments, customers, invoices,
 * staff, drivers, vehicles) rather than every one of the ~150 tables in the
 * schema — each is a simple ILIKE across its main identifying columns and is
 * tenant-scoped.
 *
 * `app` is the app the user currently has open. It never restricts the search:
 * every category is still queried and returned. What it changes is depth and
 * order — the categories that app owns get FOCUSED_LIMIT rows and come first,
 * everything else gets OTHER_LIMIT and follows. Someone searching from ClearOS
 * is far more often looking for a shipment than for a vehicle, but "far more
 * often" is not "always", so the rest is never hidden.
 */
export async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const user = request.user;
    const q = ((request.query as any).q as string || '').trim();
    // The app the user currently has open. Unknown or absent is fine — every
    // category then gets the same depth and the default order applies.
    const app = ((request.query as any).app as string || '').trim();
    if (q.length < 2) return { data: {}, order: [] };
    const like = `%${q}%`;

    /** How many rows this category gets, given where the search came from. */
    const cap = (category: string) =>
      !app ? LIMIT : CATEGORY_APP[category] === app ? FOCUSED_LIMIT : OTHER_LIMIT;

    return withTenant(user.tenant_id, async (trx) => {
      /**
       * Every query below filters tenant_id explicitly.
       *
       * withTenant()'s SET LOCAL app.tenant_id only enforces RLS for a
       * non-owner DB role, and this connection uses a role that owns the
       * tables (see db/client.ts) — Postgres lets an owner bypass RLS whatever
       * the session says. Relying on withTenant() alone, which this route did,
       * meant the header search returned every tenant's shipments, customers,
       * invoices, staff, drivers and vehicles: a search for "ltd" from a
       * workspace with 4 invoices came back with 10, three of them another
       * company's, with names and reference numbers visible in the dropdown.
       */
      const [shipments, customers, invoices, staff, drivers, vehicles] = await Promise.all([
        trx.selectFrom('shipment_cases')
          .select(['id', 'ref_number', 'goods_desc', 'bl_number', 'awb_number', 'tansad_number'])
          .where('tenant_id', '=', user.tenant_id)
          .where('deleted_at', 'is', null)
          .where(eb => eb.or([
            eb('ref_number', 'ilike', like),
            eb('bl_number', 'ilike', like),
            eb('awb_number', 'ilike', like),
            eb('tansad_number', 'ilike', like),
            eb('goods_desc', 'ilike', like),
          ]))
          .limit(cap('shipments')).execute(),
        trx.selectFrom('customers')
          .select(['id', 'name', 'email', 'tax_id', 'phone_wa'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
            eb('tax_id', 'ilike', like),
            eb('phone_wa', 'ilike', like),
          ]))
          .limit(cap('customers')).execute(),
        trx.selectFrom('sales_invoices')
          .select(['id', 'invoice_number', 'client_name', 'bl_number'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('invoice_number', 'ilike', like),
            eb('client_name', 'ilike', like),
            eb('bl_number', 'ilike', like),
          ]))
          .limit(cap('invoices')).execute(),
        trx.selectFrom('users')
          .select(['id', 'name', 'email', 'role'])
          .where('tenant_id', '=', user.tenant_id)
          .where('active', '=', true)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
          ]))
          .limit(cap('staff')).execute(),
        trx.selectFrom('drivers')
          .select(['id', 'name', 'phone', 'license_number'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('license_number', 'ilike', like),
          ]))
          .limit(cap('drivers')).execute(),
        trx.selectFrom('vehicles')
          .select(['id', 'plate_number', 'make', 'model'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('plate_number', 'ilike', like),
            eb('make', 'ilike', like),
            eb('model', 'ilike', like),
          ]))
          .limit(cap('vehicles')).execute(),
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
        path: `/nexushr/staff/${u.id}`,
      }));
      if (drivers.length) data.drivers = drivers.map(d => ({
        id: d.id, label: d.name, sublabel: d.license_number || d.phone || null,
        path: `/tracking/drivers/${d.id}`,
      }));
      if (vehicles.length) data.vehicles = vehicles.map(v => ({
        id: v.id, label: v.plate_number || `${v.make || ''} ${v.model || ''}`.trim(), sublabel: [v.make, v.model].filter(Boolean).join(' ') || null,
        path: `/tracking/vehicles/${v.id}`,
      }));

      /**
       * Explicit order rather than relying on object key order. The client
       * renders in this sequence: the categories owned by the app you are in,
       * then the rest. Only categories that actually matched appear.
       */
      const present = Object.keys(data);
      const order = [
        ...present.filter(c => CATEGORY_APP[c] === app),
        ...present.filter(c => CATEGORY_APP[c] !== app),
      ];
      return { data, order, focusedApp: app || null, categoryApp: CATEGORY_APP };
    });
  });
}
