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
import { getAppUsageSummary } from '../lib/usage.js';
import { emitDomainEvent } from './domain-events.service.js';

export async function getFinanceCapabilities(tenantId: string): Promise<FinanceCapabilitySummary> {
  const [rows, tenant] = await withTenant(tenantId, trx => Promise.all([
    trx.selectFrom('tenant_finance_capabilities').select(['capability_key', 'enabled']).where('tenant_id', '=', tenantId).execute(),
    trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst(),
  ]));
  const activations = new Map(rows.map(row => [row.capability_key, row.enabled]));

  const capabilities: FinanceCapabilityAccess[] = await Promise.all(FINANCE_CAPABILITIES.map(async definition => {
    const entitled = await tenantHasEntitlement(tenantId, definition.key);
    // Migration 538 backfills every pre-existing grant. A missing row can now
    // safely mean a newly available module that the tenant has not enabled.
    const enabled = definition.status === 'available' && entitled && (!definition.configurable || activations.get(definition.key) === true);
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
    usage: await getAppUsageSummary(tenantId, tenant?.plan ?? '', 'finops'),
  };
}

export async function setFinanceCapability(
  tenantId: string,
  actorId: string,
  capabilityKey: FinanceCapabilityKey,
  enabled: boolean,
): Promise<FinanceCapabilitySummary> {
  const definition = FINANCE_CAPABILITIES.find(item => item.key === capabilityKey);
  if (!definition) throw Object.assign(new Error('Unknown Finance capability.'), { statusCode: 400 });
  if (definition.status !== 'available') throw Object.assign(new Error('This Finance capability is not available for activation yet.'), { statusCode: 409, code: 'CAPABILITY_NOT_AVAILABLE' });
  if (!definition.configurable) throw Object.assign(new Error('This core capability cannot be disabled.'), { statusCode: 400 });
  if (!(await tenantHasEntitlement(tenantId, capabilityKey))) {
    throw Object.assign(new Error('Your current workspace package does not include this Finance capability.'), { statusCode: 403, code: 'PLAN_UPGRADE_REQUIRED' });
  }

  if (enabled) {
    const current = await getFinanceCapabilities(tenantId);
    const missing = definition.dependencies.filter(key => !current.capabilities.find(item => item.key === key)?.enabled);
    if (missing.length) {
      const names = missing.map(key => FINANCE_CAPABILITIES.find(item => item.key === key)?.name ?? key);
      throw Object.assign(new Error(`Enable required capabilities first: ${names.join(', ')}.`), { statusCode: 409, code: 'CAPABILITY_DEPENDENCY_REQUIRED', dependencies: missing });
    }
  } else {
    const current = await getFinanceCapabilities(tenantId);
    const dependents = current.capabilities
      .filter(item => item.enabled && item.dependencies.includes(capabilityKey))
      .map(item => item.key);
    if (dependents.length) {
      const names = dependents.map(key => FINANCE_CAPABILITIES.find(item => item.key === key)?.name ?? key);
      throw Object.assign(new Error(`Disable dependent capabilities first: ${names.join(', ')}.`), {
        statusCode: 409,
        code: 'CAPABILITY_HAS_ENABLED_DEPENDENTS',
        dependencies: dependents,
      });
    }
  }

  await withTenant(tenantId, async trx => {
    const previous = await trx.selectFrom('tenant_finance_capabilities')
      .select('enabled')
      .where('tenant_id', '=', tenantId)
      .where('capability_key', '=', capabilityKey)
      .executeTakeFirst();

    await trx.insertInto('tenant_finance_capabilities').values({
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
    })).execute();

    if (previous?.enabled !== enabled) {
      await emitDomainEvent(trx, tenantId, {
        type: enabled ? 'finance.capability.enabled' : 'finance.capability.disabled',
        sourceApp: 'finops',
        entityType: 'finance_capability',
        entityId: null,
        actorId,
        payload: { capabilityKey, previousEnabled: previous?.enabled ?? null, enabled },
      });
    }
  });

  return getFinanceCapabilities(tenantId);
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
  await withTenant(tenantId, async trx => {
    const previous = await trx.selectFrom('tenant_finance_profiles').select('industries')
      .where('tenant_id', '=', tenantId).executeTakeFirst();
    const previousIndustries = Array.isArray(previous?.industries) ? previous.industries as FinanceIndustryKey[] : [];

    await trx.insertInto('tenant_finance_profiles').values({
      tenant_id: tenantId,
      industries: JSON.stringify(industries),
      updated_by: actorId,
      updated_at: new Date(),
    }).onConflict(oc => oc.column('tenant_id').doUpdateSet({
      industries: JSON.stringify(industries),
      updated_by: actorId,
      updated_at: new Date(),
    })).execute();

    if (JSON.stringify(previousIndustries) !== JSON.stringify(industries)) {
      await emitDomainEvent(trx, tenantId, {
        type: 'finance.industries.updated',
        sourceApp: 'finops',
        entityType: 'finance_configuration',
        entityId: null,
        actorId,
        payload: { previousIndustries, industries },
      });
    }
  });
  return getFinanceConfiguration(tenantId);
}

export async function createFinanceBusinessLine(tenantId: string, actorId: string, input: { name: string; code: string; description?: string | null }): Promise<FinanceConfiguration> {
  await withTenant(tenantId, async trx => {
    const created = await trx.insertInto('finance_business_lines').values({
      tenant_id: tenantId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
    }).returning('id').executeTakeFirstOrThrow();
    await emitDomainEvent(trx, tenantId, {
      type: 'finance.business_line.created',
      sourceApp: 'finops',
      entityType: 'finance_business_line',
      entityId: created.id,
      actorId,
      payload: { name: input.name, code: input.code },
    });
  });
  return getFinanceConfiguration(tenantId);
}

export async function updateFinanceBusinessLine(tenantId: string, actorId: string, id: string, patch: { name?: string; code?: string; description?: string | null; active?: boolean }): Promise<FinanceConfiguration> {
  const updated = await withTenant(tenantId, async trx => {
    const previous = await trx.selectFrom('finance_business_lines').select(['name', 'code', 'description', 'active'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!previous) return undefined;
    const result = await trx.updateTable('finance_business_lines').set({ ...patch, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', id).returning('id').executeTakeFirst();
    if (result) {
      await emitDomainEvent(trx, tenantId, {
        type: patch.active === false ? 'finance.business_line.archived' : 'finance.business_line.updated',
        sourceApp: 'finops',
        entityType: 'finance_business_line',
        entityId: id,
        actorId,
        payload: { previous, changes: patch },
      });
    }
    return result;
  });
  if (!updated) throw Object.assign(new Error('Business line not found.'), { statusCode: 404 });
  return getFinanceConfiguration(tenantId);
}
