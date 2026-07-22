import type { PaymentMethod, Package } from '@hudumika/types';

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
  // Step 3 — Package
  package_code: string;
  billing_cycle: 'monthly' | 'annual';
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
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '', email: '', password: '', confirm: '',
  companyName: '', industry: '', country: 'Tanzania',
  package_code: '', billing_cycle: 'monthly',
  subdomain: '',
  payment: { method: 'card', card_number: '', card_holder: '', card_expiry: '', card_cvc: '', mobile_number: '', mobile_provider: 'M-Pesa' },
  timezone: 'Africa/Dar_es_Salaam', currency: 'TZS', hq_city: '', hq_country: 'Tanzania',
};

export interface StepProps {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  packages: Package[];
  submitting?: boolean;
  submitError?: string | null;
}

export const STEP_LABELS = ['Account', 'Company', 'Package', 'Domain', 'Payment', 'Configuration'];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
