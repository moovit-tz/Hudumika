import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { resolveDriveAccess, type DriveAccess } from './cloud-drive-access.js';

/**
 * File-level access for staff — the single gate every per-file route uses, so
 * "knows the file's UUID" never grants anything by itself.
 *
 * A user may act on a file when EITHER
 *   - their drive access allows it (personal owner, business drive, shared-drive role), OR
 *   - a share on that exact file names them (principal_type 'user'):
 *       Viewer  → read + comment
 *       Editor  → read + comment + write (content/rename), never manage/share/delete
 *
 * Results:
 *   ok:false status 404  — no access at all (indistinguishable from "does not exist",
 *                          so ids cannot be enumerated across private drives)
 *   ok:false status 403  — they can see it but not do THIS (e.g. Viewer trying to upload a version)
 */
export type FileNeed = 'read' | 'comment' | 'write' | 'manage';
type Trx = Transaction<Database>;

export type FileGate =
  | { ok: true; file: any; access: DriveAccess | null; via: 'drive' | 'share'; can: { read: boolean; comment: boolean; write: boolean; manage: boolean } }
  | { ok: false; status: 403 | 404 };

export async function gateStaffFile(
  trx: Trx, user: { tenant_id: string; sub: string; role: string }, fileId: string, need: FileNeed,
): Promise<FileGate> {
  const file = await trx.selectFrom('cloud_files').selectAll()
    .where('id', '=', fileId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
  if (!file) return { ok: false, status: 404 };

  const access = await resolveDriveAccess(trx, user.tenant_id, user.sub, user.role, file.drive_id);
  let can = { read: false, comment: false, write: false, manage: false };
  let via: 'drive' | 'share' = 'drive';
  if (access) {
    can = { read: access.canRead, comment: access.canComment, write: access.canWrite, manage: access.canManage };
  } else {
    const share = await trx.selectFrom('cloud_file_shares').select('role')
      .where('tenant_id', '=', user.tenant_id).where('file_id', '=', fileId)
      .where('principal_type', '=', 'user').where('principal_id', '=', user.sub).executeTakeFirst();
    if (!share) return { ok: false, status: 404 };
    via = 'share';
    can = { read: true, comment: true, write: share.role === 'Editor', manage: false };
  }
  if (!can.read) return { ok: false, status: 404 };
  if (!can[need]) return { ok: false, status: 403 };
  return { ok: true, file, access, via, can };
}

/**
 * Who may change sharing (internal shares AND public links): someone who
 * manages the drive, or the file's own owner while they can still write to it.
 * A user who only reached the file through a share can never re-share it.
 */
export function canShareFile(gate: Extract<FileGate, { ok: true }>, userId: string): boolean {
  if (gate.via === 'share') return false;
  return gate.can.manage || (gate.can.write && gate.file.owner_id === userId);
}
