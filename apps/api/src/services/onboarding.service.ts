import { sql } from 'kysely';
import crypto from 'crypto';
import { dbPlatform } from '../db/client.js';
import { hashPassword } from '../lib/password.js';
import { PaymentsIntegration } from '../integrations/payments.js';
import { GLService } from './gl.service.js';
import { DefaultWorkflowService } from './default-workflow.service.js';
import { computeAndRecordCommission } from './referral.service.js';
import { NotificationService } from './notification.service.js';
import { MailService } from './mail.service.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { enforcePasswordPolicy } from '../lib/password-policy.js';
import { PERSONAL_EMAIL_DOMAINS, type MatchedTenant, type JoinRequestInput, type JoinRequestSubmitResponse } from '@hudumika/types';
import type { OnboardingCompleteInput, OnboardingCompleteResponse, TenantPlan, JWTPayload } from '@hudumika/types';
import type { FastifyInstance } from 'fastify';

const PERSONAL_EMAIL_DOMAIN_SET = new Set(PERSONAL_EMAIL_DOMAINS);

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * Auto-join-by-domain: does an existing, active tenant already have real,
 * active staff on this same email domain? Personal-provider domains
 * (gmail.com etc.) never count as a match — they don't identify a company.
 * Matched against `users.email` directly (no schema for tenants to declare
 * their domain up front) so this reflects who's *actually* there, not a
 * self-reported claim.
 */
export async function findTenantByEmailDomain(email: string): Promise<MatchedTenant | null> {
  const domain = domainOf(email);
  if (!domain || PERSONAL_EMAIL_DOMAIN_SET.has(domain)) return null;

  const row = await dbPlatform.selectFrom('users as u')
    .innerJoin('tenants as t', 't.id', 'u.tenant_id')
    .select(['t.id', 't.name', 't.subdomain', 't.slug'])
    .where('u.active', '=', true)
    .where('t.active', '=', true)
    .where(sql<boolean>`lower(split_part(u.email, '@', 2)) = ${domain}`)
    .orderBy('t.created_at', 'asc')
    .executeTakeFirst();

  return row ? { id: row.id, name: row.name, subdomain: row.subdomain || row.slug } : null;
}

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'mail', 'static', 'assets', 'cdn',
  'superadmin', 'support', 'help', 'blog', 'docs', 'status',
]);

export class OnboardingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function slugifyBase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'company';
}

/** Generates a slug unique against tenants.slug, appending -2, -3, ... on collision. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyBase(name);
  let candidate = base;
  let n = 2;
  while (await dbPlatform.selectFrom('tenants').select('id').where('slug', '=', candidate).executeTakeFirst()) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

export function validateSubdomain(value: string): { ok: boolean; reason?: string } {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) {
    return { ok: false, reason: 'Must be 3-63 characters: lowercase letters, numbers, and hyphens only' };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { ok: false, reason: 'This subdomain is reserved' };
  }
  return { ok: true };
}

export async function isSubdomainAvailable(value: string): Promise<boolean> {
  const existing = await dbPlatform.selectFrom('tenants').select('id').where('subdomain', '=', value).executeTakeFirst();
  return !existing;
}

export async function isEmailAvailable(email: string): Promise<boolean> {
  const existing = await dbPlatform.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return !existing;
}

/**
 * Auto-join-by-domain, request side. Deliberately NOT a silent auto-join —
 * this only ever queues a request a tenant admin has to actually approve
 * (see 380_tenant_join_requests.sql's header). Runs entirely on `dbPlatform`
 * like the rest of this file: there is no tenant session to open yet, the
 * requester isn't a member of anything until an admin says so.
 */
export async function createJoinRequest(input: JoinRequestInput): Promise<JoinRequestSubmitResponse> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!name) throw new OnboardingError(400, 'Full name is required');
  if (!input.password || input.password.length < 8) {
    throw new OnboardingError(400, 'Password must be at least 8 characters');
  }
  if (!(await isEmailAvailable(email))) {
    throw new OnboardingError(409, 'An account with this email already exists');
  }

  // Re-derive the match from the email's own domain — the client-supplied
  // tenant_id is just the hint the UI already showed the requester, never
  // trusted on its own to decide whose queue this lands in.
  const matched = await findTenantByEmailDomain(email);
  if (!matched || matched.id !== input.tenant_id) {
    throw new OnboardingError(400, 'No matching workspace found for this email domain.');
  }

  // The target tenant's own password policy (Ondi ▸ Policies), not just the
  // 8-char floor above — a request that lands in a tenant with a stricter
  // policy configured must be held to it, same as every other password-set
  // path in auth.routes.ts.
  const policyCheck = await enforcePasswordPolicy(matched.id, input.password);
  if (!policyCheck.ok) {
    throw new OnboardingError(400, policyCheck.reason);
  }

  return submitJoinRequest(matched, name, email, hashPassword(input.password));
}

/**
 * Google/Microsoft sign-in on Ondi's own login (OndiLogin.tsx), for an email
 * with no active user yet. Deliberately narrower than the full onboarding
 * wizard: it can only ever land someone in an *existing* tenant whose real
 * staff already share this email's domain (findTenantByEmailDomain) — there
 * is no company name/subdomain/plan/payment to hand it a brand-new tenant
 * to create, and a federated identity is exactly as unverified as a typed
 * one for deciding that. `null` means no match, so the caller can send the
 * visitor to full signup instead — never a silent tenant creation.
 *
 * No password policy check: there is no user-supplied password to check —
 * the account is created sign-in-by-Google-only, secured by a random hash
 * nobody, including the eventual admin who approves it, ever sees or needs.
 * `enforcePasswordPolicy`'s complexity rules exist to keep a *typed*
 * password strong; they have nothing to check here.
 */
export async function createJoinRequestForFederatedIdentity(
  name: string, email: string,
): Promise<JoinRequestSubmitResponse | null> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim() || cleanEmail.split('@')[0];
  if (!(await isEmailAvailable(cleanEmail))) return null;

  const matched = await findTenantByEmailDomain(cleanEmail);
  if (!matched) return null;

  const randomPasswordHash = hashPassword(crypto.randomUUID() + crypto.randomUUID());
  return submitJoinRequest(matched, cleanName, cleanEmail, randomPasswordHash);
}

/** Shared by createJoinRequest and createJoinRequestForFederatedIdentity —
 *  the actual queue insert plus the admin notification (in-app + email).
 *  See createJoinRequest's own header for why this is a reviewed request,
 *  never a silent auto-join, regardless of which caller reached it. */
async function submitJoinRequest(
  matched: MatchedTenant, name: string, email: string, passwordHash: string,
): Promise<JoinRequestSubmitResponse> {
  let created;
  try {
    created = await dbPlatform.insertInto('tenant_join_requests').values({
      tenant_id: matched.id,
      name,
      email,
      password_hash: passwordHash,
    }).returningAll().executeTakeFirstOrThrow();
  } catch (err: any) {
    if (String(err.message || '').includes('idx_tenant_join_requests_pending_email')) {
      throw new OnboardingError(409, 'A join request for this email is already pending review.');
    }
    throw err;
  }

  // Same MGMT-role convention as comply-renewal.job.ts's notifyComplyManagers
  // — every admin-capable user in the target tenant hears about it, in-app
  // and by email. ondi_org_access_requests (the closest existing precedent
  // for a request/approve queue) ships with no notification at all;
  // deliberately not repeating that gap here.
  const admins = await dbPlatform.selectFrom('users')
    .select(['id', 'email'])
    .where('tenant_id', '=', matched.id)
    .where('role', 'in', ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'])
    .where('active', '=', true)
    .execute();

  await recordAuthEvent(matched.id, null, 'join_request_submitted', {
    metadata: { request_id: created.id, email, requester_name: name },
  });

  const link = '/ondi/users?tab=join-requests';
  await Promise.all(admins.map(async (a) => {
    await NotificationService.createNotification({
      tenantId: matched.id, userId: a.id, app: 'ondi', type: 'join_request',
      title: 'New workspace join request',
      message: `${name} (${email}) wants to join ${matched.name}.`,
      link, entityType: 'tenant_join_request', entityId: created.id, entityLabel: email,
    });
    await MailService.enqueueTemplated(matched.id, 'onboarding.join_request', a.email, {
      requesterName: name, requesterEmail: email, tenantName: matched.name, link,
    }, 'onboarding').catch(() => {});
  }));

  return { success: true, tenant_name: matched.name };
}

export class OnboardingService {
  static async completeOnboarding(
    fastify: FastifyInstance,
    input: OnboardingCompleteInput
  ): Promise<OnboardingCompleteResponse> {
    const email = input.account.email.trim().toLowerCase();

    if (!(await isEmailAvailable(email))) {
      throw new OnboardingError(409, 'An account with this email already exists');
    }

    const subCheck = validateSubdomain(input.subdomain);
    if (!subCheck.ok) {
      throw new OnboardingError(400, subCheck.reason || 'Invalid subdomain');
    }
    if (!(await isSubdomainAvailable(input.subdomain))) {
      throw new OnboardingError(409, 'This subdomain is already taken');
    }

    const pkg = await dbPlatform.selectFrom('packages').selectAll()
      .where('code', '=', input.package_code)
      .where('is_active', '=', true)
      .executeTakeFirst();
    if (!pkg) {
      throw new OnboardingError(400, 'Selected package is not available');
    }

    const amount = input.billing_cycle === 'annual' ? Number(pkg.annual_price) : Number(pkg.monthly_price);

    const charge = PaymentsIntegration.simulateCharge(amount, input.payment);
    if (!charge.success) {
      throw new OnboardingError(402, charge.error || 'Payment was declined');
    }

    // A stale or mistyped ?ref= link is never a signup error — it's just
    // silently not a referral. Resolved against a real, active tenant's
    // slug only; matched here rather than trusted from the client.
    let referredByTenantId: string | null = null;
    if (input.referral_code) {
      const referrer = await dbPlatform.selectFrom('tenants').select('id')
        .where('slug', '=', input.referral_code.trim().toLowerCase())
        .where('active', '=', true)
        .executeTakeFirst();
      referredByTenantId = referrer?.id ?? null;
    }

    const now = new Date();
    const slug = await uniqueSlug(input.company.name);

    const { tenant, admin } = await dbPlatform.transaction().execute(async (trx) => {
      const founderDomain = domainOf(email);
      const tenant = await trx.insertInto('tenants').values({
        name: input.company.name,
        slug,
        subdomain: input.subdomain,
        plan: pkg.code as TenantPlan,
        active: true,
        referred_by_tenant_id: referredByTenantId,
        founder_personal_email_domain: founderDomain && PERSONAL_EMAIL_DOMAIN_SET.has(founderDomain) ? founderDomain : null,
        created_at: now,
        updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      await sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`.execute(trx);

      await GLService.seedChartOfAccounts(trx, tenant.id);

      const admin = await trx.insertInto('users').values({
        tenant_id: tenant.id,
        email,
        password_hash: hashPassword(input.account.password),
        role: 'TENANT_ADMIN',
        name: input.account.name,
        active: true,
        created_at: now,
        updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      // Every new tenant starts with the platform default workflows (Sea/Air/
      // Road/Sea-transit) — same footing as the seeded chart of accounts above.
      await DefaultWorkflowService.seedForTenant(trx, tenant.id, admin.id);

      if (input.configuration.hq_city) {
        await trx.insertInto('locations').values({
          tenant_id: tenant.id,
          name: 'Head Office',
          code: 'HQ',
          type: 'OFFICE',
          city: input.configuration.hq_city,
          country: input.configuration.hq_country ?? '',
          created_at: now,
        }).execute();
      }

      await trx.insertInto('tenant_settings').values({
        tenant_id: tenant.id,
        settings: JSON.stringify({
          timezone: input.configuration.timezone,
          currency: input.configuration.currency,
        }),
        created_at: now,
        updated_at: now,
      }).execute();

      await trx.insertInto('platform_transactions').values({
        tenant_id: tenant.id,
        package_code: pkg.code,
        billing_cycle: input.billing_cycle,
        amount,
        currency: 'USD',
        method: input.payment.method,
        status: 'completed',
        tx_ref: charge.tx_ref,
        payer_name: input.payment.card_holder ?? input.account.name,
        card_last4: input.payment.card_number ? input.payment.card_number.replace(/\s/g, '').slice(-4) : null,
        mobile_number: input.payment.mobile_number ?? null,
        created_at: now,
      }).execute();

      return { tenant, admin };
    });

    if (referredByTenantId) {
      // Referral tracking must never block a real signup that already
      // succeeded — a commission that fails to record is a bug to fix, not
      // a reason to fail the account creation that already happened.
      computeAndRecordCommission(tenant.id, amount, 'USD', charge.tx_ref, input.payment.mobile_number ?? null)
        .catch(err => fastify.log.error(err, 'Failed to record referral commission'));
    }

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: admin.id,
      tenant_id: tenant.id,
      role: admin.role as JWTPayload['role'],
      email: admin.email,
      name: admin.name,
    };
    const accessToken = fastify.jwt.sign(payload as any);

    return {
      access_token: accessToken,
      refresh_token: accessToken,
      expires_in: 7 * 24 * 60 * 60,
      user: {
        id: admin.id,
        tenant_id: admin.tenant_id,
        email: admin.email,
        role: admin.role as JWTPayload['role'],
        name: admin.name,
        phone: admin.phone || undefined,
        location_id: admin.location_id || undefined,
        active: admin.active,
        created_at: admin.created_at.toISOString(),
        updated_at: admin.updated_at.toISOString(),
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subdomain: tenant.subdomain || tenant.slug,
        plan: tenant.plan as TenantPlan,
      },
    };
  }
}
