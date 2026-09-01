import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { JWTPayload } from '@hudumika/types';
import { createHash } from 'crypto';
import { dbPlatform } from '../db/client.js';
import { isMeteredPath, checkUsageLimit } from '../lib/usage.js';
import { verifyCsrf } from './csrf.js';

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

/**
 * An 'ORG'-role token (see organizations.routes.ts / org.routes.ts, migration
 * 230) carries no tenant_id claim at all — structurally different from every
 * other login this API issues. `request.user` stays typed as JWTPayload
 * everywhere (changing that would ripple `user.tenant_id` type errors across
 * the ~100 route files that read it directly), so nothing stops an org token
 * from being replayed against an ordinary tenant-scoped route and hitting
 * `user.tenant_id` as `undefined` at runtime unless it's rejected before any
 * route handler runs. This allowlist is that rejection, checked once here
 * rather than trusted to every route file individually — the same reasoning
 * that produced the CUSTOMER-role allowlist in support.routes.ts, just at
 * the one shared chokepoint every route's preHandler already passes through.
 */
const ORG_ALLOWED_ROUTES: { method: string; url: string }[] = [
  { method: 'GET', url: '/v1/org/workspaces' },
  { method: 'GET', url: '/v1/org/customers' },
  { method: 'POST', url: '/v1/org/claim' },
  { method: 'GET', url: '/v1/org/shipments' },
  { method: 'GET', url: '/v1/org/invoices' },
  { method: 'GET', url: '/v1/org/documents' },
  { method: 'GET', url: '/v1/org/documents/:id/download' },
  { method: 'PUT', url: '/v1/org/documents/:id/share' },
  { method: 'GET', url: '/v1/org/tickets' },
  { method: 'POST', url: '/v1/org/tickets' },
  { method: 'GET', url: '/v1/org/tickets/:id' },
  { method: 'POST', url: '/v1/org/tickets/:id/reply' },
  { method: 'GET', url: '/v1/org/seal-lots' },
  { method: 'POST', url: '/v1/org/seal-lots/:lotId/dispatch-request' },
  { method: 'GET', url: '/v1/org/dispatch-requests' },
  // Session-cookie migration: an org session needs somewhere to clear its
  // own cookies server-side (authRoutes is mounted at both prefixes — see
  // index.ts). Everything else /auth/logout does (hr_devices revocation) is
  // staff-only and skipped for an ORG actor inside the handler itself.
  { method: 'POST', url: '/auth/logout' },
  { method: 'POST', url: '/v1/auth/logout' },
];

import fp from 'fastify-plugin';

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** Blocks the request with 503 when Platform Settings ▸ Maintenance Mode is
 *  on — the same app_status/SUPER_ADMIN-bypass shape entitlement.ts's
 *  checkEntitlement() already applies per-app (line ~68-74), generalized to
 *  the whole platform. Lives here, not a separate global hook, because this
 *  is the one preHandler every protected route already runs (see
 *  enforceUsageGate below for the established precedent) — and because
 *  /v1/auth/* routes never call authenticate() at all (there's no token yet
 *  at login), they're naturally exempt without any route-prefix allowlist. */
async function enforceMaintenanceGate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.user.role === 'SUPER_ADMIN') return false;
  const row = await dbPlatform.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
  if (!row) return false;
  const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
  if (settings?.maintenance === true) {
    reply.status(503).send({ error: 'Hudumika is temporarily down for maintenance. Please check back shortly.', code: 'PLATFORM_MAINTENANCE' });
    return true;
  }
  return false;
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
      // Structurally pre-tenant: the tenant isn't known until this lookup
      // resolves, so it can't be scoped in advance — dbPlatform, not db.
      const row = await dbPlatform.selectFrom('api_keys')
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

      dbPlatform.updateTable('api_keys').set({ last_used_at: new Date() }).where('id', '=', row.id).execute().catch(() => {});
      if (await enforceMaintenanceGate(request, reply)) return;
      if (await enforceUsageGate(request, reply)) return;
      return;
    }

    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid or expired token' });
    }

    // Cookie-priority extraction (lib/cookies.ts's extractToken) means the
    // absence of an Authorization header is exactly the signal that this
    // request's credential was the ambient session cookie, not something
    // explicitly attached — the double-submit CSRF check only applies to
    // that case (see middleware/csrf.ts's own doc comment for why).
    if (!verifyCsrf(request, reply, !request.headers.authorization)) return;

    // A refresh token is not a key to the API. It is long-lived on purpose and
    // only /auth/refresh accepts it; without this check the split between the
    // two lifetimes would buy nothing.
    if ((request.user as any).typ === 'refresh') {
      return reply.status(401).send({ error: 'Unauthorized: refresh tokens cannot be used for API requests' });
    }

    // A Bliss meeting-guest token (calls.routes.ts's calls-public routes,
    // GUEST role comment in @hudumika/types) was never a real login and has
    // zero legitimate REST surface — unlike ORG it gets no allowlist at all.
    // Its only valid use is the /v1/calls/signal WebSocket, which verifies
    // it separately, inline, and never goes through this decorator. Checked
    // here, at the one chokepoint every authenticated route already passes
    // through, so no individual route file can forget it.
    if ((request.user as any).typ === 'guest') {
      return reply.status(401).send({ error: 'Unauthorized: guest sessions cannot be used for API requests' });
    }

    // See ORG_ALLOWED_ROUTES above — an org token has no tenant_id claim and
    // must never reach a route that assumes one.
    if ((request.user.role as string) === 'ORG') {
      const url = request.routeOptions?.url;
      const allowed = ORG_ALLOWED_ROUTES.some(r => r.method === request.method && r.url === url);
      if (!allowed) return reply.status(401).send({ error: 'Not available for this account type' });
    }

    // Access tokens now expire, but expiry alone cannot end a session early —
    // device_id (see auth.routes.ts login / hr_devices.revoked_at) is what
    // "Sign Out" in Workspace ▸ Security revokes, re-checked live on every
    // request rather than trusting what the token claimed at sign-in.
    if (request.user.device_id) {
      // Also structurally pre-tenant-context for this check — it exists to
      // catch a revoked session regardless of what the token itself claims.
      const device = await dbPlatform.selectFrom('hr_devices').select(['revoked_at', 'last_used_at'])
        .where('id', '=', request.user.device_id).executeTakeFirst();
      if (device?.revoked_at) {
        return reply.status(401).send({ error: 'Unauthorized: Session has been signed out' });
      }

      // Session-timeout policy (Ondi M8, Enterprise ▸ Policies) — previously
      // saved (tenant_settings.settings.sessionPolicy.timeoutMinutes) but
      // never actually read back anywhere, so setting it did nothing. Wired
      // in here rather than left decorative, using the exact same "re-check
      // live on every request" shape the revocation check above already
      // proved out. last_used_at is bumped at login and on every token
      // refresh (auth.routes.ts) — a refresh only happens while the SPA is
      // actively in use, so its age is a real idle-time signal, not always
      // "now". A tenant with no policy configured enforces nothing (the
      // untouched default), same as before this existed.
      if (device?.last_used_at) {
        const settingsRow = await dbPlatform.selectFrom('tenant_settings').select('settings')
          .where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
        const settings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : null;
        const timeoutMinutes = settings?.sessionPolicy?.timeoutMinutes;
        if (typeof timeoutMinutes === 'number' && timeoutMinutes > 0) {
          const idleMs = Date.now() - new Date(device.last_used_at).getTime();
          if (idleMs > timeoutMinutes * 60 * 1000) {
            return reply.status(401).send({ error: 'Unauthorized: Session expired due to inactivity' });
          }
        }
      }
    }

    if (await enforceMaintenanceGate(request, reply)) return;
    await enforceUsageGate(request, reply);
  });
});
