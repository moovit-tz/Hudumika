import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { JWTPayload } from '@hudumika/types';
import { createHash } from 'crypto';
import { db } from '../db/client.js';
import { isMeteredPath, checkUsageLimit } from '../lib/usage.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Non-null only when this request authenticated via an x-api-key header
     *  (see apiKeyAuth below) — the feature keys that key is scoped to.
     *  requireEntitlement() additionally restricts to this list when set. */
    apiKeyScopes?: string[] | null;
  }
}

import fp from 'fastify-plugin';

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Blocks the request with 402 if this tenant is over its plan's monthly item cap.
 *  Only applies to POST requests on metered routes — see isMeteredPath(). */
async function enforceUsageGate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.method !== 'POST' || !isMeteredPath(request.routeOptions?.url || request.raw.url)) return false;
  const gate = await checkUsageLimit(request.user.tenant_id, request.user.role);
  if (gate.exceeded) {
    reply.status(402).send({ error: 'USAGE_LIMIT_EXCEEDED', message: gate.message, used: gate.used, limit: gate.limit });
    return true;
  }
  return false;
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('apiKeyScopes', null);

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKeyHeader = request.headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      const keyHash = hashApiKey(apiKeyHeader);
      const row = await db.selectFrom('api_keys')
        .selectAll()
        .where('key_hash', '=', keyHash)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();

      if (!row) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid or revoked API key' });
      }

      /**
       * An expired key is not a valid key.
       *
       * Revocation was the only way a key ever stopped working, so every key
       * ever issued stayed live until somebody remembered to go and kill it.
       * A null expiry still means "never", which is what every existing key
       * has — this only enforces a date once one has been set.
       */
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        return reply.status(401).send({
          error: `Unauthorized: this API key expired on ${new Date(row.expires_at).toISOString().slice(0, 10)}.`,
        });
      }

      /**
       * A read-only key may only make safe requests.
       *
       * Scopes are entitlement feature keys, so a key scoped to 'onsite' could
       * read a server and also delete it. Checked here rather than per-route
       * because "does this request write" is a property of the method, and one
       * place that cannot be forgotten beats every handler remembering.
       */
      if (row.read_only && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return reply.status(403).send({
          error: `This API key is read-only, so it cannot ${request.method} ${request.url}.`,
        });
      }

      request.user = {
        sub: `apikey:${row.id}`,
        tenant_id: row.tenant_id,
        role: row.acting_role as JWTPayload['role'],
        email: '',
        name: row.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      request.apiKeyScopes = row.scopes;

      db.updateTable('api_keys').set({ last_used_at: new Date() }).where('id', '=', row.id).execute().catch(() => {});
      if (await enforceUsageGate(request, reply)) return;
      return;
    }

    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid or expired token' });
    }

    // A refresh token is not a key to the API. It is long-lived on purpose and
    // only /auth/refresh accepts it; without this check the split between the
    // two lifetimes would buy nothing.
    if ((request.user as any).typ === 'refresh') {
      return reply.status(401).send({ error: 'Unauthorized: refresh tokens cannot be used for API requests' });
    }

    // Access tokens now expire, but expiry alone cannot end a session early —
    // device_id (see auth.routes.ts login / hr_devices.revoked_at) is what
    // "Sign Out" in Workspace ▸ Security revokes, re-checked live on every
    // request rather than trusting what the token claimed at sign-in.
    if (request.user.device_id) {
      const device = await db.selectFrom('hr_devices').select('revoked_at')
        .where('id', '=', request.user.device_id).executeTakeFirst();
      if (device?.revoked_at) {
        return reply.status(401).send({ error: 'Unauthorized: Session has been signed out' });
      }
    }

    await enforceUsageGate(request, reply);
  });
});
