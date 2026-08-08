export type LensItemKind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK' | 'EPIC';
export type LensItemStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
export type LensItemSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type LensItemConfidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';
export type LensCycleStatus = 'PLANNING' | 'ACTIVE' | 'CLOSED';

export interface LensCycle {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: LensCycleStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LensItem {
  id: string;
  ref: string;
  kind: LensItemKind;
  title: string;
  body: string | null;
  area_id: string | null;
  status: LensItemStatus;
  severity: LensItemSeverity;
  confidence: LensItemConfidence;
  evidence: string | null;
  waiting_on: string | null;
  refs: any;
  tags: any;
  created_by: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  cycle_id: string | null;
}
