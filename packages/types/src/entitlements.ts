// ─── Entitlements — package-gated features + per-app maintenance status ──

/**
 * Every feature a package can grant, as a value rather than only a type.
 *
 * This list existed four times over and the copies had drifted apart: the
 * FeatureKey union, BASE_FEATURES in entitlements.routes.ts, APP_META in the
 * settings UI, and the package_features rows. BASE_FEATURES was the one that
 * mattered most and had gone stale — the entitlements endpoint iterated twelve
 * hardcoded keys, so an app missing from *that* array was invisible to the
 * whole frontend no matter what the database granted. Onsite had a key, had
 * grants, and still never appeared anywhere.
 *
 * Declaring the array and deriving the type from it means adding a feature is
 * one edit, and the API cannot report a different set of features than the type
 * describes.
 *
 * Sub-features (tracking.*) sit alongside the apps: they gate the same way and
 * are granted from the same table.
 */
export const ALL_FEATURE_KEYS = [
  'ai',
  'clearos',
  'cloud',
  'complyos',
  'contacts',
  'email',
  'finops',
  'oneid',
  'nexushr',
  'onsite',
  'tracking',
  'tracking.cargo-loading',
  'tracking.warehouse',
  'tracking.analytics',
  'tracking.reports',
  'demurrage',
  'cargotracker',
  // Added by migration 213. These shipped with no feature key at all, and
  // isAppEnabled() treats an unknown key as enabled — so they were permanently
  // on for every tenant, could not be included in or excluded from a plan, and
  // a tenant admin had no way to switch one off. `onesite` was the opposite
  // drift: granted in package_features while nothing declared it.
  //
  // Lens is deliberately absent. It is internal tooling gated on SUPER_ADMIN,
  // not something a plan grants or a tenant admin toggles.
  'seal',
  'inventory',
  'studio',
  'crm',
  'bliss',
  'calendar',
  'tasks',
  'store',
  'onesite',
  'hudubi',
  // Both shipped with real package_features/app_status rows already seeded,
  // but were never added here — the same "onsite/seal/inventory" drift this
  // file's own history above already describes once. Without a key here,
  // GET /v1/entitlements never reports features.petti or features.notes at
  // all, and RequireAppEnabled only blocks on an explicit `=== false` — so
  // `undefined` silently passes and both apps have been rendering for every
  // tenant regardless of plan since they shipped.
  'petti',
  'notes',
  // 'sign' shipped with real package_features/app_status rows and a backend
  // requireEntitlement('sign') gate (sign.routes.ts) but was never added
  // here — same drift as petti/notes above. Without a key here, GET
  // /v1/entitlements never reports features.sign, so RequireAppEnabled
  // (appId='sign') always passes regardless of plan — the frontend gate is
  // silently a no-op even though the backend genuinely enforces it.
  'sign',
  'sms',
] as const;

/** Feature keys correspond 1:1 with the appId strings the API gates on. */
export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

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
