import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { checkDnsPropagation, verifyTxtRecord } from '../services/onsite-dns-probe.service.js';
import { resolveCIProvider, verifyProviderConnection, NO_CI_PROVIDER_MESSAGE } from '../services/onsite-ci.service.js';
import { runCheck, runServerReachabilityCheck } from '../services/onsite-uptime.service.js';
import { refreshDomainCertificate } from '../services/onsite-ssl.service.js';
import {
  validateRecord, deletionImpact, toZoneFile, parseZoneFile, planImport, DNS_TEMPLATES,
} from '../services/onsite-dns.service.js';
import { emitDomainEvent, emitDomainEventStandalone } from '../services/domain-events.service.js';
import { checkAvailabilityForTlds } from '../services/onsite-rdap.service.js';
import { sql } from 'kysely';
import { validateOnsiteLinks } from '../services/onsite-links.service.js';
import { listHostingerWebsites, readHostingerDns, dnsFingerprint, publishHostingerDns } from '../services/onsite-hostinger.service.js';
import { compareDnsRecords, proposeDnsSync } from '../services/onsite-dns-comparison.service.js';
import { verifyMailDns, mailDnsRecordsSchema } from '../services/onsite-email.service.js';
import { registerOnsiteMailOperations } from './onsite-mail-operations.routes.js';
import { resolveRegistrar, NO_REGISTRAR_MESSAGE } from '../services/onsite-registrar.service.js';
import { resolveHostingProviderForWebsite } from '../services/onsite-hosting.service.js';
import { provisionMailbox, deprovisionMailbox } from '../services/onsite-email-provisioning.service.js';

const ONSITE_RUNTIMES = ['static', 'nodejs', 'python', 'php', 'ruby', 'go', 'rust', 'container', 'custom'] as const;

const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
});
const domainCreateSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  project_id: z.string().uuid().optional(),
  registrar: z.string().max(100).optional(),
  auto_renew: z.boolean().optional(),
});
const domainUpdateSchema = z.object({
  auto_renew: z.boolean().optional(),
  registrar: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
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
  project_id: z.string().uuid().optional(),
  domain_id: z.string().uuid().optional(),
  repo_url: z.string().max(500).optional(),
  default_branch: z.string().max(200).optional(),
  build_command: z.string().max(1000).optional(),
  start_command: z.string().max(1000).optional(),
  output_dir: z.string().max(500).optional(),
  port: z.number().int().positive().optional(),
});
const environmentCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  branch: z.string().trim().max(200).optional(),
  domain_id: z.string().uuid().optional(),
});
const cloneSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
const secretCreateSchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string(),
  is_secret: z.boolean().optional(),
});
const deploySchema = z.object({
  environment_id: z.string().uuid().optional(),
  branch: z.string().max(200).optional(),
  commit_message: z.string().max(2000).optional(),
});
// Must match onsite_servers_provider_check exactly (209_onsite_core.sql).
// Phase 5 (functional tracing): this used to be a bare z.string(), so any
// caller who typed the provider's own real branding — "DigitalOcean",
// "AWS", "GCP", "Azure" — hit the DB's case-sensitive CHECK constraint and
// got a raw, unhandled 500 ("An unexpected error occurred"), reproduced
// live. The shipped frontend avoids this today (OnsiteServers.tsx's own
// <Select> only ever sends the exact lowercase values), but nothing stopped
// a different caller from hitting it. Lowercased before validation so any
// casing of a real provider name is accepted, not just the exact string.
const SERVER_PROVIDERS = ['manual', 'digitalocean', 'hetzner', 'aws', 'gcp', 'azure', 'internal'] as const;
const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.preprocess(
    v => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(SERVER_PROVIDERS),
  ).optional(),
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
  project_id: z.string().uuid().optional(),
  domain_id: z.string().uuid().optional(),
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
  // All routes in this module require valid auth + onsite entitlement, and
  // (production-readiness audit HUD-0023) a management-tier role: every
  // mutating route here creates/deletes servers, domains and deployments,
  // or reads/writes deploy secrets — infrastructure actions, not something
  // a SALES/JUNIOR/OFFICER/CUSTOMER account should ever be able to reach.
  // Before this fix the only gate was the entitlement (feature-flag) check,
  // which says nothing about which user within the tenant may act — proven
  // live: a CUSTOMER-role portal account could create and delete a real
  // onsite_health_checks row through this exact route.
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('onsite'));
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'));
  registerOnsiteMailOperations(fastify);

  // ─── Overview / Dashboard ────────────────────────────────────
  fastify.get('/mailbox-status', async (request, reply) => {
    return withTenant(request.user.tenant_id, async trx => {
      const row = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
      return reply.send({
        gmail: settings?.email?.gmailStatus === 'authorized' ? 'authorized' : '',
        outlook: settings?.email?.outlookStatus === 'authorized' ? 'authorized' : '',
      });
    });
  });
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
    ] = await withTenant(tenantId, trx => Promise.all([
      trx.selectFrom('onsite_projects').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      trx.selectFrom('onsite_domains').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      trx.selectFrom('onsite_applications').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      trx.selectFrom('onsite_servers').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      trx.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c')).where('tenant_id', '=', tenantId).executeTakeFirst(),
      // Real, now that something probes these. It read a hardcoded 0, so the
      // dashboard showed no failing monitors during an actual outage.
      trx.selectFrom('onsite_health_checks').select(sql<number>`count(*)::int`.as('c'))
        .where('tenant_id', '=', tenantId).where('status', '=', 'critical').executeTakeFirst(),
      trx.selectFrom('onsite_deployments')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .limit(5)
        .execute(),
      trx.selectFrom('onsite_domains')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('expires_at', '<=', new Date(Date.now() + 30 * 86400 * 1000))
        .execute(),
      trx.selectFrom('onsite_ssl_certificates')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('expires_at', '<=', new Date(Date.now() + 30 * 86400 * 1000))
        .execute(),
    ]));

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
    const projects = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_projects')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(projects);
  });

  fastify.post('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = projectCreateSchema.parse(request.body);

    const created = await withTenant(request.user.tenant_id, trx => trx.insertInto('onsite_projects')
      .values({
        tenant_id: request.user.tenant_id,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? '#4361ee',
        created_by: actorId(request),
      })
      .returningAll()
      .executeTakeFirstOrThrow());

    return reply.status(201).send(created);
  });

  fastify.get('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_projects')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return reply.send(project);
  });

  fastify.delete('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await withTenant(request.user.tenant_id, trx => trx.deleteFrom('onsite_projects')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Project not found' });
    return reply.send({ success: true });
  });

  // ─── Domains CRUD ────────────────────────────────────────────
  fastify.get('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const domains = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_domains')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(domains);
  });

  fastify.post('/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = domainCreateSchema.parse(request.body);

    const cleanDomain = body.domain.trim().toLowerCase();

    return withTenant(request.user.tenant_id, async (trx) => {
      // Check duplicate
      const linkError = await validateOnsiteLinks(trx, request.user.tenant_id, body);
      if (linkError) return reply.status(400).send({ error: linkError });
      const existing = await trx.selectFrom('onsite_domains')
        .select('id')
        .where('tenant_id', '=', request.user.tenant_id)
        .where('domain', '=', cleanDomain)
        .executeTakeFirst();

      if (existing) return reply.status(409).send({ error: 'Domain already exists in your workspace' });

      const createdDomain = await trx.insertInto('onsite_domains')
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
      const zone = await trx.insertInto('onsite_dns_zones')
        .values({
          tenant_id: request.user.tenant_id,
          domain_id: createdDomain.id,
          provider: 'internal',
          status: 'active',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Add default SOA / NS records
      await trx.insertInto('onsite_dns_records')
        .values([
          {
            tenant_id: request.user.tenant_id,
            zone_id: zone.id,
            name: '@',
            type: 'NS',
            value: 'ns1.hudumika.tz',
            ttl: 3600,
            created_by: actorId(request),
          },
          {
            tenant_id: request.user.tenant_id,
            zone_id: zone.id,
            name: '@',
            type: 'NS',
            value: 'ns2.hudumika.tz',
            ttl: 3600,
            created_by: actorId(request),
          },
        ])
        .execute();

      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.domain.created', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: createdDomain.id,
        payload: { domain: createdDomain.domain }, actorId: actorId(request),
      }).catch(console.error);

      return reply.status(201).send(createdDomain);
    });
  });

  fastify.get('/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_domains')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send(domain);
  });

  fastify.patch('/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = domainUpdateSchema.parse(request.body);
    if (Object.keys(body).length === 0) return reply.status(400).send({ error: 'No fields to update' });

    const updated = await withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.updateTable('onsite_domains')
        .set({ ...body, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      if (row) {
        emitDomainEvent(trx, request.user.tenant_id, {
          type: 'onsite.domain.updated', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: row.id,
          payload: { domain: row.domain, fields: Object.keys(body) }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });

    if (!updated) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send(updated);
  });

  fastify.delete('/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deletedDomain = await withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('onsite_domains')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      if (row) {
        emitDomainEvent(trx, request.user.tenant_id, {
          type: 'onsite.domain.deleted', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: row.id,
          payload: { domain: row.domain }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });

    if (!deletedDomain) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send({ success: true });
  });

  fastify.post('/domains/:id/probe', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_domains')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    // Perform DNS propagation check for the domain A record
    const results = await checkDnsPropagation(domain.domain, 'A', '0.0.0.0');
    const isVerified = results.some(r => r.actual !== null);

    const updated = await withTenant(request.user.tenant_id, trx => trx.updateTable('onsite_domains')
      .set({
        dns_status: isVerified ? 'active' : 'misconfigured',
        dns_checked_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow());

    return reply.send({ domain: updated, probe_results: results });
  });

  // ─── DNS Zones & Records ─────────────────────────────────────
  fastify.get('/domains/:domainId/dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const zone = await trx.selectFrom('onsite_dns_zones')
        .selectAll()
        .where('domain_id', '=', domainId)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();

      if (!zone) return null;

      const records = await trx.selectFrom('onsite_dns_records')
        .selectAll()
        .where('zone_id', '=', zone.id)
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('type', 'asc')
        .orderBy('name', 'asc')
        .execute();

      return { zone, records };
    });

    if (!result) return reply.status(404).send({ error: 'DNS zone not found for this domain' });
    return reply.send(result);
  });

  /**
   * Mail-DNS status for a domain — a read over the same real
   * onsite_dns_records this domain's DNS page already manages, filtered to
   * the four record types that make a domain able to send/receive mail
   * cleanly. No new mail-server logic here: MX/SPF/DKIM/DMARC are just DNS
   * records, and this domain's zone already has real ones or doesn't.
   */
  fastify.get('/domains/:id/mail-dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const domain = await trx.selectFrom('onsite_domains')
        .select(['id', 'domain']).where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!domain) return null;

      const zone = await trx.selectFrom('onsite_dns_zones')
        .select('id').where('domain_id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      const records = zone
        ? await trx.selectFrom('onsite_dns_records').selectAll()
            .where('zone_id', '=', zone.id).where('tenant_id', '=', request.user.tenant_id).execute()
        : [];

      const mx = records.filter(r => r.type === 'MX');
      const spf = records.find(r => r.type === 'TXT' && r.value.trim().toLowerCase().startsWith('v=spf1'));
      const dkim = records.filter(r => r.type === 'TXT' && r.name.toLowerCase().includes('_domainkey'));
      const dmarc = records.find(r => r.type === 'TXT' && r.name.toLowerCase().startsWith('_dmarc'));

      return {
        domain: domain.domain,
        domain_id: domain.id,
        mx: mx.map(r => ({ id: r.id, name: r.name, value: r.value, priority: r.priority })),
        spf: spf ? { id: spf.id, value: spf.value } : null,
        dkim: dkim.map(r => ({ id: r.id, name: r.name })),
        dmarc: dmarc ? { id: dmarc.id, value: dmarc.value } : null,
      };
    });

    if (!result) return reply.status(404).send({ error: 'Domain not found' });
    return reply.send(result);
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

    return withTenant(request.user.tenant_id, async (trx) => {
      const zone = await trx.selectFrom('onsite_dns_zones')
        .select('id')
        .where('domain_id', '=', domainId)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();

      if (!zone) return reply.status(404).send({ error: 'DNS zone not found' });

      const record = await trx.insertInto('onsite_dns_records')
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

      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.dns_record.created', sourceApp: 'onsite', entityType: 'onsite_dns_record', entityId: record.id,
        payload: { domain_id: domainId, name: record.name, dns_type: record.type }, actorId: actorId(request),
      }).catch(console.error);

      return reply.status(201).send(record);
    });
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

    return withTenant(request.user.tenant_id, async (trx) => {
      const record = await trx.selectFrom('onsite_dns_records')
        .select(['id', 'zone_id', 'name', 'type', 'value'])
        .where('id', '=', recordId)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!record) return reply.status(404).send({ error: 'DNS record not found' });

      const siblings = await trx.selectFrom('onsite_dns_records')
        .select(['name', 'type'])
        .where('zone_id', '=', record.zone_id)
        .where('tenant_id', '=', request.user.tenant_id)
        .where('id', '!=', recordId)
        .execute();

      const impact = deletionImpact(record, siblings);
      if (impact && q.confirm !== 'true') {
        return reply.status(409).send({ error: impact, requires_confirmation: true });
      }

      await trx.deleteFrom('onsite_dns_records')
        .where('id', '=', recordId)
        .where('tenant_id', '=', request.user.tenant_id)
        .execute();

      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.dns_record.deleted', sourceApp: 'onsite', entityType: 'onsite_dns_record', entityId: record.id,
        payload: { name: record.name, dns_type: record.type, warned: impact ?? null }, actorId: actorId(request),
      }).catch(console.error);

      return reply.send({ success: true, warned: impact ?? null });
    });
  });

  /**
   * The zone as a BIND file.
   *
   * Every registrar reads this format; an export nobody else can import is a
   * backup rather than portability.
   */
  fastify.get('/domains/:domainId/dns/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const domain = await trx.selectFrom('onsite_domains')
        .select(['id', 'domain'])
        .where('id', '=', domainId)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!domain) return null;

      const records = await trx.selectFrom('onsite_dns_records as r')
        .innerJoin('onsite_dns_zones as z', 'z.id', 'r.zone_id')
        .select(['r.name', 'r.type', 'r.value', 'r.ttl', 'r.priority'])
        .where('z.domain_id', '=', domainId)
        .where('r.tenant_id', '=', request.user.tenant_id)
        .orderBy('r.type').orderBy('r.name')
        .execute();

      return { domain, records };
    });

    if (!result) return reply.status(404).send({ error: 'Domain not found' });
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="' + result.domain.domain + '.zone"')
      .send(toZoneFile(result.domain.domain, result.records));
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

    return withTenant(request.user.tenant_id, async (trx) => {
      const zone = await trx.selectFrom('onsite_dns_zones as z')
        .innerJoin('onsite_domains as d', 'd.id', 'z.domain_id')
        .select(['z.id as zone_id', 'd.domain as domain'])
        .where('z.domain_id', '=', domainId)
        .where('z.tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!zone) return reply.status(404).send({ error: 'DNS zone not found' });

      const parsed = parseZoneFile(body.zone_file);
      const errors = parsed.filter(x => x.error);
      const good = parsed.filter(x => x.record).map(x => x.record!);

      const existing = await trx.selectFrom('onsite_dns_records')
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
        await trx.insertInto('onsite_dns_records')
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

    const domain = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_domains')
      .select('domain')
      .where('id', '=', domainId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const fullName = body.name === '@' ? domain.domain : `${body.name}.${domain.domain}`;
    const results = await checkDnsPropagation(fullName, body.type, body.expected);
    return reply.send({ name: fullName, type: body.type, expected: body.expected, results });
  });

  // ─── Applications CRUD ───────────────────────────────────────
  fastify.get('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const apps = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_applications')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(apps);
  });

  fastify.post('/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = applicationCreateSchema.parse(request.body);

    const createdApp = await withTenant(request.user.tenant_id, async (trx) => {
      const linkError = await validateOnsiteLinks(trx, request.user.tenant_id, body);
      if (linkError) return reply.status(400).send({ error: linkError });
      const createdApp = await trx.insertInto('onsite_applications')
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
      await trx.insertInto('onsite_environments')
        .values({
          tenant_id: request.user.tenant_id,
          application_id: createdApp.id,
          name: 'production',
          branch: body.default_branch?.trim() || 'main',
          status: 'inactive',
        })
        .execute();

      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.application.created', sourceApp: 'onsite', entityType: 'onsite_application', entityId: createdApp.id,
        payload: { name: createdApp.name, runtime: createdApp.runtime }, actorId: actorId(request),
      }).catch(console.error);

      return createdApp;
    });

    if (reply.sent) return reply;
    return reply.status(201).send(createdApp);
  });

  fastify.get('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const app = await trx.selectFrom('onsite_applications')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();

      if (!app) return null;

      const envs = await trx.selectFrom('onsite_environments')
        .selectAll()
        .where('application_id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .execute();

      return { ...app, environments: envs };
    });

    if (!result) return reply.status(404).send({ error: 'Application not found' });
    return reply.send(result);
  });

  fastify.patch('/applications/:id/deployment-connection', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ provider_connection_id: z.string().uuid().nullable() }).parse(request.body);
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async trx => {
      const app = await trx.selectFrom('onsite_applications').select('id').where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!app) return reply.status(404).send({ error: 'Application not found' });
      if (body.provider_connection_id) {
        const connection = await trx.selectFrom('onsite_provider_connections').select(['provider', 'status'])
          .where('id', '=', body.provider_connection_id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!connection || connection.status !== 'active' || !['circleci', 'github', 'cloudflare', 'digitalocean'].includes(connection.provider)) {
          return reply.status(400).send({ error: 'Select an active supported deployment connection in this workspace' });
        }
        if (!await resolveCIProvider(tenantId, undefined, body.provider_connection_id)) return reply.status(400).send({ error: 'Connection is missing usable credentials or a provider project reference' });
      }
      const updated = await trx.updateTable('onsite_applications').set({ provider_connection_id: body.provider_connection_id, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
      return reply.send(updated);
    });
  });

  fastify.delete('/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await withTenant(request.user.tenant_id, trx => trx.deleteFrom('onsite_applications')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Application not found' });
    return reply.send({ success: true });
  });

  /**
   * A second (or third) named environment for an application — 'production'
   * is the only one POST /applications ever creates automatically. Onsite's
   * own onsite_environments table already supports more; this is the
   * missing route to add one (AgencyHost M5).
   */
  fastify.post('/applications/:id/environments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = environmentCreateSchema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const app = await trx.selectFrom('onsite_applications').select('id')
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!app) return reply.status(404).send({ error: 'Application not found' });

      const existing = await trx.selectFrom('onsite_environments').select('id')
        .where('application_id', '=', id).where('tenant_id', '=', request.user.tenant_id)
        .where('name', '=', body.name).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: `An environment named "${body.name}" already exists for this application` });
      const linkError = await validateOnsiteLinks(trx, request.user.tenant_id, body);
      if (linkError) return reply.status(400).send({ error: linkError });

      // Nothing has run in it yet — same convention a fresh health check or
      // domain starts with, not a status implying activity that never happened.
      const env = await trx.insertInto('onsite_environments').values({
        tenant_id: request.user.tenant_id,
        application_id: id,
        name: body.name,
        branch: body.branch ?? null,
        domain_id: body.domain_id ?? null,
        status: 'inactive',
      }).returningAll().executeTakeFirstOrThrow();

      return reply.status(201).send(env);
    });
  });

  /**
   * Duplicates an application's *configuration* — not its deployed files or
   * data (provider-dependent, not something this platform can honestly claim
   * to do yet) and not its secrets (copying credentials into a new resource
   * without explicit review is its own separate concern, not a silent side
   * effect of "clone"). The clone starts exactly like a freshly created
   * application does: inactive, undeployed, no domain assigned.
   */
  fastify.post('/applications/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = cloneSchema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const source = await trx.selectFrom('onsite_applications').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!source) return reply.status(404).send({ error: 'Application not found' });

      const sourceEnvs = await trx.selectFrom('onsite_environments').selectAll()
        .where('application_id', '=', id).where('tenant_id', '=', request.user.tenant_id).execute();

      const clone = await trx.insertInto('onsite_applications').values({
        tenant_id: request.user.tenant_id,
        name: body.name?.trim() || `${source.name} (copy)`,
        runtime: source.runtime,
        repo_provider: source.repo_provider,
        repo_owner: source.repo_owner,
        repo_name: source.repo_name,
        repo_url: source.repo_url,
        default_branch: source.default_branch,
        build_command: source.build_command,
        start_command: source.start_command,
        output_dir: source.output_dir,
        port: source.port,
        // Not source.domain_id — a clone needs its own domain assigned later;
        // copying it would point two applications at the same one.
        domain_id: null,
        status: 'inactive',
        created_by: actorId(request),
      }).returningAll().executeTakeFirstOrThrow();

      const clonedEnvs = sourceEnvs.length > 0
        ? await trx.insertInto('onsite_environments').values(
            sourceEnvs.map(env => ({
              tenant_id: request.user.tenant_id,
              application_id: clone.id,
              name: env.name,
              branch: env.branch,
              domain_id: null,
              status: 'inactive',
            })),
          ).returningAll().execute()
        : [];

      return reply.status(201).send({ ...clone, environments: clonedEnvs, secrets_cloned: false });
    });
  });

  // ─── Environments & Secrets ──────────────────────────────────
  fastify.get('/environments/:envId/secrets', async (request: FastifyRequest, reply: FastifyReply) => {
    const { envId } = request.params as { envId: string };
    const secrets = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_secrets')
      .selectAll()
      .where('environment_id', '=', envId)
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('key', 'asc')
      .execute());

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

    const created = await withTenant(request.user.tenant_id, trx => trx.insertInto('onsite_secrets')
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
      .executeTakeFirstOrThrow());

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
    const res = await withTenant(request.user.tenant_id, trx => trx.deleteFrom('onsite_secrets')
      .where('id', '=', secretId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

    if (res.numDeletedRows === 0n) return reply.status(404).send({ error: 'Secret not found' });
    return reply.send({ success: true });
  });

  // ─── Deployments ─────────────────────────────────────────────
  fastify.get('/deployments', async (request: FastifyRequest, reply: FastifyReply) => {
    const deployments = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_deployments')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute());
    return reply.send(deployments);
  });

  fastify.post('/applications/:appId/deploy', async (request: FastifyRequest, reply: FastifyReply) => {
    const { appId } = request.params as { appId: string };
    const body = deploySchema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
    const app = await trx.selectFrom('onsite_applications')
      .selectAll()
      .where('id', '=', appId)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst();

    if (!app) return reply.status(404).send({ error: 'Application not found' });

    let envId = body.environment_id;
    if (envId) {
      const environment = await trx.selectFrom('onsite_environments').select('id')
        .where('id', '=', envId).where('tenant_id', '=', request.user.tenant_id).where('application_id', '=', appId).executeTakeFirst();
      if (!environment) return reply.status(400).send({ error: 'Environment not found for this application' });
    }
    if (!envId) {
      const defaultEnv = await trx.selectFrom('onsite_environments')
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
    if (!app.provider_connection_id) return reply.status(409).send({ error: 'Select a deployment connection in application settings first' });
    const ci = await resolveCIProvider(request.user.tenant_id, undefined, app.provider_connection_id);
    if (!ci) return reply.status(409).send({ error: NO_CI_PROVIDER_MESSAGE });

    const branch = body.branch ?? app.default_branch ?? 'main';

    const deployment = await trx.insertInto('onsite_deployments')
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
        provider_connection_id: ci.connectionId,
        queued_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    try {
      const pipeline = await ci.trigger({ branch });
      const updated = await trx.updateTable('onsite_deployments')
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
      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.deployment.triggered', sourceApp: 'onsite', entityType: 'onsite_deployment', entityId: deployment.id,
        payload: { application_id: appId, branch, ci_provider: ci.key }, actorId: actorId(request),
      }).catch(console.error);

      // 202: the provider has it, and it is not finished. The sync job below
      // moves it to succeeded/failed when the provider says so — nothing here
      // decides that.
      return reply.status(202).send(updated ?? deployment);
    } catch (err: any) {
      // A refusal is a real, recorded failure with the provider's own reason,
      // not a silently discarded attempt.
      const failed = await trx.updateTable('onsite_deployments')
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
  });

  // ─── Servers CRUD ────────────────────────────────────────────
  fastify.get('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const servers = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_servers')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(servers);
  });

  fastify.post('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = serverCreateSchema.parse(request.body);

    let server = await withTenant(request.user.tenant_id, trx => trx.insertInto('onsite_servers')
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
        // Not 'running' — nothing has checked this box yet. A real probe
        // fires immediately below when an IP was given; the scheduled sweep
        // (onsite-uptime.job.ts) keeps it current after that.
        status: 'unknown',
        created_by: actorId(request),
      })
      .returningAll()
      .executeTakeFirstOrThrow());

    if (server.ip_address) {
      await withTenant(request.user.tenant_id, trx => runServerReachabilityCheck(trx, server));
      const refreshed = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_servers')
        .selectAll().where('id', '=', server.id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst());
      if (refreshed) server = refreshed;
    }

    await withTenant(request.user.tenant_id, trx => emitDomainEvent(trx, request.user.tenant_id, {
      type: 'onsite.server.created', sourceApp: 'onsite', entityType: 'onsite_server', entityId: server.id,
      payload: { name: server.name, provider: server.provider }, actorId: actorId(request),
    })).catch(console.error);

    return reply.status(201).send(server);
  });

  fastify.delete('/servers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('onsite_servers')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      if (row) {
        emitDomainEvent(trx, request.user.tenant_id, {
          type: 'onsite.server.deleted', sourceApp: 'onsite', entityType: 'onsite_server', entityId: row.id,
          payload: { name: row.name }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });
    if (!deleted) return reply.status(404).send({ error: 'Server not found' });
    return reply.send({ success: true });
  });

  // Manual re-probe — same "Check now" idea health checks already offer,
  // for a tenant who doesn't want to wait for the scheduled sweep.
  fastify.post('/servers/:id/check', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const server = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_servers')
      .selectAll().where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst());
    if (!server) return reply.status(404).send({ error: 'Server not found' });
    if (!server.ip_address) return reply.status(400).send({ error: 'This server has no IP address to probe.' });

    const result = await withTenant(request.user.tenant_id, trx => runServerReachabilityCheck(trx, server));
    const refreshed = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_servers')
      .selectAll().where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst());
    return reply.send({ ...refreshed, probe: result });
  });

  // ─── Health Checks ───────────────────────────────────────────
  fastify.get('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_health_checks')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(checks);
  });

  fastify.post('/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = healthCheckCreateSchema.parse(request.body);

    const check = await withTenant(request.user.tenant_id, trx => trx.insertInto('onsite_health_checks')
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
      .executeTakeFirstOrThrow());

    return reply.status(201).send(check);
  });

  fastify.delete('/health-checks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const res = await withTenant(request.user.tenant_id, trx => trx.deleteFrom('onsite_health_checks')
      .where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id)
      .executeTakeFirst());

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
    const outcome = await withTenant(request.user.tenant_id, async (trx) => {
      const check = await trx.selectFrom('onsite_health_checks')
        .select(['id', 'tenant_id', 'url', 'method', 'expected_status', 'timeout_ms'])
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!check) return null;

      const result = await runCheck(trx, check);
      const updated = await trx.selectFrom('onsite_health_checks')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      return { result, check: updated };
    });
    if (!outcome) return reply.status(404).send({ error: 'Health check not found' });
    return reply.send(outcome);
  });

  /** The samples behind the uptime figure, most recent first. */
  fastify.get('/health-checks/:id/results', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { limit?: string };
    const limit = Math.min(Number(q.limit) || 100, 500);

    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const owned = await trx.selectFrom('onsite_health_checks')
        .select('id')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!owned) return null;

      return trx.selectFrom('onsite_health_check_results')
        .select(['id', 'checked_at', 'ok', 'status_code', 'response_ms', 'error'])
        .where('check_id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .orderBy('checked_at', 'desc')
        .limit(limit)
        .execute();
    });
    if (result === null) return reply.status(404).send({ error: 'Health check not found' });
    return reply.send(result);
  });

  // ─── SSL certificates ────────────────────────────────────────

  /**
   * The certificates this workspace's domains are actually serving.
   *
   * There was no endpoint at all, so the SSL page listed domains and called
   * them certificates. These rows come from a TLS handshake against each host.
   */
  fastify.get('/ssl', async (request: FastifyRequest, reply: FastifyReply) => {
    const certs = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_ssl_certificates as c')
      .leftJoin('onsite_domains as d', 'd.id', 'c.domain_id')
      .select([
        'c.id', 'c.domain_id', 'c.provider', 'c.issuer', 'c.subject', 'c.sans',
        'c.issued_at', 'c.expires_at', 'c.status', 'c.last_checked_at', 'c.last_error',
        'd.domain as domain',
      ])
      .where('c.tenant_id', '=', request.user.tenant_id)
      .orderBy('c.expires_at', 'asc')
      .execute());
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
    const outcome = await withTenant(request.user.tenant_id, async (trx) => {
      const domain = await trx.selectFrom('onsite_domains')
        .select(['id', 'domain'])
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .executeTakeFirst();
      if (!domain) return null;

      const result = await refreshDomainCertificate(trx, request.user.tenant_id, domain);
      return { domain, result };
    });
    if (!outcome) return reply.status(404).send({ error: 'Domain not found' });

    if (!outcome.result.ok) {
      // 200, not an error status: the check ran and its finding is that the
      // host has no usable certificate. That is a result worth displaying, not
      // a failed request.
      return reply.send({ ok: false, error: outcome.result.error, domain: outcome.domain.domain });
    }
    return reply.send({ ok: true, domain: outcome.domain.domain, certificate: outcome.result.cert });
  });

  // ─── Provider Connections ────────────────────────────────────
  fastify.post('/provider-connections/:id/hostinger-dns/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ confirmed: z.literal(true), domain: z.string().min(1).max(253), page: z.number().int().min(1).max(10000), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      record: z.object({ name: z.string().min(1).max(253), type: z.string().min(1).max(10), ttl: z.number().int().positive(), value: z.string().min(1).max(4000), priority: z.number().nullable().optional() }),
    }).parse(request.body);
    const tenantId = request.user.tenant_id;
    const saved = await withTenant(tenantId, async trx => {
      const connection = await trx.selectFrom('onsite_provider_connections').select(['provider', 'status', 'access_token_cipher'])
        .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
      const domain = await trx.selectFrom('onsite_domains').select('id').where('tenant_id', '=', tenantId).where('domain', '=', body.domain).executeTakeFirst();
      if (!connection || !domain) return null;
      const records = await trx.selectFrom('onsite_dns_records as r').innerJoin('onsite_dns_zones as z', 'z.id', 'r.zone_id')
        .select(['r.id', 'r.name', 'r.type', 'r.ttl', 'r.value', 'r.priority'])
        .where('r.tenant_id', '=', tenantId).where('z.tenant_id', '=', tenantId).where('z.domain_id', '=', domain.id).execute();
      return { connection, record: records.find(row => row.name === body.record.name && row.type === body.record.type && row.value === body.record.value && row.ttl === body.record.ttl && row.priority === (body.record.priority ?? null)) };
    });
    if (!saved) return reply.status(404).send({ error: 'Saved domain or provider connection not found' });
    if (!saved.record) return reply.status(409).send({ error: 'Saved record changed. Reload the preview.' });
    if (saved.connection.provider !== 'hostinger' || saved.connection.status !== 'active' || !saved.connection.access_token_cipher) return reply.status(409).send({ error: 'An active Hostinger connection is required' });
    try {
      const token = decryptSecret(saved.connection.access_token_cipher);
      if (!(await listHostingerWebsites(token, body.page)).domains.includes(body.domain)) return reply.status(400).send({ error: 'Domain is not on the selected website inventory page' });
      return await withTenant(tenantId, async trx => {
        await sql`select pg_advisory_xact_lock(hashtextextended(${`hostinger-dns-publish:${tenantId}:${body.domain}`}, 0))`.execute(trx);
        const current = await trx.selectFrom('onsite_dns_records').select(['id', 'name', 'type', 'ttl', 'value', 'priority'])
          .where('tenant_id', '=', tenantId).where('id', '=', saved.record!.id).executeTakeFirst();
        if (!current || JSON.stringify([current.name, current.type, current.ttl, current.value, current.priority]) !== JSON.stringify([body.record.name, body.record.type, body.record.ttl, body.record.value, body.record.priority ?? null])) {
          return reply.status(409).send({ error: 'Saved record changed. Reload the preview.' });
        }
        const result = await publishHostingerDns(token, body.domain, current, body.fingerprint);
        await trx.updateTable('onsite_dns_records').set({ sync_status: 'synced', synced_at: new Date(), updated_at: new Date() })
          .where('tenant_id', '=', tenantId).where('id', '=', current.id).execute();
        if (result.published) await emitDomainEvent(trx, tenantId, { type: 'onsite.dns_record.published', sourceApp: 'onsite', entityType: 'onsite_dns_record', entityId: current.id,
          payload: { domain: body.domain, name: current.name, dns_type: current.type, provider: 'hostinger' }, actorId: actorId(request) });
        return result;
      });
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : 'Unable to publish DNS' });
    }
  });

  fastify.post('/provider-connections/:id/hostinger-dns/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { domain, page, record } = z.object({ domain: z.string().min(1).max(253), page: z.number().int().min(1).max(10000),
      record: z.object({ name: z.string().min(1).max(253), type: z.string().min(1).max(10), ttl: z.number().int().positive(), value: z.string().min(1).max(4000), priority: z.number().int().min(0).max(65535).nullable().optional() }),
    }).parse(request.body);
    const tenantId = request.user.tenant_id;
    const invalid = validateRecord(record);
    if (invalid) return reply.status(400).send({ error: invalid });
    if (record.type.toUpperCase() === 'NS' || (['MX', 'SRV'].includes(record.type.toUpperCase()) && record.priority == null)) return reply.status(400).send({ error: 'This record requires manual priority or delegation review' });
    const connection = await withTenant(tenantId, trx => trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'access_token_cipher']).where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!connection) return reply.status(404).send({ error: 'Provider connection not found' });
    if (connection.provider !== 'hostinger' || connection.status !== 'active' || !connection.access_token_cipher) return reply.status(409).send({ error: 'An active Hostinger connection is required' });
    try {
      const token = decryptSecret(connection.access_token_cipher);
      const inventory = await listHostingerWebsites(token, page);
      if (!inventory.domains.includes(domain)) return reply.status(400).send({ error: 'Domain is not on the selected inventory page' });
      const remote = await readHostingerDns(token, domain);
      if (!remote.some(row => !row.disabled && row.name === record.name && row.type === record.type && row.ttl === record.ttl && row.value === record.value && row.priority === (record.priority ?? null))) {
        return reply.status(409).send({ error: 'Provider record changed. Reload DNS before importing.' });
      }
      return await withTenant(tenantId, async trx => {
        await sql`select pg_advisory_xact_lock(hashtextextended(${`hostinger-dns-import:${tenantId}:${domain}`}, 0))`.execute(trx);
        const owned = await trx.selectFrom('onsite_domains').select('id').where('tenant_id', '=', tenantId).where('domain', '=', domain).executeTakeFirst();
        if (!owned) return reply.status(404).send({ error: 'Add the domain to your Onsite portfolio first' });
        const zones = await trx.selectFrom('onsite_dns_zones').select('id').where('tenant_id', '=', tenantId).where('domain_id', '=', owned.id).execute();
        if (zones.length !== 1) return reply.status(409).send({ error: 'Exactly one saved DNS zone is required for import' });
        const saved = await trx.selectFrom('onsite_dns_records').select(['name', 'type', 'ttl', 'value', 'priority'])
          .where('tenant_id', '=', tenantId).where('zone_id', '=', zones[0].id).execute();
        if (compareDnsRecords(domain, saved, [record]).matched === 1) return { imported: false };
        const proposal = proposeDnsSync(domain, saved, [record]).find(item => item.direction === 'import');
        if (!proposal || proposal.review.length) return reply.status(409).send({ error: proposal?.review.join(' ') || 'Record requires review' });
        const created = await trx.insertInto('onsite_dns_records').values({ tenant_id: tenantId, zone_id: zones[0].id, name: record.name,
          type: record.type.toUpperCase(), ttl: record.ttl, value: record.value, priority: record.priority ?? null, created_by: actorId(request),
        }).returning('id').executeTakeFirstOrThrow();
        await emitDomainEvent(trx, tenantId, { type: 'onsite.dns_record.created', sourceApp: 'onsite', entityType: 'onsite_dns_record', entityId: created.id,
          payload: { domain_id: owned.id, name: record.name, dns_type: record.type, provider: 'hostinger', operation: 'local_import' }, actorId: actorId(request) });
        return reply.status(201).send({ imported: true });
      });
    } catch {
      return reply.status(502).send({ error: 'Unable to import provider DNS. Reload records and try again.' });
    }
  });

  fastify.get('/provider-connections/:id/hostinger-dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { domain, page } = z.object({ domain: z.string().min(1).max(253), page: z.coerce.number().int().min(1).max(10000).default(1) }).parse(request.query);
    const connection = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'access_token_cipher']).where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst());
    if (!connection) return reply.status(404).send({ error: 'Provider connection not found' });
    if (connection.provider !== 'hostinger' || connection.status !== 'active' || !connection.access_token_cipher) return reply.status(409).send({ error: 'An active Hostinger connection is required' });
    try {
      const token = decryptSecret(connection.access_token_cipher);
      const inventory = await listHostingerWebsites(token, page);
      if (!inventory.domains.includes(domain)) return reply.status(400).send({ error: 'Domain is not on the selected website inventory page' });
      const records = await readHostingerDns(token, domain);
      const saved = await withTenant(request.user.tenant_id, async trx => {
        const ownedDomain = await trx.selectFrom('onsite_domains').select('id')
          .where('tenant_id', '=', request.user.tenant_id).where('domain', '=', domain).executeTakeFirst();
        if (!ownedDomain) return null;
        return await trx.selectFrom('onsite_dns_records as r').innerJoin('onsite_dns_zones as z', 'z.id', 'r.zone_id')
          .select(['r.name', 'r.type', 'r.ttl', 'r.value', 'r.priority'])
          .where('r.tenant_id', '=', request.user.tenant_id).where('z.tenant_id', '=', request.user.tenant_id)
          .where('z.domain_id', '=', ownedDomain.id).execute();
      });
      return { domain, records, fingerprint: dnsFingerprint(records), comparison: saved === null ? null : compareDnsRecords(domain, saved, records), proposals: saved === null ? [] : proposeDnsSync(domain, saved, records) };
    } catch {
      return reply.status(502).send({ error: 'Unable to read Hostinger DNS. The domain may use another DNS provider, or the connection may lack access.' });
    }
  });

  fastify.post('/provider-connections/:id/hostinger-websites/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { domain, page } = z.object({ domain: z.string().trim().min(1).max(253), page: z.number().int().min(1).max(10000).default(1) }).parse(request.body);
    const tenantId = request.user.tenant_id;
    const connection = await withTenant(tenantId, trx => trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'access_token_cipher']).where('id', '=', id)
      .where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!connection) return reply.status(404).send({ error: 'Provider connection not found' });
    if (connection.provider !== 'hostinger' || connection.status !== 'active' || !connection.access_token_cipher) {
      return reply.status(409).send({ error: 'An active Hostinger connection is required' });
    }
    let inventory;
    try {
      inventory = await listHostingerWebsites(decryptSecret(connection.access_token_cipher), page);
    } catch {
      return reply.status(502).send({ error: 'Unable to verify Hostinger website inventory' });
    }
    if (!inventory.domains.includes(domain)) return reply.status(400).send({ error: 'Website is not present on the selected Hostinger inventory page. Refresh inventory and try again.' });
    const result = await withTenant(tenantId, async trx => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`hostinger-import:${tenantId}:${domain}`}, 0))`.execute(trx);
      const existing = await trx.selectFrom('onsite_websites').select(['id', 'name', 'status', 'provider_connection_id'])
        .where('tenant_id', '=', tenantId).where('hosting_provider', '=', 'hostinger').where('name', '=', domain).executeTakeFirst();
      if (existing) {
        if (!existing.provider_connection_id) {
          await trx.updateTable('onsite_websites').set({ provider_connection_id: id, updated_at: new Date() })
            .where('tenant_id', '=', tenantId).where('id', '=', existing.id).execute();
        }
        return { website: existing, imported: false };
      }
      const website = await trx.insertInto('onsite_websites').values({ tenant_id: tenantId, name: domain,
        type: 'custom', status: 'inactive', hosting_provider: 'hostinger', provider_connection_id: id, created_by: actorId(request),
      }).returning(['id', 'name', 'status']).executeTakeFirstOrThrow();
      return { website, imported: true };
    });
    return reply.status(result.imported ? 201 : 200).send(result);
  });

  fastify.get('/provider-connections/:id/hostinger-websites', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { page } = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).parse(request.query);
    const connection = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'access_token_cipher']).where('id', '=', id)
      .where('tenant_id', '=', request.user.tenant_id).executeTakeFirst());
    if (!connection) return reply.status(404).send({ error: 'Provider connection not found' });
    if (connection.provider !== 'hostinger' || connection.status !== 'active' || !connection.access_token_cipher) {
      return reply.status(409).send({ error: 'An active Hostinger connection is required' });
    }
    try {
      return await listHostingerWebsites(decryptSecret(connection.access_token_cipher), page);
    } catch {
      return reply.status(502).send({ error: 'Unable to read Hostinger website inventory. Check provider access and try again.' });
    }
  });

  fastify.get('/provider-connections', async (request: FastifyRequest, reply: FastifyReply) => {
    const connections = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_provider_connections')
      .select([
        'id', 'tenant_id', 'provider', 'name',
        'external_id', 'external_name', 'status',
        'last_verified_at', 'error_message',
        'created_by', 'created_at', 'updated_at'
      ])
      .where('tenant_id', '=', request.user.tenant_id)
      .execute());
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
    const result = await withTenant(request.user.tenant_id, async (trx) => {
      const conn = await trx.insertInto('onsite_provider_connections')
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
      const updated = await trx.updateTable('onsite_provider_connections')
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

      return updated ?? conn;
    });

    return reply.status(201).send(result);
  });

  // ─── Websites CRUD & Grouping (Hostinger style) ───────────────
  fastify.get('/websites', async (request: FastifyRequest, reply: FastifyReply) => {
    const websites = await withTenant(request.user.tenant_id, trx => trx.selectFrom('onsite_websites')
      .selectAll()
      .where('tenant_id', '=', request.user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
    return reply.send(websites);
  });

  fastify.post('/websites', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = websiteCreateSchema.parse(request.body);

    const created = await withTenant(request.user.tenant_id, async (trx) => {
      const linkError = await validateOnsiteLinks(trx, request.user.tenant_id, body);
      if (linkError) return reply.status(400).send({ error: linkError });
      const row = await trx.insertInto('onsite_websites')
        .values({
          tenant_id: request.user.tenant_id,
          name: body.name,
          type: body.type ?? 'php',
          url: body.url ?? null,
          project_id: body.project_id ?? null,
          domain_id: body.domain_id ?? null,
          hosting_provider: body.hosting_provider ?? null,
          status: 'inactive',
          created_by: actorId(request),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      emitDomainEvent(trx, request.user.tenant_id, {
        type: 'onsite.website.created', sourceApp: 'onsite', entityType: 'onsite_website', entityId: row.id,
        payload: { name: row.name, type: row.type }, actorId: actorId(request),
      }).catch(console.error);

      return row;
    });

    if (reply.sent) return reply;
    return reply.status(201).send(created);
  });

  /**
   * Same "config only" honesty as /applications/:id/clone — not the
   * domain, hosting_id, url or health fields, all of which describe the
   * ORIGINAL's live instance and would be actively misleading to duplicate
   * onto a new row that has never actually been hosted anywhere.
   */
  fastify.post('/websites/:id/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = cloneSchema.parse(request.body);

    return withTenant(request.user.tenant_id, async (trx) => {
      const source = await trx.selectFrom('onsite_websites').selectAll()
        .where('id', '=', id).where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      if (!source) return reply.status(404).send({ error: 'Website not found' });

      const name = body.name?.trim() || `${source.name} (copy)`;
      const clone = await trx.insertInto('onsite_websites').values({
        tenant_id: request.user.tenant_id,
        name,
        type: source.type,
        url: null,
        hosting_provider: source.hosting_provider,
        status: 'inactive',
        created_by: actorId(request),
      }).returningAll().executeTakeFirstOrThrow();

      return reply.status(201).send(clone);
    });
  });

  fastify.delete('/websites/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('onsite_websites')
        .where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id)
        .returningAll()
        .executeTakeFirst();
      if (row) {
        emitDomainEvent(trx, request.user.tenant_id, {
          type: 'onsite.website.deleted', sourceApp: 'onsite', entityType: 'onsite_website', entityId: row.id,
          payload: { name: row.name }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });

    if (!deleted) return reply.status(404).send({ error: 'Website not found' });
    return reply.send({ success: true });
  });

  // ─── Domain Search (real RDAP availability) ───────────────────
  fastify.get('/domains/search-lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query } = request.query as { query?: string };
    const q = (query || '').trim().toLowerCase();

    const TLDS = ['.com', '.net', '.io', '.org', '.online', '.shop', '.co.tz', '.tz'];

    if (!q) {
      return reply.send({ query: '', suggestions: [] });
    }

    const baseName = q.includes('.') ? q.split('.')[0] : q;
    const results = await checkAvailabilityForTlds(baseName, TLDS);

    const suggestions = results.map((r, i) => ({
      domain: r.domain,
      tld: TLDS[i],
      available: r.available,
      // Real registrar pricing isn't available until a registrar is
      // connected (see POST /domains/request) — no invented figures here.
      error: r.error,
    }));

    return reply.send({ query: q, suggestions });
  });

  fastify.post('/domains/request', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = domainCreateSchema.pick({ domain: true }).parse(request.body);
    const cleanDomain = body.domain.trim().toLowerCase();
    const tenantId = request.user.tenant_id;

    const registrar = await resolveRegistrar(tenantId);

    const created = await withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('onsite_domains')
        .values({
          tenant_id: tenantId,
          domain: cleanDomain,
          status: registrar ? 'active' : 'pending',
          registrar: registrar?.label ?? null,
          notes: registrar ? null : 'Registration requested. Connect a domain registrar under Settings → Provider connections to complete the purchase.',
          created_by: actorId(request),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const zone = await trx.insertInto('onsite_dns_zones')
        .values({ tenant_id: tenantId, domain_id: row.id, provider: 'internal', status: 'active' })
        .returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('onsite_dns_records')
        .values([
          { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns1.hudumika.tz', ttl: 3600, created_by: actorId(request) },
          { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns2.hudumika.tz', ttl: 3600, created_by: actorId(request) },
        ]).execute();

      emitDomainEvent(trx, tenantId, {
        type: 'onsite.domain.requested', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: row.id,
        payload: { domain: row.domain, registrar_connected: !!registrar }, actorId: actorId(request),
      }).catch(console.error);

      return row;
    });

    if (registrar) {
      try {
        const result = await registrar.register(cleanDomain);
        await withTenant(tenantId, trx =>
          trx.updateTable('onsite_domains')
            .set({
              status: 'active',
              registered_at: new Date(),
              expires_at: result.expiresAt,
              nameservers: result.nameservers.length ? JSON.stringify(result.nameservers) : undefined,
              notes: `Registered via ${registrar.label}. Registrar ID: ${result.registrarId}`,
              updated_at: new Date(),
            })
            .where('id', '=', created.id).where('tenant_id', '=', tenantId).execute());
      } catch (err: any) {
        await withTenant(tenantId, trx =>
          trx.updateTable('onsite_domains')
            .set({ status: 'pending', notes: `Registration failed: ${err?.message ?? err}`, updated_at: new Date() })
            .where('id', '=', created.id).where('tenant_id', '=', tenantId).execute());
      }
    }

    return reply.status(201).send(created);
  });

  fastify.post('/domains/transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = domainTransferSchema.parse(request.body);
    const cleanDomain = body.domain.trim().toLowerCase();
    const tenantId = request.user.tenant_id;
    const eppCipher = body.eppCode ? encryptSecret(body.eppCode) : null;

    const registrar = await resolveRegistrar(tenantId);

    const created = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('onsite_domains')
        .values({
          tenant_id: tenantId,
          domain: cleanDomain,
          status: 'pending',
          registrar: registrar?.label ?? null,
          notes: JSON.stringify({ transfer: true, epp_cipher: eppCipher, epp_provided: !!body.eppCode }),
          created_by: actorId(request),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const zone = await trx.insertInto('onsite_dns_zones')
        .values({ tenant_id: tenantId, domain_id: row.id, provider: 'internal', status: 'active' })
        .returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('onsite_dns_records')
        .values([
          { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns1.hudumika.tz', ttl: 3600, created_by: actorId(request) },
          { tenant_id: tenantId, zone_id: zone.id, name: '@', type: 'NS', value: 'ns2.hudumika.tz', ttl: 3600, created_by: actorId(request) },
        ]).execute();

      emitDomainEvent(trx, tenantId, {
        type: 'onsite.domain.transfer_requested', sourceApp: 'onsite',
        entityType: 'onsite_domain', entityId: row.id,
        payload: { domain: row.domain, epp_provided: !!body.eppCode, registrar_connected: !!registrar },
        actorId: actorId(request),
      }).catch(console.error);

      return row;
    });

    if (registrar && body.eppCode) {
      try {
        const result = await registrar.transfer(cleanDomain, body.eppCode);
        await withTenant(tenantId, trx =>
          trx.updateTable('onsite_domains')
            .set({
              status: result.status === 'completed' ? 'active' : 'pending',
              registrar: registrar.label,
              notes: JSON.stringify({ transfer: true, transfer_id: result.transferId, transfer_status: result.status }),
              updated_at: new Date(),
            })
            .where('id', '=', created.id).where('tenant_id', '=', tenantId).execute());
      } catch (err: any) {
        await withTenant(tenantId, trx =>
          trx.updateTable('onsite_domains')
            .set({ notes: JSON.stringify({ transfer: true, epp_cipher: eppCipher, error: (err?.message ?? err).slice(0, 500) }), updated_at: new Date() })
            .where('id', '=', created.id).where('tenant_id', '=', tenantId).execute());
      }
    }

    return reply.status(201).send(created);
  });

  // ═══════════════════════════════════════════════════════════════
  //  SUBDOMAINS — derived from DNS records, no separate table
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/domains/:domainId/subdomains', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', domainId).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const zone = await withTenant(tenantId, trx => trx.selectFrom('onsite_dns_zones')
      .select('id').where('domain_id', '=', domainId).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!zone) return reply.send([]);

    const records = await withTenant(tenantId, trx => trx.selectFrom('onsite_dns_records')
      .selectAll().where('zone_id', '=', zone.id).where('tenant_id', '=', tenantId)
      .where('name', '!=', '@').where('name', '!=', domain.domain)
      .where('type', 'in', ['A', 'AAAA', 'CNAME', 'ALIAS'])
      .orderBy('name', 'asc').execute());

    const websites = await withTenant(tenantId, trx => trx.selectFrom('onsite_websites')
      .select(['id', 'name', 'url', 'domain_id']).where('tenant_id', '=', tenantId)
      .where('domain_id', '=', domainId).execute());

    const nameGroups = new Map<string, typeof records>();
    for (const r of records) {
      const group = nameGroups.get(r.name) ?? [];
      group.push(r);
      nameGroups.set(r.name, group);
    }

    const subdomains = [...nameGroups.entries()].map(([name, recs]) => {
      const fullDomain = `${name}.${domain.domain}`;
      const ws = websites.find(w => w.url?.includes(fullDomain));
      return {
        name, full_domain: fullDomain, records: recs,
        has_website: !!ws, website_id: ws?.id ?? null, website_name: ws?.name ?? null,
      };
    });

    return reply.send(subdomains);
  });

  const subdomainCreateSchema = z.object({
    name: z.string().trim().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i,
      'Subdomain must be a valid hostname label (letters, digits, hyphens).'),
    type: z.enum(['A', 'CNAME']).default('A'),
    value: z.string().trim().min(1).max(500),
    ttl: z.number().int().min(60).max(604800).optional(),
  });

  fastify.post('/domains/:domainId/subdomains', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const body = subdomainCreateSchema.parse(request.body);
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', domainId).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const validationError = validateRecord({ name: body.name, type: body.type, value: body.value, ttl: body.ttl });
    if (validationError) return reply.status(400).send({ error: validationError });

    const zone = await withTenant(tenantId, async trx => {
      let z = await trx.selectFrom('onsite_dns_zones').select('id')
        .where('domain_id', '=', domainId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!z) {
        z = await trx.insertInto('onsite_dns_zones')
          .values({ tenant_id: tenantId, domain_id: domainId, provider: 'internal' })
          .returning('id').executeTakeFirstOrThrow();
      }
      return z;
    });

    const existing = await withTenant(tenantId, trx => trx.selectFrom('onsite_dns_records')
      .select('id').where('zone_id', '=', zone.id).where('tenant_id', '=', tenantId)
      .where('name', '=', body.name.toLowerCase()).where('type', '=', body.type)
      .executeTakeFirst());
    if (existing) return reply.status(409).send({ error: `A ${body.type} record for ${body.name}.${domain.domain} already exists.` });

    const record = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('onsite_dns_records')
        .values({
          tenant_id: tenantId, zone_id: zone.id, name: body.name.toLowerCase(),
          type: body.type, value: body.value, ttl: body.ttl ?? 3600,
          created_by: actorId(request),
        })
        .returningAll().executeTakeFirstOrThrow();

      emitDomainEvent(trx, tenantId, {
        type: 'onsite.subdomain.created', sourceApp: 'onsite', entityType: 'onsite_dns_record', entityId: row.id,
        payload: { subdomain: `${body.name}.${domain.domain}`, type: body.type, value: body.value },
        actorId: actorId(request),
      }).catch(console.error);

      return row;
    });

    return reply.status(201).send({
      name: body.name, full_domain: `${body.name}.${domain.domain}`,
      records: [record], has_website: false, website_id: null, website_name: null,
    });
  });

  fastify.delete('/domains/:domainId/subdomains/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId, name: subName } = request.params as { domainId: string; name: string };
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', domainId).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const zone = await withTenant(tenantId, trx => trx.selectFrom('onsite_dns_zones')
      .select('id').where('domain_id', '=', domainId).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!zone) return reply.status(404).send({ error: 'No DNS zone for this domain' });

    const deleted = await withTenant(tenantId, async trx => {
      const rows = await trx.deleteFrom('onsite_dns_records')
        .where('zone_id', '=', zone.id).where('tenant_id', '=', tenantId)
        .where('name', '=', subName.toLowerCase())
        .where('type', 'in', ['A', 'AAAA', 'CNAME', 'ALIAS'])
        .returningAll().execute();

      if (rows.length > 0) {
        emitDomainEvent(trx, tenantId, {
          type: 'onsite.subdomain.deleted', sourceApp: 'onsite', entityType: 'onsite_dns_record',
          entityId: rows[0].id, payload: { subdomain: `${subName}.${domain.domain}`, records: rows.length },
          actorId: actorId(request),
        }).catch(console.error);
      }
      return rows;
    });

    if (deleted.length === 0) return reply.status(404).send({ error: 'Subdomain not found' });
    return reply.send({ success: true, deleted: deleted.length });
  });

  // ═══════════════════════════════════════════════════════════════
  //  EMAIL HOSTING — domain email setup, mailbox management
  // ═══════════════════════════════════════════════════════════════

  const emailDomainCreateSchema = z.object({
    domain_id: z.string().uuid(),
    provider: z.enum(['platform', 'google', 'microsoft', 'external']).default('platform'),
  });

  const mailboxCreateSchema = z.object({
    local_part: z.string().trim().min(1).max(64).regex(/^[a-z0-9._+-]+$/i,
      'Local part must contain only letters, digits, dots, hyphens, underscores or plus signs.'),
    display_name: z.string().max(255).optional(),
    type: z.enum(['mailbox', 'alias', 'forward', 'group']).default('mailbox'),
    linked_user_id: z.string().uuid().optional(),
    target_mailbox_id: z.string().uuid().optional(),
    forward_to: z.array(z.string().email()).optional(),
    quota_mb: z.number().int().positive().optional(),
  });

  // List email-enabled domains
  fastify.get('/email-domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;

    const rows = await withTenant(tenantId, async trx => {
      const emailDomains = await trx.selectFrom('onsite_email_domains as ed')
        .innerJoin('onsite_domains as d', 'd.id', 'ed.domain_id')
        .select([
          'ed.id', 'ed.tenant_id', 'ed.domain_id', 'ed.provider',
          'ed.mx_verified', 'ed.spf_verified', 'ed.dkim_verified', 'ed.dmarc_verified',
          'ed.last_verified_at', 'ed.catch_all_action', 'ed.catch_all_address',
          'ed.status', 'ed.created_by', 'ed.created_at', 'ed.updated_at',
          'd.domain', 'd.status as domain_status',
        ])
        .where('ed.tenant_id', '=', tenantId)
        .orderBy('ed.created_at', 'desc')
        .execute();

      const counts = await trx.selectFrom('onsite_email_mailboxes')
        .select(['email_domain_id', sql<number>`count(*)::int`.as('cnt')])
        .where('tenant_id', '=', tenantId)
        .groupBy('email_domain_id')
        .execute();
      const countMap = new Map(counts.map(c => [c.email_domain_id, c.cnt]));

      return emailDomains.map(ed => ({ ...ed, mailbox_count: countMap.get(ed.id) ?? 0 }));
    });

    return reply.send(rows);
  });

  // Enable email on a domain
  fastify.post('/email-domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = emailDomainCreateSchema.parse(request.body);
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', body.domain_id).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const existing = await withTenant(tenantId, trx => trx.selectFrom('onsite_email_domains')
      .select('id').where('domain_id', '=', body.domain_id).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (existing) return reply.status(409).send({ error: 'Email is already enabled on this domain.' });

    const created = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('onsite_email_domains')
        .values({
          tenant_id: tenantId, domain_id: body.domain_id, provider: body.provider,
          created_by: actorId(request),
        })
        .returningAll().executeTakeFirstOrThrow();

      emitDomainEvent(trx, tenantId, {
        type: 'onsite.email_domain.created', sourceApp: 'onsite',
        entityType: 'onsite_email_domain', entityId: row.id,
        payload: { domain: domain.domain, provider: body.provider },
        actorId: actorId(request),
      }).catch(console.error);

      return { ...row, domain: domain.domain, domain_status: 'active', mailbox_count: 0 };
    });

    return reply.status(201).send(created);
  });

  // Verify DNS records for an email domain
  fastify.post('/email-domains/:id/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const emailDomain = await withTenant(tenantId, trx =>
      trx.selectFrom('onsite_email_domains as ed')
        .innerJoin('onsite_domains as d', 'd.id', 'ed.domain_id')
        .select(['ed.id', 'ed.provider', 'ed.required_dns_records', 'd.domain'])
        .where('ed.id', '=', id).where('ed.tenant_id', '=', tenantId)
        .executeTakeFirst());
    if (!emailDomain) return reply.status(404).send({ error: 'Email domain not found' });

    const verification = await verifyMailDns(emailDomain.domain, mailDnsRecordsSchema.parse(emailDomain.required_dns_records));
    const allVerified = verification.mx.found && verification.spf.found && verification.dkim.found && verification.dmarc.found;

    await withTenant(tenantId, trx => trx.updateTable('onsite_email_domains')
      .set({
        mx_verified: verification.mx.found,
        spf_verified: verification.spf.found,
        dkim_verified: verification.dkim.found,
        dmarc_verified: verification.dmarc.found,
        last_verified_at: new Date(),
        status: allVerified ? 'active' : 'pending',
        updated_at: new Date(),
      })
      .where('id', '=', id).where('tenant_id', '=', tenantId).execute());

    return reply.send(verification);
  });

  // Get required DNS records for email setup
  fastify.get('/email-domains/:id/required-records', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const emailDomain = await withTenant(tenantId, trx =>
      trx.selectFrom('onsite_email_domains as ed')
        .innerJoin('onsite_domains as d', 'd.id', 'ed.domain_id')
        .select(['ed.id', 'ed.provider', 'ed.required_dns_records', 'd.domain'])
        .where('ed.id', '=', id).where('ed.tenant_id', '=', tenantId)
        .executeTakeFirst());
    if (!emailDomain) return reply.status(404).send({ error: 'Email domain not found' });

    return reply.send(emailDomain.required_dns_records);
  });

  // Delete email domain config
  fastify.delete('/email-domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const deleted = await withTenant(tenantId, async trx => {
      const row = await trx.deleteFrom('onsite_email_domains')
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      if (row) {
        emitDomainEvent(trx, tenantId, {
          type: 'onsite.email_domain.deleted', sourceApp: 'onsite',
          entityType: 'onsite_email_domain', entityId: row.id,
          payload: { domain_id: row.domain_id }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });

    if (!deleted) return reply.status(404).send({ error: 'Email domain not found' });
    return reply.send({ success: true });
  });

  // ─── Mailboxes ───────────────────────────────────────────────

  fastify.get('/email-domains/:id/mailboxes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const mailboxes = await withTenant(tenantId, trx =>
      trx.selectFrom('onsite_email_mailboxes as m')
        .leftJoin('users as u', 'u.id', 'm.linked_user_id')
        .select([
          'm.id', 'm.tenant_id', 'm.email_domain_id', 'm.local_part', 'm.full_address',
          'm.display_name', 'm.type', 'm.linked_user_id', 'm.target_mailbox_id',
          'm.forward_to', 'm.quota_mb', 'm.usage_mb', 'm.message_count',
          'm.status', 'm.created_by', 'm.created_at', 'm.updated_at',
          'm.provision_status', 'm.provision_error', 'm.provider_mailbox_id',
          'u.name as linked_user_name', 'u.email as linked_user_email',
        ])
        .where('m.email_domain_id', '=', id).where('m.tenant_id', '=', tenantId)
        .orderBy('m.local_part', 'asc').execute());

    return reply.send(mailboxes);
  });

  fastify.post('/email-domains/:id/mailboxes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = mailboxCreateSchema.parse(request.body);
    const tenantId = request.user.tenant_id;

    const emailDomain = await withTenant(tenantId, trx =>
      trx.selectFrom('onsite_email_domains as ed')
        .innerJoin('onsite_domains as d', 'd.id', 'ed.domain_id')
        .select(['ed.id', 'd.domain'])
        .where('ed.id', '=', id).where('ed.tenant_id', '=', tenantId)
        .executeTakeFirst());
    if (!emailDomain) return reply.status(404).send({ error: 'Email domain not found' });

    const fullAddress = `${body.local_part.toLowerCase()}@${emailDomain.domain}`;

    if (body.type === 'alias' && !body.target_mailbox_id) {
      return reply.status(400).send({ error: 'An alias needs a target mailbox.' });
    }
    if (body.type === 'forward' && (!body.forward_to || body.forward_to.length === 0)) {
      return reply.status(400).send({ error: 'A forward needs at least one destination address.' });
    }
    if (body.type === 'group' && (!body.forward_to || body.forward_to.length === 0)) {
      return reply.status(400).send({ error: 'A group needs at least one member address.' });
    }

    if (body.linked_user_id) {
      const user = await withTenant(tenantId, trx =>
        trx.selectFrom('users').select('id').where('id', '=', body.linked_user_id!)
          .where('tenant_id', '=', tenantId).executeTakeFirst());
      if (!user) return reply.status(400).send({ error: 'The selected user does not belong to this workspace.' });
    }

    if (body.target_mailbox_id) {
      const target = await withTenant(tenantId, trx =>
        trx.selectFrom('onsite_email_mailboxes').select('id')
          .where('id', '=', body.target_mailbox_id!).where('tenant_id', '=', tenantId)
          .where('email_domain_id', '=', id).executeTakeFirst());
      if (!target) return reply.status(400).send({ error: 'The target mailbox does not exist on this domain.' });
    }

    const emailDomainRow = await withTenant(tenantId, trx =>
      trx.selectFrom('onsite_email_domains').select('provider')
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());

    const mailbox = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('onsite_email_mailboxes')
        .values({
          tenant_id: tenantId, email_domain_id: id,
          local_part: body.local_part.toLowerCase(),
          full_address: fullAddress,
          display_name: body.display_name ?? null,
          type: body.type,
          linked_user_id: body.linked_user_id ?? null,
          target_mailbox_id: body.target_mailbox_id ?? null,
          forward_to: JSON.stringify(body.forward_to ?? []),
          quota_mb: body.quota_mb ?? null,
          created_by: actorId(request),
        })
        .returningAll().executeTakeFirstOrThrow();

      const provision = await provisionMailbox(trx, {
        tenantId, mailboxId: row.id, fullAddress,
        displayName: body.display_name ?? null,
        type: body.type,
        provider: emailDomainRow?.provider ?? 'platform',
        linkedUserId: body.linked_user_id ?? null,
      });

      emitDomainEvent(trx, tenantId, {
        type: 'onsite.mailbox.created', sourceApp: 'onsite',
        entityType: 'onsite_email_mailbox', entityId: row.id,
        payload: { address: fullAddress, type: body.type },
        actorId: actorId(request),
      }).catch(console.error);

      return { ...row, provision_pending: provision.pendingReason ?? null };
    });

    return reply.status(201).send(mailbox);
  });

  fastify.delete('/email-domains/:emailDomainId/mailboxes/:mailboxId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { emailDomainId, mailboxId } = request.params as { emailDomainId: string; mailboxId: string };
    const tenantId = request.user.tenant_id;

    const deleted = await withTenant(tenantId, async trx => {
      const row = await trx.deleteFrom('onsite_email_mailboxes')
        .where('id', '=', mailboxId).where('email_domain_id', '=', emailDomainId)
        .where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst();
      if (row) {
        if (row.linked_user_id && row.type === 'mailbox') {
          await deprovisionMailbox(trx, tenantId, row.linked_user_id, row.full_address);
        }
        emitDomainEvent(trx, tenantId, {
          type: 'onsite.mailbox.deleted', sourceApp: 'onsite',
          entityType: 'onsite_email_mailbox', entityId: row.id,
          payload: { address: row.full_address }, actorId: actorId(request),
        }).catch(console.error);
      }
      return row;
    });

    if (!deleted) return reply.status(404).send({ error: 'Mailbox not found' });
    return reply.send({ success: true });
  });

  // ─── Tenant email users (for mailbox → user linking) ──────────
  fastify.get('/email-users', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user.tenant_id;
    const users = await withTenant(tenantId, trx =>
      trx.selectFrom('users').select(['id', 'name', 'email'])
        .where('tenant_id', '=', tenantId)
        .orderBy('name', 'asc').execute());
    return reply.send(users);
  });

  // ─── Provider-connected website info (SSH/WordPress/DB) ───────
  fastify.get('/websites/:id/provider-info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const website = await withTenant(tenantId, trx => trx.selectFrom('onsite_websites')
      .selectAll().where('id', '=', id).where('tenant_id', '=', tenantId)
      .executeTakeFirst());
    if (!website) return reply.status(404).send({ error: 'Website not found' });

    if (!website.provider_connection_id) {
      return reply.send({
        connected: false,
        provider: null,
        ssh: null, wordpress: null, databases: null,
        message: 'No hosting provider is connected to this website. Link one in Settings → Provider connections.',
      });
    }

    const connection = await withTenant(tenantId, trx => trx.selectFrom('onsite_provider_connections')
      .select(['provider', 'status', 'external_id', 'external_name', 'access_token_cipher'])
      .where('id', '=', website.provider_connection_id!)
      .where('tenant_id', '=', tenantId).executeTakeFirst());

    if (!connection || connection.status !== 'active') {
      return reply.send({
        connected: false, provider: connection?.provider ?? null,
        ssh: null, wordpress: null, databases: null,
        message: 'The linked provider connection is not active.',
      });
    }

    const info: Record<string, unknown> = {
      connected: true, provider: connection.provider,
      ssh: null, wordpress: null, databases: null,
    };

    if (connection.provider === 'hostinger' && connection.access_token_cipher) {
      try {
        const token = decryptSecret(connection.access_token_cipher);
        const res = await fetch(`https://developers.hostinger.com/api/hosting/v1/websites`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const sites = await res.json();
          const rows = Array.isArray(sites) ? sites : sites?.data ?? [];
          const match = rows.find((s: any) => s.domain === website.url?.replace(/^https?:\/\//, '').replace(/\/$/, ''));
          if (match) {
            info.ssh = match.ssh ? { host: match.ssh.host, port: match.ssh.port, username: match.ssh.username } : null;
            info.wordpress = match.cms_detected ?? null;
            info.databases = match.databases ?? null;
          }
        }
      } catch { /* provider unreachable — info stays null */ }
    }

    return reply.send(info);
  });

  // ═══════════════════════════════════════════════════════════════
  //  HOSTING OPERATIONS — WordPress, Databases, SSH, Analytics
  // ═══════════════════════════════════════════════════════════════

  // ─── WordPress ─────────────────────────────────────────────────
  fastify.get('/websites/:id/wordpress', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.send({ connected: false, wordpress: null });
    try {
      const wp = await resolved.provider.getWordPress(resolved.hostingId);
      return reply.send({ connected: true, wordpress: wp });
    } catch (err: any) {
      return reply.status(502).send({ error: `WordPress check failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/wordpress/install', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      title: z.string().trim().min(1).max(200),
      admin_user: z.string().trim().min(3).max(50),
      admin_email: z.string().email(),
      admin_password: z.string().min(8).max(100),
    }).parse(request.body);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected to this website.' });
    try {
      const wp = await resolved.provider.installWordPress(resolved.hostingId, body.title, body.admin_user, body.admin_email, body.admin_password);
      emitDomainEventStandalone(request.user.tenant_id, {
        type: 'onsite.wordpress.installed', sourceApp: 'onsite', entityType: 'onsite_website', entityId: id,
        payload: { admin_user: body.admin_user }, actorId: actorId(request),
      }).catch(console.error);
      return reply.send({ wordpress: wp });
    } catch (err: any) {
      return reply.status(502).send({ error: `WordPress installation failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/wordpress/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      const wp = await resolved.provider.updateWordPress(resolved.hostingId);
      return reply.send({ wordpress: wp });
    } catch (err: any) {
      return reply.status(502).send({ error: `WordPress update failed: ${err?.message ?? err}` });
    }
  });

  fastify.get('/websites/:id/wordpress/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.send([]);
    try {
      return reply.send(await resolved.provider.getWordPressPlugins(resolved.hostingId));
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to load plugins: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/wordpress/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { slug } = z.object({ slug: z.string().trim().min(1).max(200) }).parse(request.body);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      const plugin = await resolved.provider.installWordPressPlugin(resolved.hostingId, slug);
      return reply.status(201).send(plugin);
    } catch (err: any) {
      return reply.status(502).send({ error: `Plugin install failed: ${err?.message ?? err}` });
    }
  });

  fastify.delete('/websites/:id/wordpress/plugins/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, slug } = request.params as { id: string; slug: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      await resolved.provider.removeWordPressPlugin(resolved.hostingId, slug);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `Plugin removal failed: ${err?.message ?? err}` });
    }
  });

  // ─── Databases ─────────────────────────────────────────────────
  fastify.get('/websites/:id/databases', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.send({ connected: false, databases: [] });
    try {
      const databases = await resolved.provider.listDatabases(resolved.hostingId);
      return reply.send({ connected: true, databases });
    } catch (err: any) {
      return reply.status(502).send({ error: `Failed to list databases: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/databases', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().trim().min(1).max(64),
      password: z.string().min(8).max(100),
    }).parse(request.body);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      const db = await resolved.provider.createDatabase(resolved.hostingId, body.name, body.password);
      return reply.status(201).send(db);
    } catch (err: any) {
      return reply.status(502).send({ error: `Database creation failed: ${err?.message ?? err}` });
    }
  });

  fastify.delete('/websites/:id/databases/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, name } = request.params as { id: string; name: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      await resolved.provider.deleteDatabase(resolved.hostingId, name);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `Database deletion failed: ${err?.message ?? err}` });
    }
  });

  // ─── SSH Keys ──────────────────────────────────────────────────
  fastify.get('/websites/:id/ssh', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.send({ connected: false, ssh: null, keys: [] });
    try {
      const [ssh, keys] = await Promise.all([
        resolved.provider.getSSH(resolved.hostingId),
        resolved.provider.listSSHKeys(resolved.hostingId),
      ]);
      return reply.send({ connected: true, ssh, keys });
    } catch (err: any) {
      return reply.status(502).send({ error: `SSH info failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/ssh/keys', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().trim().min(1).max(100),
      public_key: z.string().trim().min(20).max(10000),
    }).parse(request.body);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      const key = await resolved.provider.addSSHKey(resolved.hostingId, body.name, body.public_key);
      return reply.status(201).send(key);
    } catch (err: any) {
      return reply.status(502).send({ error: `SSH key add failed: ${err?.message ?? err}` });
    }
  });

  fastify.delete('/websites/:id/ssh/keys/:keyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, keyId } = request.params as { id: string; keyId: string };
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      await resolved.provider.removeSSHKey(resolved.hostingId, keyId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `SSH key removal failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/websites/:id/ssh/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { password } = z.object({ password: z.string().min(8).max(100) }).parse(request.body);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.status(409).send({ error: 'No hosting provider connected.' });
    try {
      await resolved.provider.resetSSHPassword(resolved.hostingId, password);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `SSH password reset failed: ${err?.message ?? err}` });
    }
  });

  // ─── Analytics / Traffic ───────────────────────────────────────
  fastify.get('/websites/:id/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { period } = z.object({ period: z.string().max(20).default('30d') }).parse(request.query);
    const resolved = await resolveHostingProviderForWebsite(request.user.tenant_id, id);
    if (!resolved) return reply.send({ connected: false, stats: null });
    try {
      const stats = await resolved.provider.getTrafficStats(resolved.hostingId, period);
      return reply.send({ connected: true, stats });
    } catch (err: any) {
      return reply.status(502).send({ error: `Analytics failed: ${err?.message ?? err}` });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  DOMAIN REGISTRAR OPERATIONS — renew, info, nameservers
  // ═══════════════════════════════════════════════════════════════

  fastify.post('/domains/:id/renew', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { years } = z.object({ years: z.number().int().min(1).max(10).default(1) }).parse(request.body);
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain', 'registrar']).where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const registrar = await resolveRegistrar(tenantId);
    if (!registrar) return reply.status(409).send({ error: NO_REGISTRAR_MESSAGE });

    try {
      const result = await registrar.renew(domain.domain, years);
      await withTenant(tenantId, trx =>
        trx.updateTable('onsite_domains')
          .set({ expires_at: result.expiresAt, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', tenantId).execute());
      emitDomainEventStandalone(tenantId, {
        type: 'onsite.domain.renewed', sourceApp: 'onsite', entityType: 'onsite_domain', entityId: id,
        payload: { domain: domain.domain, years, new_expiry: result.expiresAt.toISOString() },
        actorId: actorId(request),
      }).catch(console.error);
      return reply.send({ success: true, expires_at: result.expiresAt, transaction_id: result.transactionId });
    } catch (err: any) {
      return reply.status(502).send({ error: `Domain renewal failed: ${err?.message ?? err}` });
    }
  });

  fastify.get('/domains/:id/registrar-info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const registrar = await resolveRegistrar(tenantId);
    if (!registrar) return reply.send({ connected: false, info: null });

    try {
      const info = await registrar.getInfo(domain.domain);
      await withTenant(tenantId, trx =>
        trx.updateTable('onsite_domains')
          .set({
            expires_at: info.expiresAt,
            auto_renew: info.autoRenew,
            nameservers: info.nameservers.length ? JSON.stringify(info.nameservers) : undefined,
            updated_at: new Date(),
          })
          .where('id', '=', id).where('tenant_id', '=', tenantId).execute());
      return reply.send({ connected: true, info });
    } catch (err: any) {
      return reply.status(502).send({ error: `Registrar info failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/domains/:id/nameservers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { nameservers } = z.object({ nameservers: z.array(z.string().min(1).max(253)).min(1).max(8) }).parse(request.body);
    const tenantId = request.user.tenant_id;

    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });

    const registrar = await resolveRegistrar(tenantId);
    if (!registrar) return reply.status(409).send({ error: NO_REGISTRAR_MESSAGE });

    try {
      await registrar.setNameservers(domain.domain, nameservers);
      await withTenant(tenantId, trx =>
        trx.updateTable('onsite_domains')
          .set({ nameservers: JSON.stringify(nameservers), updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', tenantId).execute());
      return reply.send({ success: true, nameservers });
    } catch (err: any) {
      return reply.status(502).send({ error: `Nameserver update failed: ${err?.message ?? err}` });
    }
  });

  fastify.post('/domains/:id/unlock', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user.tenant_id;
    const domain = await withTenant(tenantId, trx => trx.selectFrom('onsite_domains')
      .select(['id', 'domain']).where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!domain) return reply.status(404).send({ error: 'Domain not found' });
    const registrar = await resolveRegistrar(tenantId);
    if (!registrar) return reply.status(409).send({ error: NO_REGISTRAR_MESSAGE });
    try {
      await registrar.unlock(domain.domain);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(502).send({ error: `Domain unlock failed: ${err?.message ?? err}` });
    }
  });

  fastify.get('/domains/registrar-check', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domains } = z.object({ domains: z.string().min(1) }).parse(request.query);
    const domainList = domains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (!domainList.length) return reply.status(400).send({ error: 'No domains provided' });

    const registrar = await resolveRegistrar(request.user.tenant_id);
    if (!registrar) return reply.send({ connected: false, results: domainList.map(d => ({ domain: d, available: false, premium: false, price: null })) });

    try {
      const results = await registrar.checkAvailability(domainList);
      return reply.send({ connected: true, registrar: registrar.label, results });
    } catch (err: any) {
      return reply.status(502).send({ error: `Registrar check failed: ${err?.message ?? err}` });
    }
  });
}
