import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

interface ProviderConfig {
  key: 'outlook' | 'gmail';
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraAuthorizeParams?: Record<string, string>;
}

const PROVIDERS: Record<'outlook' | 'gmail', ProviderConfig> = {
  outlook: {
    key: 'outlook',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access https://outlook.office.com/SMTP.Send',
    extraAuthorizeParams: { response_mode: 'query' },
  },
  gmail: {
    key: 'gmail',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://mail.google.com/',
    // access_type=offline + prompt=consent are what guarantee Google actually
    // returns a refresh_token — without prompt=consent a returning user who
    // already granted access once gets no refresh_token on subsequent grants.
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
};

/** Must be byte-identical between the /authorize redirect and the /callback
 *  token exchange (OAuth spec requirement) — derived from the live request
 *  rather than a configured base URL, since none exists for the API itself
 *  yet (only PUBLIC_APP_URL, the frontend's). Assumes no proxy mangles the
 *  Host header, matching this codebase's current dev-focused deployment. */
function oauthRedirectUri(request: FastifyRequest, provider: 'outlook' | 'gmail'): string {
  return `${request.protocol}://${request.headers.host}/v1/settings/email/${provider}/callback`;
}

function settingsRedirect(status: 'success' | 'error', provider: string, message?: string): string {
  const qs = new URLSearchParams({ s: 'email', oauth: status, provider });
  if (message) qs.set('msg', message);
  return `/workspace/settings?${qs.toString()}`;
}

async function loadEmailConfig(trx: any, tenantId: string): Promise<{ settings: Record<string, any>; emailConfig: Record<string, any> }> {
  const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return { settings, emailConfig: settings.email ?? {} };
}

/**
 * Outlook (Microsoft identity platform) and Gmail (Google) OAuth2 consent +
 * token-exchange flows — one parameterized implementation for both, since
 * they're the identical shape (authorize redirect w/ signed state carrying
 * tenantId → provider consent screen → callback exchanges code for tokens →
 * encrypted + stored on tenant_settings.settings.email → redirect back into
 * Settings). Sending itself needs none of this: nodemailer's built-in OAuth2
 * auth type (wired in EmailIntegration.sendEmail) is what actually uses
 * these tokens, so this file's only job is getting them obtained and kept
 * fresh.
 */
export async function mailOAuthRoutes(fastify: FastifyInstance) {
  for (const provider of Object.values(PROVIDERS)) {
    const clientIdKey = `${provider.key}ClientId`;
    const clientSecretKey = `${provider.key}ClientSecret`;
    const accessTokenKey = `${provider.key}AccessToken`;
    const refreshTokenKey = `${provider.key}RefreshToken`;
    const expiresAtKey = `${provider.key}TokenExpiresAt`;
    const statusKey = `${provider.key}Status`;

    // GET /:provider/authorize — returns the authorize URL as JSON rather
    // than issuing a redirect itself. A plain top-level browser navigation
    // (window.location.href) carries no Authorization header — this app
    // keeps its JWT in localStorage, not a cookie — so a fastify.
    // authenticate-gated route can't be the thing the browser navigates to
    // directly; it would 401 before ever reaching Microsoft/Google. The
    // frontend calls this via apiFetch (which does send the header) and
    // only THEN navigates the browser, to the third-party URL this returns.
    fastify.get(`/${provider.key}/authorize`, { preHandler: fastify.authenticate }, async (request, reply) => {
      const user = request.user;
      const { emailConfig } = await withTenant(user.tenant_id, trx => loadEmailConfig(trx, user.tenant_id));
      const clientId = emailConfig[clientIdKey];
      if (!clientId) return reply.status(400).send({ error: `Save a ${provider.key === 'outlook' ? 'Microsoft' : 'Google'} Client ID first.` });

      // Short-lived signed state — the only thing protecting/scoping the
      // callback below, which Microsoft/Google hit directly with no cookies
      // or Authorization header in play. Reuses the platform's own JWT
      // signing (fastify.jwt, @fastify/jwt) rather than a second secret.
      const state = fastify.jwt.sign({ typ: 'mail_oauth_state', tenantId: user.tenant_id, provider: provider.key } as any, { expiresIn: '10m' });

      const url = new URL(provider.authorizeUrl);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', oauthRedirectUri(request, provider.key));
      url.searchParams.set('scope', provider.scope);
      url.searchParams.set('state', state);
      for (const [k, v] of Object.entries(provider.extraAuthorizeParams ?? {})) url.searchParams.set(k, v);

      return { url: url.toString() };
    });

    // GET /:provider/callback — unauthenticated; the signed state is the
    // only credential. No fastify.authenticate here on purpose.
    fastify.get(`/${provider.key}/callback`, async (request, reply) => {
      const { code, state, error, error_description } = request.query as Record<string, string>;

      let claims: { tenantId: string };
      try {
        claims = await fastify.jwt.verify<{ tenantId: string }>(state);
      } catch {
        return reply.redirect(settingsRedirect('error', provider.key, 'This authorization link expired or is invalid — try connecting again.'));
      }
      if (error) return reply.redirect(settingsRedirect('error', provider.key, error_description || error));
      if (!code) return reply.redirect(settingsRedirect('error', provider.key, 'No authorization code was returned.'));

      return withTenant(claims.tenantId, async (trx) => {
        const { settings, emailConfig } = await loadEmailConfig(trx, claims.tenantId);
        const clientId = emailConfig[clientIdKey];
        const clientSecret = emailConfig[clientSecretKey] ? decryptSecret(emailConfig[clientSecretKey]) : null;
        if (!clientId || !clientSecret) {
          return reply.redirect(settingsRedirect('error', provider.key, 'Client ID/Secret is missing — save it before connecting.'));
        }

        const redirectUri = oauthRedirectUri(request, provider.key);
        const tokenRes = await fetch(provider.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret, code,
            redirect_uri: redirectUri, grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          fastify.log.error('OAuth token exchange failed for %s: %s', provider.key, await tokenRes.text());
          return reply.redirect(settingsRedirect('error', provider.key, 'Token exchange failed — check the Client ID/Secret and try again.'));
        }

        const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
        if (!tokens.refresh_token) {
          // Google omits this on a repeat grant without prompt=consent;
          // Microsoft omits it if offline_access wasn't actually granted.
          // Without one, every send after the access token's ~1hr expiry
          // fails with no way to recover short of reconnecting — surfaced
          // now, at connect time, rather than silently later.
          return reply.redirect(settingsRedirect('error', provider.key, 'No refresh token was granted — disconnect any prior authorization for this app and try again.'));
        }

        const updatedEmail = {
          ...emailConfig,
          [accessTokenKey]: encryptSecret(tokens.access_token),
          [refreshTokenKey]: encryptSecret(tokens.refresh_token),
          [expiresAtKey]: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          [statusKey]: 'authorized',
        };
        await trx.updateTable('tenant_settings')
          .set({ settings: JSON.stringify({ ...settings, email: updatedEmail }), updated_at: new Date() })
          .where('tenant_id', '=', claims.tenantId).execute();

        return reply.redirect(settingsRedirect('success', provider.key));
      });
    });
  }
}
