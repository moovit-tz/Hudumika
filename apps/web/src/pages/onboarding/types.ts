import type { PaymentMethod, Package } from '@hudumika/types';

export interface OnboardingJourney {
  industry_key: string;
  label: string;
  description: string | null;
  featured_apps: string[];
  checkpoint_keys: string[];
  recommended_package_code: string | null;
}

export interface OnboardingIndustry {
  key: string;
  name: string;
  description: string | null;
  core_apps: string[];
  recommended_package_code: string | null;
}

export interface OnboardingDraft {
  // Step 1 — Account. Full SSO: identity is verified by Ondi (Google/
  // Microsoft/Apple — the only methods that can verify someone with no
  // Hudumika account yet, since phone/email OTP both require an existing
  // tenant to send through). name/email are populated FROM that verified
  // identity, not typed by hand; ondi_ticket is what proves it server-side
  // at POST /v1/onboarding/complete. No password anywhere in this flow.
  name: string;
  email: string;
  ondi_ticket: string;
  // Step 2 — Company & Industries
  companyName: string;
  industry: string; // Primary industry key
  industries: string[]; // Multiple selected industries
  country: string;
  onboarding_journey: string;
  // Step 3 — Package
  package_code: string;
  billing_cycle: 'monthly' | 'annual';
  // Standalone-product signup ("just SEAL, no Hudumika Business"):
  // commercial_products.product_key values, set alongside
  // package_code: 'workspace-free'. Empty for a normal tier signup.
  initial_products: string[];
  // Step 4 — Workspace address and regional settings
  subdomain: string;
  // Step 5 — Billing
  payment: {
    method: PaymentMethod;
    card_number: string;
    card_holder: string;
    card_expiry: string;
    card_cvc: string;
    mobile_number: string;
    mobile_provider: string;
  };
  // Regional settings collected in step 4 and confirmed in step 6.
  timezone: string;
  currency: string;
  hq_city: string;
  hq_country: string;
  privacy_policy_version_id: string;
  privacy_acknowledged: boolean;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '', email: '', ondi_ticket: '',
  companyName: '', industry: '', industries: [], country: 'Tanzania', onboarding_journey: '',
  package_code: '', billing_cycle: 'monthly', initial_products: [],
  subdomain: '',
  payment: { method: 'card', card_number: '', card_holder: '', card_expiry: '', card_cvc: '', mobile_number: '', mobile_provider: 'M-Pesa' },
  timezone: 'Africa/Dar_es_Salaam', currency: 'TZS', hq_city: '', hq_country: 'Tanzania',
  privacy_policy_version_id: '', privacy_acknowledged: false,
};

/**
 * The 20 currently accepted industries from the platform's 29 registered industries.
 * Used for instant display and resilient fallback when offline or loading.
 */
export const ACCEPTED_REGISTRY_INDUSTRIES: OnboardingIndustry[] = [
  { key: 'retail', name: 'Retail', description: 'Counter and direct-to-customer sales.', core_apps: ['pos', 'inventory', 'sales'], recommended_package_code: 'starter-tzs' },
  { key: 'wholesale', name: 'Wholesale', description: 'Bulk sales, purchasing and stock fulfilment.', core_apps: ['inventory', 'procurement', 'warehouse'], recommended_package_code: 'business-tzs' },
  { key: 'ecommerce', name: 'E-commerce', description: 'Online storefronts, order fulfilment and multi-channel sales.', core_apps: ['inventory', 'pos', 'sales'], recommended_package_code: 'starter-tzs' },
  { key: 'manufacturing', name: 'Manufacturing', description: 'Production, materials, work in progress and costing.', core_apps: ['inventory', 'manufacturing', 'procurement'], recommended_package_code: 'business-tzs' },
  { key: 'food_beverage', name: 'Food & Beverage', description: 'Recipe-driven batch production, allergens, shelf life.', core_apps: ['inventory', 'manufacturing', 'procurement'], recommended_package_code: 'business-tzs' },
  { key: 'printing', name: 'Printing', description: 'Print production, stock and procurement workflows.', core_apps: ['inventory', 'procurement', 'manufacturing'], recommended_package_code: 'business-tzs' },
  { key: 'warehousing', name: 'Warehousing', description: 'Storage, allocation, picking and fulfilment.', core_apps: ['seal', 'inventory', 'warehouse'], recommended_package_code: 'business-tzs' },
  { key: 'professional_services', name: 'Professional Services', description: 'Time, project delivery and profitability.', core_apps: ['projects', 'timesheet', 'finance'], recommended_package_code: 'starter-tzs' },
  { key: 'consulting', name: 'Consulting', description: 'Client engagements, expenses and project profitability.', core_apps: ['projects', 'timesheet', 'finance'], recommended_package_code: 'starter-tzs' },
  { key: 'construction', name: 'Construction', description: 'BOQ, progress certificates, subcontracted work.', core_apps: ['projects', 'procurement', 'finance'], recommended_package_code: 'scale-tzs' },
  { key: 'property', name: 'Property & Rentals', description: 'Lease management, tenant billing and maintenance.', core_apps: ['property', 'billing', 'finance'], recommended_package_code: 'business-tzs' },
  { key: 'automotive', name: 'Automotive & Workshop', description: 'Vehicle service jobs, parts and labour billing.', core_apps: ['gereji', 'inventory', 'fleet'], recommended_package_code: 'business-tzs' },
  { key: 'hospitality', name: 'Hospitality', description: 'Reservations, guest folios and front-desk operations.', core_apps: ['pos', 'hospitality', 'finance'], recommended_package_code: 'business-tzs' },
  { key: 'restaurant', name: 'Restaurant & Food Service', description: 'Table orders, kitchen tickets, menu costing.', core_apps: ['pos', 'inventory', 'procurement'], recommended_package_code: 'starter-tzs' },
  { key: 'education', name: 'Education', description: 'Student enrolment, fee structures, term billing.', core_apps: ['education', 'billing', 'finance'], recommended_package_code: 'business-tzs' },
  { key: 'insurance', name: 'Insurance', description: 'Policy underwriting, premium collection, claims.', core_apps: ['insurance', 'billing', 'finance'], recommended_package_code: 'scale-tzs' },
  { key: 'lending', name: 'Lending & Microfinance', description: 'Loan origination, disbursement and repayment.', core_apps: ['lending', 'billing', 'finance'], recommended_package_code: 'scale-tzs' },
  { key: 'logistics', name: 'Logistics & Import/Export', description: 'Freight forwarding, customs clearance and shipment costing.', core_apps: ['cargotracker', 'clearos', 'tuma', 'fleet'], recommended_package_code: 'business-tzs' },
  { key: 'legal', name: 'Legal Services', description: 'Law firms, corporate counsel, notaries.', core_apps: ['lexcore', 'billing', 'documents'], recommended_package_code: 'business-tzs' },
  { key: 'privacy', name: 'Privacy & Data Protection', description: 'PDPC/GDPR compliance, DPO services.', core_apps: ['ngao', 'compliance', 'documents'], recommended_package_code: 'business-tzs' },
];

export interface StepProps {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  packages: Package[];
  journeys?: OnboardingJourney[];
  industries?: OnboardingIndustry[];
  industriesLoading?: boolean;
  industriesError?: string | null;
  onRetryIndustries?: () => void;
  onEditStep?: (step: number) => void;
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

export const STEP_LABELS = ['Identity', 'Business & industry', 'Apps & plan', 'Workspace', 'Billing', 'Review & launch'];
export const STEP_SHORT_LABELS = ['Identity', 'Business', 'Apps', 'Workspace', 'Billing', 'Review'];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
