-- Seed Hudumika-official marketplace email templates.
-- All are published, is_hudumika_official = TRUE, author_name = 'Hudumika'.
-- These are the canonical defaults; tenants import a copy into their own email_templates.

INSERT INTO marketplace_email_templates
  (slug, title, description, category, application, event_key, tags, subject, preheader, body_html, body_plain, available_vars, version, is_featured, is_hudumika_official, author_name, status, published_at)
VALUES

-- ── Finance ──────────────────────────────────────────────────────────────────
(
  'hudumika-invoice-issued',
  'Invoice — Clean & Professional',
  'A polished invoice notification with itemised totals table, CTA button to the online portal, and your company branding.',
  'finance', 'FinOps', 'finance.invoice.issued',
  ARRAY['invoice','finance','billing'],
  'Invoice {{invoice_number}} — {{amount_due}} due {{due_date}}',
  'Your invoice is ready to view and pay online.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Invoice {{invoice_number}}</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">{{tenant_name}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="margin:0 0 8px;font-size:14px;color:#172033">Hi {{customer_name}},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569">An invoice has been issued to your account. Please review and pay by the due date.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Invoice #</td><td style="color:#172033;font-weight:600;text-align:right;padding:8px 12px">{{invoice_number}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Due Date</td><td style="color:#172033;font-weight:600;text-align:right;padding:8px 12px">{{due_date}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Amount Due</td><td style="color:#0d7a6b;font-size:16px;font-weight:700;text-align:right;padding:8px 12px">{{currency}} {{amount_due}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{portal_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Pay Invoice</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · {{tenant_address}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}},
Invoice {{invoice_number}} for {{currency}} {{amount_due}} is due on {{due_date}}.
Pay online: {{portal_url}}

{{tenant_name}}',
  ARRAY['customer_name','invoice_number','amount_due','due_date','currency','portal_url','tenant_name','tenant_address'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
),

(
  'hudumika-payment-received',
  'Payment Received — Receipt',
  'Clean payment receipt confirming the amount received, invoice reference, and transaction details.',
  'finance', 'FinOps', 'finance.payment.received',
  ARRAY['payment','receipt','finance'],
  'Payment received — {{currency}} {{amount_paid}} for Invoice {{invoice_number}}',
  'Thank you for your payment. Your account is up to date.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Receipt</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#059669;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">&#10003; Payment Received</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">{{payment_date}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="margin:0 0 20px;font-size:14px;color:#475569">Hi {{customer_name}}, thank you for your payment. Here is your receipt.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Invoice #</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{invoice_number}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Amount Paid</td><td style="color:#059669;font-weight:700;font-size:15px;text-align:right;padding:8px 12px">{{currency}} {{amount_paid}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Payment Method</td><td style="text-align:right;padding:8px 12px">{{payment_method}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Reference</td><td style="text-align:right;padding:8px 12px">{{reference}}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}}, thank you for your payment of {{currency}} {{amount_paid}} for Invoice {{invoice_number}} on {{payment_date}}. Reference: {{reference}}.',
  ARRAY['customer_name','invoice_number','amount_paid','currency','payment_date','payment_method','reference','tenant_name'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
),

(
  'hudumika-invoice-overdue',
  'Invoice Overdue — Urgent Reminder',
  'Firm but professional overdue notice with red accent, outstanding balance, and days-past-due count.',
  'finance', 'FinOps', 'finance.invoice.overdue',
  ARRAY['invoice','overdue','reminder','finance'],
  'OVERDUE: Invoice {{invoice_number}} — {{days_overdue}} days past due',
  'Your invoice is overdue. Please settle to avoid service interruption.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Overdue Invoice</title></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#dc2626;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Invoice Overdue</p><p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">{{days_overdue}} days past due</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="margin:0 0 8px;font-size:14px;color:#172033">Hi {{customer_name}},</p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569">Invoice <strong>{{invoice_number}}</strong> was due on <strong>{{due_date}}</strong> and remains unpaid. Please settle immediately to avoid service interruption.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #fecaca;border-radius:6px;background:#fff5f5;font-size:13px">
      <tr><td style="color:#64748b;padding:8px 12px">Invoice #</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{invoice_number}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Original Due</td><td style="text-align:right;padding:8px 12px">{{due_date}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Days Overdue</td><td style="color:#dc2626;font-weight:700;text-align:right;padding:8px 12px">{{days_overdue}} days</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Amount Outstanding</td><td style="color:#dc2626;font-size:16px;font-weight:700;text-align:right;padding:8px 12px">{{currency}} {{amount_due}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{portal_url}}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Pay Now</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}}, Invoice {{invoice_number}} ({{currency}} {{amount_due}}) is {{days_overdue}} days past its due date of {{due_date}}. Please pay immediately at {{portal_url}}.',
  ARRAY['customer_name','invoice_number','amount_due','days_overdue','due_date','currency','portal_url','tenant_name'],
  '1.0.0', FALSE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── CRM ───────────────────────────────────────────────────────────────────────
(
  'hudumika-proposal-sent',
  'Proposal Sent — Branded Cover',
  'Professional proposal delivery email with company branding, proposal summary, and acceptance CTA.',
  'crm', 'CRM', 'crm.proposal.sent',
  ARRAY['proposal','crm','sales'],
  '{{proposal_title}} — Proposal from {{tenant_name}}',
  'Your proposal is ready to review. We look forward to working with you.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">{{proposal_title}}</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">Proposal prepared by {{tenant_name}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{customer_name}},<br><br>Thank you for the opportunity. Please find your proposal attached and available online.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Proposal</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{proposal_title}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Valid Until</td><td style="text-align:right;padding:8px 12px">{{valid_until}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Total Value</td><td style="color:#0d7a6b;font-weight:700;text-align:right;padding:8px 12px">{{currency}} {{total_value}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{proposal_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">View Proposal</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}}, please find your proposal "{{proposal_title}}" from {{tenant_name}} at {{proposal_url}}. Valid until {{valid_until}}.',
  ARRAY['customer_name','proposal_title','valid_until','total_value','currency','proposal_url','tenant_name'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── eSign ─────────────────────────────────────────────────────────────────────
(
  'hudumika-esign-signature-request',
  'eSign — Signature Request',
  'Clear signature request email with document name, deadline, and a one-click "Review & Sign" button.',
  'esign', 'eSign', 'esign.signature.requested',
  ARRAY['esign','signature','document'],
  'Your signature is required — {{document_title}}',
  'Please review and sign this document.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Signature Required</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">Sent by {{sender_name}} via {{tenant_name}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{recipient_name}},<br><br>{{sender_name}} has sent you a document for electronic signature.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Document</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{document_title}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Sent By</td><td style="text-align:right;padding:8px 12px">{{sender_name}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Deadline</td><td style="color:#dc2626;font-weight:600;text-align:right;padding:8px 12px">{{deadline}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{signing_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Review &amp; Sign</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:12px 0 0">Or copy this link: {{signing_url}}</p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika eSign</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{recipient_name}}, {{sender_name}} needs your signature on "{{document_title}}". Sign by {{deadline}} at {{signing_url}}.',
  ARRAY['recipient_name','sender_name','document_title','deadline','signing_url','tenant_name'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── HR ────────────────────────────────────────────────────────────────────────
(
  'hudumika-hr-employee-invite',
  'HR — Employee Welcome & Account Setup',
  'Warm welcome email for new employees with account setup link, manager''s name, and first-day details.',
  'hr', 'NexusHR', 'hr.employee.invited',
  ARRAY['hr','onboarding','welcome','employee'],
  'Welcome to {{tenant_name}} — Set up your account',
  'You''ve been added to the team. Click to set up your account.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:24px;font-weight:700">Welcome to {{tenant_name}}!</p><p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">We''re excited to have you on the team.</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{employee_name}},<br><br>Your account has been created. Please set up your password to get started.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Your Role</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{job_title}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Department</td><td style="text-align:right;padding:8px 12px">{{department}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Start Date</td><td style="text-align:right;padding:8px 12px">{{start_date}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Your Manager</td><td style="text-align:right;padding:8px 12px">{{manager_name}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{setup_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Set Up My Account</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:12px 0 0">Link expires in 72 hours.</p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika HR</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{employee_name}}, welcome to {{tenant_name}}! Your role is {{job_title}} in {{department}}, starting {{start_date}}. Set up your account at {{setup_url}}.',
  ARRAY['employee_name','job_title','department','start_date','manager_name','setup_url','tenant_name'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
),

(
  'hudumika-hr-payslip-ready',
  'HR — Payslip Ready',
  'Payslip notification with period, net pay, and a portal link. Clean and private.',
  'hr', 'NexusHR', 'hr.payslip.ready',
  ARRAY['hr','payroll','payslip'],
  'Your payslip for {{period}} is ready',
  'Your payslip is ready to view.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Payslip Ready</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">{{period}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{employee_name}},<br>Your payslip for <strong>{{period}}</strong> has been processed and is ready to view.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Pay Period</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{period}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Net Pay</td><td style="color:#059669;font-weight:700;font-size:15px;text-align:right;padding:8px 12px">{{currency}} {{net_pay}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Pay Date</td><td style="text-align:right;padding:8px 12px">{{pay_date}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{portal_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">View Payslip</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · HR &amp; Payroll</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{employee_name}}, your payslip for {{period}} is ready. Net pay: {{currency}} {{net_pay}}. View at {{portal_url}}.',
  ARRAY['employee_name','period','net_pay','pay_date','currency','portal_url','tenant_name'],
  '1.0.0', FALSE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── Support ───────────────────────────────────────────────────────────────────
(
  'hudumika-support-ticket-received',
  'Support — Ticket Confirmation',
  'Instant ticket acknowledgement with ticket number, summary, and expected response time.',
  'support', 'Support', 'support.ticket.received',
  ARRAY['support','ticket','helpdesk'],
  'We received your request — Ticket #{{ticket_number}}',
  'We''ve got your ticket and will respond soon.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Ticket #{{ticket_number}}</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">We''re on it!</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 16px">Hi {{customer_name}},<br><br>We''ve received your support request and assigned it ticket number <strong>#{{ticket_number}}</strong>.</p>
    <div style="background:#f8fafc;border-left:4px solid #0d7a6b;padding:12px 16px;border-radius:0 6px 6px 0;margin:0 0 20px">
      <p style="margin:0;font-size:13px;color:#172033;font-style:italic">{{ticket_subject}}</p>
    </div>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr><td style="color:#64748b;padding:8px 12px">Priority</td><td style="text-align:right;padding:8px 12px;font-weight:600">{{priority}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Expected Response</td><td style="text-align:right;padding:8px 12px">{{response_time}}</td></tr>
    </table>
    <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">Reply to this email to add information to your ticket.</p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} Support · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}}, ticket #{{ticket_number}} has been created for "{{ticket_subject}}". Expected response: {{response_time}}.',
  ARRAY['customer_name','ticket_number','ticket_subject','priority','response_time','tenant_name'],
  '1.0.0', FALSE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── Security ─────────────────────────────────────────────────────────────────
(
  'hudumika-security-new-device',
  'Security — New Device Sign-In',
  'Immediate new device alert with device details, location, and a clear "This wasn''t me" CTA.',
  'security', 'Ondi', 'security.login.new_device',
  ARRAY['security','login','device'],
  'New sign-in to your account from {{device}}',
  'A new device signed in to your account.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#1e293b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">New Device Sign-In</p><p style="margin:4px 0 0;color:#94a3b8;font-size:13px">{{sign_in_time}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{user_name}},<br><br>Your account was accessed from a new device. If this was you, no action is needed.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Device</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{device}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Location</td><td style="text-align:right;padding:8px 12px">{{location}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Time</td><td style="text-align:right;padding:8px 12px">{{sign_in_time}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">IP Address</td><td style="text-align:right;padding:8px 12px">{{ip_address}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{secure_url}}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">This Wasn''t Me — Secure Account</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} Security · Do not share this email</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{user_name}}, a new sign-in to your account was detected from {{device}} in {{location}} at {{sign_in_time}}. If this wasn''t you, secure your account at {{secure_url}}.',
  ARRAY['user_name','device','location','sign_in_time','ip_address','secure_url','tenant_name'],
  '1.0.0', FALSE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── Projects ─────────────────────────────────────────────────────────────────
(
  'hudumika-task-assigned',
  'Projects — Task Assigned',
  'Task assignment notification with project name, due date, priority, and a direct link.',
  'projects', 'Projects', 'projects.task.assigned',
  ARRAY['projects','task','assignment'],
  'New task assigned to you: {{task_name}}',
  'You have been assigned a new task.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Task Assigned</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">{{project_name}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{assignee_name}},<br><br>{{assigner_name}} has assigned you a task.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Task</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{task_name}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Project</td><td style="text-align:right;padding:8px 12px">{{project_name}}</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Due Date</td><td style="text-align:right;padding:8px 12px">{{due_date}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Priority</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{priority}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{task_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">View Task</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{assignee_name}}, {{assigner_name}} assigned you "{{task_name}}" in {{project_name}}, due {{due_date}}. View it at {{task_url}}.',
  ARRAY['assignee_name','assigner_name','task_name','project_name','due_date','priority','task_url','tenant_name'],
  '1.0.0', FALSE, TRUE, 'Hudumika', 'published', NOW()
),

-- ── Commerce ─────────────────────────────────────────────────────────────────
(
  'hudumika-order-confirmed',
  'Commerce — Order Confirmation',
  'Clean order confirmation with order number, item summary, delivery address, and order tracking link.',
  'commerce', 'Commerce', 'commerce.order.confirmed',
  ARRAY['commerce','order','ecommerce'],
  'Order confirmed — #{{order_number}}',
  'Your order has been placed successfully.',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:24px 32px"><p style="margin:0;color:#fff;font-size:22px;font-weight:700">Order Confirmed!</p><p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px">Order #{{order_number}}</p></td></tr>
  <tr><td style="padding:28px 32px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi {{customer_name}},<br><br>Thank you for your order. We''ll notify you when it ships.</p>
    <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Order #</td><td style="font-weight:600;text-align:right;padding:8px 12px">{{order_number}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Items</td><td style="text-align:right;padding:8px 12px">{{item_count}} item(s)</td></tr>
      <tr style="background:#f8fafc"><td style="color:#64748b;padding:8px 12px">Total</td><td style="color:#0d7a6b;font-weight:700;text-align:right;padding:8px 12px">{{currency}} {{total}}</td></tr>
      <tr><td style="color:#64748b;padding:8px 12px">Delivery To</td><td style="text-align:right;padding:8px 12px">{{delivery_address}}</td></tr>
    </table>
    <p style="text-align:center;margin:24px 0 0">
      <a href="{{order_url}}" style="display:inline-block;background:#0d7a6b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Track Order</a>
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">{{tenant_name}} · Sent via Hudumika</td></tr>
</table></td></tr></table></body></html>',
  'Hi {{customer_name}}, your order #{{order_number}} ({{currency}} {{total}}) has been confirmed. Track it at {{order_url}}.',
  ARRAY['customer_name','order_number','item_count','total','currency','delivery_address','order_url','tenant_name'],
  '1.0.0', TRUE, TRUE, 'Hudumika', 'published', NOW()
);
