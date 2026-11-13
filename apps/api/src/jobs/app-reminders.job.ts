import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Daily "something needs your attention" reminders for apps that had none.
 *
 * Three scans, each for an app that raised no notification of any kind:
 *
 *   LexCore    a matter deadline that is due within three days, or overdue
 *              → the matter's responsible attorney
 *   Inventory  an item at or below its reorder point
 *              → managers and finance
 *   FinOps     a customer invoice that has gone past its due date unpaid
 *              → finance, and whoever raised it
 *   CRM        a follow-up that is due today or already late
 *              → the person it is assigned to
 *
 * Every scan is idempotent in the same way: a subject that already has an
 * UNREAD notification with the same title is skipped. Running this twice in a
 * day does nothing; a reminder that was read comes back tomorrow only if the
 * condition is still true, which is the nudge it is meant to be. A low-stock
 * or overdue notice whose condition has cleared is marked read automatically,
 * so the bell does not keep asserting something that is no longer so.
 */

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function hasUnread(trx: any, tenantId: string, app: string, entityId: string, title: string): Promise<boolean> {
  const row = await trx.selectFrom('notifications').select('id')
    .where('tenant_id', '=', tenantId).where('app', '=', app).where('entity_id', '=', entityId)
    .where('title', '=', title).where('read', '=', false).executeTakeFirst();
  return !!row;
}

/** Marks unread notices read when the thing they warned about is no longer true. */
async function resolveCleared(trx: any, tenantId: string, app: string, entityType: string, stillTrueIds: string[]): Promise<void> {
  let q = trx.updateTable('notifications')
    .set({ read: true, status: 'AUTO_RESOLVED', read_at: new Date() })
    .where('tenant_id', '=', tenantId).where('app', '=', app).where('entity_type', '=', entityType).where('read', '=', false);
  if (stillTrueIds.length) q = q.where('entity_id', 'not in', stillTrueIds);
  await q.execute();
}

async function legalDeadlines(tenantId: string): Promise<number> {
  const today = new Date();
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const due = await withTenant(tenantId, trx => trx.selectFrom('legal_deadlines as d')
    .innerJoin('legal_matters as m', join => join.onRef('m.id', '=', 'd.matter_id').onRef('m.tenant_id', '=', 'd.tenant_id'))
    .select(['d.id', 'd.description', 'd.due_date', 'd.deadline_type', 'd.is_critical', 'm.id as matter_id', 'm.matter_number', 'm.title as matter_title', 'm.responsible_attorney_id'])
    .where('d.tenant_id', '=', tenantId).where('d.completed_at', 'is', null)
    .where('d.due_date', '<=', isoDay(horizon) as any)
    .execute());
  let sent = 0;
  for (const d of due) {
    if (!d.responsible_attorney_id) continue;
    const rawDue: any = d.due_date;
    const dueDay = (rawDue instanceof Date ? isoDay(rawDue) : String(rawDue)).slice(0, 10);
    const overdue = dueDay < isoDay(today);
    const title = overdue ? 'Matter deadline overdue' : 'Matter deadline approaching';
    const skip = await withTenant(tenantId, trx => hasUnread(trx, tenantId, 'lexcore', d.id, title));
    if (skip) continue;
    await NotificationService.notifyUsers(tenantId, [d.responsible_attorney_id], {
      app: 'lexcore', type: overdue || d.is_critical ? 'security' : 'task', title,
      message: `${d.matter_number} — ${d.description || String(d.deadline_type).toLowerCase().replace(/_/g, ' ')} ${overdue ? 'was due' : 'is due'} ${dueDay}.`,
      link: '/lexcore', entityType: 'legal_deadline', entityId: d.id, entityLabel: d.matter_number,
    });
    sent++;
  }
  return sent;
}

async function lowStock(tenantId: string): Promise<number> {
  const rows = await withTenant(tenantId, trx => trx.selectFrom('inventory_items')
    .leftJoin('inventory_stock_levels', 'inventory_stock_levels.item_id', 'inventory_items.id')
    .select(({ fn }) => [
      'inventory_items.id', 'inventory_items.sku', 'inventory_items.name', 'inventory_items.base_uom', 'inventory_items.reorder_point',
      fn.coalesce(fn.sum<string>('inventory_stock_levels.qty_on_hand'), sql.lit('0')).as('on_hand'),
    ])
    .where('inventory_items.tenant_id', '=', tenantId).where('inventory_items.active', '=', true)
    .where('inventory_items.reorder_point', 'is not', null)
    .groupBy(['inventory_items.id', 'inventory_items.sku', 'inventory_items.name', 'inventory_items.base_uom', 'inventory_items.reorder_point'])
    .execute());
  const low = rows.filter(r => Number(r.on_hand) <= Number(r.reorder_point));
  await withTenant(tenantId, trx => resolveCleared(trx, tenantId, 'store', 'inventory_item', low.map(r => r.id)));
  let sent = 0;
  for (const item of low) {
    const title = 'Stock at or below reorder point';
    if (await withTenant(tenantId, trx => hasUnread(trx, tenantId, 'store', item.id, title))) continue;
    await NotificationService.notifyRoles(tenantId, ['MANAGER', 'FINANCE', 'TENANT_ADMIN', 'ADMIN'], {
      app: 'store', type: 'warning', title,
      message: `${item.name}${item.sku ? ` (${item.sku})` : ''}: ${Number(item.on_hand)} ${item.base_uom ?? ''} on hand, reorder point ${Number(item.reorder_point)}.`.replace('  ', ' '),
      link: '/finance/products', entityType: 'inventory_item', entityId: item.id, entityLabel: item.sku ?? item.name,
    });
    sent++;
  }
  return sent;
}

async function overdueInvoices(tenantId: string): Promise<number> {
  const today = isoDay(new Date());
  const rows = await withTenant(tenantId, trx => trx.selectFrom('sales_invoices').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('status', 'in', ['Unpaid', 'Partial', 'Overdue'])
    .where('due_date', 'is not', null).where('due_date', '<', today as any)
    .execute()) as any[];
  await withTenant(tenantId, trx => resolveCleared(trx, tenantId, 'finops', 'overdue_invoice', rows.map(r => r.id)));
  let sent = 0;
  for (const inv of rows) {
    const title = `Invoice overdue: ${inv.invoice_number}`;
    if (await withTenant(tenantId, trx => hasUnread(trx, tenantId, 'finops', inv.id, title))) continue;
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(String(inv.due_date instanceof Date ? isoDay(inv.due_date) : inv.due_date).slice(0, 10))) / 86_400_000));
    await NotificationService.notifyRoles(tenantId, ['FINANCE'], {
      app: 'finops', type: 'warning', title,
      message: `${inv.client_name ?? 'Customer'} — ${days} day${days === 1 ? '' : 's'} past due.`,
      link: `/finance/invoices/${inv.id}`, entityType: 'overdue_invoice', entityId: inv.id, entityLabel: inv.invoice_number,
    }, { alsoUserIds: [inv.created_by] });
    sent++;
  }
  return sent;
}

async function crmFollowUps(tenantId: string): Promise<number> {
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const rows = await withTenant(tenantId, trx => trx.selectFrom('crm_tasks')
    .select(['id', 'title', 'due_at', 'assigned_to', 'subject_type', 'subject_id'])
    .where('tenant_id', '=', tenantId).where('done', '=', false)
    .where('assigned_to', 'is not', null).where('due_at', 'is not', null).where('due_at', '<=', endOfToday)
    .execute());
  await withTenant(tenantId, trx => resolveCleared(trx, tenantId, 'crm', 'crm_followup', rows.map(r => r.id)));
  let sent = 0;
  for (const t of rows) {
    const late = new Date(t.due_at as any).getTime() < new Date().setHours(0, 0, 0, 0);
    const title = late ? 'Follow-up overdue' : 'Follow-up due today';
    if (await withTenant(tenantId, trx => hasUnread(trx, tenantId, 'crm', t.id, title))) continue;
    await NotificationService.notifyUsers(tenantId, [t.assigned_to], {
      app: 'crm', type: late ? 'warning' : 'task', title, message: t.title,
      link: t.subject_type === 'deal' ? `/crm/pipeline?deal=${t.subject_id}` : `/crm/leads/${t.subject_id}`,
      entityType: 'crm_followup', entityId: t.id,
    });
    sent++;
  }
  return sent;
}

export async function runAppRemindersJob(): Promise<void> {
  console.log('⏳ Running background job: App reminders (legal deadlines, low stock, overdue invoices, CRM follow-ups)...');
  try {
    const tenants = await dbPlatform.selectFrom('tenants').select('id').where('active', '=', true).execute();
    let sent = 0;
    for (const tenant of tenants) {
      // One scan failing (an app's tables absent for a tenant, a bad row)
      // must not stop the other two, or the other tenants.
      for (const scan of [legalDeadlines, lowStock, overdueInvoices, crmFollowUps]) {
        try { sent += await scan(tenant.id); }
        catch (err: any) { console.error(`[AppReminders] ${scan.name} failed for tenant ${tenant.id}:`, err?.message); }
      }
    }
    console.log(`✅ App reminders job completed — ${sent} reminder(s) raised.`);
  } catch (error) {
    console.error('❌ App reminders job failed:', error);
  }
}
