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
  monthly_item_limit: number | null;  // billable items/month platform-wide — null = unlimited
  features: string[];
  color: string;
  popular: boolean;
  is_active: boolean;
  sort_order: number;
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

export interface EmailCheckResponse {
  available: boolean;
}
