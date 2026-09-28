/**
 * DPO (Data Protection Officer) admin API — PII access audit,
 * data retention policies, and the privacy manifest registry.
 *
 * All routes require ADMIN/TENANT_ADMIN role.
 * Routes gated on 'ondi.governance' are optional enrichments.
 *
 *   GET  /v1/admin/privacy/pii-access-log            — filtered PII access audit
 *   GET  /v1/admin/privacy/retention-policies        — list retention policies
 *   POST /v1/admin/privacy/retention-policies        — create/update a policy
 *   GET  /v1/admin/privacy/pii-domains               — data domain catalog
 *   GET  /v1/admin/privacy/pii-fields                — field registry for a table
 *   GET  /v1/admin/privacy/app-manifests             — OAuth app privacy manifests
 *   GET  /v1/admin/privacy/resource-scopes           — OAuth resource scope catalog
 */

import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

export async function privacyAdminRoutes(fastify: FastifyInstance) {

  // ── PII access audit ───────────────────────────────────────────────────────

  fastify.get('/admin/privacy/pii-access-log', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { subject_id, domain, sensitivity, from, to, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const rows = await withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('pii_access_log')
        .select(['id', 'accessor_id', 'accessor_type', 'accessor_ref', 'subject_id', 'subject_table', 'fields_accessed', 'data_domain', 'sensitivity_level', 'purpose', 'route', 'created_at'])
        .orderBy('created_at', 'desc')
        .limit(Math.min(parseInt(limit), 200))
        .offset(parseInt(offset));
      if (subject_id) q = q.where('subject_id', '=', subject_id);
      if (domain) q = q.where('data_domain', '=', domain);
      if (sensitivity) q = q.where('sensitivity_level', '=', sensitivity as any);
      if (from) q = q.where('created_at', '>=', new Date(from));
      if (to) q = q.where('created_at', '<=', new Date(to));
      return q.execute();
    });

    return reply.send(rows);
  });

  // ── Data retention policies ────────────────────────────────────────────────

  fastify.get('/admin/privacy/retention-policies', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;

    // Return both platform defaults (tenant_id IS NULL) and tenant-specific overrides.
    const [defaults, overrides] = await Promise.all([
      db.selectFrom('data_retention_policies')
        .selectAll()
        .where('tenant_id', 'is', null)
        .execute(),
      withTenant(user.tenant_id, async (trx) =>
        trx.selectFrom('data_retention_policies')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .execute(),
      ),
    ]);

    return reply.send({ platform_defaults: defaults, tenant_overrides: overrides });
  });

  fastify.post('/admin/privacy/retention-policies', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const user = (req as any).user;
    const body = req.body as {
      table_name: string; data_domain: string; retention_days: number;
      action_on_expiry: 'ANONYMISE' | 'PSEUDONYMISE' | 'DELETE' | 'ARCHIVE';
      target_columns?: string[]; legal_hold?: boolean;
    };

    const VALID_ACTIONS = ['ANONYMISE', 'PSEUDONYMISE', 'DELETE', 'ARCHIVE'];
    if (!VALID_ACTIONS.includes(body.action_on_expiry)) {
      return reply.status(400).send({ error: 'invalid action_on_expiry' });
    }

    const row = await withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('data_retention_policies').values({
        tenant_id: user.tenant_id,
        table_name: body.table_name,
        data_domain: body.data_domain,
        retention_days: body.retention_days,
        action_on_expiry: body.action_on_expiry,
        target_columns: JSON.stringify(body.target_columns ?? []) as any,
        legal_hold: body.legal_hold ?? false,
      } as any)
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'table_name', 'data_domain']).doUpdateSet({
          retention_days: body.retention_days,
          action_on_expiry: body.action_on_expiry,
          target_columns: JSON.stringify(body.target_columns ?? []) as any,
          legal_hold: body.legal_hold ?? false,
        }),
      )
      .returning('id')
      .executeTakeFirstOrThrow(),
    );

    return reply.status(201).send({ id: row.id });
  });

  // ── PII domain catalog ─────────────────────────────────────────────────────

  fastify.get('/admin/privacy/pii-domains', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const domains = await db.selectFrom('pii_data_domains').selectAll().execute();
    return reply.send(domains);
  });

  // ── PII field registry ─────────────────────────────────────────────────────

  fastify.get('/admin/privacy/pii-fields', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const { table_name, domain } = req.query as { table_name?: string; domain?: string };
    let q = db.selectFrom('pii_field_registry').selectAll();
    if (table_name) q = q.where('table_name', '=', table_name);
    if (domain) q = q.where('data_domain', '=', domain);
    return reply.send(await q.execute());
  });

  // ── App privacy manifests ──────────────────────────────────────────────────

  fastify.get('/admin/privacy/app-manifests', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const rows = await db
      .selectFrom('app_privacy_manifests as m')
      .innerJoin('ondi_oauth_clients as c', 'c.client_id', 'm.client_id')
      .select([
        'm.id', 'm.client_id', 'c.name as app_name', 'c.logo_url',
        'm.version', 'm.data_access', 'm.purposes', 'm.external_processing',
        'm.ai_processing', 'm.retention_days', 'm.deletion_supported',
        'm.is_current', 'm.published_at',
      ])
      .where('m.is_current', '=', true)
      .execute();
    return reply.send(rows);
  });

  // ── OAuth resource scope catalog ───────────────────────────────────────────

  fastify.get('/admin/privacy/resource-scopes', {
    preHandler: [fastify.authenticate, requireRole(...ADMIN_ROLES)],
  }, async (req, reply) => {
    const { domain, sensitivity } = req.query as { domain?: string; sensitivity?: string };
    let q = db.selectFrom('oauth_resource_scopes').selectAll().where('is_active', '=', true);
    if (domain) q = q.where('data_domain', '=', domain);
    if (sensitivity) q = q.where('sensitivity_level', '=', sensitivity as any);
    return reply.send(await q.execute());
  });
}
