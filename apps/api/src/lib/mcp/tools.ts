/**
 * The MCP tool catalog. Each tool runs an existing route (see `routes`) as the
 * verified caller; the route's own entitlement, role and record rules apply.
 * Field lists are deliberately narrow: only what a task needs, never internal
 * ids/hashes/blobs (e.g. eSign document_data, email bodies).
 */
import { createHash } from 'crypto';
import type { McpTool } from './types.js';
import type { FieldSpec } from './types.js';
import { LIMIT_PROP, McpToolError, UUID_PROP, inputSchema, listOutputSchema, objectSchema, project, rowsOf, shapeList } from './types.js';
import { ADMIN_ROLES, MANAGER_ROLES, detailTool, listTool, summaryTool } from './builders.js';

const STR = { type: 'string', maxLength: 100 } as const;
const ISO_DATE = { type: 'string', format: 'date', description: 'YYYY-MM-DD' } as const;

// ── ClearOS ───────────────────────────────────────────────────────────────
const SHIPMENT_FIELDS = {
  id: 'string', ref_number: ['string', 'Shipment reference'], type: 'string', stage: 'string',
  goods_desc: 'string', bl_number: 'string', awb_number: 'string', vessel: 'string',
  origin_port: 'string', dest_port: 'string', eta: 'string', customer_id: 'string', sla_deadline: 'string',
} as const;

const clearos: McpTool[] = [
  listTool({
    id: 'clearos.list_shipments', app: 'clearos', entitlement: 'clearos', actors: ['staff', 'customer'],
    title: 'List shipments',
    description: 'Clearing shipments visible to you, newest first. Customers see only their own shipments; junior officers only those assigned to them.',
    path: '/v1/shipments', fields: SHIPMENT_FIELDS,
    filters: {
      stage: { schema: { ...STR, description: 'Workflow stage, e.g. CUSTOMS_CLEARANCE' } },
      type: { schema: { ...STR, description: 'SEA_FCL, SEA_LCL, AIR, ROAD …' } },
      search: { schema: { ...STR, description: 'Server-side search on reference, BL, goods' } },
      customer_id: { schema: UUID_PROP('Only shipments for this customer (staff)') },
    },
  }),
  detailTool({
    id: 'clearos.get_shipment', app: 'clearos', entitlement: 'clearos', actors: ['staff', 'customer'],
    title: 'Get a shipment', description: 'One shipment by id, if you are allowed to see it.',
    path: id => `/v1/shipments/${id}`, routeLabel: '/v1/shipments/:id', idDescription: 'Shipment id',
    fields: { ...SHIPMENT_FIELDS, hs_code: 'string', containers: 'array', created_at: 'string' },
  }),
  listTool({
    id: 'clearos.list_declarations', app: 'clearos', entitlement: 'clearos',
    title: 'List customs declarations', description: 'TANCIS/TANSAD customs declarations.',
    path: '/v1/declarations',
    fields: { id: 'string', shipment_id: 'string', tansad_number: 'string', tancis_ref: 'string', declaration_mode: 'string', clearing_office: 'string', reference_date: 'string', total_packages: 'number', gross_weight_kg: 'number' },
  }),
  listTool({
    id: 'clearos.list_quotations', app: 'clearos', entitlement: ['clearos', 'crm'], actors: ['staff', 'customer'],
    title: 'List quotations', description: 'Freight and clearing quotations. Customers see only quotations addressed to them.',
    path: '/v1/quotations',
    fields: { id: 'string', quote_number: 'string', title: 'string', customer_name: 'string', shipment_type: 'string', origin_port: 'string', destination_port: 'string', total_amount: 'number', currency: 'string', status: 'string', valid_until: 'string', created_at: 'string' },
  }),
];

// ── FinOps & POS & Petti ─────────────────────────────────────────────────
const INVOICE_FIELDS = {
  id: 'string', invoice_number: 'string', client_name: 'string', customer_id: 'string', shipment_ref: 'string',
  status: 'string', bill_date: 'string', due_date: 'string', currency: 'string', received: 'number', tra_total_incl: ['number', 'Total incl. VAT as fiscalised with TRA, when available'], mode: 'string',
} as const;

const finops: McpTool[] = [
  listTool({
    id: 'finops.list_invoices', app: 'finops', entitlement: 'finops', actors: ['staff', 'customer'],
    title: 'List sales invoices', description: 'Sales invoices, newest first; filter by status or customer. Customers see only their own issued invoices.',
    path: '/v1/invoices', fields: INVOICE_FIELDS, serverLimit: true,
    filters: {
      status: { schema: { type: 'string', enum: ['Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Void'] } },
      customer_id: { schema: UUID_PROP('Only invoices for this customer') },
      invoice_number: { schema: STR },
    },
  }),
  detailTool({
    id: 'finops.get_invoice', app: 'finops', entitlement: 'finops', actors: ['staff', 'customer'],
    title: 'Get an invoice', description: 'One sales invoice by id. Customers can open only their own issued invoices.',
    path: id => `/v1/invoices/${id}`, routeLabel: '/v1/invoices/:id', idDescription: 'Invoice id',
    fields: { ...INVOICE_FIELDS, payment_terms: 'string', sale_agent: 'string', bl_number: 'string', origin: 'string', destination: 'string' },
  }),
  summaryTool({
    id: 'finops.invoice_summary', app: 'finops', entitlement: 'finops',
    title: 'Invoice totals', description: 'Invoice counts by status and totals by currency.',
    path: '/v1/invoices/stats',
    fields: { total_invoices: 'integer', total_received: 'number', status_counts: 'object', currency_totals: 'object' },
  }),
  listTool({
    id: 'finops.list_bills', app: 'finops', entitlement: 'finops',
    title: 'List supplier bills', description: 'Accounts-payable bills from suppliers.',
    path: '/v1/bills',
    fields: { id: 'string', bill_number: 'string', supplier_name: 'string', status: 'string', bill_date: 'string', due_date: 'string', currency: 'string', total: 'number', paid_amount: 'number', po_number: 'string' },
  }),
];

const pos: McpTool[] = [
  listTool({
    id: 'pos.list_sales', app: 'pos', entitlement: ['finops', 'pos'],
    title: 'List POS sales', description: 'Point-of-sale receipts, newest first.',
    path: '/v1/finance/pos/sales', itemsKey: 'items',
    fields: { id: 'string', sale_number: 'string', customer_name: 'string', status: 'string', currency: 'string', grand_total: 'number', amount_paid: 'number', sold_at: 'string' },
  }),
  listTool({
    id: 'pos.sales_report', app: 'pos', entitlement: ['finops', 'pos'],
    title: 'POS completed sales', description: 'Completed POS sales in a date range, with tax and discounts.',
    path: '/v1/finance/pos/sales-report',
    filters: { from: { schema: ISO_DATE }, to: { schema: ISO_DATE } },
    fields: { id: 'string', sale_number: 'string', customer_name: 'string', currency: 'string', grand_total: 'number', tax_total: 'number', discount_total: 'number', sold_at: 'string' },
  }),
];

const petti: McpTool[] = [
  listTool({
    id: 'petti.list_wallets', app: 'petti', entitlement: 'petti',
    title: 'List petty-cash wallets', description: 'Petty-cash wallets and their current balance.',
    path: '/v1/petti/wallets', fields: { id: 'string', name: 'string', description: 'string', currency: 'string', status: 'string', balance: 'number' },
  }),
  summaryTool({
    id: 'petti.transactions_summary', app: 'petti', entitlement: 'petti',
    title: 'Petty-cash totals', description: 'Total inflow, outflow and pending requests.',
    path: '/v1/petti/transactions/summary', fields: { total_inflow: 'number', total_outflow: 'number', pending_count: 'integer' },
  }),
];

// ── ComplyOS ──────────────────────────────────────────────────────────────
const complyos: McpTool[] = [
  summaryTool({
    id: 'complyos.compliance_dashboard', app: 'complyos', entitlement: 'complyos', roles: MANAGER_ROLES,
    title: 'Compliance health', description: 'Licence/certificate health score, expiries and overdue obligations.',
    path: '/v1/comply/dashboard',
    fields: { health_score: 'number', active_certs: 'integer', expiring_soon: 'integer', overdue: 'integer', pending_apps: 'integer', pending_renewals: 'integer', upcoming_deadlines: 'array' },
  }),
  listTool({
    id: 'complyos.list_obligations', app: 'complyos', entitlement: 'complyos', roles: MANAGER_ROLES,
    title: 'List compliance obligations', description: 'Regulatory obligations with due dates and status.',
    path: '/v1/comply/obligations',
    fields: { id: 'string', obligation_code: 'string', name: 'string', agency_code: 'string', frequency: 'string', mandatory: 'boolean', status: 'string', due_date: 'string', last_fulfilled_date: 'string', customer_name: 'string' },
  }),
  listTool({
    id: 'complyos.list_renewals', app: 'complyos', entitlement: 'complyos', roles: MANAGER_ROLES,
    title: 'List licence renewals', description: 'Renewal workflows for certificates and licences.',
    path: '/v1/comply/renewals',
    fields: { id: 'string', cert_name: 'string', agency_code: 'string', status: 'string', trigger: 'string', triggered_at: 'string', approved_by_name: 'string', submitted_at: 'string', completed_at: 'string' },
  }),
];

// ── Bliss (support + chat) ───────────────────────────────────────────────
const TICKET_FIELDS = {
  id: 'string', ref: 'string', subject: 'string', status: 'string', priority: 'string', category: 'string',
  channel: 'string', customer: 'string', customer_id: 'string', sla_deadline: 'string', created_at: 'string', updated_at: 'string',
} as const;

const bliss: McpTool[] = [
  listTool({
    id: 'bliss.list_tickets', app: 'bliss', entitlement: 'bliss', actors: ['staff', 'customer'],
    title: 'List support tickets', description: 'Support tickets, newest first. Customers see only their own tickets.',
    path: '/v1/support/tickets', fields: TICKET_FIELDS,
    filters: { customer_id: { schema: UUID_PROP('Only tickets for this customer (staff)') } },
  }),
  detailTool({
    id: 'bliss.get_ticket', app: 'bliss', entitlement: 'bliss', actors: ['staff', 'customer'],
    title: 'Get a support ticket', description: 'One ticket and its description.',
    path: id => `/v1/support/tickets/${id}`, routeLabel: '/v1/support/tickets/:id', idDescription: 'Ticket id',
    fields: { ...TICKET_FIELDS, description: 'string' },
    unwrap: b => b?.ticket ?? b,
  }),
  listTool({
    id: 'bliss.list_kb_articles', app: 'bliss', entitlement: 'bliss',
    title: 'List help-centre articles', description: 'Knowledge-base articles.',
    path: '/v1/support/kb/articles', fields: { id: 'string', title: 'string', status: 'string', views: 'integer', category_name: 'string', updated_at: 'string' },
  }),
  listTool({
    id: 'bliss.list_chat_channels', app: 'bliss', entitlement: 'bliss',
    title: 'List team chat channels', description: 'Chat channels and direct messages you belong to, with unread counts. Message text is not included.',
    path: '/v1/chat/channels', fields: { id: 'string', type: 'string', name: 'string', description: 'string', unread: 'integer', last_message_at: 'string' },
  }),
];

// ── Axis (nexushr) ────────────────────────────────────────────────────────
const nexushr: McpTool[] = [
  listTool({
    id: 'nexushr.list_staff', app: 'nexushr', entitlement: 'nexushr',
    title: 'List staff', description: 'Employees in your organization (names, roles and departments only).',
    path: '/v1/hr/staff',
    fields: { id: 'string', name: 'string', email: 'string', role: 'string', department_name: 'string', designation_title: 'string', status: 'string', hireDate: 'string', active: 'boolean' },
  }),
  listTool({
    id: 'nexushr.list_departments', app: 'nexushr', entitlement: 'nexushr',
    title: 'List departments', description: 'Departments and their heads.',
    path: '/v1/hr/departments', fields: { id: 'string', name: 'string', status: 'string', head_name: 'string' },
  }),
  summaryTool({
    id: 'nexushr.my_leave_balances', app: 'nexushr', entitlement: 'nexushr',
    title: 'My leave balances', description: 'Your own leave entitlement, taken, pending and remaining days by leave type.',
    path: '/v1/hr/leave-balances', fields: { configured: 'boolean', balances: 'array' },
    pick: b => ({ configured: b?.configured, balances: (b?.balances ?? []).map((x: any) => project(x, { code: 'string', name: 'string', entitled: 'number', taken: 'number', pending: 'number', remaining: 'number' })) }),
  }),
];

// ── CMS (onesite) / Onsite ───────────────────────────────────────────────
const onesite: McpTool[] = [
  listTool({
    id: 'onesite.list_pages', app: 'onesite', entitlement: 'onesite',
    title: 'List website pages', description: 'CMS pages and their publish status.',
    path: '/v1/cms/pages', fields: { id: 'string', title: 'string', slug: 'string', status: 'string', locale: 'string', publish_at: 'string', updated_at: 'string' },
  }),
  listTool({
    id: 'onesite.list_posts', app: 'onesite', entitlement: 'onesite',
    title: 'List blog posts', description: 'CMS blog posts.',
    path: '/v1/cms/posts', fields: { id: 'string', title: 'string', slug: 'string', status: 'string', category: 'string', publish_at: 'string', updated_at: 'string' },
  }),
  listTool({
    id: 'onesite.list_forms', app: 'onesite', entitlement: 'onesite',
    title: 'List website forms', description: 'CMS forms (name and key).',
    path: '/v1/cms/forms', fields: { id: 'string', key: 'string', name: 'string', created_at: 'string', updated_at: 'string' },
  }),
];

const onsite: McpTool[] = [
  summaryTool({
    id: 'onsite.hosting_overview', app: 'onsite', entitlement: 'onsite',
    title: 'Hosting overview', description: 'Projects, domains, SSL expiries, servers and today’s deployments.',
    path: '/v1/onsite/overview',
    fields: { projects: 'integer', domains: 'integer', domains_expiring_soon: 'integer', ssl_expiring_soon: 'integer', applications: 'integer', deployments_today: 'integer', failed_deployments_today: 'integer', servers: 'integer', servers_healthy: 'integer' },
  }),
  listTool({
    id: 'onsite.list_domains', app: 'onsite', entitlement: 'onsite',
    title: 'List domains', description: 'Domains with registrar expiry and SSL status.',
    path: '/v1/onsite/domains', fields: { id: 'string', domain: 'string', registrar: 'string', status: 'string', expires_at: 'string', auto_renew: 'boolean', dns_status: 'string', ssl_status: 'string', ssl_expires_at: 'string' },
  }),
];

// ── Ondi (identity & access) ─────────────────────────────────────────────
const ondi: McpTool[] = [
  listTool({
    id: 'ondi.list_members', app: 'ondi', entitlement: 'ondi', roles: ADMIN_ROLES,
    title: 'List workspace members', description: 'People with a login in this workspace, their role and last sign-in.',
    path: '/v1/ondi/users', fields: { id: 'string', name: 'string', email: 'string', role: 'string', active: 'boolean', last_login_at: 'string' },
  }),
  listTool({
    id: 'ondi.list_sign_ins', app: 'ondi', entitlement: 'ondi', roles: ADMIN_ROLES,
    title: 'Recent sign-ins', description: 'Recent sign-in attempts in this workspace (who, when, success or failure). IP addresses are not included.',
    path: '/v1/ondi/login-history', fields: { id: 'string', user_name: 'string', status: 'string', created_at: 'string' },
  }),
];

// ── HuduFreight (tracking), CargoTracker, Demurrage, SEAL ────────────────
const tracking: McpTool[] = [
  summaryTool({
    id: 'tracking.fleet_summary', app: 'tracking', entitlement: 'tracking',
    title: 'Fleet summary', description: 'Vehicles moving/stopped/offline, today’s trips, expiring documents and 30-day costs.',
    path: '/v1/tracking/dashboard-summary',
    fields: { vehicles: 'object', trips_today: 'integer', trips_completed_today: 'integer', expiring_documents: 'integer', pending_reminders: 'integer', costs_30d: 'object' },
  }),
  listTool({
    id: 'tracking.list_vehicles', app: 'tracking', entitlement: 'tracking',
    title: 'List vehicles', description: 'Fleet vehicles with driver and status.',
    path: '/v1/tracking/vehicles', fields: { id: 'string', name: 'string', plate_number: 'string', type: 'string', make: 'string', model: 'string', year: 'integer', status: 'string', driver_name: 'string', ownership: 'string' },
  }),
  listTool({
    id: 'tracking.list_consignments', app: 'tracking', entitlement: 'tracking',
    title: 'List road consignments', description: 'Road-freight consignments with route, vehicle and status.',
    path: '/v1/consignments', fields: { id: 'string', consignment_number: 'string', goods_description: 'string', origin_location: 'string', destination_location: 'string', status: 'string', dispatched_at: 'string', delivered_at: 'string', vehicle_registration: 'string', customer_name: 'string', transport_cost: 'number', cost_currency: 'string' },
  }),
];

const TRACKED_FIELDS = { id: 'string', container_number: 'string', size_type: 'string', carrier_name: 'string', snapshot_count: 'integer' } as const;
const cargotracker: McpTool[] = [
  summaryTool({
    id: 'cargotracker.tracking_summary', app: 'cargotracker', entitlement: 'cargotracker',
    title: 'Cargo tracking summary', description: 'Tracked shipments, containers, delays and arrivals at port of discharge.',
    path: '/v1/cargotracker/dashboard/summary', fields: { shipments: 'integer', containers: 'integer', delayed_shipments: 'integer', shipments_at_pod: 'integer' },
  }),
  {
    ...listTool({
      id: 'cargotracker.list_tracked_containers', app: 'cargotracker', entitlement: 'cargotracker',
      title: 'List tracked containers', description: 'Containers and tracking numbers being tracked, with carrier and the number of tracking updates.',
      path: '/v1/tracker/tracked', fields: TRACKED_FIELDS,
    }),
    async run(ctx, args) {
      const body = await ctx.get('/v1/tracker/tracked', { limit: 100 });
      const rows = rowsOf(body).map((r: any) => ({
        id: r.id, container_number: r.container?.container_number ?? r.snapshots?.[0]?.tracking_number ?? null,
        size_type: r.container?.size_type ?? null, carrier_name: r.container?.carrier_name ?? r.snapshots?.[0]?.carrier ?? null,
        snapshot_count: Array.isArray(r.snapshots) ? r.snapshots.length : 0,
      }));
      return shapeList(rows, TRACKED_FIELDS, args);
    },
  },
];

const demurrage: McpTool[] = [
  summaryTool({
    id: 'demurrage.summary', app: 'demurrage', entitlement: 'demurrage',
    title: 'Demurrage exposure', description: 'Containers on demurrage and accrued cost by currency.',
    path: '/v1/demurrage/summary',
    fields: { total_containers: 'integer', active_containers: 'integer', completed_containers: 'integer', unpriced_containers: 'integer', total_demurrage_cost: 'number', active_demurrage_cost: 'number', currency: 'string', by_currency: 'object' },
  }),
  listTool({
    id: 'demurrage.list_containers', app: 'demurrage', entitlement: 'demurrage',
    title: 'List demurrage containers', description: 'Containers with free days, demurrage days and cost.',
    path: '/v1/demurrage/containers',
    fields: { id: 'string', container_number: 'string', container_size: 'string', carrier_name: 'string', discharge_date: 'string', gate_out_date: 'string', return_date: 'string', free_days: 'integer', demurrage_days: 'integer', demurrage_cost: 'number', demurrage_currency: 'string', status: 'string', shipment_id: 'string' },
  }),
];

const seal: McpTool[] = [
  summaryTool({
    id: 'seal.bonded_summary', app: 'seal', entitlement: 'seal',
    title: 'Bonded warehouse summary', description: 'Compartments, lots, expiring lots and lots by status.',
    path: '/v1/seal/dashboard', fields: { compartmentCount: 'integer', lotCount: 'integer', expiringSoonCount: 'integer', byStatus: 'array' },
  }),
  listTool({
    id: 'seal.compartment_occupancy', app: 'seal', entitlement: 'seal',
    title: 'Compartment occupancy', description: 'Number of lots in each bonded compartment.',
    path: '/v1/seal/compartments/summary', fields: { compartment_id: 'string', lot_count: 'integer' },
  }),
];

// ── Cloud, Workspace, Email, Contacts, CRM ───────────────────────────────
const cloud: McpTool[] = [
  listTool({
    id: 'cloud.list_drives', app: 'cloud', entitlement: 'cloud',
    title: 'List drives', description: 'Shared and personal drives you can open.',
    path: '/v1/drives', fields: { id: 'string', name: 'string', type: 'string', owner_name: 'string', managed_purpose: 'string', updated_at: 'string' },
  }),
  listTool({
    id: 'cloud.list_files', app: 'cloud', entitlement: 'cloud',
    title: 'List files in a drive', description: 'Files and folders in one drive (names and metadata only; no file contents).',
    path: '/v1/files',
    filters: { drive_id: { schema: UUID_PROP('Drive id from cloud.list_drives') }, parent_id: { schema: UUID_PROP('Folder id (optional)') } },
    fields: { id: 'string', name: 'string', type: 'string', mime_type: 'string', size_bytes: 'integer', updated_at: 'string', created_by_name: 'string' },
  }),
];
// drive_id is mandatory for the route.
(cloud[1].inputSchema as any).required = ['drive_id'];

const workspace: McpTool[] = [
  listTool({
    id: 'workspace.list_notifications', app: 'workspace', entitlement: null, actors: ['staff', 'customer'],
    title: 'My notifications', description: 'Your recent notifications across Hudumika apps.',
    path: '/v1/notifications', itemsKey: 'notifications',
    fields: { id: 'string', type: 'string', title: 'string', message: 'string', read: 'boolean', link: 'string', created_at: 'string' },
  }),
  {
    id: 'workspace.search', app: 'workspace', entitlement: null, access: 'read', actors: ['staff'],
    title: 'Search the workspace', description: 'Search records across the apps you can use (customers, shipments, invoices, people …). Each result type comes from an app you have access to.',
    routes: ['GET /v1/search'],
    inputSchema: inputSchema({ q: { type: 'string', minLength: 2, maxLength: 200 }, limit: LIMIT_PROP }, ['q']),
    outputSchema: { type: 'object', properties: { groups: { type: 'array', items: objectSchema({ type: 'string', items: 'array' }) } }, required: ['groups'] },
    async run(ctx, args) {
      const body = await ctx.get('/v1/search', { q: args.q });
      const limit = Math.min(Number(args.limit) || 25, 100);
      const order: string[] = Array.isArray(body?.order) ? body.order : Object.keys(body?.data ?? {});
      return {
        groups: order.map(type => ({
          type,
          // SearchHit (routes/search.routes.ts): label, sublabel and the in-app path.
          items: (body?.data?.[type] ?? []).slice(0, limit).map((r: any) => project(r, { id: 'string', label: 'string', sublabel: 'string', path: 'string' })),
        })),
      };
    },
  },
];

const email: McpTool[] = [
  listTool({
    id: 'email.list_messages', app: 'email', entitlement: 'email',
    title: 'List my email', description: 'Messages in one of your mail folders: sender, subject and a short snippet. Full bodies and attachments are not returned.',
    path: '/v1/emails', itemsKey: 'items', serverLimit: true,
    filters: { folder: { schema: { type: 'string', enum: ['inbox', 'sent', 'drafts', 'starred', 'archive', 'trash'], default: 'inbox' } } },
    query: { folder: 'inbox' },
    fields: { id: 'string', folder: 'string', from: 'string', subject: 'string', snippet: 'string', date: 'string', read: 'boolean', starred: 'boolean', hasAttachment: 'boolean', threadId: 'string' },
  }),
];

const contacts: McpTool[] = [
  listTool({
    id: 'contacts.list_contacts', app: 'contacts', entitlement: 'contacts',
    title: 'List contacts', description: 'People in your contacts.',
    path: '/v1/contacts', filters: { q: { schema: { ...STR, description: 'Server-side search' } } },
    fields: { id: 'string', first_name: 'string', last_name: 'string', email: 'string', phone: 'string', company: 'string', job_title: 'string', status: 'string' },
  }),
  listTool({
    id: 'contacts.upcoming_birthdays', app: 'contacts', entitlement: 'contacts',
    title: 'Upcoming birthdays', description: 'Contacts with a birthday coming up.',
    path: '/v1/contacts/birthdays', fields: { id: 'string', first_name: 'string', last_name: 'string', birthday: 'string', days_until: 'integer' },
  }),
];

const CUSTOMER_FIELDS = { id: 'string', name: 'string', contact_name: 'string', email: 'string', phone: 'string', category: 'string', tax_id: 'string', active: 'boolean', created_at: 'string' } as const;
const crm: McpTool[] = [
  listTool({
    id: 'crm.list_customers', app: 'crm', entitlement: 'crm',
    title: 'List customers', description: 'Customer accounts.', path: '/v1/customers', fields: CUSTOMER_FIELDS,
  }),
  detailTool({
    id: 'crm.get_customer', app: 'crm', entitlement: 'crm',
    title: 'Get a customer', description: 'One customer account by id.',
    path: id => `/v1/customers/${id}`, routeLabel: '/v1/customers/:id', idDescription: 'Customer id', fields: { ...CUSTOMER_FIELDS, preferred_channel: 'string', source: 'string' },
  }),
  listTool({
    id: 'crm.list_leads', app: 'crm', entitlement: 'crm',
    title: 'List leads', description: 'Sales leads with stage and value.',
    path: '/v1/leads', fields: { id: 'string', company: 'string', contact_name: 'string', source: 'string', stage: 'string', value: 'number', priority: 'string', created_at: 'string' },
  }),
  listTool({
    id: 'crm.list_deals', app: 'crm', entitlement: 'crm',
    title: 'List deals', description: 'Pipeline deals with stage, value and expected close.',
    path: '/v1/deals', fields: { id: 'string', name: 'string', customer_id: 'string', stage: 'string', value: 'number', currency: 'string', probability: 'number', expected_close: 'string', closed_at: 'string', source: 'string' },
  }),
];

// ── Store, Developer ─────────────────────────────────────────────────────
const store: McpTool[] = [
  listTool({
    id: 'store.list_apps', app: 'store', entitlement: null,
    title: 'Browse the app store', description: 'Apps available in the Hudumika Store.',
    path: '/v1/store/apps', fields: { id: 'string', name: 'string', developer_name: 'string', category: 'string', shortDesc: 'string', rating: 'number', installs: 'integer', status: 'string' },
  }),
  listTool({
    id: 'store.list_installed', app: 'store', entitlement: null,
    title: 'Installed store apps', description: 'Store apps installed in this workspace.',
    path: '/v1/store/installed', fields: { id: 'string', app_id: 'string', status: 'string', version_id: 'string', installed_at: 'string' },
  }),
];

const developer: McpTool[] = [
  listTool({
    id: 'developer.list_api_products', app: 'developer', entitlement: null,
    title: 'List API products', description: 'Hudumika API products in the developer catalog.',
    path: '/v1/developer/catalog', fields: { id: 'string', code: 'string', name: 'string', short_description: 'string', category: 'string', execution_mode: 'string', status: 'string' },
  }),
  listTool({
    id: 'developer.list_accounts', app: 'developer', entitlement: null,
    title: 'My developer accounts', description: 'Your personal and organization developer accounts.',
    path: '/v1/developer/accounts', fields: { id: 'string', type: 'string', name: 'string', slug: 'string', status: 'string', created_at: 'string' },
  }),
];

// ── Calendar, Tasks, Notes ───────────────────────────────────────────────
const calendar: McpTool[] = [
  listTool({
    id: 'calendar.list_events', app: 'calendar', entitlement: null,
    title: 'List my calendar events', description: 'Your events (and recurring occurrences) between two dates.',
    path: '/v1/tasks/events',
    filters: { from: { schema: ISO_DATE }, to: { schema: ISO_DATE }, search: { schema: STR } },
    fields: { id: 'string', title: 'string', start_at: 'string', end_at: 'string', all_day: 'boolean', location: 'string', category: 'string', is_recurring: 'boolean', occurrenceDate: 'string', meeting_url: 'string' },
  }),
];

/** Derive a stable UUID from an idempotency key, so a retried create can
 *  never insert a second row even if it reached the route twice. */
function uuidFromKey(scope: string, key: string): string {
  const h = createHash('sha256').update(`${scope}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Write tools answer with a confirmation request first, then the result. */
function writeOutput(result: Record<string, unknown>) {
  return {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['confirmation_required', 'done', 'already_done'] },
      summary: { type: 'string' }, confirmation_token: { type: 'string' }, expires_at: { type: 'string' },
      next_step: { type: 'string' }, replayed: { type: 'boolean' }, result,
    },
    required: ['status'],
  };
}

const WRITE_PROPS = {
  idempotency_key: { type: 'string', minLength: 8, maxLength: 120, description: 'Unique per intended change. Reusing it returns the first result instead of writing again.' },
  confirmation_token: { type: 'string', description: 'Omit on the first call; pass the token from the confirmation response to carry out the change.' },
};

const tasks: McpTool[] = [
  listTool({
    id: 'tasks.list_tasks', app: 'tasks', entitlement: null,
    title: 'List my tasks', description: 'Your tasks with due date, status and priority.',
    path: '/v1/tasks/items',
    fields: { id: 'string', title: 'string', list_id: 'string', status: 'string', priority: 'string', due: 'string', completed: 'boolean', starred: 'boolean', tags: 'array' },
    // The route returns trashed tasks too (the Tasks app shows them under Trash).
    extraInputs: { include_trashed: { type: 'boolean', default: false, description: 'Also return tasks in the trash.' } },
    rowFilter: (r, a) => !!a.include_trashed || !(r.deletedAt ?? r.deleted_at),
  }),
  listTool({
    id: 'tasks.list_task_lists', app: 'tasks', entitlement: null,
    title: 'List my task lists', description: 'Your task lists and lists shared with you.',
    path: '/v1/tasks/lists', fields: { id: 'string', name: 'string', shared: 'boolean', role: 'string', owner_name: 'string' },
  }),
  {
    id: 'tasks.create_task', app: 'tasks', entitlement: null, access: 'write', actors: ['staff'],
    title: 'Create a task', description: 'Add a task to one of your task lists. Needs confirmation: the first call returns a preview and a confirmation_token.',
    routes: ['POST /v1/tasks/items'],
    inputSchema: inputSchema({
      list_id: UUID_PROP('Task list id from tasks.list_task_lists'),
      title: { type: 'string', minLength: 1, maxLength: 500 },
      notes: { type: 'string', maxLength: 10000 },
      due: ISO_DATE,
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      ...WRITE_PROPS,
    }, ['list_id', 'title', 'idempotency_key']),
    outputSchema: writeOutput(objectSchema({ id: 'string', title: 'string', list_id: 'string', due: 'string', status: 'string' })),
    async preview(ctx, a) {
      const lists = rowsOf(await ctx.get('/v1/tasks/lists'));
      const list = lists.find((l: any) => l.id === a.list_id);
      if (!list) throw new McpToolError('not_found', 'That task list does not exist or is not yours.');
      return `Create task "${a.title}" in list "${list.name}"${a.due ? `, due ${a.due}` : ''}.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', '/v1/tasks/items', {
        id: uuidFromKey(`task:${ctx.connectionId}`, a.idempotency_key), listId: a.list_id, title: a.title,
        ...(a.notes ? { notes: a.notes } : {}), ...(a.due ? { due: a.due } : {}), ...(a.priority ? { priority: a.priority } : {}),
      });
      return project(body?.data ?? body, { id: 'string', title: 'string', list_id: 'string', due: 'string', status: 'string' });
    },
  },
];

const notes: McpTool[] = [
  listTool({
    id: 'notes.list_notes', app: 'notes', entitlement: 'notes',
    title: 'List my notes', description: 'Your notes (title and text), most recent first.',
    path: '/v1/notes', itemsKey: 'notes', serverLimit: true,
    filters: { search: { schema: { ...STR, description: 'Server-side full-text search' } } },
    fields: { id: 'string', title: 'string', content: 'string', isPinned: 'boolean', isArchived: 'boolean', reminderAt: 'string', subjectType: 'string', subjectId: 'string', updatedAt: 'string' },
    // The route returns trashed notes too (the Notes app shows them under Trash).
    extraInputs: { include_trashed: { type: 'boolean', default: false, description: 'Also return notes in the trash.' } },
    rowFilter: (r, a) => !!a.include_trashed || !r.isTrashed,
  }),
  {
    id: 'notes.create_note', app: 'notes', entitlement: 'notes', access: 'write', actors: ['staff'],
    title: 'Create a note', description: 'Save a new private note. Needs confirmation: the first call returns a preview and a confirmation_token.',
    routes: ['POST /v1/notes'],
    inputSchema: inputSchema({
      title: { type: 'string', maxLength: 500 }, content: { type: 'string', minLength: 1, maxLength: 20000 }, ...WRITE_PROPS,
    }, ['content', 'idempotency_key']),
    outputSchema: writeOutput(objectSchema({ id: 'string', title: 'string', content: 'string' })),
    async preview(_ctx, a) { return `Save a private note${a.title ? ` titled "${a.title}"` : ''} (${String(a.content).length} characters).`; },
    async run(ctx, a) {
      const body = await ctx.send('POST', '/v1/notes', { ...(a.title ? { title: a.title } : {}), content: a.content });
      return project(body?.note ?? body, { id: 'string', title: 'string', content: 'string' });
    },
  },
];

// Bliss write tool lives here so it can reuse WRITE_PROPS.
bliss.push({
  id: 'bliss.create_ticket', app: 'bliss', entitlement: 'bliss', access: 'write', actors: ['staff', 'customer'],
  title: 'Open a support ticket', description: 'Open a support ticket. Customers open tickets for themselves; staff must give the customer_id. Needs confirmation: the first call returns a preview and a confirmation_token.',
  routes: ['POST /v1/support/tickets'],
  inputSchema: inputSchema({
    subject: { type: 'string', minLength: 1, maxLength: 300 },
    description: { type: 'string', maxLength: 10000 },
    priority: { type: 'string', enum: ['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT'], default: 'NORMAL' },
    category: { type: 'string', minLength: 1, maxLength: 100, default: 'General' },
    customer_id: UUID_PROP('Customer the ticket is for (staff only; ignored for customers)'),
    ...WRITE_PROPS,
  }, ['subject', 'idempotency_key']),
  outputSchema: writeOutput(objectSchema({ id: 'string', ref: 'string', subject: 'string', status: 'string', priority: 'string' })),
  async preview(ctx, a) {
    if (ctx.actorType === 'staff') {
      if (!a.customer_id) throw new McpToolError('invalid', 'customer_id is required when staff open a ticket.');
      // Validates the id against this workspace and your CRM access first.
      const c = await ctx.get(`/v1/customers/${encodeURIComponent(a.customer_id)}`);
      return `Open a ${a.priority ?? 'NORMAL'} ticket "${a.subject}" for ${(c?.data ?? c)?.name ?? 'this customer'}.`;
    }
    return `Open a ${a.priority ?? 'NORMAL'} support ticket "${a.subject}" on your account.`;
  },
  async run(ctx, a) {
    const body = await ctx.send('POST', '/v1/support/tickets', {
      subject: a.subject, description: a.description, priority: a.priority ?? 'NORMAL', category: a.category ?? 'General',
      source_app: undefined, ...(ctx.actorType === 'staff' ? { customer_id: a.customer_id } : {}),
    });
    return project(body?.ticket ?? body, { id: 'string', ref: 'string', subject: 'string', status: 'string', priority: 'string' });
  },
});

// ── eSign ─────────────────────────────────────────────────────────────────
const sign: McpTool[] = [
  summaryTool({
    id: 'sign.envelope_counts', app: 'sign', entitlement: 'sign',
    title: 'eSign document counts', description: 'Your envelopes awaiting signature, sent, drafts, completed, voided, declined and expired.',
    path: '/v1/sign/envelopes/counts', fields: { inbox: 'integer', sent: 'integer', drafts: 'integer', completed: 'integer', voided: 'integer', declined: 'integer', expired: 'integer' },
  }),
  listTool({
    id: 'sign.list_envelopes', app: 'sign', entitlement: 'sign', actors: ['staff', 'customer'],
    title: 'List eSign envelopes', description: 'Envelopes in one of your views: inbox (awaiting your signature), sent, drafts, or mine. Customers see only documents they created or were sent.',
    path: '/v1/sign/envelopes', serverLimit: true,
    filters: { view: { schema: { type: 'string', enum: ['inbox', 'sent', 'drafts', 'mine'], default: 'mine' } } },
    query: { view: 'mine' },
    fields: { id: 'string', title: 'string', file_name: 'string', status: 'string', sent_at: 'string', completed_at: 'string', expires_at: 'string', created_at: 'string' },
  }),
];

// ── SMS, Studio, HuduBI, Pulse, Zentra ──────────────────────────────────
const sms: McpTool[] = [
  summaryTool({
    id: 'sms.messaging_stats', app: 'sms', entitlement: 'sms',
    title: 'SMS delivery stats', description: 'Messages sent, delivered and failed today and this month, and gateway status.',
    path: '/v1/sms/stats',
    fields: { sentToday: 'integer', deliveredToday: 'integer', failedToday: 'integer', sentThisMonth: 'integer', deliveredThisMonth: 'integer', failedThisMonth: 'integer', gatewayConfigured: 'boolean', gatewayProvider: 'string' },
  }),
  listTool({
    id: 'sms.list_campaigns', app: 'sms', entitlement: 'sms',
    title: 'List SMS campaigns', description: 'Bulk SMS campaigns and their delivery counts.',
    path: '/v1/sms/campaigns', fields: { id: 'string', name: 'string', status: 'string', total_recipients: 'integer', scheduled_at: 'string', sent_at: 'string', created_at: 'string' },
  }),
];

const studio: McpTool[] = [
  summaryTool({
    id: 'studio.automation_stats', app: 'studio', entitlement: 'studio',
    title: 'Automation stats', description: 'Workflow and run counts for Studio automations.',
    path: '/v1/workflow-studio/stats', fields: { workflows: 'object', runs: 'object', byApp: 'array' },
  }),
  listTool({
    id: 'studio.list_runs', app: 'studio', entitlement: 'studio',
    title: 'List automation runs', description: 'Recent Studio workflow runs and their outcome.',
    path: '/v1/workflow-studio/runs', fields: { id: 'string', workflow_id: 'string', workflow_name: 'string', status: 'string', trigger_source: 'string', duration_ms: 'integer', error_message: 'string', created_at: 'string' },
  }),
];

const hudubi: McpTool[] = [
  listTool({
    id: 'hudubi.list_metrics', app: 'hudubi', entitlement: 'hudubi',
    title: 'List business metrics', description: 'Defined HuduBI metrics (KPIs) available in this workspace.',
    path: '/v1/hudubi/metrics', fields: { key: 'string', label: 'string', defaultChartType: 'string', supportsDateRange: 'boolean' },
  }),
  summaryTool({
    id: 'hudubi.dashboard', app: 'hudubi', entitlement: 'hudubi',
    title: 'Business dashboard', description: 'Headline KPIs from the HuduBI dashboard.',
    path: '/v1/hudubi/dashboard', fields: { kpis: ['object', 'Consignment value, active cases, customers, declarations, revenue and expenses'], dataLayer: 'object', shipmentsByMode: 'array', customersBySegment: 'array', monthlyVolume: 'array' },
  }),
];

const PULSE_ROLES = [...MANAGER_ROLES, 'SALES'] as McpTool['roles'];
const pulse: McpTool[] = [
  summaryTool({
    id: 'pulse.marketing_overview', app: 'pulse', entitlement: 'pulse', roles: PULSE_ROLES,
    title: 'Marketing overview', description: 'Sends, delivery, open/click/unsubscribe rates and channel results for the last 30 days.',
    path: '/v1/pulse/overview', query: { days: 30 }, fields: { days: 'integer', current: 'object', previous: 'object', counts: 'object', channels: 'array', warnings: 'array' },
  }),
  listTool({
    id: 'pulse.list_campaigns', app: 'pulse', entitlement: 'pulse', roles: PULSE_ROLES,
    title: 'List marketing campaigns', description: 'Email/SMS/WhatsApp campaigns with status and schedule.',
    path: '/v1/pulse/campaigns', fields: { id: 'string', name: 'string', channel: 'string', status: 'string', subject: 'string', segment_name: 'string', scheduled_at: 'string', sent_at: 'string', total_recipients: 'integer', sent: 'integer', opened: 'integer' },
  }),
  listTool({
    id: 'pulse.list_segments', app: 'pulse', entitlement: 'pulse', roles: PULSE_ROLES,
    title: 'List audience segments', description: 'Saved audience segments and their source.',
    path: '/v1/pulse/segments', fields: { id: 'string', name: 'string', description: 'string', source: 'string', match_type: 'string', updated_at: 'string' },
  }),
];

const ZENTRA_VIEW = MANAGER_ROLES;
const zentra: McpTool[] = [
  summaryTool({
    id: 'zentra.oversight_overview', app: 'zentra', entitlement: 'zentra', roles: ZENTRA_VIEW,
    title: 'Oversight overview', description: 'Open risk cases, signals and policy status for this workspace.',
    path: '/v1/zentra/overview', fields: { posture: 'object', total_events_24h: 'integer', high_risk_signals_count: 'integer', open_cases_count: 'integer', outbox_backlog_count: 'integer' },
  }),
  listTool({
    id: 'zentra.list_policies', app: 'zentra', entitlement: 'zentra', roles: ZENTRA_VIEW,
    title: 'List oversight policies', description: 'Data-access and export policies and whether each is enforced.',
    path: '/v1/zentra/policies', fields: { id: 'string', name: 'string', description: 'string', resource_type: 'string', action: 'string', subject_type: 'string', effect: 'string', condition_type: 'string', enabled: 'boolean', updated_at: 'string' },
  }),
];

// ── Projects ──────────────────────────────────────────────────────────────
const projects: McpTool[] = [
  listTool({
    id: 'projects.list_projects', app: 'projects', entitlement: 'projects',
    title: 'List projects', description: 'Projects you can see, with health, progress and budget. Budgets are hidden unless your role may see them.',
    path: '/v1/tasks/projects',
    fields: { id: 'string', ref: 'string', name: 'string', status: 'string', health_status: 'string', progress_pct: 'number', project_type: 'string', current_budget: 'number', actual_cost: 'number' },
  }),
  summaryTool({
    id: 'projects.portfolio_summary', app: 'projects', entitlement: 'projects',
    title: 'Portfolio summary', description: 'Portfolio/program/project counts, contract value, budget, spend and cost/schedule indices.',
    path: '/v1/project-os/command-center',
    fields: { total_portfolios: 'integer', total_programs: 'integer', total_projects: 'integer', active_projects: 'integer', total_contract_value: 'number', total_budget: 'number', total_spent: 'number', portfolio_cpi: 'number', portfolio_spi: 'number' },
  }),
  listTool({
    id: 'projects.list_risks', app: 'projects', entitlement: 'projects',
    title: 'List project risks', description: 'Open risks across your projects.',
    path: '/v1/project-os/all/risks', fields: { id: 'string', title: 'string', project_name: 'string', category: 'string', status: 'string', probability: 'string', impact: 'string', score: 'number', financial_exposure: 'number', currency: 'string' },
  }),
  listTool({
    id: 'projects.list_contracts', app: 'projects', entitlement: 'projects',
    title: 'List contracts', description: 'Contracts with counterparty, value and expiry.',
    path: '/v1/contracts', fields: { id: 'string', ref: 'string', subject: 'string', type: 'string', customer_name: 'string', project_name: 'string', status: 'string', value: 'number', currency: 'string', start_date: 'string', end_date: 'string' },
  }),
];

// ── Travel, Tuma, LexCore, Ngao, Gereji ──────────────────────────────────
const travel: McpTool[] = [
  listTool({
    id: 'travel.list_trips', app: 'travel', entitlement: 'travel',
    title: 'List my trips', description: 'Business trips you created, with dates, status and budget.',
    path: '/v1/travel/trips', fields: { id: 'string', title: 'string', start_date: 'string', status: 'string', budget_amount: 'number', notes: 'string' },
  }),
  listTool({
    id: 'travel.list_expenses', app: 'travel', entitlement: 'travel',
    title: 'List travel expenses', description: 'Travel expenses recorded against trips.',
    path: '/v1/travel/expenses', fields: { id: 'string', trip_id: 'string', category: 'string', description: 'string', amount: 'number', currency: 'string', expense_date: 'string', reimbursable: 'boolean' },
  }),
];

const tuma: McpTool[] = [
  listTool({
    id: 'tuma.list_parcels', app: 'tuma', entitlement: 'tuma',
    title: 'List parcels', description: 'Courier parcels with route, recipient and status.',
    path: '/v1/tuma/parcels', itemsKey: 'rows', serverLimit: true,
    filters: { status: { schema: STR }, search: { schema: STR } },
    fields: { id: 'string', parcel_number: 'string', name: 'string', status: 'string', sender_name: 'string', recipient_name: 'string', origin_office_id: 'string', dest_office_id: 'string', price: 'number', travel_date: 'string', delivered_date: 'string', created_at: 'string' },
  }),
  listTool({
    id: 'tuma.list_offices', app: 'tuma', entitlement: 'tuma',
    title: 'List offices', description: 'Courier offices and branches.',
    path: '/v1/tuma/offices', itemsKey: 'offices', fields: { id: 'string', name: 'string', code: 'string', address: 'string', phone: 'string', is_active: 'boolean' },
  }),
];

const lexcore: McpTool[] = [
  listTool({
    id: 'lexcore.list_matters', app: 'lexcore', entitlement: 'lexcore',
    title: 'List legal matters', description: 'Matters with client, type and status.',
    path: '/v1/legal/matters', itemsKey: 'rows', serverLimit: true,
    filters: { status: { schema: STR }, client_id: { schema: UUID_PROP('Only this client’s matters') } },
    fields: { id: 'string', matter_number: 'string', title: 'string', matter_type: 'string', status: 'string', billing_method: 'string', client_name: 'string', date_opened: 'string', date_closed: 'string' },
  }),
  listTool({
    id: 'lexcore.list_deadlines', app: 'lexcore', entitlement: 'lexcore',
    title: 'List legal deadlines', description: 'Open court and filing deadlines, soonest first.',
    path: '/v1/legal/deadlines', filters: { matter_id: { schema: UUID_PROP('Only this matter’s deadlines') } },
    fields: { id: 'string', matter_id: 'string', deadline_type: 'string', description: 'string', due_date: 'string', is_critical: 'boolean', completed_at: 'string' },
  }),
  listTool({
    id: 'lexcore.list_court_events', app: 'lexcore', entitlement: 'lexcore',
    title: 'Court diary', description: 'Scheduled court events (hearings, mentions) with outcome.',
    path: '/v1/lexcore/court-events', itemsKey: 'events',
    fields: { id: 'string', matter_id: 'string', event_type: 'string', scheduled_at: 'string', outcome: 'string', next_event_type: 'string', next_event_date: 'string' },
  }),
];

const ngao: McpTool[] = [
  listTool({
    id: 'ngao.list_incidents', app: 'ngao', entitlement: 'ngao',
    title: 'List privacy incidents', description: 'Data-protection incidents with severity, status and notification dates.',
    path: '/v1/ngao/incidents', itemsKey: 'incidents',
    fields: { id: 'string', incident_number: 'string', title: 'string', severity: 'string', status: 'string', category: 'string', data_subjects_affected: 'integer', detected_at: 'string', contained_at: 'string', authority_notified_at: 'string' },
  }),
  listTool({
    id: 'ngao.list_assessments', app: 'ngao', entitlement: 'ngao',
    title: 'List privacy assessments', description: 'DPIAs and other privacy assessments with risk level and review date.',
    path: '/v1/ngao/assessments', itemsKey: 'assessments',
    fields: { id: 'string', title: 'string', assessment_type: 'string', status: 'string', risk_level: 'string', risk_score: 'number', next_review_date: 'string', approved_at: 'string' },
  }),
];

const gereji: McpTool[] = [
  listTool({
    id: 'gereji.list_job_cards', app: 'gereji', entitlement: 'gereji',
    title: 'List workshop job cards', description: 'Vehicle job cards with fault, bay and status.',
    path: '/v1/gereji/job-cards', itemsKey: 'jobCards',
    fields: { id: 'string', vehicle_id: 'string', reported_fault: 'string', diagnosis: 'string', bay_number: 'string', status: 'string', mileage_in: 'integer', estimated_hours: 'number', received_at: 'string', completed_at: 'string' },
  }),
  listTool({
    id: 'gereji.list_vehicles', app: 'gereji', entitlement: 'gereji',
    title: 'List customer vehicles', description: 'Vehicles serviced by the workshop.',
    path: '/v1/gereji/vehicles', itemsKey: 'vehicles',
    fields: { id: 'string', registration: 'string', make: 'string', model: 'string', year: 'integer', mileage: 'integer', color: 'string', vin: 'string', customer_id: 'string' },
  }),
];

// ── Cross-app ─────────────────────────────────────────────────────────────
/**
 * Customer 360: the customer record (CRM), then that customer's invoices
 * (FinOps), shipments (ClearOS) and tickets (Bliss). Each section runs as its
 * own tool, so each app's entitlement, role, tool-enablement and record rules
 * apply independently; a section the caller cannot use says why instead of
 * failing the whole call. The customer id is validated by the CRM route
 * (tenant ownership and the caller's CRM role) before anything else runs.
 */
const crossApp: McpTool[] = [{
  id: 'workspace.customer_overview', app: 'workspace', entitlement: null, access: 'read', actors: ['staff'],
  title: 'Customer overview (cross-app)', description: 'One customer’s account, open invoices, shipments and support tickets across CRM, FinOps, ClearOS and Bliss — each part only if you can use that app.',
  routes: ['GET /v1/customers/:id', 'GET /v1/invoices', 'GET /v1/shipments', 'GET /v1/support/tickets'],
  inputSchema: inputSchema({ customer_id: UUID_PROP('Customer id (from crm.list_customers or workspace.search)'), limit: { ...LIMIT_PROP, default: 10 } }, ['customer_id']),
  outputSchema: {
    type: 'object',
    properties: {
      customer: { type: ['object', 'null'] },
      sections: { type: 'object', additionalProperties: { type: 'object', properties: { available: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array' }, count: { type: 'integer' } } } },
    },
    required: ['customer', 'sections'],
  },
  async run(ctx, a) {
    const limit = Math.min(Number(a.limit) || 10, 50);
    const customer = await ctx.callTool('crm.get_customer', { id: a.customer_id });
    if (!customer.ok) throw new McpToolError('denied', `Customer lookup failed: ${customer.reason}`);
    const parts: [string, string, Record<string, unknown>][] = [
      ['invoices', 'finops.list_invoices', { customer_id: a.customer_id, limit }],
      ['shipments', 'clearos.list_shipments', { customer_id: a.customer_id, limit }],
      ['tickets', 'bliss.list_tickets', { customer_id: a.customer_id, limit }],
    ];
    const sections: Record<string, unknown> = {};
    for (const [name, toolId, args] of parts) {
      const r = await ctx.callTool(toolId, args);
      if (!r.ok) { sections[name] = { available: false, reason: r.reason }; continue; }
      // Only keep rows whose own customer_id matches — never trust a filter
      // the route might ignore.
      const items = (r.result.items as any[]).filter(i => i.customer_id === a.customer_id);
      sections[name] = { available: true, items, count: items.length };
    }
    return { customer: customer.result, sections };
  },
}];

// ── More reads ────────────────────────────────────────────────────────────
const LEAD_FIELDS = { id: 'string', company: 'string', contact_name: 'string', contact_email: 'string', contact_phone: 'string', source: 'string', stage: 'string', value: 'number', priority: 'string', assigned_to_name: 'string', expected_close: 'string', industry: 'string', location: 'string', created_at: 'string' } as const;

const moreReads: McpTool[] = [
  detailTool({
    id: 'crm.get_lead', app: 'crm', entitlement: 'crm',
    title: 'Get a lead', description: 'One sales lead by id, with owner, stage and value.',
    path: id => `/v1/leads/${id}`, routeLabel: '/v1/leads/:id', idDescription: 'Lead id', fields: { ...LEAD_FIELDS, notes: 'string', website: 'string' },
  }),
  {
    id: 'clearos.list_shipment_notes', app: 'clearos', entitlement: 'clearos', access: 'read', actors: ['staff'],
    title: 'List shipment notes', description: 'Internal notes on one shipment, oldest first.',
    routes: ['GET /v1/shipments/:id', 'GET /v1/shipments/:id/notes'],
    inputSchema: inputSchema({ shipment_id: UUID_PROP('Shipment id'), limit: LIMIT_PROP }, ['shipment_id']),
    outputSchema: listOutputSchema({ id: 'string', author_name: 'string', content: 'string', created_at: 'string' }),
    async run(ctx, a) {
      // The shipment route checks you may see this shipment (assignment, ownership).
      await ctx.get(`/v1/shipments/${encodeURIComponent(a.shipment_id)}`);
      const body = await ctx.get(`/v1/shipments/${encodeURIComponent(a.shipment_id)}/notes`);
      return shapeList(rowsOf(body), { id: 'string', author_name: 'string', content: 'string', created_at: 'string' }, a);
    },
  },
  listTool({
    id: 'finops.list_payments', app: 'finops', entitlement: 'finops', actors: ['staff', 'customer'],
    title: 'List payments', description: 'Payments received against invoices (and, for staff, paid to suppliers). Customers see only payments on their own invoices.',
    path: '/v1/payments',
    filters: { customer_id: { schema: UUID_PROP('Only payments for this customer (staff)') } },
    fields: { id: 'string', kind: 'string', direction: 'string', amount: 'number', currency: 'string', method: 'string', payment_date: 'string', party_name: 'string', document_number: 'string', invoice_id: 'string', customer_id: 'string' },
  }),
  listTool({
    id: 'nexushr.list_my_leave_requests', app: 'nexushr', entitlement: 'nexushr',
    title: 'My leave requests', description: 'Your leave requests and their status. HR viewers see everyone’s; others only their own.',
    path: '/v1/hr/leaves',
    fields: { id: 'string', employee_name: 'string', type: 'string', type_name: 'string', from_date: 'string', to_date: 'string', days: 'number', status: 'string', approved_by_name: 'string', created_at: 'string' },
  }),
];

// ── More writes (all two-step + idempotent; each runs the app's own route) ──
const ISO_DATETIME = { type: 'string', format: 'date-time', description: 'ISO 8601 date-time, e.g. 2026-11-20T09:00:00+03:00' } as const;
const writeTool = (t: Omit<McpTool, 'access' | 'outputSchema'> & { result: FieldSpec }): McpTool => {
  const { result, ...rest } = t;
  return { ...rest, access: 'write', outputSchema: writeOutput(objectSchema(result)) };
};

const moreWrites: McpTool[] = [
  writeTool({
    id: 'crm.create_lead', app: 'crm', entitlement: 'crm', actors: ['staff'],
    title: 'Create a lead', description: 'Add a sales lead. Assignment rules apply as in the CRM. Needs confirmation: the first call returns a preview and a confirmation_token.',
    routes: ['POST /v1/leads'],
    inputSchema: inputSchema({
      company: { type: 'string', minLength: 1, maxLength: 300 }, contact_name: { type: 'string', minLength: 1, maxLength: 300 },
      contact_email: { type: 'string', format: 'email', maxLength: 320 }, contact_phone: { type: 'string', maxLength: 50 },
      source: { type: 'string', maxLength: 100, default: 'AI assistant' }, value: { type: 'number', minimum: 0 },
      priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, notes: { type: 'string', maxLength: 5000 },
      ...WRITE_PROPS,
    }, ['company', 'contact_name', 'idempotency_key']),
    result: LEAD_FIELDS,
    async preview(_ctx, a) { return `Create lead "${a.company}" (contact ${a.contact_name})${a.value ? `, value ${a.value}` : ''}.`; },
    async run(ctx, a) {
      const body = await ctx.send('POST', '/v1/leads', {
        company: a.company, contact_name: a.contact_name, source: a.source ?? 'AI assistant',
        ...(a.contact_email ? { contact_email: a.contact_email } : {}), ...(a.contact_phone ? { contact_phone: a.contact_phone } : {}),
        ...(a.value !== undefined ? { value: a.value } : {}), ...(a.priority ? { priority: a.priority } : {}), ...(a.notes ? { notes: a.notes } : {}),
      });
      return project(body, LEAD_FIELDS);
    },
  }),
  writeTool({
    id: 'crm.update_lead_stage', app: 'crm', entitlement: 'crm', actors: ['staff'],
    title: 'Move a lead to another stage', description: 'Change a lead’s pipeline stage (a stage id from the CRM, e.g. CONTACTED or QUALIFIED). Needs confirmation.',
    routes: ['GET /v1/leads/:id', 'PATCH /v1/leads/:id'],
    inputSchema: inputSchema({ lead_id: UUID_PROP('Lead id'), stage: { type: 'string', minLength: 1, maxLength: 100 }, ...WRITE_PROPS }, ['lead_id', 'stage', 'idempotency_key']),
    result: LEAD_FIELDS,
    async preview(ctx, a) {
      const lead = await ctx.get(`/v1/leads/${encodeURIComponent(a.lead_id)}`);
      return `Move lead "${lead?.company ?? a.lead_id}" from ${lead?.stage ?? 'its current stage'} to ${a.stage}.`;
    },
    async run(ctx, a) { return project(await ctx.send('PATCH', `/v1/leads/${encodeURIComponent(a.lead_id)}`, { stage: a.stage }), LEAD_FIELDS); },
  }),
  writeTool({
    id: 'contacts.create_contact', app: 'contacts', entitlement: 'contacts', actors: ['staff'],
    title: 'Create a contact', description: 'Add a person to Contacts. Needs confirmation.',
    routes: ['POST /v1/contacts'],
    inputSchema: inputSchema({
      first_name: { type: 'string', minLength: 1, maxLength: 120 }, last_name: { type: 'string', maxLength: 120 },
      email: { type: 'string', format: 'email', maxLength: 320 }, phone: { type: 'string', maxLength: 50 },
      company: { type: 'string', maxLength: 200 }, job_title: { type: 'string', maxLength: 200 }, notes: { type: 'string', maxLength: 5000 },
      ...WRITE_PROPS,
    }, ['first_name', 'idempotency_key']),
    result: { id: 'string', first_name: 'string', last_name: 'string', email: 'string', phone: 'string', company: 'string', job_title: 'string' },
    async preview(_ctx, a) { return `Add contact ${[a.first_name, a.last_name].filter(Boolean).join(' ')}${a.company ? ` (${a.company})` : ''}.`; },
    async run(ctx, a) {
      const { idempotency_key: _k, ...fields } = a;
      const body = await ctx.send('POST', '/v1/contacts', fields);
      return project(body?.data ?? body, { id: 'string', first_name: 'string', last_name: 'string', email: 'string', phone: 'string', company: 'string', job_title: 'string' });
    },
  }),
  writeTool({
    id: 'calendar.create_event', app: 'calendar', entitlement: null, actors: ['staff'],
    title: 'Create a calendar event', description: 'Add an event to your own calendar. No guests are invited. Needs confirmation.',
    routes: ['POST /v1/tasks/events'],
    inputSchema: inputSchema({
      title: { type: 'string', minLength: 1, maxLength: 500 }, start: ISO_DATETIME, end: ISO_DATETIME,
      all_day: { type: 'boolean', default: false }, location: { type: 'string', maxLength: 500 }, description: { type: 'string', maxLength: 10000 },
      ...WRITE_PROPS,
    }, ['title', 'start', 'end', 'idempotency_key']),
    result: { id: 'string', title: 'string', start_at: 'string', end_at: 'string', all_day: 'boolean', location: 'string' },
    async preview(_ctx, a) {
      if (new Date(a.end).getTime() < new Date(a.start).getTime()) throw new McpToolError('invalid', 'The event cannot end before it starts.');
      return `Add "${a.title}" to your calendar, ${a.start} to ${a.end}${a.location ? ` at ${a.location}` : ''}.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', '/v1/tasks/events', {
        id: uuidFromKey(`event:${ctx.connectionId}`, a.idempotency_key), title: a.title, start: a.start, end: a.end,
        allDay: !!a.all_day, ...(a.location ? { location: a.location } : {}), ...(a.description ? { description: a.description } : {}),
      });
      return project(body?.data ?? body, { id: 'string', title: 'string', start_at: 'string', end_at: 'string', all_day: 'boolean', location: 'string' });
    },
  }),
  writeTool({
    id: 'tasks.complete_task', app: 'tasks', entitlement: null, actors: ['staff'],
    title: 'Complete a task', description: 'Mark one of your tasks (or one assigned to you) as done. Needs confirmation.',
    routes: ['GET /v1/tasks/items', 'PATCH /v1/tasks/items/:id'],
    inputSchema: inputSchema({ task_id: UUID_PROP('Task id from tasks.list_tasks'), ...WRITE_PROPS }, ['task_id', 'idempotency_key']),
    result: { id: 'string', title: 'string', status: 'string', completed: 'boolean' },
    async preview(ctx, a) {
      const task = rowsOf(await ctx.get('/v1/tasks/items')).find((t: any) => t.id === a.task_id);
      if (!task) throw new McpToolError('not_found', 'That task does not exist or is not yours.');
      return `Mark "${task.title}" as completed.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('PATCH', `/v1/tasks/items/${encodeURIComponent(a.task_id)}`, { completed: true });
      return project(body?.data ?? body, { id: 'string', title: 'string', status: 'string', completed: 'boolean' });
    },
  }),
  writeTool({
    id: 'clearos.add_shipment_note', app: 'clearos', entitlement: 'clearos', actors: ['staff'],
    title: 'Add a shipment note', description: 'Add an internal note to a shipment you can see. Customers never see these notes. Needs confirmation.',
    routes: ['GET /v1/shipments/:id', 'POST /v1/shipments/:id/notes'],
    inputSchema: inputSchema({ shipment_id: UUID_PROP('Shipment id'), content: { type: 'string', minLength: 1, maxLength: 5000 }, ...WRITE_PROPS }, ['shipment_id', 'content', 'idempotency_key']),
    result: { id: 'string', shipment_id: 'string', author_name: 'string', content: 'string', created_at: 'string' },
    async preview(ctx, a) {
      const s = await ctx.get(`/v1/shipments/${encodeURIComponent(a.shipment_id)}`);
      return `Add an internal note to shipment ${(s?.data ?? s)?.ref_number ?? a.shipment_id} (${String(a.content).length} characters).`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', `/v1/shipments/${encodeURIComponent(a.shipment_id)}/notes`, { content: a.content });
      return project(body, { id: 'string', shipment_id: 'string', author_name: 'string', content: 'string', created_at: 'string' });
    },
  }),
  writeTool({
    id: 'bliss.reply_to_ticket', app: 'bliss', entitlement: 'bliss', actors: ['staff', 'customer'],
    title: 'Reply on a support ticket', description: 'Post a reply on a ticket. Staff replies appear in the customer’s portal (no email, SMS or WhatsApp is sent); customers can reply only on their own tickets. Needs confirmation.',
    routes: ['GET /v1/support/tickets/:id', 'POST /v1/support/tickets/:id/messages', 'POST /v1/support/tickets/:id/customer-reply'],
    inputSchema: inputSchema({ ticket_id: UUID_PROP('Ticket id'), content: { type: 'string', minLength: 1, maxLength: 10000 }, ...WRITE_PROPS }, ['ticket_id', 'content', 'idempotency_key']),
    result: { id: 'string', ticket_id: 'string', direction: 'string', author_type: 'string', created_at: 'string' },
    async preview(ctx, a) {
      const b = await ctx.get(`/v1/support/tickets/${encodeURIComponent(a.ticket_id)}`);
      const t = b?.ticket ?? b;
      return `Reply on ticket ${t?.ref ?? t?.ref_number ?? a.ticket_id} "${t?.subject ?? ''}" (${String(a.content).length} characters)${ctx.actorType === 'staff' ? ', visible to the customer in their portal' : ''}.`;
    },
    async run(ctx, a) {
      const id = encodeURIComponent(a.ticket_id);
      const body = ctx.actorType === 'customer'
        ? await ctx.send('POST', `/v1/support/tickets/${id}/customer-reply`, { content: a.content })
        : await ctx.send('POST', `/v1/support/tickets/${id}/messages`, { channel: 'IN_APP', content: a.content });
      return project(body?.message ?? body, { id: 'string', ticket_id: 'string', direction: 'string', author_type: 'string', created_at: 'string' });
    },
  }),
  writeTool({
    id: 'nexushr.request_leave', app: 'nexushr', entitlement: 'nexushr', actors: ['staff'],
    title: 'Request leave', description: 'Submit a leave request for yourself. Working days, overlap and remaining entitlement are checked by HR’s own rules. Needs confirmation.',
    routes: ['POST /v1/hr/leaves'],
    inputSchema: inputSchema({
      type: { type: 'string', minLength: 1, maxLength: 50, description: 'Leave type code, e.g. ANNUAL or SICK (codes from nexushr.my_leave_balances)' },
      from_date: ISO_DATE, to_date: ISO_DATE, reason: { type: 'string', maxLength: 2000 }, ...WRITE_PROPS,
    }, ['type', 'from_date', 'to_date', 'idempotency_key']),
    result: { id: 'string', type: 'string', from_date: 'string', to_date: 'string', days: 'number', status: 'string' },
    async preview(_ctx, a) {
      if (a.to_date < a.from_date) throw new McpToolError('invalid', 'The end of the leave cannot be before its start.');
      return `Request ${a.type} leave from ${a.from_date} to ${a.to_date} for yourself.`;
    },
    async run(ctx, a) {
      // Never user_id: the request is always for the connected person.
      const body = await ctx.send('POST', '/v1/hr/leaves', { type: a.type, from_date: a.from_date, to_date: a.to_date, ...(a.reason ? { reason: a.reason } : {}) });
      return project(body?.data ?? body?.leave ?? body, { id: 'string', type: 'string', from_date: 'string', to_date: 'string', days: 'number', status: 'string' });
    },
  }),
  writeTool({
    id: 'travel.create_trip', app: 'travel', entitlement: 'travel', actors: ['staff'],
    title: 'Plan a trip', description: 'Create a business trip in Travel. Needs confirmation.',
    routes: ['POST /v1/travel/trips'],
    inputSchema: inputSchema({
      title: { type: 'string', minLength: 1, maxLength: 200 }, destination: { type: 'string', minLength: 1, maxLength: 200 },
      start_date: ISO_DATE, end_date: ISO_DATE, budget_amount: { type: 'number', minimum: 0 }, budget_currency: { type: 'string', maxLength: 10 },
      notes: { type: 'string', maxLength: 10000 }, ...WRITE_PROPS,
    }, ['title', 'destination', 'idempotency_key']),
    result: { id: 'string', title: 'string', destination: 'string', start_date: 'string', end_date: 'string', status: 'string', budget_amount: 'number' },
    async preview(_ctx, a) { return `Plan trip "${a.title}" to ${a.destination}${a.start_date ? `, ${a.start_date}${a.end_date ? ` to ${a.end_date}` : ''}` : ''}.`; },
    async run(ctx, a) {
      const { idempotency_key: _k, ...fields } = a;
      return project(await ctx.send('POST', '/v1/travel/trips', fields), { id: 'string', title: 'string', destination: 'string', start_date: 'string', end_date: 'string', status: 'string', budget_amount: 'number' });
    },
  }),
];

// ── Higher-impact writes ──────────────────────────────────────────────────
//
// Money, outbound messages, payroll and deletes. Same two-step confirmation
// and idempotency as every write, plus: narrower roles than the underlying
// route, a preview that states the exact amount / recipient / period and
// refuses what the app would refuse, and nothing irreversible — invoices are
// created as drafts, payroll runs as drafts, and deletes go to the app's
// trash. Issuing, fiscalising, approving and paying payroll stay in the app.

const FINANCE_ROLES = [...MANAGER_ROLES, 'FINANCE'] as McpTool['roles'];
const PAYROLL_ROLES = [...ADMIN_ROLES, 'FINANCE'] as McpTool['roles'];
const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const lineTotal = (l: any) => Math.round(Number(l.qty ?? 1) * Number(l.rate ?? 0) * (1 + Number(l.tax_pct ?? 0) / 100) * 100) / 100;

const highImpact: McpTool[] = [
  writeTool({
    id: 'finops.create_draft_invoice', app: 'finops', entitlement: 'finops', actors: ['staff'], roles: [...(FINANCE_ROLES ?? []), 'SALES'],
    title: 'Draft a sales invoice', description: 'Create a DRAFT sales invoice for a customer. It is not issued, sent or fiscalised; someone must review and issue it in FinOps. Needs confirmation.',
    routes: ['GET /v1/customers/:id', 'POST /v1/invoices'],
    inputSchema: inputSchema({
      customer_id: UUID_PROP('Customer id'),
      currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'TZS' },
      due_date: ISO_DATE,
      notes: { type: 'string', maxLength: 5000 },
      items: {
        type: 'array', minItems: 1, maxItems: 50,
        items: inputSchema({
          name: { type: 'string', minLength: 1, maxLength: 500 }, qty: { type: 'number', minimum: 0, default: 1 },
          rate: { type: 'number', minimum: 0 }, tax_pct: { type: 'number', minimum: 0, maximum: 100, default: 0 },
        }, ['name', 'rate']),
      },
      ...WRITE_PROPS,
    }, ['customer_id', 'items', 'idempotency_key']),
    result: { ...INVOICE_FIELDS },
    async preview(ctx, a) {
      const c = await ctx.get(`/v1/customers/${encodeURIComponent(a.customer_id)}`);
      const ccy = a.currency ?? 'TZS';
      const total = (a.items as any[]).reduce((s, l) => s + lineTotal(l), 0);
      return `Create a DRAFT invoice for ${(c?.data ?? c)?.name ?? 'this customer'}: ${(a.items as any[]).length} line(s), total ${money(total, ccy)} incl. tax${a.due_date ? `, due ${a.due_date}` : ''}. It will not be issued or sent.`;
    },
    async run(ctx, a) {
      const c = await ctx.get(`/v1/customers/${encodeURIComponent(a.customer_id)}`);
      const ccy = a.currency ?? 'TZS';
      const body = await ctx.send('POST', '/v1/invoices', {
        status: 'Draft', customer_id: a.customer_id, client_name: (c?.data ?? c)?.name, currency: ccy,
        ...(a.due_date ? { due_date: a.due_date } : {}), ...(a.notes ? { notes: a.notes } : {}),
        items: (a.items as any[]).map((l, i) => ({ name: l.name, qty: l.qty ?? 1, rate: l.rate, tax_pct: l.tax_pct ?? 0, currency: ccy, sort_order: i })),
      });
      return project(Array.isArray(body) ? body[0] : body?.data ?? body, INVOICE_FIELDS);
    },
  }),
  writeTool({
    id: 'finops.record_payment', app: 'finops', entitlement: 'finops', actors: ['staff'], roles: FINANCE_ROLES,
    title: 'Record an invoice payment', description: 'Record money received against an issued invoice. Refused for drafts, void or paid invoices and for more than is outstanding. Needs confirmation.',
    routes: ['GET /v1/invoices/:id', 'POST /v1/invoices/:id/payment'],
    inputSchema: inputSchema({
      invoice_id: UUID_PROP('Invoice id'), amount: { type: 'number', minimum: 0.01, maximum: 1e12 },
      method: { type: 'string', maxLength: 50, description: 'e.g. Bank transfer, M-Pesa, Cash' }, payment_date: ISO_DATE,
      note: { type: 'string', maxLength: 2000 }, ...WRITE_PROPS,
    }, ['invoice_id', 'amount', 'idempotency_key']),
    result: { received: 'number', status: 'string', replayed: 'boolean' },
    async preview(ctx, a) {
      const inv = await ctx.get(`/v1/invoices/${encodeURIComponent(a.invoice_id)}`);
      if (['Draft', 'Void', 'Paid'].includes(inv?.status)) throw new McpToolError('invalid', `Invoice ${inv.invoice_number} is ${inv.status}; payments can only be recorded on issued, unpaid invoices.`);
      const billed = (inv?.items ?? []).reduce((s: number, l: any) => s + lineTotal(l), 0);
      const outstanding = Math.round((billed - Number(inv?.received ?? 0)) * 100) / 100;
      if (Number(a.amount) > outstanding + 0.005) throw new McpToolError('invalid', `That is more than the ${money(outstanding, inv.currency)} outstanding on ${inv.invoice_number}.`);
      return `Record a payment of ${money(Number(a.amount), inv.currency)}${a.method ? ` by ${a.method}` : ''} on invoice ${inv.invoice_number} (${inv.client_name}); ${money(outstanding, inv.currency)} is outstanding.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', `/v1/invoices/${encodeURIComponent(a.invoice_id)}/payment`,
        { amount: a.amount, ...(a.method ? { method: a.method } : {}), ...(a.payment_date ? { payment_date: a.payment_date } : {}), ...(a.note ? { note: a.note } : {}) },
        // The route's own idempotency guard, keyed to this connection and request.
        { 'idempotency-key': `mcp:${ctx.connectionId.slice(0, 8)}:${String(a.idempotency_key).slice(0, 100)}` });
      return project(body, { received: 'number', status: 'string', replayed: 'boolean' });
    },
  }),
  writeTool({
    id: 'bliss.send_customer_message', app: 'bliss', entitlement: 'bliss', actors: ['staff'], openWorld: true,
    title: 'Message a customer about a ticket', description: 'Send a reply on a ticket to the customer by email, SMS or WhatsApp. It leaves Hudumika: the confirmation shows the exact address or number. Needs confirmation.',
    routes: ['GET /v1/support/tickets/:id', 'GET /v1/customers/:id', 'POST /v1/support/tickets/:id/messages'],
    inputSchema: inputSchema({
      ticket_id: UUID_PROP('Ticket id'), channel: { type: 'string', enum: ['EMAIL', 'SMS', 'WHATSAPP'] },
      content: { type: 'string', minLength: 1, maxLength: 4000 }, ...WRITE_PROPS,
    }, ['ticket_id', 'channel', 'content', 'idempotency_key']),
    result: { id: 'string', ticket_id: 'string', channel: 'string', direction: 'string', external_ref: 'string', created_at: 'string' },
    async preview(ctx, a) {
      const b = await ctx.get(`/v1/support/tickets/${encodeURIComponent(a.ticket_id)}`);
      const t = b?.ticket ?? b;
      if (!t?.customer_id) throw new McpToolError('invalid', 'This ticket has no customer to message.');
      const c = await ctx.get(`/v1/customers/${encodeURIComponent(t.customer_id)}`);
      const cust = c?.data ?? c;
      const to = a.channel === 'EMAIL' ? cust?.email : cust?.phone;
      if (!to) throw new McpToolError('invalid', `${cust?.name ?? 'The customer'} has no ${a.channel === 'EMAIL' ? 'email address' : 'phone number'} on file.`);
      return `Send by ${a.channel} to ${cust.name} <${to}> on ticket ${t.ref ?? t.ref_number ?? ''}: "${String(a.content).slice(0, 160)}${String(a.content).length > 160 ? '…' : ''}". This message leaves Hudumika and cannot be recalled.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', `/v1/support/tickets/${encodeURIComponent(a.ticket_id)}/messages`, { channel: a.channel, content: a.content });
      return project(body, { id: 'string', ticket_id: 'string', channel: 'string', direction: 'string', external_ref: 'string', created_at: 'string' });
    },
  }),
  listTool({
    id: 'nexushr.list_payroll_runs', app: 'nexushr', entitlement: 'nexushr', roles: PAYROLL_ROLES,
    title: 'List payroll runs', description: 'Payroll runs by period with status, headcount and totals. No individual salaries.',
    path: '/v1/payroll/runs',
    fields: { id: 'string', name: 'string', period_year: 'integer', period_month: 'integer', status: 'string', employee_count: 'integer', total_gross: 'number', total_net: 'number', total_employer_cost: 'number', total_remitted: 'number', calculated_at: 'string' },
  }),
  writeTool({
    id: 'nexushr.create_draft_payroll_run', app: 'nexushr', entitlement: 'nexushr', actors: ['staff'], roles: PAYROLL_ROLES,
    title: 'Start a draft payroll run', description: 'Create a DRAFT payroll run for a month. Nothing is calculated, approved or paid; that happens in NexusHR. Needs confirmation.',
    routes: ['GET /v1/payroll/runs', 'POST /v1/payroll/runs'],
    inputSchema: inputSchema({
      period_year: { type: 'integer', minimum: 2000, maximum: 2200 }, period_month: { type: 'integer', minimum: 1, maximum: 12 },
      name: { type: 'string', maxLength: 200 }, ...WRITE_PROPS,
    }, ['period_year', 'period_month', 'idempotency_key']),
    result: { id: 'string', name: 'string', period_year: 'integer', period_month: 'integer', status: 'string' },
    async preview(ctx, a) {
      const runs = rowsOf(await ctx.get('/v1/payroll/runs'));
      const clash = runs.find((r: any) => r.period_year === a.period_year && r.period_month === a.period_month);
      if (clash) throw new McpToolError('invalid', `A payroll run for ${a.period_month}/${a.period_year} already exists (${clash.status}).`);
      return `Create a DRAFT payroll run for ${a.period_month}/${a.period_year}${a.name ? ` named "${a.name}"` : ''}. Nothing is calculated, approved or paid.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('POST', '/v1/payroll/runs', { period_year: a.period_year, period_month: a.period_month, ...(a.name ? { name: a.name } : {}) });
      return project(body, { id: 'string', name: 'string', period_year: 'integer', period_month: 'integer', status: 'string' });
    },
  }),
  writeTool({
    id: 'tasks.delete_task', app: 'tasks', entitlement: null, actors: ['staff'], destructive: true,
    title: 'Move a task to trash', description: 'Move one of your own tasks to the trash (restorable in Tasks). Needs confirmation.',
    routes: ['GET /v1/tasks/items', 'PATCH /v1/tasks/items/:id'],
    inputSchema: inputSchema({ task_id: UUID_PROP('Task id'), ...WRITE_PROPS }, ['task_id', 'idempotency_key']),
    result: { id: 'string', title: 'string', deleted_at: 'string' },
    async preview(ctx, a) {
      const task = rowsOf(await ctx.get('/v1/tasks/items')).find((t: any) => t.id === a.task_id);
      if (!task) throw new McpToolError('not_found', 'That task does not exist or is not yours.');
      return `Move "${task.title}" to the trash. It can be restored from Tasks.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('PATCH', `/v1/tasks/items/${encodeURIComponent(a.task_id)}`, { deletedAt: new Date().toISOString() });
      const row = body?.data ?? body;
      return { id: row?.id ?? a.task_id, title: row?.title ?? null, deleted_at: row?.deleted_at ?? row?.deletedAt ?? null };
    },
  }),
  writeTool({
    id: 'notes.delete_note', app: 'notes', entitlement: 'notes', actors: ['staff'], destructive: true,
    title: 'Move a note to trash', description: 'Move one of your notes to the trash (restorable in Notes). Needs confirmation.',
    routes: ['GET /v1/notes', 'PATCH /v1/notes/:id/trash'],
    inputSchema: inputSchema({ note_id: UUID_PROP('Note id'), ...WRITE_PROPS }, ['note_id', 'idempotency_key']),
    result: { id: 'string', title: 'string', trashed: 'boolean' },
    async preview(ctx, a) {
      const note = rowsOf(await ctx.get('/v1/notes', { limit: 200 }), 'notes').find((n: any) => n.id === a.note_id);
      if (!note) throw new McpToolError('not_found', 'That note does not exist or is not yours.');
      return `Move the note "${note.title || String(note.content ?? '').slice(0, 60)}" to the trash. It can be restored from Notes.`;
    },
    async run(ctx, a) {
      const body = await ctx.send('PATCH', `/v1/notes/${encodeURIComponent(a.note_id)}/trash`, {});
      const row = body?.note ?? body;
      return { id: row?.id ?? a.note_id, title: row?.title ?? null, trashed: true };
    },
  }),
];

// ── ChatGPT-compatible search / fetch ─────────────────────────────────────
/**
 * ChatGPT (deep research and company knowledge) looks for two tools named
 * exactly `search` and `fetch`: search returns {results:[{id,title,url}]},
 * fetch returns one document {id,title,text,url,metadata}. Both are thin
 * wrappers: search runs the workspace search (staff) or the customer's own
 * lists (customers), fetch runs the record's own detail tool — so each app's
 * policy and record rules apply exactly as for the underlying tools.
 */
const FETCHABLE: Record<string, { tool: string; kind: string; title: (r: any) => string; link: (id: string) => string }> = {
  shipment: { tool: 'clearos.get_shipment', kind: 'Shipment', title: r => `Shipment ${r.ref_number ?? ''}`.trim(), link: id => `/clearos/clearance/${id}` },
  invoice: { tool: 'finops.get_invoice', kind: 'Invoice', title: r => `Invoice ${r.invoice_number ?? ''}`.trim(), link: id => `/finance/invoices/${id}` },
  customer: { tool: 'crm.get_customer', kind: 'Customer', title: r => r.name ?? 'Customer', link: id => `/crm/customers?id=${id}` },
  ticket: { tool: 'bliss.get_ticket', kind: 'Support ticket', title: r => `Ticket ${r.ref ?? ''} ${r.subject ?? ''}`.trim(), link: id => `/bliss/inbox?id=${id}` },
  lead: { tool: 'crm.get_lead', kind: 'Lead', title: r => `Lead ${r.company ?? ''}`.trim(), link: id => `/crm/leads/${id}` },
};
/** Record kinds addressable as `<kind>:<uuid>` (fetch) and as resources. */
export const MCP_RECORD_KINDS = FETCHABLE;
const SEARCH_GROUP_KIND: Record<string, string> = { shipments: 'shipment', invoices: 'invoice', customers: 'customer', tickets: 'ticket', leads: 'lead' };

let appOrigin = () => '';
/** Set by the routes module so result URLs point at this deployment. */
export function setMcpAppOrigin(fn: () => string) { appOrigin = fn; }

const chatgpt: McpTool[] = [
  {
    id: 'workspace.search_records', name: 'search', app: 'workspace', entitlement: null, access: 'read', actors: ['staff', 'customer'],
    title: 'Search Hudumika', description: 'Find shipments, invoices, customers, support tickets and leads you are allowed to see. Returns ids to pass to fetch.',
    routes: ['GET /v1/search', 'GET /v1/shipments', 'GET /v1/invoices', 'GET /v1/support/tickets'],
    inputSchema: inputSchema({ query: { type: 'string', minLength: 2, maxLength: 200, description: 'What to look for: a reference, name, BL number, subject …' } }, ['query']),
    outputSchema: {
      type: 'object', required: ['results'], additionalProperties: false,
      properties: { results: { type: 'array', items: { type: 'object', required: ['id', 'title', 'url'], additionalProperties: false, properties: { id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, text: { type: 'string' } } } } },
    },
    async run(ctx, a) {
      const q = String(a.query);
      const out: { id: string; title: string; url: string; text?: string }[] = [];
      const push = (kind: string, id: string, title: string, text?: string | null) => {
        if (!id || out.some(o => o.id === `${kind}:${id}`)) return;
        out.push({ id: `${kind}:${id}`, title, url: `${appOrigin()}${FETCHABLE[kind].link(id)}`, ...(text ? { text: String(text) } : {}) });
      };
      if (ctx.actorType === 'staff') {
        const body = await ctx.get('/v1/search', { q });
        for (const [group, kind] of Object.entries(SEARCH_GROUP_KIND)) {
          for (const hit of (body?.data?.[group] ?? []).slice(0, 10)) push(kind, hit.id, `${FETCHABLE[kind].kind}: ${hit.label ?? ''}`.trim(), hit.sublabel);
        }
      } else {
        // Customers: their own records only, through the same list tools.
        const parts: [string, string, Record<string, unknown>, (r: any) => string][] = [
          ['shipment', 'clearos.list_shipments', { search: q, limit: 10 }, r => `Shipment ${r.ref_number ?? ''} ${r.goods_desc ?? ''}`.trim()],
          ['invoice', 'finops.list_invoices', { query: q, limit: 10 }, r => `Invoice ${r.invoice_number ?? ''}`.trim()],
          ['ticket', 'bliss.list_tickets', { query: q, limit: 10 }, r => `Ticket ${r.ref ?? ''} ${r.subject ?? ''}`.trim()],
        ];
        for (const [kind, tool, args, title] of parts) {
          const r = await ctx.callTool(tool, args);
          if (r.ok) for (const row of (r.result.items as any[])) push(kind, row.id, title(row), row.status ?? row.stage);
        }
      }
      return { results: out.slice(0, 25) };
    },
  },
  {
    id: 'workspace.fetch_record', name: 'fetch', app: 'workspace', entitlement: null, access: 'read', actors: ['staff', 'customer'],
    title: 'Open a Hudumika record', description: 'The full record for an id returned by search (e.g. shipment:…, invoice:…).',
    routes: ['GET /v1/shipments/:id', 'GET /v1/invoices/:id', 'GET /v1/customers/:id', 'GET /v1/support/tickets/:id', 'GET /v1/leads/:id'],
    inputSchema: inputSchema({ id: { type: 'string', minLength: 3, maxLength: 120, pattern: '^[a-z]+:[0-9a-fA-F-]{36}$', description: 'An id from search, like shipment:<uuid>' } }, ['id']),
    outputSchema: {
      type: 'object', required: ['id', 'title', 'text', 'url'], additionalProperties: false,
      properties: { id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, url: { type: 'string' }, metadata: { type: 'object' } },
    },
    async run(ctx, a) {
      const [kind, rawId] = String(a.id).split(':');
      const spec = FETCHABLE[kind];
      if (!spec) throw new McpToolError('invalid', `Unknown record type "${kind}".`);
      const r = await ctx.callTool(spec.tool, { id: rawId });
      if (!r.ok) throw new McpToolError('denied', r.reason);
      const rec = r.result as Record<string, unknown>;
      const text = Object.entries(rec).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n');
      return { id: a.id, title: spec.title(rec), text, url: `${appOrigin()}${spec.link(rawId)}`, metadata: { type: kind, app: MCP_TOOL_BY_ID.get(spec.tool)?.app ?? null } };
    },
  },
];

// ── Lens (Internal Engineering Management) ──────────────────────────────────
const lensTools: McpTool[] = [
  listTool({
    id: 'lens.search_items', app: 'lens' as any, entitlement: null, actors: ['staff'], roles: ['SUPER_ADMIN'],
    title: 'Search Lens engineering issues', description: 'Search internal engineering issues and bugs in Lens.',
    path: '/v1/lens/items',
    fields: { id: 'string', ref: 'string', kind: 'string', title: 'string', status: 'string', severity: 'string', confidence: 'string', created_at: 'string' },
    filters: {
      q: { schema: { ...STR, description: 'Search text' } },
      status: { schema: { ...STR, description: 'OPEN, IN_PROGRESS, BLOCKED, DONE, WONTFIX' } },
      kind: { schema: { ...STR, description: 'BUG, FEATURE, DEBT, DECISION' } },
    },
  }),
  detailTool({
    id: 'lens.get_item', app: 'lens' as any, entitlement: null, actors: ['staff'], roles: ['SUPER_ADMIN'],
    title: 'Get Lens item details', description: 'Retrieve detailed information, evidence, and resolution for a Lens item.',
    path: ref => `/v1/lens/items/${ref}`, routeLabel: '/v1/lens/items/:ref', idDescription: 'Item reference (e.g. LENS-14)',
    fields: { id: 'string', ref: 'string', kind: 'string', title: 'string', body: 'string', status: 'string', severity: 'string', confidence: 'string', evidence: 'string', resolution: 'string' },
  }),
];

export const MCP_TOOLS: McpTool[] = [
  ...clearos, ...finops, ...pos, ...petti, ...complyos, ...bliss, ...nexushr, ...onesite, ...onsite, ...ondi,
  ...tracking, ...cargotracker, ...demurrage, ...seal, ...cloud, ...workspace, ...crossApp, ...email, ...contacts, ...crm,
  ...store, ...developer, ...calendar, ...tasks, ...notes, ...sign, ...sms, ...studio, ...hudubi, ...pulse, ...zentra,
  ...projects, ...travel, ...tuma, ...lexcore, ...ngao, ...gereji, ...lensTools,
  ...moreReads, ...moreWrites, ...highImpact, ...chatgpt,
];

export const MCP_TOOL_BY_ID = new Map(MCP_TOOLS.map(t => [t.id, t]));

/** Apps that are deliberately not exposed, with the reason (coverage matrix). */
export const MCP_EXCLUDED_APPS: Record<string, { status: 'platform_only' | 'internal' | 'blocked'; reason: string }> = {
  admin: { status: 'platform_only', reason: 'SuperAdmin platform console. Platform privileges are never available through a tenant MCP connection, and tenant admins cannot grant them.' },
  lens: { status: 'internal', reason: 'Internal SuperAdmin tooling (routes require SUPER_ADMIN). Excluded from tenant and customer discovery.' },
};
