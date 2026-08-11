import { sql } from 'kysely';
import { db } from '../db/client.js';
import { hashPassword } from '../lib/password.js';
import { PaymentsIntegration } from '../integrations/payments.js';
import { GLService } from './gl.service.js';
import { DefaultWorkflowService } from './default-workflow.service.js';
import type { OnboardingCompleteInput, OnboardingCompleteResponse, TenantPlan, JWTPayload } from '@hudumika/types';
import type { FastifyInstance } from 'fastify';

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
  while (await db.selectFrom('tenants').select('id').where('slug', '=', candidate).executeTakeFirst()) {
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
  const existing = await db.selectFrom('tenants').select('id').where('subdomain', '=', value).executeTakeFirst();
  return !existing;
}

export async function isEmailAvailable(email: string): Promise<boolean> {
  const existing = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
  return !existing;
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

    const pkg = await db.selectFrom('packages').selectAll()
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

    const now = new Date();
    const slug = await uniqueSlug(input.company.name);

    const { tenant, admin } = await db.transaction().execute(async (trx) => {
      const tenant = await trx.insertInto('tenants').values({
        name: input.company.name,
        slug,
        subdomain: input.subdomain,
        plan: pkg.code as TenantPlan,
        active: true,
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
