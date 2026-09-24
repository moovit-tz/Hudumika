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
  emails:    'email',
  people:    'contacts',
  organizations: 'contacts',
};

const MANAGEMENT = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER']);
function allowedCategories(role: string): Set<string> {
  if (MANAGEMENT.has(role)) return new Set(Object.keys(CATEGORY_APP));
  if (role === 'FINANCE') return new Set(['shipments', 'customers', 'invoices', 'emails', 'people', 'organizations']);
  if (role === 'SALES') return new Set(['shipments', 'customers', 'emails', 'people', 'organizations']);
  if (role === 'SENIOR' || role === 'JUNIOR' || role === 'OFFICER') return new Set(['shipments', 'customers', 'emails', 'people', 'organizations']);
  return new Set();
}

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
  // HUD-0024 continuation: this is the internal staff header search — it
  // returns other customers' names/emails/tax IDs, every staff member, every
  // driver and vehicle, and matching shipments/invoices tenant-wide. A
  // CUSTOMER account (which does have its own, separately-scoped portal
  // routes elsewhere) must not get this unscoped cross-entity view.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request) => {
    const user = request.user;
    const q = ((request.query as any).q as string || '').trim();
    // The app the user currently has open. Unknown or absent is fine — every
    // category then gets the same depth and the default order applies.
    const app = ((request.query as any).app as string || '').trim();
    if (q.length < 2) return { data: {}, order: [] };
    const like = `%${q}%`;
    const allowed = allowedCategories(user.role);

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
      const [shipments, customers, invoices, staff, drivers, vehicles, emails] = await Promise.all([
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
        trx.selectFrom('email_messages')
          .select(['id', 'subject', 'from_name', 'from_email', 'snippet', 'created_at'])
          .where('tenant_id', '=', user.tenant_id)
          .where('user_id', '=', user.sub)
          .where(eb => eb.or([
            eb('subject', 'ilike', like),
            eb('body', 'ilike', like),
            eb('from_name', 'ilike', like),
            eb('from_email', 'ilike', like),
          ]))
          .orderBy('created_at', 'desc')
          .limit(cap('emails')).execute(),
      ]);

      const data: Record<string, SearchHit[]> = {};

      // Canonical directory results honor Party visibility in SQL. A private
      // person's name must not leak through global search merely because the
      // caller knows part of it.
      const partyVisibility = (eb: any) => eb.or([
        eb('parties.visibility', '=', 'TENANT'),
        eb('parties.owner_user_id', '=', user.sub),
        eb('parties.id', 'in', trx.selectFrom('party_shares').select('party_id')
          .where('tenant_id', '=', user.tenant_id).where('principal_type', '=', 'USER').where('principal_id', '=', user.sub)),
      ]);
      const [people, organizations] = await Promise.all([
        allowed.has('people') ? trx.selectFrom('parties').select(['id', 'display_name'])
          .where('tenant_id', '=', user.tenant_id).where('party_type', '=', 'PERSON').where('status', '=', 'ACTIVE')
          .where(partyVisibility).where('display_name', 'ilike', like).limit(cap('people')).execute() : [],
        allowed.has('organizations') ? trx.selectFrom('parties').select(['id', 'display_name'])
          .where('tenant_id', '=', user.tenant_id).where('party_type', '=', 'ORGANIZATION').where('status', '=', 'ACTIVE')
          .where(partyVisibility).where('display_name', 'ilike', like).limit(cap('organizations')).execute() : [],
      ]);
      if (people.length) data.people = people.map(p => ({ id: p.id, label: p.display_name, sublabel: 'Person', path: `/contacts/contact/${p.id}` }));
      if (organizations.length) data.organizations = organizations.map(p => ({ id: p.id, label: p.display_name, sublabel: 'Organization', path: '/contacts' }));

      if (allowed.has('shipments') && shipments.length) data.shipments = shipments.map(s => ({
        id: s.id, label: s.ref_number, sublabel: s.goods_desc || s.bl_number || s.awb_number || null,
        path: `/clearos/clearance/${s.id}`,
      }));
      if (allowed.has('customers') && customers.length) data.customers = customers.map(c => ({
        id: c.id, label: c.name, sublabel: c.email || c.phone_wa || null,
        path: `/crm/customers?id=${c.id}`,
      }));
      if (allowed.has('invoices') && invoices.length) data.invoices = invoices.map(i => ({
        id: i.id, label: i.invoice_number, sublabel: i.client_name || i.bl_number || null,
        path: `/finops/invoices`,
      }));
      if (allowed.has('staff') && staff.length) data.staff = staff.map(u => ({
        id: u.id, label: u.name, sublabel: u.email,
        path: `/nexushr/staff/${u.id}`,
      }));
      if (allowed.has('drivers') && drivers.length) data.drivers = drivers.map(d => ({
        id: d.id, label: d.name, sublabel: d.license_number || d.phone || null,
        path: `/tracking/drivers/${d.id}`,
      }));
      if (allowed.has('vehicles') && vehicles.length) data.vehicles = vehicles.map(v => ({
        id: v.id, label: v.plate_number || `${v.make || ''} ${v.model || ''}`.trim(), sublabel: [v.make, v.model].filter(Boolean).join(' ') || null,
        path: `/tracking/vehicles/${v.id}`,
      }));
      if (allowed.has('emails') && emails.length) data.emails = emails.map(m => ({
        id: m.id,
        label: m.subject || '(no subject)',
        sublabel: m.from_name || m.from_email || m.snippet || null,
        path: `/email?q=${encodeURIComponent(q)}`,
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
