import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import type { SubdomainCheckResponse, EmailCheckResponse, JoinRequestInput, JoinRequestSubmitResponse, OnboardingDraftPayload, OnboardingDraftSaveInput, OnboardingDraftResumeResponse } from '@hudumika/types';
import {
  OnboardingService,
  isCompanyEntityAvailable,
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
import { SIGNUP_BASE_PLAN_CODES, signupPackageAmount } from '@hudumika/types';

/**
 * Verifies a signup ticket (minted by createSignupTicketForFederatedIdentity
 * after a real Google/Microsoft/Apple sign-in with no matching user) and
 * returns the identity it carries. Shared by the account-resolution path
 * below and the onboarding-draft save/resume routes, both of which need
 * "is this really the person who verified with Ondi" with no further
 * side effects.
 */
function verifySignupTicket(
  fastify: FastifyInstance,
  ticket: string,
): { email: string; name: string } | { error: string } {
  let payload: any;
  try {
    payload = fastify.jwt.verify(ticket);
  } catch {
    return { error: 'Your sign-in verification has expired. Please sign in with Ondi again.' };
  }
  if (payload?.typ !== 'onboarding_signup' || typeof payload.email !== 'string') {
    return { error: 'Invalid sign-in verification.' };
  }
  return { email: payload.email, name: typeof payload.name === 'string' ? payload.name : '' };
}

/**
 * Full-SSO registration: when `account.ondi_ticket` is set, it's the only
 * thing trusted for this account's email/name — overwrites whatever the
 * client also sent in `account.name`/`account.email` (display copies only,
 * never the source of truth) so a tampered client value can't create an
 * account under an email Ondi never actually verified. A random,
 * never-shown password is generated so the rest of the caller (and
 * completeOnboarding()) needs no further changes — this account simply
 * never has a usable password and signs in via Ondi going forward, same as
 * any existing user who does. Mutates `account` in place; returns whether
 * the resulting password is already hashed, or an error to send verbatim.
 */
function resolveOndiSignupTicket(
  fastify: FastifyInstance,
  account: { name: string; email: string; password?: string; ondi_ticket?: string },
): { ok: true; passwordAlreadyHashed: boolean } | { ok: false; status: number; error: string } {
  if (!account.ondi_ticket) return { ok: true, passwordAlreadyHashed: false };
  const verified = verifySignupTicket(fastify, account.ondi_ticket);
  if ('error' in verified) return { ok: false, status: 401, error: verified.error };
  account.email = verified.email;
  account.name = verified.name || account.name;
  account.password = hashPassword(crypto.randomBytes(32).toString('hex'));
  return { ok: true, passwordAlreadyHashed: true };
}

const onboardingDraftPayloadSchema = z.object({
  companyName: z.string().trim().max(200).optional(),
  industry: z.string().max(100).optional(),
  industries: z.array(z.string().max(100)).max(30).optional(),
  country: z.string().max(100).optional(),
  onboarding_journey: z.string().max(60).optional(),
  package_code: z.string().max(50).optional(),
  billing_cycle: z.enum(['monthly', 'annual']).optional(),
  initial_products: z.array(z.string().max(50)).max(10).optional(),
  subdomain: z.string().max(63).optional(),
  timezone: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  hq_city: z.string().max(100).optional(),
  hq_country: z.string().max(100).optional(),
}).strict();

const onboardingDraftSaveSchema = z.object({
  ondi_ticket: z.string().min(1).max(4000),
  step: z.number().int().min(1).max(6),
  draft: onboardingDraftPayloadSchema,
});

const onboardingDraftResumeSchema = z.object({ ondi_ticket: z.string().min(1).max(4000) });

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
    // Exactly one of these — full-SSO registration (ondi_ticket, verified
    // by a real Ondi OAuth sign-in with no existing account) or the legacy
    // password path. Checked below, not here, so the error message can
    // name which one is missing rather than zod's generic union failure.
    password: z.string().min(8).max(200).optional(),
    ondi_ticket: z.string().min(1).max(4000).optional(),
  }).refine(v => !!v.password !== !!v.ondi_ticket, {
    message: 'Provide exactly one of password or ondi_ticket.',
  }),
  company: z.object({
    name: z.string().trim().min(1).max(200),
    industry: z.string().max(100).optional(),
    industries: z.array(z.string().max(100)).max(30).optional(),
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

const DEFAULT_INDUSTRY_CORE_APPS: Record<string, string[]> = {
  retail: ['pos', 'inventory', 'sales'],
  wholesale: ['inventory', 'procurement', 'warehouse'],
  ecommerce: ['inventory', 'pos', 'sales'],
  manufacturing: ['inventory', 'manufacturing', 'procurement'],
  food_beverage: ['inventory', 'manufacturing', 'procurement'],
  printing: ['inventory', 'procurement', 'manufacturing'],
  warehousing: ['seal', 'inventory', 'warehouse'],
  professional_services: ['projects', 'timesheet', 'finance'],
  consulting: ['projects', 'timesheet', 'finance'],
  construction: ['projects', 'procurement', 'finance'],
  property: ['property', 'billing', 'finance'],
  automotive: ['gereji', 'inventory', 'fleet'],
  hospitality: ['pos', 'hospitality', 'finance'],
  restaurant: ['pos', 'inventory', 'procurement'],
  education: ['education', 'billing', 'finance'],
  insurance: ['insurance', 'billing', 'finance'],
  lending: ['lending', 'billing', 'finance'],
  logistics: ['cargotracker', 'clearos', 'tuma', 'fleet'],
  legal: ['lexcore', 'billing', 'documents'],
  privacy: ['ngao', 'compliance', 'documents'],
};

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
      const effectiveCoreApps = coreApps.length > 0 ? coreApps : (DEFAULT_INDUSTRY_CORE_APPS[ind.key] ?? []);
      let recommendedPackageCode: string | null = null;
      const configuredCode = (ind as typeof ind & { default_package_code?: string | null }).default_package_code;
      if (configuredCode && SIGNUP_BASE_PLAN_CODES.includes(configuredCode)) {
        recommendedPackageCode = configuredCode;
      } else if (['construction', 'insurance', 'lending'].includes(ind.key)) {
        recommendedPackageCode = 'scale-tzs';
      } else if (['retail', 'ecommerce', 'restaurant', 'professional_services', 'consulting'].includes(ind.key)) {
        recommendedPackageCode = 'starter-tzs';
      } else {
        recommendedPackageCode = 'business-tzs';
      }
      return {
        key: ind.key,
        name: ind.name,
        description: ind.description,
        core_apps: effectiveCoreApps,
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
    if (input.package_code !== 'workspace-free' && !SIGNUP_BASE_PLAN_CODES.includes(input.package_code)) {
      return reply.status(400).send({ error: 'Select an available base plan or standalone product.' });
    }

    const ticket = resolveOndiSignupTicket(fastify, input.account);
    if (!ticket.ok) return reply.status(ticket.status).send({ error: ticket.error });

    try {
      const result = await OnboardingService.completeOnboarding(fastify, input as any, { passwordAlreadyHashed: ticket.passwordAlreadyHashed });
      // Setup finished — any saved draft for this email is done serving its
      // purpose. Best-effort: a failure here never blocks the response, the
      // row just lingers until a later /draft/save or /draft/resume for a
      // new, unrelated signup under the same email overwrites/misses it.
      dbPlatform.deleteFrom('onboarding_drafts').where('email', '=', input.account.email).execute().catch(() => {});
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof OnboardingError) {
        return reply.status(err.status).send({ error: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to complete onboarding' });
    }
  });

  /**
   * POST /v1/onboarding/draft/save
   * Public — requires a valid ondi_ticket (proves the caller really is the
   * person who just verified with Ondi, not an arbitrary email). Upserts
   * this signup's in-progress, non-sensitive setup state so closing the
   * tab or the ticket simply expiring doesn't lose it — see migration 715.
   */
  fastify.post('/draft/save', async (request, reply) => {
    const input: OnboardingDraftSaveInput = onboardingDraftSaveSchema.parse(request.body);
    const verified = verifySignupTicket(fastify, input.ondi_ticket);
    if ('error' in verified) return reply.status(401).send({ error: verified.error });
    await dbPlatform.insertInto('onboarding_drafts')
      .values({ email: verified.email, payload: JSON.stringify(input.draft) as any, step: input.step })
      .onConflict(oc => oc.column('email').doUpdateSet({
        payload: JSON.stringify(input.draft) as any,
        step: input.step,
        updated_at: new Date(),
      }))
      .execute();
    return reply.status(204).send();
  });

  /**
   * POST /v1/onboarding/draft/resume
   * Public — same ticket-proves-identity shape as /draft/save. Called right
   * after a fresh Ondi verification, before the wizard shows step 2, so an
   * abandoned signup picks back up instead of starting over.
   */
  fastify.post('/check-company', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = z.object({ ondi_ticket: z.string().max(8192).optional(), name: z.string().trim().min(2).max(200), country: z.string().max(100) }).parse(request.body);
    // Email-first signup has no Ondi ticket yet. Like check-email and
    // check-subdomain, this rate-limited endpoint exposes only availability.
    if (input.ondi_ticket) {
      const verified = verifySignupTicket(fastify, input.ondi_ticket);
      if ('error' in verified) return reply.status(401).send({ error: verified.error });
    }
    return { available: await isCompanyEntityAvailable(input.name, input.country) };
  });

  fastify.post('/draft/resume', async (request, reply) => {
    const { ondi_ticket } = onboardingDraftResumeSchema.parse(request.body);
    const verified = verifySignupTicket(fastify, ondi_ticket);
    if ('error' in verified) return reply.status(401).send({ error: verified.error });
    const row = await dbPlatform.selectFrom('onboarding_drafts').selectAll().where('email', '=', verified.email).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'No saved setup found.' });
    const res: OnboardingDraftResumeResponse = { step: row.step, draft: row.payload as OnboardingDraftPayload };
    return res;
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
    if (input.package_code !== 'workspace-free' && !SIGNUP_BASE_PLAN_CODES.includes(input.package_code)) {
      return reply.status(400).send({ error: 'Select an available base plan or standalone product.' });
    }
    const ticket = resolveOndiSignupTicket(fastify, input.account);
    if (!ticket.ok) return reply.status(ticket.status).send({ error: ticket.error });
    try {
      const pkg = await dbPlatform.selectFrom('packages')
        .select(['annual_price', 'monthly_price', 'price_flat_monthly', 'price_flat_annual', 'currency'])
        .where('code', '=', input.package_code).where('is_active', '=', true).executeTakeFirst();
      if (!pkg) throw new OnboardingError(400, 'Selected package is not available');
      const amount = signupPackageAmount(pkg, input.billing_cycle);

      if (amount === 0 || !PaymentGateway.isConfigured()) {
        const result = await OnboardingService.completeOnboarding(fastify, input as any, { passwordAlreadyHashed: ticket.passwordAlreadyHashed });
        return reply.status(201).send(result);
      }

      // Ondi-ticket signups never reach hosted checkout in practice today
      // (full-SSO registration is wired up for the free/simulated path the
      // wizard actually uses), but handle it correctly regardless: don't
      // re-hash a password the ticket already hashed.
      const hashedInput = {
        ...input,
        account: {
          ...input.account,
          password: ticket.passwordAlreadyHashed ? input.account.password! : hashPassword(input.account.password!),
        },
      };
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
