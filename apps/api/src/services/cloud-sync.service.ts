import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

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
      const dup = await trx.selectFrom('cloud_files').select(['id'])
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
