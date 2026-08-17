import type { NotificationRule } from '@hudumika/types';

export const NOTIFICATION_MATRIX: NotificationRule[] = [
  {
    // Fired by notifyListeners() (not the role-based recipients above) from
    // the Shipment Detail "Key Dates" panel's edit action — notifies exactly
    // whoever is configured as a listener for that specific shipment, same
    // as everything else in that sidebar section.
    trigger: 'KEY_DATE_CHANGED',
    recipients: ['CUSTOMER', 'ASSIGNED_OFFICER'],
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
    template: 'Update for shipment {{refNumber}}: {{dateLabel}} changed to {{newValue}}.',
    priority: 'NORMAL',
  },
  {
    trigger: 'CASE_OPENED',
    recipients: ['CUSTOMER', 'ASSIGNED_OFFICER'],
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
    template: 'Hello {{customerName}}, shipment case {{refNumber}} for "{{goodsDesc}}" has been opened and assigned to officer {{officerName}} ({{officerPhone}}). You can track it here: {{portalUrl}}/clearos/clearance/{{caseId}}',
    priority: 'NORMAL',
  },
  {
    trigger: 'STAGE_ADVANCED',
    recipients: ['CUSTOMER'],
    channels: ['WHATSAPP', 'IN_APP'],
    template: 'Update for shipment {{refNumber}}: Status updated to "{{stageLabel}}". Track updates here: {{portalUrl}}/clearos/clearance/{{caseId}}',
    priority: 'NORMAL',
  },
  {
    trigger: 'MISSING_DOCUMENT',
    recipients: ['CUSTOMER'],
    channels: ['WHATSAPP', 'EMAIL'],
    template: 'Action required for shipment {{refNumber}}: Please upload the following missing document(s): {{docList}}. Upload here: {{portalUrl}}/clearos/clearance/{{caseId}}?tab=files',
    priority: 'HIGH',
    repeat: {
      every: 24,
      unit: 'hours',
      max: 3,
    },
  },
  {
    trigger: 'DEMURRAGE_RISK',
    recipients: ['CUSTOMER', 'ASSIGNED_OFFICER', 'MANAGER'],
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
    template: '⚠️ Demurrage alert for shipment {{refNumber}}: Container storage free time ends in {{hoursLeft}} hours (on {{freeTimeEnd}}). Remaining stages: {{remainingStages}}.',
    priority: 'URGENT',
  },
  {
    trigger: 'SLA_BREACH',
    recipients: ['MANAGER', 'ASSIGNED_OFFICER'],
    channels: ['EMAIL', 'IN_APP'],
    template: '🚨 SLA Breach on case {{refNumber}} (Customer: {{customerName}}). Stage "{{stageLabel}}" has exceeded its SLA by {{hoursExceeded}} hours.',
    priority: 'HIGH',
  },
  {
    trigger: 'DAILY_STATUS',
    recipients: ['CUSTOMER'],
    channels: ['WHATSAPP'],
    template: 'Daily summary for your shipments with Msomi Freight:\n- {{shipmentSummaries}}',
    priority: 'NORMAL',
  },
  {
    trigger: 'INVOICE_GENERATED',
    recipients: ['CUSTOMER', 'FINANCE'],
    channels: ['EMAIL', 'IN_APP', 'WHATSAPP'],
    template: 'Invoice {{invoiceNumber}} has been generated for shipment {{refNumber}}. Total amount due: {{amountTzs}} TZS. Please find details in the portal: {{portalUrl}}/shipments/{{caseId}}/invoice',
    priority: 'NORMAL',
  },
  {
    trigger: 'PAYMENT_RECEIVED',
    recipients: ['CUSTOMER', 'FINANCE', 'ASSIGNED_OFFICER'],
    channels: ['WHATSAPP', 'EMAIL', 'IN_APP'],
    template: 'Payment of {{amountTzs}} TZS received for shipment {{refNumber}}. Thank you for your business.',
    priority: 'NORMAL',
  },
  {
    trigger: 'DOCUMENT_UPLOADED',
    recipients: ['ASSIGNED_OFFICER'],
    channels: ['IN_APP'],
    template: 'Document uploaded for case {{refNumber}}: {{customerName}} uploaded "{{docType}}". Please verify.',
    priority: 'NORMAL',
  },
  {
    trigger: 'MESSAGE_RECEIVED',
    recipients: ['ASSIGNED_OFFICER'],
    channels: ['IN_APP'],
    template: 'New customer message for case {{refNumber}} from {{customerName}}: "{{messageContent}}"',
    priority: 'NORMAL',
  },
];
