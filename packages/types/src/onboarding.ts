// ─── Hudumika Signup / Onboarding Types ───────────────────────

import type { TenantPlan, SafeUser } from './user.js';

export interface Package {
  id: string;
  code: TenantPlan;
  name: string;
  monthly_price: number;
  annual_price: number;
  max_users: number;
  price_per_seat: number | null;      // USD/user/month — null only for custom-pricing tiers
  extra_seat_price: number | null;     // USD/user/month for seats past extra_seat_threshold — null = no discount tier
  extra_seat_threshold: number | null; // seat count the discounted extra_seat_price kicks in after — null = no discount tier
  monthly_item_limit: number | null;  // billable items/month platform-wide — null = unlimited
  storage_limit_bytes: number | null; // Cloud storage quota — null = unlimited
  features: string[];
  color: string;
  popular: boolean;
  is_active: boolean;
  sort_order: number;
}

/** Purchasable independent of which base Package a tenant is on (376_package_addons.sql)
 *  — Onsite's real home, instead of being a fourth competing base package. */
export interface Addon {
  id: string;
  code: string;
  name: string;
  description: string;
  featureKey: string;
  monthlyPrice: number;
  annualPrice: number;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Real count of tenants currently holding this add-on — active tenant_addons
   *  rows, not a fabricated number. */
  activeCompanies?: number;
  /** Does the requesting user's own tenant currently hold this add-on? Set on
   *  every GET /v1/addons response (SuperAdmin and tenant callers alike). */
  purchased?: boolean;
}

export type PaymentMethod = 'card' | 'mpesa';

export interface OnboardingAccountInput {
  name: string;
  email: string;
  password: string;
}

export interface OnboardingCompanyInput {
  name: string;
  industry?: string;
  country?: string;
}

export interface OnboardingPaymentInput {
  method: PaymentMethod;
  card_number?: string;
  card_holder?: string;
  card_expiry?: string;
  card_cvc?: string;
  mobile_number?: string;
  mobile_provider?: string;
}

export interface OnboardingConfigurationInput {
  timezone: string;
  currency: string;
  hq_city?: string;
  hq_country?: string;
}

export interface OnboardingCompleteInput {
  account: OnboardingAccountInput;
  company: OnboardingCompanyInput;
  package_code: string;
  billing_cycle: 'monthly' | 'annual';
  subdomain: string;
  payment: OnboardingPaymentInput;
  configuration: OnboardingConfigurationInput;
  /** AgencyHost M8 — the referring tenant's slug, from `?ref=` on the signup
   *  URL. Silently ignored if it doesn't match a real, active tenant —
   *  never surfaced as a signup error over a stale/mistyped link. */
  referral_code?: string;
}

export interface OnboardingCompleteResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SafeUser;
  tenant: { id: string; name: string; slug: string; subdomain: string; plan: TenantPlan };
}

export interface SubdomainCheckResponse {
  available: boolean;
  reason?: string;
}

/**
 * Well-known free consumer email providers — shared between StepAccount.tsx
 * (the "this looks like a personal address" warning) and
 * onboarding.service.ts (auto-join-by-domain matching, which must never
 * treat gmail.com/outlook.com/etc as if they identified one company).
 * A plain array, not a Set, so it survives JSON/type-only import boundaries
 * identically on both sides — each caller builds its own Set from it.
 */
export const PERSONAL_EMAIL_DOMAINS: string[] = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'mail.com', 'yandex.com',
];

/** An existing, active tenant whose staff already use the same (non-personal)
 *  email domain as the address just typed into step 1 — the auto-join-by-
 *  domain candidate. */
export interface MatchedTenant {
  id: string;
  name: string;
  subdomain: string;
}

export interface EmailCheckResponse {
  available: boolean;
  /** Present only when `available` is true and the domain matches an
   *  existing tenant's real staff — the "request to join" prompt reads this. */
  matched_tenant?: MatchedTenant | null;
}

/** POST /v1/onboarding/request-join — bypasses company/package/domain/
 *  payment/configuration entirely; the requester is joining a workspace
 *  that's already been through all of that, not creating a new one. */
export interface JoinRequestInput {
  name: string;
  email: string;
  password: string;
  /** The tenant the requester believes they're joining, from the
   *  check-email response — the backend independently re-derives the match
   *  from the email's own domain and only ever acts on its own answer. */
  tenant_id: string;
}

export interface JoinRequestSubmitResponse {
  success: true;
  tenant_name: string;
}
