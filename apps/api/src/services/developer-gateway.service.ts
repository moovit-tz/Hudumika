// ─── apps/api/src/services/developer-gateway.service.ts ─────────
// High-Throughput API Gateway Dispatcher & Execution Engine
// Architecture Decision 2: Dual Gateway (Native, External, Hybrid)
// Architecture Decision 3: Metering, Cost vs Price, and Provider Settlements

import crypto from 'crypto';
import { db } from '../db/client.js';
import type { EnvironmentType } from '@hudumika/types';
import { searchBrelaLive } from './brela.service.js';
import { computeDuty } from './seal-duty.service.js';

export interface GatewayAuthContext {
  credential_id: string;
  project_id: string;
  developer_account_id: string;
  environment: EnvironmentType;
  allowed_scopes: string[];
}

export interface GatewayExecutionResult {
  status_code: number;
  data: any;
  headers?: Record<string, string>;
  is_billable: boolean;
  billing_unit: string;
  provider_cost: number;
  developer_price: number;
  currency: string;
}

export class DeveloperGatewayService {
  /**
   * 1. Authenticate Request via API Key (SHA-256 hash lookup)
   */
  static async authenticateRequest(rawApiKey: string): Promise<GatewayAuthContext> {
    if (!rawApiKey || !rawApiKey.startsWith('ak_')) {
      throw new Error('Invalid API key format. Expected ak_live_... or ak_test_...');
    }

    const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    const cred = await db
      .selectFrom('dev_credentials')
      .innerJoin('dev_projects', 'dev_projects.id', 'dev_credentials.project_id')
      .select([
        'dev_credentials.id as credential_id',
        'dev_credentials.project_id',
        'dev_credentials.environment',
        'dev_credentials.scopes',
        'dev_credentials.expires_at',
        'dev_credentials.revoked_at',
        'dev_projects.developer_account_id',
        'dev_projects.status as project_status',
      ])
      .where('dev_credentials.key_hash', '=', keyHash)
      .executeTakeFirst();

    if (!cred) {
      throw new Error('Invalid API key.');
    }

    if (cred.revoked_at) {
      throw new Error('This API key has been revoked.');
    }

    if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
      throw new Error('This API key has expired.');
    }

    if (cred.project_status !== 'active') {
      throw new Error('The parent project is currently disabled or suspended.');
    }

    // Touch last_used_at in background
    db.updateTable('dev_credentials')
      .set({ last_used_at: new Date() })
      .where('id', '=', cred.credential_id)
      .execute()
      .catch(() => {});

    return {
      credential_id: cred.credential_id,
      project_id: cred.project_id,
      developer_account_id: cred.developer_account_id,
      environment: cred.environment as EnvironmentType,
      allowed_scopes: (cred.scopes as any) || ['*'],
    };
  }

  /**
   * 2. Resolve Operation & Upstream Provider from HTTP Method + Path Pattern
   */
  static async resolveOperation(httpMethod: string, path: string) {
    const method = httpMethod.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    // Query operations
    const ops = await db
      .selectFrom('api_operations')
      .innerJoin('api_products', 'api_products.id', 'api_operations.api_product_id')
      .selectAll('api_operations')
      .select([
        'api_products.code as product_code',
        'api_products.name as product_name',
        'api_products.status as product_status',
      ])
      .where('api_operations.http_method', '=', method)
      .execute();

    // Match exact or prefix path
    const matched = ops.find(o => path.startsWith(o.path_pattern));
    if (!matched) {
      return null;
    }

    // Resolve primary provider. `selectAll('api_operation_providers')` pulls
    // in that join table's OWN primary key as `.id` — a distinct row from
    // the real provider — alongside its real FK, `.provider_id`. Every
    // caller downstream that wants "the provider's id" (recordUsage's own
    // dev_usage_events/dev_provider_settlements inserts) must read
    // `.provider_id`, never `.id`, or it foreign-keys against the wrong
    // table (HUD-0117: live-reproduced as a real, silently-swallowed
    // `dev_usage_events_provider_id_fkey` violation on every gateway call).
    const providerRow = await db
      .selectFrom('api_operation_providers')
      .innerJoin('api_providers', 'api_providers.id', 'api_operation_providers.provider_id')
      .selectAll('api_operation_providers')
      .select([
        'api_providers.name as provider_name',
        'api_providers.code as provider_code',
        'api_providers.adapter_type',
        'api_providers.base_url as provider_base_url',
      ])
      .where('api_operation_providers.operation_id', '=', matched.id)
      .where('api_operation_providers.is_primary', '=', true)
      .executeTakeFirst();

    // Resolve active pricing
    const defaultPlan = await db
      .selectFrom('api_pricing_plans')
      .selectAll()
      .where('api_product_id', '=', matched.api_product_id)
      .where('status', '=', 'ACTIVE')
      .orderBy('monthly_base_fee', 'asc')
      .executeTakeFirst();

    return {
      operation: matched,
      provider: providerRow || null,
      pricing: defaultPlan || null,
    };
  }

  /**
   * 3. Check Active Entitlement for Project + Environment
   */
  static async checkEntitlement(projectId: string, environment: EnvironmentType, apiProductId: string) {
    const entitlement = await db
      .selectFrom('api_entitlements')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('environment', '=', environment)
      .where('api_product_id', '=', apiProductId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();

    // For Development and Sandbox, allow automatic sandbox access if not explicitly restricted
    if (!entitlement && environment !== 'PRODUCTION') {
      return {
        is_entitled: true,
        rate_limit_per_min: 120,
        monthly_quota: 1000,
        is_sandbox_fallback: true,
      };
    }

    return {
      is_entitled: !!entitlement,
      rate_limit_per_min: entitlement?.rate_limit_per_min || 60,
      monthly_quota: entitlement?.monthly_quota || null,
      is_sandbox_fallback: false,
    };
  }

  /**
   * 4. Execute Route via internal adapter or native handler
   */
  static async executeRoute(
    operation: any,
    provider: any,
    body: any,
    query: any,
    authContext: GatewayAuthContext
  ): Promise<GatewayExecutionResult> {
    const startTime = Date.now();

    // Native vs External execution logic
    if (operation.execution_mode === 'NATIVE' || provider?.adapter_type === 'HudumikaInternal') {
      // Execute Hudumika internal logic based on operation_id
      const data = await this.executeNativeOperation(operation.operation_id, body, query, authContext);
      return {
        status_code: 200,
        data,
        is_billable: true,
        billing_unit: operation.billing_unit,
        provider_cost: 0.0,
        developer_price: 500.0,
        currency: 'TZS',
      };
    } else {
      // External adapter logic (Provider credentials remain completely hidden)
      const data = await this.executeExternalAdapter(provider, operation, body, query);
      const unitCost = Number(provider?.provider_unit_cost || 150.0);
      return {
        status_code: 200,
        data,
        is_billable: true,
        billing_unit: operation.billing_unit,
        provider_cost: unitCost,
        developer_price: unitCost > 0 ? unitCost + 200.0 : 500.0,
        currency: 'TZS',
      };
    }
  }

  private static async executeNativeOperation(operationId: string, body: any, query: any, authContext: GatewayAuthContext) {
    switch (operationId) {
      case 'seal.issue': {
        // Real persistence (migration 487, HUD-0117) — this used to hand
        // back a random id backed by nothing, so 'seal.verify' had no real
        // ledger to check against and always said yes. The digest is real
        // (a genuine SHA-256 of the submitted manifest); there is no real
        // asymmetric keypair infrastructure behind this product, so it no
        // longer claims a fabricated 'ECDSA_SHA256_P256' signature scheme,
        // and there is no real public verify page yet, so no verification
        // URL is returned rather than one that would lead nowhere.
        const sealId = `seal_${crypto.randomBytes(12).toString('hex')}`;
        const digest = crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
        await db.insertInto('dev_issued_seals').values({
          seal_id: sealId,
          developer_account_id: authContext.developer_account_id,
          project_id: authContext.project_id,
          digest_sha256: digest,
        }).execute();
        return {
          seal_id: sealId,
          status: 'ISSUED',
          digest_sha256: digest,
          issued_at: new Date().toISOString(),
        };
      }
      case 'seal.verify': {
        // Real lookup against what 'seal.issue' actually persisted, instead
        // of an unconditional valid:true for any input.
        const sealId = (body?.seal_id || '').toString().trim();
        const providedDigest = (body?.digest || '').toString().trim().toLowerCase();
        if (!sealId) {
          return { valid: false, verdict: 'MISSING_SEAL_ID' };
        }
        const seal = await db.selectFrom('dev_issued_seals').select(['digest_sha256', 'issued_at'])
          .where('seal_id', '=', sealId).executeTakeFirst();
        if (!seal) {
          return { valid: false, verdict: 'NOT_FOUND' };
        }
        const matches = !!providedDigest && seal.digest_sha256 === providedDigest;
        return {
          valid: matches,
          verdict: matches ? 'EXACT_MATCH' : 'DIGEST_MISMATCH',
          issued_at: new Date(seal.issued_at).toISOString(),
        };
      }
      case 'landed_cost.compute': {
        // Real engine (HUD-0117) — the same HS-code-driven EAC CET
        // computation ClearOS's own landed-cost pages and SEAL's bonded-
        // warehouse duty engine already use (seal-duty.service.ts,
        // hand-verified to the shilling this same audit arc), in place of
        // this operation's previous hardcoded 25%/18% assumption that
        // ignored the HS code and country of origin entirely. `cif_value`
        // is treated as already being the full CIF in the declared
        // currency (fxRate 1, no separate freight/insurance breakdown) —
        // the only input shape this product ever documented.
        const hsCode = (body?.hs_code || '').toString().trim();
        if (!hsCode) {
          throw Object.assign(new Error('hs_code is required to compute a real landed cost.'), { statusCode: 400 });
        }
        const cifValue = Number(body?.cif_value);
        if (!Number.isFinite(cifValue) || cifValue <= 0) {
          throw Object.assign(new Error('cif_value must be a positive number.'), { statusCode: 400 });
        }
        const result = await computeDuty({ hsCode, invoiceValue: cifValue, currency: 'TZS', fxRate: 1 });
        return {
          hs_code: result.hsCode,
          hs_code_description: result.hsCodeDescription,
          currency: result.currency,
          cif_value: result.cifValueLocal,
          line_items: result.lineItems.map(li => ({ code: li.code, label: li.label, rate_pct: li.ratePct, base: li.base, amount: li.amount })),
          total_duty: result.totalDuty,
          total_tax: result.totalTax,
          total_landed_cost: result.cifValueLocal + result.totalPayableLocal,
          calculated_at: result.computedAt,
        };
      }
      default:
        return {
          success: true,
          operation: operationId,
          timestamp: new Date().toISOString(),
          response: body || {},
        };
    }
  }

  private static async executeExternalAdapter(provider: any, operation: any, body: any, query: any) {
    // Real live lookups against BRELA's own public ORS search portal
    // (services/brela.service.ts — the same scraper ComplyOS's own
    // /brela-search route uses, extracted so there's one real
    // implementation instead of a second, fabricated one — HUD-0117).
    // BRELA's public search returns only reg number/name/address/status/
    // type/incorporation date — never a TIN, director list, share capital,
    // or VAT registration, so a caller asking this product to confirm any
    // of those gets an honest `null` and an explanatory note instead of an
    // invented value. `live: false` means the portal genuinely could not be
    // reached this call (it sits behind a WAF that blocks most non-browser
    // traffic) — never silently swapped for fabricated data.
    if (operation.operation_id === 'business.search') {
      const q = (query?.q || body?.q || '').toString().trim();
      const { live, results } = await searchBrelaLive('Company', undefined, q || undefined);
      return {
        query: q || null,
        live,
        total_results: results.length,
        results: results.map(r => ({
          registration_number: r.reg_number,
          legal_name: r.name,
          status: r.status,
          incorporation_date: r.incorporation_date,
          business_type: r.type,
          registered_office: r.registered_office,
          registry_authority: 'BRELA',
        })),
        ...(live ? {} : { note: 'The BRELA public registry portal could not be reached for this request — no results to report. This is not evidence the business does not exist.' }),
      };
    }

    if (operation.operation_id === 'business.verify') {
      const regNo = (body?.registration_number || '').toString().trim();
      const legalName = (body?.legal_name || '').toString().trim();
      const { live, results } = await searchBrelaLive('Company', regNo || undefined, legalName || undefined);
      const match = regNo
        ? results.find(r => r.reg_number.replace(/\s/g, '').toLowerCase() === regNo.replace(/\s/g, '').toLowerCase())
        : results[0];

      if (!live) {
        return {
          verified: false,
          registration_number: regNo || null,
          reason: 'The BRELA public registry portal could not be reached for this request — verification is inconclusive, not a confirmed negative.',
          verified_at: new Date().toISOString(),
        };
      }
      if (!match) {
        return {
          verified: false,
          registration_number: regNo || null,
          reason: 'No matching registration was found in BRELA\'s public registry for the details given.',
          verified_at: new Date().toISOString(),
        };
      }
      return {
        verified: true,
        registration_number: match.reg_number,
        legal_name: match.name,
        status: match.status,
        incorporation_date: match.incorporation_date,
        business_type: match.type,
        registered_office: match.registered_office,
        // BRELA's public search never exposes these — reported as
        // genuinely unavailable rather than invented, unlike this
        // operation's previous hardcoded response.
        tin: null,
        vat_registered: null,
        directors: null,
        issued_share_capital_tzs: null,
        note: 'TIN, VAT registration, directors, and share capital are not available from BRELA\'s public registry search and are not reported by this product.',
        verified_at: new Date().toISOString(),
      };
    }

    return {
      success: true,
      provider: provider?.provider_name || 'Upstream Provider',
      data: body || {},
    };
  }

  /**
   * 5. Record Metered Usage Event and Financial Ledger Entry
   */
  static async recordUsage(params: {
    requestId: string;
    authContext: GatewayAuthContext;
    operation: any;
    provider: any;
    result: GatewayExecutionResult;
    durationMs: number;
    ipAddress?: string;
  }) {
    const eventId = `ue_${crypto.randomBytes(16).toString('hex')}`;

    // Insert canonical usage event
    const [usageEvent] = await db
      .insertInto('dev_usage_events')
      .values({
        event_id: eventId,
        request_id: params.requestId,
        developer_account_id: params.authContext.developer_account_id,
        project_id: params.authContext.project_id,
        environment: params.authContext.environment,
        api_product_id: params.operation.api_product_id,
        api_version_id: params.operation.api_version_id,
        operation_id: params.operation.id,
        credential_id: params.authContext.credential_id,
        provider_id: params.provider?.provider_id || null,
        billing_unit: params.result.billing_unit,
        quantity: 1,
        is_billable: params.result.is_billable,
        provider_unit_cost: params.result.provider_cost,
        developer_unit_price: params.result.developer_price,
        currency: params.result.currency,
        status_code: params.result.status_code,
        is_success: params.result.status_code >= 200 && params.result.status_code < 400,
      })
      .returningAll()
      .execute();

    // If external provider, record settlement ledger
    if (usageEvent && params.provider?.provider_id && params.result.provider_cost > 0) {
      const grossMargin = params.result.developer_price - params.result.provider_cost;
      await db
        .insertInto('dev_provider_settlements')
        .values({
          usage_event_id: usageEvent.id,
          provider_id: params.provider.provider_id as string,
          developer_account_id: params.authContext.developer_account_id,
          units: 1,
          provider_cost: params.result.provider_cost,
          developer_price: params.result.developer_price,
          gross_platform_revenue: grossMargin,
          currency: params.result.currency,
          is_settled: false,
        })
        .execute();
    }
  }
}
