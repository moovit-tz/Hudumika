// ─── Mail — Shared TypeScript Interfaces ───────────────────────
// Consumed by both apps/api and apps/web. Mirrors tenant_settings.
// settings.email / .ticketImap (JSONB, no dedicated table) and the
// email_templates / email_outbox tables (237/238_*.sql).
//
// Previously every consumer (Settings.tsx's form, settings.routes.ts's
// PATCH body, EmailIntegration's reader) duck-typed this shape as `any` —
// nothing would catch a field-name drift between them. This is the one
// contract all three now import.

// ── Outbound config (tenant_settings.settings.email) ───────────

export type EmailProtocol = 'mail' | 'smtp' | 'outlook' | 'gmail';

export type OAuthConnectionStatus = 'unauthorized' | 'authorized';

export interface EmailConfig {
  protocol: EmailProtocol;
  // SMTP
  host?: string;
  port?: string | number;
  user?: string;
  pass?: string;              // encrypted at rest (onsite-secrets.service.ts) once persisted
  enc?: 'none' | 'ssl' | 'tls';
  // Sender identity — shared by every protocol
  fromName?: string;
  fromEmail?: string;
  sig?: string;
  // Outlook OAuth2
  outlookClientId?: string;
  outlookClientSecret?: string;      // encrypted at rest once persisted
  outlookRefreshToken?: string;      // encrypted at rest once persisted
  outlookAccessToken?: string;       // encrypted at rest once persisted
  outlookTokenExpiresAt?: string;    // ISO timestamp
  outlookStatus?: OAuthConnectionStatus;
  // Gmail OAuth2
  gmailClientId?: string;
  gmailClientSecret?: string;        // encrypted at rest once persisted
  gmailRefreshToken?: string;        // encrypted at rest once persisted
  gmailAccessToken?: string;         // encrypted at rest once persisted
  gmailTokenExpiresAt?: string;      // ISO timestamp
  gmailStatus?: OAuthConnectionStatus;
}

// ── Inbound config (tenant_settings.settings.ticketImap) ───────

export interface TicketImapConfig {
  enabled: boolean;
  host?: string;
  port?: string | number;
  encryption?: 'none' | 'ssl' | 'tls';
  user?: string;
  pass?: string;               // encrypted at rest once persisted
  targetDepartment?: string;
  ticketType?: string;
  markAsRead?: boolean;
  status?: 'connected' | 'error' | 'unconfigured';
}

// ── email_templates (237_email_templates.sql) ──────────────────

export type EmailTemplateCategory = 'transactional' | 'support' | 'account' | string;

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  template_key: string;
  category: EmailTemplateCategory;
  subject: string;
  body_html: string;
  preheader: string;
  body_plain: string;
  locale: string;
  status: EmailTemplateStatus;
  block_document: EmailBlockDocument | null;
  revision: number;
  event_key: string | null;
  application: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Response shape for GET /v1/email-templates — every known key, merged
 *  with the tenant's override (if any) so the UI never has to reason
 *  about "does a row exist" itself. */
export interface EmailTemplateView {
  template_key: string;
  category: EmailTemplateCategory;
  subject: string;
  body_html: string;
  is_customized: boolean;
  updated_at: string | null;
  available_vars: string[];
  group_id: string | null;
  sort_order: number;
  is_builtin: boolean;
  preheader: string;
  body_plain: string;
  locale: string;
  status: EmailTemplateStatus;
  block_document: EmailBlockDocument | null;
  revision: number;
  event_key: string | null;
  application: string | null;
}

export type EmailTemplateStatus = 'draft' | 'active' | 'archived';
export type CommunicationChannel = 'EMAIL' | 'IN_APP';
export type CommunicationRecipientType = 'TO' | 'CC' | 'BCC';
export type CommunicationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface EmailBlockDocument {
  version: 1;
  blocks: Array<Record<string, unknown>>;
}

export interface CommunicationVariableDefinition {
  label: string;
  example: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface CommunicationRecipientDefinition {
  resolver: string;
  type: CommunicationRecipientType;
  label: string;
  required?: boolean;
}

export interface CommunicationEventDefinition {
  event_key: string;
  application: string;
  name: string;
  description: string;
  category: 'transactional' | 'security' | 'crm' | 'hr' | 'ops' | 'marketing';
  trigger_type: 'domain_event' | 'scheduled' | 'workflow' | 'manual' | 'security';
  available_channels: CommunicationChannel[];
  default_channel: CommunicationChannel;
  available_variables: Record<string, Record<string, CommunicationVariableDefinition>>;
  sample_context: Record<string, unknown>;
  recipient_resolvers: CommunicationRecipientDefinition[];
  default_template: string | null;
  default_locale: string;
  priority: CommunicationPriority;
  is_required: boolean;
}

export interface CommunicationRecipient {
  email: string;
  name?: string;
  user_id?: string;
  type: CommunicationRecipientType;
}

export interface ResolvedRecipients {
  to: CommunicationRecipient[];
  cc: CommunicationRecipient[];
  bcc: CommunicationRecipient[];
}

export interface CommunicationRecordReference {
  type: string;
  id: string;
  label?: string;
}

export interface CommunicationDispatchRequest {
  tenantId: string;
  eventKey: string;
  actorId?: string | null;
  record?: CommunicationRecordReference;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
  locale?: string;
  manualRecipients?: CommunicationRecipient[];
  attachments?: Array<{ storageKey: string; filename: string }>;
}

export interface TemplateDefinition {
  template_key: string;
  subject: string;
  preheader: string;
  body_html: string;
  body_plain: string;
  locale: string;
  status: EmailTemplateStatus;
  block_document: EmailBlockDocument | null;
  revision: number;
}

export interface TemplateRevision extends TemplateDefinition {
  id: string;
  tenant_id: string;
  created_by: string | null;
  created_at: string;
}

export interface RenderedCommunication {
  eventKey: string;
  templateKey: string;
  locale: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  plainText: string;
  recipients: ResolvedRecipients;
}

export interface DeliveryRecord {
  id: string;
  tenant_id: string;
  event_key: string;
  channel: CommunicationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'skipped';
  template_key: string | null;
  context_ref: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface EmailTemplateGroup {
  id: string;
  tenant_id: string;
  user_id: string | null;
  scope: 'personal' | 'system';
  name: string;
  sort_order: number;
}

// ── email_outbox (238_email_outbox.sql) ─────────────────────────

export type EmailOutboxStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface EmailOutboxItem {
  id: string;
  tenant_id: string;
  to_address: string;
  cc_addresses: string[] | null;
  from_name: string | null;
  from_address: string | null;
  subject: string;
  body_html: string;
  template_key: string | null;
  source_app: string | null;
  status: EmailOutboxStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  sent_at: string | null;
}
