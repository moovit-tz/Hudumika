import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Retention and legal hold for Cloud files.
 *
 * A file cannot be permanently deleted (trash purge, manual delete, trash
 * auto-expiry) while `legal_hold` is set or `retain_until` is in the future.
 * Moving to Trash is still allowed — it hides the file from normal views —
 * but the bytes are kept until the lock lifts.
 *
 * Defaults are a starting point, not legal advice: how long records must be
 * kept differs by country and record type, so a tenant admin can override
 * any class in cloud_retention_policies (days; 0 = no retention).
 */
export const DEFAULT_RETENTION_DAYS: Record<string, number> = {
  financial_record: 7 * 365 + 5, // 7 years
};

type Db = Transaction<Database> | Kysely<Database>;

export async function retentionDaysFor(db: Db, tenantId: string, retentionClass: string | null | undefined): Promise<number | null> {
  if (!retentionClass) return null;
  const override = await db.selectFrom('cloud_retention_policies').select('retain_days')
    .where('tenant_id', '=', tenantId).where('retention_class', '=', retentionClass).executeTakeFirst();
  if (override) return override.retain_days > 0 ? override.retain_days : null;
  return DEFAULT_RETENTION_DAYS[retentionClass] ?? null;
}

export async function retainUntilFor(db: Db, tenantId: string, retentionClass: string | null | undefined, from = new Date()): Promise<Date | null> {
  const days = await retentionDaysFor(db, tenantId, retentionClass);
  return days ? new Date(from.getTime() + days * 86_400_000) : null;
}

export interface DeletionLock { locked: boolean; reason?: 'legal_hold' | 'retention'; until?: Date }

export function deletionLock(file: { legal_hold?: boolean | null; retain_until?: Date | string | null }, now = new Date()): DeletionLock {
  if (file.legal_hold) return { locked: true, reason: 'legal_hold' };
  if (file.retain_until) {
    const until = new Date(file.retain_until);
    if (until.getTime() > now.getTime()) return { locked: true, reason: 'retention', until };
  }
  return { locked: false };
}

export function deletionLockMessage(lock: DeletionLock): string {
  return lock.reason === 'legal_hold'
    ? 'This file is under a legal hold and cannot be permanently deleted until the hold is released.'
    : `This file is a retained record and cannot be permanently deleted until ${lock.until?.toISOString().slice(0, 10)}.`;
}
