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

export type EmailTemplateCategory = 'transactional' | 'support' | 'account';

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  template_key: string;
  category: EmailTemplateCategory;
  subject: string;
  body_html: string;
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
