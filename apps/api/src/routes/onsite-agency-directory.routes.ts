import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { MailService } from '../services/mail.service.js';

const PRICING_TIERS = ['budget', 'standard', 'premium'] as const;

const profileWriteSchema = z.object({
  headline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  service_tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  portfolio_links: z.array(z.string().trim().url().max(500)).max(10).default([]),
  pricing_tier: z.enum(PRICING_TIERS),
  region: z.string().trim().max(100).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

const inquirySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(1).max(4000),
});

function actorId(request: FastifyRequest): string | null {
  const sub = request.user?.sub ?? '';
  return sub.startsWith('apikey:') ? null : sub;
}

/**
 * AgencyHost M7 — public agency directory. Two auth postures in one file:
 * the public browse/inquire routes below take NO auth hook at all (a
 * prospective client has no Hudumika account, matching onboarding.routes.ts's
 * own check-subdomain precedent), while the tenant self-service and
 * SUPER_ADMIN moderation routes are gated normally, registered further down.
 */
export async function onsiteAgencyDirectoryPublicRoutes(fastify: FastifyInstance) {
  // GET / — filterable list of approved profiles only.
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = z.object({
      region: z.string().trim().optional(),
      pricing_tier: z.enum(PRICING_TIERS).optional(),
      service_tag: z.string().trim().optional(),
      q: z.string().trim().optional(),
    }).parse(request.query);

    const conditions: any[] = [sql`p.status = 'approved'`];
    if (query.region) conditions.push(sql`p.region = ${query.region}`);
    if (query.pricing_tier) conditions.push(sql`p.pricing_tier = ${query.pricing_tier}`);
    if (query.service_tag) conditions.push(sql`p.service_tags @> ${JSON.stringify([query.service_tag])}::jsonb`);
    if (query.q) conditions.push(sql`(p.headline ILIKE ${'%' + query.q + '%'} OR p.description ILIKE ${'%' + query.q + '%'})`);

    const result = await sql<any>`
      SELECT
        p.id, p.tenant_id, p.headline, p.description, p.service_tags,
        p.portfolio_links, p.pricing_tier, p.region, p.languages,
        p.created_at, t.name AS tenant_name, t.logo_url AS tenant_logo_url,
        (
          SELECT count(*)::int FROM agency_managed_tenants amt
          WHERE amt.agency_tenant_id = p.tenant_id AND amt.status = 'active'
        ) AS client_count
      FROM onsite_agency_profiles p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY p.updated_at DESC
    `.execute(dbPlatform);
    return reply.send(result.rows);
  });

  // GET /:id — public single-profile view. Increments profile_views once per
  // real call — the genuine counter this milestone promises, never seeded.
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await sql<any>`
      SELECT
        p.id, p.tenant_id, p.headline, p.description, p.service_tags,
        p.portfolio_links, p.pricing_tier, p.region, p.languages, p.status,
        p.created_at, t.name AS tenant_name, t.logo_url AS tenant_logo_url,
        (
          SELECT count(*)::int FROM agency_managed_tenants amt
          WHERE amt.agency_tenant_id = p.tenant_id AND amt.status = 'active'
        ) AS client_count
      FROM onsite_agency_profiles p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.id = ${id} AND p.status = 'approved'
    `.execute(dbPlatform);
    const profile = result.rows[0];
    if (!profile) return reply.status(404).send({ error: 'Agency profile not found' });

    await sql`UPDATE onsite_agency_profiles SET profile_views = profile_views + 1 WHERE id = ${id}`.execute(dbPlatform);
    return reply.send(profile);
  });

  // POST /:id/inquire — the one write a genuinely anonymous caller can
  // trigger, so it's the one route in this file behind its own rate limit.
  fastify.post('/:id/inquire', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = inquirySchema.parse(request.body);

    const profile = await dbPlatform.selectFrom('onsite_agency_profiles')
      .select(['id', 'tenant_id', 'headline'])
      .where('id', '=', id).where('status', '=', 'approved')
      .executeTakeFirst();
    if (!profile) return reply.status(404).send({ error: 'Agency profile not found' });

    await sql`UPDATE onsite_agency_profiles SET inquiries_count = inquiries_count + 1 WHERE id = ${id}`.execute(dbPlatform);

    // 'TENANT_ADMIN' is a deprecated alias (see UserRole in packages/types) —
    // every tenant created since is assigned 'ADMIN' instead, so matching
    // only the old value would silently never reach a real agency. Match
    // both, the same way requireRole('ADMIN', 'TENANT_ADMIN', ...) does
    // everywhere else in this codebase.
    const admins = await dbPlatform.selectFrom('users')
      .select('email')
      .where('tenant_id', '=', profile.tenant_id)
      .where('role', 'in', ['ADMIN', 'TENANT_ADMIN'])
      .where('active', '=', true)
      .execute();
    const vars = {
      headline: profile.headline,
      inquirerName: body.name,
      inquirerEmail: body.email,
      message: body.message,
    };
    await Promise.all(admins.map(a =>
      MailService.enqueueTemplated(profile.tenant_id, 'agency.directory_inquiry', a.email, vars, 'onsite').catch(() => {})
    ));

    return reply.send({ success: true });
  });
}

/**
 * Authenticated half: a tenant managing its own directory listing, and
 * SUPER_ADMIN moderation. Registered under /v1/onsite/agency/directory.
 */
export async function onsiteAgencyDirectoryManageRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ─── Tenant self-service ────────────────────────────────────
  fastify.get('/mine', {
    preHandler: [requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'), requireEntitlement('onsite')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user!.tenant_id;
    const profile = await dbPlatform.selectFrom('onsite_agency_profiles')
      .selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!profile) return reply.send(null);

    // Same live join as the public listing — a tenant reviewing its own
    // "clients managed" count must see the real number, not silently 0
    // because this one query forgot the join every other listing computes it with.
    const clientCount = await dbPlatform.selectFrom('agency_managed_tenants')
      .select(sql<number>`count(*)::int`.as('c'))
      .where('agency_tenant_id', '=', tenantId).where('status', '=', 'active')
      .executeTakeFirst();
    return reply.send({ ...profile, client_count: clientCount?.c ?? 0 });
  });

  fastify.post('/mine', {
    preHandler: [requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'), requireEntitlement('onsite')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user!.tenant_id;
    const body = profileWriteSchema.parse(request.body);

    const existing = await dbPlatform.selectFrom('onsite_agency_profiles')
      .select('id').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (existing) return reply.status(409).send({ error: 'A profile already exists for this workspace — use PUT /mine to edit it.' });

    const created = await dbPlatform.insertInto('onsite_agency_profiles').values({
      tenant_id: tenantId,
      headline: body.headline,
      description: body.description,
      service_tags: JSON.stringify(body.service_tags),
      portfolio_links: JSON.stringify(body.portfolio_links),
      pricing_tier: body.pricing_tier,
      region: body.region ?? null,
      languages: JSON.stringify(body.languages),
      status: 'pending',
      created_by: actorId(request),
    } as any).returningAll().executeTakeFirstOrThrow();
    return reply.send(created);
  });

  fastify.put('/mine', {
    preHandler: [requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'), requireEntitlement('onsite')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.user!.tenant_id;
    const body = profileWriteSchema.parse(request.body);

    // An edit to an approved listing needs re-review — status always resets
    // to 'pending' on write, exactly like the milestone's own moderation
    // intent (an approved agency can't silently rewrite its listing to
    // something a moderator never saw).
    const updated = await dbPlatform.updateTable('onsite_agency_profiles')
      .set({
        headline: body.headline,
        description: body.description,
        service_tags: JSON.stringify(body.service_tags),
        portfolio_links: JSON.stringify(body.portfolio_links),
        pricing_tier: body.pricing_tier,
        region: body.region ?? null,
        languages: JSON.stringify(body.languages),
        status: 'pending',
        updated_at: new Date(),
      } as any)
      .where('tenant_id', '=', tenantId)
      .returningAll().executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'No profile to update — submit one with POST /mine first.' });
    return reply.send(updated);
  });

  // ─── SUPER_ADMIN moderation ─────────────────────────────────
  fastify.get('/admin', { preHandler: requireRole('SUPER_ADMIN') }, async (_request, reply) => {
    const result = await sql<any>`
      SELECT
        p.id, p.tenant_id, p.headline, p.description, p.service_tags,
        p.portfolio_links, p.pricing_tier, p.region, p.languages, p.status,
        p.profile_views, p.inquiries_count, p.created_at, p.updated_at,
        t.name AS tenant_name, t.logo_url AS tenant_logo_url
      FROM onsite_agency_profiles p
      JOIN tenants t ON t.id = p.tenant_id
      ORDER BY p.created_at DESC
    `.execute(dbPlatform);
    return reply.send(result.rows);
  });

  fastify.patch('/admin/:id/status', { preHandler: requireRole('SUPER_ADMIN') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(request.body);

    const updated = await dbPlatform.updateTable('onsite_agency_profiles')
      .set({ status, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll().executeTakeFirst();
    if (!updated) return reply.status(404).send({ error: 'Agency profile not found' });
    return reply.send(updated);
  });
}
