export interface MailDnsRecord {
  name: string;
  type: 'MX' | 'TXT' | 'CNAME';
  value: string;
  priority?: number;
  ttl: number;
  purpose: 'mx' | 'spf' | 'dkim' | 'dmarc' | 'verification';
}

export interface EmailSyncStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  pendingChanges: number;
  failedChanges: number;
}

export interface EmailLiveCheck {
  id: string;
  status: 'queued' | 'sent' | 'received' | 'failed';
  created_at: string;
  received_at: string | null;
  error: string | null;
}
