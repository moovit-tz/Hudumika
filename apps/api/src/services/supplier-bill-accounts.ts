const CATEGORY_ACCOUNT: Record<string, string> = {
  FREIGHT: '5001',
  CUSTOMS: '5000',
  PORT: '5000',
  TRANSPORT: '5002',
  WAREHOUSE: '5003',
  UTILITIES: '5102',
  PROFESSIONAL: '5100', // Closest expense account in the standard chart.
  INSURANCE: '5000',
  OTHER: '5000',
};

export function accountForBillCategory(category: string | null | undefined): string {
  return CATEGORY_ACCOUNT[String(category ?? '').toUpperCase()] ?? '5000';
}
