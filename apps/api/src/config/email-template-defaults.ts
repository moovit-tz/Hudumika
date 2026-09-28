import type { EmailTemplateCategory } from '@hudumika/types';
import { APP_EMAIL_TEMPLATE_CATALOG, buildCatalogBody } from './app-email-template-catalog.js';

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
  'security.email.verify': {
    category: 'account',
    subject: 'Verify your Hudumika email address',
    body: `
      <p>Hello {{first_name}},</p>
      <p>Verify this email address to finish securing your Hudumika account.</p>
      <p><a href="{{verifyUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Verify email address</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  },
  'auth.password_reset': {
    category: 'account',
    subject: 'Reset your Hudumika password',
    body: `
      <p>We received a request to reset your Hudumika password.</p>
      <p><a href="{{resetUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Reset password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  },
  'auth.magic_link': {
    category: 'account',
    subject: 'Your Hudumika sign-in link',
    body: `
      <p>Click below to sign in to Hudumika — no password needed.</p>
      <p><a href="{{magicLinkUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Sign in</a></p>
      <p>This link expires in 15 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>
    `,
  },
  'auth.recovery_request': {
    category: 'account',
    subject: '{{requesterName}} named you as a recovery contact — action needed',
    body: `
      <p><strong>{{requesterName}}</strong> ({{requesterEmail}}) has lost access to their Hudumika account and is asking you, as one of their trusted recovery contacts, to vouch for them.</p>
      <p>Log in to your own Hudumika account and open <strong>Ondi ▸ Security Settings ▸ Recovery requests</strong> to review and approve or decline this request.</p>
      <p>If you approve, there is still a cooldown period before {{requesterName}} regains access — if this wasn't really them, they can cancel it just by logging in normally in the meantime.</p>
      <p>If you don't recognise this request, decline it or simply ignore this email.</p>
    `,
  },

  'onboarding.join_request': {
    category: 'account',
    subject: '{{requesterName}} wants to join {{tenantName}} on Hudumika',
    body: `
      <p><strong>{{requesterName}}</strong> ({{requesterEmail}}) signed up with an email on your company's domain and is asking to join <strong>{{tenantName}}</strong>'s existing workspace instead of starting a new one.</p>
      <p>Log in and open <strong>Ondi ▸ Users ▸ Join requests</strong> to approve or deny this request.</p>
      <p>If you don't recognise this person, you can safely deny it.</p>
    `,
  },
  'onboarding.join_approved': {
    category: 'account',
    subject: "You're in — {{tenantName}} approved your request",
    body: `
      <p>Good news — <strong>{{tenantName}}</strong> approved your request to join their Hudumika workspace.</p>
      <p><a href="{{loginUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Sign in</a></p>
      <p>Use the email and password you submitted with your request.</p>
    `,
  },
  'onboarding.join_denied': {
    category: 'account',
    subject: 'Your request to join {{tenantName}} was not approved',
    body: `
      <p>Your request to join <strong>{{tenantName}}</strong>'s Hudumika workspace was not approved{{reasonSuffix}}.</p>
      <p>If you believe this is a mistake, reach out to your company's Hudumika admin directly.</p>
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

  'agency.client_tenant_ready': {
    category: 'account',
    subject: '{{agencyName}} has set up your hosting account',
    body: `
      <p>{{agencyName}} has set up a hosting account for {{companyName}} on Hudumika.</p>
      <p><a href="{{acceptUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Activate your account</a></p>
      <p>This link expires in 7 days.</p>
    `,
  },

  'agency.client_detached': {
    category: 'account',
    subject: 'Your hosting is no longer managed by {{agencyName}}',
    body: `
      <p>{{agencyName}} is no longer managing hosting for {{companyName}} on Hudumika. Your account and all its data are unaffected — nothing was moved or deleted.</p>
      <p>To keep your sites, domains and DNS running, activate a plan of your own:</p>
      <p><a href="{{activateUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Activate hosting</a></p>
    `,
  },

  'agency.directory_inquiry': {
    category: 'account',
    subject: 'New inquiry from the agency directory: {{inquirerName}}',
    body: `
      <p>Someone found your "{{headline}}" listing in the Hudumika agency directory and wants to get in touch.</p>
      <p><strong>From:</strong> {{inquirerName}} ({{inquirerEmail}})</p>
      <p><strong>Message:</strong></p>
      <p>{{message}}</p>
      <p>Reply directly to {{inquirerEmail}} to follow up.</p>
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

  // Daily shipment-report automation — sent ~21:00 EAT, PDF attached
  // (mail.service.ts attachment plumbing), the WhatsApp send alongside it
  // carries the live link instead (see daily-shipment-report.job.ts).
  'clearos.daily_shipment_report': {
    category: 'transactional',
    subject: 'Shipment progress report — {{refNumber}}',
    body: `
      <p>Hello {{customerName}},</p>
      <p>Attached is today's progress report for shipment <strong>{{refNumber}}</strong> — currently at <strong>{{stageLabel}}</strong>.</p>
      <p>Reply to this email or reach your clearing agent directly with any questions.</p>
    `,
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

  // ── Finance ─────────────────────────────────────────────────────────────
  'finance.invoice.issued': {
    category: 'transactional',
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Please find below your invoice from <strong>{{companyName}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Invoice number</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{invoiceNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Invoice date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{invoiceDate}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Due date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{dueDate}}</td></tr>
        <tr><td style="padding:12px 0;font-weight:700;font-size:15px;">Total due</td><td style="padding:12px 0;text-align:right;font-weight:700;font-size:15px;">{{amountDue}}</td></tr>
      </table>
      {{lineItemsHtml}}
      <p>{{paymentInstructions}}</p>
      <p><a href="{{invoiceUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View &amp; pay invoice</a></p>
      <p>Please reach out if you have any questions.</p>
    `,
  },
  'finance.invoice.due_soon': {
    category: 'transactional',
    subject: 'Reminder: Invoice {{invoiceNumber}} is due {{dueDate}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong> is due on <strong>{{dueDate}}</strong>.</p>
      <p><a href="{{invoiceUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View &amp; pay invoice</a></p>
      <p>If you have already arranged payment, please ignore this reminder.</p>
    `,
  },
  'finance.invoice.overdue': {
    category: 'transactional',
    subject: 'Overdue: Invoice {{invoiceNumber}} — {{daysOverdue}} days past due',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong> is now <strong>{{daysOverdue}} days overdue</strong>.</p>
      <p>Please arrange payment at your earliest convenience to avoid late charges.</p>
      <p><a href="{{invoiceUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Pay now</a></p>
      <p>If you are experiencing difficulties, please contact us to discuss a payment arrangement.</p>
    `,
  },
  'finance.payment.received': {
    category: 'transactional',
    subject: 'Payment received — {{receiptNumber}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>We have received your payment. Thank you!</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Receipt number</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{receiptNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Invoice</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{invoiceNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Payment date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{paymentDate}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Method</td><td style="padding:8px 0;text-align:right;">{{paymentMethod}}</td></tr>
        <tr><td style="padding:12px 0;font-weight:700;font-size:15px;">Amount received</td><td style="padding:12px 0;text-align:right;font-weight:700;font-size:15px;">{{amountPaid}}</td></tr>
      </table>
    `,
  },
  'finance.quotation.sent': {
    category: 'transactional',
    subject: 'Quotation {{quoteNumber}} from {{companyName}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Please find attached our quotation <strong>{{quoteNumber}}</strong> for your review.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Quote number</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{quoteNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Valid until</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{validUntil}}</td></tr>
        <tr><td style="padding:12px 0;font-weight:700;">Total</td><td style="padding:12px 0;text-align:right;font-weight:700;">{{totalAmount}}</td></tr>
      </table>
      <p><a href="{{quoteUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View quotation</a></p>
      <p>Please let us know if you'd like any changes or have questions.</p>
    `,
  },

  // ── CRM ──────────────────────────────────────────────────────────────────
  'crm.lead.assigned': {
    category: 'transactional',
    subject: 'New lead assigned: {{leadName}}',
    body: `
      <p>Hi {{assigneeName}},</p>
      <p>A new lead has been assigned to you.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Name</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{leadName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Company</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{company}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Source</td><td style="padding:8px 0;text-align:right;">{{source}}</td></tr>
      </table>
      <p><a href="{{leadUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View lead</a></p>
    `,
  },
  'crm.opportunity.won': {
    category: 'transactional',
    subject: '🎉 Deal won: {{dealName}}',
    body: `
      <p>Congratulations {{salespersonName}}!</p>
      <p>The deal <strong>{{dealName}}</strong> has been marked as <strong>Won</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Customer</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{customerName}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Value</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#059669;">{{value}}</td></tr>
      </table>
      <p><a href="{{dealUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View deal</a></p>
    `,
  },
  'crm.proposal.sent': {
    category: 'transactional',
    subject: '{{proposalTitle}} — proposal from {{companyName}}',
    body: `
      <p>Dear {{contactName}},</p>
      <p>Please find below the proposal we have prepared for you.</p>
      <h2 style="font-size:18px;margin:16px 0 8px;">{{proposalTitle}}</h2>
      <p>The proposal is valid until <strong>{{validUntil}}</strong>.</p>
      <p><a href="{{proposalUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View proposal</a></p>
      <p>Please don't hesitate to reach out if you have any questions.</p>
      <p>Kind regards,<br /><strong>{{senderName}}</strong><br />{{senderTitle}}</p>
    `,
  },

  // ── Support ───────────────────────────────────────────────────────────────
  'support.ticket.resolved': {
    category: 'support',
    subject: 'Your ticket {{ticketRef}} has been resolved',
    body: `
      <p>Dear {{contactName}},</p>
      <p>We're pleased to let you know that your support ticket <strong>{{ticketRef}}</strong> has been resolved.</p>
      <p style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;border-radius:4px;">{{resolutionNote}}</p>
      <p><a href="{{ticketUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View ticket</a></p>
      <p>If your issue persists, please reply to reopen the ticket.</p>
    `,
  },
  'support.ticket.escalated': {
    category: 'support',
    subject: 'Ticket escalated: {{ticketRef}} — {{subject}}',
    body: `
      <p>A support ticket requires your immediate attention.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Ticket</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{ticketRef}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Subject</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{subject}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Reason</td><td style="padding:8px 0;text-align:right;">{{escalationReason}}</td></tr>
      </table>
      <p><a href="{{ticketUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Review escalation</a></p>
    `,
  },

  // ── eSign ─────────────────────────────────────────────────────────────────
  'esign.signature.requested': {
    category: 'transactional',
    subject: 'Please sign: {{documentTitle}}',
    body: `
      <p>Dear {{signerName}},</p>
      <p><strong>{{senderName}}</strong> has sent you a document for your signature.</p>
      <p style="font-weight:600;font-size:15px;">{{documentTitle}}</p>
      <p>This signature request expires on <strong>{{expiresAt}}</strong>.</p>
      <p><a href="{{signUrl}}" style="background:#0d7a6b;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">Sign document</a></p>
      <p style="font-size:12px;color:#6b7280;">By clicking "Sign document", you agree to sign this document electronically. This link is personal and should not be shared.</p>
    `,
  },
  'esign.document.completed': {
    category: 'transactional',
    subject: 'Document signed and completed: {{documentTitle}}',
    body: `
      <p>Dear {{recipientName}},</p>
      <p>All parties have signed <strong>{{documentTitle}}</strong>. The document is now complete.</p>
      <p>Completed on: <strong>{{completedAt}}</strong></p>
      <p><a href="{{downloadUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Download signed copy</a></p>
    `,
  },
  'esign.signing.reminder': {
    category: 'transactional',
    subject: 'Reminder: please sign {{documentTitle}}',
    body: `
      <p>Dear {{signerName}},</p>
      <p>A gentle reminder — <strong>{{documentTitle}}</strong> is still awaiting your signature.</p>
      <p>This request expires on <strong>{{expiresAt}}</strong>.</p>
      <p><a href="{{signUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Sign now</a></p>
    `,
  },

  // ── Security (new device login) ───────────────────────────────────────────
  'security.login.new_device': {
    category: 'account',
    subject: 'New login to your Hudumika account',
    body: `
      <p>A sign-in was detected from a new device or location.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Device</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{device}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Location</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{location}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;text-align:right;">{{time}}</td></tr>
      </table>
      <p>If this was you, no action is needed. If you don't recognise this sign-in, reset your password immediately.</p>
    `,
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  'hr.leave.approved': {
    category: 'transactional',
    subject: 'Your {{leaveType}} request has been approved',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Your leave request has been approved.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Leave type</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{leaveType}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">From</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{startDate}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">To</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{endDate}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Approved by</td><td style="padding:8px 0;text-align:right;">{{approvedBy}}</td></tr>
      </table>
    `,
  },
  'hr.leave.rejected': {
    category: 'transactional',
    subject: 'Your {{leaveType}} request was not approved',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Unfortunately your leave request from <strong>{{startDate}}</strong> was not approved.</p>
      <p><strong>Reason:</strong> {{rejectionReason}}</p>
      <p>Please speak to your manager if you have questions.</p>
    `,
  },

  // ── Projects ─────────────────────────────────────────────────────────────
  'projects.task.assigned': {
    category: 'transactional',
    subject: 'Task assigned: {{taskTitle}}',
    body: `
      <p>Hi {{assigneeName}},</p>
      <p>A new task has been assigned to you by <strong>{{assignerName}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Task</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{taskTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Project</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{projectName}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Due</td><td style="padding:8px 0;text-align:right;">{{dueDate}}</td></tr>
      </table>
      <p><a href="{{taskUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View task</a></p>
    `,
  },
  'projects.milestone.completed': {
    category: 'transactional',
    subject: 'Milestone completed: {{milestoneName}}',
    body: `
      <p>A project milestone has been completed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Milestone</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{milestoneName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Project</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{projectName}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Completed by</td><td style="padding:8px 0;text-align:right;">{{completedBy}}</td></tr>
      </table>
      <p><a href="{{projectUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View project</a></p>
    `,
  },

  // ── ClearOS ───────────────────────────────────────────────────────────────
  'clearos.shipment.created': {
    category: 'transactional',
    subject: 'New shipment opened — {{refNumber}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>A new shipment case has been opened for you.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Reference</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{refNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Mode</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{mode}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Origin</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{origin}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Destination</td><td style="padding:8px 0;text-align:right;">{{destination}}</td></tr>
      </table>
      <p><a href="{{shipmentUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Track shipment</a></p>
    `,
  },
  'clearos.customs.released': {
    category: 'transactional',
    subject: 'Customs released — Shipment {{refNumber}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Your goods for shipment <strong>{{refNumber}}</strong> have been released by customs.</p>
      <p>Release date: <strong>{{releaseDate}}</strong></p>
      <p>Delivery arrangements are now in progress.</p>
      <p><a href="{{shipmentUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View shipment</a></p>
    `,
  },
  'clearos.demurrage.warning': {
    category: 'transactional',
    subject: 'Demurrage warning — Shipment {{refNumber}} — {{freeDaysLeft}} day(s) remaining',
    body: `
      <p>Dear {{customerName}},</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;">
        <strong>Urgent:</strong> Your free storage days for shipment <strong>{{refNumber}}</strong> expire on <strong>{{lastFreeDay}}</strong> — only <strong>{{freeDaysLeft}}</strong> day(s) remaining. Daily demurrage charges will apply after this date.
      </p>
      <p>Please arrange for your goods to be collected promptly.</p>
      <p><a href="{{shipmentUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View shipment urgently</a></p>
    `,
  },

  // ── Commerce ─────────────────────────────────────────────────────────────
  'commerce.order.confirmed': {
    category: 'transactional',
    subject: 'Order confirmed — {{orderNumber}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Thank you for your order! We've received it and are getting it ready.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Order number</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{orderNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Order date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{orderDate}}</td></tr>
        <tr><td style="padding:12px 0;font-weight:700;">Total</td><td style="padding:12px 0;text-align:right;font-weight:700;">{{totalAmount}}</td></tr>
      </table>
      {{itemsHtml}}
      <p><a href="{{orderUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View order</a></p>
    `,
  },
  'commerce.order.shipped': {
    category: 'transactional',
    subject: 'Your order {{orderNumber}} has shipped',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Great news — your order <strong>{{orderNumber}}</strong> is on its way!</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Carrier</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{carrier}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Tracking number</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{trackingNumber}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Estimated delivery</td><td style="padding:8px 0;text-align:right;">{{estimatedDelivery}}</td></tr>
      </table>
      <p><a href="{{trackingUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Track your order</a></p>
    `,
  },

  // ── Meetings ─────────────────────────────────────────────────────────────
  'meetings.meeting.invitation': {
    category: 'transactional',
    subject: "You're invited: {{meetingTitle}}",
    body: `
      <p>Dear {{participantName}},</p>
      <p><strong>{{organizer}}</strong> has invited you to a meeting.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Meeting</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{meetingTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">When</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{startTime}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Duration</td><td style="padding:8px 0;text-align:right;">{{duration}}</td></tr>
      </table>
      <p><a href="{{joinUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Join meeting</a></p>
    `,
  },

  // ── Cloud / Drive ─────────────────────────────────────────────────────────
  'cloud.file.shared': {
    category: 'transactional',
    subject: '{{sharerName}} shared a file with you',
    body: `
      <p>Hi {{recipientName}},</p>
      <p><strong>{{sharerName}}</strong> has shared a file with you.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">File</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{fileName}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Permission</td><td style="padding:8px 0;text-align:right;">{{permission}}</td></tr>
      </table>
      <p><a href="{{fileUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Open file</a></p>
    `,
  },

  // ── Ondi (identity, security, access) ────────────────────────────────────
  'ondi.mfa.otp': {
    category: 'account',
    subject: 'Your Hudumika verification code',
    body: `
      <p>Use the code below to complete your sign-in. It expires in 10 minutes.</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:0.18em;text-align:center;padding:20px 0;color:#111827;">{{code}}</p>
      <p>If you did not attempt to sign in, someone may be trying to access your account — reset your password immediately.</p>
    `,
  },
  'ondi.mfa.enabled': {
    category: 'account',
    subject: 'Two-factor authentication enabled on your account',
    body: `
      <p>Hi {{first_name}},</p>
      <p>Two-factor authentication has been successfully enabled on your Hudumika account.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Method</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{mfaMethod}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Enabled at</td><td style="padding:8px 0;text-align:right;">{{enabledAt}}</td></tr>
      </table>
      <p>If you did not make this change, contact your workspace admin immediately.</p>
    `,
  },
  'ondi.mfa.disabled': {
    category: 'account',
    subject: 'Two-factor authentication removed from your account',
    body: `
      <p>Hi {{first_name}},</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;">
        Two-factor authentication has been <strong>removed</strong> from your account. Your account is now less secure.
      </p>
      <p>If you did not make this change, reset your password and re-enable 2FA immediately.</p>
    `,
  },
  'ondi.password.changed': {
    category: 'account',
    subject: 'Your Hudumika password was changed',
    body: `
      <p>Hi {{first_name}},</p>
      <p>Your Hudumika password was successfully changed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Changed at</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{changedAt}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Device</td><td style="padding:8px 0;text-align:right;">{{device}}</td></tr>
      </table>
      <p>If this wasn't you, reset your password immediately and contact your workspace admin.</p>
    `,
  },
  'ondi.session.revoked': {
    category: 'account',
    subject: 'A session was signed out of your Hudumika account',
    body: `
      <p>Hi {{first_name}},</p>
      <p>A session was signed out of your account{{revokedBy}}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Device</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{device}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Signed out at</td><td style="padding:8px 0;text-align:right;">{{revokedAt}}</td></tr>
      </table>
      <p>If you did not request this, review your active sessions in <strong>Ondi ▸ Security Settings</strong>.</p>
    `,
  },
  'ondi.account.locked': {
    category: 'account',
    subject: 'Your Hudumika account has been temporarily locked',
    body: `
      <p>Hi {{first_name}},</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;">
        Your account was locked after <strong>{{failedAttempts}}</strong> failed sign-in attempts. It will automatically unlock after <strong>{{unlockAfter}}</strong>.
      </p>
      <p>To unlock it now, reset your password:</p>
      <p><a href="{{resetUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Reset password</a></p>
    `,
  },
  'ondi.jit.grant': {
    category: 'account',
    subject: 'Temporary access granted — {{resourceName}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>You have been granted temporary just-in-time (JIT) access to <strong>{{resourceName}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Granted by</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{grantedBy}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Access level</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{accessLevel}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Expires</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626;">{{expiresAt}}</td></tr>
      </table>
      <p>This access is time-limited and will be revoked automatically when it expires.</p>
    `,
  },
  'ondi.breakglass.used': {
    category: 'account',
    subject: 'SECURITY ALERT — Break-glass access used on {{tenantName}}',
    body: `
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;font-weight:600;">
        Emergency break-glass access was exercised on your workspace.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Accessed by</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{accessedBy}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Reason</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{reason}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;text-align:right;">{{accessedAt}}</td></tr>
      </table>
      <p>A full audit trail has been recorded. If this was not authorised, contact Hudumika support immediately.</p>
    `,
  },
  'ondi.email.changed': {
    category: 'account',
    subject: 'Your Hudumika login email was changed',
    body: `
      <p>Hi {{first_name}},</p>
      <p>The login email on your Hudumika account was changed from <strong>{{oldEmail}}</strong> to <strong>{{newEmail}}</strong>.</p>
      <p>If you did not make this change, contact your workspace admin and reset your password immediately.</p>
    `,
  },

  // ── FinOps extensions ─────────────────────────────────────────────────────
  'finops.expense.approved': {
    category: 'transactional',
    subject: 'Your expense claim has been approved — {{expenseTitle}}',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Your expense claim has been approved and will be included in your next payroll run.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Claim</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{expenseTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Amount</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#059669;">{{amount}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Approved by</td><td style="padding:8px 0;text-align:right;">{{approvedBy}}</td></tr>
      </table>
    `,
  },
  'finops.expense.rejected': {
    category: 'transactional',
    subject: 'Your expense claim was not approved — {{expenseTitle}}',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Your expense claim for <strong>{{amount}}</strong> was not approved.</p>
      <p><strong>Reason:</strong> {{rejectionReason}}</p>
      <p>Please speak to your manager or finance team if you have questions.</p>
    `,
  },
  'finops.budget.alert': {
    category: 'transactional',
    subject: 'Budget alert — {{budgetName}} is {{percentage}}% used',
    body: `
      <p>Hi {{recipientName}},</p>
      <p style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        The <strong>{{budgetName}}</strong> budget has reached <strong>{{percentage}}%</strong> of its limit.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Budget</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{budgetName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Spent</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{spent}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Limit</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{limit}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Period</td><td style="padding:8px 0;text-align:right;">{{period}}</td></tr>
      </table>
      <p><a href="{{budgetUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View budget</a></p>
    `,
  },
  'finops.statement.ready': {
    category: 'transactional',
    subject: 'Your {{period}} statement is ready — {{companyName}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Your account statement for <strong>{{period}}</strong> is now available.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Period</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{period}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Opening balance</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{openingBalance}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Closing balance</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{closingBalance}}</td></tr>
      </table>
      <p><a href="{{statementUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View statement</a></p>
    `,
  },
  'finops.credit_note.issued': {
    category: 'transactional',
    subject: 'Credit note {{creditNoteNumber}} issued — {{companyName}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>A credit note has been issued against invoice <strong>{{invoiceNumber}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Credit note</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{creditNoteNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Original invoice</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{invoiceNumber}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Reason</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{reason}}</td></tr>
        <tr><td style="padding:12px 0;font-weight:700;">Credit amount</td><td style="padding:12px 0;text-align:right;font-weight:700;color:#059669;">{{creditAmount}}</td></tr>
      </table>
      <p>This credit will be applied to your next invoice or refunded per your payment terms.</p>
      <p><a href="{{creditNoteUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View credit note</a></p>
    `,
  },
  'finops.payment.failed': {
    category: 'transactional',
    subject: 'Payment failed — Invoice {{invoiceNumber}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;">
        A payment attempt for invoice <strong>{{invoiceNumber}}</strong> ({{amountDue}}) was unsuccessful.
      </p>
      <p><strong>Reason:</strong> {{failureReason}}</p>
      <p>Please update your payment details or try a different method.</p>
      <p><a href="{{invoiceUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Retry payment</a></p>
    `,
  },
  'finops.bank_recon.discrepancy': {
    category: 'transactional',
    subject: 'Reconciliation discrepancy found — {{bankAccount}} — {{period}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        A discrepancy was found during bank reconciliation for <strong>{{bankAccount}}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Account</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{bankAccount}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Period</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{period}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Book balance</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{bookBalance}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Bank balance</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{bankBalance}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Difference</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#dc2626;">{{difference}}</td></tr>
      </table>
      <p><a href="{{reconUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Review reconciliation</a></p>
    `,
  },
  'finops.gl.period_closed': {
    category: 'transactional',
    subject: 'GL period closed — {{period}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>The accounting period <strong>{{period}}</strong> has been closed by <strong>{{closedBy}}</strong>.</p>
      <p>No further journal entries or adjustments can be posted to this period. Any corrections must be made in the current open period.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Period</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{period}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Closed at</td><td style="padding:8px 0;text-align:right;">{{closedAt}}</td></tr>
      </table>
    `,
  },
  'finops.petti.approved': {
    category: 'transactional',
    subject: 'Petty cash disbursement approved — {{expenseTitle}}',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Your petty cash request has been approved and disbursed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Description</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{expenseTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Amount</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#059669;">{{amount}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Approved by</td><td style="padding:8px 0;text-align:right;">{{approvedBy}}</td></tr>
      </table>
    `,
  },

  // ── NexusHR extensions ────────────────────────────────────────────────────
  'nexushr.onboarding.welcome': {
    category: 'account',
    subject: 'Welcome to {{companyName}} — your first day',
    body: `
      <p>Hi {{firstName}},</p>
      <p>We're thrilled to have you joining <strong>{{companyName}}</strong> as <strong>{{jobTitle}}</strong> on <strong>{{startDate}}</strong>.</p>
      <p>Here are a few things to get you started:</p>
      <ul style="padding-left:20px;color:#374151;line-height:1.8;">
        <li>Your manager is <strong>{{managerName}}</strong></li>
        <li>Reporting to: <strong>{{department}}</strong></li>
        <li>Work location: <strong>{{workLocation}}</strong></li>
      </ul>
      <p>Your Hudumika account is ready — sign in to complete your profile, review your contract, and access your onboarding checklist.</p>
      <p><a href="{{loginUrl}}" style="background:#0d7a6b;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">Get started</a></p>
    `,
  },
  'nexushr.contract.sent': {
    category: 'transactional',
    subject: 'Your employment contract is ready to sign — {{companyName}}',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>Your employment contract from <strong>{{companyName}}</strong> is ready for your review and signature.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Role</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{jobTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Start date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{startDate}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Please sign by</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626;">{{signBy}}</td></tr>
      </table>
      <p><a href="{{signUrl}}" style="background:#0d7a6b;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">Review and sign</a></p>
    `,
  },
  'nexushr.performance.review_due': {
    category: 'transactional',
    subject: 'Performance review due — {{revieweeName}}',
    body: `
      <p>Hi {{reviewerName}},</p>
      <p>A performance review for <strong>{{revieweeName}}</strong> is due on <strong>{{dueDate}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Employee</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{revieweeName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Review cycle</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{reviewCycle}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Due date</td><td style="padding:8px 0;text-align:right;font-weight:600;">{{dueDate}}</td></tr>
      </table>
      <p><a href="{{reviewUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Start review</a></p>
    `,
  },
  'nexushr.recruitment.application_received': {
    category: 'transactional',
    subject: 'Application received — {{jobTitle}} at {{companyName}}',
    body: `
      <p>Dear {{applicantName}},</p>
      <p>Thank you for applying for the <strong>{{jobTitle}}</strong> position at <strong>{{companyName}}</strong>. We have received your application and will be in touch.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Position</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{jobTitle}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Application ref</td><td style="padding:8px 0;text-align:right;">{{applicationRef}}</td></tr>
      </table>
      <p>We review all applications carefully. If your profile is a good fit, we will contact you to arrange an interview.</p>
    `,
  },
  'nexushr.recruitment.interview_scheduled': {
    category: 'transactional',
    subject: 'Interview scheduled — {{jobTitle}} at {{companyName}}',
    body: `
      <p>Dear {{applicantName}},</p>
      <p>We'd like to invite you to an interview for the <strong>{{jobTitle}}</strong> role.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Date &amp; time</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{interviewTime}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Format</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{interviewFormat}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Interviewer(s)</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{interviewers}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Location / link</td><td style="padding:8px 0;text-align:right;">{{interviewLocation}}</td></tr>
      </table>
      <p>Please confirm your attendance by replying to this email.</p>
    `,
  },
  'nexushr.employee.offboarded': {
    category: 'transactional',
    subject: 'Offboarding confirmation — {{employeeName}}',
    body: `
      <p>Hi {{employeeName}},</p>
      <p>This confirms that your employment with <strong>{{companyName}}</strong> has ended on <strong>{{lastWorkingDay}}</strong>.</p>
      <p>Your Hudumika account will remain accessible until <strong>{{accessRevokedAt}}</strong>. Please ensure you have saved any personal files before then.</p>
      <p>Your final payslip and any outstanding payments will be processed in the next payroll run. Please contact HR if you have any questions.</p>
    `,
  },

  // ── CargoTracker ──────────────────────────────────────────────────────────
  'cargotracker.booking.confirmed': {
    category: 'transactional',
    subject: 'Booking confirmed — {{bookingRef}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Your cargo booking has been confirmed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Booking ref</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{bookingRef}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Carrier</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{carrier}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Service</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{service}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">ETD</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{etd}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">ETA</td><td style="padding:8px 0;text-align:right;">{{eta}}</td></tr>
      </table>
      <p><a href="{{bookingUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View booking</a></p>
    `,
  },
  'cargotracker.booking.cancelled': {
    category: 'transactional',
    subject: 'Booking cancelled — {{bookingRef}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Your cargo booking <strong>{{bookingRef}}</strong> has been cancelled.</p>
      <p><strong>Reason:</strong> {{cancellationReason}}</p>
      <p>Please contact us to rebook or discuss alternatives.</p>
    `,
  },
  'cargotracker.delivery.scheduled': {
    category: 'transactional',
    subject: 'Delivery scheduled — {{bookingRef}}',
    body: `
      <p>Dear {{customerName}},</p>
      <p>Delivery of your cargo <strong>{{bookingRef}}</strong> has been scheduled.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Delivery date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{deliveryDate}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Delivery address</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{deliveryAddress}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Driver</td><td style="padding:8px 0;text-align:right;">{{driverName}}</td></tr>
      </table>
      <p>Please ensure someone is available at the delivery address to receive the goods.</p>
    `,
  },

  // ── HuduFreight ───────────────────────────────────────────────────────────
  'freight.trip.assigned': {
    category: 'transactional',
    subject: 'New trip assigned — {{tripRef}}',
    body: `
      <p>Hi {{driverName}},</p>
      <p>A new trip has been assigned to you.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Trip ref</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{tripRef}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Pickup</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{pickupLocation}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Delivery</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{deliveryLocation}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Departure</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{departureTime}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Vehicle</td><td style="padding:8px 0;text-align:right;">{{vehiclePlate}}</td></tr>
      </table>
      <p><a href="{{tripUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View trip details</a></p>
    `,
  },
  'freight.trip.completed': {
    category: 'transactional',
    subject: 'Trip completed — {{tripRef}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>Trip <strong>{{tripRef}}</strong> has been completed by <strong>{{driverName}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Driver</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{driverName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Completed at</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{completedAt}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Distance</td><td style="padding:8px 0;text-align:right;">{{distance}}</td></tr>
      </table>
      <p><a href="{{tripUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View trip report</a></p>
    `,
  },

  // ── Bliss (meetings / calls) ──────────────────────────────────────────────
  'bliss.meeting.summary': {
    category: 'transactional',
    subject: 'Meeting summary — {{meetingTitle}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>Here is the AI-generated summary for your meeting <strong>{{meetingTitle}}</strong> on {{meetingDate}}.</p>
      <h4 style="margin:16px 0 8px;font-size:14px;font-weight:700;color:#111827;">Key points</h4>
      <div style="background:#f9fafb;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.7;color:#374151;">{{summaryContent}}</div>
      <h4 style="margin:16px 0 8px;font-size:14px;font-weight:700;color:#111827;">Action items</h4>
      <div style="background:#f0fdf4;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.7;color:#374151;">{{actionItems}}</div>
      <p><a href="{{meetingUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View full transcript</a></p>
    `,
  },
  'bliss.meeting.recording_ready': {
    category: 'transactional',
    subject: 'Recording ready — {{meetingTitle}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>The recording for <strong>{{meetingTitle}}</strong> is ready.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Meeting</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{meetingTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{meetingDate}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Duration</td><td style="padding:8px 0;text-align:right;">{{duration}}</td></tr>
      </table>
      <p>The recording will be available for <strong>{{retentionDays}}</strong> days.</p>
      <p><a href="{{recordingUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Watch recording</a></p>
    `,
  },

  // ── Calendar ──────────────────────────────────────────────────────────────
  'calendar.event.reminder': {
    category: 'transactional',
    subject: 'Reminder: {{eventTitle}} starts in {{reminderTime}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>Your event <strong>{{eventTitle}}</strong> starts in <strong>{{reminderTime}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">When</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{startTime}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Duration</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{duration}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Location</td><td style="padding:8px 0;text-align:right;">{{location}}</td></tr>
      </table>
      {{joinLinkHtml}}
    `,
  },
  'calendar.event.cancelled': {
    category: 'transactional',
    subject: 'Event cancelled: {{eventTitle}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>The event <strong>{{eventTitle}}</strong> scheduled for <strong>{{startTime}}</strong> has been cancelled by <strong>{{organizer}}</strong>.</p>
      {{cancellationNoteHtml}}
    `,
  },
  'calendar.booking.confirmed': {
    category: 'transactional',
    subject: 'Booking confirmed — {{eventTitle}} with {{hostName}}',
    body: `
      <p>Hi {{bookerName}},</p>
      <p>Your booking has been confirmed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Event</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{eventTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">With</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{hostName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">When</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{startTime}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Duration</td><td style="padding:8px 0;text-align:right;">{{duration}}</td></tr>
      </table>
      <p><a href="{{joinUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Join meeting</a></p>
      <p>Need to reschedule? <a href="{{rescheduleUrl}}">Click here</a></p>
    `,
  },

  // ── ComplyOS extensions ───────────────────────────────────────────────────
  'complyos.permit.expiring': {
    category: 'transactional',
    subject: 'Permit expiring soon — {{permitName}} — {{daysLeft}} day(s) remaining',
    body: `
      <p>Hi {{recipientName}},</p>
      <p style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        <strong>{{permitName}}</strong> is due to expire on <strong>{{expiryDate}}</strong> — only <strong>{{daysLeft}}</strong> day(s) remaining.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Permit</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{permitName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Issuing authority</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{issuingAuthority}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Expiry date</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626;">{{expiryDate}}</td></tr>
      </table>
      <p><a href="{{permitUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Renew permit</a></p>
    `,
  },
  'complyos.audit.scheduled': {
    category: 'transactional',
    subject: 'Compliance audit scheduled — {{auditTitle}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>A compliance audit has been scheduled for your workspace.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Audit</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{auditTitle}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Scheduled date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{auditDate}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Assigned to</td><td style="padding:8px 0;text-align:right;">{{assignedTo}}</td></tr>
      </table>
      <p><a href="{{auditUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Prepare for audit</a></p>
    `,
  },

  // ── Projects / Tasks extensions ───────────────────────────────────────────
  'projects.task.overdue': {
    category: 'transactional',
    subject: 'Overdue task: {{taskTitle}} — {{daysOverdue}} day(s) past due',
    body: `
      <p>Hi {{assigneeName}},</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:4px;">
        Task <strong>{{taskTitle}}</strong> was due on <strong>{{dueDate}}</strong> and is now <strong>{{daysOverdue}} day(s) overdue</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Project</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{projectName}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Original due date</td><td style="padding:8px 0;text-align:right;">{{dueDate}}</td></tr>
      </table>
      <p><a href="{{taskUrl}}" style="background:#dc2626;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Update task</a></p>
    `,
  },
  'projects.comment.mention': {
    category: 'transactional',
    subject: '{{mentionedBy}} mentioned you in {{contextTitle}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p><strong>{{mentionedBy}}</strong> mentioned you in a comment on <strong>{{contextTitle}}</strong>.</p>
      <div style="background:#f9fafb;border-left:3px solid #e5e7eb;padding:12px 16px;border-radius:0 4px 4px 0;margin:12px 0;font-size:13px;color:#374151;line-height:1.6;">{{commentText}}</div>
      <p><a href="{{contextUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View comment</a></p>
    `,
  },

  // ── CRM extensions ────────────────────────────────────────────────────────
  'crm.contract.expiring': {
    category: 'transactional',
    subject: 'Contract expiring soon — {{customerName}} — {{daysLeft}} day(s) remaining',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>The contract with <strong>{{customerName}}</strong> is set to expire on <strong>{{expiryDate}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Customer</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{customerName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Contract value</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{contractValue}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Expiry date</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#dc2626;">{{expiryDate}}</td></tr>
      </table>
      <p><a href="{{contractUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Renew contract</a></p>
    `,
  },
  'crm.followup.due': {
    category: 'transactional',
    subject: 'Follow-up due today — {{contactName}}',
    body: `
      <p>Hi {{assigneeName}},</p>
      <p>You have a follow-up scheduled today with <strong>{{contactName}}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Contact</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{contactName}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Company</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">{{company}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Notes</td><td style="padding:8px 0;text-align:right;">{{followUpNote}}</td></tr>
      </table>
      <p><a href="{{contactUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View contact</a></p>
    `,
  },

  // ── SMS ───────────────────────────────────────────────────────────────────
  'sms.campaign.completed': {
    category: 'transactional',
    subject: 'SMS campaign sent — {{campaignName}}',
    body: `
      <p>Hi {{recipientName}},</p>
      <p>Your SMS campaign <strong>{{campaignName}}</strong> has finished sending.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Total sent</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{totalSent}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Delivered</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#059669;font-weight:600;">{{delivered}}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Failed</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#dc2626;">{{failed}}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Delivery rate</td><td style="padding:8px 0;text-align:right;font-weight:700;">{{deliveryRate}}%</td></tr>
      </table>
      <p><a href="{{campaignUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">View campaign report</a></p>
    `,
  },
};

for (const entry of APP_EMAIL_TEMPLATE_CATALOG) {
  EMAIL_TEMPLATE_DEFAULTS[entry.key] ??= {
    category: entry.category,
    subject: entry.title + ' — {{reference}}',
    body: buildCatalogBody(entry),
  };
}

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
