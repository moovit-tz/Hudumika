import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SubdomainCheckResponse, EmailCheckResponse } from '@hudumika/types';
import {
  OnboardingService,
  OnboardingError,
  validateSubdomain,
  isSubdomainAvailable,
  isEmailAvailable,
} from '../services/onboarding.service.js';

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
});

export async function onboardingRoutes(fastify: FastifyInstance) {
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

    const available = await isEmailAvailable(value.trim().toLowerCase());
    const res: EmailCheckResponse = { available };
    return res;
  });

  /**
   * POST /v1/onboarding/complete
   * Public — creates tenant + admin user + package + subdomain + simulated
   * payment + settings atomically, and returns a login-compatible session.
   */
  fastify.post('/complete', async (request, reply) => {
    // Throws ZodError on a bad shape — caught by the global error handler
    // (index.ts) and turned into a clean 400 with per-field messages.
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
}
