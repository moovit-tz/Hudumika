import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { requireRole } from '../middleware/rbac.js';
import { verifyAgencyClientAccess } from '../middleware/agency-access.js';
import { validateRecord, deletionImpact } from '../services/onsite-dns.service.js';
import { resolveCIProvider, NO_CI_PROVIDER_MESSAGE } from '../services/onsite-ci.service.js';
import { runCheck } from '../services/onsite-uptime.service.js';
import { MailService } from '../services/mail.service.js';

const ONSITE_RUNTIMES = ['static', 'nodejs', 'python', 'php', 'ruby', 'go', 'rust', 'container', 'custom'] as const;

const domainCreateSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  registrar: z.string().max(100).optional(),
  auto_renew: z.boolean().optional(),
});
const dnsRecordCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(20),
  value: z.string().trim().min(1).max(2000),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().optional(),
}).passthrough();
const applicationCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  runtime: z.enum(ONSITE_RUNTIMES).optional(),
  domain_id: z.string().optional(),
  repo_url: z.string().max(500).optional(),
  default_branch: z.string().max(200).optional(),
  build_command: z.string().max(1000).optional(),
  start_command: z.string().max(1000).optional(),
  output_dir: z.string().max(500).optional(),
  port: z.number().int().positive().optional(),
});
const deploySchema = z.object({
  environment_id: z.string().optional(),
  branch: z.string().max(200).optional(),
  commit_message: z.string().max(2000).optional(),
});
const healthCheckCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  method: z.string().max(10).optional(),
  expected_status: z.number().int().positive().optional(),
  interval_s: z.number().int().positive().optional(),
});

/** Same rule as onsite.routes.ts's own actorId(): an API key has no user row
 *  to attribute a change to. Kept here too since this file stamps
 *  created_by with the real agency staff member, not the client tenant. */
function actorId(request: FastifyRequest): string | null {
  const sub = request.user?.sub ?? '';
  return sub.startsWith('apikey:') ? null : sub;
}

function clientTenantId(request: FastifyRequest): string {
  return (request.params as { clientTenantId: string }).clientTenantId;
}

/**
 * Emails the client tenant's own TENANT_ADMINs that the agency relationship
 * has ended — shared by both detach paths (the agency releasing a client,
 * here, and a client leaving its agency, in onsite-agency.routes.ts).
 */
export async function notifyClientDetached(clientTenantId: string, agencyTenantId: string) {
  const [agency, client, admins] = await Promise.all([
    dbPlatform.selectFrom('tenants').select('name').where('id', '=', agencyTenantId).executeTakeFirst(),
    dbPlatform.selectFrom('tenants').select('name').where('id', '=', clientTenantId).executeTakeFirst(),
    withTenant(clientTenantId, trx => trx.selectFrom('users').select('email')
      .where('tenant_id', '=', clientTenantId).where('role', '=', 'TENANT_ADMIN').where('active', '=', true).execute()),
  ]);
  const vars = {
    agencyName: agency?.name ?? 'Your agency',
    companyName: client?.name ?? 'your workspace',
    activateUrl: `${env.OPS_BOARD_URL}/onsite/activate`,
  };
  await Promise.all(admins.map(a =>
    MailService.enqueueTemplated(clientTenantId, 'agency.client_detached', a.email, vars, 'onsite').catch(() => {})
  ));
}

/**
 * AgencyHost M2 — lets an agency's own staff run a managed client's DNS,
 * deployments and monitoring day to day, without the client's login and
 * without impersonating anyone. Registered under a parametric prefix
 * (/v1/onsite/agency/clients/:clientTenantId), so every handler below reads
 * the target tenant from the URL, not from the caller's own session — the
 * caller's own request.user.tenant_id is never touched.
 *
 * Each handler is onsite.routes.ts's equivalent re-targeted at clientTenantId
 * instead of request.user.tenant_id, reusing the same already-extracted
 * service functions (validateRecord/deletionImpact/resolveCIProvider/
 * runCheck) that the original routes call. Deliberately not a shared
 * tenant-parameterized service layer carved out of the 44-endpoint file —
 * every handler here is a short, self-contained block of tenant-scoped
 * queries, and the genuinely reusable business rules were already factored
 * out before this file existed.
 *
 * v1 scope is curated to what the roadmap actually asks for (DNS,
 * deployments, monitoring) plus the two creation endpoints (domain attach,
 * application register) those sections need to have anything to act on for
 * a freshly onboarded client — SSL, servers, secrets, provider connections,
 * projects, websites, domain purchase/transfer and DNS
 * templates/import/export/propagation stay out for now.
 */
export async function onsiteAgencyManageRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));
  fastify.addHook('preHandler', verifyAgencyClientAccess);

  // ─── Overview ────────────────────────────────────────────────
  fastify.get('/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const [domainsCount, appsCount, healthChecksCount, healthChecksCritical, recentDeployments] =
      await withTenant(tenantId, trx => Promise.all([
        trx.selectFrom('onsite_domains').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
        trx.selectFrom('onsite_applications').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
        trx.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
        trx.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c'))
          .where('tenant_id', '=', tenantId).where('status', '=', 'critical').executeTakeFirst(),
        trx.selectFrom('onsite_deployments').selectAll().where('tenant_id', '=', tenantId)
          .orderBy('created_at', 'desc').limit(5).execute(),
      ]));
    return reply.send({
      domains: domainsCount?.c ?? 0,
      applications: appsCount?.c ?? 0,
      health_checks: healthChecksCount?.c ?? 0,
      health_checks_critical: healthChecksCritical?.c ?? 0,
      recent_deployments: recentDeployments,
    });
  });

  // ─── Domains ─────────────────────────────────────────────────
  fastify.get('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const domains = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute());
    return reply.send(domains);
  });

  fastify.post('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const body = domainCreateSchema.parse(request.body);
    const cleanDomain = body.domain.trim().toLowerCase();

    return withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('onsite_domains').select('id')
        .where('tenant_id', '=', tenantId).where('domain', '=', cleanDomain).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'Domain already exists in this client’s workspace' });

      const createdDomain = await trx.insertInto('onsite_domains').values({
        tenant_id: tenantId,
        domain: cleanDomain,
        registrar: body.registrar ?? null,
        auto_renew: body.auto_renew ?? false,
        status: 'active',
        created_by: actorId(request),
      }).returningAll().executeTakeFirstOrThrow();

      const zone = await trx.insertInto('onsite_dns_zones').values({
        tenant_id: tenantId,
        domain_id: createdDomain.id,
        provider: 'internal',
        status: 'active',
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('onsite_dns_records').values([
        { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns1.hudumika.tz', ttl: 3600, created_by: actorId(request) },
        { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns2.hudumika.tz', ttl: 3600, created_by: actorId(request) },
      ]).execute();

      return reply.status(201).send(createdDomain);
    });
  });

  // ─── DNS records ─────────────────────────────────────────────
  fastify.get('/domains/:domainId/dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const { domainId } = request.params as { domainId: string };
    const result = await withTenant(tenantId, async (trx) => {
      const zone = await trx.selectFrom('onsite_dns_zones').selectAll()
        .where('domain_id', '=', domainId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!zone) return null;
      const records = await trx.selectFrom('onsite_dns_records').selectAll()
        .where('zone_id', '=', zone.id).where('tenant_id', '=', tenantId)
        .orderBy('type', 'asc').orderBy('name', 'asc').execute();
      return { zone, records };
    });
    if (!result) return reply.status(404).send({ error: 'DNS zone not found for this domain' });
    return reply.send(result);
  });

  fastify.post('/domains/:domainId/dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const { domainId } = request.params as { domainId: string };
    const body = dnsRecordCreateSchema.parse(request.body);

    const invalid = validateRecord(body);
    if (invalid) return reply.status(400).send({ error: invalid });

    return withTenant(tenantId, async (trx) => {
      const zone = await trx.selectFrom('onsite_dns_zones').select('id')
        .where('domain_id', '=', domainId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!zone) return reply.status(404).send({ error: 'DNS zone not found' });

      const record = await trx.insertInto('onsite_dns_records').values({
        tenant_id: tenantId,
        zone_id: zone.id,
        name: body.name,
        type: body.type.toUpperCase(),
        value: body.value,
        ttl: body.ttl ?? 3600,
        priority: body.priority ?? null,
        created_by: actorId(request),
      }).returningAll().executeTakeFirstOrThrow();

      return reply.status(201).send(record);
    });
  });

  fastify.delete('/domains/:domainId/dns/:recordId', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const { recordId } = request.params as { domainId: string; recordId: string };
    const q = request.query as { confirm?: string };

    return withTenant(tenantId, async (trx) => {
      const record = await trx.selectFrom('onsite_dns_records')
        .select(['id', 'zone_id', 'name', 'type', 'value'])
        .where('id', '=', recordId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!record) return reply.status(404).send({ error: 'DNS record not found' });

      const siblings = await trx.selectFrom('onsite_dns_records')
        .select(['name', 'type'])
        .where('zone_id', '=', record.zone_id).where('tenant_id', '=', tenantId)
        .where('id', '!=', recordId).execute();

      const impact = deletionImpact(record, siblings);
      if (impact && q.confirm !== 'true') {
        return reply.status(409).send({ error: impact, requires_confirmation: true });
      }

      await trx.deleteFrom('onsite_dns_records')
        .where('id', '=', recordId).where('tenant_id', '=', tenantId).execute();
      return reply.send({ success: true, warned: impact ?? null });
    });
  });

  // ─── Applications & deployments ──────────────────────────────
  fastify.get('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const apps = await withTenant(tenantId, trx => trx.selectFrom('onsite_applications')
      .selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute());
    return reply.send(apps);
  });

  fastify.post('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const body = applicationCreateSchema.parse(request.body);

    const createdApp = await withTenant(tenantId, async (trx) => {
      const createdApp = await trx.insertInto('onsite_applications').values({
        tenant_id: tenantId,
        domain_id: body.domain_id ?? null,
        name: body.name,
        runtime: body.runtime ?? 'nodejs',
        default_branch: body.default_branch?.trim() || 'main',
        repo_url: body.repo_url ?? null,
        build_command: body.build_command ?? null,
        start_command: body.start_command ?? null,
        output_dir: body.output_dir ?? null,
        port: body.port ?? 3000,
        status: 'inactive',
        created_by: actorId(request),
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('onsite_environments').values({
        tenant_id: tenantId,
        application_id: createdApp.id,
        name: 'production',
        branch: 'main',
        status: 'inactive',
      }).execute();

      return createdApp;
    });

    return reply.status(201).send(createdApp);
  });

  fastify.get('/deployments', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const deployments = await withTenant(tenantId, trx => trx.selectFrom('onsite_deployments')
      .selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').limit(50).execute());
    return reply.send(deployments);
  });

  fastify.post('/applications/:appId/deploy', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const { appId } = request.params as { appId: string };
    const body = deploySchema.parse(request.body);

    return withTenant(tenantId, async (trx) => {
      const app = await trx.selectFrom('onsite_applications').selectAll()
        .where('id', '=', appId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!app) return reply.status(404).send({ error: 'Application not found' });

      let envId = body.environment_id;
      if (!envId) {
        const defaultEnv = await trx.selectFrom('onsite_environments').select('id')
          .where('application_id', '=', appId).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!defaultEnv) return reply.status(400).send({ error: 'No environment found for application' });
        envId = defaultEnv.id;
      }

      // Same real-provider-or-refuse rule as onsite.routes.ts's own deploy
      // handler — the client's own CI provider, not the agency's, since
      // this trx already runs inside the client's own tenant.
      const ci = await resolveCIProvider(tenantId);
      if (!ci) return reply.status(409).send({ error: NO_CI_PROVIDER_MESSAGE });

      const branch = body.branch ?? app.default_branch ?? 'main';

      const deployment = await trx.insertInto('onsite_deployments').values({
        tenant_id: tenantId,
        application_id: appId,
        environment_id: envId,
        trigger: 'manual',
        // The real agency staff member who triggered this, not the client
        // tenant — request.user is never rewritten in this file.
        triggered_by: request.user.sub,
        branch,
        commit_message: body.commit_message ?? null,
        status: 'queued',
        ci_provider: ci.key,
        queued_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();

      try {
        const pipeline = await ci.trigger({ branch });
        const updated = await trx.updateTable('onsite_deployments').set({
          status: 'building',
          ci_pipeline_id: pipeline.id,
          ci_build_url: pipeline.url,
          started_at: new Date(),
        }).where('id', '=', deployment.id).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirst();
        return reply.status(202).send(updated ?? deployment);
      } catch (err: any) {
        const failed = await trx.updateTable('onsite_deployments').set({
          status: 'failed',
          completed_at: new Date(),
          error_message: String(err?.message ?? err).slice(0, 500),
        }).where('id', '=', deployment.id).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirst();
        return reply.status(502).send({
          error: `The CI provider refused the deployment. ${err?.message ?? err}`,
          deployment: failed ?? deployment,
        });
      }
    });
  });

  // ─── Monitoring ──────────────────────────────────────────────
  fastify.get('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const checks = await withTenant(tenantId, trx => trx.selectFrom('onsite_health_checks')
      .selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute());
    return reply.send(checks);
  });

  fastify.post('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const body = healthCheckCreateSchema.parse(request.body);

    const check = await withTenant(tenantId, trx => trx.insertInto('onsite_health_checks').values({
      tenant_id: tenantId,
      name: body.name,
      url: body.url,
      method: body.method?.toUpperCase() ?? 'GET',
      expected_status: body.expected_status ?? 200,
      interval_s: body.interval_s ?? 300,
      status: 'unknown',
      uptime_30d: null,
      created_by: actorId(request),
    }).returningAll().executeTakeFirstOrThrow());

    return reply.status(201).send(check);
  });

  fastify.post('/health-checks/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = clientTenantId(request);
    const { id } = request.params as { id: string };
    const outcome = await withTenant(tenantId, async (trx) => {
      const check = await trx.selectFrom('onsite_health_checks')
        .select(['id', 'tenant_id', 'url', 'method', 'expected_status', 'timeout_ms'])
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!check) return null;

      const result = await runCheck(trx, check);
      const updated = await trx.selectFrom('onsite_health_checks').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      return { result, check: updated };
    });
    if (!outcome) return reply.status(404).send({ error: 'Health check not found' });
    return reply.send(outcome);
  });

  // ─── Billing (AgencyHost M9) ─────────────────────────────────
  // The customers row and every invoice against it live in the AGENCY's own
  // tenant (request.user.tenant_id) — the opposite direction from every
  // other handler in this file, which operates inside the client's tenant
  // via withTenant(clientTenantId, ...). Billing is the agency invoicing
  // its own client for work beyond the bundle, so it belongs in the
  // agency's own books, not the client's.
  fastify.get('/billing', async (request: FastifyRequest, reply: FastifyReply) => {
    const agencyTenantId = request.user.tenant_id;
    const targetClientId = clientTenantId(request);
    const customer = await withTenant(agencyTenantId, trx => trx.selectFrom('customers')
      .selectAll()
      .where('tenant_id', '=', agencyTenantId)
      .where('linked_client_tenant_id', '=', targetClientId)
      .executeTakeFirst());
    if (!customer) return reply.send({ customer: null, invoices: [] });

    const invoices = await withTenant(agencyTenantId, trx => trx.selectFrom('sales_invoices')
      .select(['id', 'invoice_number', 'status', 'bill_date', 'due_date', 'received', 'currency', 'created_at'])
      .where('tenant_id', '=', agencyTenantId)
      .where('customer_id', '=', customer.id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send({ customer, invoices });
  });

  fastify.post('/billing/link-customer', async (request: FastifyRequest, reply: FastifyReply) => {
    const agencyTenantId = request.user.tenant_id;
    const targetClientId = clientTenantId(request);

    const client = await dbPlatform.selectFrom('tenants').select(['id', 'name'])
      .where('id', '=', targetClientId).executeTakeFirst();
    if (!client) return reply.status(404).send({ error: 'Client tenant not found' });

    const customer = await withTenant(agencyTenantId, async (trx) => {
      const existing = await trx.selectFrom('customers').selectAll()
        .where('tenant_id', '=', agencyTenantId)
        .where('linked_client_tenant_id', '=', targetClientId)
        .executeTakeFirst();
      if (existing) return existing;

      return trx.insertInto('customers').values({
        tenant_id: agencyTenantId,
        name: client.name,
        linked_client_tenant_id: targetClientId,
        assigned_officer_id: actorId(request),
      } as any).returningAll().executeTakeFirstOrThrow();
    });

    reply.status(201);
    return reply.send(customer);
  });

  // ─── Detach ──────────────────────────────────────────────────
  // The agency releasing a client (AgencyHost M3). verifyAgencyClientAccess
  // already confirmed an active relationship exists for this exact pairing,
  // so detaching an already-detached one 404s here exactly like every other
  // action on this surface — there's nothing to detach twice.
  fastify.post('/detach', async (request: FastifyRequest) => {
    const tenantId = clientTenantId(request);
    const agencyTenantId = request.user.tenant_id;
    await dbPlatform.updateTable('agency_managed_tenants')
      .set({ status: 'detached', detached_at: new Date(), detached_by: request.user.sub })
      .where('agency_tenant_id', '=', agencyTenantId)
      .where('client_tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .execute();
    await notifyClientDetached(tenantId, agencyTenantId);
    return { status: 'detached' };
  });
}
