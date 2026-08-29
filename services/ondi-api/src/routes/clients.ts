import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { requireAdmin } from '../lib/admin-auth.js';

export async function clientRoutes(app: FastifyInstance) {

  app.post('/register', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { name, redirectUris, scopes, grantTypes, logoUrl, isFirstParty = false } = req.body;
    if (!name || !scopes?.length)
      return reply.code(400).send({ error: 'missing_fields' });

    // Kept in sync with GET /oauth/.well-known/openid-configuration's
    // scopes_supported and buildUserinfoClaims's actual claim-filtering
    // logic in oauth.ts — 'organizations'/'email'/'phone' were claimable
    // via userinfo but missing here, so no client could ever be registered
    // with them (this endpoint silently dropped any scope not in this
    // list). A relying-party app with no backend of its own (see the
    // Hudumika Workspace launcher) needs 'organizations' specifically —
    // it's the only channel a third-party OAuth client has to learn which
    // real org a signed-in user belongs to (GET /organizations/mine is
    // gated on Ondi's own first-party session, not an OAuth access_token).
    const ALLOWED_SCOPES  = ['openid', 'profile', 'email', 'phone', 'trust', 'kyc', 'credit', 'transactions', 'organizations'];
    const ALLOWED_GRANTS  = ['authorization_code', 'client_credentials', 'refresh_token'];
    const validScopes     = scopes.filter((s: string) => ALLOWED_SCOPES.includes(s));
    const validGrants     = (grantTypes as string[] | undefined)?.filter(g => ALLOWED_GRANTS.includes(g))
                            ?? ['authorization_code'];

    // client_credentials apps don't need a redirectUri
    const isM2M = validGrants.includes('client_credentials') && !validGrants.includes('authorization_code');
    if (!isM2M) {
      if (!redirectUris?.length) return reply.code(400).send({ error: 'redirect_uris_required' });
      if (!validScopes.includes('openid')) return reply.code(400).send({ error: 'openid_scope_required' });
    }

    const clientId    = `client_${crypto.randomBytes(12).toString('hex')}`;
    const plainSecret = crypto.randomBytes(32).toString('hex');
    const secretHash  = crypto.createHash('sha256').update(plainSecret).digest('hex');

    const client = await app.prisma.oAuthClient.create({
      data: {
        name,
        clientId,
        clientSecret: secretHash,
        redirectUris: redirectUris ?? [],
        scopes:       validScopes,
        grantTypes:   validGrants,
        logoUrl,
        isFirstParty,
      },
    });

    return reply.code(201).send({
      clientId:     client.clientId,
      clientSecret: plainSecret, // returned once — store securely
      scopes:       client.scopes,
      grantTypes:   (client as any).grantTypes,
      isFirstParty: client.isFirstParty,
    });
  });

  app.get('/', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const clients = await app.prisma.oAuthClient.findMany({
      select: { id: true, clientId: true, name: true, scopes: true, logoUrl: true, isFirstParty: true },
    });
    return reply.send(clients);
  });

  app.get('/:clientId', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const client = await app.prisma.oAuthClient.findUnique({
      where:  { clientId: req.params.clientId },
      select: { id: true, clientId: true, name: true, scopes: true, logoUrl: true, isFirstParty: true },
    });
    if (!client) return reply.code(404).send({ error: 'client_not_found' });
    return reply.send(client);
  });

  app.delete('/:clientId', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;
    const client = await app.prisma.oAuthClient.findUnique({ where: { clientId: req.params.clientId } });
    if (!client) return reply.code(404).send({ error: 'client_not_found' });
    await app.prisma.consent.deleteMany({ where: { clientId: client.id } });
    await app.prisma.oAuthClient.delete({ where: { id: client.id } });
    return reply.send({ deleted: true });
  });
}
