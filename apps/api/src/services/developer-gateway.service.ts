// ─── apps/api/src/services/developer-gateway.service.ts ─────────
// High-Throughput API Gateway Dispatcher & Execution Engine
// Architecture Decision 2: Dual Gateway (Native, External, Hybrid)
// Architecture Decision 3: Metering, Cost vs Price, and Provider Settlements

import crypto from 'crypto';
import { db } from '../db/client.js';
import type { EnvironmentType } from '@hudumika/types';

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

    // Resolve primary provider
    const providerRow = await db
      .selectFrom('api_operation_providers')
      .innerJoin('api_providers', 'api_providers.id', 'api_operation_providers.provider_id')
      .selectAll('api_operation_providers')
      .select([
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
      const data = await this.executeNativeOperation(operation.operation_id, body, query);
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

  private static async executeNativeOperation(operationId: string, body: any, query: any) {
    switch (operationId) {
      case 'seal.issue':
        return {
          seal_id: `seal_${crypto.randomBytes(12).toString('hex')}`,
          status: 'ISSUED',
          digest_sha256: crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex'),
          algorithm: 'ECDSA_SHA256_P256',
          timestamp: new Date().toISOString(),
          verification_url: `https://hudumika.co/sign/verify/${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        };
      case 'seal.verify':
        return {
          valid: true,
          verdict: 'EXACT_MATCH',
          confidence_score: 1.0,
          issued_at: new Date(Date.now() - 3600000).toISOString(),
          canonical_match: true,
        };
      case 'landed_cost.compute':
        const cif = Number(body?.cif_value || 10000000);
        const duty = cif * 0.25;
        const vat = (cif + duty) * 0.18;
        const rdl = cif * 0.015;
        const port = 450000;
        const total = cif + duty + vat + rdl + port;
        return {
          hs_code: body?.hs_code || '8703.23.90',
          currency: 'TZS',
          cif_value: cif,
          duty_rate_pct: 25,
          import_duty: duty,
          vat_rate_pct: 18,
          vat_amount: vat,
          railway_development_levy: rdl,
          port_and_clearance_charges: port,
          total_landed_cost: total,
          calculated_at: new Date().toISOString(),
        };
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
    // Simulated external upstream call with standardized error normalization
    if (operation.operation_id === 'business.search') {
      const q = (query?.q || body?.q || 'Hudumika').toString();
      return {
        query: q,
        total_results: 1,
        results: [
          {
            registration_number: '148920-TZ',
            legal_name: `${q} East Africa Limited`,
            tin: '109-883-921',
            status: 'ACTIVE_REGISTERED',
            incorporation_date: '2021-04-15',
            business_type: 'PRIVATE_LIMITED_COMPANY',
            registered_office: 'Samora Avenue, Dar es Salaam, Tanzania',
            registry_authority: 'BRELA',
          },
        ],
      };
    }

    if (operation.operation_id === 'business.verify') {
      const regNo = body?.registration_number || '148920-TZ';
      return {
        verified: true,
        registration_number: regNo,
        legal_name: body?.legal_name || 'Verified Enterprise Ltd',
        tin: '109-883-921',
        vat_registered: true,
        status: 'IN_GOOD_STANDING',
        directors: [
          { name: 'John A. Temba', nationality: 'TZ', role: 'Managing Director' },
          { name: 'Sarah K. Mushi', nationality: 'TZ', role: 'Director' },
        ],
        issued_share_capital_tzs: 50000000,
        last_annual_return_date: '2025-12-31',
        verification_hash: crypto.randomBytes(16).toString('hex'),
        verified_at: new Date().toISOString(),
      };
    }

    return {
      success: true,
      provider: provider?.name || 'Upstream Provider',
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
        provider_id: params.provider?.id || null,
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
    if (usageEvent && params.provider?.id && params.result.provider_cost > 0) {
      const grossMargin = params.result.developer_price - params.result.provider_cost;
      await db
        .insertInto('dev_provider_settlements')
        .values({
          usage_event_id: usageEvent.id,
          provider_id: params.provider.id as string,
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
