import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { hashApiKey } from '../middleware/auth.js';
import type { UserRole } from '@hudumika/types';

const MGMT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

/** Feature keys a tenant is actually entitled to right now (package + overrides),
 *  used to cap what scopes a new API key can be issued for. Mirrors the same
 *  precedence as requireEntitlement()/GET /v1/entitlements, without the
 *  maintenance check (irrelevant at issuance time). */
async function getGrantedFeatures(tenantId: string): Promise<Set<string>> {
  const tenant = await db.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
  const planGrants = tenant
    ? await db.selectFrom('package_features').select('feature_key').where('package_code', '=', tenant.plan).execute()
    : [];
  const granted = new Set(planGrants.map(r => r.feature_key));

  const settingsRow = await db.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = settingsRow
    ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
    : {};
  const overrides = (settings['enabled-apps'] as Record<string, boolean> | undefined) ?? {};
  for (const [key, enabled] of Object.entries(overrides)) {
    if (enabled) granted.add(key);
    else granted.delete(key);
  }
  return granted;
}

export async function apiKeysRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...MGMT_ROLES));

  // GET /v1/api-keys — list this tenant's keys (never returns the hash or full key)
  fastify.get('/', async (request) => {
    const user = request.user;
    const keys = await db.selectFrom('api_keys')
      .select(['id', 'name', 'key_prefix', 'scopes', 'acting_role', 'last_used_at', 'revoked_at', 'created_at',
               'expires_at', 'read_only'])
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute();
    return { keys };
  });

  // POST /v1/api-keys — issue a new key. The raw key is returned ONCE, here, and never again.
  fastify.post<{
    Body: {
      name: string;
      scopes: string[];
      /** Omitted means the key never expires, which is what every pre-212 key is. */
      expires_in_days?: number | null;
      /** Safe methods only — enforced in middleware/auth.ts, not per route. */
      read_only?: boolean;
    };
  }>('/', async (request, reply) => {
    const user = request.user;
    const { name, scopes, expires_in_days, read_only } = request.body;

    if (!name?.trim()) return reply.status(400).send({ error: 'Name is required' });
    if (!Array.isArray(scopes) || scopes.length === 0) return reply.status(400).send({ error: 'At least one scope is required' });

    /**
     * An expiry, if one was asked for.
     *
     * Omitting it still means "never", which is what every key issued before
     * migration 212 has — but a caller that asks for 90 days should get 90
     * days rather than silently getting forever because the field was
     * mistyped.
     */
    let expiresAt: Date | null = null;
    if (expires_in_days !== undefined && expires_in_days !== null) {
      if (!Number.isInteger(expires_in_days) || expires_in_days < 1 || expires_in_days > 3650) {
        return reply.status(400).send({ error: 'expires_in_days must be a whole number of days between 1 and 3650.' });
      }
      expiresAt = new Date(Date.now() + expires_in_days * 86400 * 1000);
    }

    const granted = await getGrantedFeatures(user.tenant_id);
    const invalid = scopes.filter(s => !granted.has(s));
    if (invalid.length > 0) {
      return reply.status(403).send({
        error: `Your plan does not include: ${invalid.join(', ')}`,
        code: 'PLAN_UPGRADE_REQUIRED',
      });
    }

    const rawKey = `hdk_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = hashApiKey(rawKey);

    const row = await db.insertInto('api_keys')
      .values({
        tenant_id: user.tenant_id,
        name: name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: JSON.stringify(scopes) as unknown as string[],
        acting_role: user.role,
        created_by: user.sub,
        expires_at: expiresAt,
        read_only: read_only === true,
      })
      .returning(['id', 'name', 'key_prefix', 'scopes', 'acting_role', 'created_at',
                  'expires_at', 'read_only'])
      .executeTakeFirstOrThrow();

    reply.status(201);
    return { ...row, key: rawKey };
  });

  // DELETE /v1/api-keys/:id — revoke (soft delete, keeps usage history intact)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const key = await db.selectFrom('api_keys').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
    if (!key) return reply.status(404).send({ error: 'API key not found' });

    await db.updateTable('api_keys').set({ revoked_at: new Date() }).where('id', '=', id).execute();
    reply.status(204);
    return null;
  });

  // GET /v1/api-keys/usage — simple usage summary across this tenant's keys
  fastify.get('/usage', async (request) => {
    const user = request.user;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db.selectFrom('api_usage_events')
      .select(['path', 'method', 'status_code', 'created_at'])
      .where('tenant_id', '=', user.tenant_id)
      .where('created_at', '>=', since)
      .orderBy('created_at', 'desc')
      .limit(2000)
      .execute();

    const totalCalls = rows.length;
    const errorCalls = rows.filter(r => r.status_code >= 400).length;
    const byEndpoint = new Map<string, number>();
    rows.forEach(r => {
      const key = `${r.method} ${r.path}`;
      byEndpoint.set(key, (byEndpoint.get(key) ?? 0) + 1);
    });
    const topEndpoints = [...byEndpoint.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return { period_days: 30, total_calls: totalCalls, error_calls: errorCalls, top_endpoints: topEndpoints };
  });
}
