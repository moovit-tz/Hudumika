/**
 * /admin/* — retired. Every SuperAdmin page now lives inside the unified
 * staff console (/console), guarded by staff roles and scope instead of the
 * SUPER_ADMIN account flag alone. This shell only redirects old links and
 * bookmarks to the matching console page (STAFF_TOOLS / STAFF_LEGACY_REDIRECTS
 * in packages/types/src/staff.ts); an unknown /admin path opens the console
 * landing, which resolves the viewer's home.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { consolePathForLegacyAdmin } from '@hudumika/types';

export function SuperAdminShell() {
  const { pathname, search } = useLocation();
  return <Navigate to={consolePathForLegacyAdmin(pathname, search) ?? '/console'} replace />;
}
