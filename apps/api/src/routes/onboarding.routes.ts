import type { FastifyInstance } from 'fastify';
import type { OnboardingCompleteInput, SubdomainCheckResponse, EmailCheckResponse } from '@hudumika/types';
import {
  OnboardingService,
  OnboardingError,
  validateSubdomain,
  isSubdomainAvailable,
  isEmailAvailable,
} from '../services/onboarding.service.js';

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
    const input = request.body as OnboardingCompleteInput;

    if (!input?.account?.email || !input?.account?.password || !input?.company?.name || !input?.subdomain || !input?.package_code) {
      return reply.status(400).send({ error: 'Missing required onboarding fields' });
    }
    if (input.account.password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

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
