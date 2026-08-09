import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { checkDnsPropagation, verifyTxtRecord } from '../services/onsite-dns-probe.service.js';
import { resolveCIProvider, verifyProviderConnection, NO_CI_PROVIDER_MESSAGE } from '../services/onsite-ci.service.js';
import { sql } from 'kysely';

export async function onsiteRoutes(fastify: FastifyInstance) {
  // All routes in this module require valid auth + onsite entitlement
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('onsite'));

  // ─── Overview / Dashboard ────────────────────────────────────
  fastify.get('/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;

    const [
      projectsCount,
      domainsCount,
      appsCount,
      serversCount,
      healthChecksCount,
      recentDeployments,
      expiringDomains,
      expiringSsl,
    ] = await Promise.all([
      db.selectFrom('onsite_projects').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_domains').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_applications').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_servers').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_deployments')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .limit(5)
        .execute(),
      db.selectFrom('onsite_domains')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('expires_at', '<=', new Date(Date.now() + 30 * 86400 * 1000))
        .execute(),
      db.selectFrom('onsite_ssl_certificates')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('expires_at', '<=', new Date(Date.now() + 30 * 86400 * 1000))
        .execute(),
    ]);

    const alerts: Array<{
      id: string;
      severity: 'warning' | 'critical';
      type: string;
      message: string;
      resource_type: string;
      resource_id: string;
      resource_name: string;
    }> = [];

    for (const d of expiringDomains) {
      alerts.push({
        id: `domain-exp-${d.id}`,
        severity: 'warning',
        type: 'domain_expiring',
        message: `Domain ${d.domain} expires soon`,
        resource_type: 'domain',
        resource_id: d.id,
        resource_name: d.domain,
      });
    }

    for (const s of expiringSsl) {
      alerts.push({
        id: `ssl-exp-${s.id}`,
        severity: 'warning',
        type: 'ssl_expiring',
        message: `SSL Certificate for ${s.subject || 'domain'} expires soon`,
        resource_type: 'ssl',
        resource_id: s.id,
        resource_name: s.subject || 'SSL Certificate',
      });
    }

    return reply.send({
      projects: projectsCount?.c ?? 0,
      domains: domainsCount?.c ?? 0,
      domains_expiring_soon: expiringDomains.length,
      ssl_expiring_soon: expiringSsl.length,
      applications: appsCount?.c ?? 0,
      deployments_today: 0,
      failed_deployments_today: 0,
      servers: serversCount?.c ?? 0,
      servers_healthy: serversCount?.c ?? 0,
      health_checks: healthChecksCount?.c ?? 0,
      health_checks_critical: 0,
      recent_deployments: recentDeployments,
      alerts,
    });
  });

  // ─── Projects CRUD ───────────────────────────────────────────
  fastify.get('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const projects = await db.selectFrom('onsite_projects')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(projects);
  });

  fastify.post('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { name: string; description?: string; color?: string };
    if (!body.name) return reply.status(400).send({ error: 'Project name is required' });

    const created = await db.insertInto('onsite_projects')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? '#4361ee',
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(created);
  });

  fastify.get('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = await db.selectFrom('onsite_projects')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return reply.send(project);
  });

  fastify.delete('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_projects')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Project not found' });
    return reply.send({ success: true });
  });

  // ─── Domains CRUD ────────────────────────────────────────────
  fastify.get('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const domains = await db.selectFrom('onsite_domains')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(domains);
  });

  fastify.post('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      domain: string;
      project_id?: string;
      registrar?: string;
      auto_renew?: boolean;
    };
    if (!body.domain) return reply.status(400).send({ error: 'Domain name is required' });

    const cleanDomain = body.domain.trim().toLowerCase();

    // Check duplicate
    const existing = await db.selectFrom('onsite_domains')
      .select('id')
      .where('tenant_id', '=', request.user.tenant_id)
      .where('domain', '=', cleanDomain)
      .executeTakeFirst();

    if (existing) return reply.status(409).send({ error: 'Domain already exists in your workspace' });

    const createdDomain = await db.insertInto('onsite_domains')
      .values({
        tenant_id: request.user.tenant_id,
        project_id: body.project_id ?? null,
        domain: cleanDomain,
        registrar: body.registrar ?? null,
        auto_renew: body.auto_renew ?? false,
        status: 'active',
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Automatically create a default DNS Zone for this domain
    const zone = await db.insertInto('onsite_dns_zones')
      .values({
        tenant_id: request.user.tenant_id,
        domain_id: createdDomain.id,
        provider: 'internal',
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Add default SOA / NS records
    await db.insertInto('onsite_dns_records')
      .values([
        {
          tenant_id: request.user.tenant_id,
          zone_id: zone.id,
          name: '@',
          type: 'NS',
          value: 'ns1.hudumika.com',
          ttl: 3600,
          created_by: request.user.sub,
        },
        {
          tenant_id: request.user.tenant_id,
          zone_id: zone.id,
          name: '@',
          type: 'NS',
          value: 'ns2.hudumika.com',
          ttl: 3600,
          created_by: request.user.sub,
        },
      ])
      .execute();

    return reply.status(201).send(createdDomain);
  });

  fastify.get('/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await db.selectFrom('onsite_domains')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send(domain);
  });

  fastify.delete('/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_domains')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send({ success: true });
  });

  fastify.post('/domains/:id/probe', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await db.selectFrom('onsite_domains')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    // Perform DNS propagation check for the domain A record
    const results = await checkDnsPropagation(domain.domain, 'A', '0.0.0.0');
    const isVerified = results.some(r => r.actual !== null);

    const updated = await db.updateTable('onsite_domains')
      .set({
        dns_status: isVerified ? 'active' : 'misconfigured',
        dns_checked_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.send({ domain: updated, probe_results: results });
  });

  // ─── DNS Zones & Records ─────────────────────────────────────
  fastify.get('/domains/:domainId/dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const zone = await db.selectFrom('onsite_dns_zones')
      .selectAll()
      .where('domain_id', '=', domainId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!zone) return reply.status(404).send({ error: 'DNS zone not found for this domain' });

    const records = await db.selectFrom('onsite_dns_records')
      .selectAll()
      .where('zone_id', '=', zone.id)
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('type', 'asc')
      .orderBy('name', 'asc')
      .execute();

    return reply.send({ zone, records });
  });

  fastify.post('/domains/:domainId/dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const body = request.body as {
      name: string;
      type: string;
      value: string;
      ttl?: number;
      priority?: number;
    };

    if (!body.name || !body.type || !body.value) {
      return reply.status(400).send({ error: 'Name, type, and value are required' });
    }

    const zone = await db.selectFrom('onsite_dns_zones')
      .select('id')
      .where('domain_id', '=', domainId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!zone) return reply.status(404).send({ error: 'DNS zone not found' });

    const record = await db.insertInto('onsite_dns_records')
      .values({
        tenant_id: request.user.tenant_id,
        zone_id: zone.id,
        name: body.name,
        type: body.type.toUpperCase(),
        value: body.value,
        ttl: body.ttl ?? 3600,
        priority: body.priority ?? null,
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(record);
  });

  fastify.delete('/domains/:domainId/dns/:recordId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { recordId } = request.params as { domainId: string; recordId: string };
    const res = await db.deleteFrom('onsite_dns_records')
      .where('id', '=', recordId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'DNS record not found' });
    return reply.send({ success: true });
  });

  fastify.post('/domains/:domainId/dns/check-propagation', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const body = request.body as { name: string; type: string; expected: string };
    if (!body.name || !body.type || !body.expected) {
      return reply.status(400).send({ error: 'Name, type, and expected value are required' });
    }

    const domain = await db.selectFrom('onsite_domains')
      .select('domain')
      .where('id', '=', domainId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const fullName = body.name === '@' ? domain.domain : `${body.name}.${domain.domain}`;
    const results = await checkDnsPropagation(fullName, body.type, body.expected);
    return reply.send({ name: fullName, type: body.type, expected: body.expected, results });
  });

  // ─── Applications CRUD ───────────────────────────────────────
  fastify.get('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const apps = await db.selectFrom('onsite_applications')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(apps);
  });

  fastify.post('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      runtime?: string;
      project_id?: string;
      domain_id?: string;
      repo_url?: string;
      default_branch?: string;
      build_command?: string;
      start_command?: string;
      output_dir?: string;
      port?: number;
    };
    if (!body.name) return reply.status(400).send({ error: 'Application name is required' });

    /**
     * Checked here rather than left to the CHECK constraint.
     *
     * An unsupported runtime came back as a raw 500 carrying Postgres error
     * code 23514 and the constraint's own text — which tells the caller
     * nothing about which runtimes exist, and reads as the platform being
     * broken rather than the request being wrong. The list is the constraint's
     * list; keep the two together if either changes.
     */
    const RUNTIMES = ['static', 'nodejs', 'python', 'php', 'ruby', 'go', 'rust', 'container', 'custom'];
    if (body.runtime && !RUNTIMES.includes(body.runtime)) {
      return reply.status(400).send({
        error: `"${body.runtime}" is not a runtime Onsite can host. Choose one of: ${RUNTIMES.join(', ')}.`,
      });
    }

    const createdApp = await db.insertInto('onsite_applications')
      .values({
        tenant_id: request.user.tenant_id,
        project_id: body.project_id ?? null,
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
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Default production environment
    await db.insertInto('onsite_environments')
      .values({
        tenant_id: request.user.tenant_id,
        application_id: createdApp.id,
        name: 'production',
        branch: 'main',
        status: 'inactive',
      })
      .execute();

    return reply.status(201).send(createdApp);
  });

  fastify.get('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const app = await db.selectFrom('onsite_applications')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!app) return reply.status(404).send({ error: 'Application not found' });

    const envs = await db.selectFrom('onsite_environments')
      .selectAll()
      .where('application_id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .execute();

    return reply.send({ ...app, environments: envs });
  });

  fastify.delete('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_applications')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Application not found' });
    return reply.send({ success: true });
  });

  // ─── Environments & Secrets ──────────────────────────────────
  fastify.get('/environments/:envId/secrets', async (request: FastifyRequest, reply: FastifyReply) => {
    const { envId } = request.params as { envId: string };
    const secrets = await db.selectFrom('onsite_secrets')
      .selectAll()
      .where('environment_id', '=', envId)
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('key', 'asc')
      .execute();

    // Never return real value plaintext in list view — return value_masked
    const safeSecrets = secrets.map(s => ({
      id: s.id,
      tenant_id: s.tenant_id,
      environment_id: s.environment_id,
      key: s.key,
      is_secret: s.is_secret,
      value_masked: MASKED_VALUE,
      created_by: s.created_by,
      updated_by: s.updated_by,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

    return reply.send(safeSecrets);
  });

  fastify.post('/environments/:envId/secrets', async (request: FastifyRequest, reply: FastifyReply) => {
    const { envId } = request.params as { envId: string };
    const body = request.body as { key: string; value: string; is_secret?: boolean };

    if (!body.key || body.value === undefined) {
      return reply.status(400).send({ error: 'Secret key and value are required' });
    }

    const valueCipher = encryptSecret(body.value);

    const created = await db.insertInto('onsite_secrets')
      .values({
        tenant_id: request.user.tenant_id,
        environment_id: envId,
        key: body.key.toUpperCase(),
        value_cipher: valueCipher,
        is_secret: body.is_secret ?? true,
        created_by: request.user.sub,
      })
      .onConflict((oc) => oc.columns(['environment_id', 'key']).doUpdateSet({
        value_cipher: valueCipher,
        is_secret: body.is_secret ?? true,
        updated_by: request.user.sub,
        updated_at: new Date(),
      }))
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({
      id: created.id,
      tenant_id: created.tenant_id,
      environment_id: created.environment_id,
      key: created.key,
      is_secret: created.is_secret,
      value_masked: MASKED_VALUE,
      created_at: created.created_at,
    });
  });

  fastify.delete('/secrets/:secretId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { secretId } = request.params as { secretId: string };
    const res = await db.deleteFrom('onsite_secrets')
      .where('id', '=', secretId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Secret not found' });
    return reply.send({ success: true });
  });

  // ─── Deployments ─────────────────────────────────────────────
  fastify.get('/deployments', async (request: FastifyRequest, reply: FastifyReply) => {
    const deployments = await db.selectFrom('onsite_deployments')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    return reply.send(deployments);
  });

  fastify.post('/applications/:appId/deploy', async (request: FastifyRequest, reply: FastifyReply) => {
    const { appId } = request.params as { appId: string };
    const body = request.body as { environment_id?: string; branch?: string; commit_message?: string };

    const app = await db.selectFrom('onsite_applications')
      .selectAll()
      .where('id', '=', appId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!app) return reply.status(404).send({ error: 'Application not found' });

    let envId = body.environment_id;
    if (!envId) {
      const defaultEnv = await db.selectFrom('onsite_environments')
        .select('id')
        .where('application_id', '=', appId)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!defaultEnv) return reply.status(400).send({ error: 'No environment found for application' });
      envId = defaultEnv.id;
    }

    /**
     * A deployment is whatever the CI provider says it is.
     *
     * This used to insert a row, wait 1.5 seconds on a setTimeout, and then
     * write status 'succeeded', application status 'active' and a
     * `current_version` of `v1.0.${Date.now()/1000 % 10000}` — with nothing
     * built and no CI system contacted. The console reported a running
     * production deployment that did not exist. Everything below reflects a
     * real call to a real provider, or refuses.
     *
     * Checked before the insert, deliberately: a deployment record that never
     * had a chance to run is noise in the history, and returning a 4xx from
     * inside withTenant returns *normally*, so a write made first would have
     * been committed anyway.
     */
    const ci = await resolveCIProvider(request.user.tenant_id);
    if (!ci) return reply.status(409).send({ error: NO_CI_PROVIDER_MESSAGE });

    const branch = body.branch ?? app.default_branch ?? 'main';

    const deployment = await db.insertInto('onsite_deployments')
      .values({
        tenant_id: request.user.tenant_id,
        application_id: appId,
        environment_id: envId,
        trigger: 'manual',
        triggered_by: request.user.sub,
        branch,
        commit_message: body.commit_message ?? null,
        status: 'queued',
        ci_provider: ci.key,
        queued_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    try {
      const pipeline = await ci.trigger({ branch });
      const updated = await db.updateTable('onsite_deployments')
        .set({
          status: 'building',
          ci_pipeline_id: pipeline.id,
          ci_build_url: pipeline.url,
          started_at: new Date(),
        })
        .where('id', '=', deployment.id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      // 202: the provider has it, and it is not finished. The sync job below
      // moves it to succeeded/failed when the provider says so — nothing here
      // decides that.
      return reply.status(202).send(updated ?? deployment);
    } catch (err: any) {
      // A refusal is a real, recorded failure with the provider's own reason,
      // not a silently discarded attempt.
      const failed = await db.updateTable('onsite_deployments')
        .set({
          status: 'failed',
          completed_at: new Date(),
          error_message: String(err?.message ?? err).slice(0, 500),
        })
        .where('id', '=', deployment.id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      return reply.status(502).send({
        error: `The CI provider refused the deployment. ${err?.message ?? err}`,
        deployment: failed ?? deployment,
      });
    }
  });

  // ─── Servers CRUD ────────────────────────────────────────────
  fastify.get('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const servers = await db.selectFrom('onsite_servers')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(servers);
  });

  fastify.post('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      provider?: string;
      region?: string;
      ip_address?: string;
      os?: string;
      cpu_count?: number;
      ram_mb?: number;
      disk_gb?: number;
    };

    if (!body.name) return reply.status(400).send({ error: 'Server name is required' });

    const server = await db.insertInto('onsite_servers')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        provider: body.provider ?? 'manual',
        region: body.region ?? 'fra1',
        ip_address: body.ip_address ?? null,
        os: body.os ?? 'Ubuntu 24.04 LTS',
        cpu_count: body.cpu_count ?? 2,
        ram_mb: body.ram_mb ?? 4096,
        disk_gb: body.disk_gb ?? 80,
        status: 'running',
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(server);
  });

  fastify.delete('/servers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_servers')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Server not found' });
    return reply.send({ success: true });
  });

  // ─── Health Checks ───────────────────────────────────────────
  fastify.get('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = await db.selectFrom('onsite_health_checks')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(checks);
  });

  fastify.post('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      url: string;
      method?: string;
      expected_status?: number;
      interval_s?: number;
    };

    if (!body.name || !body.url) {
      return reply.status(400).send({ error: 'Check name and URL are required' });
    }

    const check = await db.insertInto('onsite_health_checks')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        url: body.url,
        method: body.method?.toUpperCase() ?? 'GET',
        expected_status: body.expected_status ?? 200,
        interval_s: body.interval_s ?? 300,
        status: 'healthy',
        uptime_30d: 99.9,
        created_by: request.user.sub,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(check);
  });

  fastify.delete('/health-checks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_health_checks')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Health check not found' });
    return reply.send({ success: true });
  });

  // ─── Provider Connections ────────────────────────────────────
  fastify.get('/provider-connections', async (request: FastifyRequest, reply: FastifyReply) => {
    const connections = await db.selectFrom('onsite_provider_connections')
      .select([
        'id', 'tenant_id', 'provider', 'name',
        'external_id', 'external_name', 'status',
        'last_verified_at', 'error_message',
        'created_by', 'created_at', 'updated_at'
      ])
      .where('tenant_id', '=', request.user.tenant_id)
      .execute();
    return reply.send(connections);
  });

  fastify.post('/provider-connections', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      provider: string;
      name: string;
      /** `token` is the older spelling; both are accepted so existing callers keep working. */
      token?: string;
      access_token?: string;
      /** The provider's own handle for the thing being connected — a CircleCI project slug, say. */
      external_id?: string;
      external_name?: string;
    };

    if (!body.provider || !body.name) {
      return reply.status(400).send({ error: 'Provider and name are required' });
    }

    const token = (body.access_token ?? body.token ?? '').trim();
    if (!token) {
      // A connection with no credential cannot do anything. It used to be
      // accepted and stored as 'active', so the console showed CircleCI
      // connected while every deployment through it would fail.
      return reply.status(400).send({ error: 'A credential is required to connect a provider.' });
    }

    /**
     * The credential goes in access_token_cipher, the column that exists for
     * it.
     *
     * It was being packed into config_cipher as `{"token": "..."}` while
     * access_token_cipher stayed null — so anything reading the column the
     * schema designates for the credential found nothing, and the connection
     * was unusable no matter what was typed into it.
     */
    const conn = await db.insertInto('onsite_provider_connections')
      .values({
        tenant_id: request.user.tenant_id,
        provider: body.provider,
        name: body.name,
        access_token_cipher: encryptSecret(token),
        // config_cipher is NOT NULL and holds the connection's non-credential
        // settings. It used to hold the credential itself, which is why the
        // column named for the credential was empty.
        config_cipher: encryptSecret(JSON.stringify({ project_slug: body.external_id?.trim() || null })),
        external_id: body.external_id?.trim() || null,
        external_name: body.external_name?.trim() || null,
        /**
         * 'pending' until something has actually talked to the provider.
         *
         * This used to write 'active' and stamp last_verified_at with the
         * current time on the way in, having verified nothing — the connection
         * claimed to be live and checked before a single request had left the
         * building. Verification happens below and the row is corrected to
         * what the provider says.
         */
        status: 'pending',
        created_by: request.user.sub,
      })
      .returning(['id', 'tenant_id', 'provider', 'name', 'external_id', 'external_name', 'status', 'created_at'])
      .executeTakeFirstOrThrow();

    // Ask the provider whether the credential works. A failure here is not a
    // failure to save — the connection is kept so it can be corrected, and it
    // carries the provider's reason.
    const verdict = await verifyProviderConnection(body.provider, token);
    const updated = await db.updateTable('onsite_provider_connections')
      .set({
        status: verdict.ok ? 'active' : 'error',
        last_verified_at: new Date(),
        error_message: verdict.ok ? null : verdict.detail.slice(0, 500),
        ...(verdict.ok && verdict.accountName ? { external_name: conn.external_name ?? verdict.accountName } : {}),
      })
      .where('id', '=', conn.id)
      .where('tenant_id', '=', request.user.tenant_id)
      .returning(['id', 'tenant_id', 'provider', 'name', 'external_id', 'external_name',
                  'status', 'error_message', 'last_verified_at', 'created_at'])
      .executeTakeFirst();

    return reply.status(201).send(updated ?? conn);
  });
}
