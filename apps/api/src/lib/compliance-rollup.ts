import { withTenant } from '../db/client.js';

/**
 * Enterprise ▸ Compliance (Ondi M8) — an identity/access posture rollup:
 * how much of the tenant has completed KYC, how much has 2FA on, whether
 * the business itself is verified, and how many role grants are old enough
 * to be worth another look. Explicitly NOT ComplyOS's regulatory/licensing
 * compliance (a different product, different domain — filing deadlines and
 * legal obligations, not identity posture) — this only ever reads tables
 * Ondi itself already owns.
 */

const STALE_GRANT_DAYS = 180;

export interface ComplianceRollup {
  kyc: { verified: number; total: number; pct: number };
  mfa: { enabled: number; total: number; pct: number };
  kyb: { status: string; submitted_at: string | null };
  staleGrants: { count: number; thresholdDays: number };
  accessReviews: { completedCount: number; lastCompletedAt: string | null };
}

export async function computeComplianceRollup(tenantId: string): Promise<ComplianceRollup> {
  return withTenant(tenantId, async (trx) => {
    const users = await trx.selectFrom('users')
      .select(['id', 'kyc_status'])
      .where('tenant_id', '=', tenantId)
      .where('active', '=', true)
      .execute();
    const total = users.length;
    const verified = users.filter(u => u.kyc_status === 'approved').length;

    const totpRows = await trx.selectFrom('user_totp')
      .select('user_id')
      .where('tenant_id', '=', tenantId)
      .where('enabled', '=', true)
      .execute();
    const mfaEnabledIds = new Set(totpRows.map(r => r.user_id));
    // Someone with a passkey but no TOTP still counts as "has 2FA" — either
    // is a real second factor, not just TOTP specifically.
    const passkeyRows = await trx.selectFrom('ondi_credentials').select('user_id').where('tenant_id', '=', tenantId).execute();
    for (const r of passkeyRows) mfaEnabledIds.add(r.user_id);
    const activeIds = new Set(users.map(u => u.id));
    const mfaEnabled = [...mfaEnabledIds].filter(id => activeIds.has(id)).length;

    const kyb = await trx.selectFrom('ondi_org_kyb').select(['status', 'created_at']).where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc').executeTakeFirst();

    const staleCutoff = new Date(Date.now() - STALE_GRANT_DAYS * 24 * 60 * 60 * 1000);
    const staleGrants = await trx.selectFrom('ondi_org_role_members')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('created_at', '<', staleCutoff)
      .execute();

    const completedCampaigns = await trx.selectFrom('ondi_access_review_campaigns')
      .select(['completed_at'])
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'completed')
      .orderBy('completed_at', 'desc')
      .execute();

    return {
      kyc: { verified, total, pct: total > 0 ? Math.round((verified / total) * 100) : 0 },
      mfa: { enabled: mfaEnabled, total, pct: total > 0 ? Math.round((mfaEnabled / total) * 100) : 0 },
      kyb: { status: kyb?.status ?? 'not_started', submitted_at: kyb?.created_at?.toISOString() ?? null },
      staleGrants: { count: staleGrants.length, thresholdDays: STALE_GRANT_DAYS },
      accessReviews: {
        completedCount: completedCampaigns.length,
        lastCompletedAt: completedCampaigns[0]?.completed_at?.toISOString() ?? null,
      },
    };
  });
}
