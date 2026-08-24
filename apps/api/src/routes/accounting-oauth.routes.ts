import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db/client.js';
import { encryptSecret } from '../services/onsite-secrets.service.js';
import { getAdapter, isProviderConfigured, type AccountingProvider } from '../services/accounting-integration.service.js';

const PROVIDERS: AccountingProvider[] = ['QUICKBOOKS', 'XERO'];

/** Must be byte-identical between the /authorize redirect and the /callback
 *  token exchange (OAuth spec requirement) — same approach as mail-oauth.routes.ts. */
function oauthRedirectUri(request: FastifyRequest, provider: string): string {
  return `${request.protocol}://${request.headers.host}/v1/accounting-integrations/${provider}/callback`;
}

function settingsRedirect(status: 'success' | 'error', provider: string, message?: string): string {
  const qs = new URLSearchParams({ s: 'integrations', oauth: status, provider });
  if (message) qs.set('msg', message);
  return `/finance/integrations?${qs.toString()}`;
}

/**
 * Real QuickBooks/Xero OAuth2 connect — authorize -> provider consent ->
 * callback exchanges code for tokens -> encrypted + stored on
 * accounting_integrations. Same shape as mail-oauth.routes.ts, registered
 * as its own file (not nested inside accounting-integration.routes.ts's
 * authenticated hook) because the callback below must be reachable
 * unauthenticated — the provider redirects the bare browser here with no
 * app JWT in hand, which is exactly the bug this replaces: the callback
 * used to sit behind fastify.authenticate and could never have worked for
 * a real redirect even if it had done anything real.
 */
export async function accountingOAuthRoutes(fastify: FastifyInstance) {
  for (const provider of PROVIDERS) {
    const adapter = getAdapter(provider);

    // GET /:provider/authorize — returns the authorize URL as JSON (this
    // app keeps its JWT in localStorage, not a cookie, so the route the
    // browser navigates to directly can't itself be auth-gated).
    fastify.get(`/${provider}/authorize`, { preHandler: fastify.authenticate }, async (request, reply) => {
      if (!isProviderConfigured(provider)) {
        return reply.status(400).send({ error: `${provider} is not configured on this platform yet — no Client ID/Secret is set.` });
      }
      const user = (request as any).user;
      const state = fastify.jwt.sign({ typ: 'accounting_oauth_state', tenantId: user.tenant_id, provider } as any, { expiresIn: '10m' });

      const url = new URL(adapter.authorizeUrl);
      url.searchParams.set('client_id', adapter.clientId!);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', oauthRedirectUri(request, provider));
      url.searchParams.set('scope', adapter.scope);
      url.searchParams.set('state', state);
      if (provider === 'XERO') url.searchParams.set('access_type', 'offline');
      return { url: url.toString() };
    });

    // GET /:provider/callback — unauthenticated; the signed state is the
    // only credential, exactly like mail-oauth.routes.ts's callback.
    fastify.get(`/${provider}/callback`, async (request, reply) => {
      const query = request.query as Record<string, string>;
      const { code, state, error, error_description } = query;

      let claims: { tenantId: string };
      try {
        claims = await fastify.jwt.verify<{ tenantId: string }>(state);
      } catch {
        return reply.redirect(settingsRedirect('error', provider, 'This authorization link expired or is invalid — try connecting again.'));
      }
      if (error) return reply.redirect(settingsRedirect('error', provider, error_description || error));
      if (!code) return reply.redirect(settingsRedirect('error', provider, 'No authorization code was returned.'));

      return withTenant(claims.tenantId, async (trx) => {
        const redirectUri = oauthRedirectUri(request, provider);
        const tokenRes = await fetch(adapter.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(provider === 'QUICKBOOKS' ? { Authorization: `Basic ${Buffer.from(`${adapter.clientId}:${adapter.clientSecret}`).toString('base64')}` } : {}),
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code', code, redirect_uri: redirectUri,
            ...(provider === 'XERO' ? { client_id: adapter.clientId ?? '', client_secret: adapter.clientSecret ?? '' } : {}),
          }),
        });

        if (!tokenRes.ok) {
          fastify.log.error('OAuth token exchange failed for %s: %s', provider, await tokenRes.text());
          return reply.redirect(settingsRedirect('error', provider, 'Token exchange failed — try connecting again.'));
        }
        const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
        if (!tokens.refresh_token) {
          return reply.redirect(settingsRedirect('error', provider, 'No refresh token was granted — disconnect any prior authorization for this app and try again.'));
        }

        // QuickBooks returns the org id (realmId) as a callback query param;
        // Xero requires a separate call to /connections to learn which
        // tenant(s) the user just authorized.
        let orgId: string | null = null;
        if (provider === 'QUICKBOOKS') {
          orgId = query.realmId ?? null;
        } else {
          const connRes = await fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
          if (connRes.ok) {
            const conns = await connRes.json() as Array<{ tenantId: string }>;
            orgId = conns[0]?.tenantId ?? null;
          }
        }
        if (!orgId) {
          return reply.redirect(settingsRedirect('error', provider, 'Could not determine which company was authorized.'));
        }

        const existing = await trx.selectFrom('accounting_integrations').select('id')
          .where('tenant_id', '=', claims.tenantId).where('provider', '=', provider).executeTakeFirst();
        const values = {
          status: 'CONNECTED' as const,
          access_token_enc: encryptSecret(tokens.access_token),
          refresh_token_enc: encryptSecret(tokens.refresh_token),
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
          provider_org_id: orgId,
          last_error: null,
          updated_at: new Date(),
        };
        if (existing) {
          await trx.updateTable('accounting_integrations').set(values).where('id', '=', existing.id).execute();
        } else {
          await trx.insertInto('accounting_integrations').values({ tenant_id: claims.tenantId, provider, config: '{}' as any, ...values }).execute();
        }

        return reply.redirect(settingsRedirect('success', provider));
      });
    });
  }
}
