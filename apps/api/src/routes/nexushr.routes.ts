import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { NexusHRService } from '../services/nexushr.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import { escapeHtml } from '../services/sign-notify.service.js';

export async function nexusHRRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  // ─── CORE HR ───────────────────────────────────────────────────────────────

  // A person separate from a login was a model nobody ever populated, while
  // every table that does hold rows keys on `users`. 410 rather than 404, so an
  // old client is told where the concept went rather than that it never existed.
  const personModelGone = async (_request: any, reply: any) =>
    reply.status(410).send({
      error: 'HR records and logins are the same record now. Use /v1/hr/staff.',
    });
  fastify.get('/people', personModelGone);
  fastify.post('/people', personModelGone);
  fastify.patch('/people/:id/user', personModelGone);

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

  fastify.get('/employments', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await NexusHRService.getEmployments(tenantId);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /employments is gone — an employment record is a contract, created at
  // POST /v1/hr/staff/:id/contracts, which refuses a fixed-term contract with
  // no end date. 410 rather than 404 so an old client is told it moved.
  fastify.post('/employments', async (_request, reply) =>
    reply.status(410).send({
      error: 'Employment records are now contracts. Use POST /v1/hr/staff/:id/contracts.',
    }));

  // The org chart people use is org_chart_nodes, served at /v1/org-chart. This
  // one read three empty tables and returned [] in every tenant.
  fastify.get('/org-chart', async (_request, reply) =>
    reply.status(410).send({ error: 'Use /v1/org-chart.' }));

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
   * POST /v1/hr/documents/upload — a real file, stored and recorded.
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
      const expiryDate = field('expiry_date') ? new Date(field('expiry_date')!) : null;
      const category = (field('category') || 'GENERAL').trim().toUpperCase();
      const isMandatory = field('is_mandatory') === 'true';

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
        const up = await MinioIntegration.uploadHrDocument(
          user.tenant_id, userId ?? 'unattached', data.filename || name, buffer);

        const row = await withTenant(user.tenant_id, trx =>
          trx.insertInto('hr_documents').values({
            tenant_id: user.tenant_id,
            user_id: userId,
            name,
            type,
            storage_key: up.storageKey,
            status: 'ACTIVE',
            approval_status: 'PENDING_APPROVAL',
            expiry_date: expiryDate,
            category,
            is_mandatory: isMandatory,
          }).returningAll().executeTakeFirstOrThrow());

        CloudSync.syncEmployeeDoc(user.tenant_id, {
          userId, filename: data.filename || name, buffer, mime: data.mimetype,
        }).catch(err => console.error('[Cloud] employee document sync failed:', err.message));

        return row;
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    });

  // GET /v1/hr/documents/:id/download — the actual file, not a fabricated
  // /v1/documents/download?key=... URL the frontend used to call: that route
  // was never registered anywhere, so every download attempt 404'd. Looked
  // up by document id (tenant-scoped) rather than taking a raw storage key
  // as a query param, so a caller can't request an arbitrary storage key —
  // same shape as seal-documents.routes.ts's own /documents/:id/download.
  fastify.get('/documents/:id/download', async (request: any, reply) => {
    try {
      const doc = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('hr_documents').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', request.user.tenant_id)
          .executeTakeFirst()
      );
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const fileBuffer = MinioIntegration.readFile(doc.storage_key);
      if (!fileBuffer) return reply.status(404).send({ error: 'File missing from storage' });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${doc.name.replace(/"/g, '')}"`);
      return reply.send(fileBuffer);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/documents/:id/review',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (request: any, reply) => {
      try {
        const { id } = request.params;
        const { approval_status, review_notes } = request.body || {};
        if (!['APPROVED', 'REJECTED'].includes(approval_status)) {
          return reply.status(400).send({ error: 'approval_status must be APPROVED or REJECTED' });
        }
        return await NexusHRService.reviewDocument(
          request.user.tenant_id, id, request.user.sub, approval_status, review_notes
        );
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

  fastify.get('/documents/expiry-radar', async (request: any, reply) => {
    try {
      return await NexusHRService.getExpiryRadar(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/document-requirements', async (request: any, reply) => {
    try {
      return await NexusHRService.getDocumentRequirements(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/documents/generate-letter',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (request: any, reply) => {
      try {
        const { template_id, user_id, variables } = request.body || {};
        if (!template_id) return reply.status(400).send({ error: 'template_id is required' });

        const tenantId = request.user.tenant_id;
        const template = await withTenant(tenantId, trx =>
          trx.selectFrom('hr_document_templates').selectAll()
            .where('id', '=', template_id).where('tenant_id', '=', tenantId)
            .executeTakeFirst());
        if (!template) return reply.status(404).send({ error: 'Template not found' });

        let empName = 'Employee';
        if (user_id) {
          const emp = await withTenant(tenantId, trx =>
            trx.selectFrom('users').select(['name', 'email']).where('id', '=', user_id).executeTakeFirst());
          if (emp) empName = emp.name;
        }

        // request.user carries no tenant_name — the JWT payload only has
        // sub/tenant_id/role/email/name — so this always fell through to the
        // literal string 'Organization' for every tenant. Looked up for real.
        const tenant = await withTenant(tenantId, trx =>
          trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst());

        // Replace placeholders in HTML template body. Defaults first, then
        // only a real (non-empty) submitted value overrides one — the caller
        // sends every template placeholder pre-seeded as '' until a person
        // types into it, and spreading that unconditionally overwrote
        // empName/tenant/joining_date back to blank on every real generation.
        let renderedHtml = template.body;
        const defaults: Record<string, string> = {
          '{employee_name}': empName,
          '{tenant_name}': tenant?.name || 'Organization',
          '{joining_date}': new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        };
        const merged: Record<string, string> = { ...defaults };
        for (const [k, v] of Object.entries(variables || {})) {
          if (v) merged[k] = String(v);
        }

        for (const [k, v] of Object.entries(merged)) {
          renderedHtml = renderedHtml.split(k).join(escapeHtml(v));
        }

        // Store generated HTML as document file
        const filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${empName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
        const buffer = Buffer.from(renderedHtml, 'utf-8');
        const up = await MinioIntegration.uploadHrDocument(tenantId, user_id ?? 'unattached', filename, buffer);

        const doc = await withTenant(tenantId, trx =>
          trx.insertInto('hr_documents').values({
            tenant_id: tenantId,
            user_id: user_id ?? null,
            name: `${template.name} - ${empName}`,
            type: template.type,
            storage_key: up.storageKey,
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            category: 'LETTER',
          }).returningAll().executeTakeFirstOrThrow());

        return { success: true, document: doc, html: renderedHtml };
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

  // POST /payroll/run is gone. It read hr_employments, which has never held a
  // row, so it could not produce a payslip in any tenant. The engine that
  // computes PAYE, NSSF, NHIF, WCF and SDL against real bands is /v1/payroll.
  fastify.post('/payroll/run', async (_request, reply) =>
    reply.status(410).send({
      error: 'This payroll path never worked — it read a table with no rows. Use POST /v1/payroll/runs.',
    }));

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
