import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SubdomainCheckResponse, EmailCheckResponse, JoinRequestInput, JoinRequestSubmitResponse } from '@hudumika/types';
import {
  OnboardingService,
  OnboardingError,
  validateSubdomain,
  isSubdomainAvailable,
  isEmailAvailable,
  findTenantByEmailDomain,
  createJoinRequest,
} from '../services/onboarding.service.js';
import { ActivationService } from '../services/activation.service.js';
import { IndustryRegistryService } from '../services/industry-registry.service.js';
import { dbPlatform } from '../db/client.js';
import { PaymentGateway } from '../integrations/payment-gateway.js';
import { hashPassword } from '../lib/password.js';
import { env } from '../config/env.js';
import type { JWTPayload, TenantPlan } from '@hudumika/types';

const joinRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
  tenant_id: z.string().uuid(),
});

// The one genuinely public, unauthenticated route in this file that writes
// real data (a whole new tenant) — the route previously only checked that a
// handful of fields were *present*, not that they were the right *type*.
// completeOnboarding() (onboarding.service.ts) already re-validates the
// subdomain's format/availability and the email's availability as real
// business rules, so this schema isn't duplicating that — it's the type/shape
// gate in front of it, catching e.g. a non-string company.name or a missing
// `configuration` block before either ever reaches the service.
const onboardingCompleteSchema = z.object({
  account: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(200),
  }),
  company: z.object({
    name: z.string().trim().min(1).max(200),
    industry: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
  }),
  package_code: z.string().min(1).max(50),
  billing_cycle: z.enum(['monthly', 'annual']),
  subdomain: z.string().min(1).max(63),
  payment: z.object({
    method: z.enum(['card', 'mpesa']),
    card_number: z.string().max(30).optional(),
    card_holder: z.string().max(200).optional(),
    card_expiry: z.string().max(10).optional(),
    card_cvc: z.string().max(10).optional(),
    mobile_number: z.string().max(30).optional(),
    mobile_provider: z.string().max(50).optional(),
  }),
  configuration: z.object({
    timezone: z.string().min(1).max(100),
    currency: z.string().min(1).max(10),
    hq_city: z.string().max(100).optional(),
    hq_country: z.string().max(100).optional(),
  }),
  privacy_acknowledgement: z.object({
    policy_version_id: z.string().uuid(),
    acknowledged: z.literal(true),
    locale: z.string().min(2).max(20).default('en'),
  }),
  referral_code: z.string().trim().max(63).optional(),
  onboarding_journey: z.string().max(60).optional(),
  // Standalone-product signup (e.g. "just SEAL, no Hudumika Business"):
  // package_code is 'workspace-free' and these are the commercial_products
  // product_keys to subscribe to immediately, via the same
  // addProductSubscription() every other product purchase already uses.
  initial_products: z.array(z.string().max(50)).max(10).optional(),
});

export async function onboardingRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/onboarding/industries
   * Public — returns available industry solutions for the signup industry picker.
   */
  fastify.get('/industries', async () => {
    const industries = await IndustryRegistryService.getAcceptedIndustries();
    const results = await Promise.all(industries.map(async (ind) => {
      const caps = await IndustryRegistryService.listAppCapabilities(ind.key);
      const coreApps = caps.filter(c => c.capability_key === 'core').map(c => c.app_id);
      let recommendedPackageCode: string | null = null;
      if ((ind as any).default_package_code) {
        recommendedPackageCode = (ind as any).default_package_code;
      }
      return {
        key: ind.key,
        name: ind.name,
        description: ind.description,
        core_apps: coreApps,
        recommended_package_code: recommendedPackageCode,
      };
    }));
    return { industries: results };
  });

  /**
   * GET /v1/onboarding/products
   * Public — standalone commercial products a signup can pick instead of a
   * paid base tier (package_code: 'workspace-free' + initial_products).
   * Same rows GET /v1/billing/products returns, minus any tenant-specific
   * subscription field since there's no tenant yet at this point.
   */
  fastify.get('/products', async () => {
    const products = await dbPlatform.selectFrom('commercial_products').selectAll()
      .where('standalone_purchasable', '=', true)
      .where('product_key', '!=', 'hudumika_business')
      .execute();
    const pkgCodes = products.map(p => p.default_package_code).filter((c): c is string => !!c);
    const pkgs = pkgCodes.length
      ? await dbPlatform.selectFrom('packages').select(['code', 'currency', 'price_flat_monthly', 'price_flat_annual']).where('code', 'in', pkgCodes).execute()
      : [];
    return {
      data: products.map(p => ({
        ...p,
        pricing: pkgs.find(pkg => pkg.code === p.default_package_code) ?? null,
      })),
    };
  });

  /**
   * GET /v1/onboarding/check-subdomain?value=
   * Public — no account exists yet at this point in the flow.
   */
  fastify.get('/check-subdomain', async (request, reply) => {
    const { value } = request.query as { value?: string };
    if (!value) return reply.status(400).send({ error: 'value is required' });

    const check = validateSubdomain(value);
    if (!check.ok) {
      const res: SubdomainCheckResponse = { available: false, reason: check.reason };
      return res;
    }
    const available = await isSubdomainAvailable(value);
    const res: SubdomainCheckResponse = { available, reason: available ? undefined : 'This subdomain is already taken' };
    return res;
  });

  /**
   * GET /v1/onboarding/check-email?value=
   * Public — used by step 1 before any account exists.
   */
  fastify.get('/check-email', async (request, reply) => {
    const { value } = request.query as { value?: string };
    if (!value) return reply.status(400).send({ error: 'value is required' });

    const email = value.trim().toLowerCase();
    const available = await isEmailAvailable(email);
    // Only worth resolving a domain match when the email itself is still
    // free — an already-registered address gets the plain "taken" answer,
    // not a join offer for an account it can't use anyway.
    const matched_tenant = available ? await findTenantByEmailDomain(email) : null;
    const res: EmailCheckResponse = { available, matched_tenant };
    return res;
  });

  /**
   * POST /v1/onboarding/request-join
   * Public — auto-join-by-domain's request side (380_tenant_join_requests.sql).
   * Queues a review request for the matched tenant's admins; never creates a
   * live session or a `users` row on its own.
   */
  fastify.post('/request-join', async (request, reply) => {
    const input: JoinRequestInput = joinRequestSchema.parse(request.body);
    try {
      const result: JoinRequestSubmitResponse = await createJoinRequest(input);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof OnboardingError) {
        return reply.status(err.status).send({ error: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to submit join request' });
    }
  });

  /**
   * POST /v1/onboarding/complete
   * Public — creates tenant + admin user + package + subdomain + simulated
   * payment + settings atomically, and returns a login-compatible session.
   */
  fastify.post('/complete', async (request, reply) => {
    const input = onboardingCompleteSchema.parse(request.body);

    try {
      const result = await OnboardingService.completeOnboarding(fastify, input);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof OnboardingError) {
        return reply.status(err.status).send({ error: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to complete onboarding' });
    }
  });

  /** GET /v1/onboarding/payment-status — public. Tells the signup wizard
   *  whether a real payment gateway is configured, so it knows whether to
   *  collect card/mobile details itself (simulated path) or send the
   *  customer to hosted checkout instead. */
  fastify.get('/payment-status', async () => {
    return { gateway_configured: PaymentGateway.isConfigured() };
  });

  /**
   * POST /v1/onboarding/checkout
   * Public — same validated shape as /complete, but for a signup that
   * actually needs to be paid for through a real, configured gateway.
   * Nothing about the tenant is created here: a pending_signups row is
   * staged and the customer is sent to Flutterwave's own hosted page.
   * The tenant is only created once billing-webhooks.routes.ts's
   * charge.completed handler verifies the payment and finalizes it.
   *
   * amount === 0 (e.g. workspace-free) and "no gateway configured" both
   * fall straight through to the existing synchronous /complete path —
   * there is nothing to collect through hosted checkout either way.
   */
  fastify.post('/checkout', async (request, reply) => {
    const input = onboardingCompleteSchema.parse(request.body);
    try {
      const pkg = await dbPlatform.selectFrom('packages').select(['annual_price', 'monthly_price', 'currency'])
        .where('code', '=', input.package_code).where('is_active', '=', true).executeTakeFirst();
      if (!pkg) throw new OnboardingError(400, 'Selected package is not available');
      const amount = input.billing_cycle === 'annual' ? Number(pkg.annual_price) : Number(pkg.monthly_price);

      if (amount === 0 || !PaymentGateway.isConfigured()) {
        const result = await OnboardingService.completeOnboarding(fastify, input);
        return reply.status(201).send(result);
      }

      const hashedInput = { ...input, account: { ...input.account, password: hashPassword(input.account.password) } };
      const row = await dbPlatform.insertInto('pending_signups').values({
        tx_ref: '', // filled in below once we know the row's id
        payload: JSON.stringify(hashedInput) as any,
        amount, currency: pkg.currency ?? 'TZS',
      } as any).returningAll().executeTakeFirstOrThrow();

      const txRef = `HUD-SIGNUP-${row.id}`;
      const appBase = (env.PUBLIC_APP_URL ?? env.OPS_BOARD_URL).replace(/\/$/, '');
      const { url } = await PaymentGateway.createCheckout({
        txRef, amount, currency: pkg.currency ?? 'TZS', email: input.account.email, name: input.account.name,
        redirectUrl: `${appBase}/signup/finalizing?tx_ref=${encodeURIComponent(txRef)}`,
        title: `Hudumika signup — ${input.company.name}`,
      });
      await dbPlatform.updateTable('pending_signups').set({ tx_ref: txRef, updated_at: new Date() }).where('id', '=', row.id).execute();
      return { checkout_url: url };
    } catch (err) {
      if (err instanceof OnboardingError) return reply.status(err.status).send({ error: err.message });
      fastify.log.error(err);
      return reply.status(502).send({ error: 'Could not start checkout' });
    }
  });

  /** GET /v1/onboarding/checkout-status?tx_ref=... — public. Polled by the
   *  wizard after the customer is redirected back from hosted checkout.
   *  Returns the same token/user/tenant shape as /complete once the
   *  webhook has finalized the signup, so the frontend logs the customer
   *  in exactly as it would for the simulated path. */
  fastify.get('/checkout-status', async (request, reply) => {
    const { tx_ref } = request.query as { tx_ref?: string };
    if (!tx_ref) return reply.status(400).send({ error: 'tx_ref is required' });
    const row = await dbPlatform.selectFrom('pending_signups').selectAll().where('tx_ref', '=', tx_ref).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Unknown checkout reference' });
    if (row.status !== 'completed') return { status: row.status };

    const tenant = await dbPlatform.selectFrom('tenants').selectAll().where('id', '=', row.completed_tenant_id!).executeTakeFirst();
    const admin = await dbPlatform.selectFrom('users').selectAll()
      .where('tenant_id', '=', row.completed_tenant_id!).where('role', '=', 'TENANT_ADMIN').executeTakeFirst();
    if (!tenant || !admin) return reply.status(500).send({ error: 'Signup completed but the account could not be loaded' });

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = { sub: admin.id, tenant_id: tenant.id, role: admin.role as JWTPayload['role'], email: admin.email, name: admin.name };
    const accessToken = fastify.jwt.sign(payload as any);
    return {
      status: 'completed',
      access_token: accessToken, refresh_token: accessToken, expires_in: 7 * 24 * 60 * 60,
      user: {
        id: admin.id, tenant_id: admin.tenant_id, email: admin.email, role: admin.role as JWTPayload['role'], name: admin.name,
        phone: admin.phone || undefined, location_id: admin.location_id || undefined, active: admin.active,
        created_at: admin.created_at.toISOString(), updated_at: admin.updated_at.toISOString(),
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, subdomain: tenant.subdomain || tenant.slug, plan: tenant.plan as TenantPlan },
    };
  });

  /** GET /v1/onboarding/journeys — public, pre-auth listing of available
   *  industry entry journeys for the onboarding wizard's journey picker. */
  fastify.get('/journeys', async () => {
    return ActivationService.listJourneys();
  });
}
