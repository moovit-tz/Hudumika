import { withTenant } from '../db/client.js';
import { encryptJson, decryptJson } from './onsite-secrets.service.js';
import { mailProviderConfigSchema, type MailProviderConfig } from './mail-provider.service.js';

export async function saveWorkspaceMailProvider(tenantId: string, config: MailProviderConfig) {
  await withTenant(tenantId, trx => trx.insertInto('tenant_mail_provider_connections').values({
    tenant_id: tenantId, kind: config.kind, config_ciphertext: encryptJson(config),
  }).onConflict(oc => oc.columns(['tenant_id', 'kind']).doUpdateSet({ config_ciphertext: encryptJson(config), updated_at: new Date() })).execute());
}
export async function resolveWorkspaceMailProvider(tenantId: string, provider: string, legacy?: string | null) {
  const kind = provider === 'platform' ? 'cpanel' : provider;
  if (!['cpanel', 'google', 'microsoft'].includes(kind)) return null;
  const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_mail_provider_connections').select('config_ciphertext')
    .where('tenant_id', '=', tenantId).where('kind', '=', kind as MailProviderConfig['kind']).executeTakeFirst());
  const cipher = row?.config_ciphertext ?? legacy;
  return cipher ? mailProviderConfigSchema.parse(decryptJson(cipher)) : null;
}
