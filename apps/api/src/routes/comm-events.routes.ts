import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { COMM_EVENT_REGISTRY } from '../config/comm-event-registry.js';
import { CommEventsService } from '../services/comm-events.service.js';
import crypto from 'node:crypto';

export async function commEventsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (req: any, reply) => {
    if (req.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
  });

  // GET /v1/comm/events — list all registered events with tenant config overlay
  fastify.get('/events', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const configs = await trx.selectFrom('tenant_event_configs').selectAll()
        .where('tenant_id', '=', user.tenant_id).execute();
      const configMap = new Map(configs.map(c => [c.event_key, c]));

      return COMM_EVENT_REGISTRY.map(def => {
        const config = configMap.get(def.event_key);
        return {
          ...def,
          is_enabled: config ? config.is_enabled : true,
          channel: config?.channel ?? def.default_channel,
          channels: config?.channels ?? [config?.channel ?? def.default_channel],
          template_key: config?.template_key ?? def.default_template,
          locale: config?.locale ?? def.default_locale,
          recipient_rules: config?.recipient_rules ?? def.recipient_resolvers,
          has_override: !!config,
        };
      });
    });
  });

  // GET /v1/comm/events/:key — event details + tenant config
  fastify.get('/events/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const def = COMM_EVENT_REGISTRY.find(e => e.event_key === key);
    if (!def) return reply.status(404).send({ error: 'Event not found' });
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const config = await trx.selectFrom('tenant_event_configs').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('event_key', '=', key).executeTakeFirst();
      return {
        ...def,
        is_enabled: config ? config.is_enabled : true,
        channel: config?.channel ?? def.default_channel,
        channels: config?.channels ?? [config?.channel ?? def.default_channel],
        template_key: config?.template_key ?? def.default_template,
        locale: config?.locale ?? def.default_locale,
        recipient_rules: config?.recipient_rules ?? def.recipient_resolvers,
        has_override: !!config,
      };
    });
  });

  // PATCH /v1/comm/events/:key — update tenant config for an event
  fastify.patch('/events/:key', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const def = COMM_EVENT_REGISTRY.find(e => e.event_key === key);
    if (!def) return reply.status(404).send({ error: 'Event not found' });
    const body = z.object({
      is_enabled: z.boolean().optional(),
      channel: z.enum(['EMAIL', 'IN_APP']).nullable().optional(),
      channels: z.array(z.enum(['EMAIL', 'IN_APP'])).min(1).nullable().optional(),
      template_key: z.string().trim().min(1).nullable().optional(),
      locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).nullable().optional(),
      recipient_rules: z.array(z.object({ resolver: z.string().min(1), type: z.enum(['TO', 'CC', 'BCC']) })).optional(),
    }).parse(req.body);
    if (def.is_required && body.is_enabled === false) return reply.status(400).send({ error: 'This event is required and cannot be disabled.' });

    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('tenant_event_configs').values({
        tenant_id: user.tenant_id,
        event_key: key,
        is_enabled: body.is_enabled ?? true,
        channel: body.channel ?? null,
        channels: body.channels ?? null,
        template_key: body.template_key ?? null,
        locale: body.locale ?? null,
        recipient_rules: body.recipient_rules ?? [],
        updated_by: user.sub,
        updated_at: new Date(),
      }).onConflict(oc => oc.columns(['tenant_id', 'event_key']).doUpdateSet({
        ...(body.is_enabled !== undefined ? { is_enabled: body.is_enabled } : {}),
        ...(body.channel !== undefined ? { channel: body.channel } : {}),
        ...(body.channels !== undefined ? { channels: body.channels } : {}),
        ...(body.template_key !== undefined ? { template_key: body.template_key } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.recipient_rules !== undefined ? { recipient_rules: body.recipient_rules } : {}),
        updated_by: user.sub,
        updated_at: new Date(),
      })).execute();
      return { ok: true };
    });
  });

  // DELETE /v1/comm/events/:key/override — reset to platform defaults
  fastify.delete('/events/:key/override', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('tenant_event_configs')
        .where('tenant_id', '=', user.tenant_id).where('event_key', '=', key).execute();
      reply.status(204).send();
    });
  });

  // POST /v1/comm/events/:key/simulate — render with sample data, no send
  fastify.post('/events/:key/simulate', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const body = z.object({ vars: z.record(z.string()).optional() }).optional().parse(req.body);
    try {
      const result = await CommEventsService.simulate(user.tenant_id, key, body?.vars);
      return {
        event_key: key,
        template_key: result.templateKey,
        subject: result.subject,
        body_html: result.bodyHtml,
        plain_text: result.plainText,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/comm/events/:key/test-send — render + send to a test email
  fastify.post('/events/:key/test-send', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const body = z.object({ to: z.string().email(), vars: z.record(z.string()).optional() }).parse(req.body);
    try {
      const result = await CommEventsService.simulate(user.tenant_id, key, body.vars);
      const { MailService } = await import('../services/mail.service.js');
      await MailService.enqueue(user.tenant_id, { to: body.to, subject: `[TEST] ${result.subject}`, bodyHtml: result.bodyHtml, sourceApp: 'comm_events' });
      return { ok: true, subject: result.subject };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/events/:key/recipients/preview', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const body = z.object({ actor_id: z.string().uuid().optional(), recipients: z.array(z.object({ email: z.string().email(), name: z.string().optional(), user_id: z.string().uuid().optional(), type: z.enum(['TO', 'CC', 'BCC']).default('TO') })).optional() }).parse(req.body ?? {});
    try {
      const recipients = body.recipients?.map(recipient => ({ email: recipient.email!, name: recipient.name, user_id: recipient.user_id, type: recipient.type! }));
      return await CommEventsService.previewRecipients({ tenantId: user.tenant_id, eventKey: key, actorId: body.actor_id ?? user.sub, manualRecipients: recipients });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Unable to resolve recipients' });
    }
  });

  fastify.post('/events/:key/dispatch', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const body = z.object({
      record: z.object({ type: z.string().min(1), id: z.string().min(1), label: z.string().optional() }).optional(),
      context: z.record(z.unknown()).default({}), idempotency_key: z.string().min(1).max(250).optional(), locale: z.string().optional(),
      recipients: z.array(z.object({ email: z.string().email(), name: z.string().optional(), user_id: z.string().uuid().optional(), type: z.enum(['TO', 'CC', 'BCC']).default('TO') })).optional(),
    }).parse(req.body ?? {});
    try {
      const record = body.record ? { type: body.record.type!, id: body.record.id!, label: body.record.label } : undefined;
      const recipients = body.recipients?.map(recipient => ({ email: recipient.email!, name: recipient.name, user_id: recipient.user_id, type: recipient.type! }));
      return await CommEventsService.dispatch({ tenantId: user.tenant_id, eventKey: key, actorId: user.sub, record, context: body.context, idempotencyKey: body.idempotency_key, locale: body.locale, manualRecipients: recipients });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Communication dispatch failed' });
    }
  });

  // GET /v1/comm/logs — delivery log for the tenant
  fastify.get('/logs', async (req) => {
    const user = req.user;
    const qs = req.query as Record<string, string>;
    return CommEventsService.getDeliveryLog(user.tenant_id, {
      eventKey: qs.event_key,
      recordType: qs.record_type,
      recordId: qs.record_id,
      limit: qs.limit ? Number(qs.limit) : 50,
      offset: qs.offset ? Number(qs.offset) : 0,
    });
  });

  fastify.post('/logs/:id/retry', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    try { return await CommEventsService.retryDelivery(user.tenant_id, id); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : 'Retry failed' }); }
  });

  fastify.get('/preferences/me', async req => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('comm_notification_preferences').selectAll()
      .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute());
  });

  fastify.put('/preferences/me/:key', async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    if (!COMM_EVENT_REGISTRY.some(event => event.event_key === key)) return reply.status(404).send({ error: 'Event not found' });
    const body = z.object({ email_enabled: z.boolean().default(true), in_app_enabled: z.boolean().default(true), frequency: z.enum(['immediate', 'daily_digest', 'weekly_digest', 'never']).default('immediate'), locale: z.string().default('en') }).parse(req.body);
    return withTenant(user.tenant_id, trx => trx.insertInto('comm_notification_preferences').values({ tenant_id: user.tenant_id, user_id: user.sub, event_key: key, ...body, updated_at: new Date() }).onConflict(oc => oc.columns(['tenant_id', 'user_id', 'event_key']).doUpdateSet({ ...body, updated_at: new Date() })).returningAll().executeTakeFirstOrThrow());
  });
}

export async function marketplaceEmailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/marketplace/email-templates — browse published templates
  fastify.get('/', async (req) => {
    const qs = req.query as Record<string, string>;
    const { dbPlatform } = await import('../db/client.js');
    let q = dbPlatform
      .selectFrom('marketplace_email_templates')
      .selectAll()
      .where('status', '=', 'published');
    if (qs.category) q = q.where('category', '=', qs.category);
    if (qs.application) q = q.where('application', '=', qs.application);
    if (qs.q) {
      const term = `%${qs.q}%`;
      q = q.where(eb => eb.or([
        eb('title', 'ilike', term),
        eb('description', 'ilike', term),
      ]));
    }
    const limit = Math.min(Math.max(Number(qs.limit) || 50, 1), 500);
    const offset = Math.max(Number(qs.offset) || 0, 0);
    return q.orderBy('is_featured', 'desc').orderBy('downloads', 'desc').limit(limit).offset(offset).execute();
  });

  fastify.post('/submissions', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ template_key: z.string().min(1), title: z.string().trim().min(1).max(160), description: z.string().trim().min(20).max(2000), tags: z.array(z.string().trim().min(1)).max(12).default([]) }).parse(req.body);
    const source = await withTenant(user.tenant_id, trx => trx.selectFrom('email_templates').selectAll().where('tenant_id', '=', user.tenant_id).where('template_key', '=', body.template_key).where('status', '=', 'active').orderBy('updated_at', 'desc').executeTakeFirst());
    if (!source) return reply.status(404).send({ error: 'An active customized template is required for submission' });
    if (!source.body_plain.trim()) return reply.status(400).send({ error: 'A plain-text fallback is required before Marketplace submission' });
    const { dbPlatform } = await import('../db/client.js');
    const slug = `${body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}-${crypto.randomUUID().slice(0, 8)}`;
    const row = await dbPlatform.insertInto('marketplace_email_templates').values({ title: body.title, slug, description: body.description, category: source.category, application: source.application, event_key: source.event_key, tags: body.tags, subject: source.subject, preheader: source.preheader, body_html: source.body_html, body_plain: source.body_plain, locale: source.locale, available_vars: [], author_tenant_id: user.tenant_id, author_name: 'Hudumika workspace', status: 'submitted' }).returningAll().executeTakeFirstOrThrow();
    reply.status(201);
    return row;
  });

  fastify.get('/submissions/mine', async req => {
    const user = req.user;
    const { dbPlatform } = await import('../db/client.js');
    return dbPlatform.selectFrom('marketplace_email_templates').selectAll().where('author_tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute();
  });

  fastify.patch('/submissions/:id/review', { preHandler: requireRole('SUPER_ADMIN') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(['under_review', 'approved', 'published', 'rejected', 'archived']), review_notes: z.string().max(4000).nullable().optional() }).parse(req.body);
    const { dbPlatform } = await import('../db/client.js');
    const row = await dbPlatform.updateTable('marketplace_email_templates').set({ status: body.status, review_notes: body.review_notes ?? null, published_at: body.status === 'published' ? new Date() : null, updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Marketplace submission not found' });
    return row;
  });

  // GET /v1/marketplace/email-templates/:id — single template
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { dbPlatform } = await import('../db/client.js');
    const row = await dbPlatform
      .selectFrom('marketplace_email_templates').selectAll()
      .where('id', '=', id).where('status', '=', 'published').executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Template not found' });
    return row;
  });

  // POST /v1/marketplace/email-templates/:id/import — copy to tenant
  fastify.post('/:id/import', async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { dbPlatform } = await import('../db/client.js');

    const master = await dbPlatform
      .selectFrom('marketplace_email_templates').selectAll()
      .where('id', '=', id).where('status', '=', 'published').executeTakeFirst();
    if (!master) return reply.status(404).send({ error: 'Template not found' });

    return withTenant(user.tenant_id, async (trx) => {
      // Idempotent: check if already imported
      const existing = await trx.selectFrom('tenant_marketplace_imports').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('marketplace_template_id', '=', id).executeTakeFirst();
      if (existing) {
        return { already_imported: true, template_key: existing.local_template_key };
      }

      const slug = master.slug.replace(/[^a-z0-9_]/gi, '_').slice(0, 40);
      const template_key = `marketplace.${slug}.${id.slice(0, 8)}`;

      await trx.insertInto('email_templates').values({
        tenant_id: user.tenant_id,
        template_key,
        category: master.category as any,
        subject: master.subject,
        body_html: master.body_html,
        updated_by: user.sub,
        updated_at: new Date(),
        locale: master.locale,
        preheader: master.preheader,
        body_plain: master.body_plain,
        event_key: master.event_key,
        application: master.application,
      }).onConflict(oc => oc.columns(['tenant_id', 'template_key', 'locale']).doNothing()).execute();

      await trx.insertInto('tenant_marketplace_imports').values({
        tenant_id: user.tenant_id,
        marketplace_template_id: id,
        local_template_key: template_key,
        source_version: master.version,
      }).execute();

      // Increment download count (best-effort)
      dbPlatform.updateTable('marketplace_email_templates')
        .set(eb => ({ downloads: eb('downloads', '+', 1) }))
        .where('id', '=', id).execute().catch(() => {});

      reply.status(201);
      return { template_key, imported: true };
    });
  });

  // GET /v1/marketplace/email-templates/imported — tenant's imported templates
  fastify.get('/imported', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('tenant_marketplace_imports as i')
        .innerJoin('marketplace_email_templates as m', 'm.id', 'i.marketplace_template_id')
        .select([
          'i.marketplace_template_id as id',
          'i.local_template_key', 'i.source_version', 'i.update_available', 'i.imported_at',
          'm.title', 'm.description', 'm.category', 'm.version as current_version',
          'm.author_name', 'm.is_hudumika_official',
        ])
        .where('i.tenant_id', '=', user.tenant_id)
        .orderBy('i.imported_at', 'desc').execute(),
    );
  });

  fastify.post('/imported/:id/update', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { dbPlatform } = await import('../db/client.js');
    const master = await dbPlatform.selectFrom('marketplace_email_templates').selectAll().where('id', '=', id).where('status', '=', 'published').executeTakeFirst();
    if (!master) return reply.status(404).send({ error: 'Published Marketplace template not found' });
    return withTenant(user.tenant_id, async trx => {
      const imported = await trx.selectFrom('tenant_marketplace_imports').selectAll().where('tenant_id', '=', user.tenant_id).where('marketplace_template_id', '=', id).executeTakeFirst();
      if (!imported) return reply.status(404).send({ error: 'Template has not been imported' });
      const current = await trx.selectFrom('email_templates').selectAll().where('tenant_id', '=', user.tenant_id).where('template_key', '=', imported.local_template_key).where('locale', '=', master.locale).executeTakeFirst();
      if (current) await trx.insertInto('email_template_revisions').values({ tenant_id: user.tenant_id, template_key: current.template_key, revision: current.revision, subject: current.subject, preheader: current.preheader, body_html: current.body_html, body_plain: current.body_plain, locale: current.locale, status: current.status, block_document: current.block_document, created_by: user.sub }).onConflict(oc => oc.columns(['tenant_id', 'template_key', 'revision']).doNothing()).execute();
      await trx.updateTable('email_templates').set({ subject: master.subject, preheader: master.preheader, body_html: master.body_html, body_plain: master.body_plain, event_key: master.event_key, application: master.application, revision: (current?.revision ?? 0) + 1, updated_by: user.sub, updated_at: new Date() }).where('tenant_id', '=', user.tenant_id).where('template_key', '=', imported.local_template_key).where('locale', '=', master.locale).execute();
      await trx.updateTable('tenant_marketplace_imports').set({ source_version: master.version, update_available: false }).where('tenant_id', '=', user.tenant_id).where('marketplace_template_id', '=', id).execute();
      return { updated: true, template_key: imported.local_template_key, source_version: master.version };
    });
  });
}
