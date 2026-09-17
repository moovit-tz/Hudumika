import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSImportExportService } from '../services/cms-import-export.service.js';
import { CMSCapabilitiesService } from '../services/cms-capabilities.service.js';
import type { CmsCapabilityArea } from '@hudumika/types';

const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

/**
 * §56-57 of the CMS master brief — Import/export/migration. Export is
 * gated by the same area+'view' capability its own resource type already
 * uses elsewhere (posts/pages/content) — exporting is a read, not a
 * write, so it rides the existing "view" bar rather than "manage". Import
 * writes real Posts, so it's gated as 'posts'+'manage'.
 */
export async function cmsImportExportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    const isCmsIoRoute = url && (
      url.startsWith('/v1/cms/posts/export') ||
      url.startsWith('/v1/cms/pages/export') ||
      url.startsWith('/v1/cms/import/wordpress') ||
      /\/v1\/cms\/content-models\/[^/]+\/entries\/export/.test(url)
    );
    if (!isCmsIoRoute) return;

    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await requireEntitlement('onesite')(request, reply);
    if (reply.sent) return;
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
    if (isCmsAdmin(request.user.role)) return;

    let area: CmsCapabilityArea = 'settings';
    let action: 'view' | 'manage' = 'view';
    if (url!.startsWith('/v1/cms/posts/export')) area = 'posts';
    else if (url!.startsWith('/v1/cms/pages/export')) area = 'pages';
    else if (url!.startsWith('/v1/cms/import/wordpress')) { area = 'posts'; action = 'manage'; }
    else area = 'content';

    const allowed = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, area, action);
    if (!allowed) return reply.status(403).send({ error: `Your role does not have ${action === 'view' ? 'access to' : 'permission to manage'} ${area} in the CMS.` });
  });

  fastify.get('/posts/export', async (request: any, reply) => {
    try {
      const csv = await CMSImportExportService.exportPostsCsv(request.user.tenant_id);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="posts-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    } catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/pages/export', async (request: any, reply) => {
    try {
      const csv = await CMSImportExportService.exportPagesCsv(request.user.tenant_id);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="pages-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    } catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/content-models/:id/entries/export', async (request: any, reply) => {
    try {
      const csv = await CMSImportExportService.exportEntriesCsv(request.user.tenant_id, (request.params as any).id);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="entries-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    } catch (err: any) { return reply.status(404).send({ error: 'Model not found.' }); }
  });

  // POST /v1/cms/import/wordpress — multipart upload of a WordPress WXR
  // (Tools ▸ Export) XML file. Same request.file() → mimetype/extension
  // check → toBuffer() → size cap → parse-with-catch shape every other
  // upload route in this codebase already uses (cms.routes.ts's own
  // /media, bank-reconciliation.routes.ts's /statements/import).
  const MAX_WXR_BYTES = 20 * 1024 * 1024;
  fastify.post('/import/wordpress', async (request: any, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });
    if (!/\.xml$/i.test(data.filename) && data.mimetype !== 'text/xml' && data.mimetype !== 'application/xml') {
      return reply.status(400).send({ error: 'Please upload a WordPress export .xml file.' });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > MAX_WXR_BYTES) {
      return reply.status(400).send({ error: 'This export file is over the 20MB limit for one import.' });
    }
    try {
      const result = await CMSImportExportService.importWordPress(request.user.tenant_id, request.user.sub, buffer.toString('utf-8'));
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
