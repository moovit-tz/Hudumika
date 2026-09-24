import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { scanBuffer } from '../integrations/antivirus.js';
import { scanStatusFor } from '../lib/cloud-scan-policy.js';
import { resolveDriveAccess } from '../lib/cloud-drive-access.js';
import { bumpCloudFolderCount } from '../lib/cloud-folder-count.js';
import { wouldExceedStorageQuota, quotaBlockedMessage } from '../lib/storage-quota.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from './domain-events.service.js';

/**
 * Email ↔ Drive, both directions, through the same gates as any other Drive
 * write: drive access, quota, malware scan.
 *
 *  - saveAttachmentToDrive: copy one attachment of a message the user owns
 *    into a Drive they can write to (their own "My Drive" by default),
 *    tagged entity_type='email' / entity_id=<message id> so the file links
 *    back to the message it came from.
 *  - attachFromDrive: turn a Drive file the user can read into a compose
 *    attachment pointer (the same {storageKey, filename, size} the compose
 *    picker's upload returns), copying the bytes so a later change or
 *    deletion of the Drive file cannot alter an email already composed.
 */
export class EmailDriveError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // same ceiling as the compose upload

const extOf = (filename: string) => (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'file').toLowerCase();

async function requireCloud(tenantId: string) {
  if (!(await tenantHasEntitlement(tenantId, 'cloud'))) throw new EmailDriveError(403, 'CLOUD_NOT_ENABLED', 'Cloud (Drive) is not enabled for this workspace.');
}

interface Actor { sub: string; role: string; name?: string | null; tenant_id: string }

export async function saveAttachmentToDrive(
  user: Actor,
  input: { messageId: string; storageKey: string | null; driveId?: string | null; folderId?: string | null; attachments: { storageKey: string; filename: string; size: number | null }[] },
) {
  await requireCloud(user.tenant_id);
  const target = input.storageKey ? input.attachments.find(a => a.storageKey === input.storageKey) : input.attachments[0];
  if (!target) throw new EmailDriveError(404, 'NO_ATTACHMENT', 'No such attachment on this message.');
  const bytes = await MinioIntegration.readFile(target.storageKey);
  if (!bytes) throw new EmailDriveError(404, 'ATTACHMENT_MISSING', 'The attachment content is no longer available.');

  const quota = await wouldExceedStorageQuota(user.tenant_id, bytes.length);
  if (quota.exceeded) throw new EmailDriveError(402, 'STORAGE_LIMIT_EXCEEDED', quotaBlockedMessage(quota, 'Saving this attachment'));

  const scan = await scanBuffer(bytes);
  if (!scan.clean) throw new EmailDriveError(422, 'MALWARE_DETECTED', `This attachment was rejected by the malware scanner${scan.signature ? ` (${scan.signature})` : ''}.`);

  return withTenant(user.tenant_id, async (trx) => {
    let driveId = input.driveId ?? null;
    if (!driveId) {
      const personal = await trx.selectFrom('cloud_drives').select('id')
        .where('tenant_id', '=', user.tenant_id).where('type', '=', 'personal').where('owner_id', '=', user.sub).executeTakeFirst();
      driveId = personal?.id ?? (await trx.insertInto('cloud_drives').values({
        tenant_id: user.tenant_id, name: 'My Drive', type: 'personal', owner_name: user.name ?? 'You', owner_id: user.sub,
      }).returning('id').executeTakeFirstOrThrow()).id;
    }
    const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, driveId);
    if (!access) throw new EmailDriveError(404, 'DRIVE_NOT_FOUND', 'Drive not found.');
    if (!access.canWrite) throw new EmailDriveError(403, 'DRIVE_READ_ONLY', 'You cannot save files to this drive.');

    let parentId: string | null = null;
    if (input.folderId) {
      const folder = await trx.selectFrom('cloud_files').select(['id', 'type', 'drive_id'])
        .where('id', '=', input.folderId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!folder || folder.type !== 'folder' || folder.drive_id !== driveId) throw new EmailDriveError(400, 'BAD_FOLDER', 'That folder is not in the chosen drive.');
      parentId = folder.id;
    }

    const row = await trx.insertInto('cloud_files').values({
      tenant_id: user.tenant_id, drive_id: driveId, name: target.filename, type: extOf(target.filename), size: bytes.length,
      parent_id: parentId, owner_id: user.sub, owner_name: user.name ?? 'You',
      entity_type: 'email', entity_id: input.messageId,
      scan_status: scanStatusFor(scan), scanned_at: scan.skipped ? null : new Date(),
    }).returning('id').executeTakeFirstOrThrow();
    const { storageKey } = await MinioIntegration.uploadCloudFile(user.tenant_id, row.id, target.filename, bytes);
    await trx.updateTable('cloud_files').set({ storage_key: storageKey, updated_at: new Date() }).where('id', '=', row.id).execute();
    if (parentId) await bumpCloudFolderCount(trx, parentId, user.tenant_id, 1, bytes.length);
    await emitDomainEvent(trx, user.tenant_id, {
      type: 'email.attachment.saved_to_drive', sourceApp: 'email', entityType: 'email', entityId: input.messageId,
      payload: { fileId: row.id, filename: target.filename, driveId }, actorId: user.sub,
    });
    return { fileId: row.id, driveId, parentId, filename: target.filename, size: bytes.length };
  });
}

export async function attachFromDrive(user: Actor, fileId: string) {
  await requireCloud(user.tenant_id);
  const file = await withTenant(user.tenant_id, async (trx) => {
    const f = await trx.selectFrom('cloud_files').selectAll().where('id', '=', fileId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
    if (!f || f.type === 'folder' || !f.storage_key || f.is_trash) throw new EmailDriveError(404, 'FILE_NOT_FOUND', 'File not found.');
    const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, f.drive_id);
    if (!access?.canRead) throw new EmailDriveError(404, 'FILE_NOT_FOUND', 'File not found.');
    return f;
  });
  if (file.scan_status === 'infected') throw new EmailDriveError(423, 'QUARANTINED', 'This file is quarantined by the malware scanner and cannot be attached.');
  if (Number(file.size) > MAX_ATTACHMENT_BYTES) throw new EmailDriveError(400, 'TOO_LARGE', 'Attachments are limited to 20MB.');
  const bytes = await MinioIntegration.readFile(file.storage_key!);
  if (!bytes) throw new EmailDriveError(404, 'FILE_MISSING', 'The file content is no longer available.');
  const up = await MinioIntegration.uploadEmailAttachment(user.tenant_id, user.sub, file.name, bytes);
  return { storageKey: up.storageKey, filename: file.name, size: up.size };
}
