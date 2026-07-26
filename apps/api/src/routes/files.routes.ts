import crypto from 'crypto';
import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant, db } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || 'txt';
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
function serialize(row: any, shared: { name: string; role: string }[] = []) {
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
  const byFile: Record<string, { name: string; role: string }[]> = {};
  for (const s of shares) (byFile[s.file_id] ??= []).push({ name: s.person_name, role: s.role });
  return files.map(f => serialize(f, byFile[f.id] ?? []));
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
      .where('parent_id', '=', folderId).executeTakeFirst();
    await trx.updateTable('cloud_files')
      .set({ file_count: Number(agg?.n ?? 0), size: agg?.total_size != null ? Number(agg.total_size) : 0 })
      .where('id', '=', folderId).execute();
  }
}

export async function filesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('cloud'));

  // GET / — list every file/folder for a drive (seeds sample data into a brand-new tenant's only drive)
  fastify.get('/', async (req, reply) => {
    const user = req.user;
    const { drive_id } = req.query as { drive_id?: string };
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
    const body = req.body as { name?: string; parent_id?: string | null; color?: string; drive_id?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'Folder name is required' });
    if (!body.drive_id) return reply.status(400).send({ error: 'drive_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
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
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    // Fields sent after the file part in the multipart stream aren't available on `data.fields`
    // (fastify-multipart quirk — see documents.routes.ts), so prefer the query param.
    const queryParent = (req.query as any)?.parent_id as string | undefined;
    const fieldParent = (data.fields as any).parent_id?.value as string | undefined;
    const raw = queryParent ?? fieldParent;
    const parentId = raw && raw !== 'null' && raw !== '' ? raw : null;

    const driveId = ((req.query as any)?.drive_id as string | undefined) ?? (data.fields as any).drive_id?.value as string | undefined;
    if (!driveId) return reply.status(400).send({ error: 'drive_id is required' });

    try {
      const buffer = await data.toBuffer();
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.insertInto('cloud_files').values({
          tenant_id: user.tenant_id,
          drive_id: driveId,
          name: data.filename,
          type: extOf(data.filename),
          size: buffer.length,
          parent_id: parentId,
          owner_name: user.name ?? 'You',
          owner_id: user.sub,
          mime_type: data.mimetype,
        }).returningAll().executeTakeFirstOrThrow();

        const { storageKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, row.id, data.filename, buffer);
        const updated = await trx.updateTable('cloud_files')
          .set({ storage_key: storageKey, updated_at: new Date() })
          .where('id', '=', row.id).returningAll().executeTakeFirstOrThrow();

        if (parentId) await bumpParentCount(trx, parentId, user.tenant_id, 1, buffer.length);
        return serialize(updated);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /:id/download — serve the real file bytes
  fastify.get('/:id/download', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const file = await trx.selectFrom('cloud_files').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!file || !file.storage_key) return reply.status(404).send({ error: 'File content not available' });
      const buf = MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      reply.header('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
      reply.header('Content-Type', file.mime_type || 'application/octet-stream');
      return reply.send(buf);
    });
  });

  // PATCH /:id — rename / recolor / describe / star
  fastify.patch('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const update: Record<string, any> = { updated_at: new Date() };
        for (const f of ['name', 'color', 'description', 'starred']) {
          if (body[f] !== undefined) update[f] = body[f];
        }
        const row = await trx.updateTable('cloud_files').set(update)
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/move — { parent_id }
  fastify.post('/:id/move', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { parent_id } = req.body as { parent_id: string | null };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const item = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Not found' });
        if (item.parent_id === parent_id) return serialize(item);

        if (parent_id) {
          const target = await trx.selectFrom('cloud_files').select(['drive_id'])
            .where('id', '=', parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (!target || target.drive_id !== item.drive_id) return reply.status(400).send({ error: 'Cannot move an item into a different drive' });
        }

        if (item.parent_id) await bumpParentCount(trx, item.parent_id, user.tenant_id, -1, -(Number(item.size) || 0));
        if (parent_id) await bumpParentCount(trx, parent_id, user.tenant_id, 1, Number(item.size) || 0);

        const row = await trx.updateTable('cloud_files').set({ parent_id, updated_at: new Date() })
          .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/trash — soft delete
  fastify.post('/:id/trash', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('cloud_files')
          .set({ is_trash: true, trashed_at: new Date(), updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/restore — bring back out of Trash
  fastify.post('/:id/restore', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const row = await trx.updateTable('cloud_files')
          .set({ is_trash: false, trashed_at: null, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return serialize(row);
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /trash/empty — permanently delete everything in a drive's Trash
  fastify.post('/trash/empty', async (req, reply) => {
    const user = req.user;
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

  // DELETE /:id — permanent delete (only meaningful once already in Trash, but allowed directly too)
  fastify.delete('/:id', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const item = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!item) return reply.status(404).send({ error: 'Not found' });
        if (item.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, item.storage_key);
        if (item.parent_id) await bumpParentCount(trx, item.parent_id, user.tenant_id, -1, -(Number(item.size) || 0));
        await trx.deleteFrom('cloud_files').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
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
    const { shared } = req.body as { shared: { name: string; role: 'Viewer' | 'Editor' }[] };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').select(['id', 'share_token', 'type'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });

        await trx.deleteFrom('cloud_file_shares').where('file_id', '=', id).execute();
        if (shared?.length) {
          await trx.insertInto('cloud_file_shares').values(
            shared.map(s => ({ file_id: id, person_name: s.name, role: s.role }))
          ).execute();
        }
        const shareToken = shared?.length
          ? (file.share_token ?? crypto.randomUUID())
          : null;
        await trx.updateTable('cloud_files').set({ updated_at: new Date(), share_token: shareToken }).where('id', '=', id).execute();
        return { shared: shared ?? [], share_token: shareToken };
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
    const file = await db.selectFrom('cloud_files').selectAll()
      .where('share_token', '=', token).where('is_trash', '=', false).executeTakeFirst();
    if (!file) return reply.status(404).send({ error: 'This link is invalid or has been revoked.' });
    if (file.type === 'folder') return reply.status(400).send({ error: "Folders can't be shared via a public link yet." });
    if (!file.storage_key) return reply.status(404).send({ error: 'File content not available' });
    const buf = MinioIntegration.readFile(file.storage_key);
    if (!buf) return reply.status(404).send({ error: 'File content not found' });
    reply.header('Content-Disposition', `inline; filename="${file.name.replace(/"/g, '')}"`);
    reply.header('Content-Type', file.mime_type || 'application/octet-stream');
    return reply.send(buf);
  });
}
