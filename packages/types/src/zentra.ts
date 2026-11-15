// ─── Zentra Shared Types: Trust, Risk, Audit & Compliance ─────────────────────

export type ZentraOutcome = 'success' | 'denied' | 'failure';
export type ZentraSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ZentraSignalStatus = 'NEW' | 'TRIAGED' | 'CASE_OPEN' | 'RESOLVED' | 'FALSE_POSITIVE';
export type ZentraCaseStatus = 'OPEN' | 'INVESTIGATING' | 'REMEDIATION' | 'CLOSED';
export type ZentraResolutionOutcome = 'remediated' | 'policy_updated' | 'false_positive' | 'no_action_needed' | 'escalated';
export type ZentraOutboxStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ZentraRuleCategory = 'access_control' | 'data_exfiltration' | 'financial' | 'privilege' | 'operational' | 'telemetry';
export type ZentraSubjectType = 'role' | 'user' | 'team' | 'service';
export type ZentraPolicyEffect = 'allow' | 'deny';
export type ZentraConditionType = 'always' | 'owner_only' | 'assigned_only' | 'team_only' | 'classification_le' | 'amount_lt';

/** Standardized audit event payload */
export interface ZentraAuditEvent {
  id: string;
  tenant_id: string;
  app_id: string;
  event_name: string;
  actor_id: string;
  actor_role?: string | null;
  actor_name?: string | null;
  actor_ip?: string | null;
  actor_user_agent?: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  outcome: ZentraOutcome;
  correlation_id?: string | null;
  schema_version: string;
  safe_summary?: string | null;
  safe_metadata: Record<string, unknown>;
  created_at: string | Date;
}

/** Input for recording an audit event */
export interface ZentraAuditEventInput {
  app_id: string;
  event_name: string;
  actor_id: string;
  actor_role?: string;
  actor_name?: string;
  actor_ip?: string;
  actor_user_agent?: string;
  resource_type: string;
  resource_id: string;
  action: string;
  outcome?: ZentraOutcome;
  correlation_id?: string;
  schema_version?: string;
  safe_summary?: string;
  safe_metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

/** Outbox queue row */
export interface ZentraEventOutboxItem {
  id: string;
  tenant_id: string;
  app_id: string;
  event_name: string;
  payload: ZentraAuditEventInput;
  status: ZentraOutboxStatus;
  retry_count: number;
  max_retries: number;
  last_error?: string | null;
  idempotency_key?: string | null;
  scheduled_at: string | Date;
  processed_at?: string | Date | null;
  created_at: string | Date;
}

/** Risk rule configuration */
export interface ZentraRiskRule {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string;
  category: ZentraRuleCategory;
  severity: ZentraSeverity;
  enabled: boolean;
  parameters: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Detected risk signal */
export interface ZentraRiskSignal {
  id: string;
  tenant_id: string;
  app_id: string;
  rule_id?: string | null;
  rule_code: string;
  title: string;
  description: string;
  severity: ZentraSeverity;
  status: ZentraSignalStatus;
  actor_id?: string | null;
  actor_name?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  evidence_event_ids: string[];
  evidence_summary?: string | null;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | Date | null;
  case_id?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ZentraCaseNote {
  id: string;
  author_id: string;
  author_name: string;
  note: string;
  created_at: string;
}

export interface ZentraCaseTimelineEvent {
  id: string;
  action: string;
  actor_name: string;
  timestamp: string;
  details?: string;
}

/** Investigation case */
export interface ZentraInvestigationCase {
  id: string;
  tenant_id: string;
  case_number: string;
  title: string;
  summary: string;
  severity: ZentraSeverity;
  status: ZentraCaseStatus;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  lead_signal_id?: string | null;
  evidence_event_ids: string[];
  internal_notes: ZentraCaseNote[];
  timeline: ZentraCaseTimelineEvent[];
  resolution?: string | null;
  resolution_outcome?: ZentraResolutionOutcome | null;
  closed_by?: string | null;
  closed_at?: string | Date | null;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Record-level policy */
export interface ZentraPolicy {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  resource_type: string;
  action: string;
  subject_type: ZentraSubjectType;
  subject_id: string;
  effect: ZentraPolicyEffect;
  condition_type: ZentraConditionType;
  condition_value: Record<string, unknown>;
  enabled: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Settings */
export interface ZentraSettings {
  id: string;
  tenant_id: string;
  retention_days: number;
  alert_email?: string | null;
  alert_min_severity: ZentraSeverity;
  telemetry_monitoring_enabled: boolean;
  monitored_apps: string[];
  dormant_threshold_hours: number;
  updated_at: string | Date;
}

/** Platform Oversight Audit Log (Superadmin cross-tenant) */
export interface ZentraPlatformAudit {
  id: string;
  actor_user_id?: string | null;
  actor_name: string;
  actor_email: string;
  action: string;
  target_tenant_id?: string | null;
  target_tenant_name?: string | null;
  target_resource_type?: string | null;
  target_resource_id?: string | null;
  reason?: string | null;
  ip_address?: string | null;
  metadata: Record<string, unknown>;
  created_at: string | Date;
}

/** Ingestion & Telemetry Health Status */
export interface ZentraAppTelemetryHealth {
  app_id: string;
  name: string;
  last_event_at: string | null;
  event_count_24h: number;
  status: 'healthy' | 'dormant' | 'missing' | 'error';
  lag_seconds?: number;
}

/** Tenant Overview Summary */
export interface ZentraOverviewData {
  total_events_24h: number;
  high_risk_signals_count: number;
  open_cases_count: number;
  outbox_backlog_count: number;
  recent_events: ZentraAuditEvent[];
  recent_signals: ZentraRiskSignal[];
  app_health: ZentraAppTelemetryHealth[];
}

/** Superadmin Platform Oversight Overview */
export interface ZentraPlatformOverviewData {
  cross_tenant_events_24h: number;
  cross_tenant_high_risk_signals: number;
  cross_tenant_open_cases: number;
  tenants_with_active_anomalies: number;
  risk_queue: Array<ZentraRiskSignal & { tenant_name?: string }>;
  telemetry_gaps: ZentraAppTelemetryHealth[];
  platform_audits_recent: ZentraPlatformAudit[];
}

