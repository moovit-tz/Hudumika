import type { PaymentMethod, Package } from '@hudumika/types';

export interface OnboardingJourney {
  industry_key: string;
  label: string;
  description: string | null;
  featured_apps: string[];
  checkpoint_keys: string[];
  recommended_package_code: string | null;
}

export interface OnboardingDraft {
  // Step 1 — Account
  name: string;
  email: string;
  password: string;
  confirm: string;
  // Step 2 — Company
  companyName: string;
  industry: string;
  country: string;
  onboarding_journey: string;
  // Step 3 — Package
  package_code: string;
  billing_cycle: 'monthly' | 'annual';
  // Standalone-product signup ("just SEAL, no Hudumika Business"):
  // commercial_products.product_key values, set alongside
  // package_code: 'workspace-free'. Empty for a normal tier signup.
  initial_products: string[];
  // Step 4 — Domain
  subdomain: string;
  // Step 5 — Payment
  payment: {
    method: PaymentMethod;
    card_number: string;
    card_holder: string;
    card_expiry: string;
    card_cvc: string;
    mobile_number: string;
    mobile_provider: string;
  };
  // Step 6 — Configuration
  timezone: string;
  currency: string;
  hq_city: string;
  hq_country: string;
  privacy_policy_version_id: string;
  privacy_acknowledged: boolean;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '', email: '', password: '', confirm: '',
  companyName: '', industry: '', country: 'Tanzania', onboarding_journey: '',
  package_code: '', billing_cycle: 'monthly', initial_products: [],
  subdomain: '',
  payment: { method: 'card', card_number: '', card_holder: '', card_expiry: '', card_cvc: '', mobile_number: '', mobile_provider: 'M-Pesa' },
  timezone: 'Africa/Dar_es_Salaam', currency: 'TZS', hq_city: '', hq_country: 'Tanzania',
  privacy_policy_version_id: '', privacy_acknowledged: false,
};

export interface StepProps {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  packages: Package[];
  journeys?: OnboardingJourney[];
  submitting?: boolean;
  submitError?: string | null;
  // Auto-join-by-domain (step 1 / StepAccount only) — an alternative to
  // onNext when the email's domain matches an existing tenant's real staff.
  onRequestJoin?: (tenantId: string) => void;
  joinRequestSubmitting?: boolean;
  joinRequestError?: string | null;
  // Whether a real payment gateway is configured (GET /v1/onboarding/payment-status)
  // — StepPayment uses this to decide between the simulated card/mobile form
  // and a hosted-checkout confirmation.
  gatewayConfigured?: boolean;
}

export const STEP_LABELS = ['Account', 'Company', 'Package', 'Domain', 'Payment', 'Configuration'];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
