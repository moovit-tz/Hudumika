import type { EmailTemplateCategory } from '@hudumika/types';

export interface AppEmailTemplateCatalogEntry {
  key: string;
  application: string;
  title: string;
  description: string;
  category: EmailTemplateCategory;
  tags: string[];
}

const template = (
  application: string,
  key: string,
  title: string,
  description: string,
  category: EmailTemplateCategory = 'transactional',
  tags: string[] = [],
): AppEmailTemplateCatalogEntry => ({ key, application, title, description, category, tags });

/**
 * Baseline communication coverage for apps that do not have a specialised
 * hand-authored template yet. These definitions intentionally share a small,
 * stable context contract so an app can dispatch immediately while still
 * allowing a tenant to customise the installed copy in Email Templates.
 */
export const APP_EMAIL_TEMPLATE_CATALOG: AppEmailTemplateCatalogEntry[] = [
  template('Lens', 'lens.insight.ready', 'AI Insight Ready', 'Notifies a user when a requested AI insight is ready.', 'transactional', ['ai', 'insight']),
  template('Lens', 'lens.report.ready', 'AI Report Ready', 'Delivers a completed Lens analysis report.', 'transactional', ['ai', 'report']),
  template('Lens', 'lens.automation.failed', 'AI Automation Failed', 'Alerts the automation owner when a Lens workflow fails.', 'transactional', ['ai', 'automation', 'failure']),
  template('Lens', 'lens.usage.summary', 'AI Usage Summary', 'Summarises Lens usage, savings and key metrics.', 'transactional', ['ai', 'metrics', 'digest']),

  template('ClearOS', 'clearos.declaration.submitted', 'Declaration Submitted', 'Confirms that a customs declaration was submitted.', 'transactional', ['customs', 'declaration']),
  template('ClearOS', 'clearos.declaration.assessed', 'Declaration Assessed', 'Notifies stakeholders when customs assessment is available.', 'transactional', ['customs', 'assessment']),
  template('ClearOS', 'clearos.document.required', 'Shipment Document Required', 'Requests a missing document for a shipment or declaration.', 'transactional', ['shipment', 'document']),
  template('ClearOS', 'clearos.release.order_ready', 'Release Order Ready', 'Confirms that a cargo release order is ready.', 'transactional', ['customs', 'release']),
  template('ClearOS', 'clearos.weekly.metrics', 'Clearance Weekly Metrics', 'Summarises clearance time, declarations and exceptions.', 'transactional', ['customs', 'metrics', 'report']),

  template('FinOps', 'finops.purchase_order.approval_requested', 'Purchase Order Approval Required', 'Requests approval for a purchase order.', 'transactional', ['finance', 'purchase-order', 'approval']),
  template('FinOps', 'finops.purchase_order.approved', 'Purchase Order Approved', 'Confirms purchase-order approval.', 'transactional', ['finance', 'purchase-order']),
  template('FinOps', 'finops.bill.due', 'Supplier Bill Due', 'Reminds finance staff that a supplier bill is due.', 'transactional', ['finance', 'bill', 'reminder']),
  template('FinOps', 'finops.cashflow.summary', 'Cash-flow Summary', 'Delivers periodic cash position and forecast metrics.', 'transactional', ['finance', 'cashflow', 'metrics']),
  template('FinOps', 'finops.month_end.report', 'Month-end Finance Report', 'Delivers the completed month-end finance report.', 'transactional', ['finance', 'report']),

  template('NexusHR', 'nexushr.leave.requested', 'Leave Approval Required', 'Requests a manager decision on an employee leave request.', 'transactional', ['hr', 'leave', 'approval']),
  template('NexusHR', 'nexushr.timesheet.submitted', 'Timesheet Submitted', 'Notifies a manager that a timesheet is ready for review.', 'transactional', ['hr', 'timesheet']),
  template('NexusHR', 'nexushr.timesheet.approved', 'Timesheet Approved', 'Confirms approval of an employee timesheet.', 'transactional', ['hr', 'timesheet']),
  template('NexusHR', 'nexushr.payroll.completed', 'Payroll Completed', 'Notifies payroll managers that a payroll run completed.', 'transactional', ['hr', 'payroll', 'report']),
  template('NexusHR', 'nexushr.workforce.metrics', 'Workforce Metrics', 'Delivers headcount, attendance and workforce metrics.', 'transactional', ['hr', 'metrics', 'report']),

  template('Bliss', 'bliss.meeting.invitation', 'Meeting Invitation', 'Invites participants to a Bliss meeting.', 'transactional', ['meeting', 'invitation']),
  template('Bliss', 'bliss.meeting.updated', 'Meeting Updated', 'Notifies participants that meeting details changed.', 'transactional', ['meeting', 'update']),
  template('Bliss', 'bliss.meeting.cancelled', 'Meeting Cancelled', 'Notifies participants that a meeting was cancelled.', 'transactional', ['meeting', 'cancelled']),
  template('Bliss', 'bliss.action_items.ready', 'Meeting Action Items', 'Shares action items captured from a meeting.', 'transactional', ['meeting', 'tasks']),

  template('ComplyOS', 'complyos.task.assigned', 'Compliance Task Assigned', 'Notifies an owner about an assigned compliance task.', 'transactional', ['compliance', 'task']),
  template('ComplyOS', 'complyos.incident.reported', 'Compliance Incident Reported', 'Alerts compliance owners about a reported incident.', 'transactional', ['compliance', 'incident']),
  template('ComplyOS', 'complyos.policy.review_due', 'Policy Review Due', 'Reminds a policy owner that review is due.', 'transactional', ['compliance', 'policy', 'reminder']),
  template('ComplyOS', 'complyos.monthly.report', 'Monthly Compliance Report', 'Delivers compliance posture, renewals and incident metrics.', 'transactional', ['compliance', 'metrics', 'report']),

  template('CRM', 'crm.contact.assigned', 'Contact Assigned', 'Notifies a user that a CRM contact was assigned.', 'transactional', ['crm', 'contact']),
  template('CRM', 'crm.deal.stage_changed', 'Deal Stage Updated', 'Notifies deal stakeholders about a pipeline stage change.', 'transactional', ['crm', 'deal', 'update']),
  template('CRM', 'crm.pipeline.summary', 'Sales Pipeline Summary', 'Delivers pipeline value, conversion and activity metrics.', 'transactional', ['crm', 'metrics', 'report']),
  template('CRM', 'crm.campaign.report', 'CRM Campaign Report', 'Delivers campaign engagement and conversion results.', 'transactional', ['crm', 'campaign', 'report']),

  template('Cloud', 'cloud.folder.shared', 'Folder Shared With You', 'Notifies a user that a Cloud folder was shared.', 'transactional', ['cloud', 'folder', 'sharing']),
  template('Cloud', 'cloud.share.invitation', 'Cloud Sharing Invitation', 'Invites an external recipient to access a shared item.', 'account', ['cloud', 'invitation']),
  template('Cloud', 'cloud.storage.warning', 'Cloud Storage Warning', 'Warns workspace admins that storage is nearing its limit.', 'transactional', ['cloud', 'storage', 'warning']),
  template('Cloud', 'cloud.file.activity_digest', 'Cloud Activity Digest', 'Summarises file uploads, sharing and collaboration.', 'transactional', ['cloud', 'digest', 'metrics']),
  template('Cloud', 'cloud.export.ready', 'Cloud Export Ready', 'Notifies a user that a requested data export is ready.', 'transactional', ['cloud', 'export']),

  template('Email', 'email.mailbox.invitation', 'Shared Mailbox Invitation', 'Invites a teammate to a shared mailbox.', 'account', ['email', 'mailbox', 'invitation']),
  template('Email', 'email.message.delivery_failed', 'Message Delivery Failed', 'Alerts a sender when an email cannot be delivered.', 'transactional', ['email', 'delivery', 'failure']),
  template('Email', 'email.mailbox.storage_warning', 'Mailbox Storage Warning', 'Warns a user that mailbox storage is almost full.', 'transactional', ['email', 'storage', 'warning']),
  template('Email', 'email.weekly.activity', 'Email Activity Summary', 'Summarises sent, received and response metrics.', 'transactional', ['email', 'metrics', 'digest']),

  template('Contacts', 'contacts.import.completed', 'Contact Import Completed', 'Confirms a completed contact import with results.', 'transactional', ['contacts', 'import', 'report']),
  template('Contacts', 'contacts.import.failed', 'Contact Import Failed', 'Explains that a contact import failed and needs attention.', 'transactional', ['contacts', 'import', 'failure']),
  template('Contacts', 'contacts.record.shared', 'Contact Shared With You', 'Notifies a user that a contact was shared.', 'transactional', ['contacts', 'sharing']),

  template('Store', 'store.plugin.installed', 'Plugin Installed', 'Confirms that a Marketplace plugin was installed.', 'transactional', ['store', 'plugin']),
  template('Store', 'store.plugin.updated', 'Plugin Update Available', 'Notifies admins that an installed plugin has an update.', 'transactional', ['store', 'plugin', 'update']),
  template('Store', 'store.submission.approved', 'Marketplace Submission Approved', 'Confirms approval of a Marketplace submission.', 'transactional', ['store', 'submission']),
  template('Store', 'store.submission.rejected', 'Marketplace Submission Needs Changes', 'Returns Marketplace review feedback to a publisher.', 'transactional', ['store', 'submission', 'review']),

  template('HuduFreight', 'freight.driver.invited', 'Driver Invitation', 'Invites a driver to join the fleet workspace.', 'account', ['freight', 'driver', 'invitation']),
  template('HuduFreight', 'freight.trip.delayed', 'Trip Delay Alert', 'Notifies stakeholders that a freight trip is delayed.', 'transactional', ['freight', 'trip', 'alert']),
  template('HuduFreight', 'freight.maintenance.due', 'Vehicle Maintenance Due', 'Reminds fleet managers about scheduled maintenance.', 'transactional', ['freight', 'maintenance']),
  template('HuduFreight', 'freight.fleet.metrics', 'Fleet Performance Report', 'Delivers utilisation, cost and delivery metrics.', 'transactional', ['freight', 'metrics', 'report']),

  template('CargoTracker', 'cargotracker.shipment.delayed', 'Shipment Delay Alert', 'Notifies cargo stakeholders about a shipment delay.', 'transactional', ['cargo', 'shipment', 'alert']),
  template('CargoTracker', 'cargotracker.milestone.reached', 'Shipment Milestone Reached', 'Confirms that cargo reached a tracking milestone.', 'transactional', ['cargo', 'milestone']),
  template('CargoTracker', 'cargotracker.exception.detected', 'Cargo Exception Detected', 'Alerts operators about a cargo tracking exception.', 'transactional', ['cargo', 'exception']),
  template('CargoTracker', 'cargotracker.daily.report', 'Daily Cargo Tracking Report', 'Delivers shipment movement and exception metrics.', 'transactional', ['cargo', 'report', 'metrics']),

  template('Inventory', 'inventory.stock.low', 'Low Stock Alert', 'Warns inventory managers that an item is below reorder level.', 'transactional', ['inventory', 'stock', 'alert']),
  template('Inventory', 'inventory.stock.out', 'Out of Stock Alert', 'Alerts inventory managers that an item is out of stock.', 'transactional', ['inventory', 'stock', 'alert']),
  template('Inventory', 'inventory.transfer.completed', 'Stock Transfer Completed', 'Confirms completion of an inventory transfer.', 'transactional', ['inventory', 'transfer']),
  template('Inventory', 'inventory.adjustment.approval_requested', 'Inventory Adjustment Approval', 'Requests approval for a stock adjustment.', 'transactional', ['inventory', 'approval']),
  template('Inventory', 'inventory.valuation.report', 'Inventory Valuation Report', 'Delivers stock valuation and movement metrics.', 'transactional', ['inventory', 'report', 'metrics']),

  template('SEAL', 'seal.approval.requested', 'Approval Required', 'Requests a decision in the SEAL approval workflow.', 'transactional', ['seal', 'approval']),
  template('SEAL', 'seal.approval.completed', 'Approval Completed', 'Confirms completion of a SEAL approval workflow.', 'transactional', ['seal', 'approval']),
  template('SEAL', 'seal.approval.rejected', 'Approval Rejected', 'Notifies the requester that approval was declined.', 'transactional', ['seal', 'approval']),
  template('SEAL', 'seal.approval.overdue', 'Approval Overdue', 'Reminds an approver about an overdue decision.', 'transactional', ['seal', 'approval', 'reminder']),

  template('Projects', 'projects.project.invitation', 'Project Invitation', 'Invites a participant to collaborate on a project.', 'account', ['projects', 'invitation']),
  template('Projects', 'projects.project.updated', 'Project Updated', 'Notifies stakeholders about an important project update.', 'transactional', ['projects', 'update']),
  template('Projects', 'projects.weekly.report', 'Weekly Project Report', 'Delivers progress, workload and delivery metrics.', 'transactional', ['projects', 'report', 'metrics']),
  template('Tasks', 'tasks.task.reminder', 'Task Reminder', 'Reminds a user about an upcoming task due date.', 'transactional', ['tasks', 'reminder']),
  template('Tasks', 'tasks.task.completed', 'Task Completed', 'Notifies followers that a task was completed.', 'transactional', ['tasks', 'update']),
  template('Tasks', 'tasks.daily.digest', 'Daily Task Digest', 'Summarises due, overdue and completed tasks.', 'transactional', ['tasks', 'digest', 'metrics']),

  template('Calendar', 'calendar.event.invitation', 'Calendar Invitation', 'Invites attendees to a calendar event.', 'account', ['calendar', 'invitation']),
  template('Calendar', 'calendar.daily.agenda', 'Daily Agenda', 'Delivers a daily schedule and meeting summary.', 'transactional', ['calendar', 'digest']),

  template('eSign', 'esign.document.declined', 'Signature Request Declined', 'Notifies the sender that a signer declined.', 'transactional', ['esign', 'declined']),
  template('eSign', 'esign.document.expired', 'Signature Request Expired', 'Notifies participants that a signing request expired.', 'transactional', ['esign', 'expired']),
  template('eSign', 'esign.audit.report', 'eSign Audit Report', 'Delivers signature completion and turnaround metrics.', 'transactional', ['esign', 'audit', 'report']),

  template('CMS', 'cms.content.review_requested', 'Content Review Requested', 'Requests editorial review for CMS content.', 'transactional', ['cms', 'review']),
  template('CMS', 'cms.content.published', 'Content Published', 'Confirms publication of CMS content.', 'transactional', ['cms', 'publish']),
  template('CMS', 'cms.form.submission', 'New Form Submission', 'Notifies site owners about a new form response.', 'transactional', ['cms', 'form']),
  template('CMS', 'cms.site.metrics', 'Website Performance Report', 'Delivers traffic, form and content metrics.', 'transactional', ['cms', 'metrics', 'report']),

  template('Onsite', 'onsite.site.offline', 'Site Offline Alert', 'Alerts operators that a monitored site is offline.', 'transactional', ['onsite', 'uptime', 'alert']),
  template('Onsite', 'onsite.site.recovered', 'Site Recovered', 'Confirms that a monitored site is online again.', 'transactional', ['onsite', 'uptime']),
  template('Onsite', 'onsite.ssl.expiring', 'SSL Certificate Expiring', 'Warns that a site certificate is nearing expiry.', 'transactional', ['onsite', 'ssl', 'warning']),
  template('Onsite', 'onsite.uptime.report', 'Uptime Report', 'Delivers availability, incidents and response metrics.', 'transactional', ['onsite', 'metrics', 'report']),

  template('HuduBI', 'hudubi.dashboard.shared', 'Dashboard Shared With You', 'Notifies a user that a BI dashboard was shared.', 'transactional', ['bi', 'dashboard', 'sharing']),
  template('HuduBI', 'hudubi.report.ready', 'BI Report Ready', 'Delivers a generated business intelligence report.', 'transactional', ['bi', 'report']),
  template('HuduBI', 'hudubi.metric.alert', 'Metric Threshold Alert', 'Alerts owners when a tracked metric crosses a threshold.', 'transactional', ['bi', 'metric', 'alert']),
  template('HuduBI', 'hudubi.digest', 'Business Metrics Digest', 'Summarises selected organisation metrics.', 'transactional', ['bi', 'metrics', 'digest']),

  template('Petti', 'petti.request.submitted', 'Petty Cash Request Submitted', 'Confirms submission of a petty cash request.', 'transactional', ['petty-cash', 'request']),
  template('Petti', 'petti.request.rejected', 'Petty Cash Request Declined', 'Notifies the requester that a petty cash request was declined.', 'transactional', ['petty-cash', 'request']),
  template('Petti', 'petti.reconciliation.due', 'Petty Cash Reconciliation Due', 'Reminds a custodian to reconcile an advance.', 'transactional', ['petty-cash', 'reconciliation']),
  template('Petti', 'petti.monthly.report', 'Petty Cash Report', 'Delivers disbursement, balance and reconciliation metrics.', 'transactional', ['petty-cash', 'report', 'metrics']),

  template('Studio', 'studio.workflow.published', 'Workflow Published', 'Confirms publication of a Studio workflow.', 'transactional', ['studio', 'workflow']),
  template('Studio', 'studio.workflow.failed', 'Workflow Run Failed', 'Alerts the owner when a workflow run fails.', 'transactional', ['studio', 'workflow', 'failure']),
  template('Studio', 'studio.workflow.approval_requested', 'Workflow Approval Required', 'Requests approval from a workflow participant.', 'transactional', ['studio', 'approval']),
  template('Studio', 'studio.workflow.metrics', 'Workflow Performance Report', 'Delivers run, success and automation metrics.', 'transactional', ['studio', 'metrics', 'report']),

  template('Notes', 'notes.note.shared', 'Note Shared With You', 'Notifies a user that a note was shared.', 'transactional', ['notes', 'sharing']),
  template('Notes', 'notes.comment.mention', 'Mentioned in a Note', 'Notifies a user that they were mentioned in a note.', 'transactional', ['notes', 'mention']),
  template('Developer', 'developer.api_key.created', 'API Key Created', 'Confirms creation of a new API credential.', 'account', ['developer', 'api', 'security']),
  template('Developer', 'developer.api_key.revoked', 'API Key Revoked', 'Confirms revocation of an API credential.', 'account', ['developer', 'api', 'security']),
  template('Developer', 'developer.webhook.failed', 'Webhook Delivery Failed', 'Alerts developers about repeated webhook failures.', 'transactional', ['developer', 'webhook', 'failure']),
  template('Developer', 'developer.usage.report', 'Developer Usage Report', 'Delivers API request, error and latency metrics.', 'transactional', ['developer', 'metrics', 'report']),
  template('Admin', 'admin.user.role_changed', 'Workspace Role Changed', 'Notifies a user when their workspace role changes.', 'account', ['admin', 'role', 'security']),
  template('Admin', 'admin.workspace.settings_changed', 'Workspace Settings Updated', 'Notifies admins about sensitive workspace changes.', 'account', ['admin', 'audit']),
  template('Admin', 'admin.security.digest', 'Workspace Security Digest', 'Summarises sign-ins, access changes and security alerts.', 'account', ['admin', 'security', 'digest']),
];

export function buildCatalogBody(entry: AppEmailTemplateCatalogEntry): string {
  return `
    <p>Hi {{recipientName}},</p>
    <p>{{summary}}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Reference</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">{{reference}}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;text-align:right;">{{eventDate}}</td></tr>
    </table>
    <p>{{details}}</p>
    <p><a href="{{actionUrl}}" style="background:#0d7a6b;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">{{actionLabel}}</a></p>
  `;
}
