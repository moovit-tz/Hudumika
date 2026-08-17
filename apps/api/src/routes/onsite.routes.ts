import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { checkDnsPropagation, verifyTxtRecord } from '../services/onsite-dns-probe.service.js';
import { resolveCIProvider, verifyProviderConnection, NO_CI_PROVIDER_MESSAGE } from '../services/onsite-ci.service.js';
import { runCheck } from '../services/onsite-uptime.service.js';
import { refreshDomainCertificate } from '../services/onsite-ssl.service.js';
import {
  validateRecord, deletionImpact, toZoneFile, parseZoneFile, planImport, DNS_TEMPLATES,
} from '../services/onsite-dns.service.js';
import { sql } from 'kysely';

const ONSITE_RUNTIMES = ['static', 'nodejs', 'python', 'php', 'ruby', 'go', 'rust', 'container', 'custom'] as const;

const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
});
const domainCreateSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  project_id: z.string().optional(),
  registrar: z.string().max(100).optional(),
  auto_renew: z.boolean().optional(),
});
// Shape guard only — validateRecord() does the real per-type/value validation
// (A/AAAA/CNAME/MX/TXT/etc, and that an MX carries a priority).
const dnsRecordCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(20),
  value: z.string().trim().min(1).max(2000),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().optional(),
}).passthrough();
const dnsImportSchema = z.object({
  zone_file: z.string().min(1),
  apply: z.boolean().optional(),
});
const dnsPropagationCheckSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(20),
  expected: z.string().trim().min(1).max(2000),
});
const applicationCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  runtime: z.enum(ONSITE_RUNTIMES).optional(),
  project_id: z.string().optional(),
  domain_id: z.string().optional(),
  repo_url: z.string().max(500).optional(),
  default_branch: z.string().max(200).optional(),
  build_command: z.string().max(1000).optional(),
  start_command: z.string().max(1000).optional(),
  output_dir: z.string().max(500).optional(),
  port: z.number().int().positive().optional(),
});
const secretCreateSchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string(),
  is_secret: z.boolean().optional(),
});
const deploySchema = z.object({
  environment_id: z.string().optional(),
  branch: z.string().max(200).optional(),
  commit_message: z.string().max(2000).optional(),
});
const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  ip_address: z.string().max(100).optional(),
  os: z.string().max(200).optional(),
  cpu_count: z.number().int().positive().optional(),
  ram_mb: z.number().int().positive().optional(),
  disk_gb: z.number().int().positive().optional(),
});
const healthCheckCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  method: z.string().max(10).optional(),
  expected_status: z.number().int().positive().optional(),
  interval_s: z.number().int().positive().optional(),
});
const providerConnectionCreateSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  token: z.string().optional(),
  access_token: z.string().optional(),
  external_id: z.string().max(200).optional(),
  external_name: z.string().max(200).optional(),
});
const websiteCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().max(50).optional(),
  url: z.string().max(2000).optional(),
  project_id: z.string().optional(),
  domain_id: z.string().optional(),
  hosting_provider: z.string().max(100).optional(),
});
const domainTransferSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  eppCode: z.string().max(200).optional(),
});


/**
 * The user id to stamp on a row, or null when the caller is an API key.
 *
 * middleware/auth.ts sets `sub` to `apikey:<uuid>` for key-authenticated
 * requests, which is not a UUID — so every Onsite insert that stamped
 * created_by failed with a Postgres cast error, and an API key could read
 * everything and create nothing. The column is nullable and means "the person
 * who made this"; a key is not a person.
 */
function actorId(request: FastifyRequest): string | null {
  const sub = request.user?.sub ?? '';
  return sub.startsWith('apikey:') ? null : sub;
}

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
      healthChecksCritical,
      recentDeployments,
      expiringDomains,
      expiringSsl,
    ] = await Promise.all([
      db.selectFrom('onsite_projects').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_domains').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_applications').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_servers').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      db.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      // Real, now that something probes these. It read a hardcoded 0, so the
      // dashboard showed no failing monitors during an actual outage.
      db.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c'))
        .where('tenant_id', '=', tenantId).where('status', '=', 'critical').executeTakeFirst(),
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
      health_checks_critical: healthChecksCritical?.c ?? 0,
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
    const body = projectCreateSchema.parse(request.body);

    const created = await db.insertInto('onsite_projects')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? '#4361ee',
        created_by: actorId(request),
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
    const body = domainCreateSchema.parse(request.body);

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
        created_by: actorId(request),
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
          created_by: actorId(request),
        },
        {
          tenant_id: request.user.tenant_id,
          zone_id: zone.id,
          name: '@',
          type: 'NS',
          value: 'ns2.hudumika.com',
          ttl: 3600,
          created_by: actorId(request),
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
    const body = dnsRecordCreateSchema.parse(request.body);

    /**
     * Checked here rather than at the CHECK constraint.
     *
     * An unsupported type used to surface as a raw 500 carrying Postgres code
     * 23514, and nothing validated the *value* at all: an A record would store
     * "not an address", and an MX record could be saved with no priority,
     * which is not a valid MX record.
     */
    const invalid = validateRecord(body);
    if (invalid) return reply.status(400).send({ error: invalid });

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
        created_by: actorId(request),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(record);
  });

  /**
   * Delete a record.
   *
   * Removing the last MX record ends mail delivery for the domain and removing
   * the apex A record takes the site offline — both used to happen silently.
   * The impact is computed first and returned as a 409 unless the caller
   * confirms, which is ONSITE.md section 62's "explain the consequence" for the
   * operations that actually have one.
   */
  fastify.delete('/domains/:domainId/dns/:recordId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { recordId } = request.params as { domainId: string; recordId: string };
    const q = request.query as { confirm?: string };

    const record = await db.selectFrom('onsite_dns_records')
      .select(['id', 'zone_id', 'name', 'type', 'value'])
      .where('id', '=', recordId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!record) return reply.status(404).send({ error: 'DNS record not found' });

    const siblings = await db.selectFrom('onsite_dns_records')
      .select(['name', 'type'])
      .where('zone_id', '=', record.zone_id)
      .where('tenant_id', '=', request.user.tenant_id)
      .where('id', '!=', recordId)
      .execute();

    const impact = deletionImpact(record, siblings);
    if (impact && q.confirm !== 'true') {
      return reply.status(409).send({ error: impact, requires_confirmation: true });
    }

    await db.deleteFrom('onsite_dns_records')
      .where('id', '=', recordId)
      .where('tenant_id', '=', request.user.tenant_id)
      .execute();
    return reply.send({ success: true, warned: impact ?? null });
  });

  /**
   * The zone as a BIND file.
   *
   * Every registrar reads this format; an export nobody else can import is a
   * backup rather than portability.
   */
  fastify.get('/domains/:domainId/dns/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const domain = await db.selectFrom('onsite_domains')
      .select(['id', 'domain'])
      .where('id', '=', domainId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const records = await db.selectFrom('onsite_dns_records as r')
      .innerJoin('onsite_dns_zones as z', 'z.id', 'r.zone_id')
      .select(['r.name', 'r.type', 'r.value', 'r.ttl', 'r.priority'])
      .where('z.domain_id', '=', domainId)
      .where('r.tenant_id', '=', request.user.tenant_id)
      .orderBy('r.type').orderBy('r.name')
      .execute();

    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="' + domain.domain + '.zone"')
      .send(toZoneFile(domain.domain, records));
  });

  /**
   * Import a zone file.
   *
   * Two steps on purpose: without `apply` this reports what *would* happen and
   * writes nothing, so a paste can be reviewed before it changes how a domain
   * resolves. Re-importing the same file creates nothing the second time — a
   * record's identity is name+type+value(+priority), so the plan reports it as
   * unchanged (ONSITE.md section 63).
   */
  fastify.post('/domains/:domainId/dns/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const body = dnsImportSchema.parse(request.body);

    const zone = await db.selectFrom('onsite_dns_zones as z')
      .innerJoin('onsite_domains as d', 'd.id', 'z.domain_id')
      .select(['z.id as zone_id', 'd.domain as domain'])
      .where('z.domain_id', '=', domainId)
      .where('z.tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!zone) return reply.status(404).send({ error: 'DNS zone not found' });

    const parsed = parseZoneFile(body.zone_file);
    const errors = parsed.filter(x => x.error);
    const good = parsed.filter(x => x.record).map(x => x.record!);

    const existing = await db.selectFrom('onsite_dns_records')
      .select(['name', 'type', 'value', 'ttl', 'priority'])
      .where('zone_id', '=', zone.zone_id)
      .where('tenant_id', '=', request.user.tenant_id)
      .execute();

    const plan = planImport(good, existing);
    const toCreate = plan.filter(x => x.action === 'create');

    if (!body.apply) {
      return reply.send({
        applied: false,
        domain: zone.domain,
        create: toCreate.length,
        unchanged: plan.length - toCreate.length,
        errors: errors.map(e => ({ line: e.line, raw: e.raw, error: e.error })),
        plan,
      });
    }

    // A file with an unreadable line is not applied piecemeal: the caller fixes
    // it and re-imports, rather than being left guessing which half landed.
    if (errors.length) {
      return reply.status(400).send({
        error: errors.length + ' line(s) could not be read. Nothing was imported.',
        errors: errors.map(e => ({ line: e.line, raw: e.raw, error: e.error })),
      });
    }

    if (toCreate.length) {
      await db.insertInto('onsite_dns_records')
        .values(toCreate.map(x => ({
          tenant_id: request.user.tenant_id,
          zone_id: zone.zone_id,
          name: x.record.name,
          type: x.record.type.toUpperCase(),
          value: x.record.value,
          ttl: x.record.ttl ?? 3600,
          priority: x.record.priority ?? null,
          created_by: actorId(request),
        })))
        .execute();
    }

    return reply.send({
      applied: true,
      domain: zone.domain,
      created: toCreate.length,
      unchanged: plan.length - toCreate.length,
    });
  });

  /**
   * Setup templates.
   *
   * These return records to review; nothing is written. Section 15 is explicit
   * that a template must require confirmation, so applying one is the caller
   * posting the rows it accepted back through the ordinary create endpoint.
   */
  fastify.get('/dns/templates', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(DNS_TEMPLATES.map(t => ({
      id: t.id, label: t.label, description: t.description, inputs: t.inputs,
    })));
  });

  fastify.post('/dns/templates/:id/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vars = (request.body ?? {}) as Record<string, string>;
    const template = DNS_TEMPLATES.find(t => t.id === id);
    if (!template) return reply.status(404).send({ error: 'No DNS template called "' + id + '".' });

    const missing = template.inputs.filter(i => !String(vars[i.key] ?? '').trim());
    if (missing.length) {
      return reply.status(400).send({ error: missing.map(m => m.label).join(', ') + ' is required for this template.' });
    }

    const records = template.build(vars);
    // A template that generates an invalid record is a bug in the template, and
    // saying so beats handing the user rows the editor will refuse.
    const bad = records.map(r => ({ r, err: validateRecord(r) })).filter(x => x.err);
    if (bad.length) {
      return reply.status(422).send({ error: 'This template produced a record Onsite cannot store: ' + bad[0].err });
    }
    return reply.send({ template: template.id, records });
  });

  fastify.post('/domains/:domainId/dns/check-propagation', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const body = dnsPropagationCheckSchema.parse(request.body);

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
    const body = applicationCreateSchema.parse(request.body);

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
        created_by: actorId(request),
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
    const body = secretCreateSchema.parse(request.body);

    const valueCipher = encryptSecret(body.value);

    const created = await db.insertInto('onsite_secrets')
      .values({
        tenant_id: request.user.tenant_id,
        environment_id: envId,
        key: body.key.toUpperCase(),
        value_cipher: valueCipher,
        is_secret: body.is_secret ?? true,
        created_by: actorId(request),
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
    const body = deploySchema.parse(request.body);

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
    const body = serverCreateSchema.parse(request.body);

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
        created_by: actorId(request),
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
    const body = healthCheckCreateSchema.parse(request.body);

    const check = await db.insertInto('onsite_health_checks')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        url: body.url,
        method: body.method?.toUpperCase() ?? 'GET',
        expected_status: body.expected_status ?? 200,
        interval_s: body.interval_s ?? 300,
        /**
         * A monitor that has never run knows nothing about the thing it
         * monitors.
         *
         * This used to be created as `status: 'healthy', uptime_30d: 99.9` —
         * so a monitor was born reporting four nines of availability for a URL
         * nothing had contacted, and the Monitoring page's `?? 99.9` fallback
         * was only ever agreeing with what the row already said. Both start
         * empty now and are filled in by the first real probe.
         */
        status: 'unknown',
        uptime_30d: null,
        created_by: actorId(request),
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

  /**
   * Probe a monitor now.
   *
   * The scheduled sweep honours each monitor's interval, which is right for
   * routine watching and useless when somebody has just fixed a server and
   * wants to know. The result is recorded like any other sample, so a manual
   * run counts towards uptime exactly as a scheduled one does.
   */
  fastify.post('/health-checks/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const check = await db.selectFrom('onsite_health_checks')
      .select(['id', 'tenant_id', 'url', 'method', 'expected_status', 'timeout_ms'])
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!check) return reply.status(404).send({ error: 'Health check not found' });

    const result = await runCheck(check);
    const updated = await db.selectFrom('onsite_health_checks')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    return reply.send({ result, check: updated });
  });

  /** The samples behind the uptime figure, most recent first. */
  fastify.get('/health-checks/:id/results', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { limit?: string };
    const limit = Math.min(Number(q.limit) || 100, 500);

    const owned = await db.selectFrom('onsite_health_checks')
      .select('id')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!owned) return reply.status(404).send({ error: 'Health check not found' });

    const results = await db.selectFrom('onsite_health_check_results')
      .select(['id', 'checked_at', 'ok', 'status_code', 'response_ms', 'error'])
      .where('check_id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('checked_at', 'desc')
      .limit(limit)
      .execute();
    return reply.send(results);
  });

  // ─── SSL certificates ────────────────────────────────────────

  /**
   * The certificates this workspace's domains are actually serving.
   *
   * There was no endpoint at all, so the SSL page listed domains and called
   * them certificates. These rows come from a TLS handshake against each host.
   */
  fastify.get('/ssl', async (request: FastifyRequest, reply: FastifyReply) => {
    const certs = await db.selectFrom('onsite_ssl_certificates as c')
      .leftJoin('onsite_domains as d', 'd.id', 'c.domain_id')
      .select([
        'c.id', 'c.domain_id', 'c.provider', 'c.issuer', 'c.subject', 'c.sans',
        'c.issued_at', 'c.expires_at', 'c.status', 'c.last_checked_at', 'c.last_error',
        'd.domain as domain',
      ])
      .where('c.tenant_id', '=', request.user.tenant_id)
      .orderBy('c.expires_at', 'asc')
      .execute();
    return reply.send(certs);
  });

  /**
   * Read the live certificate for one domain, now.
   *
   * Reports what the host presents, whoever issued it — a certificate Onsite
   * did not provision is still the one that will break when it expires.
   */
  fastify.post('/domains/:id/ssl/inspect', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await db.selectFrom('onsite_domains')
      .select(['id', 'domain'])
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const outcome = await refreshDomainCertificate(request.user.tenant_id, domain);
    if (!outcome.ok) {
      // 200, not an error status: the check ran and its finding is that the
      // host has no usable certificate. That is a result worth displaying, not
      // a failed request.
      return reply.send({ ok: false, error: outcome.error, domain: domain.domain });
    }
    return reply.send({ ok: true, domain: domain.domain, certificate: outcome.cert });
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
    const body = providerConnectionCreateSchema.parse(request.body);

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
        created_by: actorId(request),
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

  // ─── Websites CRUD & Grouping (Hostinger style) ───────────────
  fastify.get('/websites', async (request: FastifyRequest, reply: FastifyReply) => {
    const websites = await db.selectFrom('onsite_websites')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return reply.send(websites);
  });

  fastify.post('/websites', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = websiteCreateSchema.parse(request.body);

    const created = await db.insertInto('onsite_websites')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        type: body.type ?? 'php',
        url: body.url ?? `https://${body.name}`,
        project_id: body.project_id ?? null,
        domain_id: body.domain_id ?? null,
        hosting_provider: body.hosting_provider ?? 'Business',
        status: 'active',
        created_by: actorId(request),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(created);
  });

  fastify.delete('/websites/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await db.deleteFrom('onsite_websites')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Website not found' });
    return reply.send({ success: true });
  });

  // ─── Domain Search & Pricing (Hostinger style) ────────────────
  fastify.get('/domains/search-lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.query as { query?: string };
    const q = (query || '').trim().toLowerCase();

    const tldPricing = [
      { tld: '.com', price: '$0.01', originalPrice: '$19.99', popular: true },
      { tld: '.net', price: '$11.99', originalPrice: '$17.99', popular: false },
      { tld: '.io', price: '$31.99', originalPrice: '$74.99', popular: true },
      { tld: '.org', price: '$8.99', originalPrice: '$17.99', popular: false },
      { tld: '.online', price: '$0.99', originalPrice: '$35.99', popular: true },
      { tld: '.shop', price: '$0.99', originalPrice: '$34.99', popular: false },
      { tld: '.co.tz', price: '$14.99', originalPrice: '$25.00', popular: true },
      { tld: '.tz', price: '$19.99', originalPrice: '$30.00', popular: false },
    ];

    if (!q) {
      return reply.send({ query: '', available: true, tldPricing, suggestions: [] });
    }

    const suggestions = tldPricing.map(t => {
      const baseName = q.includes('.') ? q.split('.')[0] : q;
      const domainName = `${baseName}${t.tld}`;
      return {
        domain: domainName,
        tld: t.tld,
        price: t.price,
        originalPrice: t.originalPrice,
        available: true,
      };
    });

    return reply.send({
      query: q,
      available: true,
      tldPricing,
      suggestions,
    });
  });

  // ─── Domain Transfers (Hostinger style) ────────────────────────
  fastify.post('/domains/transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = domainTransferSchema.parse(request.body);

    const cleanDomain = body.domain.trim().toLowerCase();

    const created = await db.insertInto('onsite_domains')
      .values({
        tenant_id: request.user.tenant_id,
        domain: cleanDomain,
        status: 'pending',
        notes: `Transfer initiated. EPP Code: ${body.eppCode ? 'Provided' : 'Pending'}`,
        created_by: actorId(request),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send(created);
  });
}

