import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

interface ProviderConfig {
  key: 'google' | 'outlook';
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraAuthorizeParams?: Record<string, string>;
}

// Read-only scopes only — this integration is one-way import (external →
// local mirror), never writes back to Google/Outlook. See
// calendar-external-sync.job.ts for what actually uses these tokens.
const PROVIDERS: Record<'google' | 'outlook', ProviderConfig> = {
  google: {
    key: 'google', label: 'Google Calendar',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  outlook: {
    key: 'outlook', label: 'Outlook Calendar',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access Calendars.Read',
    extraAuthorizeParams: { response_mode: 'query' },
  },
};

/** Must be byte-identical between the /authorize redirect and the /callback
 *  token exchange (OAuth spec requirement) — same derive-from-request
 *  approach as mail-oauth.routes.ts's oauthRedirectUri, for the same reason
 *  (no configured base URL for the API itself exists yet). */
function oauthRedirectUri(request: FastifyRequest, provider: 'google' | 'outlook'): string {
  return `${request.protocol}://${request.headers.host}/v1/tasks/calendar-sync/${provider}/callback`;
}

function calendarRedirect(status: 'success' | 'error', provider: string, message?: string): string {
  const qs = new URLSearchParams({ calendarSync: status, provider });
  if (message) qs.set('msg', message);
  return `/calendar?${qs.toString()}`;
}

async function loadCalendarSyncConfig(trx: any, tenantId: string): Promise<Record<string, any>> {
  const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings.calendarSync ?? {};
}

function mapConnection(row: any) {
  return {
    provider: row.provider, status: row.status,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    lastError: row.last_error,
  };
}

/**
 * Google/Outlook Calendar OAuth2 consent + token-exchange, one-way import
 * only. Same parameterized authorize/callback shape as mail-oauth.routes.ts,
 * with one deliberate difference: the OAuth *app registration*
 * (client_id/secret) is tenant-level config (settings.calendarSync, same as
 * settings.email), but the *connection* this produces is per-USER
 * (calendar_sync_connections, migration 287) since calendar data is
 * personal — one Google Cloud/Azure AD app registration, each staff member
 * individually authorizes it against their own account. Inert until a
 * tenant admin saves real client_id/secret via PATCH /v1/settings; with
 * none configured, /authorize 400s with a clear message rather than
 * reaching Google/Microsoft with empty credentials.
 */
export async function calendarSyncRoutes(fastify: FastifyInstance) {
  fastify.get('/connections', { preHandler: fastify.authenticate }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('calendar_sync_connections').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).execute();
      return { data: rows.map(mapConnection) };
    });
  });

  for (const provider of Object.values(PROVIDERS)) {
    const clientIdKey = `${provider.key}ClientId`;
    const clientSecretKey = `${provider.key}ClientSecret`;

    fastify.get(`/${provider.key}/authorize`, { preHandler: fastify.authenticate }, async (request, reply) => {
      const user = request.user;
      const config = await withTenant(user.tenant_id, trx => loadCalendarSyncConfig(trx, user.tenant_id));
      const clientId = config[clientIdKey];
      if (!clientId) return reply.status(400).send({ error: `${provider.label} sync isn't configured for this workspace yet — ask an admin to add a Client ID/Secret in Settings.` });

      const state = fastify.jwt.sign(
        { typ: 'calendar_oauth_state', tenantId: user.tenant_id, userId: user.sub, provider: provider.key } as any,
        { expiresIn: '10m' },
      );

      const url = new URL(provider.authorizeUrl);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', oauthRedirectUri(request, provider.key));
      url.searchParams.set('scope', provider.scope);
      url.searchParams.set('state', state);
      for (const [k, v] of Object.entries(provider.extraAuthorizeParams ?? {})) url.searchParams.set(k, v);

      return { url: url.toString() };
    });

    // GET /:provider/callback — unauthenticated; the signed state (carrying
    // tenantId + userId) is the only credential, same reasoning as
    // mail-oauth.routes.ts's callback.
    fastify.get(`/${provider.key}/callback`, async (request, reply) => {
      const { code, state, error, error_description } = request.query as Record<string, string>;

      let claims: { tenantId: string; userId: string };
      try {
        claims = await fastify.jwt.verify<{ tenantId: string; userId: string }>(state);
      } catch {
        return reply.redirect(calendarRedirect('error', provider.key, 'This authorization link expired or is invalid — try connecting again.'));
      }
      if (error) return reply.redirect(calendarRedirect('error', provider.key, error_description || error));
      if (!code) return reply.redirect(calendarRedirect('error', provider.key, 'No authorization code was returned.'));

      return withTenant(claims.tenantId, async (trx) => {
        const config = await loadCalendarSyncConfig(trx, claims.tenantId);
        const clientId = config[clientIdKey];
        const clientSecret = config[clientSecretKey] ? decryptSecret(config[clientSecretKey]) : null;
        if (!clientId || !clientSecret) {
          return reply.redirect(calendarRedirect('error', provider.key, 'Client ID/Secret is missing — save it before connecting.'));
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
          fastify.log.error('Calendar OAuth token exchange failed for %s: %s', provider.key, await tokenRes.text());
          return reply.redirect(calendarRedirect('error', provider.key, 'Token exchange failed — check the Client ID/Secret and try again.'));
        }

        const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
        if (!tokens.refresh_token) {
          return reply.redirect(calendarRedirect('error', provider.key, 'No refresh token was granted — disconnect any prior authorization for this app and try again.'));
        }

        const expiresAtStr = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
        const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : encryptSecret('');

        await trx.insertInto('calendar_sync_connections').values({
          id: crypto.randomUUID(), tenant_id: claims.tenantId, user_id: claims.userId, provider: provider.key,
          access_token: encryptSecret(tokens.access_token), refresh_token: refreshEnc,
          token_expires_at: expiresAtStr, status: 'authorized',
          last_error: null,
        }).onConflict(oc => oc.columns(['user_id', 'provider']).doUpdateSet({
          access_token: encryptSecret(tokens.access_token), refresh_token: refreshEnc,
          token_expires_at: expiresAtStr, status: 'authorized',
          last_error: null, updated_at: new Date() as any,
        })).execute();

        return reply.redirect(calendarRedirect('success', provider.key));
      });
    });

    fastify.post(`/${provider.key}/disconnect`, { preHandler: fastify.authenticate }, async (request) => {
      const user = request.user;
      return withTenant(user.tenant_id, async (trx) => {
        await trx.deleteFrom('calendar_sync_connections')
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('provider', '=', provider.key)
          .execute();
        // Sever the tie without deleting the mirrored events themselves —
        // they're the user's own calendar history at this point, same as
        // an ICS import; only future syncs stop.
        await trx.updateTable('calendar_events').set({ external_source: null, external_id: null })
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('external_source', '=', provider.key)
          .execute();
        return { success: true };
      });
    });
  }
}
