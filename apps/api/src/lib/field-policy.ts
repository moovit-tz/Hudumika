import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole, FieldPolicyResource, FieldGroup, TenantFieldPolicy } from '@hudumika/types';
import { FIELD_GROUPS, RESOURCE_FIELD_MAP, DEFAULT_FIELD_POLICIES } from '@hudumika/types';
import { withTenant } from '../db/client.js';

const cache = new Map<string, { policies: TenantFieldPolicy[]; expires: number }>();
const CACHE_TTL = 60_000;

async function loadTenantPolicies(tenantId: string): Promise<TenantFieldPolicy[]> {
  const key = tenantId;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.policies;

  const rows = await withTenant(tenantId, async (trx) =>
    trx.selectFrom('tenant_field_policies' as any)
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .execute()
  ) as TenantFieldPolicy[];

  cache.set(key, { policies: rows, expires: Date.now() + CACHE_TTL });
  return rows;
}

export function invalidateFieldPolicyCache(tenantId: string) {
  cache.delete(tenantId);
}

export function getEffectiveRoles(
  resource: FieldPolicyResource,
  group: FieldGroup,
  tenantOverrides: TenantFieldPolicy[],
): readonly UserRole[] {
  const override = tenantOverrides.find(p => p.resource === resource && p.field_group === group);
  if (override) return override.allowed_roles;
  return DEFAULT_FIELD_POLICIES[resource]?.[group] ?? [];
}

export function getVisibleGroups(
  resource: FieldPolicyResource,
  role: UserRole,
  tenantOverrides: TenantFieldPolicy[],
): FieldGroup[] {
  if (role === 'SUPER_ADMIN') return [...FIELD_GROUPS];
  return FIELD_GROUPS.filter(group => {
    const allowed = getEffectiveRoles(resource, group, tenantOverrides);
    return (allowed as readonly string[]).includes(role);
  });
}

export function getRedactedFields(
  resource: FieldPolicyResource,
  role: UserRole,
  tenantOverrides: TenantFieldPolicy[],
): Set<string> {
  const redacted = new Set<string>();
  const fieldMap = RESOURCE_FIELD_MAP[resource];
  if (!fieldMap) return redacted;

  for (const group of FIELD_GROUPS) {
    const allowed = getEffectiveRoles(resource, group, tenantOverrides);
    if (!(allowed as readonly string[]).includes(role) && role !== 'SUPER_ADMIN') {
      for (const field of fieldMap[group]) {
        redacted.add(field);
      }
    }
  }
  return redacted;
}

export function redactRecord<T extends Record<string, unknown>>(
  record: T,
  resource: FieldPolicyResource,
  role: UserRole,
  tenantOverrides: TenantFieldPolicy[],
): Partial<T> {
  const redacted = getRedactedFields(resource, role, tenantOverrides);
  if (redacted.size === 0) return record;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = redacted.has(key) ? undefined : value;
  }
  return result as Partial<T>;
}

export function redactList<T extends Record<string, unknown>>(
  records: T[],
  resource: FieldPolicyResource,
  role: UserRole,
  tenantOverrides: TenantFieldPolicy[],
): Partial<T>[] {
  const redacted = getRedactedFields(resource, role, tenantOverrides);
  if (redacted.size === 0) return records;
  return records.map(record => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = redacted.has(key) ? undefined : value;
    }
    return result as Partial<T>;
  });
}

export async function resolveFieldPolicy(tenantId: string, resource: FieldPolicyResource, role: UserRole) {
  const overrides = await loadTenantPolicies(tenantId);
  return {
    visibleGroups: getVisibleGroups(resource, role, overrides),
    redactedFields: getRedactedFields(resource, role, overrides),
    redact<T extends Record<string, unknown>>(record: T) {
      return redactRecord(record, resource, role, overrides);
    },
    redactAll<T extends Record<string, unknown>>(records: T[]) {
      return redactList(records, resource, role, overrides);
    },
  };
}

export function requireFieldGroup(resource: FieldPolicyResource, group: FieldGroup) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });
    if (user.role === 'SUPER_ADMIN') return;

    const overrides = await loadTenantPolicies(user.tenant_id);
    const allowed = getEffectiveRoles(resource, group, overrides);
    if (!(allowed as readonly string[]).includes(user.role)) {
      return reply.status(403).send({
        error: `Your role does not have access to ${group} data on ${resource}.`,
      });
    }
  };
}
