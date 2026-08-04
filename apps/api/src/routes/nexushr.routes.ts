import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { NexusHRService } from '../services/nexushr.service.js';
import { requireRole } from '../middleware/rbac.js';

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

  // ─── WORKFLOWS ─────────────────────────────────────────────────────────────

  fastify.get('/workflows/definitions', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getWorkflowDefinitions(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/workflows/cases', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getWorkflowCases(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/workflows/cases', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.createWorkflowCase(tenantId, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/workflows/tasks/:id/complete', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { id } = request.params as { id: string };
      const { notes } = request.body as { notes?: string };
      return await NexusHRService.completeWorkflowTask(tenantId, id, notes);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────────

  fastify.get('/documents', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getDocuments(tenantId);
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

  /** Hand an asset over, or take it back with `employment_id: null`. */
  fastify.patch('/assets/:id/assignment', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request: any, reply) => {
    try {
      const { employment_id, date } = request.body ?? {};
      return await NexusHRService.assignAsset(request.user.tenant_id, request.params.id, employment_id ?? null, date);
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
