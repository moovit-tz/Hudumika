import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export interface RelatedItem {
  id: string;
  label: string;
  sublabel?: string | null;
  status?: string | null;
  href: string;
}

export interface RelatedRelation {
  key: string;
  appLabel: string;
  appIcon: string; // an IconName, kept as a plain string here so this file has no frontend dependency
  appColor: string;
  /** "View all" link for this relation's own app. */
  appHref: string;
  fetch: (trx: Transaction<Database>, tenantId: string, entity: Record<string, any>) => Promise<RelatedItem[]>;
}

export interface RelatedEntityConfig {
  /** Loads the base row every relation's fetch() receives — e.g. a shipment
   *  needs both its id and its ref_number, since invoices link by the
   *  latter, not the former. Returns null if the entity doesn't exist (or
   *  isn't this tenant's), which 404s the whole request. */
  resolve: (trx: Transaction<Database>, tenantId: string, entityId: string) => Promise<Record<string, any> | undefined>;
  relations: RelatedRelation[];
}

/**
 * One registry, one place to add a relation — the generalized version of
 * ShipmentDetail.tsx's LinkedAppsPanel + GET /v1/shipments/:id/linked
 * (migrated below, `shipment`), now reusable for any entity type instead of
 * being hardcoded to shipments. Each relation is a small real query, not a
 * purely declarative column-mapping: the real relations here don't all
 * share one shape (invoices join by ref_number text, not the shipment's own
 * id; trips need a two-table left join) — a rigid table/foreignKey config
 * would not have fit them. What's still centralized is the one thing that
 * actually mattered: a new relation is one array entry here, not a new
 * hand-rolled endpoint plus a new hand-rolled panel component.
 *
 * Every fetch() is wrapped independently at the call site (related-
 * records.routes.ts), not here — same "one missing app must never break
 * the rest of the panel" convention the original /linked endpoint already
 * established.
 */
export const RELATED_REGISTRY: Record<string, RelatedEntityConfig> = {
  shipment: {
    resolve: (trx, tenantId, id) => trx.selectFrom('shipment_cases')
      .select(['id', 'ref_number'])
      .where('id', '=', id).where('tenant_id', '=', tenantId).where('deleted_at', 'is', null)
      .executeTakeFirst(),
    relations: [
      {
        key: 'invoices', appLabel: 'FinOps', appIcon: 'dollarSign', appColor: 'var(--green)', appHref: '/finops/invoices',
        fetch: async (trx, tenantId, shipment) => {
          const rows = await trx.selectFrom('sales_invoices')
            .select(['id', 'invoice_number', 'status', 'due_date'])
            .where('tenant_id', '=', tenantId).where('shipment_ref', '=', shipment.ref_number)
            .orderBy('created_at', 'desc').execute();
          // Billing.tsx (mounted bare at /finops/invoices, no nested :id
          // route and no ?invoice= deep-link param) has no per-invoice URL
          // to link to — same appHref-fallback reasoning as the shipment
          // relations above.
          return rows.map(r => ({ id: r.id, label: r.invoice_number, status: r.status, href: '/finops/invoices' }));
        },
      },
      {
        // Per-item hrefs below deliberately reuse the relation's own appHref
        // rather than guess a per-record detail URL: none of these apps'
        // route tables (checked live in App.tsx/*Shell.tsx, not assumed)
        // confirm a nested /:id detail page for a container or tracker
        // snapshot, and this panel doesn't even render item-level links
        // today (only the card-level appHref is clickable) — a fabricated
        // deep link that's simply never rendered is still wrong data to
        // hand back from an API.
        key: 'demurrage_containers', appLabel: 'Demurrage', appIcon: 'package', appColor: 'var(--gold)', appHref: '/demurrage',
        fetch: async (trx, tenantId, shipment) => {
          const rows = await trx.selectFrom('container_tracking')
            .select(['id', 'container_number', 'demurrage_days', 'status'])
            .where('tenant_id', '=', tenantId).where('shipment_id', '=', shipment.id).execute();
          return rows.map(r => ({ id: r.id, label: r.container_number, sublabel: `${r.demurrage_days}d demurrage`, status: r.status, href: '/demurrage' }));
        },
      },
      {
        key: 'tracker_snapshots', appLabel: 'CargoTracker', appIcon: 'mapPin', appColor: 'var(--blue)', appHref: '/cargotracker',
        fetch: async (trx, tenantId, shipment) => {
          const rows = await trx.selectFrom('tracking_snapshots')
            .select(['id', 'tracking_type', 'tracking_number', 'status', 'progress_pct'])
            .where('tenant_id', '=', tenantId).where('shipment_id', '=', shipment.id).execute();
          return rows.map(r => ({ id: r.id, label: r.tracking_number, sublabel: `${r.tracking_type} · ${r.progress_pct}%`, status: r.status, href: '/cargotracker' }));
        },
      },
      {
        // appHref was wrongly '/hudufreight/trips' in an earlier pass — no
        // /hudufreight/* route exists anywhere in App.tsx at all.
        // "HuduFreight" is only ever the *display name* for the app whose
        // real feature key and route prefix are both `tracking`
        // (LauncherApps.tsx: `{ id: 'tracking', name: 'HuduFreight', path:
        // '/tracking' }`) — /tracking/trips (which itself redirects to
        // /tracking/shipments) is the real, working link the original
        // LinkedAppsPanel already had before this file replaced it.
        key: 'transport_trips', appLabel: 'HuduFreight', appIcon: 'truck', appColor: 'var(--purple)', appHref: '/tracking/trips',
        fetch: async (trx, tenantId, shipment) => {
          const rows = await trx.selectFrom('trips')
            .leftJoin('vehicles', 'vehicles.id', 'trips.vehicle_id')
            .select(['trips.id', 'trips.status', 'trips.job_type', 'vehicles.plate_number'])
            .where('trips.tenant_id', '=', tenantId).where('trips.shipment_id', '=', shipment.id)
            .orderBy('trips.created_at', 'desc').execute();
          return rows.map(r => ({ id: r.id, label: r.plate_number ?? r.job_type, sublabel: r.job_type, status: r.status, href: '/tracking/trips' }));
        },
      },
    ],
  },

  // Real FK-backed relations (sales_invoices.customer_id, shipment_cases.
  // customer_id — both confirmed via the live schema, not assumed), added
  // fresh here rather than touching Customers.tsx's existing bespoke
  // per-tab loaders (loadShipments/loadFinance/etc.) — this is a compact
  // summary card additive to that page, not a replacement for its detailed
  // tabs.
  customer: {
    resolve: (trx, tenantId, id) => trx.selectFrom('customers')
      .select(['id', 'name'])
      .where('id', '=', id).where('tenant_id', '=', tenantId)
      .executeTakeFirst(),
    relations: [
      {
        key: 'invoices', appLabel: 'FinOps', appIcon: 'dollarSign', appColor: 'var(--green)', appHref: '/finops/invoices',
        fetch: async (trx, tenantId, customer) => {
          const rows = await trx.selectFrom('sales_invoices')
            .select(['id', 'invoice_number', 'status', 'due_date'])
            .where('tenant_id', '=', tenantId).where('customer_id', '=', customer.id)
            .orderBy('created_at', 'desc').limit(10).execute();
          // Billing.tsx (mounted bare at /finops/invoices, no nested :id
          // route and no ?invoice= deep-link param) has no per-invoice URL
          // to link to — same appHref-fallback reasoning as the shipment
          // relations above.
          return rows.map(r => ({ id: r.id, label: r.invoice_number, status: r.status, href: '/finops/invoices' }));
        },
      },
      {
        // appHref was wrongly '/clearos/shipments' in an earlier pass — no
        // such route exists; ClearOSShell.tsx's real shipment list lives at
        // "ops" (CommandCenter, breadcrumbed "Ops Command" — confirmed live
        // by opening a real shipment). The per-item href below, unlike the
        // other relations in this file, IS verified: /clearos/clearance/:id
        // is ShipmentDetail's real route (ClearOSShell.tsx) and was
        // confirmed by actually opening one in a browser during this
        // feature's own verification pass.
        key: 'shipments', appLabel: 'ClearOS', appIcon: 'ship', appColor: 'var(--teal)', appHref: '/clearos/ops',
        fetch: async (trx, tenantId, customer) => {
          const rows = await trx.selectFrom('shipment_cases')
            .select(['id', 'ref_number', 'stage', 'vessel'])
            .where('tenant_id', '=', tenantId).where('customer_id', '=', customer.id).where('deleted_at', 'is', null)
            .orderBy('created_at', 'desc').limit(10).execute();
          // `stage` isn't always a friendly string — this platform supports
          // per-tenant custom workflows (the "legacy-uuid transition" work),
          // and a custom-workflow shipment's stage is a UUID row id into
          // that workflow's own stages table. Resolving it to a label needs
          // a join this generic registry doesn't have budget for yet, so
          // this only ever shows it when it's plainly a fixed legacy
          // constant (no UUID) — omitting it beats showing a raw id.
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return rows.map(r => ({ id: r.id, label: r.ref_number, sublabel: r.vessel, status: UUID_RE.test(r.stage) ? null : r.stage, href: `/clearos/clearance/${r.id}` }));
        },
      },
    ],
  },
};
