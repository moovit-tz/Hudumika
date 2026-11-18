export type LensItemKind = 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK' | 'EPIC';
export type LensItemStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX';
export type LensItemSeverity = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type LensItemPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type LensItemConfidence = 'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED';
export type LensCycleStatus = 'PLANNING' | 'ACTIVE' | 'CLOSED';
export type LensReleaseStatus = 'PLANNED' | 'IN_PROGRESS' | 'STAGED' | 'RELEASED' | 'CANCELLED';
export type LensSnapshotType = 'working_tree_patch' | 'selected_files' | 'git_bundle' | 'source_archive';
export type LensSnapshotStatus = 'QUEUED' | 'CAPTURING' | 'VERIFYING' | 'READY' | 'FAILED';
export type LensReportStatus = 'NEW' | 'TRIAGED' | 'LINKED' | 'RESOLVED' | 'REJECTED';
export type LensRelationType = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES' | 'DUPLICATED_BY' | 'CAUSED_BY';
export type LensProvider = 'github' | 'slack' | 'jira' | 'linear' | 'circleci' | 'notion' | 'gitlab';

export interface LensProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
  lead_id: string | null;
  default_area_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LensRepository {
  id: string;
  provider: string;
  external_id: string | null;
  full_name: string;
  default_branch: string;
  webhook_id: string | null;
  clone_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LensConnectionInstance {
  id: string;
  provider: LensProvider;
  name: string;
  site_or_org: string | null;
  auth_type: string;
  has_credential?: boolean;
  has_webhook_secret?: boolean;
  key_version: string;
  granted_scopes: string[];
  config: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error' | 'revoked';
  last_error: string | null;
  last_sync_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LensRelease {
  id: string;
  project_id: string | null;
  version: string;
  title: string;
  description: string | null;
  status: LensReleaseStatus;
  release_notes: string | null;
  git_tag: string | null;
  commit_sha: string | null;
  released_at: string | null;
  released_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LensSnapshot {
  id: string;
  item_id: string | null;
  repo_id: string | null;
  snapshot_type: LensSnapshotType;
  commit_sha: string | null;
  branch_label: string | null;
  storage_path: string;
  checksum_sha256: string;
  size_bytes: number;
  manifest: Record<string, any>;
  status: LensSnapshotStatus;
  reason: string | null;
  capture_tool_version: string;
  created_by: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LensReport {
  id: string;
  source_app: string;
  source_route: string | null;
  tenant_id: string | null;
  reporter_id: string;
  reporter_email: string | null;
  reporter_name: string | null;
  reporter_role: string | null;
  title: string;
  summary: string;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  severity: LensItemSeverity;
  client_context: Record<string, any>;
  attachments: Array<{ filename: string; path: string; size: number; content_type?: string }>;
  status: LensReportStatus;
  item_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LensComment {
  id: string;
  item_id: string;
  author_id: string;
  author_name: string;
  author_email: string | null;
  body: string;
  is_internal: boolean;
  attachments: Array<{ filename: string; path: string; size: number }>;
  created_at: string;
  updated_at: string;
}

export interface LensItemRelation {
  id: string;
  item_id: string;
  target_item_id: string;
  relation_type: LensRelationType;
  created_at: string;
}

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
  project_id?: string | null;
  release_id?: string | null;
  environment?: string;
  status: LensItemStatus;
  severity: LensItemSeverity;
  priority?: LensItemPriority;
  confidence: LensItemConfidence;
  evidence: string | null;
  waiting_on: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  reproduction_steps?: string | null;
  root_cause?: string | null;
  fix_summary?: string | null;
  verification_evidence?: string | null;
  verification_status?: 'UNVERIFIED' | 'VERIFIED' | 'FAILED';
  verified_by?: string | null;
  verified_at?: string | null;
  reopen_count?: number;
  reopen_reason?: string | null;
  merged_into_id?: string | null;
  labels?: string[];
  source_report_id?: string | null;
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
