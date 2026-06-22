// ─── ClearOS Notification Types ──────────────────────────────

import type { MessageChannel } from './core.js';

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
  // ── TANESW / Declaration Events ──
  | 'DECLARATION_TRANSFERRED'
  | 'SELECTIVITY_GREEN'
  | 'SELECTIVITY_YELLOW'
  | 'SELECTIVITY_RED'
  | 'ASSESSMENT_RECEIVED'
  | 'PAYMENT_NOTICE_ISSUED'
  | 'RELEASE_ORDER'
  | 'CUSTOMS_QUERY'
  | 'TANSAD_AMENDMENT';

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
}

// ── Send Notification Input ──────────────────────────────────

export interface SendNotificationInput {
  shipment_id: string;
  recipient_user_id: string;
  channel: MessageChannel;
  template: string;
  variables?: Record<string, string>;
}
