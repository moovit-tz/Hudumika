import type { EmailTemplateCategory } from '@hudumika/types';

export interface EmailTemplateDefault {
  category: EmailTemplateCategory;
  subject: string;
  /** Inner content only — mail-template.service.ts wraps this in the shared
   *  branded envelope (wrapEmailHtml). Don't add your own <html>/<body> or
   *  outer wrapper div here. */
  body: string;
}

/**
 * Code-defined fallback content for every template_key the platform's mail
 * senders use. A tenant row in email_templates (same key) is an override;
 * absence means "render this." Mirrors NOTIFICATION_MATRIX's own
 * typed-const-map pattern, just keyed by template_key instead of trigger.
 *
 * `{{var}}` values may themselves be HTML fragments (e.g. `{{payslipTable}}`,
 * `{{content}}`) — the same convention `formatTemplate` already applies
 * everywhere else in the platform.
 */
export const EMAIL_TEMPLATE_DEFAULTS: Record<string, EmailTemplateDefault> = {
  'auth.password_reset': {
    category: 'account',
    subject: 'Reset your Hudumika password',
    body: `
      <p>We received a request to reset your Hudumika password.</p>
      <p><a href="{{resetUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Reset password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  },

  'customers.claim_code': {
    category: 'account',
    subject: 'Your Hudumika organization link code',
    body: `
      <p>Hello {{customerName}},</p>
      <p>Use the code below to link your organization account:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:0.1em;">{{token}}</p>
      <p>This code expires in 7 days.</p>
    `,
  },

  'hr.staff_invitation': {
    category: 'account',
    subject: "You're invited to join Hudumika",
    body: `
      <p>You've been invited to join Hudumika as a {{role}}.</p>
      <p><a href="{{acceptUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Accept invitation</a></p>
      <p>This invitation expires in 7 days.</p>
    `,
  },

  'hr.staff_invitation_reminder': {
    category: 'account',
    subject: "Reminder: you're invited to join Hudumika",
    body: `
      <p>This is a reminder that you have a pending invitation to join Hudumika.</p>
      <p><a href="{{acceptUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Accept invitation</a></p>
    `,
  },

  'payroll.payslip': {
    category: 'transactional',
    subject: 'Your payslip — {{runName}}',
    body: `
      <p>Hello {{employeeName}},</p>
      <p>Your payslip for <strong>{{runName}}</strong> is ready:</p>
      {{payslipTable}}
    `,
  },

  'admin.raw_sql_otp': {
    category: 'account',
    subject: 'Hudumika — code to enable raw SQL mode',
    body: `
      <h2 style="margin:0 0 12px;">{{code}}</h2>
      <p>Use this code to enable raw SQL mode in Query Builder. It expires in 5 minutes.</p>
    `,
  },

  'clearos.shipment_message': {
    category: 'support',
    subject: 'Support Ticket Response - Shipment Case #{{refNumber}}',
    body: `{{content}}`,
  },

  // One key, not per-scenario (overdue / due-soon / renewal-started) — all
  // three go through comply-renewal.job.ts's single notifyComplyManagers(
  // tenantId, title, message, link) helper, which already carries the
  // scenario-specific wording as plain params. Splitting into separate
  // template keys would fight that helper's own shape rather than match it.
  'complyos.renewal_alert': {
    category: 'transactional',
    subject: '{{title}}',
    body: `<p>{{message}}</p><p><a href="{{link}}">View in ComplyOS</a></p>`,
  },

  'support.ticket_update': {
    category: 'support',
    subject: 'Support Ticket Update (Ref: {{ticketRef}})',
    body: `{{content}}`,
  },

  'support.ticket_ack': {
    category: 'support',
    subject: 'We received your message — Ticket {{ticketRef}}',
    body: `
      <p>Thanks for reaching out. Your message has been logged as ticket <strong>{{ticketRef}}</strong> and a member of our support team will respond shortly.</p>
    `,
  },

  'notification.generic': {
    category: 'transactional',
    subject: '{{tenantName}} — Shipment {{refNumber}}',
    body: `<p>{{bodyContent}}</p>`,
  },
};

/** Which merge tags a template actually uses, derived from its own default
 *  subject+body rather than hand-declared — a hand-maintained list would
 *  drift the moment someone edits a default without updating it separately.
 *  Drives the editor's merge-tag chip row per template_key. */
export const EMAIL_TEMPLATE_VARS: Record<string, string[]> = Object.fromEntries(
  Object.entries(EMAIL_TEMPLATE_DEFAULTS).map(([key, def]) => {
    const matches = `${def.subject} ${def.body}`.matchAll(/{{\s*(\w+)\s*}}/g);
    const vars = [...new Set([...matches].map(m => m[1]))];
    return [key, vars];
  }),
);
