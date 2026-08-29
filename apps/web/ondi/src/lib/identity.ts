export interface KycRecord {
  documentType: string;
  status: string;
  verificationSource: string;
  createdAt: string;
}

export interface CredentialRow {
  type: string;
  verified: boolean;
  lastUsedAt?: string;
}

export interface MeResponse {
  id?: string;
  phoneNumber?: string;
  email?: string;
  kycRecords?: KycRecord[];
  credentials?: CredentialRow[];
}

export interface DocumentEntry {
  documentType: string;
  name: string;
  status: 'verified' | 'pending' | 'missing';
  source?: string;
  date?: string;
}

const DOC_LABELS: Record<string, string> = {
  NIN:            'NIDA Card',
  PASSPORT:       'Passport',
  DRIVER_LICENSE: 'Driving Licence',
};

/** Maps the current user's real KYCRecords onto the fixed set of government ID document types Ondi supports. */
export function buildDocuments(me: MeResponse | null): DocumentEntry[] {
  const records = me?.kycRecords ?? [];
  return Object.entries(DOC_LABELS).map(([documentType, name]) => {
    const record = records.find(r => r.documentType === documentType);
    if (!record) return { documentType, name, status: 'missing' as const };
    return {
      documentType,
      name,
      status: (record.status === 'VERIFIED' ? 'verified' : 'pending') as 'verified' | 'pending',
      source: record.verificationSource,
      date:   record.createdAt,
    };
  });
}
