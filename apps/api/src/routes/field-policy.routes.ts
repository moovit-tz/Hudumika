import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserRole, FieldPolicyResource, FieldGroup } from '@hudumika/types';
import {
  FIELD_POLICY_RESOURCES, FIELD_GROUPS, FIELD_GROUP_LABELS,
  RESOURCE_FIELD_MAP, DEFAULT_FIELD_POLICIES, INTERNAL_ROLES,
} from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { invalidateFieldPolicyCache, getEffectiveRoles } from '../lib/field-policy.js';

const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

const policyBodySchema = z.object({
  resource: z.enum(FIELD_POLICY_RESOURCES as unknown as [string, ...string[]]),
  field_group: z.enum(FIELD_GROUPS as unknown as [string, ...string[]]),
  allowed_roles: z.array(z.string()).min(1),
});

const batchBodySchema = z.object({
  policies: z.array(policyBodySchema).min(1).max(100),
});

export async function fieldPolicyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireRole(...ADMIN_ROLES));

  fastify.get('/', async (req) => {
    const user = req.user;
    const overrides = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('tenant_field_policies' as any)
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .execute()
    );

    const overrideMap = new Map(
      (overrides as any[]).map(r => [`${r.resource}:${r.field_group}`, r])
    );

    return FIELD_POLICY_RESOURCES.map(resource => ({
      resource,
      groups: FIELD_GROUPS.map(group => {
        const key = `${resource}:${group}`;
        const override = overrideMap.get(key);
        return {
          group,
          label: FIELD_GROUP_LABELS[group],
          fields: RESOURCE_FIELD_MAP[resource]?.[group] ?? [],
          allowed_roles: override
            ? (override as any).allowed_roles
            : [...DEFAULT_FIELD_POLICIES[resource]?.[group] ?? []],
          is_default: !override,
        };
      }),
    }));
  });

  fastify.get('/my-visibility', async (req) => {
    const user = req.user;
    const overrides = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('tenant_field_policies' as any)
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .execute()
    ) as any[];

    const result: Record<string, string[]> = {};
    for (const resource of FIELD_POLICY_RESOURCES) {
      const visible: string[] = [];
      for (const group of FIELD_GROUPS) {
        const allowed = getEffectiveRoles(resource, group, overrides);
        if (user.role === 'SUPER_ADMIN' || (allowed as readonly string[]).includes(user.role)) {
          visible.push(group);
        }
      }
      result[resource] = visible;
    }
    return result;
  });

  fastify.put('/', async (req, reply) => {
    const user = req.user;
    const parsed = batchBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const { policies } = parsed.data;
    for (const p of policies) {
      if (!p.allowed_roles.includes('SUPER_ADMIN') || !p.allowed_roles.includes('ADMIN')) {
        return reply.status(400).send({
          error: `SUPER_ADMIN and ADMIN must always be included in allowed_roles for ${p.resource}.${p.field_group}.`,
        });
      }
      for (const role of p.allowed_roles) {
        if (![...INTERNAL_ROLES, 'TENANT_ADMIN', 'CUSTOMER'].includes(role)) {
          return reply.status(400).send({ error: `Invalid role: ${role}` });
        }
      }
    }

    await withTenant(user.tenant_id, async (trx) => {
      for (const p of policies) {
        const defaults = DEFAULT_FIELD_POLICIES[p.resource as FieldPolicyResource]?.[p.field_group as FieldGroup] ?? [];
        const isDefault = defaults.length === p.allowed_roles.length &&
          defaults.every(r => p.allowed_roles.includes(r)) &&
          p.allowed_roles.every(r => (defaults as readonly string[]).includes(r));

        if (isDefault) {
          await (trx.deleteFrom('tenant_field_policies' as any) as any)
            .where('tenant_id', '=', user.tenant_id)
            .where('resource', '=', p.resource)
            .where('field_group', '=', p.field_group)
            .execute();
        } else {
          const existing = await (trx.selectFrom('tenant_field_policies' as any) as any)
            .select('id')
            .where('tenant_id', '=', user.tenant_id)
            .where('resource', '=', p.resource)
            .where('field_group', '=', p.field_group)
            .executeTakeFirst();

          if (existing) {
            await (trx.updateTable('tenant_field_policies' as any) as any)
              .set({ allowed_roles: p.allowed_roles, updated_at: new Date() })
              .where('id', '=', (existing as any).id)
              .execute();
          } else {
            await (trx.insertInto('tenant_field_policies' as any) as any)
              .values({
                tenant_id: user.tenant_id,
                resource: p.resource,
                field_group: p.field_group,
                allowed_roles: p.allowed_roles,
              })
              .execute();
          }
        }
      }
    });

    invalidateFieldPolicyCache(user.tenant_id);
    return { success: true };
  });

  fastify.delete('/:resource/:fieldGroup', async (req, reply) => {
    const user = req.user;
    const { resource, fieldGroup } = req.params as { resource: string; fieldGroup: string };

    if (!FIELD_POLICY_RESOURCES.includes(resource as any)) {
      return reply.status(400).send({ error: `Unknown resource: ${resource}` });
    }
    if (!FIELD_GROUPS.includes(fieldGroup as any)) {
      return reply.status(400).send({ error: `Unknown field group: ${fieldGroup}` });
    }

    await withTenant(user.tenant_id, async (trx) => {
      await (trx.deleteFrom('tenant_field_policies' as any) as any)
        .where('tenant_id', '=', user.tenant_id)
        .where('resource', '=', resource)
        .where('field_group', '=', fieldGroup)
        .execute();
    });

    invalidateFieldPolicyCache(user.tenant_id);
    return { success: true, message: 'Reset to default.' };
  });
}
