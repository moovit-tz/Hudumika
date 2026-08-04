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
