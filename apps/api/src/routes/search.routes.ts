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
  tasks:        'tasks',
  projects:     'projects',
  notes:        'notes',
  files:        'cloud',
  events:       'calendar',
  leads:        'crm',
  deals:        'crm',
  tickets:      'bliss',
  quotations:   'finops',
  products:     'finops',
  suppliers:    'finops',
  declarations: 'clearos',
  documents:    'sign',
  notifications: 'workspace',
  purchase_orders: 'finops',
  bills:        'finops',
  expenses:     'finops',
  credit_notes: 'finops',
  delivery_docs: 'finops',
  petty_cash:   'petti',
  seal_lots:    'seal',
  consignments: 'seal',
  campaigns:    'sms',
  sms_templates: 'sms',
  parcels:      'tuma',
  garage_vehicles: 'gereji',
  matters:      'lexcore',
  permits:      'complyos',
  web_pages:    'onesite',
  domains:      'onsite',
  meetings:     'bliss',
};

/**
 * Things that belong to the person searching — their tasks, notes, files,
 * calendar, sign envelopes and notifications. Every role gets these, and each
 * query below is filtered to the caller's own rows, so "who may see the
 * category" and "which rows" are answered separately.
 */
const PERSONAL = ['tasks', 'notes', 'files', 'events', 'documents', 'notifications', 'petty_cash', 'meetings'];

const MANAGEMENT = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER']);
function allowedCategories(role: string): Set<string> {
  if (MANAGEMENT.has(role)) return new Set(Object.keys(CATEGORY_APP));
  // Beyond the personal set, each role gets the categories whose pages its
  // route guards already let it open (see the shells' RequireRoles).
  const OPS = ['seal_lots', 'consignments', 'parcels', 'garage_vehicles', 'delivery_docs'];
  if (role === 'FINANCE') return new Set([...PERSONAL, 'shipments', 'customers', 'invoices', 'emails', 'people', 'organizations', 'quotations', 'products', 'suppliers', 'tickets', 'purchase_orders', 'bills', 'expenses', 'credit_notes', 'delivery_docs']);
  if (role === 'SALES') return new Set([...PERSONAL, 'shipments', 'customers', 'emails', 'people', 'organizations', 'leads', 'deals', 'quotations', 'products', 'tickets', 'campaigns', 'sms_templates']);
  if (role === 'SENIOR') return new Set([...PERSONAL, ...OPS, 'shipments', 'customers', 'emails', 'people', 'organizations', 'declarations', 'quotations', 'tickets']);
  if (role === 'JUNIOR') return new Set([...PERSONAL, ...OPS, 'shipments', 'customers', 'emails', 'people', 'organizations', 'declarations', 'tickets']);
  if (role === 'OFFICER') return new Set([...PERSONAL, ...OPS, 'shipments', 'customers', 'emails', 'people', 'organizations', 'tickets']);
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
    // scope=app narrows the search to the app that is open. Without it (the
    // default) every app is searched and the open one only comes first.
    const appOnly = ((request.query as any).scope as string) === 'app' && !!app;
    if (q.length < 2) return { data: {}, order: [] };
    const like = `%${q}%`;
    const allowed = allowedCategories(user.role);
    if (appOnly) for (const c of [...allowed]) if (CATEGORY_APP[c] !== app) allowed.delete(c);

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
        !allowed.has('shipments') ? Promise.resolve([] as any[]) : trx.selectFrom('shipment_cases')
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
        !allowed.has('customers') ? Promise.resolve([] as any[]) : trx.selectFrom('customers')
          .select(['id', 'name', 'email', 'tax_id', 'phone_wa'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
            eb('tax_id', 'ilike', like),
            eb('phone_wa', 'ilike', like),
          ]))
          .limit(cap('customers')).execute(),
        !allowed.has('invoices') ? Promise.resolve([] as any[]) : trx.selectFrom('sales_invoices')
          .select(['id', 'invoice_number', 'client_name', 'bl_number'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('invoice_number', 'ilike', like),
            eb('client_name', 'ilike', like),
            eb('bl_number', 'ilike', like),
          ]))
          .limit(cap('invoices')).execute(),
        !allowed.has('staff') ? Promise.resolve([] as any[]) : trx.selectFrom('users')
          .select(['id', 'name', 'email', 'role'])
          .where('tenant_id', '=', user.tenant_id)
          .where('active', '=', true)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('email', 'ilike', like),
          ]))
          .limit(cap('staff')).execute(),
        !allowed.has('drivers') ? Promise.resolve([] as any[]) : trx.selectFrom('drivers')
          .select(['id', 'name', 'phone', 'license_number'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('name', 'ilike', like),
            eb('license_number', 'ilike', like),
          ]))
          .limit(cap('drivers')).execute(),
        !allowed.has('vehicles') ? Promise.resolve([] as any[]) : trx.selectFrom('vehicles')
          .select(['id', 'plate_number', 'make', 'model'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([
            eb('plate_number', 'ilike', like),
            eb('make', 'ilike', like),
            eb('model', 'ilike', like),
          ]))
          .limit(cap('vehicles')).execute(),
        !allowed.has('emails') ? Promise.resolve([] as any[]) : trx.selectFrom('email_messages')
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
        path: `/finance/invoices/${i.id}`,
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
      // ── The rest of the platform ─────────────────────────────────────
      // Skipped outright when the role may not see the category, so no query
      // runs for it. Personal categories are filtered to the caller's rows;
      // tickets and projects are everyone's for management and the caller's
      // own otherwise.
      const isManagement = MANAGEMENT.has(user.role);
      const none = Promise.resolve([] as any[]);
      const [tasks, projects, notes, files, events, leads, deals, tickets, quotations, products, suppliers, declarations, documents, notifications] = await Promise.all([
        allowed.has('tasks') ? trx.selectFrom('tasks')
          .select(['id', 'title', 'due', 'completed'])
          .where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
          .where(eb => eb.or([
            eb('user_id', '=', user.sub), eb('assignee_id', '=', user.sub),
            eb('id', 'in', trx.selectFrom('task_collaborators').select('task_id')
              .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)),
          ]))
          .where(eb => eb.or([eb('title', 'ilike', like), eb('notes', 'ilike', like)]))
          .orderBy('completed', 'asc').orderBy('updated_at', 'desc').limit(cap('tasks')).execute() : none,
        allowed.has('projects') ? (() => {
          let pq = trx.selectFrom('projects').select(['id', 'name', 'ref', 'status'])
            .where('tenant_id', '=', user.tenant_id)
            .where(eb => eb.or([eb('name', 'ilike', like), eb('ref', 'ilike', like)]));
          if (!isManagement) pq = pq.where('owner_id', '=', user.sub);
          return pq.orderBy('updated_at', 'desc').limit(cap('projects')).execute();
        })() : none,
        allowed.has('notes') ? trx.selectFrom('notes')
          .select(['id', 'title', 'content'])
          .where('tenant_id', '=', user.tenant_id).where('created_by', '=', user.sub).where('is_trashed', '=', false)
          .where(eb => eb.or([eb('title', 'ilike', like), eb('content', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('notes')).execute() : none,
        allowed.has('files') ? trx.selectFrom('cloud_files')
          .select(['id', 'name', 'type'])
          .where('tenant_id', '=', user.tenant_id).where('owner_id', '=', user.sub).where('is_trash', '=', false)
          .where('name', 'ilike', like)
          .orderBy('updated_at', 'desc').limit(cap('files')).execute() : none,
        allowed.has('events') ? trx.selectFrom('calendar_events')
          .select(['id', 'title', 'start_at', 'location'])
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
          .where(eb => eb.or([eb('title', 'ilike', like), eb('location', 'ilike', like)]))
          .orderBy('start_at', 'desc').limit(cap('events')).execute() : none,
        allowed.has('leads') ? trx.selectFrom('leads')
          .select(['id', 'company', 'contact_name', 'stage'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('company', 'ilike', like), eb('contact_name', 'ilike', like), eb('contact_email', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('leads')).execute() : none,
        allowed.has('deals') ? trx.selectFrom('deals')
          .select(['id', 'name', 'stage'])
          .where('tenant_id', '=', user.tenant_id).where('name', 'ilike', like)
          .orderBy('updated_at', 'desc').limit(cap('deals')).execute() : none,
        allowed.has('tickets') ? (() => {
          let tq = trx.selectFrom('support_tickets').select(['id', 'ref_number', 'subject', 'status'])
            .where('tenant_id', '=', user.tenant_id)
            .where(eb => eb.or([eb('ref_number', 'ilike', like), eb('subject', 'ilike', like)]));
          if (!isManagement) tq = tq.where('assigned_to', '=', user.sub);
          return tq.orderBy('updated_at', 'desc').limit(cap('tickets')).execute();
        })() : none,
        allowed.has('quotations') ? trx.selectFrom('quotations')
          .select(['id', 'quote_number', 'title', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('quote_number', 'ilike', like), eb('title', 'ilike', like), eb('goods_description', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('quotations')).execute() : none,
        allowed.has('products') ? trx.selectFrom('products')
          .select(['id', 'name', 'code', 'category'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('code', 'ilike', like)]))
          .limit(cap('products')).execute() : none,
        allowed.has('suppliers') ? trx.selectFrom('suppliers')
          .select(['id', 'name', 'email', 'ref_code'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('email', 'ilike', like), eb('ref_code', 'ilike', like), eb('tax_id', 'ilike', like)]))
          .limit(cap('suppliers')).execute() : none,
        allowed.has('declarations') ? trx.selectFrom('declarations')
          .select(['id', 'tansad_number', 'tancis_ref', 'importer_name'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('tansad_number', 'ilike', like), eb('tancis_ref', 'ilike', like), eb('importer_name', 'ilike', like)]))
          .limit(cap('declarations')).execute() : none,
        allowed.has('documents') ? trx.selectFrom('sign_envelopes')
          .select(['id', 'title', 'file_name', 'status'])
          .where('tenant_id', '=', user.tenant_id).where('created_by', '=', user.sub)
          .where(eb => eb.or([eb('title', 'ilike', like), eb('file_name', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('documents')).execute() : none,
        allowed.has('notifications') ? trx.selectFrom('notifications')
          .select(['id', 'title', 'message', 'link'])
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub)
          .where('title', 'is not', null)
          .where(eb => eb.or([eb('channel', 'is', null), eb('channel', '=', 'IN_APP')]))
          .where(eb => eb.or([eb('title', 'ilike', like), eb('message', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('notifications')).execute() : none,
      ]);

      const clip = (v: unknown, n = 70) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? t.slice(0, n) + '…' : t) : null; };
      const pretty = (v: unknown) => { const t = String(v ?? '').replace(/_/g, ' ').toLowerCase(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : null; };
      if (tasks.length) data.tasks = tasks.map((t: any) => ({ id: t.id, label: t.title || '(untitled task)', sublabel: t.completed ? 'Completed' : t.due ? `Due ${String(t.due).slice(0, 10)}` : null, path: `/tasks?task=${t.id}` }));
      if (projects.length) data.projects = projects.map((p: any) => ({ id: p.id, label: p.name, sublabel: p.ref || pretty(p.status), path: `/projects/${p.id}` }));
      if (notes.length) data.notes = notes.map((n: any) => ({ id: n.id, label: n.title || clip(n.content, 50) || '(untitled note)', sublabel: n.title ? clip(n.content) : null, path: '/notes' }));
      if (files.length) data.files = files.map((f: any) => ({ id: f.id, label: f.name, sublabel: f.type === 'folder' ? 'Folder' : 'File', path: '/cloud' }));
      if (events.length) data.events = events.map((e: any) => ({ id: e.id, label: e.title, sublabel: new Date(e.start_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), path: '/calendar' }));
      if (leads.length) data.leads = leads.map((l: any) => ({ id: l.id, label: l.company || l.contact_name || 'Lead', sublabel: l.company ? (l.contact_name || pretty(l.stage)) : pretty(l.stage), path: `/crm/leads/${l.id}` }));
      if (deals.length) data.deals = deals.map((d: any) => ({ id: d.id, label: d.name, sublabel: pretty(d.stage), path: `/crm/pipeline?deal=${d.id}` }));
      if (tickets.length) data.tickets = tickets.map((t: any) => ({ id: t.id, label: t.ref_number, sublabel: clip(t.subject), path: `/bliss/inbox?id=${t.id}` }));
      if (quotations.length) data.quotations = quotations.map((x: any) => ({ id: x.id, label: x.quote_number, sublabel: clip(x.title) || pretty(x.status), path: `/finance/quotations/${x.id}` }));
      if (products.length) data.products = products.map((p: any) => ({ id: p.id, label: p.name, sublabel: p.code || p.category || null, path: `/finance/products/${p.id}` }));
      if (suppliers.length) data.suppliers = suppliers.map((s: any) => ({ id: s.id, label: s.name, sublabel: s.ref_code || s.email || null, path: `/finance/vendors/${s.id}` }));
      if (declarations.length) data.declarations = declarations.map((d: any) => ({ id: d.id, label: d.tansad_number || d.tancis_ref || 'Declaration', sublabel: d.importer_name || null, path: `/clearos/declarations/${d.id}` }));
      if (documents.length) data.documents = documents.map((d: any) => ({ id: d.id, label: d.title || d.file_name || 'Document', sublabel: pretty(d.status), path: `/sign/envelope/${d.id}` }));
      if (notifications.length) data.notifications = notifications.map((n: any) => ({ id: n.id, label: n.title, sublabel: clip(n.message), path: n.link && /^\/(?!\/)/.test(n.link) ? n.link : '/bliss/notifications' }));

      // ── Operations, money, messaging and the smaller apps ────────────
      const q2 = (cat: string, run: () => Promise<any[]>) => (allowed.has(cat) ? run() : Promise.resolve([] as any[]));
      const [purchaseOrders, bills, expenses, creditNotes, deliveryDocs, pettyCash, sealLots, consignments, campaigns, smsTemplates, parcels, garageVehicles, matters, permits, webPages, domains, meetings] = await Promise.all([
        q2('purchase_orders', () => trx.selectFrom('purchase_orders').select(['id', 'po_number', 'supplier_name', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('po_number', 'ilike', like), eb('supplier_name', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('purchase_orders')).execute()),
        q2('bills', () => trx.selectFrom('supplier_bills').select(['id', 'bill_number', 'supplier_name', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('bill_number', 'ilike', like), eb('supplier_name', 'ilike', like), eb('po_number', 'ilike', like), eb('shipment_ref', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('bills')).execute()),
        q2('expenses', () => trx.selectFrom('finance_expenses').select(['id', 'name', 'reference', 'category'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('reference', 'ilike', like), eb('note', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('expenses')).execute()),
        q2('credit_notes', () => trx.selectFrom('credit_notes').select(['id', 'credit_note_number', 'client_name', 'reason'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('credit_note_number', 'ilike', like), eb('client_name', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('credit_notes')).execute()),
        q2('delivery_docs', () => trx.selectFrom('delivery_documents').select(['id', 'doc_number', 'doc_type', 'customer_name'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('doc_number', 'ilike', like), eb('customer_name', 'ilike', like), eb('vehicle_no', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('delivery_docs')).execute()),
        q2('petty_cash', () => {
          let pq = trx.selectFrom('petti_withdrawal_requests').select(['id', 'ref', 'purpose', 'status', 'amount'])
            .where('tenant_id', '=', user.tenant_id)
            .where(eb => eb.or([eb('ref', 'ilike', like), eb('purpose', 'ilike', like), eb('payee_name', 'ilike', like)]));
          if (!MANAGEMENT.has(user.role) && user.role !== 'FINANCE') pq = pq.where('requested_by', '=', user.sub);
          return pq.orderBy('requested_at', 'desc').limit(cap('petty_cash')).execute();
        }),
        q2('seal_lots', () => trx.selectFrom('seal_lots').select(['id', 'description', 'hs_code', 'entry_reference', 'customs_status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('description', 'ilike', like), eb('hs_code', 'ilike', like), eb('entry_reference', 'ilike', like), eb('marks_and_numbers', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('seal_lots')).execute()),
        q2('consignments', () => trx.selectFrom('seal_consignments').select(['id', 'transport_doc_number', 'goods_description', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('transport_doc_number', 'ilike', like), eb('goods_description', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('consignments')).execute()),
        q2('campaigns', () => trx.selectFrom('sms_campaigns').select(['id', 'name', 'body', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('body', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('campaigns')).execute()),
        q2('sms_templates', () => trx.selectFrom('sms_templates').select(['id', 'name', 'body'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('body', 'ilike', like)]))
          .limit(cap('sms_templates')).execute()),
        q2('parcels', () => trx.selectFrom('tuma_parcels').select(['id', 'parcel_number', 'name', 'recipient_name', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('parcel_number', 'ilike', like), eb('name', 'ilike', like), eb('sender_name', 'ilike', like), eb('recipient_name', 'ilike', like), eb('recipient_phone', 'ilike', like)]))
          .orderBy('created_at', 'desc').limit(cap('parcels')).execute()),
        q2('garage_vehicles', () => trx.selectFrom('finance_vehicle_records').select(['id', 'registration', 'make', 'model'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('registration', 'ilike', like), eb('vin', 'ilike', like), eb('make', 'ilike', like), eb('model', 'ilike', like)]))
          .limit(cap('garage_vehicles')).execute()),
        q2('matters', () => trx.selectFrom('legal_matters').select(['id', 'matter_number', 'title', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('matter_number', 'ilike', like), eb('title', 'ilike', like), eb('court_case_number', 'ilike', like), eb('opposing_party', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('matters')).execute()),
        q2('permits', () => trx.selectFrom('comply_certificates').select(['id', 'name', 'cert_number', 'agency_name', 'expiry_date'])
          .where('tenant_id', '=', user.tenant_id)
          .where(eb => eb.or([eb('name', 'ilike', like), eb('cert_number', 'ilike', like), eb('agency_name', 'ilike', like), eb('holder_name', 'ilike', like)]))
          .limit(cap('permits')).execute()),
        q2('web_pages', () => trx.selectFrom('cms_pages').select(['id', 'title', 'slug', 'status'])
          .where('tenant_id', '=', user.tenant_id).where('trashed_at', 'is', null)
          .where(eb => eb.or([eb('title', 'ilike', like), eb('slug', 'ilike', like)]))
          .orderBy('updated_at', 'desc').limit(cap('web_pages')).execute()),
        q2('domains', () => trx.selectFrom('onsite_domains').select(['id', 'domain', 'status', 'expires_at'])
          .where('tenant_id', '=', user.tenant_id).where('domain', 'ilike', like)
          .limit(cap('domains')).execute()),
        q2('meetings', () => trx.selectFrom('bliss_meetings').select(['id', 'title', 'scheduled_at', 'status'])
          .where('tenant_id', '=', user.tenant_id).where('host_id', '=', user.sub).where('title', 'ilike', like)
          .orderBy('created_at', 'desc').limit(cap('meetings')).execute()),
      ]);

      const day = (v: unknown) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
      if (purchaseOrders.length) data.purchase_orders = purchaseOrders.map((x: any) => ({ id: x.id, label: x.po_number, sublabel: x.supplier_name || pretty(x.status), path: `/finance/purchase-orders/${x.id}` }));
      if (bills.length) data.bills = bills.map((x: any) => ({ id: x.id, label: x.bill_number || 'Supplier bill', sublabel: x.supplier_name || pretty(x.status), path: `/finance/bills/${x.id}` }));
      if (expenses.length) data.expenses = expenses.map((x: any) => ({ id: x.id, label: x.name, sublabel: x.reference || pretty(x.category), path: `/finance/expenses/${x.id}` }));
      if (creditNotes.length) data.credit_notes = creditNotes.map((x: any) => ({ id: x.id, label: x.credit_note_number, sublabel: x.client_name || clip(x.reason), path: `/finance/credit-notes/${x.id}` }));
      if (deliveryDocs.length) data.delivery_docs = deliveryDocs.map((x: any) => ({ id: x.id, label: x.doc_number || 'Delivery document', sublabel: x.customer_name || pretty(x.doc_type), path: `/finance/delivery-documents/${x.id}` }));
      if (pettyCash.length) data.petty_cash = pettyCash.map((x: any) => ({ id: x.id, label: x.ref || 'Petty cash request', sublabel: clip(x.purpose) || pretty(x.status), path: '/petti/withdrawals' }));
      if (sealLots.length) data.seal_lots = sealLots.map((x: any) => ({ id: x.id, label: clip(x.description, 50) || x.entry_reference || 'Lot', sublabel: [x.hs_code, x.entry_reference].filter(Boolean).join(' · ') || pretty(x.customs_status), path: `/seal/lots/${x.id}` }));
      if (consignments.length) data.consignments = consignments.map((x: any) => ({ id: x.id, label: x.transport_doc_number || 'Consignment', sublabel: clip(x.goods_description) || pretty(x.status), path: '/seal/consignments' }));
      if (campaigns.length) data.campaigns = campaigns.map((x: any) => ({ id: x.id, label: x.name, sublabel: pretty(x.status) || clip(x.body), path: `/sms/campaigns/${x.id}` }));
      if (smsTemplates.length) data.sms_templates = smsTemplates.map((x: any) => ({ id: x.id, label: x.name, sublabel: clip(x.body), path: '/sms/templates' }));
      if (parcels.length) data.parcels = parcels.map((x: any) => ({ id: x.id, label: x.parcel_number, sublabel: [x.name, x.recipient_name].filter(Boolean).join(' → ') || pretty(x.status), path: '/tuma/parcels' }));
      if (garageVehicles.length) data.garage_vehicles = garageVehicles.map((x: any) => ({ id: x.id, label: x.registration, sublabel: [x.make, x.model].filter(Boolean).join(' ') || null, path: '/gereji/vehicles' }));
      if (matters.length) data.matters = matters.map((x: any) => ({ id: x.id, label: x.matter_number, sublabel: clip(x.title), path: '/lexcore/matters' }));
      if (permits.length) data.permits = permits.map((x: any) => ({ id: x.id, label: x.name, sublabel: [x.cert_number, x.agency_name].filter(Boolean).join(' · ') || null, path: '/complyos/vault' }));
      if (webPages.length) data.web_pages = webPages.map((x: any) => ({ id: x.id, label: x.title || x.slug, sublabel: x.slug ? `/${x.slug}` : pretty(x.status), path: '/cms?v=pages' }));
      if (domains.length) data.domains = domains.map((x: any) => ({ id: x.id, label: x.domain, sublabel: x.expires_at ? `Expires ${day(x.expires_at)}` : pretty(x.status), path: `/onsite/domains/${x.id}` }));
      if (meetings.length) data.meetings = meetings.map((x: any) => ({ id: x.id, label: x.title || 'Meeting', sublabel: x.scheduled_at ? day(x.scheduled_at) : pretty(x.status), path: '/bliss/meetings' }));

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
      return { data, order, focusedApp: app || null, categoryApp: CATEGORY_APP, scope: appOnly ? 'app' : 'all' };
    });
  });
}
