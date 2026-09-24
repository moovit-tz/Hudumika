/**
 * Ensures every EMAIL_TEMPLATE_DEFAULTS entry has a corresponding row in
 * marketplace_email_templates (is_hudumika_official = TRUE, status = 'published').
 * Run once at startup. Idempotent: existing rows (matched by slug) are skipped.
 */

import { EMAIL_TEMPLATE_DEFAULTS } from '../config/email-template-defaults.js';

const TEMPLATE_META: Record<string, { title: string; description: string; category: string; application: string; tags: string[] }> = {
  'security.email.verify':       { title: 'Verify Email Address',      description: 'Asks the user to confirm their email by clicking a verification link.',           category: 'auth',     application: 'Ondi',     tags: ['auth','account','verification'] },
  'auth.password_reset':         { title: 'Password Reset',            description: 'Delivers a secure one-time password reset link.',                                  category: 'auth',     application: 'Ondi',     tags: ['auth','password','reset'] },
  'auth.magic_link':             { title: 'Magic Sign-In Link',        description: 'Passwordless sign-in link for one-click authentication.',                          category: 'auth',     application: 'Ondi',     tags: ['auth','magic-link','login'] },
  'auth.recovery_request':       { title: 'Recovery Contact Request',  description: 'Notifies a trusted contact that a recovery request has been made.',                category: 'auth',     application: 'Ondi',     tags: ['auth','recovery','security'] },
  'onboarding.join_request':     { title: 'Workspace Join Request',    description: 'Tells an admin that someone has requested to join the workspace.',                 category: 'auth',     application: 'Ondi',     tags: ['onboarding','invite','workspace'] },
  'onboarding.join_approved':    { title: 'Join Request Approved',     description: 'Confirms to the user that their workspace join request was approved.',             category: 'auth',     application: 'Ondi',     tags: ['onboarding','approved'] },
  'onboarding.join_denied':      { title: 'Join Request Declined',     description: 'Informs the user their workspace request was not approved.',                       category: 'auth',     application: 'Ondi',     tags: ['onboarding','declined'] },
  'customers.claim_code':        { title: 'Customer Portal Code',      description: 'Sends a one-time access code for the self-service customer portal.',               category: 'crm',      application: 'CRM',      tags: ['crm','portal','otp'] },
  'hr.staff_invitation':         { title: 'Staff Invitation',          description: 'Invites a new team member to the workspace with a setup link.',                    category: 'hr',       application: 'NexusHR',  tags: ['hr','invite','staff'] },
  'hr.staff_invitation_reminder':{ title: 'Invitation Reminder',       description: 'Nudges a pending invitee who has not accepted yet.',                                category: 'hr',       application: 'NexusHR',  tags: ['hr','reminder','invite'] },
  'agency.client_tenant_ready':  { title: 'Client Workspace Ready',   description: 'Notifies an agency client that their workspace has been provisioned.',              category: 'general',  application: 'Ondi',     tags: ['agency','onboarding','client'] },
  'agency.client_detached':      { title: 'Client Workspace Detached',description: 'Informs a client that their workspace has been detached from the agency.',          category: 'general',  application: 'Ondi',     tags: ['agency','client'] },
  'agency.directory_inquiry':    { title: 'Directory Inquiry',         description: 'Passes a partner/referral inquiry from the public directory to the admin.',        category: 'general',  application: 'Ondi',     tags: ['agency','directory','inquiry'] },
  'payroll.payslip':             { title: 'Payslip Ready',             description: 'Notifies an employee that their payslip is available with a full breakdown.',      category: 'hr',       application: 'NexusHR',  tags: ['hr','payroll','payslip'] },
  'admin.raw_sql_otp':           { title: 'Raw SQL OTP',               description: 'Delivers a one-time OTP code for authorised raw SQL execution.',                   category: 'general',  application: 'Admin',    tags: ['admin','security','otp'] },
  'clearos.shipment_message':    { title: 'Shipment Message',          description: 'Forwards a message from a shipment conversation to the relevant party.',           category: 'clearos',  application: 'ClearOS',  tags: ['clearos','shipment','message'] },
  'clearos.daily_shipment_report':{ title: 'Daily Shipment Report',   description: 'Daily summary of active shipments and their current status.',                      category: 'clearos',  application: 'ClearOS',  tags: ['clearos','report','shipment'] },
  'complyos.renewal_alert':      { title: 'Compliance Renewal Alert',  description: 'Reminds staff of an upcoming compliance certificate or permit renewal.',          category: 'general',  application: 'ComplyOS', tags: ['compliance','renewal','alert'] },
  'support.ticket_update':       { title: 'Support Ticket Update',     description: 'Notifies the customer of a change in their support ticket status.',                category: 'support',  application: 'Support',  tags: ['support','ticket','update'] },
  'support.ticket_ack':          { title: 'Ticket Received',           description: 'Confirms to the customer that their support request has been logged.',             category: 'support',  application: 'Support',  tags: ['support','ticket','ack'] },
  'notification.generic':        { title: 'Generic Notification',      description: 'All-purpose notification wrapper for platform-level alerts.',                      category: 'general',  application: 'Ondi',     tags: ['notification','general'] },
  'finance.invoice.issued':      { title: 'Invoice Issued',            description: 'Clean invoice notification with itemised totals table and portal pay button.',    category: 'finance',  application: 'FinOps',   tags: ['invoice','finance','billing'] },
  'finance.invoice.due_soon':    { title: 'Invoice Due Soon',          description: 'Polite payment reminder with days remaining before the due date.',                category: 'finance',  application: 'FinOps',   tags: ['invoice','reminder','finance'] },
  'finance.invoice.overdue':     { title: 'Invoice Overdue',           description: 'Urgent overdue payment notice with outstanding balance highlighted.',             category: 'finance',  application: 'FinOps',   tags: ['invoice','overdue','finance'] },
  'finance.payment.received':    { title: 'Payment Received',          description: 'Immediate payment confirmation with receipt details and transaction reference.',  category: 'finance',  application: 'FinOps',   tags: ['payment','receipt','finance'] },
  'finance.quotation.sent':      { title: 'Quotation Sent',            description: 'Delivers a business quotation with line items, validity date and accept button.', category: 'finance',  application: 'FinOps',   tags: ['quotation','finance','crm'] },
  'crm.lead.assigned':           { title: 'Lead Assigned',             description: 'Alerts a sales rep that a new lead has been assigned to them.',                   category: 'crm',      application: 'CRM',      tags: ['crm','lead','sales'] },
  'crm.opportunity.won':         { title: 'Opportunity Won',           description: 'Celebrates a closed-won deal with the team member who closed it.',                category: 'crm',      application: 'CRM',      tags: ['crm','deal','won'] },
  'crm.proposal.sent':           { title: 'Proposal Sent',             description: 'Delivers a business proposal document to the prospect.',                          category: 'crm',      application: 'CRM',      tags: ['crm','proposal','sales'] },
  'support.ticket.resolved':     { title: 'Ticket Resolved',           description: 'Notifies the customer their support ticket has been closed and resolved.',        category: 'support',  application: 'Support',  tags: ['support','resolved','ticket'] },
  'support.ticket.escalated':    { title: 'Ticket Escalated',          description: 'Informs the customer their ticket has been escalated to a senior agent.',         category: 'support',  application: 'Support',  tags: ['support','escalation','ticket'] },
  'esign.signature.requested':   { title: 'Signature Request',         description: 'Requests an electronic signature on a document with a direct signing link.',     category: 'esign',    application: 'Sign',     tags: ['esign','signature','document'] },
  'esign.document.completed':    { title: 'Document Signed',           description: 'Confirms all parties have signed and the document is fully executed.',            category: 'esign',    application: 'Sign',     tags: ['esign','completed','document'] },
  'esign.signing.reminder':      { title: 'Signing Reminder',          description: 'Reminds a signer that a document is still awaiting their signature.',             category: 'esign',    application: 'Sign',     tags: ['esign','reminder','signature'] },
  'security.login.new_device':   { title: 'New Device Sign-In',        description: 'Security alert when the account is accessed from an unrecognised device.',       category: 'auth',     application: 'Ondi',     tags: ['security','login','device'] },
  'hr.leave.approved':           { title: 'Leave Approved',            description: 'Notifies an employee that their leave request has been approved.',                category: 'hr',       application: 'NexusHR',  tags: ['hr','leave','approved'] },
  'hr.leave.rejected':           { title: 'Leave Declined',            description: 'Informs an employee that their leave request was not approved.',                  category: 'hr',       application: 'NexusHR',  tags: ['hr','leave','declined'] },
  'projects.task.assigned':      { title: 'Task Assigned',             description: 'Notifies a team member that a task has been assigned to them.',                   category: 'general',  application: 'Projects', tags: ['projects','task','assigned'] },
  'projects.milestone.completed':{ title: 'Milestone Completed',       description: 'Celebrates completion of a project milestone with the relevant stakeholders.',   category: 'general',  application: 'Projects', tags: ['projects','milestone'] },
  'clearos.shipment.created':    { title: 'Shipment Created',          description: 'Confirms a new customs shipment case has been opened.',                           category: 'clearos',  application: 'ClearOS',  tags: ['clearos','shipment'] },
  'clearos.customs.released':    { title: 'Customs Released',          description: 'Alerts the customer that their cargo has been cleared by customs.',               category: 'clearos',  application: 'ClearOS',  tags: ['clearos','customs','released'] },
  'clearos.demurrage.warning':   { title: 'Demurrage Warning',         description: 'Urgent notice that demurrage fees are accruing on a container at port.',         category: 'clearos',  application: 'ClearOS',  tags: ['clearos','demurrage','port'] },
  'commerce.order.confirmed':    { title: 'Order Confirmed',           description: 'Order confirmation with line items, delivery estimate and order number.',        category: 'commerce', application: 'Store',    tags: ['commerce','order','confirmed'] },
  'commerce.order.shipped':      { title: 'Order Shipped',             description: 'Dispatch notification with tracking link and estimated delivery.',               category: 'commerce', application: 'Store',    tags: ['commerce','shipping','order'] },
  'meetings.meeting.invitation': { title: 'Meeting Invitation',        description: 'Formal meeting invite with agenda, date/time and join link.',                    category: 'general',  application: 'Bliss',    tags: ['meetings','calendar','invite'] },
  'cloud.file.shared':           { title: 'File Shared With You',      description: 'Notifies a user that a file has been shared with them in Drive.',                category: 'general',  application: 'Drive',    tags: ['drive','file','shared'] },
};

function extractVars(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map(m => m.replace(/^\{\{|\}\}$/g, '')))];
}

function wrapForMarketplace(subject: string, bodyFragment: string, appName: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#0d7a6b;padding:20px 32px;font-size:13px;color:rgba(255,255,255,.7)">${appName}</td></tr>
  <tr><td style="padding:28px 32px;font-size:14px;color:#172033;line-height:1.65">${bodyFragment}</td></tr>
  <tr><td style="padding:14px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">Sent via Hudumika · {{tenant_name}}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function seedMarketplaceTemplates(): Promise<void> {
  try {
    const { dbPlatform } = await import('../db/client.js');

    // Fetch existing slugs so we can skip already-seeded rows
    const existing = await dbPlatform
      .selectFrom('marketplace_email_templates')
      .select('slug')
      .where('is_hudumika_official', '=', true)
      .execute();
    const existingSlugs = new Set(existing.map(r => r.slug));

    const toInsert: Array<{
      slug: string; title: string; description: string; category: string; application: string;
      event_key: string; tags: string[]; subject: string; preheader: string;
      body_html: string; body_plain: string; available_vars: string[];
      version: string; is_featured: boolean; is_hudumika_official: boolean;
      author_name: string; status: string; published_at: Date;
    }> = [];

    for (const [key, def] of Object.entries(EMAIL_TEMPLATE_DEFAULTS)) {
      const slug = `hudumika-${key.replace(/\./g, '-')}`;
      if (existingSlugs.has(slug)) continue;

      const meta = TEMPLATE_META[key] ?? {
        title: key.split('.').pop()!.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: `System email template for ${key}.`,
        category: 'general',
        application: 'Hudumika',
        tags: [],
      };

      const bodyHtml = wrapForMarketplace(def.subject, def.body, meta.application);
      const availableVars = extractVars(def.subject + def.body);
      const bodyPlain = def.body
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .trim();

      toInsert.push({
        slug,
        title: meta.title,
        description: meta.description,
        category: meta.category,
        application: meta.application,
        event_key: key,
        tags: meta.tags,
        subject: def.subject,
        preheader: '',
        body_html: bodyHtml,
        body_plain: bodyPlain,
        available_vars: availableVars,
        version: '1.0.0',
        is_featured: ['finance.invoice.issued', 'finance.payment.received', 'esign.signature.requested', 'hr.staff_invitation', 'auth.password_reset'].includes(key),
        is_hudumika_official: true,
        author_name: 'Hudumika',
        status: 'published',
        published_at: new Date(),
      });
    }

    if (toInsert.length > 0) {
      await dbPlatform.insertInto('marketplace_email_templates').values(toInsert).execute();
      console.log(`[marketplace-seed] Seeded ${toInsert.length} official email templates`);
    }
  } catch (err) {
    console.error('[marketplace-seed] Failed to seed marketplace templates:', err);
  }
}
