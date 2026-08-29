import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { authRoutes } from './routes/auth.js';
import { recoveryRoutes } from './routes/recovery.js';
import { mfaRoutes } from './routes/mfa.js';
import { deviceRoutes } from './routes/devices.js';
import { sessionRoutes } from './routes/sessions.js';
import { authzRoutes } from './routes/authz.js';
import { federatedRoutes } from './routes/federated.js';
import { webauthnRoutes } from './routes/webauthn.js';
import { samlRoutes } from './routes/saml.js';
import kycRoutes             from './routes/kyc.js';
import kybRoutes             from './routes/kyb.js';
import { organizationRoutes } from './routes/organizations.js';
import { orgActivityRoutes }     from './routes/org-activity.js';
import { orgAssetsRoutes }       from './routes/org-assets.js';
import { orgAccessRoutes }       from './routes/org-access.js';
import { orgGroupRoutes }        from './routes/org-groups.js';
import { orgAutomationRoutes }   from './routes/org-automation.js';
import { orgComplianceRoutes }   from './routes/org-compliance.js';
import { orgCompliancePdpaRoutes } from './routes/org-compliance-pdpa.js';
import { visitorRoutes } from './routes/visitors.js';
import { orgAccessReviewRoutes } from './routes/org-access-reviews.js';
import { personalComplianceRoutes } from './routes/personal-compliance.js';
import { orgIntegrationsRoutes } from './routes/org-integrations.js';
import { orgPoliciesRoutes }     from './routes/org-policies.js';
import { orgSecurityRoutes }     from './routes/org-security.js';
import { orgTrustRoutes }        from './routes/org-trust.js';
import { scoreRoutes }   from './routes/score.js';
import { trustRoutes }   from './routes/trust.js';
import { vaultRoutes }   from './routes/vault.js';
import { oauthRoutes }   from './routes/oauth.js';
import { clientRoutes }  from './routes/clients.js';
import { auditRoutes }   from './routes/audit.js';
import { metricsRoutes } from './routes/metrics.js';
import { authentikWebhookRoutes } from './routes/authentik-webhooks.js';
import { prismaPlugin }  from './plugins/prisma.js';
import { redisPlugin }   from './plugins/redis.js';
import { riskPlugin }    from './plugins/risk.js';
import { auditPlugin }   from './plugins/audit.js';
import { trustEnginePlugin } from './plugins/trust-engine.js';
import { authentikPlugin } from './plugins/authentik.js';
import { queuePlugin }    from './plugins/queue.js';
import { accessPolicyPlugin } from './plugins/access-policy.js';

/**
 * Builds a fully-registered Fastify app instance without binding it to a
 * network port. Extracted out of server.ts so integration tests can boot the
 * exact same app (same plugin registrations, same routes) in-process via
 * `.inject()`, instead of duplicating the wiring or shelling out to a real
 * running server. server.ts itself just calls this and then `.listen()`.
 */
export interface BuildAppOptions {
  /**
   * Overrides the default logger. Tests use this to point Fastify's pino
   * logger at an in-memory stream so they can read back dev-mode log lines
   * (e.g. "OTP for <phone>: <code>") — the only place a plaintext OTP is
   * ever observable outside a real SMS/WhatsApp gateway, since the OTP
   * table only ever stores a SHA-256 hash of the code (see routes/auth.ts).
   */
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: BuildAppOptions = {}) {
  // This API always runs behind a reverse proxy (nginx in every real
  // deployment) — without trustProxy, req.ip is the proxy's own address for
  // every request, which silently breaks per-IP rate limiting (everyone
  // shares one bucket) and any ipAddress/location captured from req.ip.
  const app = Fastify({
    logger: opts.logger ?? (process.env.NODE_ENV === 'test' ? false : true),
    trustProxy: true,
  });

  // Explicit allowlist instead of '*' — this API issues bearer tokens and holds
  // vault ciphertext, so any origin should not be able to read its responses.
  // Requests with no Origin header (native apps, curl, server-to-server) are
  // unaffected — CORS only governs browser-context reads.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
  });

  // Global default cap — route handlers below tighten this further for
  // brute-forceable endpoints (OTP/TOTP/security-code verification).
  app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
  });

  // The SAML HTTP-POST binding delivers AuthnRequest/Response as
  // application/x-www-form-urlencoded — Fastify only parses JSON by default.
  app.register(formbody);

  // KYC document image uploads.
  app.register(multipart);

  // ─── Core plugins ─────────────────────────────────────────────────────────────
  app.register(prismaPlugin);
  app.register(redisPlugin);
  app.register(riskPlugin);
  app.register(auditPlugin);   // tamper-proof audit chain — must register before routes
  app.register(authentikPlugin);
  app.register(trustEnginePlugin);
  app.register(queuePlugin);        // BullMQ: access-review-scheduler + webhook-delivery
  app.register(accessPolicyPlugin); // conditional/adaptive access evaluation

  // ─── Auth & Identity (Modules 1–3) ────────────────────────────────────────────
  app.register(authRoutes,      { prefix: '/v1/auth'           });
  app.register(recoveryRoutes,  { prefix: '/v1/auth'           });
  app.register(mfaRoutes,       { prefix: '/v1/mfa'            });
  app.register(deviceRoutes,    { prefix: '/v1/devices'        });
  app.register(sessionRoutes,   { prefix: '/v1/sessions'       });
  app.register(federatedRoutes, { prefix: '/v1/auth/federated' });
  app.register(webauthnRoutes,  { prefix: '/v1/webauthn'       });
  app.register(samlRoutes,      { prefix: '/v1/saml'           });
  app.register(authzRoutes,     { prefix: '/v1/authz'          });
  app.register(kycRoutes,       { prefix: '/v1/kyc'            });
  app.register(kybRoutes,       { prefix: '/v1/kyb'            });
  app.register(organizationRoutes, { prefix: '/v1/organizations' });
  app.register(orgActivityRoutes,     { prefix: '/v1/organizations' });
  app.register(orgAssetsRoutes,       { prefix: '/v1/organizations' });
  app.register(orgAccessRoutes,       { prefix: '/v1/organizations' });
  app.register(orgGroupRoutes,        { prefix: '/v1/organizations' });
  app.register(orgAutomationRoutes,   { prefix: '/v1/organizations' });
  app.register(orgComplianceRoutes,   { prefix: '/v1/organizations' });
  app.register(orgCompliancePdpaRoutes, { prefix: '/v1/organizations' });
  app.register(visitorRoutes,           { prefix: '/v1/organizations' });
  app.register(orgAccessReviewRoutes,   { prefix: '/v1/organizations' });
  app.register(orgIntegrationsRoutes, { prefix: '/v1/organizations' });
  app.register(orgPoliciesRoutes,     { prefix: '/v1/organizations' });
  app.register(orgSecurityRoutes,     { prefix: '/v1/organizations' });
  app.register(orgTrustRoutes,        { prefix: '/v1/organizations' });
  app.register(scoreRoutes,     { prefix: '/v1/score'          });
  app.register(trustRoutes,     { prefix: '/v1/trust'          });
  app.register(vaultRoutes,     { prefix: '/v1/vault'          });
  app.register(personalComplianceRoutes, { prefix: '/v1/compliance' });

  // ─── Authorization (Module 4) ─────────────────────────────────────────────────
  // authz middleware wired inline inside oauth & auth routes via app.audit + token claims

  // ─── SSO Gateway (Module 7) ───────────────────────────────────────────────────
  app.register(oauthRoutes,  { prefix: '/v1/oauth'   });
  app.register(clientRoutes, { prefix: '/v1/clients' });

  // ─── Webhooks ─────────────────────────────────────────────────────────────────
  app.register(authentikWebhookRoutes, { prefix: '/v1/webhooks' });

  // ─── Audit & Compliance (Module 8) ────────────────────────────────────────────
  app.register(auditRoutes,   { prefix: '/v1/audit'   });

  // ─── Observability ────────────────────────────────────────────────────────────
  app.register(metricsRoutes, { prefix: '/v1/metrics' });

  await app.ready();
  return app;
}
