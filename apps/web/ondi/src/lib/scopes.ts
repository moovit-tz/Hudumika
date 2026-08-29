import { IdCard, User, TrendingUp, CreditCard, Fingerprint, BarChart3, Link2, type LucideIcon } from 'lucide-react';

export interface ScopeInfo {
  label: string;
  desc: string;
  icon: LucideIcon;
}

export const SCOPE_MAP: Record<string, ScopeInfo> = {
  openid:       { label: 'Basic Identity', desc: 'Your Ondi and unique identifier', icon: Fingerprint },
  profile:      { label: 'Full Profile',   desc: 'Name, email, and photo', icon: User },
  trust:        { label: 'Trust Score',    desc: 'Your real-time 0-850 trust rating', icon: TrendingUp },
  credit:       { label: 'Credit Profile', desc: 'Eligibility, limits, and score', icon: CreditCard },
  kyc:          { label: 'KYC Status',     desc: 'Verification level and history', icon: IdCard },
  transactions: { label: 'Activity',       desc: 'Platform behavior signals', icon: BarChart3 },
};

export function scopeInfo(scope: string): ScopeInfo {
  return SCOPE_MAP[scope] ?? { label: scope, desc: 'Additional data access', icon: Link2 };
}
