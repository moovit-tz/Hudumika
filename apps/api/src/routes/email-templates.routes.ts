import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TEMPLATE_VARS } from '../config/email-template-defaults.js';
import { z } from 'zod';
import crypto from 'node:crypto';
import { sanitizeEmailHtml } from './email-meta.routes.js';

const templateWriteSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  preheader: z.string().max(500).default(''),
  body_html: z.string().trim().min(1),
  body_plain: z.string().default(''),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('en'),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  block_document: z.object({ version: z.literal(1), blocks: z.array(z.record(z.unknown())) }).nullable().default(null),
  event_key: z.string().trim().min(1).nullable().optional(),
  application: z.string().trim().min(1).max(100).nullable().optional(),
});

const groupSchema = z.object({ name: z.string().trim().min(1).max(100) });

/**
 * Template authoring — a Settings concern like everything else under
 * Settings, so gated the same way PATCH /v1/settings and POST /settings/
 * email/test already are (SUPER_ADMIN/ADMIN/TENANT_ADMIN/MANAGER for writes)
 * rather than requireEntitlement('email'), which gates the user-facing
 * Email app specifically, not this internal capability.
 */
export async function emailTemplatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  // HUD-0034: writes already required MGMT roles, but GET / had no check at
  // all beyond authentication — any CUSTOMER JWT could read every one of the
  // tenant's transactional email templates (proven live, 200).
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/groups', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) => trx.selectFrom('email_template_groups').selectAll()
      .where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').where('user_id', 'is', null)
      .orderBy('sort_order').orderBy('name').execute());
  });

  fastify.post('/groups', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user; const { name } = groupSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const last = await trx.selectFrom('email_template_groups').select('sort_order').where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').orderBy('sort_order', 'desc').executeTakeFirst();
      const row = await trx.insertInto('email_template_groups').values({ tenant_id: user.tenant_id, user_id: null, scope: 'system', name, sort_order: (last?.sort_order ?? -1) + 1 }).returningAll().executeTakeFirstOrThrow();
      reply.status(201); return row;
    });
  });

  fastify.patch('/groups/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string }; const { name } = groupSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('email_template_groups').set({ name, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template group not found' }); return row;
    });
  });

  fastify.delete('/groups/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user; const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_template_groups').where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').returning('id').executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Template group not found' }); return reply.status(204).send();
    });
  });

  fastify.put('/groups/order', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req) => {
    const user = req.user; const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      for (const [sort_order, id] of ids.entries()) await trx.updateTable('email_template_groups').set({ sort_order, updated_at: new Date() }).where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').execute();
      return { ok: true };
    });
  });

  fastify.put('/order', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user; const body = z.object({ group_id: z.string().uuid().nullable(), keys: z.array(z.string().min(1).max(100)) }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      if (body.group_id) {
        const group = await trx.selectFrom('email_template_groups').select('id').where('id', '=', body.group_id).where('tenant_id', '=', user.tenant_id).where('scope', '=', 'system').executeTakeFirst();
        if (!group) return reply.status(400).send({ error: 'Invalid template group' });
      }
      for (const [sort_order, template_key] of body.keys.entries()) await trx.insertInto('email_system_template_layouts').values({ tenant_id: user.tenant_id, template_key, group_id: body.group_id, sort_order, updated_at: new Date() }).onConflict(oc => oc.columns(['tenant_id', 'template_key']).doUpdateSet({ group_id: body.group_id, sort_order, updated_at: new Date() })).execute();
      return { ok: true };
    });
  });

  // GET / — every known template_key, merged with the tenant's own override
  // (if any) so the UI never has to reason about "does a row exist" itself.
  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [overrides, layouts] = await Promise.all([
        trx.selectFrom('email_templates').selectAll().where('tenant_id', '=', user.tenant_id).execute(),
        trx.selectFrom('email_system_template_layouts').selectAll().where('tenant_id', '=', user.tenant_id).execute(),
      ]);
      const byKey = new Map(overrides.map(o => [o.template_key, o]));
      const layoutByKey = new Map(layouts.map(o => [o.template_key, o]));

      const builtIns = Object.entries(EMAIL_TEMPLATE_DEFAULTS).map(([template_key, def]) => {
        const override = byKey.get(template_key);
        const layout = layoutByKey.get(template_key);
        return {
          template_key,
          category: def.category,
          subject: override?.subject ?? def.subject,
          body_html: override?.body_html ?? def.body,
          is_customized: !!override,
          updated_at: override?.updated_at ?? null,
          available_vars: EMAIL_TEMPLATE_VARS[template_key] ?? [],
          group_id: layout?.group_id ?? null,
          sort_order: layout?.sort_order ?? 0,
          is_builtin: true,
          preheader: override?.preheader ?? '',
          body_plain: override?.body_plain ?? '',
          locale: override?.locale ?? 'en',
          status: override?.status ?? 'active',
          block_document: override?.block_document ?? null,
          revision: override?.revision ?? 0,
          event_key: override?.event_key ?? null,
          application: override?.application ?? null,
        };
      });
      const custom = overrides.filter(row => !EMAIL_TEMPLATE_DEFAULTS[row.template_key]).map(row => {
        const layout = layoutByKey.get(row.template_key);
        return { template_key: row.template_key, category: row.category, subject: row.subject, body_html: row.body_html, is_customized: true, updated_at: row.updated_at, available_vars: [], group_id: layout?.group_id ?? null, sort_order: layout?.sort_order ?? 0, is_builtin: false, preheader: row.preheader, body_plain: row.body_plain, locale: row.locale, status: row.status, block_document: row.block_document, revision: row.revision, event_key: row.event_key, application: row.application };
      });
      return [...builtIns, ...custom].sort((a, b) => a.sort_order - b.sort_order || a.subject.localeCompare(b.subject));
    });
  });

  // GET /:key — single template (built-in default merged with any tenant override)
  fastify.get('/:key', async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, async (trx) => {
      const override = await trx.selectFrom('email_templates').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('template_key', '=', key)
        .orderBy('locale').executeTakeFirst();
      const def = EMAIL_TEMPLATE_DEFAULTS[key];
      if (!override && !def) return reply.status(404).send({ error: `Unknown template_key: "${key}"` });
      return {
        template_key: key,
        category: override?.category ?? def?.category ?? 'general',
        subject: override?.subject ?? def?.subject ?? '',
        body_html: override?.body_html ?? def?.body ?? '',
        is_customized: !!override,
        is_builtin: !!def,
        preheader: override?.preheader ?? '',
        body_plain: override?.body_plain ?? '',
        locale: override?.locale ?? 'en',
        status: override?.status ?? 'active',
        revision: override?.revision ?? 0,
        event_key: override?.event_key ?? null,
        application: override?.application ?? null,
        available_vars: EMAIL_TEMPLATE_VARS[key] ?? [],
      };
    });
  });

  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ name: z.string().trim().min(1).max(100), group_id: z.string().uuid().nullable().optional() }).and(templateWriteSchema).parse(req.body);
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'template';
    const template_key = `custom.${slug}.${crypto.randomUUID().slice(0, 8)}`;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('email_templates').values({ tenant_id: user.tenant_id, template_key, category: 'custom', subject: body.subject, preheader: body.preheader, body_html: sanitizeEmailHtml(body.body_html), body_plain: body.body_plain, locale: body.locale, status: body.status, block_document: body.block_document, revision: 1, event_key: body.event_key ?? null, application: body.application ?? null, updated_by: user.sub, updated_at: new Date() }).execute();
      await trx.insertInto('email_system_template_layouts').values({ tenant_id: user.tenant_id, template_key, group_id: body.group_id ?? null, sort_order: 0, updated_at: new Date() }).execute();
      reply.status(201); return { template_key };
    });
  });

  fastify.put('/:key', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const body = templateWriteSchema.parse(req.body);
    const def = EMAIL_TEMPLATE_DEFAULTS[key];

    return withTenant(user.tenant_id, async (trx) => {
      if (!def) {
        const custom = await trx.selectFrom('email_templates').select('template_key').where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).where('locale', '=', body.locale).executeTakeFirst();
        if (!custom) return reply.status(404).send({ error: `Unknown template_key: "${key}"` });
      }
      const existing = await trx.selectFrom('email_templates').selectAll().where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).where('locale', '=', body.locale).executeTakeFirst();
      if (existing) {
        await trx.insertInto('email_template_revisions').values({ tenant_id: user.tenant_id, template_key: key, revision: existing.revision, subject: existing.subject, preheader: existing.preheader, body_html: existing.body_html, body_plain: existing.body_plain, locale: existing.locale, status: existing.status, block_document: existing.block_document, created_by: user.sub }).onConflict(oc => oc.columns(['tenant_id', 'template_key', 'revision']).doNothing()).execute();
      }
      const nextRevision = (existing?.revision ?? 0) + 1;
      const row = await trx.insertInto('email_templates').values({
        tenant_id: user.tenant_id,
        template_key: key,
        category: def?.category ?? 'custom',
        subject: body.subject,
        preheader: body.preheader,
        body_html: sanitizeEmailHtml(body.body_html),
        body_plain: body.body_plain,
        locale: body.locale,
        status: body.status,
        block_document: body.block_document,
        revision: nextRevision,
        event_key: body.event_key ?? null,
        application: body.application ?? null,
        updated_by: user.sub,
        updated_at: new Date(),
      }).onConflict(oc => oc.columns(['tenant_id', 'template_key', 'locale']).doUpdateSet({
        subject: body.subject, preheader: body.preheader, body_html: sanitizeEmailHtml(body.body_html), body_plain: body.body_plain,
        status: body.status, block_document: body.block_document, revision: nextRevision, event_key: body.event_key ?? null,
        application: body.application ?? null, updated_by: user.sub, updated_at: new Date(),
      })).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  // DELETE /:key — revert to the code-defined default.
  fastify.post('/:key/validate', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req) => {
    const { key } = req.params as { key: string };
    const body = z.object({ subject: z.string(), body_html: z.string(), body_plain: z.string().optional() }).parse(req.body);
    const allowed = new Set(EMAIL_TEMPLATE_VARS[key] ?? []);
    const referenced = [...`${body.subject} ${body.body_html} ${body.body_plain ?? ''}`.matchAll(/{{\s*([\w.]+)\s*}}/g)].map(match => match[1]);
    const unknown_variables = [...new Set(referenced.filter(variable => !allowed.has(variable)))];
    const sanitized = sanitizeEmailHtml(body.body_html);
    return { valid: unknown_variables.length === 0 && !!sanitized.trim(), unknown_variables, html_was_sanitized: sanitized !== body.body_html, sanitized_html: sanitized };
  });

  fastify.get('/:key/revisions', async (req) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, trx => trx.selectFrom('email_template_revisions').selectAll()
      .where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).orderBy('revision', 'desc').limit(50).execute());
  });

  fastify.post('/:key/revisions/:revision/restore', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key, revision } = req.params as { key: string; revision: string };
    return withTenant(user.tenant_id, async trx => {
      const source = await trx.selectFrom('email_template_revisions').selectAll().where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).where('revision', '=', Number(revision)).executeTakeFirst();
      if (!source) return reply.status(404).send({ error: 'Template revision not found' });
      const current = await trx.selectFrom('email_templates').selectAll().where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).where('locale', '=', source.locale).executeTakeFirst();
      if (!current) return reply.status(404).send({ error: 'Template not found' });
      await trx.insertInto('email_template_revisions').values({ tenant_id: user.tenant_id, template_key: key, revision: current.revision, subject: current.subject, preheader: current.preheader, body_html: current.body_html, body_plain: current.body_plain, locale: current.locale, status: current.status, block_document: current.block_document, created_by: user.sub }).onConflict(oc => oc.columns(['tenant_id', 'template_key', 'revision']).doNothing()).execute();
      return trx.updateTable('email_templates').set({ subject: source.subject, preheader: source.preheader, body_html: source.body_html, body_plain: source.body_plain, status: source.status, block_document: source.block_document, revision: current.revision + 1, updated_by: user.sub, updated_at: new Date() }).where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).where('locale', '=', source.locale).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.get('/:key/usage', async (req) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, async trx => {
      const events = await trx.selectFrom('tenant_event_configs').select(['event_key', 'is_enabled']).where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).execute();
      const marketplace = await trx.selectFrom('tenant_marketplace_imports').select(['marketplace_template_id', 'source_version']).where('tenant_id', '=', user.tenant_id).where('local_template_key', '=', key).executeTakeFirst();
      return { events, marketplace: marketplace ?? null, can_delete: events.length === 0 };
    });
  });

  fastify.delete('/:key', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('email_templates')
        .where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).execute();
      if (!EMAIL_TEMPLATE_DEFAULTS[key]) {
        await trx.deleteFrom('email_system_template_layouts').where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).execute();
      }
      return reply.status(204).send();
    });
  });
}
