// ─── Entitlements — package-gated features + per-app maintenance status ──

/** Feature keys correspond 1:1 with the appId strings requireAppEnabled()
 *  already gates in apps/api/src/routes/*.ts, plus a few finer-grained
 *  sub-features previously only checked by requirePlanTier(). */
export type FeatureKey =
  | 'ai'
  | 'clearos'
  | 'cloud'
  | 'complyos'
  | 'contacts'
  | 'email'
  | 'finops'
  | 'oneid'
  | 'nexushr'
  | 'onsite'
  | 'tracking'
  | 'tracking.cargo-loading'
  | 'tracking.warehouse'
  | 'tracking.analytics'
  | 'tracking.reports'
  | 'demurrage'
  | 'cargotracker';

export interface PackageFeature {
  package_code: string;
  feature_key: FeatureKey;
}

export type AppStatusValue = 'active' | 'maintenance';

export interface AppStatus {
  app_id: FeatureKey;
  status: AppStatusValue;
  message: string | null;
  updated_by: string | null;
  updated_at: string;
}

/** What GET /v1/entitlements returns to the frontend for the current tenant. */
export interface TenantEntitlements {
  features: Record<string, boolean>;
  appStatus: Record<string, AppStatusValue>;
}
