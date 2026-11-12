import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import * as samlify from 'samlify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { dbPlatform, withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { issuerUrl } from '../lib/oidc.js';
import { ORG_PERMISSIONS, requireRoleOrOrgPermission } from '../lib/org-rbac.js';
import { requireEntitlement, tenantHasEntitlement } from '../middleware/entitlement.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { requireRole } from '../middleware/rbac.js';
import { getOndiSamlSigningKey, listOndiSamlSigningKeys, rotateOndiSamlSigningKey, revokeOndiSamlSigningKey } from '../services/ondi-saml-idp-crypto.service.js';

const SAML = samlify.Constants.namespace;
const IDP_ENTITY_ID = `${issuerUrl()}/v1/ondi/saml/idp`;
const TRANSACTION_TTL_SECONDS = 300;
const REPLAY_TTL_SECONDS = 600;
const transactionKey = (id: string) => `ondi:saml:idp:transaction:${id}`;
const requestKey = (clientId: string, requestId: string) => `ondi:saml:idp:request:${clientId}:${crypto.createHash('sha256').update(requestId).digest('hex')}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPONSE_ATTRIBUTES = [
  { name: 'email', nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic', valueXsiType: 'xs:string', valueTag: 'email' },
  { name: 'name', nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic', valueXsiType: 'xs:string', valueTag: 'displayName' },
];

let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 1500, enableOfflineQueue: false });
  redisClient.on('error', () => { /* ioredis retries transient errors */ });
} catch { redisClient = null; }
function redisReady(client: Redis | null): client is Redis { return !!client && client.status === 'ready'; }

interface SamlMaterial { privateKey: string; certificate: string; certificates: string[] }
interface StoredClient {
  id: string; tenant_id: string; name: string; entity_id: string; acs_url: string; slo_url: string | null;
  signing_certificate: string; enabled: boolean;
}
interface SsoTransaction {
  clientId: string;
  tenantId: string;
  requestId: string;
  requestInfo: { extract: Record<string, any> };
  relayState?: string;
}

async function getSigningMaterial(): Promise<SamlMaterial | null> {
  try {
    const keyRing = await getOndiSamlSigningKey();
    const x509 = new crypto.X509Certificate(keyRing.certificate);
    const key = crypto.createPrivateKey(keyRing.privateKey);
    const privatePublic = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
    const certificatePublic = x509.publicKey.export({ type: 'spki', format: 'der' });
    if (!privatePublic.equals(certificatePublic)) return null;
    if (Date.parse(x509.validFrom) > Date.now() || Date.parse(x509.validTo) <= Date.now()) return null;
    const details = x509.publicKey.asymmetricKeyDetails;
    if (x509.publicKey.asymmetricKeyType !== 'rsa' || (details?.modulusLength ?? 0) < 2048) return null;
    const now = Date.now();
    const publishedCertificates = keyRing.publishedCertificates.map(value => new crypto.X509Certificate(value))
      .filter(cert => Date.parse(cert.validFrom) <= now && Date.parse(cert.validTo) > now)
      .map(cert => cert.toString());
    return {
      privateKey: keyRing.privateKey,
      certificate: x509.toString(),
      certificates: publishedCertificates,
    };
  } catch { return null; }
}

function isSafeEntityId(value: string): boolean {
  if (value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('urn:')) return /^urn:[A-Za-z0-9][A-Za-z0-9:._-]+$/.test(value);
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (env.APP_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function isSafeAcsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (env.APP_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

function isValidSpSigningCertificate(pem: string): boolean {
  try {
    const cert = new crypto.X509Certificate(pem);
    return Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now()
      && cert.publicKey.asymmetricKeyType === 'rsa'
      && (cert.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048;
  } catch { return false; }
}

function makeIdp(material: SamlMaterial, client: StoredClient) {
  const ssoUrl = `${IDP_ENTITY_ID}/${client.id}/sso`;
  const responseTemplate = {
    context: samlify.SamlLib.defaultLoginResponseTemplate.context.replace(
      '{AuthnStatement}',
      '<saml:AuthnStatement AuthnInstant="{AuthnInstant}" SessionIndex="{SessionIndex}" SessionNotOnOrAfter="{SessionNotOnOrAfter}"><saml:AuthnContext><saml:AuthnContextClassRef>{AuthnContextClassRef}</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>',
    ),
    attributes: RESPONSE_ATTRIBUTES,
  };
  return samlify.IdentityProvider({
    entityID: IDP_ENTITY_ID,
    privateKey: material.privateKey,
    signingCert: material.certificates,
    requestSignatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    allowedSignatureAlgorithms: ['http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'],
    wantAuthnRequestsSigned: true,
    nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
    singleSignOnService: [
      { Binding: SAML.binding.redirect, Location: ssoUrl },
      { Binding: SAML.binding.post, Location: ssoUrl },
    ],
    singleLogoutService: client.slo_url ? [
      { Binding: SAML.binding.redirect, Location: `${IDP_ENTITY_ID}/${client.id}/slo` },
      { Binding: SAML.binding.post, Location: `${IDP_ENTITY_ID}/${client.id}/slo` },
    ] : [],
    wantLogoutRequestSigned: true,
    loginResponseTemplate: responseTemplate,
    templateRenderer: 'strict',
  });
}

function makeSp(client: StoredClient) {
  return samlify.ServiceProvider({
    entityID: client.entity_id,
    authnRequestsSigned: true,
    signingCert: client.signing_certificate,
    assertionConsumerService: [{ Binding: SAML.binding.post, Location: client.acs_url, isDefault: true }],
    singleLogoutService: client.slo_url ? [
      { Binding: SAML.binding.redirect, Location: client.slo_url },
      { Binding: SAML.binding.post, Location: client.slo_url, isDefault: true },
    ] : [],
    wantAssertionsSigned: true,
    wantMessageSigned: true,
    wantLogoutResponseSigned: true,
    wantLogoutRequestSigned: true,
    allowUnsolicitedResponse: false,
    allowedSignatureAlgorithms: ['http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'],
  });
}

async function loadClient(id: string, tenantId?: string): Promise<StoredClient | null> {
  if (!UUID_RE.test(id)) return null;
  let query = dbPlatform.selectFrom('ondi_saml_sp_clients').selectAll().where('id', '=', id).where('enabled', '=', true);
  if (tenantId) query = query.where('tenant_id', '=', tenantId) as typeof query;
  return (await query.executeTakeFirst()) ?? null;
}

const addClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  entity_id: z.string().trim().min(1).max(1000).refine(isSafeEntityId, 'Use an HTTPS URL, a local development URL, or a URN as the SP entity ID.'),
  acs_url: z.string().trim().min(1).max(2000).refine(isSafeAcsUrl, 'ACS must be HTTPS (HTTP is allowed only for localhost in development).'),
  slo_url: z.string().trim().max(2000).optional().or(z.literal('')).refine(value => !value || isSafeAcsUrl(value), 'SLO must be HTTPS (HTTP is allowed only for localhost in development).'),
  signing_certificate: z.string().trim().min(1).max(20000),
});
const patchClientSchema = z.object({ enabled: z.boolean() }).strict();

export async function ondiSamlIdpRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_req, body, done) => {
    try {
      const fields: Record<string, string> = Object.create(null);
      for (const [key, value] of new URLSearchParams(String(body))) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error('Duplicate form field');
        fields[key] = value;
      }
      done(null, fields);
    }
    catch (error) { done(error as Error, undefined); }
  });

  // fastify.authenticate was missing here — requireRoleOrOrgPermission and
  // requireEntitlement both assume request.user is already populated, so
  // without it every call 401'd on "no user" rather than a real permission
  // check. The frontend treats any 401 as a dead session and logs the whole
  // tab out (lib/api.ts's handleUnauthorized), so visiting the SSO page —
  // which fetches /clients on mount — silently ended every real session,
  // valid or not. Same fix pattern already used for /keys above.
  const manage = [fastify.authenticate, requireRoleOrOrgPermission(ORG_PERMISSIONS.SSO_PROVIDERS_MANAGE, 'SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'), requireEntitlement('ondi.governance')];

  // Signing keys are platform roots, not tenant settings. Keep the private
  // key out of responses; rotation publishes the old certificate for overlap.
  fastify.get('/keys', { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] }, async () => ({ keys: await listOndiSamlSigningKeys() }));
  fastify.post('/keys/rotate', { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] }, async request => {
    const result = await rotateOndiSamlSigningKey();
    await recordAuthEvent(request.user.tenant_id, request.user.sub, 'saml_idp_key_rotated', { metadata: { kid: result.kid, platformWide: true } });
    return { rotated: true, ...result };
  });
  fastify.post<{ Params: { kid: string } }>('/keys/:kid/revoke', { preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    try {
      await revokeOndiSamlSigningKey(request.params.kid);
      await recordAuthEvent(request.user.tenant_id, request.user.sub, 'saml_idp_key_revoked', { metadata: { kid: request.params.kid, platformWide: true } });
      return { revoked: true, kid: request.params.kid };
    }
    catch (error: any) { return reply.status(error.statusCode || 409).send({ error: error.message }); }
  });

  fastify.get('/clients', { preHandler: manage }, async request => {
    const user = request.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('ondi_saml_sp_clients')
      .select(['id', 'name', 'entity_id', 'acs_url', 'slo_url', 'enabled', 'created_at'])
      .where('tenant_id', '=', user.tenant_id).orderBy('created_at', 'desc').execute());
  });

  fastify.post('/clients', { preHandler: manage }, async (request, reply) => {
    const parsed = addClientSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid SAML service provider configuration.', details: parsed.error.flatten() });
    const body = parsed.data;
    const certificate = body.signing_certificate.replace(/\\n/g, '\n');
    if (!isValidSpSigningCertificate(certificate)) return reply.status(400).send({ error: 'The service provider certificate must be a currently valid RSA-2048-or-stronger X.509 certificate.' });
    const user = request.user;
    const row = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_saml_sp_clients').values({
      tenant_id: user.tenant_id,
      name: body.name,
      entity_id: body.entity_id,
      acs_url: body.acs_url,
      slo_url: body.slo_url || null,
      signing_certificate: certificate,
      created_by: user.sub,
    }).returning(['id', 'name', 'entity_id', 'acs_url', 'slo_url', 'enabled', 'created_at']).executeTakeFirstOrThrow());
    await recordAuthEvent(user.tenant_id, user.sub, 'saml_sp_client_created', { metadata: { clientId: row.id } });
    return reply.status(201).send({ ...row, metadata_url: `${IDP_ENTITY_ID}/${row.id}/metadata`, sso_url: `${IDP_ENTITY_ID}/${row.id}/sso`, slo_endpoint: `${IDP_ENTITY_ID}/${row.id}/slo` });
  });

  fastify.patch<{ Params: { id: string } }>('/clients/:id', { preHandler: manage }, async (request, reply) => {
    const parsed = patchClientSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid SAML service provider update.' });
    const user = request.user;
    const updated = await withTenant(user.tenant_id, trx => trx.updateTable('ondi_saml_sp_clients')
      .set({ enabled: parsed.data.enabled, updated_at: new Date() })
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
      .returning(['id', 'name', 'entity_id', 'acs_url', 'slo_url', 'enabled', 'created_at']).executeTakeFirst());
    if (!updated) return reply.status(404).send({ error: 'SAML service provider not found.' });
    await recordAuthEvent(user.tenant_id, user.sub, 'saml_sp_client_updated', { metadata: { clientId: updated.id, enabled: updated.enabled } });
    return updated;
  });

  fastify.delete<{ Params: { id: string } }>('/clients/:id', { preHandler: manage }, async (request, reply) => {
    const user = request.user;
    const deleted = await withTenant(user.tenant_id, trx => trx.deleteFrom('ondi_saml_sp_clients')
      .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).returning('id').executeTakeFirst());
    if (!deleted) return reply.status(404).send({ error: 'SAML service provider not found.' });
    await recordAuthEvent(user.tenant_id, user.sub, 'saml_sp_client_deleted', { metadata: { clientId: deleted.id } });
    return { ok: true };
  });

  fastify.get<{ Params: { id: string } }>('/:id/metadata', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const client = await loadClient(request.params.id);
    const material = await getSigningMaterial();
    if (!client || !material || !(await tenantHasEntitlement(client.tenant_id, 'ondi.governance'))) {
      return reply.status(material ? 404 : 503).send({ error: material ? 'SAML service provider is unavailable.' : 'Ondi SAML signing is not configured.' });
    }
    reply.header('Content-Type', 'application/xml; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=300');
    return makeIdp(material, client).getMetadata();
  });

  const handleSso = async (request: any, reply: any, binding: 'redirect' | 'post') => {
    if (!redisReady(redisClient)) return reply.status(503).send({ error: 'Ondi SAML sign-in is temporarily unavailable.' });
    const material = await getSigningMaterial();
    if (!material) return reply.status(503).send({ error: 'Ondi SAML signing is not configured.' });
    const client = await loadClient(request.params.id);
    if (!client || !(await tenantHasEntitlement(client.tenant_id, 'ondi.governance'))) return reply.status(404).send({ error: 'SAML service provider not found.' });
    if (!isValidSpSigningCertificate(client.signing_certificate)) return reply.status(503).send({ error: 'The registered service provider signing certificate is expired or invalid.' });
    const idp = makeIdp(material, client);
    const sp = makeSp(client);
    let parsed: any;
    try {
      const envelope = binding === 'redirect'
        ? { query: request.query as Record<string, unknown> }
        : { body: request.body as Record<string, unknown> };
      parsed = await idp.parseLoginRequest(sp, binding, envelope);
    } catch {
      await recordAuthEvent(client.tenant_id, null, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp', reason: 'authn_request_verification_failed', clientId: client.id } });
      return reply.status(400).send({ error: 'Invalid SAML authentication request.' });
    }

    const extract = parsed.extract ?? {};
    const inboundIssuer = Array.isArray(extract.issuer) ? extract.issuer[0] : extract.issuer;
    const requestData = extract.request ?? {};
    const requestId = requestData.id;
    const requestDestination = requestData.destination;
    const requestedAcs = requestData.assertionConsumerServiceURL;
    const requestIssuedAt = Date.parse(String(requestData.issueInstant || ''));
    const expectedSso = `${IDP_ENTITY_ID.replace(/\/metadata$/, '')}/${client.id}/sso`;
    const protocolBinding = binding === 'post' ? SAML.binding.post : SAML.binding.redirect;
    if (inboundIssuer !== client.entity_id || typeof requestId !== 'string' || requestId.length > 512
      || requestDestination !== expectedSso || (requestedAcs && requestedAcs !== client.acs_url)
      || !Number.isFinite(requestIssuedAt) || requestIssuedAt > Date.now() + 60_000 || Date.now() - requestIssuedAt > TRANSACTION_TTL_SECONDS * 1000
      || (request.body?.SAMLRequest && protocolBinding !== SAML.binding.post)) {
      await recordAuthEvent(client.tenant_id, null, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp', reason: 'authn_request_target_mismatch', clientId: client.id } });
      return reply.status(400).send({ error: 'SAML authentication request does not match the registered service provider.' });
    }

    const replayResult = await redisClient.set(requestKey(client.id, requestId), '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
    if (replayResult !== 'OK') return reply.status(409).send({ error: 'This SAML authentication request has already been used.' });
    const relayState = typeof parsed.relayState === 'string' ? parsed.relayState : undefined;
    if (relayState && Buffer.byteLength(relayState, 'utf8') > 80) return reply.status(400).send({ error: 'SAML RelayState exceeds the 80-byte limit.' });

    const transactionId = crypto.randomBytes(32).toString('base64url');
    const transaction: SsoTransaction = { clientId: client.id, tenantId: client.tenant_id, requestId, requestInfo: { extract }, ...(relayState ? { relayState } : {}) };
    await redisClient.set(transactionKey(transactionId), JSON.stringify(transaction), 'EX', TRANSACTION_TTL_SECONDS);
    const webOrigin = process.env.ONDI_STANDALONE_WEB_ORIGIN
      || (env.APP_ENV === 'development' ? 'http://localhost:5173' : env.PUBLIC_APP_URL || env.OPS_BOARD_URL);
    const authorize = new URL(`${webOrigin.replace(/\/$/, '')}/ondi/saml/idp/authorize`);
    authorize.searchParams.set('tx', transactionId);
    if (process.env.ONDI_ISSUER_OVERRIDE) authorize.searchParams.set('api_base', issuerUrl());
    return reply.redirect(authorize.toString());
  };

  // SP-initiated SLO. Verify the request against that SP's pinned signing
  // certificate, bind NameID + SessionIndex to a session issued for this
  // exact tenant/client, consume request IDs once, and return a signed SAML
  // LogoutResponse to the SP's pre-registered endpoint.
  const handleSlo = async (request: any, reply: any, binding: 'redirect' | 'post') => {
    if (!redisReady(redisClient)) return reply.status(503).send({ error: 'Ondi SAML logout is temporarily unavailable.' });
    const material = await getSigningMaterial();
    const client = await loadClient(request.params.id);
    if (!material || !client || !client.slo_url) return reply.status(404).send({ error: 'SAML logout service is unavailable.' });
    if (!isValidSpSigningCertificate(client.signing_certificate)) return reply.status(503).send({ error: 'The registered service provider signing certificate is expired or invalid.' });
    const idp = makeIdp(material, client);
    const sp = makeSp(client);
    let parsed: any;
    try {
      const envelope = binding === 'redirect' ? { query: request.query as Record<string, unknown> } : { body: request.body as Record<string, unknown> };
      parsed = await idp.parseLogoutRequest(sp, binding, envelope);
    } catch {
      await recordAuthEvent(client.tenant_id, null, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp_slo', reason: 'logout_request_verification_failed', clientId: client.id } });
      return reply.status(400).send({ error: 'Invalid SAML logout request.' });
    }
    const extract = parsed.extract ?? {};
    const issuer = Array.isArray(extract.issuer) ? extract.issuer[0] : extract.issuer;
    const logout = extract.request ?? {};
    const requestId = logout.id;
    const requestIssuedAt = Date.parse(String(logout.issueInstant || ''));
    const notOnOrAfter = logout.notOnOrAfter ? Date.parse(String(logout.notOnOrAfter)) : null;
    const endpoint = `${IDP_ENTITY_ID}/${client.id}/slo`;
    if (issuer !== client.entity_id || typeof requestId !== 'string' || requestId.length > 512 || logout.destination !== endpoint
      || !Number.isFinite(requestIssuedAt) || requestIssuedAt > Date.now() + 60_000 || Date.now() - requestIssuedAt > TRANSACTION_TTL_SECONDS * 1000
      || (notOnOrAfter !== null && (!Number.isFinite(notOnOrAfter) || notOnOrAfter <= Date.now()))) {
      return reply.status(400).send({ error: 'SAML logout request does not match the registered service provider.' });
    }
    const replay = await redisClient.set(requestKey(client.id, `logout:${requestId}`), '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
    if (replay !== 'OK') return reply.status(409).send({ error: 'This SAML logout request has already been used.' });
    const relayState = typeof parsed.relayState === 'string' ? parsed.relayState : undefined;
    if (relayState && Buffer.byteLength(relayState, 'utf8') > 80) return reply.status(400).send({ error: 'SAML RelayState exceeds the 80-byte limit.' });
    const nameId = logout.nameID;
    const sessionIndexes = Array.isArray(logout.sessionIndex) ? logout.sessionIndex.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : typeof logout.sessionIndex === 'string' && logout.sessionIndex ? [logout.sessionIndex] : [];
    if (typeof nameId !== 'string' || !nameId) return reply.status(400).send({ error: 'SAML logout request must identify the subject.' });
    const ended = await withTenant(client.tenant_id, async trx => {
      const active = trx.updateTable('ondi_saml_idp_sessions').set({ revoked_at: new Date() })
        .where('tenant_id', '=', client.tenant_id).where('client_id', '=', client.id).where('name_id', '=', nameId)
        .where('revoked_at', 'is', null).where('expires_at', '>', new Date());
      return sessionIndexes.length
        ? active.where('session_index', 'in', sessionIndexes).returning('user_id').execute()
        : active.returning('user_id').execute();
    });
    try {
      const result = await idp.createLogoutResponse(sp, parsed, binding, relayState) as { context: string };
      await recordAuthEvent(client.tenant_id, ended[0]?.user_id ?? null, 'saml_logout', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp', clientId: client.id, sessionsEnded: ended.length } });
      if (binding === 'redirect') return reply.redirect(result.context);
      const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      reply.header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', 'no-store');
      return reply.send(`<!doctype html><html><body onload="document.forms[0].submit()"><form method="post" action="${escape(client.slo_url)}"><input type="hidden" name="SAMLResponse" value="${escape(result.context)}">${relayState ? `<input type="hidden" name="RelayState" value="${escape(relayState)}">` : ''}<noscript><button type="submit">Continue</button></noscript></form></body></html>`);
    } catch (error) {
      request.log.error({ err: error, clientId: client.id }, 'Ondi SAML logout response creation failed');
      return reply.status(500).send({ error: 'Could not complete SAML logout.' });
    }
  };

  fastify.get<{ Params: { id: string } }>('/:id/sso', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, (request, reply) => handleSso(request, reply, 'redirect'));
  fastify.post<{ Params: { id: string } }>('/:id/sso', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, (request, reply) => handleSso(request, reply, 'post'));
  fastify.get<{ Params: { id: string } }>('/:id/slo', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, (request, reply) => handleSlo(request, reply, 'redirect'));
  fastify.post<{ Params: { id: string } }>('/:id/slo', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, (request, reply) => handleSlo(request, reply, 'post'));

  fastify.get<{ Params: { transactionId: string } }>('/transactions/:transactionId', { preHandler: fastify.authenticate }, async (request, reply) => {
    if (!redisReady(redisClient)) return reply.status(503).send({ error: 'Ondi SAML sign-in is temporarily unavailable.' });
    const transactionId = request.params.transactionId;
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(transactionId)) return reply.status(404).send({ error: 'SAML sign-in request expired or invalid.' });
    const raw = await redisClient.get(transactionKey(transactionId));
    if (!raw) return reply.status(404).send({ error: 'SAML sign-in request expired or invalid.' });
    const transaction = JSON.parse(raw) as SsoTransaction;
    const user = request.user;
    if (transaction.tenantId !== user.tenant_id) return reply.status(403).send({ error: 'This SAML request belongs to another workspace.' });
    const client = await loadClient(transaction.clientId, user.tenant_id);
    if (!client || !(await tenantHasEntitlement(user.tenant_id, 'ondi.governance'))) return reply.status(404).send({ error: 'SAML service provider is unavailable.' });
    return { application: client.name, user: { name: user.name, email: user.email }, expires_in: TRANSACTION_TTL_SECONDS };
  });

  fastify.post<{ Params: { transactionId: string } }>('/transactions/:transactionId/approve', { preHandler: fastify.authenticate }, async (request, reply) => {
    if (!redisReady(redisClient)) return reply.status(503).send({ error: 'Ondi SAML sign-in is temporarily unavailable.' });
    const transactionId = request.params.transactionId;
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(transactionId)) return reply.status(404).send({ error: 'SAML sign-in request expired or invalid.' });
    const raw = await redisClient.get(transactionKey(transactionId));
    if (!raw) return reply.status(404).send({ error: 'SAML sign-in request expired or invalid.' });
    const transaction = JSON.parse(raw) as SsoTransaction;
    const session = request.user;
    if (transaction.tenantId !== session.tenant_id) return reply.status(403).send({ error: 'This SAML request belongs to another workspace.' });
    if (!(await tenantHasEntitlement(session.tenant_id, 'ondi.governance'))) return reply.status(402).send({ error: 'Enterprise Identity & Governance is not active for this workspace.' });
    const client = await loadClient(transaction.clientId, session.tenant_id);
    const material = await getSigningMaterial();
    if (!client || !material) return reply.status(404).send({ error: 'SAML service provider is unavailable.' });
    const user = await withTenant(session.tenant_id, trx => trx.selectFrom('users').select(['id', 'email', 'name'])
      .where('id', '=', session.sub).where('tenant_id', '=', session.tenant_id).where('active', '=', true).executeTakeFirst());
    if (!user) return reply.status(401).send({ error: 'Your account is no longer active.' });

    const consumed = await redisClient.getdel(transactionKey(transactionId));
    if (!consumed) return reply.status(409).send({ error: 'This SAML request has already been completed or expired.' });
    const consumedTransaction = JSON.parse(consumed) as SsoTransaction;
    if (consumedTransaction.clientId !== client.id || consumedTransaction.requestId !== transaction.requestId) return reply.status(409).send({ error: 'SAML request state changed. Start sign-in again.' });

    try {
      const idp = makeIdp(material, client);
      const sp = makeSp(client);
      const now = new Date();
      const expires = new Date(now.getTime() + 5 * 60_000);
      const responseId = `_${crypto.randomUUID()}`;
      const assertionId = `_${crypto.randomUUID()}`;
      const sessionIndex = `_${crypto.randomUUID()}`;
      const renderValues = {
        ID: responseId, AssertionID: assertionId, Destination: client.acs_url, Audience: client.entity_id,
        EntityID: client.entity_id, SubjectRecipient: client.acs_url, Issuer: IDP_ENTITY_ID,
        IssueInstant: now.toISOString(), StatusCode: 'urn:oasis:names:tc:SAML:2.0:status:Success',
        ConditionsNotBefore: new Date(now.getTime() - 60_000).toISOString(), ConditionsNotOnOrAfter: expires.toISOString(),
        SubjectConfirmationDataNotOnOrAfter: expires.toISOString(),
        NameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', NameID: user.email,
        InResponseTo: transaction.requestId,
        AuthnInstant: now.toISOString(), SessionIndex: sessionIndex,
        SessionNotOnOrAfter: new Date(now.getTime() + 8 * 60 * 60_000).toISOString(),
        // The Hudumika session may have been created by password, passkey, or
        // a federated provider; don't assert a stronger authn method than we
        // can prove from the session itself.
        AuthnContextClassRef: 'urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified',
        attrEmail: user.email, attrDisplayName: user.name,
      };
      const result = await idp.createLoginResponse(sp, transaction.requestInfo, 'post', { email: user.email, displayName: user.name }, {
        relayState: transaction.relayState,
        customTagReplacement: template => {
          const attributes = samlify.SamlLib.attributeStatementBuilder(RESPONSE_ATTRIBUTES, undefined, undefined, 'strict');
          const withAttributes = template.replace('{AttributeStatement}', attributes);
          return { context: samlify.SamlLib.renderTags(withAttributes, renderValues, 'strict'), id: responseId };
        },
      }) as { context: string; entityEndpoint: string; relayState?: string };
      if (result.entityEndpoint !== client.acs_url) throw new Error('SAML response destination did not match the registered ACS endpoint.');
      await withTenant(session.tenant_id, trx => trx.insertInto('ondi_saml_idp_sessions').values({
        tenant_id: session.tenant_id,
        client_id: client.id,
        user_id: user.id,
        name_id: user.email,
        session_index: sessionIndex,
        expires_at: new Date(now.getTime() + 8 * 60 * 60_000),
      }).execute());
      await recordAuthEvent(user && session.tenant_id, user.id, 'login_success', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp', clientId: client.id } });
      return { destination: result.entityEndpoint, saml_response: result.context, relay_state: result.relayState };
    } catch (error) {
      request.log.error({ err: error, clientId: client.id }, 'Ondi SAML assertion creation failed');
      await recordAuthEvent(session.tenant_id, user.id, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'saml_idp', reason: 'assertion_creation_failed', clientId: client.id } });
      return reply.status(500).send({ error: 'Could not issue the SAML assertion. Start sign-in again.' });
    }
  });
}
