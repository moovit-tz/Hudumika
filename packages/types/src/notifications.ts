// ─── Hudumika Notification Types ──────────────────────────────

import type { MessageChannel } from './core.js';
import type { AppId } from './user.js';

// ── Notification Triggers ────────────────────────────────────

export type NotificationTrigger =
  | 'STAGE_ADVANCED'
  | 'MISSING_DOCUMENT'
  | 'DEMURRAGE_RISK'
  | 'SLA_BREACH'
  | 'DAILY_STATUS'
  | 'INVOICE_GENERATED'
  | 'PAYMENT_RECEIVED'
  | 'DOCUMENT_UPLOADED'
  | 'CASE_OPENED'
  | 'CASE_CLOSED'
  | 'MESSAGE_RECEIVED'
  | 'KEY_DATE_CHANGED'
  // ── TANESW / Declaration Events ──
  | 'DECLARATION_TRANSFERRED'
  | 'SELECTIVITY_GREEN'
  | 'SELECTIVITY_YELLOW'
  | 'SELECTIVITY_RED'
  | 'ASSESSMENT_RECEIVED'
  | 'PAYMENT_NOTICE_ISSUED'
  | 'RELEASE_ORDER'
  | 'CUSTOMS_QUERY'
  | 'TANSAD_AMENDMENT'
  // ── ComplyOS Events ──
  | 'COMPLY_RENEWAL_TRIGGERED';

// ── Recipient Types ──────────────────────────────────────────

export type NotificationRecipient =
  | 'CUSTOMER'
  | 'ASSIGNED_OFFICER'
  | 'MANAGER'
  | 'FINANCE'
  | 'OPERATIONS_DIRECTOR';

// ── Priority ─────────────────────────────────────────────────

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// ── Repeat Schedule ──────────────────────────────────────────

export interface RepeatSchedule {
  every: number;
  unit: 'hours' | 'days';
  max: number;               // maximum repeat count
}

// ── Notification Rule ────────────────────────────────────────

export interface NotificationRule {
  trigger: NotificationTrigger;
  recipients: NotificationRecipient[];
  channels: MessageChannel[];
  template: string;
  priority?: NotificationPriority;
  repeat?: RepeatSchedule;
  condition?: string;         // e.g. 'SHIPMENT_IS_ACTIVE'
  escalate_to?: NotificationRecipient;
}

// ── Notification Record ──────────────────────────────────────

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  shipment_id?: string;
  title: string;
  body: string;
  channel: MessageChannel;
  priority: NotificationPriority;
  read: boolean;
  read_at?: string;
  created_at: string;
  // Workspace fields (nullable for backward compat with older records)
  app?: AppId;           // which Hudumika app generated this
  entity_type?: string;  // 'shipment' | 'invoice' | 'employee' | 'ticket'
  entity_id?: string;
  entity_label?: string; // human-readable label, e.g. 'CLR-2025-0042'
}

// ── Send Notification Input ──────────────────────────────────

export interface SendNotificationInput {
  shipment_id: string;
  recipient_user_id: string;
  channel: MessageChannel;
  template: string;
  variables?: Record<string, string>;
}
