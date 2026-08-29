import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { assertOrgSecurityPolicy, getMemberGroupIds, requirePermission } from '../lib/org-auth.js';
import { requireAdmin } from '../lib/admin-auth.js';
import { verifyOauthAccessToken } from './oauth.js';
import { simulateCharge, type PaymentInput, type ChargeResult } from '../lib/payment-simulation.js';
import { publishNotification } from '../lib/feed-client.js';

/**
 * Accepts either Ondi's own first-party HS256 session token OR an RS256
 * OAuth access_token issued to a relying-party client (e.g. the Hudumika
 * Workspace launcher, which has no backend of its own and calls these
 * routes directly with the user's own access_token — same dual-acceptance
 * GET /oauth/userinfo already needed). Managing your own organizations
 * shouldn't require being inside Ondi's own app specifically.
 */
async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  const token = authHeader.slice(7);

  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload.sub as string;
  } catch {
    // Not a first-party session token — try it as an OAuth access_token.
  }

  const oauthPayload = verifyOauthAccessToken(token);
  if (oauthPayload) return oauthPayload.sub as string;

  reply.code(401).send({ error: 'invalid_token' });
  return null;
}

const DEFAULT_ROLES: { name: string; permissions: string[] }[] = [
  { name: 'Owner', permissions: ['org:*'] },
  {
    name: 'Admin',
    permissions: [
      'org:manage_team', 'org:manage_kyb', 'org:manage_directors', 'org:manage_security',
      'org:manage_compliance', 'org:manage_visitors', 'org:manage_access_reviews', 'org:manage_access',
      'org:manage_integrations', 'org:manage_policies', 'org:manage_automation', 'org:manage_roles', 'org:view',
    ],
  },
  { name: 'Member', permissions: ['org:view'] },
];

/**
 * Idempotent — safe to call on every request that needs a role by name.
 * Syncs `permissions` on an existing row (not a no-op) so an already-seeded
 * role picks up newly-added permissions on the next call, not just at
 * first-ever creation. System defaults live with organizationId: null,
 * shared across every org — distinct from org-authored custom roles (see
 * routes/org-access.ts), which carry a real organizationId. Uses
 * findFirst+create/update rather than upsert: Prisma's compound-unique
 * `where` input rejects `null` for organizationId even though the column
 * itself allows it (a SQL unique index can't match on NULL via equality).
 */
async function ensureDefaultRoles(app: FastifyInstance) {
  for (const r of DEFAULT_ROLES) {
    const existing = await app.prisma.role.findFirst({ where: { organizationId: null, name: r.name } });
    if (existing) {
      await app.prisma.role.update({ where: { id: existing.id }, data: { permissions: r.permissions } });
    } else {
      await app.prisma.role.create({ data: { name: r.name, permissions: r.permissions } });
    }
  }
}

/**
 * Looks up a role by name, preferring `organizationId`'s own custom roles
 * and falling back to the shared system defaults (Owner/Admin/Member).
 * Pass `null` for organizationId when only a system role is valid (e.g. the
 * last-owner check, or brand-new org creation before any custom role could exist).
 */
async function getRoleByName(app: FastifyInstance, organizationId: string | null, name: string) {
  await ensureDefaultRoles(app);
  return app.prisma.role.findFirst({
    where: { name, OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])] },
  });
}

// Kept in sync by hand with apps/api/src/services/onboarding.service.ts's
// identical constant/regex — that's the legacy monolith's own subdomain
// registry (apps/api's `tenants` table), this is Ondi's canonical one
// (Organization.subdomain). Both must reject the same reserved words since
// apps/api's onboarding flow calls GET /organizations/by-subdomain here to
// cross-check availability before claiming a name in either system.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'mail', 'static', 'assets', 'cdn',
  'superadmin', 'support', 'help', 'blog', 'docs', 'status',
]);

function validateSubdomain(value: string): { ok: boolean; reason?: string } {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) {
    return { ok: false, reason: 'Must be 3-63 characters: lowercase letters, numbers, and hyphens only' };
  }
  if (RESERVED_SUBDOMAINS.has(value)) {
    return { ok: false, reason: 'This subdomain is reserved' };
  }
  return { ok: true };
}

const BRELA_SEARCH_URL = 'https://ors.brela.go.tz/orsreg/list/search/businesspublic.json';

// Ondi's own hosted web app origin — used to build user-facing links (the
// invite-accept URL below) that leave this API and open in a browser.
const ondiWebUrl = process.env.ONDI_WEB_URL || 'https://ondi.hudumika.tz';

// BRELA's response is a column-oriented { Map, Records } shape — Records is
// an array of arrays, one per row, positionally matching Map's field names.
// Proxied server-side (not called directly from the browser) because it's a
// third-party government API with no CORS headers for arbitrary origins.
function mapBrelaResponse(data: any): Record<string, any>[] {
  const fields: string[] = data?.Map ?? [];
  const rows: any[][] = data?.Records ?? [];
  return rows.map((row) => {
    const record: Record<string, any> = {};
    fields.forEach((field, i) => { record[field] = row[i]; });
    return record;
  });
}

export async function organizationRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/packages
   * Public — the onboarding wizard's Plan step reads this before anyone's
   * identity is known. Only active tiers, cheapest/lowest sortOrder first.
   */
  app.get('/packages', async (req: any, reply) => {
    const packages = await app.prisma.package.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({
      packages: packages.map(p => ({
        code: p.code,
        name: p.name,
        monthlyPrice: Number(p.monthlyPrice),
        annualPrice: Number(p.annualPrice),
        maxUsers: p.maxUsers,
        storageLimitBytes: p.storageLimitBytes !== null ? p.storageLimitBytes.toString() : null,
        features: p.features,
        popular: p.popular,
      })),
    });
  });

  /**
   * POST /organizations/brela-search
   * Live lookup against BRELA's public Online Registration System search —
   * lets the create-organization wizard confirm the real registered legal
   * name for an incorporation number (or find it by name) instead of
   * trusting free-text entry. Body: { objectType: 'ET-COMPANY' | 'ET-BUSINESS', number?, name? }
   */
  // Public — a name/number search against BRELA's own public registry
  // carries nothing sensitive of ours, and the "join as a corporate" flow
  // needs to run this before the person has verified their identity (search
  // → confirm → THEN sign in, not the other way round).
  app.post('/brela-search', async (req: any, reply) => {
    const { objectType, number, name } = req.body as {
      objectType?: 'ET-COMPANY' | 'ET-BUSINESS';
      number?: string;
      name?: string;
    };
    if (objectType !== 'ET-COMPANY' && objectType !== 'ET-BUSINESS')
      return reply.code(400).send({ error: 'invalid_object_type' });
    if (!number?.trim() && !name?.trim())
      return reply.code(400).send({ error: 'number_or_name_required' });

    const isCompany = objectType === 'ET-COMPANY';
    const body = {
      object_type: objectType,
      [isCompany ? 'cm_number' : 'bn_number']: number?.trim() ?? '',
      [isCompany ? 'cm_name' : 'bn_name']: name?.trim() ?? '',
      PageSize: 10,
      PageNumber: 1,
    };

    try {
      // BRELA's endpoint sits behind a WAF that 403s plain server-to-server
      // requests with no browser fingerprint at all — a real browser
      // User-Agent/Referer/Origin (matching what ORS's own frontend sends)
      // is required to get past it, not an attempt to spoof identity.
      const res = await fetch(BRELA_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://ors.brela.go.tz/orsreg/',
          'Origin': 'https://ors.brela.go.tz',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return reply.code(502).send({ error: 'brela_unavailable' });
      const data = await res.json();
      if (data?.Result !== 'OK') return reply.code(502).send({ error: 'brela_unavailable' });

      return reply.send({
        results: mapBrelaResponse(data),
        total: data.TotalRecordCount ?? 0,
      });
    } catch {
      return reply.code(502).send({ error: 'brela_unavailable' });
    }
  });

  /**
   * POST /organizations
   * Creates a real Organization and makes the caller its Owner.
   * Body: { businessName, registrationNumber, country?, subdomain? }
   *
   * `subdomain` is optional so this stays backward-compatible with the
   * existing self-serve "create an org" flow inside Ondi's own UI, which has
   * no notion of company.hudumika.tz. apps/api's onboarding wizard is the
   * caller that always supplies it (server-to-server, admin/service context —
   * see apps/api's OnboardingService.completeOnboarding).
   */
  app.post('/', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { businessName, registrationNumber, country, subdomain, packageCode, billingCycle, payment } = req.body as {
      businessName?: string; registrationNumber?: string; country?: string; subdomain?: string;
      packageCode?: string; billingCycle?: 'monthly' | 'annual'; payment?: PaymentInput;
    };
    if (!businessName || !registrationNumber)
      return reply.code(400).send({ error: 'missing_fields' });

    const existing = await app.prisma.organization.findUnique({ where: { registrationNumber } });
    if (existing) return reply.code(409).send({ error: 'registration_number_already_used' });

    if (subdomain) {
      const subCheck = validateSubdomain(subdomain);
      if (!subCheck.ok) return reply.code(400).send({ error: 'invalid_subdomain', detail: subCheck.reason });
      const subdomainTaken = await app.prisma.organization.findUnique({ where: { subdomain } });
      if (subdomainTaken) return reply.code(409).send({ error: 'subdomain_already_taken' });
    }

    // Plan+payment are optional — only the onboarding wizard's "founding a
    // brand-new company" path sends them (see workspace/app's new 6-step
    // flow). The "join as a corporate" create-path and the older manual
    // CreateOrganizationScreen never did and still don't have to.
    let pkg: { code: string; monthlyPrice: any; annualPrice: any } | null = null;
    let charge: ChargeResult | null = null;
    if (packageCode) {
      pkg = await app.prisma.package.findFirst({ where: { code: packageCode, isActive: true } });
      if (!pkg) return reply.code(400).send({ error: 'invalid_package' });
      if (billingCycle !== 'monthly' && billingCycle !== 'annual')
        return reply.code(400).send({ error: 'invalid_billing_cycle' });
      if (!payment) return reply.code(400).send({ error: 'missing_payment' });

      const amount = billingCycle === 'annual' ? Number(pkg.annualPrice) : Number(pkg.monthlyPrice);
      charge = simulateCharge(amount, payment);
      if (!charge.success) return reply.code(402).send({ error: 'payment_declined', detail: charge.error });
    }

    const ownerRole = await getRoleByName(app, null, 'Owner');

    const org = await app.prisma.organization.create({
      data: {
        businessName, registrationNumber, country: country || 'TZ',
        subdomain: subdomain || null,
        planCode: pkg?.code ?? null,
        billingCycle: pkg ? billingCycle : null,
        userRoles: { create: { userId, roleId: ownerRole!.id } },
      },
    });

    if (pkg && charge && billingCycle) {
      const amount = billingCycle === 'annual' ? Number(pkg.annualPrice) : Number(pkg.monthlyPrice);
      await app.prisma.platformTransaction.create({
        data: {
          organizationId: org.id,
          packageCode: pkg.code,
          billingCycle,
          amount,
          method: payment!.method,
          status: 'completed',
          txRef: charge.txRef,
          payerName: payment!.cardHolder ?? businessName,
          cardLast4: payment!.cardNumber ? payment!.cardNumber.replace(/\s/g, '').slice(-4) : null,
          mobileNumber: payment!.mobileNumber ?? null,
        },
      });
    }

    await app.audit.write({
      entityType:   'ORG',
      entityId:     org.id,
      action:       'ORG_CREATED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { businessName, registrationNumber, subdomain, packageCode: pkg?.code ?? null },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({
      id: org.id,
      businessName: org.businessName,
      registrationNumber: org.registrationNumber,
      subdomain: org.subdomain,
      planCode: org.planCode,
      billingCycle: org.billingCycle,
    });
  });

  /**
   * POST /organizations/provision
   * x-admin-key gated — server-to-server only, called by apps/api's own
   * onboarding flow (OnboardingService.completeOnboarding) after it creates
   * its local `tenants` row, never by a browser. Unlike POST / above, this
   * doesn't require an existing signed-in Ondi user as Owner: apps/api's
   * signup wizard collects an email/password admin account today, not an
   * Ondi identity, so a freshly provisioned org can start with zero members.
   * Known, deliberate gap: that admin has no way to claim Owner until they
   * separately sign into Ondi and get invited/linked — full "onboarding also
   * creates the Ondi user" wiring is a follow-up, not attempted here.
   * Body: { businessName, registrationNumber, country?, subdomain }
   */
  app.post('/provision', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { businessName, registrationNumber, country, subdomain } = req.body as {
      businessName?: string; registrationNumber?: string; country?: string; subdomain?: string;
    };
    if (!businessName || !registrationNumber || !subdomain)
      return reply.code(400).send({ error: 'missing_fields' });

    const subCheck = validateSubdomain(subdomain);
    if (!subCheck.ok) return reply.code(400).send({ error: 'invalid_subdomain', detail: subCheck.reason });

    const existingReg = await app.prisma.organization.findUnique({ where: { registrationNumber } });
    if (existingReg) return reply.code(409).send({ error: 'registration_number_already_used' });
    const existingSub = await app.prisma.organization.findUnique({ where: { subdomain } });
    if (existingSub) return reply.code(409).send({ error: 'subdomain_already_taken' });

    const org = await app.prisma.organization.create({
      data: { businessName, registrationNumber, country: country || 'TZ', subdomain },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     org.id,
      action:       'ORG_CREATED',
      category:     'IDENTITY',
      performedBy:  'system:onboarding',
      metadata:     { businessName, registrationNumber, subdomain, source: 'apps_api_onboarding' },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ id: org.id, businessName: org.businessName, subdomain: org.subdomain });
  });

  /**
   * GET /organizations/by-subdomain/:subdomain
   * Public, unauthenticated lookup — the resolution point every wildcard
   * company.hudumika.tz request eventually calls (directly, or via each
   * product's cached org-resolver) to turn a hostname into an org. Also used
   * by apps/api's onboarding wizard to cross-check subdomain availability
   * against Ondi's canonical registry before claiming one. Deliberately
   * returns only public-safe fields — no KYB/security data.
   */
  app.get('/by-subdomain/:subdomain', async (req: any, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const org = await app.prisma.organization.findUnique({ where: { subdomain } });
    if (!org) return reply.code(404).send({ error: 'organization_not_found' });

    return reply.send({ id: org.id, businessName: org.businessName, subdomain: org.subdomain });
  });

  /**
   * GET /organizations/exists-by-registration/:registrationNumber
   * Public, unauthenticated — the "join as a corporate" flow calls this
   * right after the person confirms a BRELA match, before asking them to
   * verify their own identity. If it already exists, the flow no longer
   * dead-ends: the person still verifies their identity, then submits a
   * join request against this same id (see POST /:id/join-requests) for an
   * Owner/Admin to approve. The id itself isn't sensitive — same value
   * already returned by GET /by-subdomain and POST / responses.
   */
  app.get('/exists-by-registration/:registrationNumber', async (req: any, reply) => {
    const { registrationNumber } = req.params as { registrationNumber: string };
    const org = await app.prisma.organization.findUnique({ where: { registrationNumber }, select: { id: true } });
    return reply.send({ exists: !!org, id: org?.id ?? null });
  });

  /**
   * GET /organizations/mine
   * Every organization the caller belongs to, with their role — the real
   * data source for what used to be a hardcoded workspace switcher.
   */
  app.get('/mine', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const memberships = await app.prisma.userRole.findMany({
      where: { userId, organizationId: { not: null } },
      include: { organization: true, role: true },
    });

    return reply.send({
      organizations: memberships.map(m => ({
        id:                 m.organization!.id,
        businessName:       m.organization!.businessName,
        registrationNumber: m.organization!.registrationNumber,
        role:               m.role.name,
      })),
    });
  });

  /**
   * POST /organizations/:id/join-requests
   * Self-service — any signed-in Ondi user asks to join an org they aren't
   * yet a member of (the "join as a corporate" flow, when the searched
   * company already exists on Hudumika). Does NOT create membership by
   * itself; only an Owner/Admin approving it does (see POST .../approve).
   * Idempotent-ish: reuses an existing PENDING request instead of stacking
   * duplicates if someone taps the button twice.
   */
  app.post('/:id/join-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const org = await app.prisma.organization.findUnique({ where: { id } });
    if (!org) return reply.code(404).send({ error: 'organization_not_found' });

    const alreadyMember = await app.prisma.userRole.findFirst({ where: { userId, organizationId: id } });
    if (alreadyMember) return reply.code(409).send({ error: 'already_a_member' });

    const existing = await app.prisma.organizationJoinRequest.findFirst({
      where: { organizationId: id, requestedById: userId, status: 'PENDING' },
    });
    if (existing) return reply.code(200).send({ id: existing.id, status: existing.status });

    const request = await app.prisma.organizationJoinRequest.create({
      data: { organizationId: id, requestedById: userId },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'IDENTITY',
      performedBy: userId, metadata: { action: 'join_request_created', requestId: request.id },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ id: request.id, status: request.status });
  });

  /**
   * GET /organizations/:id/join-requests/mine
   * The caller's own most recent join request against this org — lets the
   * "waiting for approval" screen poll for a decision without needing
   * org:manage_team permission (they're not a member yet, obviously).
   */
  app.get('/:id/join-requests/mine', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const request = await app.prisma.organizationJoinRequest.findFirst({
      where: { organizationId: id, requestedById: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) return reply.code(404).send({ error: 'join_request_not_found' });

    return reply.send({ id: request.id, status: request.status });
  });

  /**
   * GET /organizations/:id/join-requests
   * Owner/Admin-only. Pending requests awaiting a decision.
   */
  app.get('/:id/join-requests', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_team')))
      return reply.code(403).send({ error: 'insufficient_permission' });

    const requests = await app.prisma.organizationJoinRequest.findMany({
      where: { organizationId: id, status: 'PENDING' },
      include: { requestedBy: { select: { id: true, ondi: true, firstName: true, lastName: true, email: true, phoneNumber: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      requests: requests.map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        user: {
          id: r.requestedBy.id,
          ondi: r.requestedBy.ondi,
          name: [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(' '),
          email: r.requestedBy.email,
          phone: r.requestedBy.phoneNumber,
        },
      })),
    });
  });

  /**
   * POST /organizations/:id/join-requests/:requestId/approve
   * Owner/Admin-only. The actual moment membership is created — everything
   * before this (search, BRELA confirm, sign-in) was just the requester
   * proving who they are and which company they mean.
   */
  app.post('/:id/join-requests/:requestId/approve', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, requestId } = req.params as { id: string; requestId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_team')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const request = await app.prisma.organizationJoinRequest.findFirst({
      where: { id: requestId, organizationId: id, status: 'PENDING' },
    });
    if (!request) return reply.code(404).send({ error: 'join_request_not_found' });

    const memberRole = await getRoleByName(app, id, 'Member');

    await app.prisma.$transaction([
      app.prisma.organizationJoinRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', resolvedBy: userId, resolvedAt: new Date() },
      }),
      app.prisma.userRole.create({
        data: { userId: request.requestedById, organizationId: id, roleId: memberRole!.id },
      }),
    ]);

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'TEAM_MEMBER_JOINED', category: 'IDENTITY',
      performedBy: userId, metadata: { requestId, memberUserId: request.requestedById, via: 'join_request' },
      severity: 'INFO', isRegulatory: false,
    });

    const org = await app.prisma.organization.findUnique({ where: { id }, select: { businessName: true } });
    publishNotification({
      ondiUserId: request.requestedById,
      orgId: id,
      type: 'org.join_request.approved',
      title: `You're in — ${org?.businessName ?? 'your request'} approved your join request`,
      body: `You now have access to the ${org?.businessName ?? 'company'} workspace.`,
      actionUrl: 'https://app.hudumika.tz/home',
    });

    return reply.send({ approved: true });
  });

  /**
   * POST /organizations/:id/join-requests/:requestId/decline
   * Owner/Admin-only.
   */
  app.post('/:id/join-requests/:requestId/decline', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, requestId } = req.params as { id: string; requestId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_team')))
      return reply.code(403).send({ error: 'insufficient_permission' });

    const request = await app.prisma.organizationJoinRequest.findFirst({
      where: { id: requestId, organizationId: id, status: 'PENDING' },
    });
    if (!request) return reply.code(404).send({ error: 'join_request_not_found' });

    await app.prisma.organizationJoinRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED', resolvedBy: userId, resolvedAt: new Date() },
    });

    const org = await app.prisma.organization.findUnique({ where: { id }, select: { businessName: true } });
    publishNotification({
      ondiUserId: request.requestedById,
      orgId: id,
      type: 'org.join_request.declined',
      title: `Your request to join ${org?.businessName ?? 'this company'} was declined`,
      body: 'Contact the company administrator if you think this was a mistake.',
    });

    return reply.send({ declined: true });
  });

  /**
   * GET /organizations/:id/brela
   * Live BRELA lookup for this org's own registrationNumber — the Overview
   * page's "load org data according to BRELA" source of truth, so what's
   * shown there is the real registry record (legal name, status,
   * incorporation date, address), not just the free-text businessName
   * typed in at KYB time. Object type isn't persisted on Organization (the
   * create-organization wizard never stored which BRELA search mode found
   * it), so this tries ET-COMPANY first and falls back to ET-BUSINESS —
   * same two modes brela-search already exposes.
   */
  app.get('/:id/brela', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const caller = await app.prisma.userRole.findFirst({ where: { userId, organizationId: id } });
    if (!caller) return reply.code(404).send({ error: 'organization_not_found' });

    const org = await app.prisma.organization.findUnique({ where: { id } });
    if (!org) return reply.code(404).send({ error: 'organization_not_found' });

    for (const objectType of ['ET-COMPANY', 'ET-BUSINESS'] as const) {
      try {
        const res = await fetch(BRELA_SEARCH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://ors.brela.go.tz/orsreg/',
            'Origin': 'https://ors.brela.go.tz',
          },
          body: JSON.stringify({
            object_type: objectType,
            [objectType === 'ET-COMPANY' ? 'cm_number' : 'bn_number']: org.registrationNumber,
            [objectType === 'ET-COMPANY' ? 'cm_name' : 'bn_name']: '',
            PageSize: 5,
            PageNumber: 1,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.Result !== 'OK') continue;

        const records = mapBrelaResponse(data);
        const match =
          records.find(
            (r) => String(r.cert_number).toLowerCase() === org.registrationNumber.toLowerCase(),
          ) ?? records[0];
        if (match) return reply.send({ record: match, source: 'live' });
      } catch {
        // try the other object type before giving up
      }
    }

    return reply.code(502).send({ error: 'brela_unavailable' });
  });

  /**
   * POST /organizations/:id/kyb
   * Owner/Admin-only. Creates a real KYBRecord — the missing "intake" half
   * of the existing admin-only review endpoints (GET/PATCH /kyb/submissions).
   */
  app.post('/:id/kyb', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_kyb')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const org = await app.prisma.organization.findUnique({ where: { id } });
    if (!org) return reply.code(404).send({ error: 'organization_not_found' });

    const { certificateOfIncorporation, taxCertificate, verificationSource } = req.body as {
      certificateOfIncorporation?: string; taxCertificate?: string; verificationSource?: string;
    };
    if (!verificationSource) return reply.code(400).send({ error: 'missing_fields' });

    const record = await app.prisma.kYBRecord.create({
      data: {
        organizationId: id,
        registrationNumber: org.registrationNumber,
        businessName: org.businessName,
        country: org.country,
        certificateOfIncorporation, taxCertificate,
        verificationSource: verificationSource as any,
        status: 'PENDING',
      },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'KYB_SUBMITTED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { recordId: record.id },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.code(201).send({ id: record.id, status: record.status });
  });

  /**
   * POST /organizations/:id/invite
   * Owner/Admin-only. Invite-by-Ondi-ID (reusing the same lookup convention
   * as vault sharing) rather than email+token. Creates a pending invite —
   * membership only becomes real on accept.
   * Body: { ondi, roleName }
   */
  app.post('/:id/invite', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_team')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { ondi, roleName } = req.body as { ondi?: string; roleName?: string };
    if (!ondi || !roleName) return reply.code(400).send({ error: 'missing_fields' });

    const invitedUser = await app.prisma.user.findUnique({ where: { ondi } });
    if (!invitedUser) return reply.code(404).send({ error: 'user_not_found' });
    if (invitedUser.id === userId) return reply.code(400).send({ error: 'cannot_invite_self' });

    const existingMembership = await app.prisma.userRole.findFirst({
      where: { userId: invitedUser.id, organizationId: id },
    });
    if (existingMembership) return reply.code(409).send({ error: 'already_a_member' });

    const role = await getRoleByName(app, id, roleName);
    if (!role) return reply.code(400).send({ error: 'invalid_role' });

    const existingInvite = await app.prisma.organizationInvite.findFirst({
      where: { organizationId: id, invitedUserId: invitedUser.id, acceptedAt: null, declinedAt: null },
    });
    if (existingInvite) return reply.code(409).send({ error: 'invite_already_pending' });

    const invite = await app.prisma.organizationInvite.create({
      data: { organizationId: id, invitedUserId: invitedUser.id, invitedBy: userId, roleId: role.id },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'TEAM_INVITE_SENT',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { invitedUserId: invitedUser.id, roleName },
      severity:     'INFO',
      isRegulatory: false,
    });

    const org = await app.prisma.organization.findUnique({ where: { id }, select: { businessName: true } });
    publishNotification({
      ondiUserId: invitedUser.id,
      orgId: id,
      type: 'org.invite.sent',
      title: `You've been invited to join ${org?.businessName ?? 'a company'} on Hudumika`,
      body: `Role: ${roleName}`,
      actionUrl: `${ondiWebUrl}/invites/${invite.id}`,
    });

    return reply.code(201).send({ inviteId: invite.id });
  });

  /**
   * GET /organizations/invites/:inviteId
   * A single invite, addressed to the caller — backs the "you've been
   * invited" link (${ondiWebUrl}/invites/:inviteId) generated when an org
   * sends an invite. Only the invited user can look it up; this is what
   * lets that link route someone straight into the invite-accept screen
   * (behind the normal login redirect if they aren't signed in yet)
   * instead of dumping them on the generic dashboard with no trace of it.
   */
  app.get('/invites/:inviteId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { inviteId } = req.params as { inviteId: string };
    const invite = await app.prisma.organizationInvite.findFirst({
      where: { id: inviteId, invitedUserId: userId },
      include: { organization: true, role: true },
    });
    if (!invite) return reply.code(404).send({ error: 'invite_not_found' });

    const inviter = await app.prisma.user.findUnique({ where: { id: invite.invitedBy } });

    return reply.send({
      id: invite.id,
      organizationId: invite.organizationId,
      organizationName: invite.organization.businessName,
      roleName: invite.role.name,
      invitedByName: inviter ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.ondi : null,
      createdAt: invite.createdAt,
      status: invite.acceptedAt ? 'accepted' : invite.declinedAt ? 'declined' : 'pending',
    });
  });

  /**
   * GET /organizations/invites/pending
   * Invites addressed to the caller, awaiting their response.
   */
  app.get('/invites/pending', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const invites = await app.prisma.organizationInvite.findMany({
      where: { invitedUserId: userId, acceptedAt: null, declinedAt: null },
      include: { organization: true, role: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      invites: invites.map(i => ({
        id: i.id,
        organizationId: i.organizationId,
        organizationName: i.organization.businessName,
        roleName: i.role.name,
        createdAt: i.createdAt,
      })),
    });
  });

  /**
   * POST /organizations/invites/:inviteId/accept
   * Only the invited user can accept their own invite — creates the real
   * UserRole membership. Never possible without this explicit accept step.
   */
  app.post('/invites/:inviteId/accept', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { inviteId } = req.params as { inviteId: string };
    const invite = await app.prisma.organizationInvite.findFirst({
      where: { id: inviteId, invitedUserId: userId, acceptedAt: null, declinedAt: null },
    });
    if (!invite) return reply.code(404).send({ error: 'invite_not_found' });

    await app.prisma.$transaction([
      app.prisma.organizationInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } }),
      app.prisma.userRole.create({
        data: { userId, organizationId: invite.organizationId, roleId: invite.roleId },
      }),
    ]);

    await app.audit.write({
      entityType:   'ORG',
      entityId:     invite.organizationId,
      action:       'TEAM_MEMBER_JOINED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { inviteId },
      severity:     'INFO',
      isRegulatory: false,
    });

    // Real JML provisioning — this is the point a membership actually exists
    // (not the earlier "invite sent" step, which the invitee could still
    // decline), so it's the correct moment to provision the connected-app
    // side too. Authentik sync failure doesn't fail the join — Ondi's own
    // membership record, already committed above, is the source of truth.
    try {
      const user = await app.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const provisioned = await app.authentik.provisionUser(
          { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phoneNumber: user.phoneNumber },
          invite.organizationId,
        );
        await app.audit.write({
          entityType: 'ORG', entityId: invite.organizationId, action: 'ADMIN_UPDATE', category: 'ADMIN',
          performedBy: 'system:jml', metadata: { action: 'authentik_provision', userId, authentikUserId: provisioned?.id ?? null },
          severity: 'INFO', isRegulatory: false,
        });
      }
    } catch (authErr) {
      app.log.error(authErr, 'Failed to provision new member in Authentik — Ondi membership still stands');
    }

    return reply.send({ joined: true, organizationId: invite.organizationId });
  });

  /**
   * POST /organizations/invites/:inviteId/decline
   */
  app.post('/invites/:inviteId/decline', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { inviteId } = req.params as { inviteId: string };
    const invite = await app.prisma.organizationInvite.findFirst({
      where: { id: inviteId, invitedUserId: userId, acceptedAt: null, declinedAt: null },
    });
    if (!invite) return reply.code(404).send({ error: 'invite_not_found' });

    await app.prisma.organizationInvite.update({ where: { id: inviteId }, data: { declinedAt: new Date() } });
    return reply.send({ declined: true });
  });

  /**
   * PATCH /organizations/:id/members/:userId/role
   * Owner/Admin-only. Reassigns an existing member's role.
   */
  app.patch('/:id/members/:memberId/role', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, memberId } = req.params as { id: string; memberId: string };
    const targetGroupIds = await getMemberGroupIds(app, memberId, id);
    if (!(await requirePermission(app, userId, id, 'org:manage_team', targetGroupIds)))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    // scopeGroupId: delegated admin — this member's new role's permissions
    // apply only within that group (e.g. "promote to Admin, but only for
    // the Sales group"), rather than org-wide. undefined leaves any
    // existing scope untouched; null explicitly clears it back to org-wide;
    // a group id sets/changes it. See lib/org-auth.ts's hasPermission.
    const { roleName, scopeGroupId } = req.body as { roleName?: string; scopeGroupId?: string | null };
    if (!roleName) return reply.code(400).send({ error: 'missing_fields' });

    const membership = await app.prisma.userRole.findFirst({ where: { userId: memberId, organizationId: id }, include: { role: true } });
    if (!membership) return reply.code(404).send({ error: 'member_not_found' });

    const role = await getRoleByName(app, id, roleName);
    if (!role) return reply.code(400).send({ error: 'invalid_role' });

    if (membership.role.name === 'Owner' && roleName !== 'Owner') {
      const ownerRole = await getRoleByName(app, null, 'Owner');
      const ownerCount = await app.prisma.userRole.count({ where: { organizationId: id, roleId: ownerRole!.id } });
      if (ownerCount <= 1) return reply.code(409).send({ error: 'cannot_remove_last_owner' });
    }

    if (scopeGroupId) {
      const scopeGroup = await app.prisma.group.findFirst({ where: { id: scopeGroupId, organizationId: id } });
      if (!scopeGroup) return reply.code(400).send({ error: 'invalid_scope_group' });
    }

    await app.prisma.userRole.update({
      where: { id: membership.id },
      data: { roleId: role.id, ...(scopeGroupId !== undefined ? { scopeGroupId: scopeGroupId || null } : {}) },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'ROLE_CHANGED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { memberId, roleName, scopeGroupId: scopeGroupId ?? undefined },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/members/:userId
   * Owner/Admin-only. Refuses to remove the organization's last Owner —
   * that would leave the org unmanageable.
   */
  app.delete('/:id/members/:memberId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, memberId } = req.params as { id: string; memberId: string };
    const targetGroupIds = await getMemberGroupIds(app, memberId, id);
    if (!(await requirePermission(app, userId, id, 'org:manage_team', targetGroupIds)))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const membership = await app.prisma.userRole.findFirst({ where: { userId: memberId, organizationId: id }, include: { role: true } });
    if (!membership) return reply.code(404).send({ error: 'member_not_found' });

    if (membership.role.name === 'Owner') {
      const ownerRole = await getRoleByName(app, null, 'Owner');
      const ownerCount = await app.prisma.userRole.count({ where: { organizationId: id, roleId: ownerRole!.id } });
      if (ownerCount <= 1) return reply.code(409).send({ error: 'cannot_remove_last_owner' });
    }

    await app.prisma.userRole.delete({ where: { id: membership.id } });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'MEMBER_REMOVED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { memberId },
      severity:     'WARNING',
      isRegulatory: false,
    });

    return reply.send({ removed: true });
  });

  /**
   * GET /organizations/:id/members
   * Any member can view the roster.
   */
  app.get('/:id/members', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const caller = await app.prisma.userRole.findFirst({ where: { userId, organizationId: id } });
    if (!caller) return reply.code(404).send({ error: 'organization_not_found' });

    const members = await app.prisma.userRole.findMany({
      where: { organizationId: id },
      include: {
        user: { select: { id: true, ondi: true, firstName: true, lastName: true, avatarUrl: true } },
        role: true,
        scopeGroup: { select: { id: true, name: true } },
      },
    });

    return reply.send({
      members: members.map(m => ({
        userId: m.user.id,
        ondi: m.user.ondi,
        name: [m.user.firstName, m.user.lastName].filter(Boolean).join(' '),
        avatarUrl: m.user.avatarUrl,
        roleName: m.role.name,
        // Delegated admin — this member's role only applies within this
        // group, not org-wide. null = the normal, unscoped case.
        scopeGroupId: m.scopeGroup?.id ?? null,
        scopeGroupName: m.scopeGroup?.name ?? null,
      })),
    });
  });

  /**
   * POST /organizations/:id/directors
   * Owner/Admin-only. Supports a bare name-only record (no Ondi account) or
   * one linked to a real Ondi user via `ondi` — the latter starts
   * unverified until that user confirms themselves (see /verify below).
   */
  app.post('/:id/directors', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_directors')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, ondi } = req.body as { name?: string; ondi?: string };
    if (!name) return reply.code(400).send({ error: 'missing_fields' });

    if (ondi) {
      const linkedUser = await app.prisma.user.findUnique({ where: { ondi } });
      if (!linkedUser) return reply.code(404).send({ error: 'user_not_found' });
    }

    const director = await app.prisma.director.create({
      data: { organizationId: id, name, ondi: ondi || null },
    });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     id,
      action:       'DIRECTOR_ADDED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { directorId: director.id, name },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.code(201).send({ id: director.id });
  });

  /**
   * GET /organizations/:id/directors
   * Any member can view the roster.
   */
  app.get('/:id/directors', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const caller = await app.prisma.userRole.findFirst({ where: { userId, organizationId: id } });
    if (!caller) return reply.code(404).send({ error: 'organization_not_found' });

    const directors = await app.prisma.director.findMany({ where: { organizationId: id } });
    return reply.send({
      directors: directors.map(d => ({ id: d.id, name: d.name, ondi: d.ondi, verified: d.verified })),
    });
  });

  /**
   * DELETE /organizations/:id/directors/:directorId
   * Owner/Admin-only.
   */
  app.delete('/:id/directors/:directorId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, directorId } = req.params as { id: string; directorId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_directors')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const director = await app.prisma.director.findFirst({ where: { id: directorId, organizationId: id } });
    if (!director) return reply.code(404).send({ error: 'director_not_found' });

    await app.prisma.director.delete({ where: { id: directorId } });
    return reply.send({ removed: true });
  });

  /**
   * POST /organizations/directors/:directorId/verify
   * The linked Ondi user confirms they really are this director — real
   * self-attestation, not an owner/admin unilaterally marking it true.
   */
  app.post('/directors/:directorId/verify', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { directorId } = req.params as { directorId: string };
    const director = await app.prisma.director.findUnique({ where: { id: directorId } });
    if (!director) return reply.code(404).send({ error: 'director_not_found' });

    const caller = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!caller || !director.ondi || director.ondi !== caller.ondi)
      return reply.code(403).send({ error: 'not_this_director' });

    await app.prisma.director.update({ where: { id: directorId }, data: { verified: true } });

    await app.audit.write({
      entityType:   'ORG',
      entityId:     director.organizationId,
      action:       'DIRECTOR_VERIFIED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { directorId },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ verified: true });
  });
}
