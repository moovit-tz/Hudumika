import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { ActivityMonitorService, type RawSample } from '../services/activity-monitor.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;
const LEAD_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR']);

/**
 * Opt-in, intensity-only activity monitoring. The frontend collector reads
 * /config to decide whether to run at all; it POSTs /samples on its interval;
 * the individual sets their own /consent; admins set tenant /settings; leads
 * read /summary for a team heat-view. Nothing here can store content — see
 * ActivityMonitorService.sanitize.
 */
export async function activityMonitorRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /** GET /config — what the collector needs: tenant settings + my own consent. */
  fastify.get('/config', async (request) => {
    const user = request.user;
    const [settings, consent] = await Promise.all([
      ActivityMonitorService.getSettings(user.tenant_id),
      ActivityMonitorService.getConsent(user.tenant_id, user.sub),
    ]);
    // The collector should run only when the tenant is on AND the user consented.
    return { settings, consent, active: settings.enabled && consent, canAdmin: (ADMIN_ROLES as readonly string[]).includes(user.role) };
  });

  /** PATCH /settings — tenant-level enable + capture options (admin only). */
  fastify.patch('/settings', { preHandler: requireRole(...ADMIN_ROLES) }, async (request) => {
    const user = request.user;
    const body = request.body as any;
    const settings = await ActivityMonitorService.setSettings(user.tenant_id, user.sub, {
      enabled: body.enabled, captureKeystrokes: body.captureKeystrokes, captureHeatmap: body.captureHeatmap, intervalSeconds: body.intervalSeconds,
    });
    return { success: true, settings };
  });

  /** POST /consent — the individual opts in or out for themselves. */
  fastify.post('/consent', async (request) => {
    const user = request.user;
    const { consent } = request.body as { consent: boolean };
    const value = await ActivityMonitorService.setConsent(user.tenant_id, user.sub, !!consent);
    return { success: true, consent: value };
  });

  /** POST /samples — ingest the CURRENT user's own samples (gated + sanitized). */
  fastify.post('/samples', async (request) => {
    const user = request.user;
    const { samples } = request.body as { samples: RawSample[] };
    return ActivityMonitorService.ingest(user.tenant_id, user.sub, samples);
  });

  /**
   * GET /summary?scope=self|team&from&to — per-user totals + merged heatmap.
   * A team roll-up requires a lead role; everyone can always see their own.
   */
  fastify.get('/summary', async (request) => {
    const user = request.user;
    const q = request.query as { scope?: string; from?: string; to?: string };
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 3600 * 1000);
    const team = q.scope === 'team' && LEAD_ROLES.has(user.role);
    return ActivityMonitorService.summary(user.tenant_id, { from, to, scopeUserId: team ? undefined : user.sub });
  });
}
