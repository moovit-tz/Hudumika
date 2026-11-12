import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { extractToken } from './lib/cookies.js';
import { authPlugin } from './middleware/auth.js';
import { isDriverError, driverErrorResponse } from './utils/db-errors.js';
import { authRoutes } from './routes/auth.routes.js';
import { ondiRoutes } from './routes/ondi.routes.js';
import { ondiAuthRoutes } from './routes/ondi-auth.routes.js';
import { ondiSamlRoutes } from './routes/ondi-saml.routes.js';
import { ondiSamlIdpRoutes } from './routes/ondi-saml-idp.routes.js';
import { ondiOauthRoutes } from './routes/ondi-oauth.routes.js';
import { oidcDiscoveryRoutes } from './routes/oidc-discovery.routes.js';

/**
 * Standalone Ondi issuer — a second, independent process serving the exact
 * same OIDC/OAuth provider logic as the embedded instance inside index.ts
 * (apps/api's main server), on its own port. Built to answer one question
 * concretely: can Ondi actually run as its own service, in parallel with
 * the working embedded issuer, without anyone touching its logic?
 *
 * Deliberately NOT a reimplementation — it imports the exact same route
 * files (ondi.routes / ondi-auth.routes / ondi-saml.routes / ondi-oauth.
 * routes / oidc-discovery.routes) the main server registers, plus
 * auth.routes (POST /v1/auth/login — a relying party's own code must
 * authenticate a real Hudumika session before it can approve an OAuth
 * consent; that's not an Ondi-specific route, but it's the one dependency
 * every Ondi route in this file transitively needs). Same db/client.ts
 * (same Postgres, same signing-key table, same tenants/users), same
 * env.JWT_SECRET, same REDIS_URL — tokens either process issues are valid
 * to the other, by construction, not by a sync step.
 *
 * What this intentionally leaves out, and why: the browser-facing
 * `/ondi/authorize` consent SCREEN is a React page inside apps/web, proxied
 * to port 3001 by apps/web/vite.config.ts's dev-server proxy — that proxy
 * target is shared platform config, not something this file should rewrite
 * to point at a second port (that would redirect ALL of apps/web's traffic,
 * not just Ondi's, defeating "parallel with the working issuer"). This
 * server exposes the exact two API calls that page makes
 * (GET /v1/ondi/oauth/authorize/info, POST .../authorize/approve) directly,
 * which is enough to prove the backend OAuth flow end-to-end without
 * needing a browser or touching the shared proxy config. A real UI for
 * this standalone instance is follow-on work, not done here.
 */

const PORT = Number(process.env.ONDI_STANDALONE_PORT ?? 3010);

// See lib/oidc.ts's issuerUrl() doc comment — set here, as a process env
// var, never written into the shared .env the embedded server also reads,
// so only this process's discovery document/token `iss` claim changes.
// Defaults to this process's own origin so local dev needs no extra
// configuration; a real deployment overrides it to the real identity
// subdomain (e.g. https://id.hudumika.tz) via its own start command/unit.
if (!process.env.ONDI_ISSUER_OVERRIDE) {
  process.env.ONDI_ISSUER_OVERRIDE = `http://localhost:${PORT}`;
}

// Explicit CORS allowlist for this identity boundary — the relying-party
// origins actually allowed to call this issuer's endpoints with
// credentials, same shape as index.ts's own env.CORS_ORIGINS handling but
// scoped to its own env var rather than reusing the embedded server's
// (this process may serve a different set of relying parties than the
// main API does). Defaults to the local web dev origin only; a real
// deployment sets ONDI_STANDALONE_CORS_ORIGINS explicitly per relying
// party registered against this issuer. Replaces the previous
// `cb(null, true)` reflect-everything CORS policy — correct for proving
// the OAuth flow works at all, wrong for anything resembling a real
// identity boundary (see the standalone-apps audit, 5 Nov 2026).
const allowedOrigins = (process.env.ONDI_STANDALONE_CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean);

async function main() {
  const server = Fastify({ logger: true });

  await server.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await server.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  });

  await server.register(cookie);
  await server.register(jwt, { secret: env.JWT_SECRET, verify: { extractToken } });

  await server.register(rateLimit, { global: true, max: 1200, timeWindow: '1 minute' });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
      return reply.status(400).send({ error: 'Validation failed', details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    }
    if (isDriverError(error)) {
      const e = error as { code: string; column?: string; constraint?: string; detail?: string; table?: string };
      const { status, error: message } = driverErrorResponse(e);
      return reply.status(status).send({ error: message });
    }
    request.log.error({ err: error }, 'request failed');
    const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : undefined;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) return reply.send(error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  });

  await server.register(authPlugin);

  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(ondiRoutes, { prefix: '/v1/ondi' });
  await server.register(ondiAuthRoutes, { prefix: '/v1/ondi/auth' });
  await server.register(ondiSamlRoutes, { prefix: '/v1/ondi/auth/saml' });
  await server.register(ondiSamlIdpRoutes, { prefix: '/v1/ondi/saml/idp' });
  await server.register(ondiOauthRoutes, { prefix: '/v1/ondi/oauth' });
  await server.register(oidcDiscoveryRoutes);

  // discovery's authorization_endpoint (lib/oidc.ts's issuerUrl()) points
  // browsers here — `${issuer}/ondi/authorize` — but this process is a pure
  // API, it has no React app to render a consent screen with. The actual
  // consent UI (apps/web/src/pages/OndiAuthorize.tsx) is reused as-is, not
  // rebuilt, by redirecting the browser to it with the original query
  // string intact plus one extra param (`api_base`) telling that page which
  // origin to call back for authorize/info and authorize/approve — the
  // shared web app's own vite proxy only ever points at the embedded
  // server (port 3001), so the page can't resolve this issuer's API by
  // relative path alone. See OndiAuthorize.tsx's own handling of api_base.
  const webOrigin = process.env.ONDI_STANDALONE_WEB_ORIGIN ?? allowedOrigins[0] ?? 'http://localhost:5173';
  server.get('/ondi/authorize', async (request, reply) => {
    const qs = new URLSearchParams(request.query as Record<string, string>);
    qs.set('api_base', process.env.ONDI_ISSUER_OVERRIDE!);
    return reply.redirect(`${webOrigin}/ondi/authorize?${qs.toString()}`);
  });
  server.get('/ondi/saml/idp/authorize', async (request, reply) => {
    const qs = new URLSearchParams(request.query as Record<string, string>);
    qs.set('api_base', process.env.ONDI_ISSUER_OVERRIDE!);
    return reply.redirect(`${webOrigin}/ondi/saml/idp/authorize?${qs.toString()}`);
  });

  server.get('/health', async () => ({
    status: 'ok', service: 'ondi-standalone', timestamp: new Date().toISOString(),
    issuer: process.env.ONDI_ISSUER_OVERRIDE, allowed_origins: allowedOrigins,
  }));

  const address = await server.listen({ port: PORT, host: '0.0.0.0' });
  server.log.info(`Standalone Ondi issuer listening at ${address} — iss=${process.env.ONDI_ISSUER_OVERRIDE}, CORS allowlist=[${allowedOrigins.join(', ')}]`);
}

main().catch((err) => {
  console.error('Standalone Ondi issuer failed to start:', err);
  process.exit(1);
});
