import crypto from 'node:crypto';
import type { Transaction } from 'kysely';
import { dbPlatform, withTenant, type Database } from '../db/client.js';

export class PrivacyPolicyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function contentHash(title: string, content: string): string {
  return crypto.createHash('sha256').update(`${title}\n${content}`, 'utf8').digest('hex');
}

export class PrivacyPolicyService {
  static async currentVersion() {
    const page = await dbPlatform.selectFrom('cms_pages')
      .select(['id', 'title', 'content', 'updated_at'])
      .where('tenant_id', 'is', null)
      .where('slug', '=', 'privacy')
      .where('status', '=', 'published')
      .executeTakeFirst();
    if (!page) throw new PrivacyPolicyError(503, 'The privacy policy is not currently available');

    const hash = contentHash(page.title, page.content);
    const existing = await dbPlatform.selectFrom('privacy_policy_versions')
      .selectAll().where('content_hash', '=', hash).executeTakeFirst();
    if (existing) return existing;

    const effectiveAt = page.updated_at;
    const version = effectiveAt.toISOString();
    const created = await dbPlatform.insertInto('privacy_policy_versions').values({
      cms_page_id: page.id,
      version,
      content_hash: hash,
      title: page.title,
      effective_at: effectiveAt,
    })
      .onConflict(oc => oc.column('content_hash').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (created) return created;
    return dbPlatform.selectFrom('privacy_policy_versions')
      .selectAll()
      .where('content_hash', '=', hash)
      .executeTakeFirstOrThrow();
  }

  static async acknowledge(
    tenantId: string,
    userId: string,
    versionId: string,
    method: 'registration' | 'in_app',
    locale = 'en',
    trx?: Transaction<Database>,
  ) {
    const version = await dbPlatform.selectFrom('privacy_policy_versions')
      .select('id').where('id', '=', versionId).executeTakeFirst();
    if (!version) throw new PrivacyPolicyError(400, 'Unknown privacy policy version');

    const insert = async (tenantTrx: Transaction<Database>) => tenantTrx
      .insertInto('privacy_policy_acknowledgements')
      .values({ tenant_id: tenantId, user_id: userId, policy_version_id: versionId, acknowledgement_method: method, locale, evidence: {} })
      .onConflict(oc => oc.columns(['user_id', 'policy_version_id']).doNothing())
      .returningAll().executeTakeFirst();

    if (trx) return insert(trx);
    return withTenant(tenantId, insert);
  }

  static async status(tenantId: string, userId: string) {
    const current = await this.currentVersion();
    const acknowledgement = await withTenant(tenantId, trx => trx
      .selectFrom('privacy_policy_acknowledgements')
      .select(['id', 'acknowledged_at', 'acknowledgement_method'])
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId)
      .where('policy_version_id', '=', current.id)
      .executeTakeFirst());
    return { current, acknowledged: Boolean(acknowledgement), acknowledgement: acknowledgement ?? null };
  }
}
