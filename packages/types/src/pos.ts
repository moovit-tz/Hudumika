export type PosShiftStatus = 'OPEN' | 'CLOSED';
export type PosSaleStatus = 'COMPLETED' | 'VOIDED' | 'REFUNDED' | 'POSTING_FAILED';
export type PosPaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK' | 'OTHER';
export type PosCashMovementDirection = 'IN' | 'OUT';

export interface PosCashMovement {
  id: string;
  shift_id: string;
  direction: PosCashMovementDirection;
  amount: number;
  reason: string;
  recorded_by: string;
  recorded_by_name?: string;
  recorded_at: string;
}

export interface PosShift {
  id: string;
  status: PosShiftStatus;
  opening_float: number;
  closing_cash: number | null;
  expected_cash: number | null;
  opened_at: string;
  closed_at: string | null;
  sales_count?: number;
  sales_total?: number;
  opened_by?: string;
  opened_by_name?: string;
  closed_by?: string | null;
  variance?: number | null;
  cash_in?: number;
  cash_out?: number;
}

export interface PosSaleLine {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
  unit_price: number;
  unit_cost?: number;
  cost_total?: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
}

export interface PosAnalytics {
  today: { sales_count: number; revenue: number; discounts: number; tax: number; cost: number; margin: number; average_sale: number };
  cashiers: Array<{ user_id: string; name: string; sales_count: number; revenue: number; average_sale: number }>;
  payments: Array<{ method: PosPaymentMethod; amount: number; count: number }>;
}

export interface PosHeldCart {
  id: string;
  label: string;
  customer_id: string | null;
  customer_name: string | null;
  inventory_location_id: string | null;
  currency: string;
  items: Array<{ product_id: string; qty: number; discount: number }>;
  held_by: string;
  held_by_name: string;
  held_at: string;
}

export interface PosPayment {
  id: string;
  method: PosPaymentMethod;
  amount: number;
  reference: string | null;
}

export interface PosSale {
  id: string;
  sale_number: string;
  shift_id: string;
  customer_id: string | null;
  customer_name: string | null;
  status: PosSaleStatus;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  amount_paid: number;
  change_due: number;
  notes: string | null;
  sold_at: string;
  refunded_at?: string | null;
  refund_reason?: string | null;
  posting_error?: string | null;
  posting_attempts?: number;
  lines?: PosSaleLine[];
  payments?: PosPayment[];
}
