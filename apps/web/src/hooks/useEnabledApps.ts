import { useState, useEffect } from 'react';
import { useEntitlements, resetEntitlementsCache } from './useEntitlements.js';

/** Apps default to enabled — a tenant only loses one once a SuperAdmin explicitly disables it,
 *  its package doesn't include it, or it's under maintenance (see useEntitlements/entitlement.ts). */
export function isAppEnabled(appId: string, enabledApps: Record<string, boolean> | null): boolean {
  if (!enabledApps) return true; // still loading — don't flash a redirect before we know
  return enabledApps[appId] !== false;
}

/** Returns null while loading, then the tenant's feature map (cached across the SPA session).
 *  Thin compatibility wrapper over useEntitlements() for call sites that only need the boolean map. */
export function useEnabledApps(): Record<string, boolean> | null {
  const entitlements = useEntitlements();
  return entitlements ? entitlements.features : null;
}

/** Call on login/logout/impersonate so the next tenant's session doesn't see a stale cache. */
export function resetEnabledAppsCache(): void {
  resetEntitlementsCache();
}
