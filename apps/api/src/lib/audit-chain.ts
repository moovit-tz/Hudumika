import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { dispatchSiemExport } from './siem-export.js';

/**
 * Ondi's tamper-evident audit log (M3) — ported from ondi-mvp's
 * plugins/audit.ts. Chain invariant:
 *
 *   event_hash = SHA-256(id | tenant_id | event_type | user_id | JSON(metadata) | prev_hash)
 *
 * Chained per tenant (the branch's original chains globally across every
 * entity in one Postgres instance; this platform's RLS already scopes every
 * `withTenant()` query to one tenant, so "the most recent event" naturally
 * means "the most recent event in this tenant" — a cleaner fit than a
 * single cross-tenant chain would be, not a weaker one). Any edit to a past
 * row breaks every hash after it; verifyAuditChain() below proves that.
 *
 * Scoped down from the branch's full action taxonomy (which also covers
 * KYC/KYB/loans/vault — none of which exist in this platform yet) to only
 * events Ondi M1-M3 actually produce. Every event recorded here also fans
 * out to a tenant's configured SIEM webhook, if any — see siem-export.ts.
 */
export type OndiEventType =
  | 'login_success' | 'login_failed'
  | 'otp_issued' | 'otp_verified'
  | 'totp_verified'
  | 'magic_link_requested' | 'magic_link_login'
  | 'passkey_added' | 'passkey_removed' | 'passkey_login'
  | 'google_login' | 'microsoft_login' | 'saml_login'
  | 'device_renamed' | 'session_revoked'
  | 'access_denied'
  | 'kyc_submitted' | 'kyc_approved' | 'kyc_rejected'
  | 'kyb_submitted' | 'kyb_verified' | 'kyb_rejected'
  | 'org_role_created' | 'org_role_deleted' | 'org_role_granted' | 'org_role_revoked'
  | 'access_request_submitted' | 'access_request_approved' | 'access_request_denied'
  | 'password_changed' | 'email_changed'
  | 'oauth_consent_revoked' | 'account_deactivation_requested'
  | 'wallet_item_added' | 'wallet_item_viewed' | 'wallet_item_updated' | 'wallet_item_deleted'
  | 'wallet_item_shared' | 'wallet_item_share_revoked'
  | 'recovery_contact_added' | 'recovery_contact_responded' | 'recovery_contact_removed'
  | 'recovery_requested' | 'recovery_request_approved' | 'recovery_request_declined'
  | 'recovery_request_cancelled' | 'recovery_completed'
  | 'org_group_created' | 'org_group_deleted' | 'org_group_updated'
  | 'org_group_member_added' | 'org_group_member_removed'
  | 'org_group_role_attached' | 'org_group_role_detached' | 'org_group_recalculated'
  | 'access_review_campaign_started' | 'access_review_campaign_completed'
  | 'access_review_item_approved' | 'access_review_item_revoked';

/** Postgres jsonb does not preserve object key insertion order — it's a
 *  storage format, not the original text (unlike the `json` type). Metadata
 *  written with keys in one order can read back in a different one, which
 *  would silently break every hash below it if the hash were computed over
 *  a plain JSON.stringify. Sorting keys recursively before stringifying
 *  makes the hash depend only on the actual key/value content, stable
 *  across the write → jsonb → read round trip. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

function computeEventHash(params: {
  id: string; tenantId: string; eventType: string; userId: string | null;
  metadata: unknown; prevHash: string | null;
}): string {
  const payload = [
    params.id, params.tenantId, params.eventType, params.userId ?? '',
    stableStringify(params.metadata ?? null), params.prevHash ?? 'GENESIS',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/** Never throws — an audit-trail failure must not block the auth flow it's
 *  recording, same principle as recordLogin() in auth.routes.ts. */
export async function recordAuthEvent(
  tenantId: string,
  userId: string | null,
  eventType: OndiEventType,
  opts: { ip?: string; userAgent?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await withTenant(tenantId, async (trx) => {
      const last = await trx.selectFrom('ondi_auth_events')
        .select('event_hash').orderBy('created_at', 'desc').limit(1).executeTakeFirst();

      const id = crypto.randomUUID();
      const eventHash = computeEventHash({
        id, tenantId, eventType, userId, metadata: opts.metadata, prevHash: last?.event_hash ?? null,
      });

      await trx.insertInto('ondi_auth_events').values({
        id, tenant_id: tenantId, user_id: userId, event_type: eventType,
        ip: opts.ip ?? null, user_agent: opts.userAgent ?? null,
        metadata: JSON.stringify(opts.metadata ?? {}),
        prev_hash: last?.event_hash ?? null, event_hash: eventHash,
      }).execute();

      // Not awaited — dispatchSiemExport handles its own errors and must
      // never add latency to (or block) the auth flow being recorded.
      dispatchSiemExport(tenantId, { id, eventType, userId, metadata: opts.metadata ?? {}, createdAt: new Date().toISOString() });
    });
  } catch { /* audit trail must never block the auth flow it's recording */ }
}

/** Walks the chain oldest → newest, recomputing each hash — proves nothing
 *  in this tenant's chain has been altered after the fact. */
export async function verifyAuditChain(tenantId: string, limit = 10_000): Promise<{ valid: boolean; broken_at?: string; checked: number }> {
  return withTenant(tenantId, async (trx) => {
    const entries = await trx.selectFrom('ondi_auth_events')
      .select(['id', 'tenant_id', 'event_type', 'user_id', 'metadata', 'prev_hash', 'event_hash'])
      .orderBy('created_at', 'asc').limit(limit).execute();

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const expected = computeEventHash({
        id: e.id, tenantId: e.tenant_id, eventType: e.event_type, userId: e.user_id,
        metadata: e.metadata, prevHash: e.prev_hash,
      });
      if (expected !== e.event_hash) return { valid: false, broken_at: e.id, checked: i + 1 };
    }
    return { valid: true, checked: entries.length };
  });
}
