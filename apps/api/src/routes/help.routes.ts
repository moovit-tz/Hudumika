import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  INTERACTIVE_TOURS,
  GETTING_STARTED_PHASES,
} from '../services/help-catalog.service.js';

const progressUpdateSchema = z.object({
  completedTourId: z.string().optional(),
  completedStepId: z.string().optional(),
  dismissedTourId: z.string().optional(),
});

export async function helpRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/help/categories
   * List all Help Centre categories filtered by audience/role.
   */
  fastify.get('/categories', async (request) => {
    const userRole = request.user.role;
    const isCustomer = userRole === 'CUSTOMER' || userRole === 'ORG';

    const categories = HELP_CATEGORIES.filter((c) => {
      if (isCustomer) return c.audiences.includes('customers') || c.audiences.includes('all');
      return true;
    });

    return { categories };
  });

  /**
   * GET /v1/help/articles
   * List or search Help Centre articles.
   */
  fastify.get<{
    Querystring: { category?: string; query?: string; appId?: string };
  }>('/articles', async (request) => {
    const { category, query, appId } = request.query;
    const userRole = request.user.role;
    const isCustomer = userRole === 'CUSTOMER' || userRole === 'ORG';

    let articles = HELP_ARTICLES.filter((a) => {
      if (isCustomer && a.audience === 'admins') return false;
      if (category && a.category !== category) return false;
      if (appId && a.appId !== appId) return false;
      return true;
    });

    if (query && query.trim().length > 0) {
      const q = query.toLowerCase().trim();
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    return { articles };
  });

  /**
   * GET /v1/help/articles/:slug
   * Retrieve a single help article by slug.
   */
  fastify.get<{ Params: { slug: string } }>('/articles/:slug', async (request, reply) => {
    const { slug } = request.params;
    const article = HELP_ARTICLES.find((a) => a.slug === slug);
    if (!article) {
      return reply.status(404).send({ error: 'Article not found' });
    }
    return { article };
  });

  /**
   * GET /v1/help/tours
   * List available interactive tours.
   */
  fastify.get<{ Querystring: { appId?: string } }>('/tours', async (request) => {
    const { appId } = request.query;
    let tours = INTERACTIVE_TOURS;
    if (appId) {
      tours = tours.filter((t) => t.appId === appId);
    }
    return { tours };
  });

  /**
   * GET /v1/help/getting-started
   * Return personalized getting started phases with verified workspace completion signals.
   */
  fastify.get('/getting-started', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [usersCount, taxCodesCount, customersCount, shipmentsCount, progressRow] = await Promise.all([
        trx.selectFrom('users').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('tax_codes').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('customers').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('shipment_cases').select(({ fn }) => fn.countAll<number>().as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('user_tour_progress')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('user_id', '=', user.sub)
          .executeTakeFirst(),
      ]);

      const signals: Record<string, boolean> = {
        foundation: Number(usersCount?.c ?? 0) > 1,
        invite_team: Number(usersCount?.c ?? 0) > 1,
        finance: Number(taxCodesCount?.c ?? 0) > 0,
        first_invoice: Number(taxCodesCount?.c ?? 0) > 0,
        first_customer: Number(customersCount?.c ?? 0) > 0,
        first_shipment: Number(shipmentsCount?.c ?? 0) > 0,
      };

      const completedStepIds = (progressRow?.completed_step_ids as string[]) || [];

      const phases = GETTING_STARTED_PHASES.map((phase) => ({
        ...phase,
        steps: phase.steps.map((step) => {
          const isDone = (step.signalKey && signals[step.signalKey]) || completedStepIds.includes(step.id);
          return {
            ...step,
            completed: Boolean(isDone),
          };
        }),
      }));

      return {
        phases,
        progress: {
          completedTourIds: (progressRow?.completed_tour_ids as string[]) || [],
          completedStepIds,
          dismissedTourIds: (progressRow?.dismissed_tour_ids as string[]) || [],
        },
      };
    });
  });

  /**
   * POST /v1/help/progress
   * Update tour and step completion progress for the current user.
   */
  fastify.post('/progress', async (request) => {
    const user = request.user;
    const body = progressUpdateSchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('user_tour_progress')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .executeTakeFirst();

      const completedTours = new Set<string>((existing?.completed_tour_ids as string[]) || []);
      const completedSteps = new Set<string>((existing?.completed_step_ids as string[]) || []);
      const dismissedTours = new Set<string>((existing?.dismissed_tour_ids as string[]) || []);

      if (body.completedTourId) completedTours.add(body.completedTourId);
      if (body.completedStepId) completedSteps.add(body.completedStepId);
      if (body.dismissedTourId) dismissedTours.add(body.dismissedTourId);

      if (existing) {
        await trx.updateTable('user_tour_progress')
          .set({
            completed_tour_ids: Array.from(completedTours),
            completed_step_ids: Array.from(completedSteps),
            dismissed_tour_ids: Array.from(dismissedTours),
            updated_at: new Date(),
          })
          .where('tenant_id', '=', user.tenant_id)
          .where('user_id', '=', user.sub)
          .execute();
      } else {
        await trx.insertInto('user_tour_progress')
          .values({
            tenant_id: user.tenant_id,
            user_id: user.sub,
            completed_tour_ids: Array.from(completedTours),
            completed_step_ids: Array.from(completedSteps),
            dismissed_tour_ids: Array.from(dismissedTours),
          })
          .execute();
      }

      return {
        success: true,
        completedTourIds: Array.from(completedTours),
        completedStepIds: Array.from(completedSteps),
      };
    });
  });
}
