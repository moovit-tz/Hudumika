export interface FinanceDashboardSnapshot {
  asOf: string;
  currency: string;
  cash: { tzs: number; usd: number; onHand: number; total: number };
  receivables: { total: number; overdue: number; count: number };
  payables: { total: number; overdue: number; count: number };
  profitLoss: { month: { revenue: number; expenses: number; net: number }; ytd: { revenue: number; expenses: number; net: number } };
  approvals: { billsPendingApproval: { count: number; amount: number }; expensesPendingApproval: { count: number; amount: number } };
  glPeriod: { name: string; periodEnd: string; closedAt: string } | null;
}
