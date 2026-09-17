import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSAnalyticsService } from '../services/cms-analytics.service.js';
import type { CmsAnalyticsResourceType } from '@hudumika/types';

const RESOURCE_TYPES: CmsAnalyticsResourceType[] = ['page', 'post', 'entry'];
const beaconSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
});

/**
 * §33 of the CMS master brief — Analytics. See cms-analytics.service.ts's
 * own header for the storage design; this file is just the thin HTTP
 * surface over it — a public beacon (no auth, the visitor is never
 * signed in) and two authenticated read routes for the admin side.
 */
export async function cmsAnalyticsRoutes(fastify: FastifyInstance) {
  // ── Public: the beacon a page/post/entry view fires on mount
  // (OneSitePublic.tsx). Always returns { ok: true } even when the
  // resource_id is stale/fabricated — see recordView's own comment on
  // why that's not worth guarding against. ──
  fastify.post('/public/:tenantSlug/pageview', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const body = beaconSchema.parse(request.body);
    const ok = await CMSAnalyticsService.recordView(tenantSlug, body.resource_type, body.resource_id);
    if (!ok) return reply.status(404).send({ error: 'Site not found.' });
    return { ok: true };
  });

  // ── Tenant (authenticated) routes ────────────────────────────────────────
  // View counts are informational, not a content-editing capability, so
  // this stays gated at authenticated + entitled + non-CUSTOMER only —
  // the same posture cms.routes.ts's own '/v1/cms/ai' prefix already
  // takes for a similar "reads/returns data, changes nothing" surface —
  // rather than adding a fourth per-resource-type area check on top of
  // pages/posts/content's own existing view/manage/publish gates.
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    if (url && url.startsWith('/v1/cms/analytics')) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      await requireEntitlement('onesite')(request, reply);
      if (reply.sent) return;
      if (request.user.role === 'CUSTOMER') {
        return reply.status(403).send({ error: 'Not available for this account type.' });
      }
    }
  });

  // GET /v1/cms/analytics/:resourceType/:resourceId — one resource's own
  // total + last-30-days breakdown.
  fastify.get('/analytics/:resourceType/:resourceId', async (request: any, reply) => {
    const { resourceType, resourceId } = request.params as { resourceType: string; resourceId: string };
    if (!RESOURCE_TYPES.includes(resourceType as CmsAnalyticsResourceType)) {
      return reply.status(400).send({ error: 'Unknown resource type.' });
    }
    return CMSAnalyticsService.getSummary(request.user.tenant_id, resourceType as CmsAnalyticsResourceType, resourceId);
  });

  // GET /v1/cms/analytics/:resourceType?ids=a,b,c — bulk all-time totals
  // for a list view's own "Views" column, one query instead of N+1.
  fastify.get('/analytics/:resourceType', async (request: any, reply) => {
    const { resourceType } = request.params as { resourceType: string };
    if (!RESOURCE_TYPES.includes(resourceType as CmsAnalyticsResourceType)) {
      return reply.status(400).send({ error: 'Unknown resource type.' });
    }
    const ids = String((request.query as any)?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    const totals = await CMSAnalyticsService.getTotals(request.user.tenant_id, resourceType as CmsAnalyticsResourceType, ids);
    return { totals };
  });
}
