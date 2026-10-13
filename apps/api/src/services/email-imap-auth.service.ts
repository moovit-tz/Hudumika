import { withTenant } from '../db/client.js';
import { decryptSecret, encryptSecret } from './onsite-secrets.service.js';

const secret = (value: string) => /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(value) ? decryptSecret(value) : value;

export async function resolveImapAuth(tenantId: string, userId: string): Promise<{ user: string; pass?: string; accessToken?: string }> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('user_email_accounts').selectAll()
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).executeTakeFirstOrThrow());
  if (!row.imap_user) throw new Error('Configure the IMAP username first.');
  if (row.imap_pass) return { user: row.imap_user, pass: secret(row.imap_pass) };
  const provider = row.send_protocol;
  if (provider !== 'gmail' && provider !== 'outlook') throw new Error('Configure an IMAP password or connect Google/Microsoft OAuth.');
  if (row.from_email?.toLowerCase() !== row.imap_user.toLowerCase()) throw new Error('The IMAP username must match the connected OAuth identity.');
  const refresh = row[`${provider}_refresh_token`];
  const access = row[`${provider}_access_token`];
  const expiry = row[`${provider}_token_expires_at`];
  if (access && expiry && new Date(expiry).getTime() > Date.now() + 60_000) return { user: row.imap_user, accessToken: secret(access) };
  if (!refresh) throw new Error('Reconnect your OAuth mailbox to obtain a refresh token.');
  const settingsRow = await withTenant(tenantId, trx => trx.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', tenantId).executeTakeFirst());
  const settings = typeof settingsRow?.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow?.settings;
  const config = settings?.email ?? {};
  if (!config[`${provider}ClientId`] || !config[`${provider}ClientSecret`]) throw new Error('The workspace OAuth client is not configured.');
  const response = await fetch(provider === 'gmail' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config[`${provider}ClientId`], client_secret: secret(config[`${provider}ClientSecret`]),
      refresh_token: secret(refresh), grant_type: 'refresh_token' }),
  });
  const tokens = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!response.ok || !tokens.access_token) throw new Error('OAuth refresh failed. Reconnect the mailbox with IMAP permission.');
  await withTenant(tenantId, trx => trx.updateTable('user_email_accounts').set({
    [`${provider}_access_token`]: encryptSecret(tokens.access_token!),
    [`${provider}_token_expires_at`]: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    ...(tokens.refresh_token ? { [`${provider}_refresh_token`]: encryptSecret(tokens.refresh_token) } : {}),
  }).where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute());
  return { user: row.imap_user, accessToken: tokens.access_token };
}
