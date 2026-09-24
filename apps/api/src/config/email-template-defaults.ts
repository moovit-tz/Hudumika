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
