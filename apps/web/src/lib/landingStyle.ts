import type { SafeUser } from '@hudumika/types';

export type LandingStyle = 'advanced' | 'basic';

export const LANDING_STYLE_EVENT = 'hudumika-landing-style-updated';

/** A user's own choice (users.profile.landing_style, PATCH /auth/me) always
 *  wins; otherwise the tenant's own default (tenant_settings.landingStyle,
 *  Settings > Landing Experience), surfaced on `user.tenant.landing_style`
 *  by GET /v1/identity/me. Same precedence rule as tenantLocale.ts's
 *  personal-choice-beats-tenant-default pattern, different storage. */
export function resolveLandingStyle(user: SafeUser | null | undefined): LandingStyle {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('landing_style');
    if (local === 'basic' || local === 'advanced') return local;
  }
  const own = (user?.profile as any)?.landing_style;
  if (own === 'basic' || own === 'advanced') return own;
  const tenantDefault = (user as any)?.tenant?.landing_style;
  return tenantDefault === 'basic' ? 'basic' : 'advanced';
}
