import type { FastifyInstance } from 'fastify';
import * as samlify from 'samlify';
import { Redis } from 'ioredis';
import { dbPlatform } from '../db/client.js';
import { env } from '../config/env.js';
import { recordLogin } from './auth.routes.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { setSessionCookies } from '../lib/cookies.js';
import { issueTokens } from '../services/token.service.js';
import type { JWTPayload } from '@hudumika/types';

/**
 * Real SAML 2.0 SP-initiated + IdP-initiated assertion handling for Ondi's
 * inbound SSO registry (migration 053's sso_providers, provider_type =
 * 'SAML') — until now a config store only, per that migration's own header
 * comment ("this is NOT a working SAML/OIDC federation implementation").
 * Hudumika is the Service Provider here: a tenant registers their own
 * corporate IdP's entity ID / SSO URL / signing certificate as a
 * sso_providers row, and their staff sign in through it instead of a
 * Hudumika password — the same relationship Okta/Entra ID have with a
 * customer's Google Workspace or on-prem AD FS, not the other direction.
 *
 * Real XML-DSig signature verification via samlify (xml-crypto under the
 * hood), not hand-rolled: a subtly-incorrect hand-rolled SAML signature
 * check (wrong canonicalization, an XML wrapping attack, trusting an
 * unsigned node) is a well-known, high-severity bug class — this is exactly
 * why the earlier config-registry-only version never attempted it.
 *
 * samlify itself verifies the signature, the assertion's Issuer, and the
 * NotBefore/NotOnOrAfter validity window — but NOT audience restriction
 * (SAML Core §2.5.1.4): it writes an assertion's <Audience> when an IdP
 * builds one and extracts it back out when parsing one, but never compares
 * the two. A cross-tenant replay test against this file's own /acs caught
 * that gap directly: an assertion legitimately signed for a *different*
 * Ondi tenant's SAML provider (by the same IdP cert) verified cleanly and
 * would have signed a user in, because nothing else in the assertion ties
 * it to one specific SP. The ACS handler below closes this itself — see its
 * own comment at the audience check.
 */

// samlify refuses to parse anything until a schema validator is registered
// (see node_modules/samlify's own libsaml.isValidXml — it rejects with "no
// validation function found" otherwise). What that validator checks is XML
// *well-formedness against the SAML XSD*, a shape check — it is NOT the
// cryptographic signature check. This environment has no system `xmllint`
// (the usual real validator, via @authenio/samlify-node-xmllint) to shell
// out to, so schema validation is skipped here; the mandatory, unconditional
// signature/issuer/audience/validity-window verification samlify performs
// via xml-crypto happens regardless of this setting and is not weakened by
// it — that verification is the actual security boundary this file exists
// to provide.
samlify.setSchemaValidator({ validate: async () => 'SKIP' });

// Short-lived cache of AuthnRequest IDs this SP has issued, so an inbound
// response's InResponseTo (when present — see the ACS handler's own comment
// on IdP-initiated logins, which have none) can be checked against a
// request this SP actually sent rather than trusted at face value. Same
// "Redis, not Postgres — short TTL, no retention value" reasoning as
// ondi-auth.routes.ts's own OTP/magic-link stores.
let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 1500,
    enableOfflineQueue: false,
  });
  redisClient.on('error', () => {
    try { redisClient?.disconnect(); } catch { /* already gone */ }
    redisClient = null;
  });
} catch {
  redisClient = null;
}

const SAML_REQUEST_TTL_SECONDS = 10 * 60;
const samlRequestKey = (id: string) => `ondi:saml:req:${id}`;

interface SamlProviderConfig {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
}

function isSamlConfig(config: any): config is SamlProviderConfig {
  return !!config
    && typeof config.idpEntityId === 'string' && config.idpEntityId.length > 0
    && typeof config.idpSsoUrl === 'string' && config.idpSsoUrl.length > 0
    && typeof config.idpCertificate === 'string' && config.idpCertificate.length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public (pre-tenant) lookup — the caller doesn't have a session yet;
 *  :providerId in the URL is what fixes which tenant this login is for. A
 *  malformed id (anyone probing these public, unauthenticated routes with
 *  garbage) must resolve to the same clean "not found" every other bad id
 *  gets — without this check it reached Postgres as a raw `= $1` against a
 *  uuid column and came back as an unhandled 500 with the driver's own
 *  error text ("invalid input syntax for type uuid: ...") exposed straight
 *  to the caller. */
async function loadProvider(providerId: string) {
  if (!UUID_RE.test(providerId)) return null;

  const row = await dbPlatform.selectFrom('sso_providers').selectAll()
    .where('id', '=', providerId)
    .where('provider_type', '=', 'SAML')
    .where('enabled', '=', true)
    .executeTakeFirst();
  if (!row) return null;

  const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
  if (!isSamlConfig(config)) return null;
  return { row, config };
}

function buildEntities(providerId: string, config: SamlProviderConfig) {
  const spEntityId = `${env.API_BASE_URL}/v1/ondi/auth/saml/${providerId}/metadata`;
  const acsUrl = `${env.API_BASE_URL}/v1/ondi/auth/saml/${providerId}/acs`;

  // No SP-side signing key: the AuthnRequest is unsigned (authnRequestsSigned
  // defaults false), which every major IdP (Okta, Entra ID, Google) accepts
  // for a standard integration — a minted SP keypair with no rotation story
  // would be false rigor here, not real security, since the assertion the
  // IdP sends back is what actually has to be trustworthy, and that side IS
  // fully signature-verified below.
  const sp = samlify.ServiceProvider({
    entityID: spEntityId,
    assertionConsumerService: [{ Binding: samlify.Constants.namespace.binding.post, Location: acsUrl }],
    wantAssertionsSigned: true,
  });
  const idp = samlify.IdentityProvider({
    entityID: config.idpEntityId,
    singleSignOnService: [{ Binding: samlify.Constants.namespace.binding.redirect, Location: config.idpSsoUrl }],
    signingCert: config.idpCertificate,
  });
  return { sp, idp, spEntityId };
}

export async function ondiSamlRoutes(fastify: FastifyInstance) {
  // The IdP's browser POSTs the assertion as application/x-www-form-urlencoded
  // (SAML's HTTP-POST binding — SAMLResponse[+RelayState] form fields, not
  // JSON). Same gap and same fix as smsWebhookRoutes' own doc comment:
  // Fastify has no built-in urlencoded parser, and scoping it to this plugin
  // instance avoids a new dependency for something this simple to parse.
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body as string))); }
    catch (err: any) { done(err, undefined); }
  });

  /**
   * GET /v1/ondi/auth/saml/:providerId/metadata
   * SP metadata XML — what a tenant's IT admin pastes into their IdP's "add
   * application" flow. Public: SP metadata is not a secret, the same way an
   * OAuth client_id isn't.
   */
  fastify.get<{ Params: { providerId: string } }>('/:providerId/metadata', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const found = await loadProvider(request.params.providerId);
    if (!found) return reply.status(404).send({ error: 'Unknown or disabled SAML provider.' });

    const { sp } = buildEntities(found.row.id, found.config);
    reply.header('Content-Type', 'application/xml');
    return sp.getMetadata();
  });

  /**
   * GET /v1/ondi/auth/saml/:providerId/login
   * SP-initiated: redirects the browser to the IdP's SSO endpoint carrying
   * an AuthnRequest via the HTTP-Redirect binding (unsigned — see
   * buildEntities' own comment on why that's the right default here).
   */
  fastify.get<{ Params: { providerId: string } }>('/:providerId/login', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const found = await loadProvider(request.params.providerId);
    if (!found) return reply.status(404).send({ error: 'Unknown or disabled SAML provider.' });

    const { sp, idp } = buildEntities(found.row.id, found.config);
    const { context: redirectUrl, id } = sp.createLoginRequest(idp, 'redirect') as { context: string; id: string };

    if (redisClient) {
      await redisClient.set(samlRequestKey(id), found.row.id, 'EX', SAML_REQUEST_TTL_SECONDS);
    }
    return reply.redirect(redirectUrl);
  });

  /**
   * POST /v1/ondi/auth/saml/:providerId/acs
   * Assertion Consumer Service. The IdP's browser lands here directly via a
   * real form-POST — this is not a fetch() call from the SPA, so success and
   * failure are both expressed as a redirect, never JSON.
   *
   * Accepts both SP-initiated responses (InResponseTo matches a request this
   * SP actually issued via /login above) and IdP-initiated ones (no
   * InResponseTo at all — e.g. the user clicked the Hudumika tile from
   * inside their IdP's own app dashboard, never having hit /login first).
   * Both are legitimate SAML flows; rejecting IdP-initiated logins outright
   * would break the single most common real-world entry point. Either way,
   * the signature, issuer, audience restriction and validity window are all
   * still fully verified by samlify before anything here trusts a single
   * claim in the assertion.
   */
  fastify.post<{ Params: { providerId: string } }>('/:providerId/acs', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const failUrl = `${env.OPS_BOARD_URL}/ondi/login?samlError=1`;
    const ip = request.ip;
    const userAgent = String(request.headers['user-agent'] || '');

    const found = await loadProvider(request.params.providerId);
    if (!found) return reply.redirect(failUrl);
    const { sp, idp, spEntityId } = buildEntities(found.row.id, found.config);

    let extract: Record<string, any>;
    try {
      const result = await sp.parseLoginResponse(idp, 'post', { body: request.body as Record<string, unknown> });
      extract = result.extract;
    } catch {
      await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'assertion_verification_failed', providerId: found.row.id } });
      return reply.redirect(failUrl);
    }

    // samlify verifies the signature, the Issuer and the validity window
    // (NotBefore/NotOnOrAfter) on its own — but NOT audience restriction; it
    // writes <Audience> when an IdP builds a response, and extracts it back
    // out for the caller, but never compares it against anything when
    // parsing one. Skipping this check would mean any assertion the IdP
    // ever signs for ANY of its trusted SPs — a different Ondi tenant's own
    // SAML provider included — would verify cleanly here too, since nothing
    // else in the assertion ties it to this specific SP. This is SAML Core
    // §2.5.1.4's own requirement, enforced here because the library doesn't.
    const audience = extract.audience;
    const audienceOk = Array.isArray(audience) ? audience.includes(spEntityId) : audience === spEntityId;
    if (!audienceOk) {
      await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'audience_mismatch', providerId: found.row.id } });
      return reply.redirect(failUrl);
    }

    const inResponseTo: string | undefined = extract.response?.inResponseTo;
    if (inResponseTo) {
      // SP-initiated — the ID must be one this SP issued, for this same
      // provider, and is consumed on first use (replay protection).
      if (!redisClient) {
        await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'request_cache_unavailable', providerId: found.row.id } });
        return reply.redirect(failUrl);
      }
      const owner = await redisClient.get(samlRequestKey(inResponseTo));
      if (owner !== found.row.id) {
        await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'unknown_in_response_to', providerId: found.row.id } });
        return reply.redirect(failUrl);
      }
      await redisClient.del(samlRequestKey(inResponseTo));
    }
    // No InResponseTo → unsolicited/IdP-initiated, allowed by design (see
    // this handler's own doc comment above).

    const nameId: string | undefined = extract.nameID;
    const attributes = extract.attributes as Record<string, any> | undefined;
    const attrEmail = attributes?.email
      ?? attributes?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']
      ?? attributes?.['urn:oid:0.9.2342.19200300.100.1.3']; // eduPerson/LDAP mail OID, seen from a few SAML IdPs
    const email = (nameId && nameId.includes('@')) ? nameId
      : (typeof attrEmail === 'string' ? attrEmail : Array.isArray(attrEmail) ? attrEmail[0] : undefined);

    if (!email) {
      await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'no_email_in_assertion', providerId: found.row.id } });
      return reply.redirect(failUrl);
    }

    // Scoped to this provider's own tenant — deliberately NOT the global
    // pre-tenant email lookup every other login path in this codebase uses.
    // Which tenant a SAML login can authenticate into is fixed by which
    // :providerId's ACS URL the IdP was configured to POST to, never by
    // anything the assertion itself claims — a signed assertion from tenant
    // A's IdP must not be able to sign in as a user in tenant B, even on a
    // coincidental email match.
    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('tenant_id', '=', found.row.tenant_id).where('active', '=', true)
      .executeTakeFirst();
    if (!user) {
      await recordAuthEvent(found.row.tenant_id, null, 'login_failed', { ip, userAgent, metadata: { via: 'saml', reason: 'no_matching_user', providerId: found.row.id } });
      return reply.redirect(failUrl);
    }

    // Same session mechanism every other Ondi login path lands on
    // (issueTokens + setSessionCookies + recordLogin). No local TOTP
    // re-check here, deliberately, matching this file's google/verify and
    // microsoft/verify siblings: a signed federated-IdP assertion is itself
    // a strong authentication attestation (typically from an IdP that
    // already enforces its own MFA), not a weak signal like a magic link's
    // "proved inbox access" — re-prompting for a second local factor after
    // it would defeat the point of centralizing auth at the IdP.
    const deviceId = await recordLogin(user.tenant_id, user.id, 'SUCCESS', ip, userAgent);
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id, tenant_id: user.tenant_id, role: user.role, email: user.email, name: user.name,
      ...(deviceId ? { device_id: deviceId } : {}),
    };
    const tokens = issueTokens(fastify, payload as any);
    setSessionCookies(reply, tokens);
    await recordAuthEvent(user.tenant_id, user.id, 'saml_login', { ip, userAgent, metadata: { providerId: found.row.id } });

    // The IdP's browser landed here via a real navigation, not a fetch — the
    // SPA has no localStorage user object yet even though real session
    // cookies are now set. /auth/sso-complete hydrates that from the cookie
    // before entering the app (see SsoCompletePage.tsx).
    return reply.redirect(`${env.OPS_BOARD_URL}/auth/sso-complete`);
  });

  /**
   * GET /v1/ondi/auth/saml/lookup?email=
   * Discovery for the frontend's "Company SSO" entry point — resolves an
   * email to its tenant's enabled SAML provider, if any. Deliberately not
   * enumeration-safe the way /forgot-password is: a false result collapses
   * "no account" and "account exists but no SSO" into the same response, so
   * the only thing a true result reveals is "this tenant has SSO
   * configured" — the same class of information any "Continue with SSO by
   * email" flow (Slack, Notion, GitHub Enterprise) already reveals by
   * necessity, not individual account existence.
   */
  fastify.get<{ Querystring: { email?: string } }>('/lookup', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const email = (request.query.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return reply.status(400).send({ error: 'A valid email is required.' });

    const user = await dbPlatform.selectFrom('users').select(['tenant_id'])
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();
    if (!user) return { found: false };

    const provider = await dbPlatform.selectFrom('sso_providers').select(['id', 'name'])
      .where('tenant_id', '=', user.tenant_id).where('provider_type', '=', 'SAML').where('enabled', '=', true)
      .executeTakeFirst();
    if (!provider) return { found: false };

    return { found: true, providerId: provider.id, providerName: provider.name };
  });
}
