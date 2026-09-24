import crypto from 'crypto';
import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { objectStore, verifyDiskSignedUrl } from '../integrations/object-storage.js';
import { scanBuffer, scanChunks } from '../integrations/antivirus.js';
import { extractText } from '../lib/file-text-extract.js';
import { canConvert, convertToPdf, officeConfigured, OfficeConvertUnavailable, previewCacheKey } from '../integrations/office-convert.js';
import { decryptSecret, encryptSecret } from '../services/onsite-secrets.service.js';
import { env } from '../config/env.js';
import {
  buildOneDriveAuthUrl, exchangeOneDriveCode, refreshOneDriveToken,
  getOneDriveAccountEmail, listOneDriveFiles,
} from '../integrations/onedrive-files.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';
import { isPlatformSuperAdmin } from '../middleware/rbac.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { getStorageQuota, wouldExceedStorageQuota, quotaBlockedMessage } from '../lib/storage-quota.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { resolveServedContentType } from '../lib/safe-file-serving.js';
import { bumpCloudFolderCount } from '../lib/cloud-folder-count.js';
import { resolveDriveAccess } from '../lib/cloud-drive-access.js';
import { deletionLock, deletionLockMessage } from '../lib/cloud-retention.js';
import { gateStaffFile, canShareFile } from '../lib/cloud-file-access.js';
import { scanStatusFor, servingBlock } from '../lib/cloud-scan-policy.js';
import { MailService } from '../services/mail.service.js';

/** Records one read of a file's bytes (download / preview / version /
 *  public-link) into cloud_file_access_log — the domain-event stream only
 *  ever recorded writes. Best-effort: a logging failure never blocks the
 *  actual download. */
/** Absolute URL of the anonymous download link for a share token (built server-side so it is portable). */
function publicLinkUrl(token: string | null): string | null {
  return token ? `${env.API_BASE_URL.replace(/\/$/, '')}/v1/files-public/${token}/download` : null;
}

async function logFileAccess(
  trx: Transaction<Database>,
  args: {
    tenantId: string; fileId: string; versionId?: string | null;
    userId: string | null; actorName: string;
    action: 'download' | 'preview' | 'version_download' | 'link_download' | 'signed_url';
    via?: 'app' | 'public_link'; req: FastifyRequest;
  },
): Promise<void> {
  try {
    await trx.insertInto('cloud_file_access_log').values({
      tenant_id: args.tenantId,
      file_id: args.fileId,
      version_id: args.versionId ?? null,
      user_id: args.userId,
      actor_name: args.actorName,
      action: args.action,
      via: args.via ?? 'app',
      ip: (args.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || args.req.ip || null,
      user_agent: (args.req.headers['user-agent'] as string || '').slice(0, 500) || null,
    }).execute();
  } catch (err: any) {
    console.error('[Cloud] access-log write failed:', err.message);
  }
}

const OFFICE_PREVIEW_EXTS = new Set(['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp']);

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
 *  the tenant's Business Records drive (migration 498 retyped the original
 *  tenant-wide drive to 'business' — this used to grab "whichever drive was
 *  created first," which after personal-drive isolation landed would have
 *  been unpredictable and could even land a customer's upload in a staff
 *  member's private drive). Auto-creates one if a tenant somehow has none. */
async function ensureDefaultDrive(trx: Transaction<Database>, tenantId: string): Promise<string> {
  const existing = await trx.selectFrom('cloud_drives').select('id')
    .where('tenant_id', '=', tenantId).where('type', '=', 'business').orderBy('created_at').executeTakeFirst();
  if (existing) return existing.id;
  const created = await trx.insertInto('cloud_drives').values({
    tenant_id: tenantId, name: 'Business Records', type: 'business', owner_name: 'System',
  }).returningAll().executeTakeFirstOrThrow();
  return created.id;
}

const STORAGE_PROVIDERS = ['box', 'dropbox', 'mega', 'onedrive'] as const;
type StorageProvider = typeof STORAGE_PROVIDERS[number];

// There is no real Box/Dropbox/Mega/OneDrive integration anywhere in this
// codebase — POST /connections/:provider/connect below is a genuinely mocked
// OAuth handshake (it just records whatever label the user typed), which is
// an honest, clearly-scoped placeholder on its own. What used to sit here
// was not: seedExternalFilesIfEmpty invented an entire fake synced file
// tree — "Backup_2025-01.zip" at 820MB, a "Company_Overview.pdf", etc. — the
// moment anyone connected a provider, regardless of what (if anything) is
// actually in their real account. A tenant "connecting" their real Dropbox
// would see files that were never there. GET /connections/:provider/files
// now returns whatever is genuinely in cloud_external_files — nothing,
// until a real sync exists — and the frontend's existing "Nothing synced
// here yet" empty state (ProviderFilesPanel.tsx) already handles that
// honestly.

/** Rows come back from pg with BIGINT columns as strings — normalize for the frontend. */
function serialize(row: any, shared: { name: string; role: string; principal_type?: string | null; principal_id?: string | null }[] = []) {
  // search_text / search_tsv are server-side search internals — never shipped to the client.
  const { search_text, search_tsv, ...rest } = row;
  return {
    ...rest,
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
export async function canCustomerAccessFile(
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

const bumpParentCount = bumpCloudFolderCount;

// A brand-new tenant's Drive used to be seeded here with an entire fake
// document tree on first load — 8 category folders each hand-annotated with
// a fabricated file count ("47 files / 2.3GB"), 17 demo files with invented
// business names (BL_Summit_Traders_2025-001.pdf, INV-2025-001...), and
// several of those "shared" with fictional colleagues (Amina Hassan, John
// Mwangi, ...) who don't exist as real users in this or any tenant. Same
// reasoning as the Notes app's own seed removal this session: a new tenant
// starts with a genuinely empty Drive, exactly like it starts with zero
// customers, zero shipments, zero of anything else real. FileBrowser.tsx's
// UploadDropzone and CloudHome's conditional sections already handle an
// empty drive correctly — there was never a rendering reason for this to
// exist, only a "the demo looks nicer non-empty" one. The real, structural
// folders (Customers ▸ <name>, Employees ▸ <name>, ...) are created for real
// as real customers/shipments/employees are added — see cloud-sync.service.ts.

export async function filesRoutes(fastify: FastifyInstance) {
  // Chunk uploads send the raw bytes as the request body. Scoped to this plugin; a chunk is at most
  // CHUNK_BYTES (5 MB), so the limit is a little above that.
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 6 * 1024 * 1024 }, (_req, body, done) => done(null, body));
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

  // GET /share-people?q= — who a STAFF member can share a file with: active workspace members and
  // customers of this workspace. This is the only source the Share dialog offers, so a share can
  // only ever name a real principal (PUT /:id/share re-validates it server-side regardless).
  fastify.get('/share-people', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const q = String((req.query as any)?.q ?? '').trim().slice(0, 100);
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    return withTenant(user.tenant_id, async (trx) => {
      let users = trx.selectFrom('users').select(['id', 'name', 'email']).where('tenant_id', '=', user.tenant_id).where('active', '=', true).where('id', '!=', user.sub);
      let customers = trx.selectFrom('customers').select(['id', 'name']).where('tenant_id', '=', user.tenant_id);
      if (q) {
        users = users.where(eb => eb.or([eb('name', 'ilike', like), eb('email', 'ilike', like)]));
        customers = customers.where('name', 'ilike', like);
      }
      const [u, c] = await Promise.all([users.orderBy('name').limit(15).execute(), customers.orderBy('name').limit(10).execute()]);
      return { users: u, customers: c };
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

    const { drive_id, entity_type, entity_id, q, type: typeFilter, owner: ownerFilter } = req.query as
      { drive_id?: string; entity_type?: string; entity_id?: string; q?: string; type?: string; owner?: string };

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

    if ((q && q.trim()) || typeFilter || ownerFilter) {
      try {
        return await withTenant(user.tenant_id, async (trx) => {
          const term = (q ?? '').trim();

          // A tenant-wide search used to reach every file in every drive,
          // including other staff members' private personal drives — the
          // same isolation gap as the explicit drive_id branch above, just
          // reachable through Search instead of Browse. Scope to the same
          // set of drives GET /v1/drives itself would return for this user.
          const memberDriveIds = (await trx.selectFrom('cloud_drive_members').select('drive_id')
            .where('tenant_id', '=', user.tenant_id).where('principal_type', '=', 'user').where('principal_id', '=', user.sub).execute())
            .map(m => m.drive_id);
          const visibleDrives = await trx.selectFrom('cloud_drives').select('id')
            .where('tenant_id', '=', user.tenant_id)
            .where(eb => eb.or([
              eb.and([eb('type', '=', 'personal'), eb('owner_id', '=', user.sub)]),
              eb('type', '=', 'business'),
              eb.and([eb('type', '=', 'shared'), eb('owner_id', '=', user.sub)]),
              ...(memberDriveIds.length > 0 ? [eb.and([eb('type', '=', 'shared'), eb('id', 'in', memberDriveIds)])] : []),
            ]))
            .execute();
          const visibleDriveIds = visibleDrives.map(d => d.id);
          if (visibleDriveIds.length === 0) return [];

          let query = trx.selectFrom('cloud_files').selectAll()
            .where('tenant_id', '=', user.tenant_id)
            .where('drive_id', 'in', visibleDriveIds)
            .where('type', '!=', 'folder').where('is_trash', '=', false);

          if (term) {
            // Full-text over name + description + extracted content (migration
            // 455's search_tsv), OR a trigram/substring hit on the name so a
            // partial word or a short query ("inv", "q3") still matches.
            query = query.where(eb => eb.or([
              sql<boolean>`search_tsv @@ websearch_to_tsquery('simple', ${term})` as any,
              eb('name', 'ilike', `%${term}%`),
            ]));
          }
          if (typeFilter) {
            // "images" | "pdf" | "docs" | "sheets" | "video" | "audio" | a bare extension
            const groups: Record<string, string[]> = {
              images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp'],
              pdf: ['pdf'],
              docs: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'],
              sheets: ['xls', 'xlsx', 'ods', 'csv', 'numbers'],
              slides: ['ppt', 'pptx', 'odp', 'key'],
              video: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
              audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'],
              archives: ['zip', 'rar', '7z', 'tar', 'gz'],
            };
            const exts = groups[typeFilter.toLowerCase()] ?? [typeFilter.toLowerCase()];
            query = query.where('type', 'in', exts);
          }
          if (ownerFilter) query = query.where('owner_id', '=', ownerFilter);

          const rows = await query
            .orderBy(term ? sql`ts_rank(search_tsv, websearch_to_tsquery('simple', ${term})) desc` : sql`created_at desc`)
            .limit(term ? 60 : 200).execute();
          return attachShares(trx, rows);
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    if (!drive_id) return reply.status(400).send({ error: 'drive_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, drive_id);
        if (!access) return reply.status(404).send({ error: 'Drive not found' });

        const rows = await trx.selectFrom('cloud_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).orderBy('created_at').execute();
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
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, body.drive_id!);
        if (!access?.canWrite) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot create folders in this drive' : 'Drive not found' });

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
  // The shared tail of every upload path (single request, and the chunked/resumable flow below):
  // quota → malware scan → text extraction → access check → row → object store → links → event.
  // Reading a whole chunked upload back into one Buffer just to hash/scan/store it would throw away
  // the point of chunking it in the first place — so the source is either a Buffer already in hand
  // (the ordinary single-request /upload path) or a re-readable async source over already-staged
  // chunks (the resumable-upload /complete path), and everything below (quota, scan, storage write)
  // branches on which one it got rather than forcing the chunked path through a single buffer.
  type UploadSource =
    | { kind: 'buffer'; buffer: Buffer; size: number }
    | { kind: 'chunks'; size: number; openStream: () => AsyncIterable<Buffer> };

  async function* iterChunks(fetchChunk: (i: number) => Promise<Buffer | null>, total: number): AsyncIterable<Buffer> {
    for (let i = 0; i < total; i++) {
      const chunk = await fetchChunk(i);
      if (!chunk) throw new Error(`Chunk ${i} is missing from storage`);
      yield chunk;
    }
  }

  interface IngestParams {
    source: UploadSource; filename: string; mimetype: string; parentId: string | null; driveId: string | undefined;
    entityType: string | undefined; entityId: string | undefined; isCustomer: boolean; customerId: string | null;
  }
  async function ingestUpload(req: any, reply: any, p: IngestParams): Promise<any> {
    const user = req.user;
    const { source, parentId, isCustomer, customerId, entityType, entityId } = p;
    let driveId = p.driveId;
    const quota = await wouldExceedStorageQuota(user.tenant_id, source.size);
    if (quota.exceeded) {
      return reply.status(402).send({
        error: 'STORAGE_LIMIT_EXCEEDED',
        message: quotaBlockedMessage(quota),
        used_bytes: quota.used_bytes, limit_bytes: quota.limit_bytes,
      });
    }

    // Malware scan before a single byte is persisted (no-op unless CLAMAV_HOST is configured — see
    // integrations/antivirus.ts). scanChunks streams whichever source we have — a single-item
    // iterable for the buffer path, the already-staged chunks for the resumable path — through one
    // clamd session without ever assembling a full in-memory copy for scanning.
    const scan = await scanChunks(source.kind === 'buffer' ? [source.buffer] : source.openStream());
    if (!scan.clean) {
      return reply.status(422).send({
        error: 'MALWARE_DETECTED',
        message: `This file was rejected by the malware scanner${scan.signature ? ` (${scan.signature})` : ''}.`,
        signature: scan.signature ?? null,
      });
    }

    // Extracted text for full-text search — text families + PDF; null otherwise. Only for the
    // buffer path: a chunked upload is, by construction, large (the size threshold that puts it on
    // the chunked path in the first place), and reading it all back just to index it would undo the
    // memory saving this path exists for. Such a file is still findable by name, just not by content.
    const searchText = source.kind === 'buffer' ? await extractText(source.buffer, extOf(p.filename), p.mimetype).catch(() => null) : null;

    return await withTenant(user.tenant_id, async (trx) => {
      if (isCustomer) {
        driveId = await ensureDefaultDrive(trx, user.tenant_id);
      } else {
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, driveId!);
        if (!access?.canWrite) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot upload to this drive' : 'Drive not found' });
      }

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
        name: p.filename,
        type: extOf(p.filename),
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
        mime_type: p.mimetype,
        entity_type: isCustomer ? 'customer' : (entityType || inheritedEntityType),
        entity_id: isCustomer ? customerId : (entityId || inheritedEntityId),
        size: source.size,
        scan_status: scanStatusFor(scan),
        scanned_at: scan.skipped ? null : new Date(),
      }).returningAll().executeTakeFirstOrThrow();

      const { storageKey } = source.kind === 'buffer'
        ? await MinioIntegration.uploadCloudFile(user.tenant_id, row.id, p.filename, source.buffer)
        : await MinioIntegration.uploadCloudFileFromChunks(user.tenant_id, row.id, p.filename, source.openStream(), source.size);
      const updated = await trx.updateTable('cloud_files')
        .set({ storage_key: storageKey, search_text: searchText, updated_at: new Date() })
        .where('id', '=', row.id).returningAll().executeTakeFirstOrThrow();
      if (updated.entity_type && updated.entity_id) {
        await trx.insertInto('resource_file_links').values({
          tenant_id: user.tenant_id, file_id: updated.id, resource_type: updated.entity_type,
          resource_id: updated.entity_id, relationship_type: 'ATTACHMENT', created_by: isCustomer ? null : user.sub,
        }).onConflict(oc => oc.columns(['tenant_id', 'file_id', 'resource_type', 'resource_id', 'relationship_type']).doNothing()).execute();
      }

      if (parentId) await bumpParentCount(trx, parentId, user.tenant_id, 1, source.size);

      emitDomainEvent(trx, user.tenant_id, {
        type: 'file.uploaded', sourceApp: 'cloud', entityType: 'document', entityId: updated.id,
        payload: { name: updated.name, size: source.size, type: updated.type },
        actorId: isCustomer ? null : user.sub,
      }).catch(err => console.error('[Cloud] file.uploaded emit failed:', err.message));

      return serialize(updated);
    });

  }

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
      return await ingestUpload(req, reply, {
        source: { kind: 'buffer', buffer, size: buffer.length },
        filename: data.filename, mimetype: data.mimetype, parentId, driveId, entityType, entityId, isCustomer, customerId,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Chunked, resumable uploads ─────────────────────────────────────────────────────────────
  // For large files: the browser sends fixed-size chunks (each its own small request, retried on its
  // own), and after a dropped connection — or a page reload, if the same file is picked again — asks
  // which chunks the server already has and sends only the rest. Chunks are staged in the object store
  // and assembled at /complete, which then runs the SAME pipeline as a normal upload (quota, malware
  // scan, drive-access check, row, links, audit) — nothing about scanning or permissions is skipped.
  // Note: assembly still holds the finished file in memory once, so this improves reliability and
  // request size, not peak memory; MAX_CHUNKED_BYTES bounds it.
  const CHUNK_BYTES = 5 * 1024 * 1024;
  const MAX_CHUNKED_BYTES = 1024 * 1024 * 1024;

  fastify.post('/uploads', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const b = (req.body ?? {}) as { name?: string; size?: number; mime_type?: string; parent_id?: string | null; drive_id?: string; entity_type?: string; entity_id?: string; fingerprint?: string };
    const size = Number(b.size);
    if (!b.name?.trim() || !b.drive_id || !Number.isFinite(size) || size <= 0) return reply.status(400).send({ error: 'name, size and drive_id are required' });
    if (size > MAX_CHUNKED_BYTES) return reply.status(413).send({ error: 'FILE_TOO_LARGE', message: `Files over ${Math.round(MAX_CHUNKED_BYTES / 1048576)} MB cannot be uploaded here.` });
    return withTenant(user.tenant_id, async (trx) => {
      const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, b.drive_id!);
      if (!access?.canWrite) return reply.status(access ? 403 : 404).send({ error: access ? 'You cannot upload to this drive' : 'Drive not found' });
      // Refuse early — before the user spends time sending gigabytes the quota would reject at the end.
      const quota = await wouldExceedStorageQuota(user.tenant_id, size);
      if (quota.exceeded) return reply.status(402).send({ error: 'STORAGE_LIMIT_EXCEEDED', message: quotaBlockedMessage(quota), used_bytes: quota.used_bytes, limit_bytes: quota.limit_bytes });

      // Same person, same file (name + size + last-modified fingerprint), still open → resume it.
      if (b.fingerprint) {
        const existing = await trx.selectFrom('cloud_upload_sessions').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('fingerprint', '=', b.fingerprint)
          .where('status', '=', 'open').where('expires_at', '>', new Date()).executeTakeFirst();
        if (existing) return { id: existing.id, chunk_bytes: existing.chunk_bytes, total_chunks: Math.ceil(Number(existing.size) / existing.chunk_bytes), received: existing.received, resumed: true };
      }
      const row = await trx.insertInto('cloud_upload_sessions').values({
        tenant_id: user.tenant_id, user_id: user.sub, drive_id: b.drive_id!, parent_id: b.parent_id || null,
        filename: b.name!.trim().slice(0, 500), size, mime_type: b.mime_type || 'application/octet-stream', chunk_bytes: CHUNK_BYTES,
        entity_type: b.entity_type ?? null, entity_id: b.entity_id ?? null, fingerprint: b.fingerprint ?? null,
        expires_at: new Date(Date.now() + 24 * 3_600_000),
      } as any).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send({ id: row.id, chunk_bytes: CHUNK_BYTES, total_chunks: Math.ceil(size / CHUNK_BYTES), received: [], resumed: false });
    });
  });

  fastify.get('/uploads/:uploadId', async (req, reply) => {
    const user = req.user;
    const { uploadId } = req.params as { uploadId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const s = await trx.selectFrom('cloud_upload_sessions').selectAll().where('id', '=', uploadId).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!s) return reply.status(404).send({ error: 'Upload not found' });
      return { id: s.id, status: s.status, chunk_bytes: s.chunk_bytes, total_chunks: Math.ceil(Number(s.size) / s.chunk_bytes), received: s.received, expires_at: s.expires_at };
    });
  });

  // PUT a single chunk as the raw request body (application/octet-stream). Idempotent: re-sending a
  // chunk simply replaces it, so a retry after a dropped response is always safe.
  fastify.put('/uploads/:uploadId/chunks/:index', async (req, reply) => {
    const user = req.user;
    const { uploadId, index } = req.params as { uploadId: string; index: string };
    const i = Number(index);
    const body = req.body as Buffer | undefined;
    if (!Number.isInteger(i) || i < 0 || !Buffer.isBuffer(body) || body.length === 0) return reply.status(400).send({ error: 'A non-empty binary chunk body is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const s = await trx.selectFrom('cloud_upload_sessions').selectAll().where('id', '=', uploadId).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!s || s.status !== 'open' || new Date(s.expires_at) < new Date()) return reply.status(404).send({ error: 'Upload not found or expired' });
      const total = Math.ceil(Number(s.size) / s.chunk_bytes);
      if (i >= total) return reply.status(400).send({ error: 'Chunk index out of range' });
      const expected = i === total - 1 ? Number(s.size) - s.chunk_bytes * (total - 1) : s.chunk_bytes;
      if (body.length !== expected) return reply.status(400).send({ error: 'BAD_CHUNK_SIZE', message: `Chunk ${i} must be ${expected} bytes.` });
      await MinioIntegration.putUploadChunk(user.tenant_id, uploadId, i, body);
      const received = [...new Set([...(s.received as number[]), i])].sort((a, b) => a - b);
      await trx.updateTable('cloud_upload_sessions').set({ received: JSON.stringify(received) as any, updated_at: new Date() }).where('id', '=', uploadId).execute();
      return { received: received.length, total };
    });
  });

  fastify.post('/uploads/:uploadId/complete', async (req, reply) => {
    const user = req.user;
    const { uploadId } = req.params as { uploadId: string };
    const s = await withTenant(user.tenant_id, (trx) => trx.selectFrom('cloud_upload_sessions').selectAll()
      .where('id', '=', uploadId).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).executeTakeFirst());
    if (!s || s.status !== 'open') return reply.status(404).send({ error: 'Upload not found' });
    const total = Math.ceil(Number(s.size) / s.chunk_bytes);
    const have = new Set(s.received as number[]);
    const missing = Array.from({ length: total }, (_, k) => k).filter(k => !have.has(k));
    if (missing.length) return reply.status(409).send({ error: 'INCOMPLETE', message: `${missing.length} chunk(s) still missing`, missing });
    try {
      // Chunks are re-read from storage on demand (openStream is a factory, called once for
      // scanning and once for the final write) rather than assembled into one Buffer here — the
      // whole point of chunking a large upload is that this process never needs to hold it all at
      // once. Each chunk's exact size was already checked against the announced total when it was
      // PUT (see /uploads/:uploadId/chunks/:index), so there is nothing left to reconcile here.
      const result = await ingestUpload(req, reply, {
        source: {
          kind: 'chunks', size: Number(s.size),
          openStream: () => iterChunks((i) => MinioIntegration.getUploadChunk(user.tenant_id, uploadId, i), total),
        },
        filename: s.filename, mimetype: s.mime_type, parentId: s.parent_id, driveId: s.drive_id,
        entityType: s.entity_type ?? undefined, entityId: s.entity_id ?? undefined, isCustomer: false, customerId: null,
      });
      // Only a successful ingest closes the session; a refusal (quota, malware) leaves nothing staged behind.
      if (!reply.sent && result && (result as any).id) {
        await withTenant(user.tenant_id, (trx) => trx.updateTable('cloud_upload_sessions').set({ status: 'completed', file_id: (result as any).id, updated_at: new Date() }).where('id', '=', uploadId).execute());
      } else if (reply.statusCode >= 400) {
        await withTenant(user.tenant_id, (trx) => trx.updateTable('cloud_upload_sessions').set({ status: 'failed', updated_at: new Date() }).where('id', '=', uploadId).execute());
      }
      await MinioIntegration.deleteUploadChunks(user.tenant_id, uploadId, total);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/uploads/:uploadId', async (req, reply) => {
    const user = req.user;
    const { uploadId } = req.params as { uploadId: string };
    const s = await withTenant(user.tenant_id, (trx) => trx.selectFrom('cloud_upload_sessions').selectAll()
      .where('id', '=', uploadId).where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).executeTakeFirst());
    if (!s) return reply.status(404).send({ error: 'Upload not found' });
    await MinioIntegration.deleteUploadChunks(user.tenant_id, uploadId, Math.ceil(Number(s.size) / s.chunk_bytes));
    await withTenant(user.tenant_id, (trx) => trx.updateTable('cloud_upload_sessions').set({ status: 'cancelled', updated_at: new Date() }).where('id', '=', uploadId).execute());
    return { ok: true };
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
      } else {
        // Drive access OR a share that names this user on this exact file.
        const gate = await gateStaffFile(trx, user, id, 'read');
        if (!gate.ok) return reply.status(403).send({ error: 'Not found' });
      }
      const block = servingBlock(file.scan_status);
      if (block) return reply.status(423).send({ error: block.code, message: block.message });
      const buf = await MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      await logFileAccess(trx, {
        tenantId: user.tenant_id, fileId: file.id, userId: user.role === 'CUSTOMER' ? null : user.sub,
        actorName: user.name ?? 'Someone', action: 'download', req,
      });
      const { contentType } = resolveServedContentType(file.type);
      reply.header('Content-Disposition', `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`);
      reply.header('Content-Type', contentType);
      return reply.send(buf);
    });
  });

  // GET /:id/signed-url — a short-lived direct URL a browser can GET without
  // re-authenticating (S3 presigned GET, or an HMAC-signed passthrough link
  // on the disk backend). Owner/staff only; not for CUSTOMER logins.
  fastify.get('/:id/signed-url', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const ttl = Math.min(Math.max(Number((req.query as any).ttl) || 900, 60), 3600);
    return withTenant(user.tenant_id, async (trx) => {
      // Same gate as /download: a UUID alone never yields a URL. 404 (not 403) when the user has no
      // access at all, so ids in other people's private drives cannot be probed.
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(gate.status).send({ error: gate.status === 404 ? 'File content not available' : 'Forbidden' });
      const file = gate.file;
      if (!file.storage_key) return reply.status(404).send({ error: 'File content not available' });
      const block = servingBlock(file.scan_status);
      if (block) return reply.status(423).send({ error: block.code, message: block.message });
      const url = await MinioIntegration.getSignedUrl(user.tenant_id, file.storage_key, ttl);
      // A signed URL is a bearer credential that works without a session — record who minted it.
      await logFileAccess(trx, {
        tenantId: user.tenant_id, fileId: file.id, userId: user.sub, actorName: user.name ?? 'Someone', action: 'signed_url', req,
      });
      return { url, expires_in: ttl };
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
      } else {
        // Drive access OR a share that names this user on this exact file.
        const gate = await gateStaffFile(trx, user, id, 'read');
        if (!gate.ok) return reply.status(403).send({ error: 'Not found' });
      }
      const previewBlock = servingBlock(file.scan_status);
      if (previewBlock) return reply.status(423).send({ error: previewBlock.code, message: previewBlock.message });
      const buf = await MinioIntegration.readFile(file.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });

      await logFileAccess(trx, {
        tenantId: user.tenant_id, fileId: file.id, userId: user.role === 'CUSTOMER' ? null : user.sub,
        actorName: user.name ?? 'Someone', action: 'preview', req,
      });

      // Office documents (docx/xlsx/pptx/odt/...) have no browser-native
      // inline renderer. If a LibreOffice binary is configured (SOFFICE_BIN),
      // convert on demand and cache the resulting PDF in storage keyed by the
      // source bytes' hash (so a new version reconverts). Otherwise, 415 with
      // a hint the frontend renders as "download to view".
      if (OFFICE_PREVIEW_EXTS.has((file.type || '').toLowerCase()) && canConvert(file.type)) {
        if (!officeConfigured()) {
          return reply.status(415).send({ error: 'PREVIEW_UNAVAILABLE', hint: 'download', type: file.type });
        }
        const cacheKey = `tenants/${user.tenant_id}/cloud/${previewCacheKey(file.id, buf)}`;
        try {
          let pdf = await objectStore.get(cacheKey);
          if (!pdf) {
            pdf = await convertToPdf(buf, file.type);
            await objectStore.put(cacheKey, pdf, 'application/pdf');
          }
          reply.header('Content-Disposition', `inline; filename="${file.name.replace(/\.[^.]+$/, '').replace(/["\r\n]/g, '')}.pdf"`);
          reply.header('Content-Type', 'application/pdf');
          return reply.send(pdf);
        } catch (err) {
          if (err instanceof OfficeConvertUnavailable) {
            return reply.status(415).send({ error: 'PREVIEW_UNAVAILABLE', hint: 'download', type: file.type });
          }
          console.error('[Cloud] office preview conversion failed:', (err as any)?.message);
          return reply.status(422).send({ error: 'PREVIEW_CONVERSION_FAILED', hint: 'download' });
        }
      }

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

  // GET /:id/access-log — who has opened this file and when. Owner or a
  // MANAGER+/ADMIN; not exposed to CUSTOMER logins.
  fastify.get('/:id/access-log', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const limit = Math.min(Math.max(Number((req.query as any).limit) || 50, 1), 200);
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      const file = gate.file;
      const privileged = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'OWNER'].includes(user.role as string);
      if (!privileged && file.owner_id !== user.sub) {
        return reply.status(403).send({ error: 'Only the file owner or an admin can see the access log.' });
      }
      const rows = await trx.selectFrom('cloud_file_access_log').selectAll()
        .where('file_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').limit(limit).execute();
      return { data: rows };
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
        const existing = await trx.selectFrom('cloud_files').select(['drive_id', 'entity_type', 'entity_id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!existing) return reply.status(404).send({ error: 'Not found' });
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, existing.drive_id);
        if (!access?.canWrite) return reply.status(403).send({ error: 'You cannot edit this file' });

        const update: Record<string, any> = { updated_at: new Date() };
        for (const f of ['name', 'color', 'description', 'starred', 'entity_type', 'entity_id']) {
          if (body[f] !== undefined) update[f] = body[f];
        }
        const row = await trx.updateTable('cloud_files').set(update)
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        if (body.entity_type !== undefined || body.entity_id !== undefined) {
          if (existing.entity_type && existing.entity_id) {
            await trx.deleteFrom('resource_file_links').where('tenant_id', '=', user.tenant_id).where('file_id', '=', id)
              .where('resource_type', '=', existing.entity_type).where('resource_id', '=', existing.entity_id).execute();
          }
          if (row.entity_type && row.entity_id) {
            await trx.insertInto('resource_file_links').values({ tenant_id: user.tenant_id, file_id: id, resource_type: row.entity_type, resource_id: row.entity_id, relationship_type: 'ATTACHMENT', created_by: user.sub })
              .onConflict(oc => oc.columns(['tenant_id', 'file_id', 'resource_type', 'resource_id', 'relationship_type']).doNothing()).execute();
          }
        }

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
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, item.drive_id);
        if (!access?.canWrite) return reply.status(403).send({ error: 'You cannot move this file' });
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
          target = await trx.selectFrom('cloud_files').select(['drive_id', 'entity_type', 'entity_id', 'type'])
            .where('id', '=', parent_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
          if (!target || target.drive_id !== item.drive_id) return reply.status(400).send({ error: 'Cannot move an item into a different drive' });
          if ((target as any).type !== 'folder') return reply.status(400).send({ error: 'Items can only be moved into a folder' });
          if (item.type === 'folder') {
            // Never into itself or any of its own descendants — walk the destination's ancestors.
            const cycle = await sql<{ id: string }>`
              WITH RECURSIVE ancestors AS (
                SELECT id, parent_id FROM cloud_files WHERE id = ${parent_id} AND tenant_id = ${user.tenant_id}
                UNION ALL
                SELECT c.id, c.parent_id FROM cloud_files c JOIN ancestors a ON c.id = a.parent_id WHERE c.tenant_id = ${user.tenant_id}
              )
              SELECT id FROM ancestors WHERE id = ${id} LIMIT 1`.execute(trx);
            if (cycle.rows.length) return reply.status(400).send({ error: 'A folder cannot be moved into itself or one of its own subfolders' });
          }
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
        const existing = await trx.selectFrom('cloud_files').select(['drive_id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!existing) return reply.status(404).send({ error: 'Not found' });
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, existing.drive_id);
        if (!access?.canWrite) return reply.status(403).send({ error: 'You cannot trash this file' });

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
        const existing = await trx.selectFrom('cloud_files').select(['drive_id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!existing) return reply.status(404).send({ error: 'Not found' });
        const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, existing.drive_id);
        if (!access?.canWrite) return reply.status(403).send({ error: 'You cannot restore this file' });

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
        const allTrashed = await trx.selectFrom('cloud_files').select(['id', 'storage_key', 'legal_hold', 'retain_until'])
          .where('tenant_id', '=', user.tenant_id).where('drive_id', '=', drive_id).where('is_trash', '=', true).execute();
        // Files under legal hold or inside their retention period stay in Trash.
        const trashed = allTrashed.filter(t => !deletionLock(t).locked);
        for (const t of trashed) {
          if (t.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, t.storage_key);
        }
        if (trashed.length) {
          await trx.deleteFrom('cloud_files')
            .where('tenant_id', '=', user.tenant_id).where('id', 'in', trashed.map(t => t.id)).execute();
        }
        return { deleted: trashed.length, retained: allTrashed.length - trashed.length };
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
        const lock = deletionLock(item);
        if (lock.locked) return reply.status(409).send({ error: 'RETENTION_LOCKED', message: deletionLockMessage(lock) });
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
    const { shared } = req.body as { shared: { name?: string; role: 'Viewer' | 'Editor'; principal_type?: string; principal_id?: string }[] };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        // ── Staff: internal sharing with REAL principals only ─────────────────────────────────
        if (user.role !== 'CUSTOMER') {
          const gate = await gateStaffFile(trx, user, id, 'read');
          if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
          if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can change sharing.' });

          const wanted = shared ?? [];
          if (wanted.length > 100) return reply.status(400).send({ error: 'Too many people.' });
          const resolved: { principal_type: string; principal_id: string; role: string; person_name: string }[] = [];
          for (const s of wanted) {
            if (s.role !== 'Viewer' && s.role !== 'Editor') return reply.status(400).send({ error: 'INVALID_SHARE_ROLE', message: 'Role must be Viewer or Editor.' });
            const ptype = s.principal_type;
            const pid = s.principal_id;
            if (!ptype || !pid || !['user', 'customer', 'organization'].includes(ptype) || !/^[0-9a-f-]{36}$/i.test(pid)) {
              return reply.status(400).send({ error: 'INVALID_SHARE_TARGET', message: 'Pick a person from the list — typed names cannot be shared with.' });
            }
            let name: string | null = null;
            if (ptype === 'user') {
              const u = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', pid).where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst();
              name = u ? (u.name || u.email) : null;
            } else if (ptype === 'customer') {
              const c = await trx.selectFrom('customers').select('name').where('id', '=', pid).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
              name = c?.name ?? null;
            } else {
              const o = await trx.selectFrom('organizations').select('name').where('id', '=', pid).executeTakeFirst();
              name = o?.name ?? null;
            }
            if (!name) return reply.status(400).send({ error: 'INVALID_SHARE_TARGET', message: 'That person is not in this workspace.' });
            resolved.push({ principal_type: ptype, principal_id: pid, role: s.role, person_name: name });
          }

          const before = await trx.selectFrom('cloud_file_shares').select(['principal_type', 'principal_id', 'role', 'person_name'])
            .where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
          await trx.deleteFrom('cloud_file_shares').where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
          if (resolved.length) {
            await trx.insertInto('cloud_file_shares').values(resolved.map(r => ({
              tenant_id: user.tenant_id, file_id: id, person_name: r.person_name, role: r.role,
              principal_type: r.principal_type, principal_id: r.principal_id,
            }))).execute();
          }
          await trx.updateTable('cloud_files').set({ updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();

          const key = (x: { principal_type: string | null; principal_id: string | null }) => `${x.principal_type}:${x.principal_id}`;
          const prev = new Map(before.map(b => [key(b), b]));
          const next = new Map(resolved.map(r => [key(r), r]));
          await emitDomainEvent(trx, user.tenant_id, {
            type: 'file.shared', sourceApp: 'cloud', entityType: 'document', entityId: id,
            payload: {
              added: resolved.filter(r => !prev.has(key(r))).map(r => ({ name: r.person_name, role: r.role, type: r.principal_type })),
              removed: before.filter(b => !next.has(key(b))).map(b => ({ name: b.person_name, role: b.role, type: b.principal_type })),
              changed: resolved.filter(r => prev.has(key(r)) && prev.get(key(r))!.role !== r.role).map(r => ({ name: r.person_name, from: prev.get(key(r))!.role, to: r.role })),
            },
            actorId: user.sub,
          });
          const fresh = await trx.selectFrom('cloud_files').select('share_token').where('id', '=', id).executeTakeFirst();
          return { shared: resolved.map(r => ({ name: r.person_name, role: r.role, principal_type: r.principal_type, principal_id: r.principal_id })), share_token: fresh?.share_token ?? null, public_url: publicLinkUrl(fresh?.share_token ?? null) };
        }

        // ── Customer login: unchanged rules ───────────────────────────────────────────────────
        const file = await trx.selectFrom('cloud_files').select(['id', 'share_token', 'type', 'entity_type', 'entity_id'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });
        const cid = await resolveCustomerId(user);
        const ownsDirectly = file.entity_type === 'customer' && file.entity_id === cid;
        const isEditor = cid && await trx.selectFrom('cloud_file_shares').select('id')
          .where('file_id', '=', id).where('principal_type', '=', 'customer').where('principal_id', '=', cid)
          .where('role', '=', 'Editor').executeTakeFirst();
        if (!ownsDirectly && !isEditor) return reply.status(403).send({ error: 'Not available for customer accounts' });

        await trx.deleteFrom('cloud_file_shares').where('file_id', '=', id).execute();
        if (shared?.length) {
          await trx.insertInto('cloud_file_shares').values(
            shared.map(s => ({
              tenant_id: user.tenant_id, file_id: id, person_name: s.name ?? '', role: s.role,
              principal_type: s.principal_type ?? null, principal_id: s.principal_id ?? null,
            }))
          ).execute();
        }
        const shareToken = shared?.length ? (file.share_token ?? crypto.randomUUID()) : null;
        await trx.updateTable('cloud_files').set({ updated_at: new Date(), share_token: shareToken }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'file.shared', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { shared: (shared ?? []).map(s => ({ name: s.name, role: s.role })) }, actorId: null,
        });
        return { shared: shared ?? [], share_token: shareToken, public_url: publicLinkUrl(shareToken) };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/public-link { rotate?: boolean } — create (or rotate) the anonymous download link.
  // Deliberately separate from internal sharing: anyone holding the URL can download, so it
  // needs the same "owner or drive manager" right as sharing AND is audited on its own.
  fastify.post('/:id/public-link', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const rotate = (req.body as any)?.rotate === true;
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can create a public link.' });
      const file = gate.file;
      if (file.type === 'folder') return reply.status(400).send({ error: 'Folders cannot be shared with a public link.' });
      const block = servingBlock(file.scan_status);
      if (block) return reply.status(423).send({ error: block.code, message: block.message });
      const existing: string | null = file.share_token;
      const token = rotate || !existing ? crypto.randomUUID() : existing;
      if (token !== existing) {
        await trx.updateTable('cloud_files').set({ share_token: token, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        await emitDomainEvent(trx, user.tenant_id, {
          type: existing ? 'file.link.rotated' : 'file.link.created', sourceApp: 'cloud', entityType: 'document', entityId: id,
          payload: { name: file.name }, actorId: user.sub,
        });
      }
      return { share_token: token, public_url: publicLinkUrl(token) };
    });
  });

  fastify.delete('/:id/public-link', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can revoke a public link.' });
      if (gate.file.share_token) {
        await trx.updateTable('cloud_files').set({ share_token: null, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'file.link.revoked', sourceApp: 'cloud', entityType: 'document', entityId: id, payload: { name: gate.file.name }, actorId: user.sub,
        });
      }
      return { share_token: null, public_url: null };
    });
  });

  // ── Email invitations (for people with no account here) ───────────────────────────────────────
  // A per-recipient, expiring, revocable, read-only link to ONE file, sent by email. Same right as
  // sharing (owner or drive manager). Only the token's SHA-256 is stored; every open is logged under
  // the invitee's email, so "who looked at it" is answerable.
  const inviteHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const escHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  fastify.post('/:id/invites', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { email?: string; message?: string; expires_days?: number };
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
    const days = Math.min(Math.max(Math.floor(Number(b.expires_days) || 7), 1), 30);
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can invite people.' });
      const file = gate.file;
      if (file.type === 'folder') return reply.status(400).send({ error: 'Invite people to individual files, not folders.' });
      const block = servingBlock(file.scan_status);
      if (block) return reply.status(423).send({ error: block.code, message: block.message });
      const open = await trx.selectFrom('cloud_file_invites').select(({ fn }) => fn.countAll<string>().as('n'))
        .where('tenant_id', '=', user.tenant_id).where('file_id', '=', id).where('revoked_at', 'is', null).where('expires_at', '>', new Date()).executeTakeFirst();
      if (Number(open?.n ?? 0) >= 50) return reply.status(400).send({ error: 'This file already has 50 active invitations.' });

      const token = crypto.randomBytes(24).toString('base64url');
      const row = await trx.insertInto('cloud_file_invites').values({
        tenant_id: user.tenant_id, file_id: id, email, token_hash: inviteHash(token), message: b.message?.trim().slice(0, 1000) || null,
        invited_by: user.sub, expires_at: new Date(Date.now() + days * 86_400_000),
      } as any).returning(['id', 'email', 'expires_at', 'created_at']).executeTakeFirstOrThrow();
      const url = `${env.API_BASE_URL.replace(/\/$/, '')}/v1/files-public/invite/${token}`;
      const inviter = escHtml(user.name || user.email || 'A colleague');
      await MailService.enqueue(user.tenant_id, {
        to: email, sourceApp: 'cloud', subject: `${user.name || 'A colleague'} shared "${file.name}" with you`,
        bodyHtml: `<p>${inviter} shared a file with you: <strong>${escHtml(file.name)}</strong>.</p>${b.message?.trim() ? `<p>${escHtml(b.message.trim().slice(0, 1000))}</p>` : ''}<p><a href="${url}">Open the file</a></p><p style="color:#666;font-size:12px">This link is just for you and expires on ${row.expires_at.toISOString().slice(0, 10)}. Don't forward it.</p>`,
      } as any);
      await emitDomainEvent(trx, user.tenant_id, {
        type: 'file.invite.created', sourceApp: 'cloud', entityType: 'document', entityId: id,
        payload: { name: file.name, email, expires_days: days }, actorId: user.sub,
      });
      return reply.status(201).send({ ...row, url });
    });
  });

  fastify.get('/:id/invites', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can see invitations.' });
      const rows = await trx.selectFrom('cloud_file_invites').select(['id', 'email', 'expires_at', 'revoked_at', 'last_opened_at', 'open_count', 'created_at'])
        .where('tenant_id', '=', user.tenant_id).where('file_id', '=', id).orderBy('created_at', 'desc').execute();
      return { data: rows };
    });
  });

  fastify.delete('/:id/invites/:inviteId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id, inviteId } = req.params as { id: string; inviteId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
      if (!canShareFile(gate, user.sub)) return reply.status(403).send({ error: 'Only the file owner or a drive manager can revoke invitations.' });
      const row = await trx.updateTable('cloud_file_invites').set({ revoked_at: new Date() })
        .where('id', '=', inviteId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).where('revoked_at', 'is', null)
        .returning(['email']).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Invitation not found' });
      await emitDomainEvent(trx, user.tenant_id, {
        type: 'file.invite.revoked', sourceApp: 'cloud', entityType: 'document', entityId: id, payload: { email: row.email }, actorId: user.sub,
      });
      return { ok: true };
    });
  });

  // GET /shared-with-me — files a colleague shared with this user (they may live in a drive the user cannot open).
  fastify.get('/shared-with-me', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('cloud_files')
        .innerJoin('cloud_file_shares', 'cloud_file_shares.file_id', 'cloud_files.id')
        .selectAll('cloud_files').select('cloud_file_shares.role as share_role')
        .where('cloud_files.tenant_id', '=', user.tenant_id).where('cloud_file_shares.tenant_id', '=', user.tenant_id)
        .where('cloud_file_shares.principal_type', '=', 'user').where('cloud_file_shares.principal_id', '=', user.sub)
        .where('cloud_files.is_trash', '=', false).orderBy('cloud_files.updated_at', 'desc').limit(200).execute();
      return { data: rows.map((r: any) => ({ ...serialize(r), share_role: r.share_role })) };
    });
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
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
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
        const gate = await gateStaffFile(trx, user, id, 'comment');
        if (!gate.ok) return reply.status(gate.status).send({ error: gate.status === 404 ? 'Not found' : 'You cannot comment on this file' });

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
    const { id, commentId } = req.params as { id: string; commentId: string };
    const { content } = req.body as { content?: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    return withTenant(user.tenant_id, async (trx) => {
      // The comment must belong to THIS file, and the caller must still be able to see the file.
      const gate = await gateStaffFile(trx, user, id, 'comment');
      if (!gate.ok) return reply.status(gate.status).send({ error: gate.status === 404 ? 'Comment not found' : 'Forbidden' });
      const existing = await trx.selectFrom('cloud_file_comments').select(['id', 'author_id'])
        .where('id', '=', commentId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Comment not found' });
      const canEdit = existing.author_id === user.sub || ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canEdit) return reply.status(403).send({ error: 'Forbidden' });
      const updated = await trx.updateTable('cloud_file_comments')
        .set({ content: content.trim(), updated_at: new Date() })
        .where('id', '=', commentId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      return updated;
    });
  });

  fastify.delete('/:id/comments/:commentId', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { id, commentId } = req.params as { id: string; commentId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Comment not found' });
      const existing = await trx.selectFrom('cloud_file_comments').select(['id', 'author_id'])
        .where('id', '=', commentId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Comment not found' });
      const canDelete = existing.author_id === user.sub || ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canDelete) return reply.status(403).send({ error: 'Forbidden' });
      await trx.deleteFrom('cloud_file_comments').where('id', '=', commentId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
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
      // Access first — before any bytes are buffered, scanned or counted against the quota.
      const pre = await withTenant(user.tenant_id, (trx) => gateStaffFile(trx, user, id, 'write'));
      if (!pre.ok) return reply.status(pre.status).send({ error: pre.status === 404 ? 'Not found' : 'You cannot upload a new version of this file' });
      const buffer = await data.toBuffer();
      const quota = await wouldExceedStorageQuota(user.tenant_id, buffer.length);
      if (quota.exceeded) {
        return reply.status(402).send({
          error: 'STORAGE_LIMIT_EXCEEDED',
          message: quotaBlockedMessage(quota),
          used_bytes: quota.used_bytes, limit_bytes: quota.limit_bytes,
        });
      }

      const scan = await scanBuffer(buffer);
      if (!scan.clean) {
        return reply.status(422).send({
          error: 'MALWARE_DETECTED',
          message: `This file was rejected by the malware scanner${scan.signature ? ` (${scan.signature})` : ''}.`,
          signature: scan.signature ?? null,
        });
      }

      return await withTenant(user.tenant_id, async (trx) => {
        const file = await trx.selectFrom('cloud_files').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!file) return reply.status(404).send({ error: 'Not found' });
        if (file.type === 'folder') return reply.status(400).send({ error: 'Folders have no version history' });
        const searchText = await extractText(buffer, file.type, data.mimetype).catch(() => null);

        if (file.storage_key) {
          const oldBytes = await MinioIntegration.readFile(file.storage_key);
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
          storage_key: storageKey, size: buffer.length, mime_type: data.mimetype, search_text: searchText, updated_at: new Date(),
          scan_status: scanStatusFor(scan), scanned_at: scan.skipped ? null : new Date(),
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
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Not found' });
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
      const gate = await gateStaffFile(trx, user, id, 'read');
      if (!gate.ok) return reply.status(404).send({ error: 'Version not found' });
      const versionBlock = servingBlock(gate.file.scan_status);
      if (versionBlock) return reply.status(423).send({ error: versionBlock.code, message: versionBlock.message });
      const version = await trx.selectFrom('cloud_file_versions').selectAll()
        .where('id', '=', versionId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!version) return reply.status(404).send({ error: 'Version not found' });
      const buf = await MinioIntegration.readFile(version.storage_key);
      if (!buf) return reply.status(404).send({ error: 'File content not found' });
      await logFileAccess(trx, {
        tenantId: user.tenant_id, fileId: id, versionId, userId: user.sub,
        actorName: user.name ?? 'Someone', action: 'version_download', req,
      });
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
        const gate = await gateStaffFile(trx, user, id, 'write');
        if (!gate.ok) return reply.status(gate.status).send({ error: gate.status === 404 ? 'Not found' : 'You cannot restore versions of this file' });
        const file = gate.file;
        const version = await trx.selectFrom('cloud_file_versions').selectAll()
          .where('id', '=', versionId).where('file_id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!version) return reply.status(404).send({ error: 'Version not found' });

        // Restoring archives the current content as a *new* version while the
        // restored-from version row stays — so it adds one full copy of the
        // current file to stored bytes.
        const restoreQuota = await wouldExceedStorageQuota(user.tenant_id, Number(file.size) || 0);
        if (restoreQuota.exceeded) {
          return reply.status(402).send({
            error: 'STORAGE_LIMIT_EXCEEDED',
            message: quotaBlockedMessage(restoreQuota, 'Restoring this version'),
            used_bytes: restoreQuota.used_bytes, limit_bytes: restoreQuota.limit_bytes,
          });
        }

        // The about-to-be-replaced current content is archived too — restoring
        // is non-destructive, and never costs you the version you restored from.
        if (file.storage_key) {
          const currentBytes = await MinioIntegration.readFile(file.storage_key);
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
        const versionBytes = await MinioIntegration.readFile(version.storage_key);
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

  // ── Connected Apps ─────────────────────────────────────────────────────
  //
  // OneDrive is a real integration: a per-tenant BYO Microsoft Graph OAuth
  // app (client id + secret set here, encrypted at rest), a real consent
  // handshake, token refresh, and a real recursive file-listing sync into
  // cloud_external_files. Same BYO-credential shape as the Outlook contact
  // sync (contacts-sync.routes.ts).
  //
  // Dropbox / Box / Mega keep the label-only "bookmark" connect they always
  // had — connect/disconnect persist real per-tenant state — but /sync is an
  // explicit 501, not a fake stamp: no real transfer exists for them yet.

  const OAUTH_REDIRECT = (provider: string) => `${env.OPS_BOARD_URL}/cloud/connections/${provider}/callback`;
  const REAL_PROVIDERS = new Set(['onedrive']);
  const isProvider = (p: string): p is StorageProvider => STORAGE_PROVIDERS.includes(p as StorageProvider);

  async function getConnectorCreds(
    trx: Transaction<Database>, tenantId: string, provider: string,
  ): Promise<{ clientId: string; clientSecret: string } | null> {
    const row = await trx.selectFrom('cloud_storage_connections')
      .select(['oauth_client_id', 'oauth_client_secret_enc'])
      .where('tenant_id', '=', tenantId).where('provider', '=', provider).executeTakeFirst();
    if (!row?.oauth_client_id || !row?.oauth_client_secret_enc) return null;
    const clientId = String(row.oauth_client_id).trim().replace(/^["']|["']$/g, '').trim();
    if (!clientId) return null;
    return { clientId, clientSecret: decryptSecret(row.oauth_client_secret_enc) };
  }

  async function freshConnectorToken(
    trx: Transaction<Database>, tenantId: string, provider: string,
    conn: { id: string; access_token_enc: string | null; refresh_token_enc: string | null; token_expires_at: Date | null },
    creds: { clientId: string; clientSecret: string },
  ): Promise<string> {
    const notExpired = conn.token_expires_at && new Date(conn.token_expires_at).getTime() > Date.now() + 60_000;
    if (notExpired && conn.access_token_enc) return decryptSecret(conn.access_token_enc);
    if (!conn.refresh_token_enc) throw new Error(`${provider} connection expired — reconnect the account.`);
    const refreshed = await refreshOneDriveToken(creds.clientId, creds.clientSecret, decryptSecret(conn.refresh_token_enc));
    await trx.updateTable('cloud_storage_connections').set({
      access_token_enc: encryptSecret(refreshed.access_token),
      refresh_token_enc: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : conn.refresh_token_enc,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
      updated_at: new Date(),
    }).where('id', '=', conn.id).execute();
    return refreshed.access_token;
  }

  async function syncOneDrive(trx: Transaction<Database>, tenantId: string, connId: string): Promise<number> {
    const conn = await trx.selectFrom('cloud_storage_connections').selectAll()
      .where('id', '=', connId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const creds = await getConnectorCreds(trx, tenantId, 'onedrive');
    if (!creds) throw new Error('OneDrive OAuth app is not configured.');
    const token = await freshConnectorToken(trx, tenantId, 'onedrive', conn, creds);
    const files = await listOneDriveFiles(token);
    // Full replace — a sync is a snapshot, not an append.
    await trx.deleteFrom('cloud_external_files').where('tenant_id', '=', tenantId).where('provider', '=', 'onedrive').execute();
    for (const f of files) {
      await trx.insertInto('cloud_external_files').values({
        tenant_id: tenantId, provider: 'onedrive', name: f.name, type: f.type,
        size: f.size, external_id: f.externalId, web_url: f.webUrl, path: f.path, parent_id: null,
      } as any).execute();
    }
    await trx.updateTable('cloud_storage_connections').set({
      last_synced_at: new Date(), last_sync_error: null, updated_at: new Date(),
    }).where('id', '=', connId).execute();
    return files.length;
  }

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
          // Never leak the encrypted secret / tokens to the client.
          const { oauth_client_secret_enc, access_token_enc, refresh_token_enc, ...safe } = row as any;
          return {
            ...safe,
            supported: REAL_PROVIDERS.has(p),
            oauth_configured: !!(row.oauth_client_id && oauth_client_secret_enc),
            file_count: providerFiles.length,
            total_size: providerFiles.reduce((sum, f) => sum + Number(f.size ?? 0), 0),
          };
        });
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // PUT /connections/:provider/oauth-config — store the tenant's BYO OAuth
  // app credentials (client id + secret). Secret is encrypted at rest.
  fastify.put('/connections/:provider/oauth-config', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    if (!['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'OWNER'].includes(user.role as string)) {
      return reply.status(403).send({ error: 'Only an admin can configure a storage connector.' });
    }
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider) || !REAL_PROVIDERS.has(provider)) {
      return reply.status(400).send({ error: `${provider} does not support a real OAuth connection yet.` });
    }
    const { client_id, client_secret } = req.body as { client_id?: string; client_secret?: string };
    if (!client_id?.trim()) return reply.status(400).send({ error: 'client_id is required' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const set: Record<string, any> = { oauth_client_id: client_id.trim(), updated_at: new Date() };
        // Only overwrite the secret if a new one was actually supplied (the UI
        // sends the field blank when it's just editing the id).
        if (client_secret?.trim()) set.oauth_client_secret_enc = encryptSecret(client_secret.trim());
        await trx.updateTable('cloud_storage_connections').set(set)
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).execute();
        return { ok: true, oauth_configured: true };
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /connections/:provider/auth-url — the provider consent URL to redirect to.
  fastify.get('/connections/:provider/auth-url', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider) || !REAL_PROVIDERS.has(provider)) {
      reply.status(400); return { error: `${provider} does not support a real OAuth connection yet.` };
    }
    return withTenant(user.tenant_id, async (trx) => {
      const creds = await getConnectorCreds(trx, user.tenant_id, provider);
      if (!creds) {
        reply.status(400);
        return { error: 'This connector\'s OAuth app isn\'t configured yet — set its Client ID and Secret first.' };
      }
      const state = crypto.randomBytes(16).toString('hex');
      return { url: buildOneDriveAuthUrl(creds.clientId, OAUTH_REDIRECT(provider), state), state, redirect_uri: OAUTH_REDIRECT(provider) };
    });
  });

  // POST /connections/:provider/callback — { code } from the consent redirect.
  fastify.post<{ Body: { code: string } }>('/connections/:provider/callback', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider) || !REAL_PROVIDERS.has(provider)) {
      reply.status(400); return { error: `${provider} does not support a real OAuth connection yet.` };
    }
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const creds = await getConnectorCreds(trx, user.tenant_id, provider);
        if (!creds) { reply.status(400); return { error: 'OAuth app not configured.' }; }
        const tokens = await exchangeOneDriveCode(creds.clientId, creds.clientSecret, OAUTH_REDIRECT(provider), req.body.code);
        const email = await getOneDriveAccountEmail(tokens.access_token);
        const now = new Date();
        const row = await trx.updateTable('cloud_storage_connections').set({
          status: 'connected',
          account_label: email,
          account_email: email,
          access_token_enc: encryptSecret(tokens.access_token),
          refresh_token_enc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
          connected_at: now, updated_at: now,
        }).where('tenant_id', '=', user.tenant_id).where('provider', '=', provider)
          .returning(['id']).executeTakeFirstOrThrow();
        try {
          const count = await syncOneDrive(trx, user.tenant_id, row.id);
          return { connected: true, email, synced: count };
        } catch (syncErr: any) {
          await trx.updateTable('cloud_storage_connections')
            .set({ last_sync_error: syncErr.message, updated_at: new Date() })
            .where('id', '=', row.id).execute();
          return { connected: true, email, synced: 0, sync_error: syncErr.message };
        }
      });
    } catch (err: any) {
      reply.status(400);
      return { error: err.message || 'Failed to connect the account' };
    }
  });

  // POST /connections/:provider/connect — Dropbox/Box/Mega label "bookmark".
  fastify.post('/connections/:provider/connect', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider)) return reply.status(400).send({ error: 'Unknown provider' });
    if (REAL_PROVIDERS.has(provider)) {
      return reply.status(400).send({ error: `Use the OAuth flow (GET /connections/${provider}/auth-url) to connect ${provider}.` });
    }
    const { account_label } = req.body as { account_label?: string };
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const now = new Date();
        await trx.updateTable('cloud_storage_connections').set({
          status: 'connected', account_label: account_label?.trim() || null,
          connected_at: now, last_synced_at: now, updated_at: now,
        }).where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).execute();
        return trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirstOrThrow();
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /connections/:provider/files — real synced listing from cloud_external_files.
  fastify.get('/connections/:provider/files', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider)) return reply.status(400).send({ error: 'Unknown provider' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const conn = await trx.selectFrom('cloud_storage_connections').select(['status'])
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirst();
        if (!conn || conn.status !== 'connected') return reply.status(400).send({ error: 'Not connected' });
        const rows = await trx.selectFrom('cloud_external_files').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).orderBy('name').execute();
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
    if (!isProvider(provider)) return reply.status(400).send({ error: 'Unknown provider' });
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        await trx.updateTable('cloud_storage_connections').set({
          status: 'disconnected', account_label: null, account_email: null,
          access_token_enc: null, refresh_token_enc: null, token_expires_at: null,
          connected_at: null, last_synced_at: null, last_sync_error: null, updated_at: new Date(),
          // oauth_client_id / secret are kept — disconnecting an account
          // shouldn't force re-entering the app registration to reconnect.
        }).where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).execute();
        await trx.deleteFrom('cloud_external_files')
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).execute();
        return trx.selectFrom('cloud_storage_connections').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirstOrThrow();
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /connections/:provider/sync
  fastify.post('/connections/:provider/sync', async (req, reply) => {
    const user = req.user;
    if (user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for customer accounts' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider)) return reply.status(400).send({ error: 'Unknown provider' });
    if (!REAL_PROVIDERS.has(provider)) {
      return reply.status(501).send({
        error: 'NOT_SUPPORTED',
        message: `${provider} file sync isn't available yet — only OneDrive has a working integration. Connect/disconnect is a bookmark for now.`,
      });
    }
    try {
      return await withTenant(user.tenant_id, async (trx) => {
        const conn = await trx.selectFrom('cloud_storage_connections').select(['id', 'status'])
          .where('tenant_id', '=', user.tenant_id).where('provider', '=', provider).executeTakeFirst();
        if (!conn || conn.status !== 'connected') return reply.status(400).send({ error: 'Not connected' });
        try {
          const count = await syncOneDrive(trx, user.tenant_id, conn.id);
          return { synced: count };
        } catch (err: any) {
          await trx.updateTable('cloud_storage_connections')
            .set({ last_sync_error: err.message, updated_at: new Date() })
            .where('id', '=', conn.id).execute();
          reply.status(502);
          return { error: err.message || 'Sync failed' };
        }
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
  // GET /invite/:token — the invitee's link. Read-only, one file, expiring, revocable, logged by email.
  fastify.get('/invite/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    // No tenant is knowable here — the token hash alone scopes the lookup to one row (same reasoning as the public link).
    const invite = await dbPlatform.selectFrom('cloud_file_invites').selectAll()
      .where('token_hash', '=', hash).where('revoked_at', 'is', null).where('expires_at', '>', new Date()).executeTakeFirst();
    if (!invite) return reply.status(404).send({ error: 'This invitation is invalid, expired or has been withdrawn.' });
    const file = await dbPlatform.selectFrom('cloud_files').selectAll()
      .where('id', '=', invite.file_id).where('tenant_id', '=', invite.tenant_id).where('is_trash', '=', false).executeTakeFirst();
    if (!file || !file.storage_key || file.type === 'folder') return reply.status(404).send({ error: 'File not available' });
    const block = servingBlock(file.scan_status);
    if (block) return reply.status(423).send({ error: block.code, message: block.message });
    const buf = await MinioIntegration.readFile(file.storage_key);
    if (!buf) return reply.status(404).send({ error: 'File content not found' });
    await dbPlatform.updateTable('cloud_file_invites').set({ last_opened_at: new Date(), open_count: sql`open_count + 1` as any })
      .where('id', '=', invite.id).execute();
    dbPlatform.insertInto('cloud_file_access_log').values({
      tenant_id: invite.tenant_id, file_id: file.id, user_id: null, actor_name: `Invited: ${invite.email}`, action: 'link_download', via: 'public_link',
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      user_agent: (req.headers['user-agent'] as string || '').slice(0, 500) || null,
    }).execute().catch((err) => console.error('[Cloud] invite access-log write failed:', err.message));
    const { contentType, inlineAllowed } = resolveServedContentType(file.type);
    reply.header('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${file.name.replace(/["\r\n]/g, '')}"`);
    reply.header('Content-Type', contentType);
    return reply.send(buf);
  });

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
    const publicBlock = servingBlock(file.scan_status);
    if (publicBlock) return reply.status(423).send({ error: publicBlock.code, message: publicBlock.message });
    const buf = await MinioIntegration.readFile(file.storage_key);
    if (!buf) return reply.status(404).send({ error: 'File content not found' });
    // Log the anonymous open against the file's own tenant (dbPlatform is
    // BYPASSRLS, so the insert's tenant_id is set explicitly from the file).
    dbPlatform.insertInto('cloud_file_access_log').values({
      tenant_id: file.tenant_id, file_id: file.id, user_id: null,
      actor_name: 'Public link', action: 'link_download', via: 'public_link',
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      user_agent: (req.headers['user-agent'] as string || '').slice(0, 500) || null,
    }).execute().catch((err) => console.error('[Cloud] public access-log write failed:', err.message));
    // Highest-stakes spot for this check: unauthenticated, so anyone who
    // opens a shared link is exposed — never the stored (client-claimed)
    // mime_type here, same reasoning as GET /:id/preview above.
    const { contentType, inlineAllowed } = resolveServedContentType(file.type);
    reply.header('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${file.name.replace(/["\r\n]/g, '')}"`);
    reply.header('Content-Type', contentType);
    return reply.send(buf);
  });

  // GET /v1/files/blob?key=&exp=&sig=&name= — the disk storage backend's
  // presigned-GET passthrough (object-storage.ts DiskBackend.presignGet).
  // The HMAC over key+exp is the only credential; an S3 backend never routes
  // here (it hands out the object store's own presigned URL directly).
  fastify.get('/blob', async (req, reply) => {
    const { key, exp, sig, name } = req.query as { key?: string; exp?: string; sig?: string; name?: string };
    if (!key || !exp || !sig || !verifyDiskSignedUrl(key, exp, sig)) {
      return reply.status(403).send({ error: 'This link is invalid or has expired.' });
    }
    const buf = await objectStore.get(key);
    if (!buf) return reply.status(404).send({ error: 'File content not found' });
    const ext = key.split('.').pop() || '';
    const { contentType, inlineAllowed } = resolveServedContentType(ext);
    const fname = (name || key.split('/').pop() || 'file').replace(/["\r\n]/g, '');
    reply.header('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${fname}"`);
    reply.header('Content-Type', contentType);
    return reply.send(buf);
  });
}
