import { withTenant, dbPlatform } from '../db/client.js';
import * as EsbService from '../services/esb.service.js';

/**
 * Provider metering — the bridge between external service calls and the ESB.
 *
 * For each metered service call:
 *   1. getServiceConfig() checks if ESB metering is enabled for this tenant+service
 *   2. getRate() looks up the TZS rate (tenant override > provider_rates default)
 *   3. meterBefore() reserves funds from ESB before the provider call
 *   4. meterAfter() captures actual charge or releases on failure
 *
 * This replaces the flat AI credit debit for tenants on ESB-metered plans,
 * while preserving the existing credit model for legacy tenants.
 */

export interface ServiceConfig {
  serviceKind: string;
  credentialOwner: 'tenant' | 'platform' | 'hybrid';
  esbMetered: boolean;
  isEnabled: boolean;
  rateOverride: number | null;
}

export async function getServiceConfig(tenantId: string, serviceKind: string): Promise<ServiceConfig> {
  const row = await withTenant(tenantId, trx =>
    trx.selectFrom('tenant_service_config')
      .select(['credential_owner', 'esb_metered', 'is_enabled', 'rate_override'])
      .where('tenant_id', '=', tenantId)
      .where('service_kind', '=', serviceKind)
      .executeTakeFirst()
  );

  if (row) {
    return {
      serviceKind,
      credentialOwner: row.credential_owner,
      esbMetered: row.esb_metered,
      isEnabled: row.is_enabled,
      rateOverride: row.rate_override != null ? Number(row.rate_override) : null,
    };
  }

  // No explicit config — fall back to package defaults
  const tenantPlan = await withTenant(tenantId, trx =>
    trx.selectFrom('tenants')
      .innerJoin('packages', 'packages.code', 'tenants.plan')
      .select(['packages.esb_metered_default', 'packages.byok_ai_allowed'])
      .where('tenants.id', '=', tenantId)
      .executeTakeFirst()
  );

  return {
    serviceKind,
    credentialOwner: serviceKind === 'sms' ? 'tenant' : 'platform',
    esbMetered: tenantPlan?.esb_metered_default ?? false,
    isEnabled: true,
    rateOverride: null,
  };
}

export interface ProviderRate {
  rateTzs: number;
  unitLabel: string;
  supplierRate: number | null;
  supplierCurrency: string | null;
}

export async function getRate(serviceKind: string, provider: string): Promise<ProviderRate | null> {
  const row = await dbPlatform.selectFrom('provider_rates')
    .select(['rate_tzs', 'unit_label', 'supplier_rate', 'supplier_currency'])
    .where('service_kind', '=', serviceKind)
    .where('provider', '=', provider)
    .where('is_active', '=', true)
    .orderBy('effective_from', 'desc')
    .executeTakeFirst();

  if (!row) return null;
  return {
    rateTzs: Number(row.rate_tzs),
    unitLabel: row.unit_label,
    supplierRate: row.supplier_rate != null ? Number(row.supplier_rate) : null,
    supplierCurrency: row.supplier_currency,
  };
}

/**
 * Pre-call metering: reserve funds from the ESB before making a provider call.
 * Returns the operation ID needed for capture/release, or null if not metered
 * or if metering is bypassed (BYOK, legacy credits, etc.).
 */
export interface MeterBeforeResult {
  metered: boolean;
  operationId?: string;
  error?: string;
  code?: 'INSUFFICIENT_FUNDS' | 'NOT_METERED' | 'RATE_NOT_FOUND' | 'DISABLED';
}

export async function meterBefore(opts: {
  tenantId: string;
  serviceKind: string;
  provider: string;
  units?: number;
  billedToPlatform: boolean;
  initiatedBy?: string;
  sourceApp?: string;
  sourceRef?: string;
  providerDetail?: Record<string, unknown>;
}): Promise<MeterBeforeResult> {
  // If tenant is using their own key, no ESB charge
  if (!opts.billedToPlatform) {
    return { metered: false, code: 'NOT_METERED' };
  }

  const config = await getServiceConfig(opts.tenantId, opts.serviceKind);

  if (!config.isEnabled) {
    return { metered: false, error: `${opts.serviceKind} is disabled for this workspace`, code: 'DISABLED' };
  }

  if (!config.esbMetered) {
    return { metered: false, code: 'NOT_METERED' };
  }

  // Look up rate: tenant override > platform default
  let rateTzs: number;
  let supplierRate: number | null = null;
  let supplierCurrency: string | null = null;

  if (config.rateOverride != null) {
    rateTzs = config.rateOverride;
  } else {
    const rate = await getRate(opts.serviceKind, opts.provider);
    if (!rate) return { metered: false, error: `No rate configured for ${opts.serviceKind}/${opts.provider}`, code: 'RATE_NOT_FOUND' };
    rateTzs = rate.rateTzs;
    supplierRate = rate.supplierRate;
    supplierCurrency = rate.supplierCurrency;
  }

  const units = opts.units ?? 1;
  const quotedAmount = rateTzs * units;

  const result = await EsbService.reserve({
    tenantId: opts.tenantId,
    serviceKind: opts.serviceKind,
    quotedAmount,
    providerDetail: {
      provider: opts.provider,
      units,
      rate_tzs: rateTzs,
      supplier_rate: supplierRate,
      supplier_currency: supplierCurrency,
      ...opts.providerDetail,
    },
    initiatedBy: opts.initiatedBy,
    sourceApp: opts.sourceApp,
    sourceRef: opts.sourceRef,
  });

  if (!result.success) {
    return { metered: true, error: result.error, code: result.code as MeterBeforeResult['code'] };
  }

  return { metered: true, operationId: result.operationId };
}

/**
 * Post-call metering: capture actual charge or release on failure.
 */
export async function meterAfter(opts: {
  tenantId: string;
  operationId: string;
  success: boolean;
  actualUnits?: number;
  actualAmount?: number;
  supplierAmount?: number;
  supplierCurrency?: string;
  serviceRef?: string;
  providerDetail?: Record<string, unknown>;
  failureReason?: string;
}): Promise<void> {
  if (!opts.operationId) return;

  if (opts.success) {
    await EsbService.capture({
      tenantId: opts.tenantId,
      operationId: opts.operationId,
      actualAmount: opts.actualAmount ?? 0,
      supplierAmount: opts.supplierAmount,
      supplierCurrency: opts.supplierCurrency,
      serviceRef: opts.serviceRef,
      providerDetail: opts.providerDetail,
    });
  } else {
    await EsbService.releaseReservation(
      opts.tenantId,
      opts.operationId,
      opts.failureReason ?? 'Provider call failed',
    );
  }
}

/**
 * Convenience: check if a tenant has sufficient ESB balance for a service call,
 * without actually reserving. Used for pre-flight UI checks.
 */
export async function canAffordCall(tenantId: string, serviceKind: string, provider: string, units = 1): Promise<{
  canAfford: boolean; estimatedCost: number; available: number; currency: string;
}> {
  const config = await getServiceConfig(tenantId, serviceKind);
  if (!config.esbMetered) {
    return { canAfford: true, estimatedCost: 0, available: 0, currency: 'TZS' };
  }

  let rateTzs: number;
  if (config.rateOverride != null) {
    rateTzs = config.rateOverride;
  } else {
    const rate = await getRate(serviceKind, provider);
    if (!rate) return { canAfford: true, estimatedCost: 0, available: 0, currency: 'TZS' };
    rateTzs = rate.rateTzs;
  }

  const estimatedCost = rateTzs * units;
  const balance = await EsbService.getBalance(tenantId);

  return {
    canAfford: balance.available >= estimatedCost,
    estimatedCost,
    available: balance.available,
    currency: 'TZS',
  };
}
