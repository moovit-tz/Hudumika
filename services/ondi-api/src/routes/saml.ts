import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { idp, buildServiceProvider, extractIssuerFromRawSamlRequest } from '../lib/saml.js';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { extractUserId, requireMember, requirePermission } from '../lib/org-auth.js';

async function getUserIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const payload: any = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Standard SAML HTTP-POST binding delivery: an auto-submitting form. */
function renderAutoSubmitForm(actionUrl: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join('\n      ');
  return `<!DOCTYPE html>
<html><head><title>Redirecting…</title></head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${escapeHtml(actionUrl)}">
      ${inputs}
      <noscript><button type="submit">Continue</button></noscript>
  </form>
</body></html>`;
}

// Ondi user -> SAML Subject. V1 ships NameID (email) only — the default
// samlify login-response template renders a valid, signed assertion with no
// AttributeStatement when none is configured. Custom attribute mapping
// (SamlServiceProvider.attributeMapping) is schema-ready but not wired up
// yet; a follow-up, not a silent gap — every SP integration needs NameID
// first regardless.
function buildSamlUser(user: { email: string | null; phoneNumber: string }) {
  return { email: user.email || `${user.phoneNumber}@ondi.internal` };
}

export async function samlRoutes(app: FastifyInstance) {
  /**
   * GET /saml/metadata
   * Public — this is what an SP administrator pastes into their IdP config.
   */
  app.get('/metadata', async (_req, reply) => {
    reply.header('Content-Type', 'application/xml');
    return reply.send(idp.getMetadata());
  });

  // ─── Service Provider registry (admin) ──────────────────────────────────────

  app.post('/service-providers', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { organizationId, name, entityId, acsUrl, sloUrl, certificate, nameIdFormat, logoUrl } = req.body as {
      organizationId?: string; name?: string; entityId?: string; acsUrl?: string; sloUrl?: string;
      certificate?: string; nameIdFormat?: string; logoUrl?: string;
    };
    if (!organizationId || !name || !entityId || !acsUrl) return reply.code(400).send({ error: 'missing_fields' });
    if (!(await requirePermission(app, userId, organizationId, 'org:manage_security'))) return reply.code(403).send({ error: 'insufficient_permission' });

    const existing = await app.prisma.samlServiceProvider.findUnique({ where: { entityId } });
    if (existing) return reply.code(409).send({ error: 'entity_id_already_registered' });

    const sp = await app.prisma.samlServiceProvider.create({
      data: { organizationId, name, entityId, acsUrl, sloUrl, certificate, nameIdFormat, logoUrl },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: organizationId, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'saml_sp_registered', spId: sp.id, name, entityId: sp.entityId },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send(sp);
  });

  app.get('/service-providers', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { organizationId } = req.query as { organizationId?: string };
    if (!organizationId) return reply.code(400).send({ error: 'organization_id_required' });
    if (!(await requireMember(app, userId, organizationId))) return reply.code(403).send({ error: 'insufficient_permission' });

    const sps = await app.prisma.samlServiceProvider.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return reply.send(sps);
  });

  app.delete('/service-providers/:id', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const sp = await app.prisma.samlServiceProvider.findUnique({ where: { id } });
    if (!sp) return reply.code(404).send({ error: 'not_found' });
    if (!(await requirePermission(app, userId, sp.organizationId, 'org:manage_security'))) return reply.code(403).send({ error: 'insufficient_permission' });

    await app.prisma.samlServiceProvider.delete({ where: { id } });

    await app.audit.write({
      entityType: 'ORG', entityId: sp.organizationId, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'saml_sp_removed', spId: sp.id, entityId: sp.entityId },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  // ─── SP-initiated SSO ────────────────────────────────────────────────────────

  async function handleSso(req: any, reply: any, binding: 'redirect' | 'post') {
    const isRedirect = binding === 'redirect';
    const src = isRedirect ? req.query : req.body;
    const samlRequestRaw = src?.SAMLRequest as string | undefined;
    if (!samlRequestRaw) return reply.code(400).send({ error: 'saml_request_required' });

    const issuerEntityId = extractIssuerFromRawSamlRequest(samlRequestRaw, isRedirect);
    if (!issuerEntityId) return reply.code(400).send({ error: 'could_not_parse_issuer' });

    const spRecord = await app.prisma.samlServiceProvider.findUnique({ where: { entityId: issuerEntityId } });
    if (!spRecord) return reply.code(400).send({ error: 'unknown_service_provider' });

    const sp = buildServiceProvider(spRecord);

    let parsed;
    try {
      parsed = await idp.parseLoginRequest(sp, binding, { query: req.query, body: req.body });
    } catch (err: any) {
      return reply.code(400).send({ error: 'invalid_authn_request', details: err.message });
    }

    const relayState = src?.RelayState as string | undefined;

    // SP-initiated SSO from a cold browser needs an interactive Ondi login
    // step this API alone can't render — mirrors the existing Ondi→Ngao
    // `?ondi_token=` SSO bridge: the caller attaches an already-issued Ondi
    // access token instead of us hosting a login page.
    const token = src?.ondi_token as string | undefined;
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return reply.code(401).send({
        error: 'ondi_authentication_required',
        message: 'Attach a valid Ondi access token as ondi_token (query param on redirect binding, body field on POST binding) to complete SSO.',
      });
    }
    if (!(await requireMember(app, userId, spRecord.organizationId))) {
      return reply.code(403).send({ error: 'not_a_member_of_owning_org' });
    }

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const loginResponse: any = await idp.createLoginResponse(sp, parsed as any, 'post', buildSamlUser(user), { relayState });

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'LOGIN_SUCCESS', category: 'AUTH',
      performedBy: userId, metadata: { method: 'saml_sp_initiated', spEntityId: issuerEntityId },
      severity: 'INFO', isRegulatory: true,
    });

    reply.header('Content-Type', 'text/html');
    return reply.send(renderAutoSubmitForm(loginResponse.entityEndpoint, {
      SAMLResponse: loginResponse.context,
      ...(loginResponse.relayState ? { RelayState: loginResponse.relayState } : {}),
    }));
  }

  app.get('/sso', async (req: any, reply) => handleSso(req, reply, 'redirect'));
  app.post('/sso', async (req: any, reply) => handleSso(req, reply, 'post'));

  // ─── IdP-initiated SSO ───────────────────────────────────────────────────────
  // Simpler and more directly testable than SP-initiated — this is also how
  // most "app launcher" dashboard tiles actually work in Okta/OneLogin.

  app.get('/idp-initiated/:entityId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { entityId } = req.params as { entityId: string };
    const spRecord = await app.prisma.samlServiceProvider.findUnique({ where: { entityId } });
    if (!spRecord) return reply.code(404).send({ error: 'service_provider_not_found' });
    if (!(await requireMember(app, userId, spRecord.organizationId))) {
      return reply.code(403).send({ error: 'not_a_member_of_owning_org' });
    }

    const sp = buildServiceProvider(spRecord);
    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const loginResponse: any = await idp.createLoginResponse(sp, { extract: {} } as any, 'post', buildSamlUser(user));

    await app.audit.write({
      entityType: 'USER', entityId: userId, action: 'LOGIN_SUCCESS', category: 'AUTH',
      performedBy: userId, metadata: { method: 'saml_idp_initiated', spEntityId: entityId },
      severity: 'INFO', isRegulatory: true,
    });

    reply.header('Content-Type', 'text/html');
    return reply.send(renderAutoSubmitForm(loginResponse.entityEndpoint, { SAMLResponse: loginResponse.context }));
  });

  // ─── Single Logout (SP-initiated) ───────────────────────────────────────────

  async function handleSlo(req: any, reply: any, binding: 'redirect' | 'post') {
    const isRedirect = binding === 'redirect';
    const src = isRedirect ? req.query : req.body;
    const samlRequestRaw = src?.SAMLRequest as string | undefined;
    if (!samlRequestRaw) return reply.code(400).send({ error: 'saml_request_required' });

    const issuerEntityId = extractIssuerFromRawSamlRequest(samlRequestRaw, isRedirect);
    if (!issuerEntityId) return reply.code(400).send({ error: 'could_not_parse_issuer' });

    const spRecord = await app.prisma.samlServiceProvider.findUnique({ where: { entityId: issuerEntityId } });
    if (!spRecord) return reply.code(400).send({ error: 'unknown_service_provider' });
    if (!spRecord.sloUrl)
      return reply.code(400).send({ error: 'sp_has_no_slo_endpoint', message: 'This service provider has no sloUrl registered — nowhere to send the LogoutResponse.' });

    const sp = buildServiceProvider(spRecord);

    let parsed;
    try {
      parsed = await idp.parseLogoutRequest(sp, binding, { query: req.query, body: req.body });
    } catch (err: any) {
      return reply.code(400).send({ error: 'invalid_logout_request', details: err.message });
    }

    // Ondi doesn't currently track a SAML sessionIndex -> Ondi session
    // mapping, so there's no server-side Ondi session to actually revoke
    // here yet — we acknowledge the logout at the protocol level (correct
    // response to the SP) without a linked local session to tear down.
    const logoutResponse: any = idp.createLogoutResponse(sp, parsed as any, 'post');

    reply.header('Content-Type', 'text/html');
    return reply.send(renderAutoSubmitForm(logoutResponse.entityEndpoint, { SAMLResponse: logoutResponse.context }));
  }

  app.get('/slo', async (req: any, reply) => handleSlo(req, reply, 'redirect'));
  app.post('/slo', async (req: any, reply) => handleSlo(req, reply, 'post'));
}
