import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { bumpCloudFolderCount } from '../lib/cloud-folder-count.js';

/**
 * Keeps the Cloud file manager (Drive app) in step with the rest of the
 * platform, automatically:
 *   • a folder appears under "Customers" when a customer account is created;
 *   • a sub-folder named by the shipment's BL/AWB reference appears when a
 *     shipment is created; and
 *   • every document uploaded to that shipment is mirrored into its BL folder,
 *     so staff find the paperwork in Drive without filing anything by hand.
 *
 * All of it is best-effort: a sync failure is logged, never allowed to fail the
 * customer/shipment/upload it is riding on. Each call runs in its own tenant
 * transaction for the same reason.
 */

function extOf(filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'file';
}

async function ensureDrive(trx: any, tenantId: string): Promise<string> {
  const existing = await trx.selectFrom('cloud_drives').select(['id'])
    .where('tenant_id', '=', tenantId).orderBy('created_at').executeTakeFirst();
  if (existing) return existing.id;
  const row = await trx.insertInto('cloud_drives').values({
    tenant_id: tenantId, name: 'My Drive', type: 'personal', owner_name: 'System',
  }).returning('id').executeTakeFirstOrThrow();
  return row.id;
}

/** Find a folder by (name, parent) in the drive, or create it. When `entity`
 *  is given, prefer an entity-tagged match first; if only a name-matched
 *  (untagged, pre-existing) row is found, tag it in place — this doubles as
 *  the backfill for folders created before entity linking existed, so there
 *  is no separate matching logic to keep in sync. */
async function ensureFolder(
  trx: any, tenantId: string, driveId: string, name: string, parentId: string | null,
  entity?: { type: string; id: string } | null,
): Promise<string> {
  if (entity) {
    const byEntity = await trx.selectFrom('cloud_files').select(['id'])
      .where('tenant_id', '=', tenantId).where('drive_id', '=', driveId).where('type', '=', 'folder')
      .where('entity_type', '=', entity.type).where('entity_id', '=', entity.id).executeTakeFirst();
    if (byEntity) return byEntity.id;
  }
  let q = trx.selectFrom('cloud_files').select(['id'])
    .where('tenant_id', '=', tenantId).where('drive_id', '=', driveId)
    .where('type', '=', 'folder').where('name', '=', name);
  q = parentId === null ? q.where('parent_id', 'is', null) : q.where('parent_id', '=', parentId);
  const existing = await q.executeTakeFirst();
  if (existing) {
    if (entity) {
      await trx.updateTable('cloud_files').set({ entity_type: entity.type, entity_id: entity.id, updated_at: new Date() })
        .where('id', '=', existing.id).execute();
    }
    return existing.id;
  }
  const row = await trx.insertInto('cloud_files').values({
    tenant_id: tenantId, drive_id: driveId, name, type: 'folder', size: 0, file_count: 0,
    parent_id: parentId, color: '#6366f1', owner_name: 'System',
    entity_type: entity?.type ?? null, entity_id: entity?.id ?? null,
  }).returning('id').executeTakeFirstOrThrow();
  return row.id;
}

async function customerName(trx: any, tenantId: string, customerId: string | null): Promise<string> {
  if (!customerId) return 'Unassigned';
  const c = await trx.selectFrom('customers').select(['name'])
    .where('id', '=', customerId).where('tenant_id', '=', tenantId).executeTakeFirst();
  return (c?.name ?? '').trim() || 'Unassigned';
}

async function employeeName(trx: any, tenantId: string, userId: string | null): Promise<string> {
  if (!userId) return 'Unassigned';
  const u = await trx.selectFrom('users').select(['name'])
    .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
  return (u?.name ?? '').trim() || 'Unassigned';
}

type SealType = 'lot' | 'consignment' | 'container';

/** Resolves a SEAL lot/consignment/container back to its owning customer and
 *  a human-readable label, or null when there's no customer owner to link to
 *  (an unknown id, or seal_documents' other two entity kinds — customs_entry/
 *  compartment are warehouse-internal, deliberately out of scope for Cloud
 *  linking). A container's owner comes via its consignment — containers
 *  have no owner_id of their own. */
async function sealOwnerAndLabel(trx: any, tenantId: string, sealType: SealType, sealId: string): Promise<{ ownerId: string; label: string } | null> {
  if (sealType === 'lot') {
    const lot = await trx.selectFrom('seal_lots').select(['owner_id', 'description'])
      .where('id', '=', sealId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return lot ? { ownerId: lot.owner_id, label: (lot.description ?? '').trim() || 'Lot' } : null;
  }
  if (sealType === 'consignment') {
    const c = await trx.selectFrom('seal_consignments').select(['owner_id', 'transport_doc_number'])
      .where('id', '=', sealId).where('tenant_id', '=', tenantId).executeTakeFirst();
    return c ? { ownerId: c.owner_id, label: (c.transport_doc_number ?? '').trim() || 'Consignment' } : null;
  }
  const container = await trx.selectFrom('seal_containers').select(['consignment_id', 'container_number'])
    .where('id', '=', sealId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!container) return null;
  const c = await trx.selectFrom('seal_consignments').select(['owner_id'])
    .where('id', '=', container.consignment_id).where('tenant_id', '=', tenantId).executeTakeFirst();
  return c ? { ownerId: c.owner_id, label: (container.container_number ?? '').trim() || 'Container' } : null;
}

export const CloudSync = {
  /** Customers ▸ <customer> — on customer account creation. Tagged
   *  entity_type='customer' so this folder is reliably queryable, not just
   *  name-matched. */
  async ensureCustomerFolder(tenantId: string, customerId: string, name: string | null): Promise<void> {
    const clean = (name ?? '').trim();
    if (!clean) return;
    await withTenant(tenantId, async (trx) => {
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      await ensureFolder(trx, tenantId, driveId, clean, root, { type: 'customer', id: customerId });
    });
  },

  /** Customers ▸ <customer> ▸ <BL> — on shipment creation. The BL/AWB
   *  folder itself is tagged entity_type='shipment'; the customer folder
   *  above it stays tagged 'customer' as ensureCustomerFolder already set it. */
  async ensureShipmentFolder(tenantId: string, customerId: string | null, shipmentId: string, blRef: string): Promise<void> {
    const ref = (blRef ?? '').trim();
    if (!ref) return;
    await withTenant(tenantId, async (trx) => {
      const cust = await customerName(trx, tenantId, customerId);
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      const custFolder = await ensureFolder(trx, tenantId, driveId, cust, root, customerId ? { type: 'customer', id: customerId } : null);
      await ensureFolder(trx, tenantId, driveId, ref, custFolder, { type: 'shipment', id: shipmentId });
    });
  },

  /** Mirror one uploaded shipment document into Customers ▸ <customer> ▸ <BL>,
   *  tagging the mirrored file itself entity_type='shipment' — this is what
   *  actually makes a shipment's documents visible to its own customer (see
   *  files.routes.ts GET / CUSTOMER branch). */
  async syncShipmentDoc(tenantId: string, args: { customerId: string | null; shipmentId: string; blRef: string; filename: string; buffer: Buffer; mime?: string }): Promise<void> {
    const ref = (args.blRef ?? '').trim();
    if (!ref || !args.filename) return;
    await withTenant(tenantId, async (trx) => {
      const cust = await customerName(trx, tenantId, args.customerId);
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      const custFolder = await ensureFolder(trx, tenantId, driveId, cust, root, args.customerId ? { type: 'customer', id: args.customerId } : null);
      const blFolder = await ensureFolder(trx, tenantId, driveId, ref, custFolder, { type: 'shipment', id: args.shipmentId });

      // Replace a same-named file instead of piling up duplicates on re-upload.
      const dup = await trx.selectFrom('cloud_files').select(['id', 'size'])
        .where('tenant_id', '=', tenantId).where('parent_id', '=', blFolder).where('name', '=', args.filename).executeTakeFirst();
      const fileId = dup?.id ?? (await trx.insertInto('cloud_files').values({
        tenant_id: tenantId, drive_id: driveId, name: args.filename, type: extOf(args.filename),
        size: args.buffer.length, parent_id: blFolder, owner_name: 'System', mime_type: args.mime ?? null,
        entity_type: 'shipment', entity_id: args.shipmentId,
      }).returning('id').executeTakeFirstOrThrow()).id;

      const { storageKey } = await MinioIntegration.uploadCloudFile(tenantId, fileId, args.filename, args.buffer);
      await trx.updateTable('cloud_files')
        .set({ storage_key: storageKey, size: args.buffer.length, updated_at: new Date(), entity_type: 'shipment', entity_id: args.shipmentId })
        .where('id', '=', fileId).execute();

      // The insert above (and every sibling sync* below) used to leave the
      // BL folder's own file_count/size exactly where it was — a customer's
      // shipment folder could genuinely hold a real mirrored document and
      // still show "0 files" in the UI, because nothing had ever told the
      // parent row its count changed the way every real upload/move/delete
      // in files.routes.ts already does via this same helper.
      await bumpCloudFolderCount(trx, blFolder, tenantId, dup ? 0 : 1, args.buffer.length - Number(dup?.size ?? 0));
    });
  },

  /** Employees ▸ <name> — top-level folder parallel to "Customers", tagged
   *  entity_type='employee'. Never customer/org-visible (see the fan-out
   *  OR-clauses in files.routes.ts/org.routes.ts, which only ever check
   *  'customer'/'shipment'/'seal_*' — 'employee' is deliberately excluded so
   *  a staff member's HR paperwork can never leak into a customer-facing
   *  view). Lazily created by syncEmployeeDoc on first upload, same as a
   *  shipment's BL folder — no separate call site needed at user-creation
   *  time. */
  async ensureEmployeeFolder(tenantId: string, userId: string, name: string | null): Promise<void> {
    const clean = (name ?? '').trim();
    if (!clean) return;
    await withTenant(tenantId, async (trx) => {
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Employees', null);
      await ensureFolder(trx, tenantId, driveId, clean, root, { type: 'employee', id: userId });
    });
  },

  /** Mirror one uploaded HR document into Employees ▸ <name>, tagging the
   *  mirrored file itself entity_type='employee'. Skipped entirely for an
   *  "unattached" document (no user_id) — hr_documents deliberately allows
   *  a policy/template to belong to nobody in particular, and there is
   *  nothing coherent to link such a file to in Cloud. */
  async syncEmployeeDoc(tenantId: string, args: { userId: string | null; filename: string; buffer: Buffer; mime?: string }): Promise<void> {
    const userId = args.userId;
    if (!userId || !args.filename) return;
    await withTenant(tenantId, async (trx) => {
      const name = await employeeName(trx, tenantId, userId);
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Employees', null);
      const empFolder = await ensureFolder(trx, tenantId, driveId, name, root, { type: 'employee', id: userId });

      const dup = await trx.selectFrom('cloud_files').select(['id', 'size'])
        .where('tenant_id', '=', tenantId).where('parent_id', '=', empFolder).where('name', '=', args.filename).executeTakeFirst();
      const fileId = dup?.id ?? (await trx.insertInto('cloud_files').values({
        tenant_id: tenantId, drive_id: driveId, name: args.filename, type: extOf(args.filename),
        size: args.buffer.length, parent_id: empFolder, owner_name: 'System', mime_type: args.mime ?? null,
        entity_type: 'employee', entity_id: userId,
      }).returning('id').executeTakeFirstOrThrow()).id;

      const { storageKey } = await MinioIntegration.uploadCloudFile(tenantId, fileId, args.filename, args.buffer);
      await trx.updateTable('cloud_files')
        .set({ storage_key: storageKey, size: args.buffer.length, updated_at: new Date(), entity_type: 'employee', entity_id: userId })
        .where('id', '=', fileId).execute();

      await bumpCloudFolderCount(trx, empFolder, tenantId, dup ? 0 : 1, args.buffer.length - Number(dup?.size ?? 0));
    });
  },

  /** Same self-healing role as backfillCustomer, for one employee's folder —
   *  resolves/creates it and retags any untagged direct child. No
   *  sub-entity loop needed (an employee has nothing analogous to a
   *  shipment to fan out to), so this is the simple one-level case. */
  async backfillEmployee(tenantId: string, userId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const user = await trx.selectFrom('users').select(['id', 'name'])
        .where('id', '=', userId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!user) return;
      const clean = (user.name ?? '').trim();
      if (!clean) return;

      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Employees', null);
      const empFolder = await ensureFolder(trx, tenantId, driveId, clean, root, { type: 'employee', id: user.id });
      await trx.updateTable('cloud_files')
        .set({ entity_type: 'employee', entity_id: user.id, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('parent_id', '=', empFolder).where('entity_type', 'is', null)
        .execute();
    });
  },

  /** Mirror one uploaded SEAL document into Customers ▸ <owner> ▸ SEAL ▸
   *  <lot/consignment/container label>, tagging the mirrored file itself
   *  entity_type='seal_lot'|'seal_consignment'|'seal_container' (prefixed
   *  so it can never collide with seal_documents' own separate entity_type
   *  enum on a different table, or with cloud_files' existing 'customer'/
   *  'shipment' values). The "SEAL" grouping folder stays untagged and
   *  structural, same as "Customers" itself — it exists so a lot's Cloud
   *  folder can never collide with a same-named BL folder sitting at the
   *  same level. Lazily creates every folder on first call, same pattern as
   *  syncShipmentDoc — no separate creation-time call site needed. A no-op
   *  for customs_entry/compartment documents (sealOwnerAndLabel returns
   *  null for those) and for an id that doesn't resolve to a real row. */
  async syncSealDoc(tenantId: string, args: { sealType: SealType; sealId: string; filename: string; buffer: Buffer; mime?: string }): Promise<void> {
    if (!args.filename) return;
    await withTenant(tenantId, async (trx) => {
      const resolved = await sealOwnerAndLabel(trx, tenantId, args.sealType, args.sealId);
      if (!resolved) return;
      const cust = await customerName(trx, tenantId, resolved.ownerId);
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      const custFolder = await ensureFolder(trx, tenantId, driveId, cust, root, { type: 'customer', id: resolved.ownerId });
      const sealRoot = await ensureFolder(trx, tenantId, driveId, 'SEAL', custFolder, null);
      const entityType = `seal_${args.sealType}`;
      const sealFolder = await ensureFolder(trx, tenantId, driveId, resolved.label, sealRoot, { type: entityType, id: args.sealId });

      const dup = await trx.selectFrom('cloud_files').select(['id', 'size'])
        .where('tenant_id', '=', tenantId).where('parent_id', '=', sealFolder).where('name', '=', args.filename).executeTakeFirst();
      const fileId = dup?.id ?? (await trx.insertInto('cloud_files').values({
        tenant_id: tenantId, drive_id: driveId, name: args.filename, type: extOf(args.filename),
        size: args.buffer.length, parent_id: sealFolder, owner_name: 'System', mime_type: args.mime ?? null,
        entity_type: entityType, entity_id: args.sealId,
      }).returning('id').executeTakeFirstOrThrow()).id;

      const { storageKey } = await MinioIntegration.uploadCloudFile(tenantId, fileId, args.filename, args.buffer);
      await trx.updateTable('cloud_files')
        .set({ storage_key: storageKey, size: args.buffer.length, updated_at: new Date(), entity_type: entityType, entity_id: args.sealId })
        .where('id', '=', fileId).execute();

      await bumpCloudFolderCount(trx, sealFolder, tenantId, dup ? 0 : 1, args.buffer.length - Number(dup?.size ?? 0));
    });
  },

  /** Same self-healing role as backfillCustomer/backfillEmployee, for one
   *  SEAL lot/consignment/container's folder. */
  async backfillSeal(tenantId: string, sealType: SealType, sealId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const resolved = await sealOwnerAndLabel(trx, tenantId, sealType, sealId);
      if (!resolved) return;
      const cust = await customerName(trx, tenantId, resolved.ownerId);
      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      const custFolder = await ensureFolder(trx, tenantId, driveId, cust, root, { type: 'customer', id: resolved.ownerId });
      const sealRoot = await ensureFolder(trx, tenantId, driveId, 'SEAL', custFolder, null);
      const entityType = `seal_${sealType}`;
      const sealFolder = await ensureFolder(trx, tenantId, driveId, resolved.label, sealRoot, { type: entityType, id: sealId });
      await trx.updateTable('cloud_files')
        .set({ entity_type: entityType, entity_id: sealId, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('parent_id', '=', sealFolder).where('entity_type', 'is', null)
        .execute();
    });
  },

  /** Resolves (creating if necessary) one customer's own Drive folder and
   *  every one of their shipment/BL subfolders, and retroactively tags any
   *  UNTAGGED direct child already sitting in one of those folders —
   *  a document uploaded straight into Drive, or mirrored before entity-
   *  tagging existed for this tenant, before this call had ever run.
   *  Deliberately single-level (a folder's direct children only, same as
   *  the creation-time inheritance in files.routes.ts POST /folder and
   *  POST /upload) — never touches a row that already carries any tag of
   *  its own, so nothing explicit (an intentional PATCH link, a real
   *  different entity) is ever silently overwritten. Cheap enough to call
   *  on every "open this customer's Documents/Drive folder" — this is what
   *  makes the sync automatic rather than requiring a manual SuperAdmin
   *  resync, for the one customer actually being looked at right now.
   *
   *  Order matters: shipment/BL folders live as DIRECT children of the
   *  customer's own folder (same level as any loose file the customer
   *  itself owns), so the shipment loop must claim its own untagged BL
   *  folders (by name+parent match, same as ensureFolder always does)
   *  BEFORE the customer-level sweep runs — otherwise the sweep can't
   *  distinguish "an untagged BL folder waiting for its shipment loop
   *  turn" from "a loose file that really is the customer's own", and
   *  mis-tags the former as 'customer'. This shipped once and mis-tagged a
   *  real, pre-existing shipment folder; fixed by resolving every
   *  shipment folder first, sweeping loose customer-level children last. */
  async backfillCustomer(tenantId: string, customerId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const customer = await trx.selectFrom('customers').select(['id', 'name'])
        .where('id', '=', customerId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!customer) return;
      const clean = (customer.name ?? '').trim();
      if (!clean) return;

      const driveId = await ensureDrive(trx, tenantId);
      const root = await ensureFolder(trx, tenantId, driveId, 'Customers', null);
      const custFolder = await ensureFolder(trx, tenantId, driveId, clean, root, { type: 'customer', id: customer.id });

      const shipments = await trx.selectFrom('shipment_cases')
        .select(['id', 'bl_number', 'awb_number', 'ref_number'])
        .where('tenant_id', '=', tenantId).where('customer_id', '=', customerId).execute();
      for (const s of shipments) {
        const ref = (s.bl_number || s.awb_number || s.ref_number || '').trim();
        if (!ref) continue;
        const blFolder = await ensureFolder(trx, tenantId, driveId, ref, custFolder, { type: 'shipment', id: s.id });
        await trx.updateTable('cloud_files')
          .set({ entity_type: 'shipment', entity_id: s.id, updated_at: new Date() })
          .where('tenant_id', '=', tenantId).where('parent_id', '=', blFolder).where('entity_type', 'is', null)
          .execute();
      }

      // Only after every shipment has claimed its own BL folder does
      // whatever is still untagged directly under custFolder genuinely
      // belong to the customer itself, not to one of its shipments.
      await trx.updateTable('cloud_files')
        .set({ entity_type: 'customer', entity_id: customer.id, updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('parent_id', '=', custFolder).where('entity_type', 'is', null)
        .execute();
    });
  },

  /** Explicit, repeatable remediation for tenants that had customers/shipments
   *  created before entity-linking existed — safe to call repeatedly since
   *  ensureFolder() upgrades an old name-matched row in place rather than
   *  duplicating it. */
  async backfillTenant(tenantId: string): Promise<{ customersTagged: number; shipmentsTagged: number }> {
    let customersTagged = 0;
    let shipmentsTagged = 0;
    const customers = await withTenant(tenantId, trx =>
      trx.selectFrom('customers').select(['id', 'name']).where('tenant_id', '=', tenantId).execute()
    );
    for (const c of customers) {
      await this.ensureCustomerFolder(tenantId, c.id, c.name);
      customersTagged++;
    }
    const shipments = await withTenant(tenantId, trx =>
      trx.selectFrom('shipment_cases')
        .select(['id', 'customer_id', 'bl_number', 'awb_number', 'ref_number'])
        .where('tenant_id', '=', tenantId).execute()
    );
    for (const s of shipments) {
      const ref = s.bl_number || s.awb_number || s.ref_number;
      if (!ref) continue;
      await this.ensureShipmentFolder(tenantId, s.customer_id, s.id, ref);
      shipmentsTagged++;
    }
    return { customersTagged, shipmentsTagged };
  },
};
