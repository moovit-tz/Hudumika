export interface VendorMaster {
  id: string; name: string; contact_name: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; country: string | null; tax_id: string | null;
  category: string; currency: string; payment_terms: string; status: 'active' | 'inactive' | 'blocked'; notes: string | null;
}
