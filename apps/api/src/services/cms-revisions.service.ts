import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import type { CmsRevision, CmsRevisionResourceType } from '@hudumika/types';

function toRevision(row: any): CmsRevision {
  return {
    id: row.id, tenant_id: row.tenant_id, resource_type: row.resource_type, resource_id: row.resource_id,
    snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : (row.snapshot ?? {}),
    author_id: row.author_id, author_name: row.author_name ?? null,
    created_at: (row.created_at as Date).toISOString(),
  };
}

/**
 * §19 of the CMS master brief — real version history, one shared table for
 * all three editable surfaces (Pages, Posts, Content Model entries). Kept
 * deliberately separate from cms.service.ts/cms-content.service.ts rather
 * than folded into either, since both need to call it and neither should
 * import the other.
 *
 * `recordRevision` takes the caller's own active transaction (`trx`) rather
 * than opening one itself — withTenant() always opens a NEW transaction, so
 * calling it here would run outside the update it's meant to accompany,
 * risking a torn state where the resource saves but its revision doesn't
 * (or vice versa) if either half fails independently.
 */
// §19 — "No pruning policy for very old revisions" was a real, live gap:
// every save records one, unconditionally, including §64's own 2-second
// autosave tick — a page actively edited for ten minutes writes ~300 rows
// with nothing ever removing them. A count cap (not an age cutoff) is the
// right shape for that: an age-based sweep still lets an actively-edited
// resource accumulate unboundedly within the window, where a count cap
// bounds it regardless of edit frequency. Enforced inline, right after the
// insert that could have exceeded it, rather than a separate daily job —
// the cap holds continuously instead of "eventually, once the job next
// runs."
export const CMS_REVISION_RETENTION_COUNT = 50;

export async function recordRevision(
  trx: any, tenantId: string, resourceType: CmsRevisionResourceType, resourceId: string,
  snapshot: Record<string, unknown>, authorId: string | null,
): Promise<void> {
  await trx.insertInto('cms_revisions').values({
    tenant_id: tenantId, resource_type: resourceType, resource_id: resourceId,
    snapshot: JSON.stringify(snapshot), author_id: authorId,
  }).execute();
  await sql`
    DELETE FROM cms_revisions
    WHERE tenant_id = ${tenantId} AND resource_type = ${resourceType} AND resource_id = ${resourceId}::uuid
      AND id NOT IN (
        SELECT id FROM cms_revisions
        WHERE tenant_id = ${tenantId} AND resource_type = ${resourceType} AND resource_id = ${resourceId}::uuid
        ORDER BY created_at DESC
        LIMIT ${CMS_REVISION_RETENTION_COUNT}
      )
  `.execute(trx);
}

// Real display names (PersonAvatar/name), not a bare author_id — a revision
// list should show a real name+avatar, not a raw id or an unattributed row.
// Raw SQL rather than Kysely's typed .leftJoin(): every cms_* table stores
// author_id/created_by as TEXT (this schema's own established convention —
// see migration 465's own comment), while users.id is UUID, and Postgres
// has no implicit uuid=text comparison — a plain .leftJoin('users','users.id',
// 'cms_revisions.author_id') throws "operator does not exist: uuid = text"
// at query time, caught live rather than left as a silent 500 on every
// revision list. Casting u.id::text (a column always guaranteed to be a
// valid UUID) is the safer direction than casting the free-text author_id.
/** Called from the same trx as a resource's own delete — an orphaned
 *  revision (its resource permanently gone) can never be restored into
 *  anything, so keeping it around forever is just unbounded dead data, not
 *  a real audit trail. */
export async function deleteRevisions(trx: any, tenantId: string, resourceType: CmsRevisionResourceType, resourceId: string): Promise<void> {
  await trx.deleteFrom('cms_revisions')
    .where('tenant_id', '=', tenantId).where('resource_type', '=', resourceType).where('resource_id', '=', resourceId)
    .execute();
}

export async function listRevisions(tenantId: string, resourceType: CmsRevisionResourceType, resourceId: string): Promise<CmsRevision[]> {
  return withTenant(tenantId, async (trx) => {
    const result = await sql<any>`
      SELECT r.id, r.tenant_id, r.resource_type, r.resource_id, r.snapshot, r.author_id, r.created_at, u.name AS author_name
      FROM cms_revisions r
      LEFT JOIN users u ON u.id::text = r.author_id
      WHERE r.tenant_id = ${tenantId} AND r.resource_type = ${resourceType} AND r.resource_id = ${resourceId}::uuid
      ORDER BY r.created_at DESC
      LIMIT 100
    `.execute(trx);
    return result.rows.map(toRevision);
  });
}

export async function getRevision(tenantId: string, resourceType: CmsRevisionResourceType, resourceId: string, revisionId: string): Promise<CmsRevision> {
  return withTenant(tenantId, async (trx) => {
    const result = await sql<any>`
      SELECT r.id, r.tenant_id, r.resource_type, r.resource_id, r.snapshot, r.author_id, r.created_at, u.name AS author_name
      FROM cms_revisions r
      LEFT JOIN users u ON u.id::text = r.author_id
      WHERE r.id = ${revisionId}::uuid AND r.tenant_id = ${tenantId}
        AND r.resource_type = ${resourceType} AND r.resource_id = ${resourceId}::uuid
    `.execute(trx);
    const row = result.rows[0];
    if (!row) throw new Error('Revision not found.');
    return toRevision(row);
  });
}
