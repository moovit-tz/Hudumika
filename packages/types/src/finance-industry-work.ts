import type { FinanceIndustryKey } from './finance-capabilities.js';

export type IndustryWorkStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export interface IndustryCostSource {
  id: string; entry_number: string; description: string | null; account_code: string;
  account_name: string; debit: number; available: number;
}
export interface IndustryCostAllocation {
  id: string; amount: number; reason: string; created_at: string; reversed_at: string | null;
  allocation_journal_id: string; source_journal_line_id: string;
}
export type IndustryLineKind = 'service' | 'time' | 'material' | 'expense' | 'milestone';
export interface IndustryWork {
  id: string;
  industry: FinanceIndustryKey;
  reference: string;
  name: string;
  customer_id: string;
  customer_name?: string;
  status: IndustryWorkStatus;
  currency: string;
  budget: number;
  due_date: string | null;
  specifications: Record<string, string>;
  invoice_id: string | null;
  created_at: string;
  lines?: IndustryWorkLine[];
  estimated_revenue?: number;
  estimated_cost?: number;
  posted_revenue?: number;
  posted_cost?: number;
  production?: IndustryProductionOrder[];
  allocations?: { id: string; item_name: string; unit: string; quantity: number; dispatched_quantity: number; released: boolean; batch: string }[];
}
export interface IndustryProductionOrder {
  id: string; output_item_id: string; planned_quantity: number; actual_quantity: number | null;
  output_batch: string; material_cost: number; conversion_cost: number;
  status: 'draft' | 'released' | 'completed';
}
export interface IndustryProductionRecipeInput {
  output_item_id: string; source_location_id: string; target_location_id: string;
  planned_quantity: number; output_batch: string; conversion_cost: number;
  materials: { item_id: string; quantity: number; unit: string; batch: string }[];
}
export interface IndustryProductionRecipe {
  id: string; name: string; version: number; recipe: IndustryProductionRecipeInput; created_at: string;
}
export interface IndustryWorkLine {
  id: string;
  work_id: string;
  kind: IndustryLineKind;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  cost_rate: number;
  billable: boolean;
  approved: boolean;
  work_date: string;
  invoice_id: string | null;
  cost_journal_id?: string | null;
}
