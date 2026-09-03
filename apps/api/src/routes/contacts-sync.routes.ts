import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import {
  buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken,
  getGoogleAccountEmail, fetchAllGoogleContacts, type GoogleContact,
} from '../integrations/google-contacts.js';
import { env } from '../config/env.js';
import { decryptSecret } from '../services/onsite-secrets.service.js';

const GOOGLE_REDIRECT_URI = `${env.OPS_BOARD_URL}/contacts/google/callback`;

async function getGoogleCreds(tenantId: string): Promise<{ clientId: string; clientSecret: string } | null> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst());
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  const g = settings?.['int-google'];
  if (!g?.oauthId || !g?.oauthSecret) return null;
  // oauthSecret is stored encrypted (settings.routes.ts's SECRET_FIELDS_BY_KEY);
  // this read used to hand the ciphertext straight to Google as the client
  // secret, so every OAuth exchange here failed with an "invalid_client" that
  // looked like a wrong credential rather than a missing decrypt. recaptcha.ts
  // and calendar-external-sync.job.ts already decrypt their own equivalents.
  //
  // The ID is trimmed of the surrounding quotes a paste out of a Google
  // credentials JSON leaves behind — Google rejects those, and nothing in the
  // UI would ever show why.
  const clientId = String(g.oauthId).trim().replace(/^["']|["']$/g, '').trim();
  if (!clientId) return null;
  return { clientId, clientSecret: decryptSecret(g.oauthSecret) };
}

/** Ensures the connection's access token is valid, refreshing it first if it has expired. */
async function ensureFreshToken(
  trx: Transaction<Database>,
  tenantId: string,
  connection: { id: string; access_token: string; refresh_token: string | null; token_expires_at: Date | null },
  creds: { clientId: string; clientSecret: string },
): Promise<string> {
  const expired = connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return connection.access_token;
  if (!connection.refresh_token) throw new Error('Google connection expired and has no refresh token — please reconnect.');

  const refreshed = await refreshGoogleAccessToken(creds.clientId, creds.clientSecret, connection.refresh_token);
  await trx.updateTable('contact_sync_connections').set({
    access_token: refreshed.access_token,
    token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
    updated_at: new Date(),
  }).where('id', '=', connection.id).execute();
  return refreshed.access_token;
}

async function upsertGoogleContacts(trx: Transaction<Database>, tenantId: string, contacts: GoogleContact[]): Promise<number> {
  let count = 0;
  for (const gc of contacts) {
    const existing = await trx.selectFrom('contacts').select('id')
      .where('tenant_id', '=', tenantId).where('source', '=', 'google_sync').where('external_id', '=', gc.externalId)
      .executeTakeFirst();

    const values = {
      first_name: gc.firstName,
      last_name: gc.lastName,
      email: gc.email,
      phone: gc.phone,
      company: gc.company,
      job_title: gc.jobTitle,
      avatar_url: gc.avatarUrl,
      website: gc.website,
      birthday: gc.birthday ? new Date(gc.birthday) : null,
      synced_at: new Date(),
      updated_at: new Date(),
    };

    if (existing) {
      await trx.updateTable('contacts').set(values).where('id', '=', existing.id).execute();
    } else {
      await trx.insertInto('contacts').values({
        tenant_id: tenantId,
        source: 'google_sync',
        external_id: gc.externalId,
        status: 'ACTIVE',
        is_favorite: false,
        ...values,
      } as any).execute();
    }
    count++;
  }
  return count;
}

export async function contactsSyncRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('contacts'));

  // ── Google ────────────────────────────────────────────────────

  fastify.get('/google/status', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const conn = await trx.selectFrom('contact_sync_connections').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('provider', '=', 'google')
        .executeTakeFirst();
      const creds = await getGoogleCreds(user.tenant_id);
      return {
        configured: !!creds,
        connected: !!conn,
        email: conn?.external_account_email ?? null,
        last_synced_at: conn?.last_synced_at ?? null,
        last_sync_status: conn?.last_sync_status ?? null,
        last_sync_error: conn?.last_sync_error ?? null,
        contacts_synced_count: conn?.contacts_synced_count ?? 0,
      };
    });
  });

  fastify.get('/google/auth-url', async (request, reply) => {
    const user = request.user;
    const creds = await getGoogleCreds(user.tenant_id);
    if (!creds) {
      reply.status(400);
      return { error: 'Google OAuth Client ID/Secret aren\'t configured yet — set them in Settings ▸ Integrations ▸ Google first.' };
    }
    const state = crypto.randomBytes(16).toString('hex');
    return { url: buildGoogleAuthUrl(creds.clientId, GOOGLE_REDIRECT_URI, state), state, redirect_uri: GOOGLE_REDIRECT_URI };
  });

  fastify.post<{ Body: { code: string } }>('/google/callback', async (request, reply) => {
    const user = request.user;
    const creds = await getGoogleCreds(user.tenant_id);
    if (!creds) {
      reply.status(400);
      return { error: 'Google OAuth Client ID/Secret aren\'t configured.' };
    }

    try {
      const tokens = await exchangeGoogleCode(creds.clientId, creds.clientSecret, GOOGLE_REDIRECT_URI, request.body.code);
      const email = await getGoogleAccountEmail(tokens.access_token);

      return await withTenant(user.tenant_id, async (trx) => {
        const existing = await trx.selectFrom('contact_sync_connections').select('id')
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('provider', '=', 'google').executeTakeFirst();

        const row = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token, // omitted by Google on a repeat consent without prompt=consent — buildGoogleAuthUrl always forces it
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
          external_account_email: email,
          updated_at: new Date(),
        };

        const connId = existing
          ? (await trx.updateTable('contact_sync_connections').set(row).where('id', '=', existing.id).returning('id').executeTakeFirstOrThrow()).id
          : (await trx.insertInto('contact_sync_connections').values({
              tenant_id: user.tenant_id, user_id: user.sub, provider: 'google', ...row,
            } as any).returning('id').executeTakeFirstOrThrow()).id;

        try {
          const googleContacts = await fetchAllGoogleContacts(tokens.access_token);
          const count = await upsertGoogleContacts(trx, user.tenant_id, googleContacts);
          await trx.updateTable('contact_sync_connections').set({
            last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: null, contacts_synced_count: count,
          }).where('id', '=', connId).execute();
          return { connected: true, email, synced: count };
        } catch (syncErr: any) {
          await trx.updateTable('contact_sync_connections').set({
            last_synced_at: new Date(), last_sync_status: 'failed', last_sync_error: syncErr.message,
          }).where('id', '=', connId).execute();
          // Connection is saved even though the first sync failed — "Sync Now" can retry.
          return { connected: true, email, synced: 0, sync_error: syncErr.message };
        }
      });
    } catch (err: any) {
      reply.status(400);
      return { error: err.message || 'Failed to connect Google account' };
    }
  });

  fastify.post('/google/sync', async (request, reply) => {
    const user = request.user;
    const creds = await getGoogleCreds(user.tenant_id);
    if (!creds) {
      reply.status(400);
      return { error: 'Google OAuth Client ID/Secret aren\'t configured.' };
    }

    return withTenant(user.tenant_id, async (trx) => {
      const conn = await trx.selectFrom('contact_sync_connections').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('provider', '=', 'google').executeTakeFirst();
      if (!conn) {
        reply.status(404);
        return { error: 'No Google connection — connect your account first.' };
      }

      try {
        const accessToken = await ensureFreshToken(trx, user.tenant_id, conn, creds);
        const googleContacts = await fetchAllGoogleContacts(accessToken);
        const count = await upsertGoogleContacts(trx, user.tenant_id, googleContacts);
        await trx.updateTable('contact_sync_connections').set({
          last_synced_at: new Date(), last_sync_status: 'success', last_sync_error: null, contacts_synced_count: count,
        }).where('id', '=', conn.id).execute();
        return { synced: count };
      } catch (err: any) {
        await trx.updateTable('contact_sync_connections').set({
          last_synced_at: new Date(), last_sync_status: 'failed', last_sync_error: err.message,
        }).where('id', '=', conn.id).execute();
        reply.status(502);
        return { error: err.message || 'Sync failed' };
      }
    });
  });

  fastify.delete('/google/connection', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('contact_sync_connections')
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', user.sub).where('provider', '=', 'google').execute();
      reply.status(204);
      return null;
    });
  });

  // File import (CSV/vCard) lives in contacts.routes.ts, replacing that
  // file's old JSON-array-only /import endpoint — kept in one place rather
  // than two competing contact-creation paths.
}
