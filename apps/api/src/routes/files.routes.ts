import crypto from 'crypto';
import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';
import { isPlatformSuperAdmin } from '../middleware/rbac.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { getStorageQuota, wouldExceedStorageQuota } from '../lib/storage-quota.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { resolveServedContentType } from '../lib/safe-file-serving.js';

function fmtGB(bytes: number): string {
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || 'txt';
}

/** Never a real row — filters a query to nothing when a CUSTOMER login's
 *  resolveCustomerId() comes back null, rather than one wrong branch away
 *  from filtering to everything. Same convention as shipments.routes.ts. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** A CUSTOMER-role upload has no drive of its own to post into — it lands in
 *  the tenant's default (first-created) drive, auto-creating one the same
 *  way GET /v1/drives does for a brand-new tenant, rather than trusting
 *  whatever drive_id the client happened to send. */
async function ensureDefaultDrive(trx: Transaction<Database>, tenantId: string): Promise<string> {
  const existing = await trx.selectFrom('cloud_drives').select('id')
    .where('tenant_id', '=', tenantId).orderBy('created_at').executeTakeFirst();
  if (existing) return existing.id;
  const created = await trx.insertInto('cloud_drives').values({
    tenant_id: tenantId, name: 'My Drive', type: 'personal', owner_name: 'You',
  }).returningAll().executeTakeFirstOrThrow();
  return created.id;
}

const STORAGE_PROVIDERS = ['box', 'dropbox', 'mega', 'onedrive'] as const;
type StorageProvider = typeof STORAGE_PROVIDERS[number];

const PROVIDER_LABEL: Record<StorageProvider, string> = {
  box: 'Box', dropbox: 'Dropbox', mega: 'Mega', onedrive: 'OneDrive',
};

interface ExtSeedItem { key: string; parentKey: string | null; name: string; type: string; size?: number; daysAgo?: number }

function externalSeedFor(provider: StorageProvider): ExtSeedItem[] {
  const p = PROVIDER_LABEL[provider];
  return [
    { key:'F1', parentKey:null, name:`${p} Backups`,     type:'folder', daysAgo:40 },
    { key:'F2', parentKey:null, name:`${p} Shared Docs`, type:'folder', daysAgo:20 },
    { key:'R1', parentKey:null, name:'Company_Overview.pdf', type:'pdf', size:1_200_000, daysAgo:10 },
    { key:'S1', parentKey:'F1', name:'Backup_2025-01.zip', type:'zip', size:820_000_000, daysAgo:35 },
    { key:'S2', parentKey:'F1', name:'Backup_2025-02.zip', type:'zip', size:910_000_000, daysAgo:5 },
    { key:'S3', parentKey:'F2', name:'Team_Notes.docx',   type:'docx', size:150_000, daysAgo:12 },
    { key:'S4', parentKey:'F2', name:'Roadmap.xlsx',      type:'xlsx', size:340_000, daysAgo:8 },
  ];
}

async function seedExternalFilesIfEmpty(trx: Transaction<Database>, tenantId: string, provider: StorageProvider) {
  const existing = await trx.selectFrom('cloud_external_files').select(['id'])
    .where('tenant_id', '=', tenantId).where('provider', '=', provider).executeTakeFirst();
  if (existing) return;

  const idMap = new Map<string, string>();
  const remaining = externalSeedFor(provider);
  while (remaining.length) {
    const doneIdxs: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      if (item.parentKey !== null && !idMap.has(item.parentKey)) continue;
      const row = await trx.insertInto('cloud_external_files').values({
        tenant_id: tenantId,
        provider,
        name: item.name,
        type: item.type,
        size: item.size ?? null,
        parent_id: item.parentKey ? idMap.get(item.parentKey)! : null,
        created_at: daysAgo(item.daysAgo ?? 10),
        updated_at: daysAgo(item.daysAgo ?? 10),
      }).returningAll().executeTakeFirstOrThrow();
      idMap.set(item.key, row.id);
      doneIdxs.push(i);
    }
    if (doneIdxs.length === 0) break;
    for (let i = doneIdxs.length - 1; i >= 0; i--) remaining.splice(doneIdxs[i], 1);
  }
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

/** Rows come back from pg with BIGINT columns as strings — normalize for the frontend. */
function serialize(row: any, shared: { name: string; role: string; principal_type?: string | null; principal_id?: string | null }[] = []) {
  return {
    ...row,
    size: row.size != null ? Number(row.size) : null,
    file_count: row.file_count != null ? Number(row.file_count) : 0,
    shared,
  };
}

async function attachShares(trx: Transaction<Database>, files: any[]) {
  const ids = files.map(f => f.id);
  if (ids.length === 0) return [];
  const shares = await trx.selectFrom('cloud_file_shares').selectAll().where('file_id', 'in', ids).execute();
  const byFile: Record<string, { name: string; role: string; principal_type: string | null; principal_id: string | null }[]> = {};
  for (const s of shares) (byFile[s.file_id] ??= []).push({ name: s.person_name, role: s.role, principal_type: s.principal_type, principal_id: s.principal_id });
  return files.map(f => serialize(f, byFile[f.id] ?? []));
}

/** This customer's SEAL lot/consignment/container ids — the same shape as
 *  the shipmentIds fan-out below, so a customer/org's visibility also
 *  reaches SEAL documents CloudSync.syncSealDoc mirrored in (§B3/B4). A
 *  container has no owner_id of its own; its owner comes via its
 *  consignment, same as sealOwnerAndLabel() on the write side. */
async function sealEntityIds(trx: Transaction<Database>, tenantId: string, customerId: string) {
  const lots = await trx.selectFrom('seal_lots').select('id')
    .where('tenant_id', '=', tenantId).where('owner_id', '=', customerId).execute();
  const consignments = await trx.selectFrom('seal_consignments').select('id')
    .where('tenant_id', '=', tenantId).where('owner_id', '=', customerId).execute();
  const consignmentIds = consignments.map(c => c.id);
  const containers = consignmentIds.length > 0
    ? await trx.selectFrom('seal_containers').select('id')
        .where('tenant_id', '=', tenantId).where('consignment_id', 'in', consignmentIds).execute()
    : [];
  return { lotIds: lots.map(l => l.id), consignmentIds, containerIds: containers.map(c => c.id) };
}

function sealOrClauses(eb: any, sealIds: { lotIds: string[]; consignmentIds: string[]; containerIds: string[] }) {
  return [
    ...(sealIds.lotIds.length > 0 ? [eb.and([eb('entity_type', '=', 'seal_lot'), eb('entity_id', 'in', sealIds.lotIds)])] : []),
    ...(sealIds.consignmentIds.length > 0 ? [eb.and([eb('entity_type', '=', 'seal_consignment'), eb('entity_id', 'in', sealIds.consignmentIds)])] : []),
    ...(sealIds.containerIds.length > 0 ? [eb.and([eb('entity_type', '=', 'seal_container'), eb('entity_id', 'in', sealIds.containerIds)])] : []),
  ];
}

/** Whether a CUSTOMER-role caller may read this file's bytes — the same
 *  rule the GET / CUSTOMER list branch already grants (own directly-tagged
 *  files, their shipments' documents, their SEAL lots/consignments/
 *  containers' documents per §B4, or anything explicitly shared with them).
 *  Shared by GET /:id/download and GET /:id/preview so the two can never
 *  quietly drift apart on who's allowed to read what — this closes a real
 *  gap where the list already included SEAL-linked files but the download
 *  route's own ownership check had never been extended to match. */
async function canCustomerAccessFile(
  trx: Transaction<Database>, tenantId: string, cid: string | null,
  file: { entity_type: string | null; entity_id: string | null; id: string },
): Promise<boolean> {
  if (!cid) return false;
  if (file.entity_type === 'customer' && file.entity_id === cid) return true;
  if (file.entity_type === 'shipment') {
    const own = await trx.selectFrom('shipment_cases').select('id')
      .where('id', '=', file.entity_id!).where('tenant_id', '=', tenantId).where('customer_id', '=', cid).executeTakeFirst();
    if (own) return true;
  }
  if (file.entity_type === 'seal_lot' || file.entity_type === 'seal_consignment' || file.entity_type === 'seal_container') {
    const sealIds = await sealEntityIds(trx, tenantId, cid);
    const idSet = file.entity_type === 'seal_lot' ? sealIds.lotIds
      : file.entity_type === 'seal_consignment' ? sealIds.consignmentIds
      : sealIds.containerIds;
    if (idSet.includes(file.entity_id!)) return true;
  }
  const shared = await trx.selectFrom('cloud_file_shares').select('id')
    .where('file_id', '=', file.id).where('principal_type', '=', 'customer').where('principal_id', '=', cid).executeTakeFirst();
  return !!shared;
}

async function bumpParentCount(trx: Transaction<Database>, parentId: string, tenantId: string, countDelta: number, sizeDelta: number) {
  const parent = await trx.selectFrom('cloud_files').select(['file_count', 'size'])
    .where('id', '=', parentId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!parent) return;
  await trx.updateTable('cloud_files').set({
    file_count: Math.max(0, Number(parent.file_count || 0) + countDelta),
    size: Math.max(0, Number(parent.size || 0) + sizeDelta),
    updated_at: new Date(),
  }).where('id', '=', parentId).execute();
}

interface SeedItem {
  key: string;
  parentKey: string | null;
  name: string;
  type: string;
  size?: number;
  fileCount?: number;
  color?: string;
  description?: string;
  starred?: boolean;
  shared?: { name: string; role: 'Viewer' | 'Editor' }[];
  createdDaysAgo?: number;
  modifiedDaysAgo?: number;
}

const SEED: SeedItem[] = [
  { key:'F1', parentKey:null, name:'Shipment Documents',   type:'folder', fileCount:47,  size:2_300_000_000, color:'#f59e0b', description:'Bills of lading, manifests and cargo documents',        createdDaysAgo:150, modifiedDaysAgo:1 },
  { key:'F2', parentKey:null, name:'Invoices & Billing',   type:'folder', fileCount:234, size:4_800_000_000, color:'#22c55e', description:'Customer invoices, payment receipts and billing records', createdDaysAgo:150, modifiedDaysAgo:2 },
  { key:'F3', parentKey:null, name:'Customs Declarations', type:'folder', fileCount:89,  size:1_200_000_000, color:'#3b82f6', description:'TANCIS declarations, customs entries and permits',      createdDaysAgo:150, modifiedDaysAgo:3 },
  { key:'F4', parentKey:null, name:'Purchase Orders',      type:'folder', fileCount:56,  size:  890_000_000, color:'#a855f7', description:'Supplier purchase orders and goods receipts',           createdDaysAgo:150, modifiedDaysAgo:4 },
  { key:'F5', parentKey:null, name:'Contracts',            type:'folder', fileCount:23,  size:  450_000_000, color:'#0891b2', description:'Client contracts and service agreements',               createdDaysAgo:150, modifiedDaysAgo:5 },
  { key:'F6', parentKey:null, name:'Clearance Reports',    type:'folder', fileCount:112, size:3_100_000_000, color:'#ef4444', description:'Monthly and annual clearance summary reports',          createdDaysAgo:150, modifiedDaysAgo:6 },
  { key:'F7', parentKey:null, name:'Templates',            type:'folder', fileCount:18,  size:  220_000_000, color:'#6b7280', description:'Document templates for common operations',              createdDaysAgo:150, modifiedDaysAgo:16 },
  { key:'F8', parentKey:null, name:'Client Documents',     type:'folder', fileCount:67,  size:1_700_000_000, color:'#6366f1', description:'Client-specific document collections',                  createdDaysAgo:150, modifiedDaysAgo:1 },

  { key:'R1', parentKey:null, name:'Q1_2025_Summary_Report.pdf',       type:'pdf',  size:2_300_000, starred:true,  shared:[{name:'Amina Hassan',role:'Editor'},{name:'John Mwangi',role:'Viewer'}], createdDaysAgo:1,  modifiedDaysAgo:1 },
  { key:'R2', parentKey:null, name:'Annual_Clearance_Stats_2024.xlsx', type:'xlsx', size:1_800_000, shared:[{name:'Peter Kimani',role:'Editor'}], createdDaysAgo:20, modifiedDaysAgo:3 },
  { key:'R3', parentKey:null, name:'Company_Profile.docx',             type:'docx', size:  850_000, createdDaysAgo:40, modifiedDaysAgo:8 },
  { key:'R4', parentKey:null, name:'Port_Procedures_Handbook.pdf',     type:'pdf',  size:4_200_000, starred:true, shared:[{name:'Fatuma Ally',role:'Viewer'},{name:'Grace Osei',role:'Editor'},{name:'Amina Hassan',role:'Viewer'}], createdDaysAgo:60, modifiedDaysAgo:16 },
  { key:'R5', parentKey:null, name:'KPI_Dashboard_Feb2025.xlsx',       type:'xlsx', size:2_100_000, shared:[{name:'John Mwangi',role:'Viewer'}], createdDaysAgo:5, modifiedDaysAgo:5 },

  { key:'S1', parentKey:'F1', name:'BL_Summit_Traders_2025-001.pdf',  type:'pdf',  size:450_000, shared:[{name:'Amina Hassan',role:'Viewer'}], createdDaysAgo:1, modifiedDaysAgo:1 },
  { key:'S2', parentKey:'F1', name:'BL_Serengeti_Foods_2025-002.pdf', type:'pdf',  size:380_000, starred:true, createdDaysAgo:2, modifiedDaysAgo:2 },
  { key:'S3', parentKey:'F1', name:'Cargo_Manifest_Jan2025.xlsx',     type:'xlsx', size:920_000, createdDaysAgo:14, modifiedDaysAgo:14 },
  { key:'S4', parentKey:'F1', name:'Packing_List_EAC_001.docx',       type:'docx', size:240_000, createdDaysAgo:17, modifiedDaysAgo:17 },
  { key:'S5', parentKey:'F1', name:'Insurance_Certificate_Jan.pdf',   type:'pdf',  size:610_000, shared:[{name:'Peter Kimani',role:'Editor'}], createdDaysAgo:20, modifiedDaysAgo:20 },
  { key:'S6', parentKey:'F1', name:'Freight_Rate_Matrix_Q1.xlsx',     type:'xlsx', size:1_200_000, createdDaysAgo:25, modifiedDaysAgo:25 },
  { key:'S7', parentKey:'F1', name:'Vessel_Schedule_Feb2025.pdf',     type:'pdf',  size:890_000, createdDaysAgo:7, modifiedDaysAgo:7 },
  { key:'S8', parentKey:'F1', name:'Arrival_Notice_KE_Cement.pdf',    type:'pdf',  size:320_000, starred:true, createdDaysAgo:3, modifiedDaysAgo:3 },
  { key:'SF1', parentKey:'F1', name:'Sea Freight', type:'folder', fileCount:12, size:1_100_000_000, color:'#f59e0b', createdDaysAgo:120, modifiedDaysAgo:14 },
  { key:'SF2', parentKey:'F1', name:'Air Freight',  type:'folder', fileCount:8,  size:  540_000_000, color:'#f59e0b', createdDaysAgo:120, modifiedDaysAgo:21 },

  { key:'I1', parentKey:'F2', name:'INV-2025-001_Summit_Traders.pdf',  type:'pdf',  size:280_000, shared:[{name:'Amina Hassan',role:'Viewer'}], createdDaysAgo:1, modifiedDaysAgo:1 },
  { key:'I2', parentKey:'F2', name:'INV-2025-002_Serengeti_Foods.pdf', type:'pdf',  size:295_000, createdDaysAgo:3, modifiedDaysAgo:3 },
  { key:'I3', parentKey:'F2', name:'Invoice_Register_Feb2025.xlsx',    type:'xlsx', size:1_400_000, starred:true, createdDaysAgo:14, modifiedDaysAgo:1 },
  { key:'I4', parentKey:'F2', name:'Payment_Receipts_Jan2025.pdf',     type:'pdf',  size:760_000, createdDaysAgo:10, modifiedDaysAgo:10 },
  { key:'I5', parentKey:'F2', name:'Duty_Payments_Q1_2025.xlsx',       type:'xlsx', size:2_200_000, shared:[{name:'John Mwangi',role:'Editor'},{name:'Peter Kimani',role:'Viewer'}], createdDaysAgo:5, modifiedDaysAgo:5 },
  { key:'I6', parentKey:'F2', name:'Credit_Notes_Summary.docx',        type:'docx', size:430_000, createdDaysAgo:9, modifiedDaysAgo:9 },

  { key:'C1', parentKey:'F3', name:'Declaration_TZ-2025-0341.pdf',    type:'pdf',  size:520_000, createdDaysAgo:2, modifiedDaysAgo:2 },
  { key:'C2', parentKey:'F3', name:'Declaration_TZ-2025-0342.pdf',    type:'pdf',  size:490_000, starred:true, createdDaysAgo:3, modifiedDaysAgo:3 },
  { key:'C3', parentKey:'F3', name:'Customs_Entries_Jan2025.xlsx',    type:'xlsx', size:1_800_000, shared:[{name:'Grace Osei',role:'Editor'}], createdDaysAgo:10, modifiedDaysAgo:10 },
  { key:'C4', parentKey:'F3', name:'Import_Permits_Q1.pdf',           type:'pdf',  size:670_000, createdDaysAgo:16, modifiedDaysAgo:16 },
  { key:'C5', parentKey:'F3', name:'Tariff_Classification_Guide.pdf', type:'pdf',  size:3_400_000, shared:[{name:'Amina Hassan',role:'Viewer'},{name:'John Mwangi',role:'Viewer'}], createdDaysAgo:30, modifiedDaysAgo:30 },
];

async function seedSampleFiles(trx: Transaction<Database>, tenantId: string, driveId: string) {
  const idMap = new Map<string, string>();
  const remaining = [...SEED];
  while (remaining.length) {
    const doneIdxs: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i];
      if (item.parentKey !== null && !idMap.has(item.parentKey)) continue;
      const row = await trx.insertInto('cloud_files').values({
        tenant_id: tenantId,
        drive_id: driveId,
        name: item.name,
        type: item.type,
        size: item.size ?? null,
        file_count: item.fileCount ?? 0,
        parent_id: item.parentKey ? idMap.get(item.parentKey)! : null,
        color: item.color ?? null,
        description: item.description ?? null,
        owner_name: 'You',
        starred: item.starred ?? false,
        created_at: daysAgo(item.createdDaysAgo ?? 30),
        updated_at: daysAgo(item.modifiedDaysAgo ?? item.createdDaysAgo ?? 5),
      }).returningAll().executeTakeFirstOrThrow();
      idMap.set(item.key, row.id);
      if (item.shared?.length) {
        await trx.insertInto('cloud_file_shares').values(
          item.shared.map(s => ({ file_id: row.id, person_name: s.name, role: s.role }))
        ).execute();
      }
      doneIdxs.push(i);
    }
    if (doneIdxs.length === 0) break; // safety valve against a bad parentKey
    for (let i = doneIdxs.length - 1; i >= 0; i--) remaining.splice(doneIdxs[i], 1);
  }

  // The SEED table above hand-writes each folder's fileCount/size as flavor
  // text (e.g. "47 files / 2.3GB") — numbers that never matched the handful
  // of rows actually seeded underneath. Recompute every folder's real
  // direct-child count/size from what was actually inserted, the same way
  // bumpParentCount keeps it correct for every real upload/delete afterward.
  const folderIds = [...idMap.values()];
  for (const folderId of folderIds) {
    const agg = await trx.selectFrom('cloud_files')
      .select(({ fn }) => [fn.countAll<number>().as('n'), fn.sum<string>('size').as('total_size')])
      .where('parent_id', '=', folderId).where('tenant_id', '=', tenantId).executeTakeFirst();
    await trx.updateTable('cloud_files')
      .set({ file_count: Number(agg?.n ?? 0), size: agg?.total_size != null ? Number(agg.total_size) : 0 })
      .where('id', '=', folderId).where('tenant_id', '=', tenantId).execute();
  }
}

export async function filesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cloud'));

  // GET /share-targets — CUSTOMER-role only. Who this customer could
  // possibly share a file with, kept to the one safe surface this platform
  // actually has for it: their own linked Organization (customers.
  // organization_id, migration 230), if any. Deliberately not an open
  // name/email search — a customer has no business browsing other tenants'
  // customers or organizations to find one to share with.
  fastify.get('/share-targets', async (req, reply) => {
    const user = req.user;
    if (user.role !== 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type' });
    const cid = await resolveCustomerId(user);
    if (!cid) return { organization: null };
    return withTenant(user.tenant_id, async trx => {
      const row = await trx.selectFrom('customers')
        .leftJoin('organizations', 'organizations.id', 'customers.organization_id')
        .select(['organizations.id as org_id', 'organizations.name as org_name'])
        .where('customers.id', '=', cid).where('customers.tenant_id', '=', user.tenant_id).executeTakeFirst();
      return { organization: row?.org_id ? { id: row.org_id, name: row.org_name } : null };
    });
  });

  // GET /customer-folder/:customerId — resolves (creating if it doesn't
  // exist yet) this customer's own "Customers ▸ <name>" Drive folder, so a
  // caller like the Customers profile page can deep-link straight into the
  // real folder — and upload/create things nested inside it — rather than
  // only tagging files flat at the drive root. Runs CloudSync.
  // backfillCustomer (not just ensureCustomerFolder) every call — cheap for
  // one customer, and it also retroactively tags any of their own or their
  // shipments' documents that predate entity-tagging, so simply opening the
  // Documents tab keeps this customer's Drive view in sync with no manual
  // "Resync" click needed.
  fastify.get('/customer-folder/:customerId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { customerId } = req.params as { customerId: string };
    try {
      const customer = await withTenant(user.tenant_id, trx =>
        trx.selectFrom('customers').select(['id', 'name'])
          .where('id', '=', customerId).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
      );
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });

      await CloudSync.backfillCustomer(user.tenant_id, customer.id);

      return await withTenant(user.tenant_id, async (trx) => {
        const folder = await trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('type', '=', 'folder')
          .where('entity_type', '=', 'customer').where('entity_id', '=', customer.id)
          .executeTakeFirst();
        if (!folder) return reply.status(500).send({ error: "Could not resolve this customer's Drive folder" });
        const parent = folder.parent_id
          ? await trx.selectFrom('cloud_files').select(['id', 'name']).where('id', '=', folder.parent_id).executeTakeFirst()
          : null;
        return { id: folder.id, drive_id: folder.drive_id, name: folder.name, parent: parent ?? null };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /employee-folder/:userId — same shape and role as GET
  // /customer-folder/:customerId above, for a staff member's own "Employees
  // ▸ <name>" folder — resolves/creates it and self-heals any untagged
  // document already sitting in it via CloudSync.backfillEmployee.
  fastify.get('/employee-folder/:userId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { userId } = req.params as { userId: string };
    try {
      const employee = await withTenant(user.tenant_id, trx =>
        trx.selectFrom('users').select(['id', 'name'])
          .where('id', '=', userId).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
      );
      if (!employee) return reply.status(404).send({ error: 'Employee not found' });

      await CloudSync.backfillEmployee(user.tenant_id, employee.id);

      return await withTenant(user.tenant_id, async (trx) => {
        const folder = await trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('type', '=', 'folder')
          .where('entity_type', '=', 'employee').where('entity_id', '=', employee.id)
          .executeTakeFirst();
        if (!folder) return reply.status(500).send({ error: "Could not resolve this employee's Drive folder" });
        const parent = folder.parent_id
          ? await trx.selectFrom('cloud_files').select(['id', 'name']).where('id', '=', folder.parent_id).executeTakeFirst()
          : null;
        return { id: folder.id, drive_id: folder.drive_id, name: folder.name, parent: parent ?? null };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /seal-folder/:sealType/:sealId — same shape and role as GET
  // /customer-folder/:customerId and /employee-folder/:userId above, for one
  // SEAL lot/consignment/container's own "Customers ▸ owner ▸ SEAL ▸ label"
  // folder. 404s (rather than resolving nothing) for customs_entry/
  // compartment — those have no customer owner, so there is no folder to
  // resolve, matching CloudSync.backfillSeal's own scoping.
  fastify.get('/seal-folder/:sealType/:sealId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { sealType, sealId } = req.params as { sealType: string; sealId: string };
    if (!['lot', 'consignment', 'container'].includes(sealType)) {
      return reply.status(400).send({ error: 'sealType must be lot, consignment, or container' });
    }
    try {
      await CloudSync.backfillSeal(user.tenant_id, sealType as 'lot' | 'consignment' | 'container', sealId);

      return await withTenant(user.tenant_id, async (trx) => {
        const folder = await trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('type', '=', 'folder')
          .where('entity_type', '=', `seal_${sealType}`).where('entity_id', '=', sealId)
          .executeTakeFirst();
        if (!folder) return reply.status(404).send({ error: 'Could not resolve a Drive folder for this record' });
        const parent = folder.parent_id
          ? await trx.selectFrom('cloud_files').select(['id', 'name']).where('id', '=', folder.parent_id).executeTakeFirst()
          : null;
        return { id: folder.id, drive_id: folder.drive_id, name: folder.name, parent: parent ?? null };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /storage-usage — real per-tenant Cloud quota (packages.
  // storage_limit_bytes, migration 234), hooked into the same tenants.plan
  // → packages tier system the monthly item-count metering already uses.
  // limit_bytes: null means unlimited (enterprise tier, or a legacy plan
  // code with no matching package row).
  fastify.get('/storage-usage', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    try {
      return await getStorageQuota(user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET / — three modes:
  //  - ?entity_type=&entity_id= — every file linked to a business entity
  //    (e.g. a customer profile's Documents tab), across all of the
  //    tenant's drives, newest first. No drive_id needed: a linked file can
  //    live in any drive, the link is what the caller is asking for.
  //  - ?q= — name search across the tenant's non-trashed files (for a
  //    "link an existing Drive file" picker), independent of drive_id.
  //  - ?drive_id= — the original behavior: every file/folder in one drive
  //    (and seeds sample data into a brand-new tenant's only drive).
  fastify.get('/', async (req, reply) => {
    const user = req.user;

    // A CUSTOMER login never sees the tenant's general Drive — only files a
    // staff member (or the customer themself, via upload below) explicitly
    // linked to them. Whatever drive_id/q/entity_type the caller passes is
    // irrelevant here; this decides the query on its own, full stop.
    if (user.role === 'CUSTOMER') {
      const cid = await resolveCustomerId(user);
      try {
        return await withTenant(user.tenant_id, async (trx) => {
          // A customer sees files linked to them directly, plus files linked
          // to any of their own shipments — closing the loop so shipment
          // paperwork (mirrored by CloudSync.syncShipmentDoc) actually shows
          // up in their own Documents view, not just staff's.
          const shipmentIds = cid
            ? (await trx.selectFrom('shipment_cases').select('id')
                .where('tenant_id', '=', user.tenant_id).where('customer_id', '=', cid).execute()).map(s => s.id)
            : [];
          const sealIds = cid ? await sealEntityIds(trx, user.tenant_id, cid) : { lotIds: [], consignmentIds: [], containerIds: [] };
          const rows = await trx.selectFrom('cloud_files').selectAll()
            .where('tenant_id', '=', user.tenant_id)
            .where('is_trash', '=', false)
            .where(eb => eb.or([
              eb.and([eb('entity_type', '=', 'customer'), eb('entity_id', '=', cid ?? NIL_UUID)]),
              ...(shipmentIds.length > 0 ? [eb.and([eb('entity_type', '=', 'shipment'), eb('entity_id', 'in', shipmentIds)])] : []),
              ...sealOrClauses(eb, sealIds),
              // A file explicitly shared with this customer (migration 233)
              // is visible even with no entity link to them at all — a share
              // only ever adds visibility, never removes what entity-linking
              // already grants.
              ...(cid ? [eb('id', 'in', eb.selectFrom('cloud_file_shares').select('file_id')
                .where('principal_type', '=', 'customer').where('principal_id', '=', cid))] : []),
            ]))
            .orderBy('created_at', 'desc').execute();
          return attachShares(trx, rows);
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    const { drive_id, entity_type, entity_id, q } = req.query as
      { drive_id?: string; entity_type?: string; entity_id?: string; q?: string };

    if (entity_type && entity_id) {
      try {
        return await withTenant(user.tenant_id, async (trx) => {
          // 'customer' also fans out to that customer's own shipment-linked
          // documents (same reasoning as the CUSTOMER-role GET / branch
          // above and org.routes.ts GET /documents) and excludes the
          // customer's own Drive folder row itself — every caller of this
          // shape today (the Customers profile page) renders a flat document
          // list, not a folder browser.
          if (entity_type === 'customer') {
            const shipmentIds = (await trx.selectFrom('shipment_cases').select('id')
              .where('tenant_id', '=', user.tenant_id).where('customer_id', '=', entity_id).execute()).map(s => s.id);
            const sealIds = await sealEntityIds(trx, user.tenant_id, entity_id);
            const rows = await trx.selectFrom('cloud_files').selectAll()
              .where('tenant_id', '=', user.tenant_id)
              .where('is_trash', '=', false)
              .where('type', '!=', 'folder')
              .where(eb => eb.or([
                eb.and([eb('entity_type', '=', 'customer'), eb('entity_id', '=', entity_id)]),
                ...(shipmentIds.length > 0 ? [eb.and([eb('entity_type', '=', 'shipment'), eb('entity_id', 'in', shipmentIds)])] : []),
                ...sealOrClauses(eb, sealIds),
              ]))
              .orderBy('created_at', 'desc').execute();
            return attachShares(trx, rows);
          }
          const rows = await trx.selectFrom('cloud_files').selectAll()
            .where('tenant_id', '=', user.tenant_id)
            .where('entity_type', '=', entity_type).where('entity_id', '=', entity_id)
            .where('is_trash', '=', false)
            .orderBy('created_at', 'desc').execute();
          return attachShares(trx, rows);
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    if (q && q.trim()) {
      try {
        return await withTenant(user.tenant_id, async (trx) => {
          const rows = await trx.selectFrom('cloud_files').selectAll()
            .where('tenant_id', '=', user.tenant_id)
            .where('type', '!=', 'folder').where('is_trash', '=', false)
            .where('name', 'ilike', `%${q.trim()}%`)
            .orderBy('created_at', 'desc').limit(30).execute();
          return attachShares(trx, rows);
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    if (!drive_id) return reply.status(400).send({ error: 'drive_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const drive = await trx.selectFrom('cloud_drives').selectAll()
          .where('id', '=', drive_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!drive) return reply.status(404).send({ error: 'Drive not found' });

        let rows = await trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).orderBy('created_at').execute();

        if (rows.length === 0 && drive.type === 'personal') {
          const driveCount = await trx.selectFrom('cloud_drives').select(({ fn }) => fn.countAll().as('n'))
            .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (Number(driveCount?.n ?? 0) === 1) {
            await seedSampleFiles(trx, user.tenant_id, drive_id);
            rows = await trx.selectFrom('cloud_files').selectAll()
              .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).orderBy('created_at').execute();
          }
        }
        return attachShares(trx, rows);
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /folder — create a folder
  fastify.post('/folder', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const body = req.body as { name?: string; parent_id?: string | null; color?: string; drive_id?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'Folder name is required' });
    if (!body.drive_id) return reply.status(400).send({ error: 'drive_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        // A folder created directly inside an already entity-tagged folder
        // (e.g. browsing into Customers ▸ Acme ▸ BL12345 and adding
        // "Photos") inherits that tag — every ancestor already carries the
        // correct one by construction, so a single parent lookup is enough.
        let entityType: string | null = null;
        let entityId: string | null = null;
        if (body.parent_id) {
          const parent = await trx.selectFrom('cloud_files').select(['entity_type', 'entity_id'])
            .where('id', '=', body.parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (parent?.entity_type && parent.entity_id) { entityType = parent.entity_type; entityId = parent.entity_id; }
        }
        const row = await trx.insertInto('cloud_files').values({
          tenant_id: user.tenant_id,
          drive_id: body.drive_id!,
          name: body.name!.trim(),
          type: 'folder',
          size: 0,
          file_count: 0,
          parent_id: body.parent_id ?? null,
          color: body.color ?? '#f59e0b',
          owner_name: user.name ?? 'You',
          owner_id: user.sub,
          entity_type: entityType,
          entity_id: entityId,
        }).returningAll().executeTakeFirstOrThrow();
        if (body.parent_id) await bumpParentCount(trx, body.parent_id, user.tenant_id, 1, 0);
        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /upload — multipart file upload
  fastify.post('/upload', async (req, reply) => {
    const user = req.user;
    const isCustomer = user.role === 'CUSTOMER';
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    // Fields sent after the file part in the multipart stream aren't available on `data.fields`
    // (fastify-multipart quirk — see documents.routes.ts), so prefer the query param.
    const queryParent = (req.query as any)?.parent_id as string | undefined;
    const fieldParent = (data.fields as any).parent_id?.value as string | undefined;
    const raw = queryParent ?? fieldParent;
    // A customer's uploads are always flat (no folder concept in their scoped view).
    const parentId = isCustomer ? null : (raw && raw !== 'null' && raw !== '' ? raw : null);

    let driveId = ((req.query as any)?.drive_id as string | undefined) ?? (data.fields as any).drive_id?.value as string | undefined;

    // Optional business-entity tag (e.g. a customer profile uploading
    // straight into Drive) — same query-param-preferred quirk as parent_id
    // above, since fields after the file part aren't reliably on data.fields.
    const entityType = ((req.query as any)?.entity_type as string | undefined) ?? (data.fields as any).entity_type?.value as string | undefined;
    const entityId = ((req.query as any)?.entity_id as string | undefined) ?? (data.fields as any).entity_id?.value as string | undefined;

    // A CUSTOMER login can never tag a file as anyone but themself, and
    // never picks their own drive_id — both are decided here, not trusted
    // from the request, however the fields above were populated.
    let customerId: string | null = null;
    if (isCustomer) {
      customerId = await resolveCustomerId(user);
      if (!customerId) return reply.status(403).send({ error: 'Account is not linked to a customer' });
    } else if (!driveId) {
      return reply.status(400).send({ error: 'drive_id is required' });
    }

    try {
      const buffer = await data.toBuffer();

      const quota = await wouldExceedStorageQuota(user.tenant_id, buffer.length);
      if (quota.exceeded) {
        return reply.status(402).send({
          error: 'STORAGE_LIMIT_EXCEEDED',
          message: `This upload would exceed your plan's storage limit (${fmtGB(quota.limit_bytes!)}). Upgrade your plan or free up space.`,
          used_bytes: quota.used_bytes, limit_bytes: quota.limit_bytes,
        });
      }

      return await withTenant(user.tenant_id, async (trx) => {
        if (isCustomer) driveId = await ensureDefaultDrive(trx, user.tenant_id);

        // A staff upload straight into an already entity-tagged folder (e.g.
        // browsing into Customers ▸ Acme ▸ BL12345 and clicking Upload)
        // inherits that folder's tag when the caller didn't explicitly pass
        // one — the CUSTOMER branch below is untouched, already forced flat.
        let inheritedEntityType: string | null = null;
        let inheritedEntityId: string | null = null;
        if (!isCustomer && !entityType && parentId) {
          const parent = await trx.selectFrom('cloud_files').select(['entity_type', 'entity_id'])
            .where('id', '=', parentId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (parent?.entity_type && parent.entity_id) { inheritedEntityType = parent.entity_type; inheritedEntityId = parent.entity_id; }
        }

        const row = await trx.insertInto('cloud_files').values({
          tenant_id: user.tenant_id,
          drive_id: driveId!,
          name: data.filename,
          type: extOf(data.filename),
          size: buffer.length,
          parent_id: parentId,
          owner_name: user.name ?? 'You',
          // owner_id references users(id). The legacy customer-OTP login path
          // (POST /auth/customer/verify) signs `sub` as the customers.id, not
          // a users row, so setting it unconditionally violates
          // cloud_files_owner_id_fkey for any customer who logged in that
          // way. owner_name plus the entity_type/entity_id link already
          // identify the uploader for a CUSTOMER login; owner_id is left
          // unset (nullable) rather than assumed to be a real users.id.
          owner_id: isCustomer ? null : user.sub,
          mime_type: data.mimetype,
          entity_type: isCustomer ? 'customer' : (entityType || inheritedEntityType),
          entity_id: isCustomer ? customerId : (entityId || inheritedEntityId),
        }).returningAll().executeTakeFirstOrThrow();

        const { storageKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, row.id, data.filename, buffer);
        const updated = await trx.updateTable('cloud_files')
          .set({ storage_key: storageKey, updated_at: new Date() })
          .where('id', '=', row.id).returningAll().executeTakeFirstOrThrow();

        if (parentId) await bumpParentCount(trx, parentId, user.tenant_id, 1, buffer.length);

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.uploaded', sourceApp: 'cloud', entityType: 'document', entityId: updated.id,
          payload: { name: updated.name, size: buffer.length, type: updated.type },
          actorId: isCustomer ? null : user.sub,
        }).catch(err => console.error('[Cloud] file.uploaded emit failed:', err.message));

        return serialize(updated);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /:id/download — serve the real file bytes, forcing a save-as
  // (Content-Disposition: attachment) regardless of type.
  fastify.get('/:id/download', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const file = await trx.selectFrom('cloud_files').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!file || !file.storage_key) return reply.status(404).send({ error: 'File content not available' });
      if (user.role === 'CUSTOMER') {
        const cid = await resolveCustomerId(user);
        if (!(await canCustomerAccessFile(trx, user.tenant_id, cid, file))) return reply.status(403).send({ error: 'Not found' });
      }
      const buf = MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      const { contentType } = resolveServedContentType(file.type);
      reply.header('Content-Disposition', `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`);
      reply.header('Content-Type', contentType);
      return reply.send(buf);
    });
  });

  // GET /:id/preview — same bytes, same ownership rule as /:id/download,
  // but Content-Disposition: inline so a browser renders an image/PDF/video
  // directly instead of forcing a save-as. This is what actually makes
  // in-app viewing possible — previously the ONLY inline-capable route in
  // this whole file was the unauthenticated public share-link download.
  fastify.get('/:id/preview', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const file = await trx.selectFrom('cloud_files').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!file || !file.storage_key) return reply.status(404).send({ error: 'File content not available' });
      if (user.role === 'CUSTOMER') {
        const cid = await resolveCustomerId(user);
        if (!(await canCustomerAccessFile(trx, user.tenant_id, cid, file))) return reply.status(403).send({ error: 'Not found' });
      }
      const buf = MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      // Never trust the stored mime_type for what the browser is told to
      // execute — it's whatever the uploader's request claimed. Only a fixed
      // image/pdf/video/audio allowlist may render inline; everything else
      // downgrades to a forced download instead of risking inline HTML/SVG.
      const { contentType, inlineAllowed } = resolveServedContentType(file.type);
      reply.header('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${file.name.replace(/["\r\n]/g, '')}"`);
      reply.header('Content-Type', contentType);
      return reply.send(buf);
    });
  });

  // PATCH /:id — rename / recolor / describe / star / link-unlink to an entity.
  // entity_type/entity_id double as the "link an existing Drive file" and
  // "unlink" actions: pass both to link, pass both as null to unlink.
  fastify.patch('/:id', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const update: Record<string, any> = { updated_at: new Date() };
        for (const f of ['name', 'color', 'description', 'starred', 'entity_type', 'entity_id']) {
          if (body[f] !== undefined) update[f] = body[f];
        }
        const row = await trx.updateTable('cloud_files').set(update)
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();

        // This route doubles as rename/recolor/describe/star/link — only the
        // two the UI actually drives (rename, star) get an activity entry,
        // matching the plan's explicit event list.
        if (body.name !== undefined) {
          emitDomainEvent(trx, user.tenant_id, {
            type: 'file.renamed', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
            payload: { name: row.name }, actorId: user.sub,
          }).catch(err => console.error('[Cloud] file.renamed emit failed:', err.message));
        } else if (body.starred !== undefined) {
          emitDomainEvent(trx, user.tenant_id, {
            type: 'file.starred', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
            payload: { name: row.name, starred: row.starred }, actorId: user.sub,
          }).catch(err => console.error('[Cloud] file.starred emit failed:', err.message));
        }

        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/move — { parent_id }
  fastify.post('/:id/move', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const { parent_id } = req.body as { parent_id: string | null };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const item = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Not found' });
        if (item.parent_id === parent_id) return serialize(item);

        // An untagged item dragged into an already entity-tagged folder
        // inherits that tag — same single-level lookup POST /folder and
        // POST /upload already do at creation time. Only ever touches an
        // item with NO tag of its own: one that already carries any tag
        // (auto-inherited earlier, or an explicit PATCH /:id link) is left
        // exactly as it is, so a move can never silently clobber a link
        // someone set on purpose.
        let inheritedEntityType: string | null = null;
        let inheritedEntityId: string | null = null;
        let target: { drive_id: string } | undefined;
        if (parent_id) {
          target = await trx.selectFrom('cloud_files').select(['drive_id', 'entity_type', 'entity_id'])
            .where('id', '=', parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (!target || target.drive_id !== item.drive_id) return reply.status(400).send({ error: 'Cannot move an item into a different drive' });
          if (!item.entity_type && !item.entity_id && (target as any).entity_type && (target as any).entity_id) {
            inheritedEntityType = (target as any).entity_type;
            inheritedEntityId = (target as any).entity_id;
          }
        }

        if (item.parent_id) await bumpParentCount(trx, item.parent_id, user.tenant_id, -1, -(Number(item.size) || 0));
        if (parent_id) await bumpParentCount(trx, parent_id, user.tenant_id, 1, Number(item.size) || 0);

        const row = await trx.updateTable('cloud_files').set({
          parent_id, updated_at: new Date(),
          ...(inheritedEntityType ? { entity_type: inheritedEntityType, entity_id: inheritedEntityId } : {}),
        }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.moved', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
          payload: { name: row.name, to_parent_id: parent_id }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.moved emit failed:', err.message));

        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/trash — soft delete
  fastify.post('/:id/trash', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('cloud_files')
          .set({ is_trash: true, trashed_at: new Date(), updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.trashed', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
          payload: { name: row.name }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.trashed emit failed:', err.message));

        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/restore — bring back out of Trash
  fastify.post('/:id/restore', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('cloud_files')
          .set({ is_trash: false, trashed_at: null, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.restored', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
          payload: { name: row.name }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.restored emit failed:', err.message));

        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /trash/empty — permanently delete everything in a drive's Trash
  fastify.post('/trash/empty', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    if (!isPlatformSuperAdmin(user)) return reply.status(403).send({ error: 'Only the platform SuperAdmin can empty Trash.' });
    const { drive_id } = req.body as { drive_id?: string };
    if (!drive_id) return reply.status(400).send({ error: 'drive_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const trashed = await trx.selectFrom('cloud_files').select(['id', 'storage_key'])
          .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).where('is_trash', '=', true).execute();
        for (const t of trashed) {
          if (t.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, t.storage_key);
        }
        await trx.deleteFrom('cloud_files')
          .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).where('is_trash', '=', true).execute();
        return { deleted: trashed.length };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /:id — permanent delete (only meaningful once already in Trash, but allowed directly too).
  // A CUSTOMER login may only delete a file it owns (removing something it
  // mistakenly uploaded) — never a staff-owned or another customer's file.
  fastify.delete('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const item = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Not found' });
        if (user.role === 'CUSTOMER') {
          const cid = await resolveCustomerId(user);
          if (item.entity_type !== 'customer' || item.entity_id !== cid) return reply.status(403).send({ error: 'Not found' });
        } else if (!isPlatformSuperAdmin(user)) {
          return reply.status(403).send({ error: 'Only the platform SuperAdmin can permanently delete a file. Move it to Trash instead.' });
        }
        if (item.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, item.storage_key);
        if (item.parent_id) await bumpParentCount(trx, item.parent_id, user.tenant_id, -1, -(Number(item.size) || 0));
        await trx.deleteFrom('cloud_files').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

        // entity_id has no FK on domain_events (deliberately, per the
        // polymorphic-tagging convention this platform already uses) so it's
        // safe to keep pointing at the now-deleted row's id here.
        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.permanently_deleted', sourceApp: 'cloud', entityType: 'document', entityId: item.id,
          payload: { name: item.name }, actorId: user.role === 'CUSTOMER' ? null : user.sub,
        }).catch(err => console.error('[Cloud] file.permanently_deleted emit failed:', err.message));

        return { ok: true };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PUT /:id/share — replace the sharing list (name + Viewer/Editor role).
  // Also maintains share_token: set (generating one if absent) whenever the
  // file ends up with at least one share, cleared when the last share is
  // removed — so a real public link only ever resolves while a share
  // genuinely exists, and revoking all shares invalidates it.
  fastify.put('/:id/share', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { shared } = req.body as { shared: { name: string; role: 'Viewer' | 'Editor'; principal_type?: string; principal_id?: string }[] };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').select(['id', 'share_token', 'type', 'entity_type', 'entity_id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });

        // A customer may edit shares on a file they can already reach at
        // Editor level: it's entity-linked to them directly (fundamentally
        // theirs — consistent with already being able to upload/delete
        // there), or an existing share for them is role='Editor'. Same
        // full-replace semantics as staff already have on this route,
        // nothing new invented — just who may call it.
        if (user.role === 'CUSTOMER') {
          const cid = await resolveCustomerId(user);
          const ownsDirectly = file.entity_type === 'customer' && file.entity_id === cid;
          const isEditor = cid && await trx.selectFrom('cloud_file_shares').select('id')
            .where('file_id', '=', id).where('principal_type', '=', 'customer').where('principal_id', '=', cid)
            .where('role', '=', 'Editor').executeTakeFirst();
          if (!ownsDirectly && !isEditor) return reply.status(403).send({ error: 'Not available for customer accounts' });
        }

        await trx.deleteFrom('cloud_file_shares').where('file_id', '=', id).execute();
        if (shared?.length) {
          await trx.insertInto('cloud_file_shares').values(
            shared.map(s => ({
              file_id: id, person_name: s.name, role: s.role,
              principal_type: s.principal_type ?? null, principal_id: s.principal_id ?? null,
            }))
          ).execute();
        }
        const shareToken = shared?.length
          ? (file.share_token ?? crypto.randomUUID())
          : null;
        await trx.updateTable('cloud_files').set({ updated_at: new Date(), share_token: shareToken }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.shared', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { shared: (shared ?? []).map(s => ({ name: s.name, role: s.role })) },
          actorId: user.role === 'CUSTOMER' ? null : user.sub,
        }).catch(err => console.error('[Cloud] file.shared emit failed:', err.message));

        return { shared: shared ?? [], share_token: shareToken };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Comments — a flat, timestamped note log per file, same table shape and
  // author-or-admin edit/delete rule as shipments.routes.ts's shipment_notes
  // (the codebase's own precedent for exactly this). Who may POST/PATCH/
  // DELETE deliberately does NOT copy that route's role allowlist though —
  // that list predates MANAGER/FINANCE/SALES as first-class roles and was
  // scoped to clearing-ops-specific notes. Cloud is cross-app (Finance,
  // NexusHR, ComplyOS and SEAL documents all sync in here), so this matches
  // every other write route in *this* file instead: block CUSTOMER, allow
  // every other role. A CUSTOMER login never reaches the Cloud browser/
  // PreviewPanel this feeds anyway (see the CUSTOMER branch of GET / above)
  // — the check below is defense in depth, not the only thing stopping it. ──

  fastify.get('/:id/comments', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const comments = await trx.selectFrom('cloud_file_comments').selectAll()
        .where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'asc').execute();
      return { data: comments };
    });
  });

  fastify.post('/:id/comments', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const { content } = req.body as { content?: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').select('id')
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });

        const comment = await trx.insertInto('cloud_file_comments').values({
          tenant_id: user.tenant_id,
          file_id: id,
          author_id: user.sub,
          author_name: user.name || user.email,
          content: content.trim(),
        }).returningAll().executeTakeFirstOrThrow();

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.commented', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { comment_id: comment.id }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.commented emit failed:', err.message));

        return comment;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id/comments/:commentId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { commentId } = req.params as { id: string; commentId: string };
    const { content } = req.body as { content?: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cloud_file_comments').select(['id', 'author_id'])
        .where('id', '=', commentId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Comment not found' });
      const canEdit = existing.author_id === user.sub || ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canEdit) return reply.status(403).send({ error: 'Forbidden' });
      const updated = await trx.updateTable('cloud_file_comments')
        .set({ content: content.trim(), updated_at: new Date() })
        .where('id', '=', commentId).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      return updated;
    });
  });

  fastify.delete('/:id/comments/:commentId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { commentId } = req.params as { id: string; commentId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('cloud_file_comments').select(['id', 'author_id'])
        .where('id', '=', commentId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Comment not found' });
      const canDelete = existing.author_id === user.sub || ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canDelete) return reply.status(403).send({ error: 'Forbidden' });
      await trx.deleteFrom('cloud_file_comments').where('id', '=', commentId).where('tenant_id', '=', user.tenant_id).execute();
      return reply.status(204).send();
    });
  });

  // ── Version history — explicit only, never automatic on a same-name
  // re-upload (POST /upload always inserts a new sibling row on a name
  // collision today; changing that here would silently alter existing
  // upload behavior for every caller of that route). storage_key is a flat
  // "tenants/{t}/cloud/{fileId}/{filename}" path (MinioIntegration.
  // uploadCloudFile) with nothing unique per upload, so simply re-uploading
  // under the same fileId would physically overwrite the very bytes a
  // version row was about to preserve — every write below archives the
  // about-to-be-replaced content to its own "versions/{archiveId}"
  // subfolder BEFORE touching the live path, so a version's storage_key
  // always stays valid even after the file moves on. Content only: a
  // version swaps storage_key/size/mime_type, never cloud_files.name — the
  // display name is a property of the file, not of one version of it. ──

  fastify.post('/:id/versions', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    try {
      const buffer = await data.toBuffer();
      const quota = await wouldExceedStorageQuota(user.tenant_id, buffer.length);
      if (quota.exceeded) {
        return reply.status(402).send({
          error: 'STORAGE_LIMIT_EXCEEDED',
          message: `This upload would exceed your plan's storage limit (${fmtGB(quota.limit_bytes!)}). Upgrade your plan or free up space.`,
          used_bytes: quota.used_bytes, limit_bytes: quota.limit_bytes,
        });
      }

      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });
        if (file.type === 'folder') return reply.status(400).send({ error: 'Folders have no version history' });

        if (file.storage_key) {
          const oldBytes = MinioIntegration.readFile(file.storage_key);
          if (oldBytes) {
            const archiveId = crypto.randomUUID();
            const { storageKey: archivedKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, `${id}/versions/${archiveId}`, file.name, oldBytes);
            await trx.insertInto('cloud_file_versions').values({
              tenant_id: user.tenant_id, file_id: id,
              storage_key: archivedKey, size: file.size, mime_type: file.mime_type,
              uploaded_by_id: file.owner_id, uploaded_by_name: file.owner_name,
              created_at: file.updated_at,
            }).execute();
          }
          await MinioIntegration.deleteDocument(user.tenant_id, file.storage_key);
        }

        const { storageKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, id, file.name, buffer);
        const sizeDelta = buffer.length - (Number(file.size) || 0);
        const updated = await trx.updateTable('cloud_files').set({
          storage_key: storageKey, size: buffer.length, mime_type: data.mimetype, updated_at: new Date(),
        }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

        if (file.parent_id) await bumpParentCount(trx, file.parent_id, user.tenant_id, 0, sizeDelta);

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.version_uploaded', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { name: updated.name, size: buffer.length }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.version_uploaded emit failed:', err.message));

        return serialize(updated);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/:id/versions', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const file = await trx.selectFrom('cloud_files').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!file) return reply.status(404).send({ error: 'Not found' });
      const rows = await trx.selectFrom('cloud_file_versions').selectAll()
        .where('file_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute();
      return { data: rows.map(r => ({ ...r, size: r.size != null ? Number(r.size) : null })) };
    });
  });

  fastify.get('/:id/versions/:versionId/download', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id, versionId } = req.params as { id: string; versionId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const version = await trx.selectFrom('cloud_file_versions').selectAll()
        .where('id', '=', versionId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!version) return reply.status(404).send({ error: 'Version not found' });
      const buf = MinioIntegration.readFile(version.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      const file = await trx.selectFrom('cloud_files').select(['name', 'type']).where('id', '=', id).executeTakeFirst();
      const { contentType } = resolveServedContentType(file?.type ?? '');
      reply.header('Content-Disposition', `attachment; filename="${(file?.name ?? 'file').replace(/["\r\n]/g, '')}"`);
      reply.header('Content-Type', contentType);
      return reply.send(buf);
    });
  });

  fastify.post('/:id/versions/:versionId/restore', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id, versionId } = req.params as { id: string; versionId: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });
        const version = await trx.selectFrom('cloud_file_versions').selectAll()
          .where('id', '=', versionId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!version) return reply.status(404).send({ error: 'Version not found' });

        // The about-to-be-replaced current content is archived too — restoring
        // is non-destructive, and never costs you the version you restored from.
        if (file.storage_key) {
          const currentBytes = MinioIntegration.readFile(file.storage_key);
          if (currentBytes) {
            const archiveId = crypto.randomUUID();
            const { storageKey: archivedKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, `${id}/versions/${archiveId}`, file.name, currentBytes);
            await trx.insertInto('cloud_file_versions').values({
              tenant_id: user.tenant_id, file_id: id,
              storage_key: archivedKey, size: file.size, mime_type: file.mime_type,
              uploaded_by_id: file.owner_id, uploaded_by_name: file.owner_name,
              created_at: file.updated_at,
            }).execute();
          }
        }

        // Copy the target version's bytes onto the canonical live path
        // (cloud_files.name is unchanged by a restore, only its content is).
        const versionBytes = MinioIntegration.readFile(version.storage_key);
        if (!versionBytes) return reply.status(404).send({ error: 'This version\'s content is no longer available' });
        const { storageKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, id, file.name, versionBytes);

        const sizeDelta = (Number(version.size) || 0) - (Number(file.size) || 0);
        const updated = await trx.updateTable('cloud_files').set({
          storage_key: storageKey, size: version.size, mime_type: version.mime_type, updated_at: new Date(),
        }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

        if (file.parent_id) await bumpParentCount(trx, file.parent_id, user.tenant_id, 0, sizeDelta);

        emitDomainEvent(trx, user.tenant_id, {
          type: 'file.version_restored', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { name: updated.name, restored_version_id: versionId }, actorId: user.sub,
        }).catch(err => console.error('[Cloud] file.version_restored emit failed:', err.message));

        return serialize(updated);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // (filesPublicRoutes, registered separately with no auth hook, serves the
  // actual "Copy link" download below.)

  // ── Connected Apps: Box / Dropbox / Mega (framework only — connect/disconnect
  // and "sync now" are real, persisted, per-tenant state; the actual file
  // transfer against each provider's API is mocked until real OAuth credentials
  // are wired up for that provider). ──

  // GET /connections — one row per provider, auto-created on first read
  fastify.get('/connections', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        for (const provider of STORAGE_PROVIDERS) {
          const existing = await trx.selectFrom('cloud_storage_connections').select(['id'])
            .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirst();
          if (!existing) {
            await trx.insertInto('cloud_storage_connections').values({
              tenant_id: user.tenant_id, provider, status: 'disconnected',
            }).execute();
          }
        }
        const rows = await trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).execute();
        const extFiles = await trx.selectFrom('cloud_external_files').select(['provider', 'type', 'size'])
          .where('tenant_id', '=', user.tenant_id).execute();

        return STORAGE_PROVIDERS.map(p => {
          const row = rows.find(r => r.provider === p)!;
          const providerFiles = extFiles.filter(f => f.provider === p && f.type !== 'folder');
          return {
            ...row,
            file_count: providerFiles.length,
            total_size: providerFiles.reduce((sum, f) => sum + Number(f.size ?? 0), 0),
          };
        });
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /connections/:provider/connect — mock OAuth: records the label the user typed in
  fastify.post('/connections/:provider/connect', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!STORAGE_PROVIDERS.includes(provider as StorageProvider)) return reply.status(400).send({ error: 'Unknown provider' });
    const { account_label } = req.body as { account_label?: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const now = new Date();
        await trx.insertInto('cloud_storage_connections').values({
          tenant_id: user.tenant_id, provider, status: 'connected',
          account_label: account_label?.trim() || null, connected_at: now, last_synced_at: now,
        }).onConflict(oc => oc.columns(['tenant_id', 'provider']).doUpdateSet({
          status: 'connected', account_label: account_label?.trim() || null,
          connected_at: now, last_synced_at: now, updated_at: now,
        })).execute();
        await seedExternalFilesIfEmpty(trx, user.tenant_id, provider as StorageProvider);
        return trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirstOrThrow();
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /connections/:provider/files — the (mocked) synced folders/files for this provider
  fastify.get('/connections/:provider/files', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!STORAGE_PROVIDERS.includes(provider as StorageProvider)) return reply.status(400).send({ error: 'Unknown provider' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const conn = await trx.selectFrom('cloud_storage_connections').select(['status'])
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirst();
        if (!conn || conn.status !== 'connected') return reply.status(400).send({ error: 'Not connected' });
        const rows = await trx.selectFrom('cloud_external_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).orderBy('created_at').execute();
        return rows.map(r => ({ ...r, size: r.size != null ? Number(r.size) : null }));
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /connections/:provider/disconnect
  fastify.post('/connections/:provider/disconnect', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!STORAGE_PROVIDERS.includes(provider as StorageProvider)) return reply.status(400).send({ error: 'Unknown provider' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        await trx.updateTable('cloud_storage_connections').set({
          status: 'disconnected', account_label: null, connected_at: null, last_synced_at: null, updated_at: new Date(),
        }).where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).execute();
        return trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirstOrThrow();
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /connections/:provider/sync — mock sync: just stamps last_synced_at
  fastify.post('/connections/:provider/sync', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!STORAGE_PROVIDERS.includes(provider as StorageProvider)) return reply.status(400).send({ error: 'Unknown provider' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const conn = await trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirst();
        if (!conn || conn.status !== 'connected') return reply.status(400).send({ error: 'Not connected' });
        const row = await trx.updateTable('cloud_storage_connections')
          .set({ last_synced_at: new Date(), updated_at: new Date() })
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider)
          .returningAll().executeTakeFirstOrThrow();
        return row;
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}

/**
 * Public (unauthenticated) file-sharing surface — deliberately a separate
 * plugin with no fastify.authenticate/requireEntitlement hooks, since the
 * whole point of a share link is that someone without a Hudumika account
 * can open it. share_token is the only credential; it's a random UUID with
 * its own unique index, and is set (see PUT /:id/share above) only while
 * the file genuinely has at least one active share, so this can never
 * expose a file no one chose to share, and revoking the last share clears
 * the token, invalidating any link a user already copied.
 *
 * This intentionally queries `db` directly rather than `withTenant` — the
 * caller has no tenant context at all (no JWT), so the token itself, not a
 * tenant_id, is what scopes the lookup to exactly one row.
 */
export async function filesPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/:token/download', async (req, reply) => {
    const { token } = req.params as { token: string };
    // Public, unauthenticated — same reasoning as landed-cost-share/tracker's
    // public share-token routes: no tenant is knowable, access control is the
    // unguessable token alone.
    const file = await dbPlatform.selectFrom('cloud_files').selectAll()
      .where('share_token', '=', token).where('is_trash', '=', false).executeTakeFirst();
    if (!file) return reply.status(404).send({ error: 'This link is invalid or has been revoked.' });
    if (file.type === 'folder') return reply.status(400).send({ error: "Folders can't be shared via a public link yet." });
    if (!file.storage_key) return reply.status(404).send({ error: 'File content not available' });
    const buf = MinioIntegration.readFile(file.storage_key);
    if (!buf) return reply.status(404).send({ error: 'File content not found' });
    // Highest-stakes spot for this check: unauthenticated, so anyone who
    // opens a shared link is exposed — never the stored (client-claimed)
    // mime_type here, same reasoning as GET /:id/preview above.
    const { contentType, inlineAllowed } = resolveServedContentType(file.type);
    reply.header('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${file.name.replace(/["\r\n]/g, '')}"`);
    reply.header('Content-Type', contentType);
    return reply.send(buf);
  });
}
