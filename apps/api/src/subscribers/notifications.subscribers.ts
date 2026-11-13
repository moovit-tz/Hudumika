import { registerSubscriber } from '../services/domain-events.service.js';
import type { DomainEvent } from '../services/domain-events.service.js';
import { withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Domain events that should reach a person's bell and the header bar.
 *
 * Several apps already announce what happened (`hr.leave_approved`,
 * `deal.won`, `invoice.payment_recorded`…) for the activity log and for
 * Studio workflows, but nothing told the person it concerned. An audit found
 * 16 of 34 apps never raised a notification at all; for the ones that already
 * emit events, this file is the missing half, and the emitting code does not
 * change.
 *
 * Rules every handler follows:
 *   - never notify the person who did the thing (`event.actorId`);
 *   - a failure here is logged and swallowed — a notification must not be able
 *     to break the action that caused it;
 *   - look rows up after a short pause: dispatch is fire-and-forget and can
 *     run before the emitting transaction commits, so an immediate read of a
 *     row created in that transaction can come back empty.
 */

const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 600).unref?.(); });

function on(eventType: string, handler: (tenantId: string, event: DomainEvent) => Promise<void>): void {
  registerSubscriber(eventType, async (tenantId, event) => {
    try {
      await settle();
      await handler(tenantId, event);
    } catch (err: any) {
      console.error(`[NotificationSubscriber] ${eventType} failed:`, err?.message);
    }
  });
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const money = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
};

// ── NexusHR: the outcome of a leave request, to the person who asked ────────
for (const [type, approved] of [['hr.leave_approved', true], ['hr.leave_rejected', false]] as const) {
  on(type, async (tenantId, event) => {
    const userId = str(event.payload.userId);
    if (!userId || userId === str(event.payload.decidedBy) || userId === event.actorId) return;
    const leaveType = String(event.payload.leaveType ?? 'leave').toLowerCase().replace(/_/g, ' ');
    const range = [event.payload.fromDate, event.payload.toDate].filter(Boolean).join(' – ');
    await NotificationService.createNotification({
      tenantId, userId, app: 'nexushr', type: approved ? 'success' : 'warning',
      title: approved ? 'Leave approved' : 'Leave request declined',
      message: `Your ${leaveType} request${range ? ` (${range})` : ''} was ${approved ? 'approved' : 'declined'}.`,
      link: '/nexushr/me', entityType: 'leave', entityId: event.entityId ?? undefined,
    });
  });
}

// ── CRM: a deal closing, to whoever owns it ─────────────────────────────────
for (const [type, won] of [['deal.won', true], ['deal.lost', false]] as const) {
  on(type, async (tenantId, event) => {
    if (!event.entityId) return;
    const deal = await withTenant(tenantId, trx => trx.selectFrom('deals').select(['id', 'name', 'owner_id', 'currency'])
      .where('id', '=', event.entityId as string).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!deal?.owner_id || deal.owner_id === event.actorId) return;
    const value = money(event.payload.value);
    await NotificationService.createNotification({
      tenantId, userId: deal.owner_id, app: 'crm', type: won ? 'success' : 'warning',
      title: won ? `Deal won: ${deal.name}` : `Deal lost: ${deal.name}`,
      message: won
        ? (value ? `Closed at ${deal.currency ?? ''} ${value}.`.replace('  ', ' ') : 'Marked as won.')
        : (str(event.payload.reason) ? `Reason: ${event.payload.reason}` : 'Marked as lost.'),
      link: `/crm/pipeline?deal=${deal.id}`, entityType: 'deal', entityId: deal.id, entityLabel: deal.name,
    });
  });
}

// ── CRM: a new lead, to the person it was assigned to ───────────────────────
on('lead.created', async (tenantId, event) => {
  if (!event.entityId) return;
  const lead = await withTenant(tenantId, trx => trx.selectFrom('leads').select(['id', 'company', 'contact_name', 'assigned_to_id'])
    .where('id', '=', event.entityId as string).where('tenant_id', '=', tenantId).executeTakeFirst());
  if (!lead?.assigned_to_id || lead.assigned_to_id === event.actorId) return;
  await NotificationService.createNotification({
    tenantId, userId: lead.assigned_to_id, app: 'crm', type: 'task',
    title: 'New lead assigned to you',
    message: [lead.company, lead.contact_name].filter(Boolean).join(' — ') || undefined,
    link: `/crm/leads/${lead.id}`, entityType: 'lead', entityId: lead.id, entityLabel: lead.company ?? undefined,
  });
});

// ── FinOps: money in, to finance and to whoever raised the invoice ──────────
on('invoice.payment_recorded', async (tenantId, event) => {
  if (!event.entityId) return;
  const invoice = await withTenant(tenantId, trx => trx.selectFrom('sales_invoices').selectAll()
    .where('id', '=', event.entityId as string).where('tenant_id', '=', tenantId).executeTakeFirst()) as any;
  if (!invoice) return;
  const amount = money(event.payload.amount);
  await NotificationService.notifyRoles(tenantId, ['FINANCE'], {
    app: 'finops', type: 'success',
    title: `Payment received: ${invoice.invoice_number}`,
    message: [invoice.client_name, amount ? `${invoice.currency ?? ''} ${amount}`.trim() : ''].filter(Boolean).join(' — ') || undefined,
    link: `/finance/invoices/${invoice.id}`, entityType: 'invoice', entityId: invoice.id, entityLabel: invoice.invoice_number,
  }, { alsoUserIds: [invoice.created_by], exceptUserId: event.actorId ?? undefined });
});

// ── ClearOS: customs released a declaration, to the shipment's officer ──────
on('declaration.released', async (tenantId, event) => {
  const shipmentId = str(event.payload.shipmentId);
  if (!shipmentId) return;
  const shipment = await withTenant(tenantId, trx => trx.selectFrom('shipment_cases').select(['id', 'ref_number', 'assigned_to'])
    .where('id', '=', shipmentId).where('tenant_id', '=', tenantId).executeTakeFirst());
  if (!shipment?.assigned_to || shipment.assigned_to === event.actorId) return;
  await NotificationService.createNotification({
    tenantId, userId: shipment.assigned_to, app: 'clearos', type: 'success',
    title: 'Customs released',
    message: `${shipment.ref_number}${str(event.payload.tansadNumber) ? ` — TANSAD ${event.payload.tansadNumber}` : ''} has been released.`,
    link: `/clearance/${shipment.id}`, entityType: 'shipment', entityId: shipment.id, entityLabel: shipment.ref_number ?? undefined,
  });
});

// ── Drive: a file the scanner pulled, to its owner ──────────────────────────
on('cloud.file.quarantined', async (tenantId, event) => {
  if (!event.entityId) return;
  const file = await withTenant(tenantId, trx => trx.selectFrom('cloud_files').select(['id', 'name', 'owner_id'])
    .where('id', '=', event.entityId as string).where('tenant_id', '=', tenantId).executeTakeFirst());
  if (!file?.owner_id) return;
  await NotificationService.createNotification({
    tenantId, userId: file.owner_id, app: 'cloud', type: 'security',
    title: 'A file was quarantined',
    message: `"${file.name}" failed the malware scan and can no longer be downloaded.`,
    link: '/cloud', entityType: 'file', entityId: file.id, entityLabel: file.name,
  });
});

// ── Projects: a change request, to the project's owner ──────────────────────
on('project.change_request.submitted', async (tenantId, event) => {
  if (!event.entityId) return;
  const row = await withTenant(tenantId, trx => trx.selectFrom('project_change_requests as c')
    .innerJoin('projects as p', join => join.onRef('p.id', '=', 'c.project_id').onRef('p.tenant_id', '=', 'c.tenant_id'))
    .select(['c.id', 'c.title', 'c.change_code', 'p.id as project_id', 'p.name as project_name', 'p.owner_id'])
    .where('c.id', '=', event.entityId as string).where('c.tenant_id', '=', tenantId).executeTakeFirst());
  if (!row?.owner_id || row.owner_id === event.actorId) return;
  await NotificationService.createNotification({
    tenantId, userId: row.owner_id, app: 'projects', type: 'task',
    title: `Change request to review: ${row.change_code}`,
    message: `${row.title} — ${row.project_name}`,
    link: `/projects/${row.project_id}`, entityType: 'project', entityId: row.project_id, entityLabel: row.project_name,
  });
});
