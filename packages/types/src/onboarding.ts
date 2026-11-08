// ─── Hudumika Signup / Onboarding Types ───────────────────────

import type { TenantPlan, SafeUser } from './user.js';

export const SIGNUP_BASE_PLAN_CODES: readonly string[] = ['starter-tzs', 'business-tzs', 'scale-tzs'];

export function signupPackageAmount(
  pkg: {
    monthly_price: number | string;
    annual_price: number | string;
    price_flat_monthly: number | string | null;
    price_flat_annual: number | string | null;
  },
  cycle: 'monthly' | 'annual',
): number {
  if (pkg.price_flat_monthly != null || pkg.price_flat_annual != null) {
    const monthly = Number(pkg.price_flat_monthly ?? 0);
    return cycle === 'monthly' ? monthly : Number(pkg.price_flat_annual ?? monthly * 12);
  }
  return Number(cycle === 'monthly' ? pkg.monthly_price : pkg.annual_price);
}

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
  monthly_ai_credits: number;         // platform-billed AI calls/month included in this tier — 0 = none
  byok_ai_allowed: boolean;           // may this tier override the platform AI key with its own?
  currency: string;                    // 'USD' or 'TZS'
  included_seats: number | null;       // flat-price model: users included before overage — null = pure per-seat
  max_locations: number | null;        // max branches/warehouses — null = unlimited
  price_flat_monthly: number | null;   // flat monthly price (vs per-seat) — null = use price_per_seat
  price_flat_annual: number | null;    // flat annual price — null = use price_per_seat annual logic
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
  /** Legacy path — being phased out in favor of ondi_ticket (full SSO
   *  registration). Exactly one of password/ondi_ticket must be set. */
  password?: string;
  /** Proves this account's identity was verified by Ondi (Google/
   *  Microsoft/Apple sign-in with no matching existing account) —
   *  see POST /v1/ondi/auth/{google,microsoft,apple}/verify's
   *  allowSignupTicket response and POST /v1/onboarding/complete's
   *  verification of it. The server derives email/name from the
   *  verified ticket itself, never trusts the client-supplied copies
   *  above for anything but display. */
  ondi_ticket?: string;
}

export interface OnboardingCompanyInput {
  name: string;
  industry?: string;
  industries?: string[];
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
  privacy_acknowledgement: {
    policy_version_id: string;
    acknowledged: true;
    locale: string;
  };
  /** AgencyHost M8 — the referring tenant's slug, from `?ref=` on the signup
   *  URL. Silently ignored if it doesn't match a real, active tenant —
   *  never surfaced as a signup error over a stale/mistyped link. */
  referral_code?: string;
  /** Phase 4 — industry journey selected during signup. Drives which apps
   *  are surfaced first and which activation checkpoints are tracked. */
  onboarding_journey?: string;
  /** Standalone-product signup ("just SEAL, no Hudumika Business"):
   *  commercial_products.product_key values to subscribe to immediately at
   *  signup, alongside package_code: 'workspace-free'. */
  initial_products?: string[];
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

/** Returned by POST /v1/ondi/auth/{google,microsoft,apple}/verify when
 *  called with allowSignupTicket and no existing account or tenant-domain
 *  match was found — a verified-but-not-yet-registered identity, for the
 *  onboarding wizard to carry into brand-new workspace creation (full-SSO
 *  registration, no password). email/name come from the verified OAuth
 *  identity, not anything the client typed. */
export interface FederatedSignupTicket {
  signup_ticket: string;
  email: string;
  name: string;
}

/**
 * Resumable onboarding setup: the non-sensitive subset of OnboardingDraft
 * worth persisting server-side between "verified with Ondi" and "workspace
 * created" — deliberately excludes payment details and the ondi_ticket
 * itself (both too sensitive to persist at rest longer than the request
 * that needs them) and privacy_policy_version_id/privacy_acknowledged
 * (re-resolved/re-acknowledged fresh on resume, never carried over stale).
 */
export interface OnboardingDraftPayload {
  companyName?: string;
  industry?: string;
  industries?: string[];
  country?: string;
  onboarding_journey?: string;
  package_code?: string;
  billing_cycle?: 'monthly' | 'annual';
  initial_products?: string[];
  subdomain?: string;
  timezone?: string;
  currency?: string;
  hq_city?: string;
  hq_country?: string;
}

export interface OnboardingDraftSaveInput {
  ondi_ticket: string;
  step: number;
  draft: OnboardingDraftPayload;
}

export interface OnboardingDraftResumeResponse {
  step: number;
  draft: OnboardingDraftPayload;
}
