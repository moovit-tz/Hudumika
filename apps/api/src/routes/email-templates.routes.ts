import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TEMPLATE_VARS } from '../config/email-template-defaults.js';

/**
 * Template authoring — a Settings concern like everything else under
 * Settings, so gated the same way PATCH /v1/settings and POST /settings/
 * email/test already are (SUPER_ADMIN/ADMIN/TENANT_ADMIN/MANAGER for writes)
 * rather than requireEntitlement('email'), which gates the user-facing
 * Email app specifically, not this internal capability.
 */
export async function emailTemplatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET / — every known template_key, merged with the tenant's own override
  // (if any) so the UI never has to reason about "does a row exist" itself.
  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const overrides = await trx.selectFrom('email_templates').selectAll()
        .where('tenant_id', '=', user.tenant_id).execute();
      const byKey = new Map(overrides.map(o => [o.template_key, o]));

      return Object.entries(EMAIL_TEMPLATE_DEFAULTS).map(([template_key, def]) => {
        const override = byKey.get(template_key);
        return {
          template_key,
          category: def.category,
          subject: override?.subject ?? def.subject,
          body_html: override?.body_html ?? def.body,
          is_customized: !!override,
          updated_at: override?.updated_at ?? null,
          available_vars: EMAIL_TEMPLATE_VARS[template_key] ?? [],
        };
      });
    });
  });

  fastify.put('/:key', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    const { subject, body_html } = req.body as { subject?: string; body_html?: string };
    const def = EMAIL_TEMPLATE_DEFAULTS[key];
    if (!def) return reply.status(404).send({ error: `Unknown template_key: "${key}"` });
    if (!subject?.trim() || !body_html?.trim()) return reply.status(400).send({ error: 'subject and body_html are required' });

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('email_templates').values({
        tenant_id: user.tenant_id,
        template_key: key,
        category: def.category,
        subject: subject.trim(),
        body_html: body_html.trim(),
        updated_by: user.sub,
        updated_at: new Date(),
      }).onConflict(oc => oc.columns(['tenant_id', 'template_key']).doUpdateSet({
        subject: subject.trim(), body_html: body_html.trim(), updated_by: user.sub, updated_at: new Date(),
      })).returningAll().executeTakeFirstOrThrow();
      return row;
    });
  });

  // DELETE /:key — revert to the code-defined default.
  fastify.delete('/:key', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req, reply) => {
    const user = req.user;
    const { key } = req.params as { key: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('email_templates')
        .where('tenant_id', '=', user.tenant_id).where('template_key', '=', key).execute();
      return reply.status(204).send();
    });
  });
}
