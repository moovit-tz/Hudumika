import {
  FINANCE_CAPABILITIES,
  FINANCE_INDUSTRIES,
  type FinanceBusinessLine,
  type FinanceCapabilityAccess,
  type FinanceCapabilityKey,
  type FinanceCapabilitySummary,
  type FinanceConfiguration,
  type FinanceIndustryKey,
} from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';

export async function getFinanceCapabilities(tenantId: string, superAdmin = false): Promise<FinanceCapabilitySummary> {
  const rows = await withTenant(tenantId, trx => trx.selectFrom('tenant_finance_capabilities')
    .select(['capability_key', 'enabled'])
    .where('tenant_id', '=', tenantId)
    .execute());
  const activations = new Map(rows.map(row => [row.capability_key, row.enabled]));

  const capabilities: FinanceCapabilityAccess[] = await Promise.all(FINANCE_CAPABILITIES.map(async definition => {
    const entitled = superAdmin || await tenantHasEntitlement(tenantId, definition.key);
    // No row means the capability pre-dates activation controls. Keeping it on
    // preserves existing tenant workflows; an explicit false is the opt-out.
    const enabled = entitled && (!definition.configurable || activations.get(definition.key) !== false);
    return {
      ...definition,
      entitled,
      enabled,
      state: !entitled ? 'not_entitled' : enabled ? 'enabled' : 'available',
    };
  }));

  return {
    edition: capabilities.some(item => item.edition === 'advanced' && item.entitled) ? 'advanced' : 'basic',
    capabilities,
  };
}

export async function setFinanceCapability(
  tenantId: string,
  actorId: string,
  capabilityKey: FinanceCapabilityKey,
  enabled: boolean,
  superAdmin = false,
): Promise<FinanceCapabilitySummary> {
  const definition = FINANCE_CAPABILITIES.find(item => item.key === capabilityKey);
  if (!definition) throw Object.assign(new Error('Unknown Finance capability.'), { statusCode: 400 });
  if (!definition.configurable) throw Object.assign(new Error('This core capability cannot be disabled.'), { statusCode: 400 });
  if (!superAdmin && !(await tenantHasEntitlement(tenantId, capabilityKey))) {
    throw Object.assign(new Error('Your current workspace package does not include this Finance capability.'), { statusCode: 403, code: 'PLAN_UPGRADE_REQUIRED' });
  }

  if (enabled) {
    const current = await getFinanceCapabilities(tenantId, superAdmin);
    const missing = definition.dependencies.filter(key => !current.capabilities.find(item => item.key === key)?.enabled);
    if (missing.length) {
      const names = missing.map(key => FINANCE_CAPABILITIES.find(item => item.key === key)?.name ?? key);
      throw Object.assign(new Error(`Enable required capabilities first: ${names.join(', ')}.`), { statusCode: 409, code: 'CAPABILITY_DEPENDENCY_REQUIRED', dependencies: missing });
    }
  }

  await withTenant(tenantId, trx => trx.insertInto('tenant_finance_capabilities').values({
    tenant_id: tenantId,
    capability_key: capabilityKey,
    enabled,
    enabled_by: actorId,
    enabled_at: enabled ? new Date() : null,
    updated_at: new Date(),
  }).onConflict(oc => oc.columns(['tenant_id', 'capability_key']).doUpdateSet({
    enabled,
    enabled_by: actorId,
    enabled_at: enabled ? new Date() : null,
    updated_at: new Date(),
  })).execute());

  return getFinanceCapabilities(tenantId, superAdmin);
}

export async function tenantHasEnabledFinanceCapability(tenantId: string, key: FinanceCapabilityKey): Promise<boolean> {
  const summary = await getFinanceCapabilities(tenantId);
  return summary.capabilities.some(item => item.key === key && item.enabled);
}

function mapBusinessLine(row: any): FinanceBusinessLine {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function getFinanceConfiguration(tenantId: string): Promise<FinanceConfiguration> {
  const [profile, lines] = await withTenant(tenantId, trx => Promise.all([
    trx.selectFrom('tenant_finance_profiles').select('industries').where('tenant_id', '=', tenantId).executeTakeFirst(),
    trx.selectFrom('finance_business_lines').selectAll().where('tenant_id', '=', tenantId).orderBy('active', 'desc').orderBy('name').execute(),
  ]));
  const industries = Array.isArray(profile?.industries) ? profile.industries as FinanceIndustryKey[] : [];
  return { industries, industryDefinitions: [...FINANCE_INDUSTRIES], businessLines: lines.map(mapBusinessLine) };
}

export async function setFinanceIndustries(tenantId: string, actorId: string, industries: FinanceIndustryKey[]): Promise<FinanceConfiguration> {
  await withTenant(tenantId, trx => trx.insertInto('tenant_finance_profiles').values({
    tenant_id: tenantId,
    industries: JSON.stringify(industries),
    updated_by: actorId,
    updated_at: new Date(),
  }).onConflict(oc => oc.column('tenant_id').doUpdateSet({
    industries: JSON.stringify(industries),
    updated_by: actorId,
    updated_at: new Date(),
  })).execute());
  return getFinanceConfiguration(tenantId);
}

export async function createFinanceBusinessLine(tenantId: string, input: { name: string; code: string; description?: string | null }): Promise<FinanceConfiguration> {
  await withTenant(tenantId, trx => trx.insertInto('finance_business_lines').values({
    tenant_id: tenantId,
    name: input.name,
    code: input.code,
    description: input.description ?? null,
  }).execute());
  return getFinanceConfiguration(tenantId);
}

export async function updateFinanceBusinessLine(tenantId: string, id: string, patch: { name?: string; code?: string; description?: string | null; active?: boolean }): Promise<FinanceConfiguration> {
  const updated = await withTenant(tenantId, trx => trx.updateTable('finance_business_lines').set({ ...patch, updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', id).returning('id').executeTakeFirst());
  if (!updated) throw Object.assign(new Error('Business line not found.'), { statusCode: 404 });
  return getFinanceConfiguration(tenantId);
}
