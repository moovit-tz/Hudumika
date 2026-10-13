import { z } from 'zod';
import { sign } from 'node:crypto';
import { assertPublicHttpUrl } from '../lib/ssrf-guard.js';
import type { MailDnsRecord } from '@hudumika/types';

export const mailProviderConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cpanel'), baseUrl: z.string().url(), username: z.string().min(1), apiToken: z.string().min(1),
    imapHost: z.string().min(1), smtpHost: z.string().min(1) }),
  z.object({ kind: z.literal('google'), serviceAccountEmail: z.string().email(), privateKey: z.string().min(1), delegatedAdmin: z.string().email() }),
  z.object({ kind: z.literal('microsoft'), directoryTenantId: z.string().uuid(), clientId: z.string().uuid(), clientSecret: z.string().min(1),
    licenseSkuId: z.string().uuid(), usageLocation: z.string().length(2) }),
]);
export type MailProviderConfig = z.infer<typeof mailProviderConfigSchema>;

async function jsonRequest(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  // Provider responses can echo passwords or tokens; expose the status, never the raw payload.
  if (!response.ok) throw new Error(`Mail provider request failed (${response.status}). Check permissions, domain ownership and the provider console.`);
  return body;
}

export async function providerAccessToken(config: Exclude<MailProviderConfig, { kind: 'cpanel' }>): Promise<string> {
  if (config.kind === 'microsoft') {
    const body = await jsonRequest(`https://login.microsoftonline.com/${config.directoryTenantId}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!body.access_token) throw new Error('Microsoft did not return an administration access token.');
    return body.access_token;
  }
  const now = Math.floor(Date.now() / 1000);
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded({ iss: config.serviceAccountEmail,
    sub: config.delegatedAdmin, scope: 'https://www.googleapis.com/auth/admin.directory.user https://www.googleapis.com/auth/admin.directory.domain.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`;
  const body = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!body.access_token) throw new Error('Google did not return a delegated administration access token.');
  return body.access_token;
}

async function cpanel(config: Extract<MailProviderConfig, { kind: 'cpanel' }>, action: string, fields: Record<string, string>) {
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
    throw new Error('Use the HTTPS cPanel origin, for example https://your-server:2083.');
  }
  await assertPublicHttpUrl(base.origin);
  const body = await jsonRequest(`${base.origin}/execute/Email/${action}`, {
    method: 'POST', headers: { Authorization: `cpanel ${config.username}:${config.apiToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  if (body.result?.status !== 1) throw new Error('cPanel rejected the operation. Check the domain, quota and token permissions in cPanel.');
  return body.result.data;
}

export async function checkMailProvider(config: MailProviderConfig, domain: string) {
  if (config.kind === 'cpanel') {
    await cpanel(config, 'list_pops_with_disk', { domain });
    return { connected: true };
  }
  const token = await providerAccessToken(config);
  const url = config.kind === 'google'
    ? `https://admin.googleapis.com/admin/directory/v1/customer/my_customer/domains/${encodeURIComponent(domain)}`
    : `https://graph.microsoft.com/v1.0/domains/${encodeURIComponent(domain)}`;
  const result = await jsonRequest(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!(config.kind === 'google' ? result.verified : result.isVerified)) throw new Error('Verify this domain in the provider administration console first.');
  return { connected: true };
}

export async function createProviderMailbox(config: MailProviderConfig, input: { address: string; name: string; password: string; quotaMb: number | null }, onCreated: (id: string) => Promise<void>) {
  const [local, domain] = input.address.split('@');
  await checkMailProvider(config, domain);
  if (config.kind === 'cpanel') {
    await cpanel(config, 'add_pop', { email: local, domain, password: input.password, quota: String(input.quotaMb ?? 1024) });
    await onCreated(input.address);
    return { id: input.address, mailboxReady: true };
  }
  const token = await providerAccessToken(config);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (config.kind === 'google') {
    const names = input.name.trim().split(/\s+/);
    const user = await jsonRequest('https://admin.googleapis.com/admin/directory/v1/users', {
      method: 'POST', headers, body: JSON.stringify({ primaryEmail: input.address,
        name: { givenName: names[0] || local, familyName: names.slice(1).join(' ') || local },
        password: input.password, changePasswordAtNextLogin: true }),
    });
    if (!user.id) throw new Error('Google did not confirm an account ID. Review the provider before retrying.');
    await onCreated(user.id);
    // Directory creation does not prove Gmail service or a Workspace license is active.
    return { id: user.id, mailboxReady: false };
  }
  const user = await jsonRequest('https://graph.microsoft.com/v1.0/users', {
    method: 'POST', headers, body: JSON.stringify({ accountEnabled: true, displayName: input.name || local,
      mailNickname: local, userPrincipalName: input.address, usageLocation: config.usageLocation.toUpperCase(),
      passwordProfile: { password: input.password, forceChangePasswordNextSignIn: true } }),
  });
  if (!user.id) throw new Error('Microsoft did not confirm an account ID. Review the provider before retrying.');
  await onCreated(user.id);
  await jsonRequest(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user.id)}/assignLicense`, {
    method: 'POST', headers, body: JSON.stringify({ addLicenses: [{ skuId: config.licenseSkuId }], removeLicenses: [] }),
  });
  // Exchange mailbox creation is asynchronous after licensing.
  return { id: user.id, mailboxReady: false };
}

export async function microsoftMailDns(config: Extract<MailProviderConfig, { kind: 'microsoft' }>, domain: string): Promise<MailDnsRecord[]> {
  const token = await providerAccessToken(config);
  const body = await jsonRequest(`https://graph.microsoft.com/v1.0/domains/${encodeURIComponent(domain)}/serviceConfigurationRecords`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (body.value ?? []).flatMap((record: any): MailDnsRecord[] => {
    const name = record.label === domain ? '@' : String(record.label ?? '').replace(new RegExp(`\\.${domain.replace(/\./g, '\\.')}\\.?$`), '');
    if (record.recordType === 'Mx') return [{ name, type: 'MX', value: record.mailExchange, priority: record.preference, ttl: record.ttl ?? 3600, purpose: 'mx' }];
    if (record.recordType === 'Txt' && String(record.text).startsWith('v=spf1')) return [{ name, type: 'TXT', value: record.text, ttl: record.ttl ?? 3600, purpose: 'spf' }];
    return [];
  });
}

export async function inspectProviderMailbox(config: MailProviderConfig, address: string, providerId: string | null) {
  if (config.kind === 'cpanel') {
    const rows = await cpanel(config, 'list_pops_with_disk', { domain: address.split('@')[1] });
    const row = (Array.isArray(rows) ? rows : []).find((item: any) => item.email === address);
    if (!row) throw new Error('Mailbox not found in cPanel. Review the provider account before creating it again.');
    return { id: address, mailboxReady: true };
  }
  const token = await providerAccessToken(config);
  const base = config.kind === 'google' ? 'https://admin.googleapis.com/admin/directory/v1/users/' : 'https://graph.microsoft.com/v1.0/users/';
  const user = await jsonRequest(`${base}${encodeURIComponent(providerId ?? address)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!user.id) throw new Error('Provider did not confirm this account. Review the administration console.');
  return { id: String(user.id), mailboxReady: config.kind === 'google' && user.isMailboxSetup === true && !user.suspended };
}
