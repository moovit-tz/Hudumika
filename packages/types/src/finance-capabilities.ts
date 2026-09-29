export type FinanceEdition = 'basic' | 'advanced';

export const FINANCE_CAPABILITY_KEYS = [
  'finance.core',
  'finance.accounting.advanced',
  'finance.budgets',
  'finance.fixed_assets',
  'finance.multi_currency',
  'finance.inventory',
  'finance.procurement',
  'finance.pos',
  'finance.warehouse',
  'finance.manufacturing',
  'finance.professional_services',
  'finance.project_accounting',
  'finance.consolidation',
] as const;

export type FinanceCapabilityKey = (typeof FINANCE_CAPABILITY_KEYS)[number];
export type FinanceCapabilityState = 'not_entitled' | 'available' | 'enabled';

export interface FinanceCapabilityDefinition {
  key: FinanceCapabilityKey;
  name: string;
  description: string;
  category: 'core' | 'accounting' | 'operations' | 'reporting';
  edition: FinanceEdition;
  configurable: boolean;
  dependencies: FinanceCapabilityKey[];
}

export interface FinanceCapabilityAccess extends FinanceCapabilityDefinition {
  entitled: boolean;
  enabled: boolean;
  state: FinanceCapabilityState;
}

export const FINANCE_CAPABILITIES: readonly FinanceCapabilityDefinition[] = [
  { key: 'finance.core', name: 'Core finance', description: 'Customers, suppliers, invoices, receipts, expenses, payments and essential reports.', category: 'core', edition: 'basic', configurable: false, dependencies: [] },
  { key: 'finance.accounting.advanced', name: 'Advanced accounting', description: 'Manual journals, accounting periods, reconciliation and the advanced ledger workspace.', category: 'accounting', edition: 'advanced', configurable: true, dependencies: ['finance.core'] },
  { key: 'finance.budgets', name: 'Budgets', description: 'Plan and compare account-level budgets against actual performance.', category: 'accounting', edition: 'advanced', configurable: true, dependencies: ['finance.accounting.advanced'] },
  { key: 'finance.fixed_assets', name: 'Fixed assets', description: 'Asset registers, depreciation and disposals.', category: 'accounting', edition: 'advanced', configurable: true, dependencies: ['finance.accounting.advanced'] },
  { key: 'finance.multi_currency', name: 'Multi-currency', description: 'Foreign-currency transactions, rates and reporting.', category: 'accounting', edition: 'advanced', configurable: true, dependencies: ['finance.accounting.advanced'] },
  { key: 'finance.inventory', name: 'Inventory', description: 'Stock-aware products, movements, valuation and availability.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.core'] },
  { key: 'finance.procurement', name: 'Procurement', description: 'Purchase requisitions, orders and supplier fulfilment.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.core'] },
  { key: 'finance.pos', name: 'Point of sale', description: 'Counter sales, shifts and payment capture using the shared catalogue.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.inventory'] },
  { key: 'finance.warehouse', name: 'Warehouse operations', description: 'Multi-warehouse allocation, picking and fulfilment.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.inventory'] },
  { key: 'finance.manufacturing', name: 'Manufacturing', description: 'Bills of materials, production orders, WIP and material planning.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.inventory', 'finance.accounting.advanced'] },
  { key: 'finance.professional_services', name: 'Professional services', description: 'Service delivery, time and project profitability.', category: 'operations', edition: 'advanced', configurable: true, dependencies: ['finance.core'] },
  { key: 'finance.project_accounting', name: 'Project accounting', description: 'Project costs, revenue, budgets and profitability.', category: 'reporting', edition: 'advanced', configurable: true, dependencies: ['finance.accounting.advanced'] },
  { key: 'finance.consolidation', name: 'Consolidation', description: 'Multi-entity consolidation and segment reporting.', category: 'reporting', edition: 'advanced', configurable: true, dependencies: ['finance.accounting.advanced'] },
] as const;

export interface FinanceCapabilitySummary {
  edition: FinanceEdition;
  capabilities: FinanceCapabilityAccess[];
}

export const FINANCE_INDUSTRY_KEYS = [
  'retail',
  'wholesale',
  'manufacturing',
  'warehousing',
  'professional_services',
  'consulting',
  'printing',
] as const;

export type FinanceIndustryKey = (typeof FINANCE_INDUSTRY_KEYS)[number];

export interface FinanceIndustryDefinition {
  key: FinanceIndustryKey;
  name: string;
  description: string;
  recommendedCapabilities: FinanceCapabilityKey[];
}

export const FINANCE_INDUSTRIES: readonly FinanceIndustryDefinition[] = [
  { key: 'retail', name: 'Retail', description: 'Counter and direct-to-customer sales.', recommendedCapabilities: ['finance.inventory', 'finance.pos', 'finance.procurement'] },
  { key: 'wholesale', name: 'Wholesale', description: 'Bulk sales, purchasing and stock fulfilment.', recommendedCapabilities: ['finance.inventory', 'finance.procurement', 'finance.warehouse'] },
  { key: 'manufacturing', name: 'Manufacturing', description: 'Production, materials, work in progress and costing.', recommendedCapabilities: ['finance.inventory', 'finance.procurement', 'finance.manufacturing'] },
  { key: 'warehousing', name: 'Warehousing', description: 'Storage, allocation, picking and fulfilment.', recommendedCapabilities: ['finance.inventory', 'finance.warehouse'] },
  { key: 'professional_services', name: 'Professional services', description: 'Time, project delivery and profitability.', recommendedCapabilities: ['finance.professional_services', 'finance.project_accounting'] },
  { key: 'consulting', name: 'Consulting', description: 'Client engagements, expenses and project profitability.', recommendedCapabilities: ['finance.professional_services', 'finance.project_accounting'] },
  { key: 'printing', name: 'Printing', description: 'Stock, purchasing and production workflows.', recommendedCapabilities: ['finance.inventory', 'finance.procurement', 'finance.manufacturing'] },
] as const;

export interface FinanceBusinessLine {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceConfiguration {
  industries: FinanceIndustryKey[];
  industryDefinitions: FinanceIndustryDefinition[];
  businessLines: FinanceBusinessLine[];
}
