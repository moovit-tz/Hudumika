import type { CommunicationEventDefinition, CommunicationRecipientDefinition, CommunicationVariableDefinition } from '@hudumika/types';

/**
 * Central Communication Event Registry — the single authoritative catalog
 * of every communication event the platform can fire. Applications register
 * their events here; the registry drives recipient resolution, template
 * selection, channel routing, and the Communications Settings UI.
 *
 * Convention: {app}.{resource}.{event}
 */

export type CommEventVar = CommunicationVariableDefinition;

interface LegacyCommEventDefinition {
  event_key: string;
  application: string;
  name: string;
  description: string;
  category: 'transactional' | 'security' | 'crm' | 'hr' | 'ops' | 'marketing';
  trigger_type: 'domain_event' | 'scheduled' | 'workflow' | 'manual' | 'security';
  available_channels: ('EMAIL' | 'IN_APP')[];
  default_channel: 'EMAIL' | 'IN_APP';
  /** Grouped variable catalog: { "Invoice": { "number": { label, example } } } */
  available_variables: Record<string, Record<string, CommEventVar>>;
  /** Safe sample data — used for preview/test without triggering real business logic */
  sample_context: Record<string, unknown>;
  recipient_resolvers: string[];
  default_template: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Cannot be disabled by tenant — mandatory security/auth communications */
  is_required: boolean;
}

export type CommEventDefinition = CommunicationEventDefinition;

const EVENT_REGISTRATIONS: LegacyCommEventDefinition[] = [

  // ── Security & Auth ──────────────────────────────────────────────────────
  {
    event_key: 'security.email.verify',
    application: 'Ondi',
    name: 'Verify Email Address',
    description: 'Sent when a user registers or changes their email address.',
    category: 'security',
    trigger_type: 'security',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Contact': { first_name: { label: 'First Name', example: 'Amina' } },
      'Action': { verifyUrl: { label: 'Verification URL', example: 'https://app.hudumika.com/verify?t=...', required: true } },
    },
    sample_context: { first_name: 'Amina', verifyUrl: 'https://app.hudumika.com/verify?t=sample' },
    recipient_resolvers: ['self'],
    default_template: 'security.email.verify',
    priority: 'critical',
    is_required: true,
  },
  {
    event_key: 'security.password.reset',
    application: 'Ondi',
    name: 'Password Reset',
    description: 'Sent when a user requests a password reset.',
    category: 'security',
    trigger_type: 'security',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Action': { resetUrl: { label: 'Reset URL', example: 'https://app.hudumika.com/reset?t=...', required: true } },
    },
    sample_context: { resetUrl: 'https://app.hudumika.com/reset?t=sample' },
    recipient_resolvers: ['self'],
    default_template: 'auth.password_reset',
    priority: 'critical',
    is_required: true,
  },
  {
    event_key: 'security.login.new_device',
    application: 'Ondi',
    name: 'New Device Login',
    description: 'Sent when a user signs in from an unrecognised device.',
    category: 'security',
    trigger_type: 'security',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Session': { device: { label: 'Device', example: 'Chrome on Windows' }, location: { label: 'Location', example: 'Dar es Salaam, TZ' }, time: { label: 'Time', example: '14:32 EAT' } },
    },
    sample_context: { device: 'Chrome on Windows', location: 'Dar es Salaam, TZ', time: '14:32 EAT' },
    recipient_resolvers: ['self'],
    default_template: 'security.login.new_device',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'security.login.magic_link',
    application: 'Ondi',
    name: 'Magic Sign-in Link',
    description: 'Sent when a user requests a passwordless sign-in link.',
    category: 'security',
    trigger_type: 'security',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: { 'Action': { magicLinkUrl: { label: 'Magic Link URL', example: 'https://app.hudumika.com/auth/magic-link?token=...', required: true } } },
    sample_context: { magicLinkUrl: 'https://app.hudumika.com/auth/magic-link?token=sample' },
    recipient_resolvers: ['self'],
    default_template: 'auth.magic_link',
    priority: 'critical',
    is_required: true,
  },
  {
    event_key: 'security.account.invitation',
    application: 'Ondi',
    name: 'Account Invitation',
    description: 'Sent to invite a user to join the workspace.',
    category: 'security',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Invitation': { acceptUrl: { label: 'Accept URL', example: 'https://app.hudumika.com/accept?t=...', required: true }, role: { label: 'Role', example: 'Manager' }, inviterName: { label: 'Invited By', example: 'David Kamau' } },
      'Workspace': { tenantName: { label: 'Workspace Name', example: 'Aleka Logistics Ltd' } },
    },
    sample_context: { acceptUrl: 'https://app.hudumika.com/accept?t=sample', role: 'Manager', inviterName: 'David Kamau', tenantName: 'Aleka Logistics Ltd' },
    recipient_resolvers: ['manual_recipient'],
    default_template: 'hr.staff_invitation',
    priority: 'high',
    is_required: false,
  },

  // ── Finance ──────────────────────────────────────────────────────────────
  {
    event_key: 'finance.invoice.issued',
    application: 'Finance',
    name: 'Invoice Issued',
    description: 'Sent to a customer when a new invoice is created.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Invoice': {
        invoiceNumber: { label: 'Invoice Number', example: 'INV-2026-00128', required: true },
        invoiceDate: { label: 'Invoice Date', example: '24 Sep 2026' },
        dueDate: { label: 'Due Date', example: '7 Oct 2026' },
        amountDue: { label: 'Amount Due', example: 'TZS 1,250,000' },
        currency: { label: 'Currency', example: 'TZS' },
        lineItemsHtml: { label: 'Line Items (HTML)', example: '<table>…</table>' },
        paymentInstructions: { label: 'Payment Instructions', example: 'Transfer to ABC Bank, A/C 1234567' },
        invoiceUrl: { label: 'Invoice Link', example: 'https://app.hudumika.com/invoices/…' },
      },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd', required: true }, customerEmail: { label: 'Customer Email', example: 'accounts@zaratraders.co.tz' } },
      'Company': { companyName: { label: 'Sender Company', example: 'Aleka Logistics Ltd' }, companyAddress: { label: 'Address', example: 'Dar es Salaam, Tanzania' } },
    },
    sample_context: { invoiceNumber: 'INV-2026-00128', invoiceDate: '24 Sep 2026', dueDate: '7 Oct 2026', amountDue: 'TZS 1,250,000', currency: 'TZS', customerName: 'Zara Traders Ltd', companyName: 'Aleka Logistics Ltd', invoiceUrl: '#' },
    recipient_resolvers: ['customer.billing_contact', 'invoice.contact', 'manual_recipient'],
    default_template: 'finance.invoice.issued',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'finance.invoice.due_soon',
    application: 'Finance',
    name: 'Invoice Due Soon',
    description: 'Reminder sent 3 days before invoice due date.',
    category: 'transactional',
    trigger_type: 'scheduled',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Invoice': { invoiceNumber: { label: 'Invoice Number', example: 'INV-2026-00128', required: true }, dueDate: { label: 'Due Date', example: '7 Oct 2026' }, amountDue: { label: 'Amount Due', example: 'TZS 1,250,000' }, invoiceUrl: { label: 'Invoice Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { invoiceNumber: 'INV-2026-00128', dueDate: '7 Oct 2026', amountDue: 'TZS 1,250,000', customerName: 'Zara Traders Ltd', invoiceUrl: '#' },
    recipient_resolvers: ['customer.billing_contact'],
    default_template: 'finance.invoice.due_soon',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'finance.invoice.overdue',
    application: 'Finance',
    name: 'Invoice Overdue',
    description: 'Reminder sent when an invoice passes its due date unpaid.',
    category: 'transactional',
    trigger_type: 'scheduled',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Invoice': { invoiceNumber: { label: 'Invoice Number', example: 'INV-2026-00128', required: true }, daysOverdue: { label: 'Days Overdue', example: '5' }, amountDue: { label: 'Amount Due', example: 'TZS 1,250,000' }, invoiceUrl: { label: 'Invoice Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { invoiceNumber: 'INV-2026-00128', daysOverdue: '5', amountDue: 'TZS 1,250,000', customerName: 'Zara Traders Ltd', invoiceUrl: '#' },
    recipient_resolvers: ['customer.billing_contact'],
    default_template: 'finance.invoice.overdue',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'finance.payment.received',
    application: 'Finance',
    name: 'Payment Received',
    description: 'Confirmation sent to a customer when their payment is recorded.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Payment': { receiptNumber: { label: 'Receipt Number', example: 'RCP-2026-00044' }, amountPaid: { label: 'Amount Paid', example: 'TZS 1,250,000' }, paymentDate: { label: 'Payment Date', example: '24 Sep 2026' }, paymentMethod: { label: 'Method', example: 'M-Pesa' } },
      'Invoice': { invoiceNumber: { label: 'Invoice Number', example: 'INV-2026-00128' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { receiptNumber: 'RCP-2026-00044', amountPaid: 'TZS 1,250,000', paymentDate: '24 Sep 2026', paymentMethod: 'M-Pesa', invoiceNumber: 'INV-2026-00128', customerName: 'Zara Traders Ltd' },
    recipient_resolvers: ['customer.billing_contact'],
    default_template: 'finance.payment.received',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'finance.quotation.sent',
    application: 'Finance',
    name: 'Quotation Sent',
    description: 'Sent to a customer when a quotation / proforma is issued.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Quotation': { quoteNumber: { label: 'Quote Number', example: 'QT-2026-00042' }, validUntil: { label: 'Valid Until', example: '30 Sep 2026' }, totalAmount: { label: 'Total', example: 'TZS 850,000' }, quoteUrl: { label: 'Quote Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { quoteNumber: 'QT-2026-00042', validUntil: '30 Sep 2026', totalAmount: 'TZS 850,000', customerName: 'Zara Traders Ltd', quoteUrl: '#' },
    recipient_resolvers: ['customer.primary_contact', 'manual_recipient'],
    default_template: 'finance.quotation.sent',
    priority: 'normal',
    is_required: false,
  },

  // ── CRM ───────────────────────────────────────────────────────────────────
  {
    event_key: 'crm.lead.assigned',
    application: 'CRM',
    name: 'Lead Assigned',
    description: 'Notifies the assignee when a lead is assigned to them.',
    category: 'crm',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Lead': { leadName: { label: 'Lead Name', example: 'Mohamed Hassan' }, company: { label: 'Company', example: 'Tanga Exporters' }, source: { label: 'Source', example: 'Website' }, leadUrl: { label: 'Lead Link', example: '#' } },
      'Assignee': { assigneeName: { label: 'Assignee Name', example: 'Grace Mwangi' } },
    },
    sample_context: { leadName: 'Mohamed Hassan', company: 'Tanga Exporters', source: 'Website', leadUrl: '#', assigneeName: 'Grace Mwangi' },
    recipient_resolvers: ['crm.lead.assignee'],
    default_template: 'crm.lead.assigned',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'crm.opportunity.won',
    application: 'CRM',
    name: 'Deal Won',
    description: 'Notifies the sales team when a deal is marked as won.',
    category: 'crm',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Deal': { dealName: { label: 'Deal Name', example: 'Tanga Port Logistics Contract' }, value: { label: 'Deal Value', example: 'TZS 12,000,000' }, customerName: { label: 'Customer', example: 'Tanga Exporters' }, dealUrl: { label: 'Deal Link', example: '#' } },
      'Salesperson': { salespersonName: { label: 'Salesperson', example: 'Grace Mwangi' } },
    },
    sample_context: { dealName: 'Tanga Port Logistics Contract', value: 'TZS 12,000,000', customerName: 'Tanga Exporters', dealUrl: '#', salespersonName: 'Grace Mwangi' },
    recipient_resolvers: ['crm.opportunity.owner', 'crm.team'],
    default_template: 'crm.opportunity.won',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'crm.proposal.sent',
    application: 'CRM',
    name: 'Proposal Sent',
    description: 'Customer-facing email when a proposal is sent.',
    category: 'crm',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Proposal': { proposalTitle: { label: 'Proposal Title', example: 'Logistics Partnership Proposal' }, proposalUrl: { label: 'Proposal Link', example: '#', required: true }, validUntil: { label: 'Valid Until', example: '15 Oct 2026' } },
      'Contact': { contactName: { label: 'Contact Name', example: 'Mohamed Hassan' } },
      'Sender': { senderName: { label: 'Sender Name', example: 'Grace Mwangi' }, senderTitle: { label: 'Title', example: 'Senior Account Manager' } },
    },
    sample_context: { proposalTitle: 'Logistics Partnership Proposal', proposalUrl: '#', validUntil: '15 Oct 2026', contactName: 'Mohamed Hassan', senderName: 'Grace Mwangi', senderTitle: 'Senior Account Manager' },
    recipient_resolvers: ['crm.opportunity.contacts', 'manual_recipient'],
    default_template: 'crm.proposal.sent',
    priority: 'normal',
    is_required: false,
  },

  // ── Support ───────────────────────────────────────────────────────────────
  {
    event_key: 'support.ticket.received',
    application: 'Support',
    name: 'Ticket Received',
    description: 'Acknowledgement sent to customer when a new support ticket is created.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Ticket': { ticketRef: { label: 'Ticket Reference', example: 'TKT-2026-00312', required: true }, subject: { label: 'Subject', example: 'Container not released' }, ticketUrl: { label: 'Ticket Link', example: '#' } },
      'Contact': { contactName: { label: 'Contact Name', example: 'Amina Juma' } },
    },
    sample_context: { ticketRef: 'TKT-2026-00312', subject: 'Container not released', ticketUrl: '#', contactName: 'Amina Juma' },
    recipient_resolvers: ['support.requester'],
    default_template: 'support.ticket_ack',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'support.ticket.resolved',
    application: 'Support',
    name: 'Ticket Resolved',
    description: 'Sent to the customer when a support ticket is closed.',
    category: 'transactional',
    trigger_type: 'workflow',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Ticket': { ticketRef: { label: 'Ticket Reference', example: 'TKT-2026-00312', required: true }, resolutionNote: { label: 'Resolution Note', example: 'Container released after documentation submission.' }, ticketUrl: { label: 'Ticket Link', example: '#' } },
      'Contact': { contactName: { label: 'Contact Name', example: 'Amina Juma' } },
    },
    sample_context: { ticketRef: 'TKT-2026-00312', resolutionNote: 'Container released after documentation submission.', ticketUrl: '#', contactName: 'Amina Juma' },
    recipient_resolvers: ['support.requester'],
    default_template: 'support.ticket.resolved',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'support.ticket.escalated',
    application: 'Support',
    name: 'Ticket Escalated',
    description: 'Internal notification when a ticket is escalated.',
    category: 'ops',
    trigger_type: 'workflow',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Ticket': { ticketRef: { label: 'Ticket Reference', example: 'TKT-2026-00312' }, subject: { label: 'Subject', example: 'Container not released' }, escalationReason: { label: 'Escalation Reason', example: 'SLA breach — 24 h without response' }, ticketUrl: { label: 'Ticket Link', example: '#' } },
    },
    sample_context: { ticketRef: 'TKT-2026-00312', subject: 'Container not released', escalationReason: 'SLA breach — 24 h without response', ticketUrl: '#' },
    recipient_resolvers: ['support.team_lead', 'support.manager'],
    default_template: 'support.ticket.escalated',
    priority: 'high',
    is_required: false,
  },

  // ── eSign ─────────────────────────────────────────────────────────────────
  {
    event_key: 'esign.signature.requested',
    application: 'eSign',
    name: 'Signature Requested',
    description: 'Sent to a signer when a document requires their signature.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Document': { documentTitle: { label: 'Document Title', example: 'Service Agreement 2026', required: true }, signUrl: { label: 'Signing URL', example: '#', required: true }, expiresAt: { label: 'Expires At', example: '7 Oct 2026' }, senderName: { label: 'Sent By', example: 'Aleka Logistics Ltd' } },
      'Signer': { signerName: { label: 'Signer Name', example: 'Mohamed Hassan' } },
    },
    sample_context: { documentTitle: 'Service Agreement 2026', signUrl: '#', expiresAt: '7 Oct 2026', senderName: 'Aleka Logistics Ltd', signerName: 'Mohamed Hassan' },
    recipient_resolvers: ['esign.current_signer'],
    default_template: 'esign.signature.requested',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'esign.document.completed',
    application: 'eSign',
    name: 'Document Completed',
    description: 'Sent to all parties when all signatures are collected.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Document': { documentTitle: { label: 'Document Title', example: 'Service Agreement 2026', required: true }, downloadUrl: { label: 'Download URL', example: '#' }, completedAt: { label: 'Completed At', example: '24 Sep 2026' } },
      'Recipient': { recipientName: { label: 'Recipient Name', example: 'Mohamed Hassan' } },
    },
    sample_context: { documentTitle: 'Service Agreement 2026', downloadUrl: '#', completedAt: '24 Sep 2026', recipientName: 'Mohamed Hassan' },
    recipient_resolvers: ['esign.all_parties'],
    default_template: 'esign.document.completed',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'esign.signing.reminder',
    application: 'eSign',
    name: 'Signing Reminder',
    description: 'Reminder to a signer who has not yet signed.',
    category: 'transactional',
    trigger_type: 'scheduled',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Document': { documentTitle: { label: 'Document Title', example: 'Service Agreement 2026' }, signUrl: { label: 'Signing URL', example: '#', required: true }, expiresAt: { label: 'Expires At', example: '7 Oct 2026' } },
      'Signer': { signerName: { label: 'Signer Name', example: 'Mohamed Hassan' } },
    },
    sample_context: { documentTitle: 'Service Agreement 2026', signUrl: '#', expiresAt: '7 Oct 2026', signerName: 'Mohamed Hassan' },
    recipient_resolvers: ['esign.pending_signer'],
    default_template: 'esign.signing.reminder',
    priority: 'normal',
    is_required: false,
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  {
    event_key: 'hr.employee.invited',
    application: 'NexusHR',
    name: 'Employee Invited',
    description: 'Welcome email sent to a new employee joining the workspace.',
    category: 'hr',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Employee': { employeeName: { label: 'Employee Name', example: 'David Kamau' }, role: { label: 'Role', example: 'Logistics Officer' }, acceptUrl: { label: 'Accept URL', example: '#', required: true } },
      'Company': { companyName: { label: 'Company Name', example: 'Aleka Logistics Ltd' }, managerName: { label: 'Manager', example: 'Jane Omondi' } },
    },
    sample_context: { employeeName: 'David Kamau', role: 'Logistics Officer', acceptUrl: '#', companyName: 'Aleka Logistics Ltd', managerName: 'Jane Omondi' },
    recipient_resolvers: ['employee.user'],
    default_template: 'hr.staff_invitation',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'hr.leave.approved',
    application: 'NexusHR',
    name: 'Leave Approved',
    description: 'Sent to an employee when their leave request is approved.',
    category: 'hr',
    trigger_type: 'workflow',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Leave': { leaveType: { label: 'Leave Type', example: 'Annual Leave' }, startDate: { label: 'Start Date', example: '1 Oct 2026' }, endDate: { label: 'End Date', example: '5 Oct 2026' }, days: { label: 'Days', example: '5' }, approvedBy: { label: 'Approved By', example: 'Jane Omondi' } },
      'Employee': { employeeName: { label: 'Employee Name', example: 'David Kamau' } },
    },
    sample_context: { leaveType: 'Annual Leave', startDate: '1 Oct 2026', endDate: '5 Oct 2026', days: '5', approvedBy: 'Jane Omondi', employeeName: 'David Kamau' },
    recipient_resolvers: ['employee.user'],
    default_template: 'hr.leave.approved',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'hr.leave.rejected',
    application: 'NexusHR',
    name: 'Leave Rejected',
    description: 'Sent to an employee when their leave request is declined.',
    category: 'hr',
    trigger_type: 'workflow',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Leave': { leaveType: { label: 'Leave Type', example: 'Annual Leave' }, startDate: { label: 'Start Date', example: '1 Oct 2026' }, rejectionReason: { label: 'Reason', example: 'Insufficient leave balance' }, rejectedBy: { label: 'Rejected By', example: 'Jane Omondi' } },
      'Employee': { employeeName: { label: 'Employee Name', example: 'David Kamau' } },
    },
    sample_context: { leaveType: 'Annual Leave', startDate: '1 Oct 2026', rejectionReason: 'Insufficient leave balance', rejectedBy: 'Jane Omondi', employeeName: 'David Kamau' },
    recipient_resolvers: ['employee.user'],
    default_template: 'hr.leave.rejected',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'hr.payslip.ready',
    application: 'NexusHR',
    name: 'Payslip Ready',
    description: 'Sent to an employee when their monthly payslip is available.',
    category: 'hr',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Payroll': { runName: { label: 'Payroll Period', example: 'September 2026' }, payslipTable: { label: 'Payslip Summary (HTML)', example: '<table>…</table>' } },
      'Employee': { employeeName: { label: 'Employee Name', example: 'David Kamau' } },
    },
    sample_context: { runName: 'September 2026', payslipTable: '<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:6px 8px;color:#6b7280;">Gross Pay</td><td style="padding:6px 8px;text-align:right;font-weight:600;">TZS 2,500,000</td></tr></table>', employeeName: 'David Kamau' },
    recipient_resolvers: ['employee.user'],
    default_template: 'payroll.payslip',
    priority: 'normal',
    is_required: false,
  },

  // ── Projects ──────────────────────────────────────────────────────────────
  {
    event_key: 'projects.task.assigned',
    application: 'Projects',
    name: 'Task Assigned',
    description: 'Notifies the assignee when a task is assigned to them.',
    category: 'ops',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Task': { taskTitle: { label: 'Task Title', example: 'Prepare customs documentation' }, projectName: { label: 'Project', example: 'Mombasa Import Q4' }, dueDate: { label: 'Due Date', example: '30 Sep 2026' }, taskUrl: { label: 'Task Link', example: '#' } },
      'Assignee': { assigneeName: { label: 'Assignee', example: 'Grace Mwangi' } },
      'Assigner': { assignerName: { label: 'Assigned By', example: 'Jane Omondi' } },
    },
    sample_context: { taskTitle: 'Prepare customs documentation', projectName: 'Mombasa Import Q4', dueDate: '30 Sep 2026', taskUrl: '#', assigneeName: 'Grace Mwangi', assignerName: 'Jane Omondi' },
    recipient_resolvers: ['task.assignee'],
    default_template: 'projects.task.assigned',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'projects.milestone.completed',
    application: 'Projects',
    name: 'Milestone Completed',
    description: 'Sent to project members when a milestone is marked complete.',
    category: 'ops',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'Milestone': { milestoneName: { label: 'Milestone', example: 'Customs Clearance' }, projectName: { label: 'Project', example: 'Mombasa Import Q4' }, completedBy: { label: 'Completed By', example: 'Grace Mwangi' }, projectUrl: { label: 'Project Link', example: '#' } },
    },
    sample_context: { milestoneName: 'Customs Clearance', projectName: 'Mombasa Import Q4', completedBy: 'Grace Mwangi', projectUrl: '#' },
    recipient_resolvers: ['project.members', 'project.client_contact'],
    default_template: 'projects.milestone.completed',
    priority: 'normal',
    is_required: false,
  },

  // ── ClearOS ───────────────────────────────────────────────────────────────
  {
    event_key: 'clearos.shipment.created',
    application: 'ClearOS',
    name: 'Shipment Created',
    description: 'Sent to the customer when a new shipment case is opened.',
    category: 'ops',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Shipment': { refNumber: { label: 'Reference Number', example: 'SHP-2026-0441', required: true }, mode: { label: 'Mode', example: 'Sea Import' }, origin: { label: 'Origin', example: 'Mombasa' }, destination: { label: 'Destination', example: 'Dar es Salaam' }, shipmentUrl: { label: 'Shipment Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { refNumber: 'SHP-2026-0441', mode: 'Sea Import', origin: 'Mombasa', destination: 'Dar es Salaam', customerName: 'Zara Traders Ltd', shipmentUrl: '#' },
    recipient_resolvers: ['clearos.consignee_contact', 'clearos.shipper_contact'],
    default_template: 'clearos.shipment.created',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'clearos.shipment.message',
    application: 'ClearOS',
    name: 'Shipment Message',
    description: 'Customer-facing email sent from a shipment conversation.',
    category: 'ops',
    trigger_type: 'manual',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: { 'Shipment': { refNumber: { label: 'Reference Number', example: 'SHP-2026-0441', required: true }, content: { label: 'Message', example: 'Your shipment documents have been received.', required: true } } },
    sample_context: { refNumber: 'SHP-2026-0441', content: 'Your shipment documents have been received.' },
    recipient_resolvers: ['manual_recipient'],
    default_template: 'clearos.shipment_message',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'clearos.shipment.daily_report',
    application: 'ClearOS',
    name: 'Daily Shipment Report',
    description: 'Scheduled or manual daily shipment progress report.',
    category: 'ops',
    trigger_type: 'scheduled',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: { 'Shipment': { refNumber: { label: 'Reference Number', example: 'SHP-2026-0441', required: true }, stageLabel: { label: 'Current Stage', example: 'Customs assessment', required: true } }, 'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd', required: true } } },
    sample_context: { refNumber: 'SHP-2026-0441', stageLabel: 'Customs assessment', customerName: 'Zara Traders Ltd' },
    recipient_resolvers: ['manual_recipient'],
    default_template: 'clearos.daily_shipment_report',
    priority: 'normal',
    is_required: false,
  },
  {
    event_key: 'clearos.customs.released',
    application: 'ClearOS',
    name: 'Customs Released',
    description: 'Sent to the customer when goods are released by customs.',
    category: 'ops',
    trigger_type: 'workflow',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Shipment': { refNumber: { label: 'Reference Number', example: 'SHP-2026-0441', required: true }, releaseDate: { label: 'Release Date', example: '24 Sep 2026' }, shipmentUrl: { label: 'Shipment Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { refNumber: 'SHP-2026-0441', releaseDate: '24 Sep 2026', customerName: 'Zara Traders Ltd', shipmentUrl: '#' },
    recipient_resolvers: ['clearos.consignee_contact'],
    default_template: 'clearos.customs.released',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'clearos.demurrage.warning',
    application: 'ClearOS',
    name: 'Demurrage Warning',
    description: 'Sent when free days are expiring and demurrage charges are imminent.',
    category: 'ops',
    trigger_type: 'scheduled',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'EMAIL',
    available_variables: {
      'Shipment': { refNumber: { label: 'Reference Number', example: 'SHP-2026-0441', required: true }, freeDaysLeft: { label: 'Free Days Remaining', example: '2' }, lastFreeDay: { label: 'Last Free Day', example: '26 Sep 2026' }, shipmentUrl: { label: 'Shipment Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Zara Traders Ltd' } },
    },
    sample_context: { refNumber: 'SHP-2026-0441', freeDaysLeft: '2', lastFreeDay: '26 Sep 2026', customerName: 'Zara Traders Ltd', shipmentUrl: '#' },
    recipient_resolvers: ['clearos.consignee_contact'],
    default_template: 'clearos.demurrage.warning',
    priority: 'high',
    is_required: false,
  },

  // ── Commerce ──────────────────────────────────────────────────────────────
  {
    event_key: 'commerce.order.confirmed',
    application: 'Commerce',
    name: 'Order Confirmed',
    description: 'Order confirmation sent to the customer immediately after purchase.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Order': { orderNumber: { label: 'Order Number', example: 'ORD-2026-00912', required: true }, orderDate: { label: 'Order Date', example: '24 Sep 2026' }, totalAmount: { label: 'Total', example: 'TZS 345,000' }, itemsHtml: { label: 'Items (HTML)', example: '<table>…</table>' }, orderUrl: { label: 'Order Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Amina Juma' } },
    },
    sample_context: { orderNumber: 'ORD-2026-00912', orderDate: '24 Sep 2026', totalAmount: 'TZS 345,000', customerName: 'Amina Juma', orderUrl: '#' },
    recipient_resolvers: ['commerce.order.customer'],
    default_template: 'commerce.order.confirmed',
    priority: 'high',
    is_required: false,
  },
  {
    event_key: 'commerce.order.shipped',
    application: 'Commerce',
    name: 'Order Shipped',
    description: 'Sent to the customer when their order is dispatched.',
    category: 'transactional',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Order': { orderNumber: { label: 'Order Number', example: 'ORD-2026-00912', required: true }, trackingNumber: { label: 'Tracking Number', example: 'TZ1234567' }, carrier: { label: 'Carrier', example: 'DHL' }, estimatedDelivery: { label: 'Estimated Delivery', example: '26 Sep 2026' }, trackingUrl: { label: 'Tracking Link', example: '#' } },
      'Customer': { customerName: { label: 'Customer Name', example: 'Amina Juma' } },
    },
    sample_context: { orderNumber: 'ORD-2026-00912', trackingNumber: 'TZ1234567', carrier: 'DHL', estimatedDelivery: '26 Sep 2026', customerName: 'Amina Juma', trackingUrl: '#' },
    recipient_resolvers: ['commerce.order.customer'],
    default_template: 'commerce.order.shipped',
    priority: 'normal',
    is_required: false,
  },

  // ── Meeting / Calendar ────────────────────────────────────────────────────
  {
    event_key: 'meetings.meeting.invitation',
    application: 'Meetings',
    name: 'Meeting Invitation',
    description: 'Sent to participants when a meeting is scheduled.',
    category: 'ops',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL'],
    default_channel: 'EMAIL',
    available_variables: {
      'Meeting': { meetingTitle: { label: 'Meeting Title', example: 'Project Kickoff' }, startTime: { label: 'Start Time', example: '24 Sep 2026, 10:00 EAT' }, duration: { label: 'Duration', example: '60 min' }, joinUrl: { label: 'Join Link', example: '#' }, organizer: { label: 'Organizer', example: 'Jane Omondi' } },
      'Participant': { participantName: { label: 'Participant Name', example: 'David Kamau' } },
    },
    sample_context: { meetingTitle: 'Project Kickoff', startTime: '24 Sep 2026, 10:00 EAT', duration: '60 min', joinUrl: '#', organizer: 'Jane Omondi', participantName: 'David Kamau' },
    recipient_resolvers: ['meeting.participants'],
    default_template: 'meetings.meeting.invitation',
    priority: 'normal',
    is_required: false,
  },

  // ── Cloud ─────────────────────────────────────────────────────────────────
  {
    event_key: 'cloud.file.shared',
    application: 'Drive',
    name: 'File Shared',
    description: 'Sent to a user when a file or folder is shared with them.',
    category: 'ops',
    trigger_type: 'domain_event',
    available_channels: ['EMAIL', 'IN_APP'],
    default_channel: 'IN_APP',
    available_variables: {
      'File': { fileName: { label: 'File Name', example: 'Import Permit 2026.pdf', required: true }, permission: { label: 'Permission', example: 'View' }, fileUrl: { label: 'File Link', example: '#' } },
      'Sharer': { sharerName: { label: 'Shared By', example: 'Grace Mwangi' } },
      'Recipient': { recipientName: { label: 'Recipient Name', example: 'David Kamau' } },
    },
    sample_context: { fileName: 'Import Permit 2026.pdf', permission: 'View', fileUrl: '#', sharerName: 'Grace Mwangi', recipientName: 'David Kamau' },
    recipient_resolvers: ['cloud.share.recipient'],
    default_template: 'cloud.file.shared',
    priority: 'low',
    is_required: false,
  },
];

function registerEvents(registrations: LegacyCommEventDefinition[]): CommunicationEventDefinition[] {
  const keys = new Set<string>();
  return registrations.map(registration => {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(registration.event_key)) {
      throw new Error(`Invalid communication event key: "${registration.event_key}"`);
    }
    if (keys.has(registration.event_key)) throw new Error(`Duplicate communication event key: "${registration.event_key}"`);
    keys.add(registration.event_key);
    if (!registration.available_channels.includes(registration.default_channel)) {
      throw new Error(`Default channel is not available for event "${registration.event_key}"`);
    }
    if (!registration.recipient_resolvers.length) {
      throw new Error(`Communication event "${registration.event_key}" has no recipient resolver`);
    }
    const recipient_resolvers: CommunicationRecipientDefinition[] = registration.recipient_resolvers.map(resolver => ({
      resolver,
      type: 'TO',
      label: resolver.split('.').map(part => part.replace(/_/g, ' ')).join(' / ').replace(/\b\w/g, value => value.toUpperCase()),
      required: resolver !== 'manual_recipient',
    }));
    return { ...registration, default_locale: 'en', recipient_resolvers };
  });
}

export const COMM_EVENT_REGISTRY = registerEvents(EVENT_REGISTRATIONS);

/** Fast lookup map by event_key */
export const COMM_EVENT_MAP = new Map<string, CommEventDefinition>(
  COMM_EVENT_REGISTRY.map(e => [e.event_key, e]),
);

export async function syncCommEventRegistry(): Promise<void> {
  const { dbPlatform } = await import('../db/client.js');
  for (const event of COMM_EVENT_REGISTRY) {
    const row = {
      event_key: event.event_key, application: event.application, name: event.name, description: event.description,
      category: event.category, trigger_type: event.trigger_type, available_channels: event.available_channels,
      default_channel: event.default_channel, available_variables: event.available_variables,
      sample_context: event.sample_context, recipient_resolvers: event.recipient_resolvers.map(item => item.resolver),
      default_template: event.default_template, priority: event.priority, is_required: event.is_required, is_system: true,
    };
    await dbPlatform.insertInto('comm_events').values(row).onConflict(conflict => conflict.column('event_key').doUpdateSet(row)).execute();
  }
}
