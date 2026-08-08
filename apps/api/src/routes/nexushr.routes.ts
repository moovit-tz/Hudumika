import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { NexusHRService } from '../services/nexushr.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

export async function nexusHRRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  // ─── CORE HR ───────────────────────────────────────────────────────────────

  fastify.get('/people', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getPeople(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/people', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.createPerson(tenantId, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * GET /v1/hr/roster — both person models, reconciled.
   *
   * See migration 172. Answers "who has a login, who has an HR record, and who
   * has both", which nothing could answer while the two families had no join.
   */
  fastify.get('/roster', async (request: any, reply) => {
    try {
      return await NexusHRService.getRoster(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Legal entities — the employing company. An employment cannot exist without
   * one (NOT NULL + RESTRICT), and nothing could create one until now.
   */
  fastify.get('/legal-entities', async (request: any, reply) => {
    try {
      return await NexusHRService.getLegalEntities(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/legal-entities', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request: any, reply) => {
    try {
      return await NexusHRService.createLegalEntity(request.user.tenant_id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** Effective-dated pay history for one employment. */
  fastify.get('/employments/:id/compensation', async (request: any, reply) => {
    try {
      return await NexusHRService.getCompensationHistory(request.user.tenant_id, request.params.id);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  fastify.post('/employments/:id/compensation', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request: any, reply) => {
    try {
      return await NexusHRService.addCompensation(request.user.tenant_id, request.params.id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * GET /v1/hr/payroll-vs-contract?month=&year=
   *
   * What was paid against what the contract says. Payroll is keyed on users
   * and compensation on employments, so this comparison was impossible before
   * migration 172 bridged them.
   */
  fastify.get('/payroll-vs-contract', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    const now = new Date();
    const month = Number(request.query?.month) || now.getMonth() + 1;
    const year = Number(request.query?.year) || now.getFullYear();
    if (month < 1 || month > 12) return reply.status(400).send({ error: 'month must be 1-12' });
    try {
      return await NexusHRService.payrollVsContract(request.user.tenant_id, month, year);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /** PATCH /v1/hr/people/:id/user — link (or unlink) an HR record to a login. */
  fastify.patch('/people/:id/user', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { user_id } = request.body ?? {};
      return await NexusHRService.linkPersonToUser(request.user.tenant_id, id, user_id ?? null);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/employments', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getEmployments(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/employments', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.createEmployment(tenantId, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/org-chart', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getOrgChart(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // NexusHR's own workflow routes were removed with the engine behind them
  // (migration 173). Nothing in the app called them; HR workflow automation
  // now goes through domain events and Workflow Studio.

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────────

  fastify.get('/documents', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getDocuments(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * POST /v1/nexushr/documents/upload — a real file, stored and recorded.
   *
   * Documents could be listed and never created, so `hr_documents` was empty in
   * every tenant and the Documents tab could only ever show nothing. The one
   * thing this must not become is a metadata row with no file behind it:
   * storage_key is NOT NULL precisely so a document row always points at
   * something, and the upload happens before the insert so a failed write to
   * disk cannot leave a row claiming a file that was never saved.
   */
  fastify.post('/documents/upload',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (request: any, reply) => {
      const user = request.user;
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded.' });

      const field = (n: string) => (data.fields?.[n] as any)?.value as string | undefined;
      const userId = field('user_id') || (request.query as any)?.user_id || null;
      const name = (field('name') || data.filename || '').trim();
      const type = (field('type') || 'OTHER').trim().toUpperCase();
      if (!name) return reply.status(400).send({ error: 'A document name is required.' });

      // Validated before the file is written, so a refusal leaves nothing behind.
      if (userId) {
        const owner = await withTenant(user.tenant_id, trx =>
          trx.selectFrom('users').select('id')
            .where('id', '=', userId).where('tenant_id', '=', user.tenant_id)
            .executeTakeFirst());
        if (!owner) return reply.status(404).send({ error: 'That person is not in this workspace.' });
      }

      try {
        const buffer = await data.toBuffer();
        // Unattached documents are filed under the tenant rather than refused —
        // a policy or a template belongs to nobody in particular.
        const up = await MinioIntegration.uploadHrDocument(
          user.tenant_id, userId ?? 'unattached', data.filename || name, buffer);

        return await withTenant(user.tenant_id, trx =>
          trx.insertInto('hr_documents').values({
            tenant_id: user.tenant_id,
            user_id: userId,
            name,
            type,
            storage_key: up.storageKey,
            // A freshly uploaded file has not been checked by anyone yet, and
            // saying otherwise would make the verify step meaningless.
            status: 'PENDING',
          }).returningAll().executeTakeFirstOrThrow());
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    });

  fastify.get('/documents/templates', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getDocumentTemplates(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/assets', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getAssets(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/assets', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      return await NexusHRService.createAsset(request.user.tenant_id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** Hand an asset over, or take it back with `user_id: null`. */
  fastify.patch('/assets/:id/assignment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      // employment_id still accepted so an older client keeps working, but a
      // user id is what it now means.
      const { user_id, employment_id, date } = request.body ?? {};
      return await NexusHRService.assignAsset(request.user.tenant_id, request.params.id, user_id ?? employment_id ?? null, date);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PAYROLL ───────────────────────────────────────────────────────────────

  fastify.get('/payroll/runs', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getPayrollRuns(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/payroll/run', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE', 'MANAGER') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.runPayroll(tenantId, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PERFORMANCE ───────────────────────────────────────────────────────────

  fastify.get('/goals', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getGoals(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/goals', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.createGoal(tenantId, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/goals/:id/checkin', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await NexusHRService.checkInGoal(tenantId, id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/reviews/cycles', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getReviewCycles(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/reviews/cycles', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      return await NexusHRService.createReviewCycle(request.user.tenant_id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** The individual reviews inside one cycle, each against a named person. */
  fastify.get('/reviews/cycles/:id/instances', async (request: any, reply) => {
    try {
      return await NexusHRService.getReviewInstances(request.user.tenant_id, request.params.id);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ─── WELLNESS ──────────────────────────────────────────────────────────────

  fastify.get('/surveys', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getSurveys(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/surveys/:id/submit', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      return await NexusHRService.submitSurvey(tenantId, id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
