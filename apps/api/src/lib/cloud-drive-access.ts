import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

/** Same vocabulary as cloud_drives_type_check / cloud_drive_members role
 *  CHECK (migrations 045/498) — 'content_manager' is this schema's existing
 *  name for what the Cloud-storage spec calls "editor"; kept as-is rather
 *  than renamed, to avoid a value-rewrite migration for no functional gain. */
export const DRIVE_ROLES = ['manager', 'content_manager', 'contributor', 'commenter', 'viewer'] as const;
export type DriveMemberRole = typeof DRIVE_ROLES[number];
export type EffectiveDriveRole = 'owner' | DriveMemberRole;

const WRITE_ROLES = new Set<EffectiveDriveRole>(['owner', 'manager', 'content_manager', 'contributor']);
const MANAGE_ROLES = new Set<EffectiveDriveRole>(['owner', 'manager']);

export interface DriveAccess {
  driveType: 'personal' | 'shared' | 'business';
  role: EffectiveDriveRole;
  /** May list/download/open files in this drive. */
  canRead: boolean;
  /** May upload/create/edit/move files in this drive. */
  canWrite: boolean;
  /** May rename/delete the drive itself and manage its membership. */
  canManage: boolean;
}

/**
 * The one place that decides whether a given staff user may touch a given
 * drive — used by both drives.routes.ts (rename/delete/members) and
 * files.routes.ts (list/upload/download/move/delete). Returns null for "no
 * access at all," never a partial-but-wrong grant.
 *
 * Personal: only the owner. There is deliberately no fallback here for
 * "any staff member" or "any admin" — an admin who genuinely needs into
 * someone's personal drive goes through requireDriveAdminOverride below,
 * which is a separate, explicit, audited path, not something this function
 * ever grants silently.
 *
 * Business: every non-CUSTOMER staff login can read/write (this is the
 * tenant's shared record store — Customers/Finance/Employees/etc. — the
 * same visibility every one of those app areas already has on their own
 * underlying records); only SUPER_ADMIN/TENANT_ADMIN may rename or delete
 * folders that break app-managed links.
 *
 * Shared: the drive's own owner_id (its creator) always has manager-level
 * access; anyone else needs a cloud_drive_members row with
 * principal_type='user' and principal_id = this user, and their role
 * decides read/write/manage from there. A 'group'/'customer'/'organization'
 * principal_type is stored (migration 498) but not resolved by this
 * function yet — reserved, not yet enforced, same as cloud_file_shares'
 * own pair before this.
 */
export async function resolveDriveAccess(
  trx: Transaction<Database>, tenantId: string, userId: string, userRole: string, driveId: string,
): Promise<DriveAccess | null> {
  const drive = await trx.selectFrom('cloud_drives').select(['id', 'type', 'owner_id'])
    .where('id', '=', driveId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!drive) return null;
  const driveType = drive.type as 'personal' | 'shared' | 'business';

  if (driveType === 'personal') {
    if (drive.owner_id === userId) return { driveType, role: 'owner', canRead: true, canWrite: true, canManage: true };
    return null;
  }

  if (driveType === 'business') {
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'TENANT_ADMIN';
    return { driveType, role: isAdmin ? 'manager' : 'contributor', canRead: true, canWrite: true, canManage: isAdmin };
  }

  // shared
  if (drive.owner_id === userId) return { driveType, role: 'owner', canRead: true, canWrite: true, canManage: true };
  const member = await trx.selectFrom('cloud_drive_members').select(['role'])
    .where('drive_id', '=', driveId).where('principal_type', '=', 'user').where('principal_id', '=', userId)
    .executeTakeFirst();
  if (!member) return null;
  const role = member.role as DriveMemberRole;
  return { driveType, role, canRead: true, canWrite: WRITE_ROLES.has(role), canManage: MANAGE_ROLES.has(role) };
}

/**
 * The explicit administrator override the isolation model requires: a
 * SUPER_ADMIN/TENANT_ADMIN may reach into a drive resolveDriveAccess would
 * otherwise refuse (typically someone's personal drive, for a compliance
 * or recovery reason), but only via this named path, and only ever logged.
 * Callers pass `reason` from an explicit UI prompt — never silent.
 */
export async function requireDriveAdminOverride(
  trx: Transaction<Database>, tenantId: string, actingUserId: string, actingUserRole: string,
  driveId: string, reason: string,
): Promise<boolean> {
  if (actingUserRole !== 'SUPER_ADMIN' && actingUserRole !== 'TENANT_ADMIN') return false;
  await emitDomainEvent(trx, tenantId, {
    type: 'cloud.drive.admin_override', sourceApp: 'cloud', entityType: 'cloud_drive', entityId: driveId,
    payload: { reason: reason.slice(0, 500) }, actorId: actingUserId,
  });
  return true;
}
