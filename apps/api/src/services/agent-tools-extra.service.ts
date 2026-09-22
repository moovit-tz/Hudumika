import { withTenant } from '../db/client.js';
import { logCrmActivity } from '../routes/crm-activity.routes.js';
import { dealSelect, mapDeal } from '../routes/deals.routes.js';
import { invoiceGrandTotal } from '../routes/invoices.routes.js';

/**
 * Milestone 4 of the agentic platform build (see
 * C:\Users\Viden\.claude\plans\ancient-bouncing-gem.md) — new read/write
 * functions backing agent-registry.ts's newly-added Tasks/CRM tools.
 *
 * Studio's own house rule (studio/actions.ts): a tool calls existing
 * business logic, it never invents new logic behind an agent's back. Two
 * different shapes of "existing" here:
 *
 *   - listMyOpenTasks deliberately DUPLICATES (not calls) tasks.routes.ts's
 *     GET /items visibility rules (owner / assignee / list owner / shared
 *     list / project member / collaborator) rather than extracting that
 *     135-line handler into a shared function both call — that live,
 *     heavily-used endpoint also joins subtasks/time-entries/blocked-counts
 *     this tool doesn't need, and restructuring it carries real regression
 *     risk for a feature everyone in the app uses today. Same real access
 *     rules, a leaner read-only projection, zero change to the existing
 *     route. If GET /items' visibility rules ever change, this needs the
 *     same edit made twice — an accepted, explicit tradeoff, not an
 *     oversight.
 *   - listDeals reuses deals.routes.ts's own exported dealSelect()/mapDeal()
 *     query-building helpers directly — a genuine shared call, not a copy.
 *   - addCrmNote calls crm-activity.routes.ts's exported
 *     logCrmActivity() directly — also a genuine shared call.
 */

export interface MyOpenTask {
  id: string;
  title: string;
  due: string | null;
  priority: string;
  status: string;
  starred: boolean;
}

/** The calling user's own open (not completed, not soft-deleted) tasks —
 *  same visibility rules as tasks.routes.ts's GET /items, see file header. */
export async function listMyOpenTasks(tenantId: string, userId: string): Promise<MyOpenTask[]> {
  return withTenant(tenantId, async (trx) => {
    const [sharedListRows, memberProjectRows, collabRows] = await Promise.all([
      trx.selectFrom('task_list_shares').select('list_id').where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute(),
      trx.selectFrom('project_members').select('project_id').where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute(),
      trx.selectFrom('task_collaborators').select('task_id').where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute(),
    ]);
    const sharedListIds = sharedListRows.map(r => r.list_id);
    const memberProjectIds = memberProjectRows.map(r => r.project_id);
    const collabTaskIds = collabRows.map(r => r.task_id);

    const rows = await trx.selectFrom('tasks')
      .leftJoin('task_lists', 'task_lists.id', 'tasks.list_id')
      .where('tasks.tenant_id', '=', tenantId)
      .where('tasks.completed', '=', false)
      .where('tasks.deleted_at', 'is', null)
      .where(eb => {
        const conds = [eb('tasks.user_id', '=', userId), eb('tasks.assignee_id', '=', userId), eb('task_lists.user_id', '=', userId)];
        if (sharedListIds.length) conds.push(eb('tasks.list_id', 'in', sharedListIds));
        if (memberProjectIds.length) conds.push(eb.and([eb('tasks.project_id', 'in', memberProjectIds), eb('tasks.is_private', '=', false)]));
        if (collabTaskIds.length) conds.push(eb('tasks.id', 'in', collabTaskIds));
        return eb.or(conds);
      })
      .select(['tasks.id', 'tasks.title', 'tasks.due', 'tasks.priority', 'tasks.status', 'tasks.starred'])
      .orderBy('tasks.sort_order', 'asc')
      .limit(50)
      .execute();

    return rows.map(r => ({ id: r.id, title: r.title, due: r.due, priority: r.priority, status: r.status, starred: r.starred }));
  });
}

export interface DealSummary {
  id: string;
  name: string;
  stage: string;
  value: number;
  customerName: string | null;
}

/** Open deals, optionally filtered to one owner — a thin agent-facing
 *  projection over deals.routes.ts's own exported dealSelect()/mapDeal(),
 *  the same query-building helpers that route's own GET / uses. */
export async function listDeals(tenantId: string, opts: { ownerId?: string; limit?: number } = {}): Promise<DealSummary[]> {
  return withTenant(tenantId, async (trx) => {
    let q = dealSelect(trx).where('deals.tenant_id', '=', tenantId);
    if (opts.ownerId) q = q.where('deals.owner_id', '=', opts.ownerId);
    const rows = await q.orderBy('deals.created_at', 'desc').limit(opts.limit ?? 25).execute();
    return rows.map((r: any) => {
      const d = mapDeal(r);
      return { id: d.id, name: d.name, stage: d.stage, value: d.value, customerName: d.customer_name ?? null };
    });
  });
}

/** Adds a real, permanent CRM activity note to a lead or deal — calls
 *  crm-activity.routes.ts's own logCrmActivity() directly, the same
 *  function that route's own POST endpoint uses. Verifies the subject
 *  belongs to this tenant first (logCrmActivity itself does not — its
 *  route caller normally does that check before ever calling it, so this
 *  wrapper has to replicate that guard rather than skip it). */
export async function addCrmNote(tenantId: string, input: { subjectType: 'lead' | 'deal'; subjectId: string; body: string }): Promise<{ ok: boolean; detail: string }> {
  return withTenant(tenantId, async (trx) => {
    const table = input.subjectType === 'lead' ? 'leads' : 'deals';
    const exists = await trx.selectFrom(table).select('id').where('id', '=', input.subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!exists) return { ok: false, detail: `No ${input.subjectType} with that id in this workspace.` };
    await logCrmActivity(trx, { tenantId, subjectType: input.subjectType, subjectId: input.subjectId, type: 'note', body: input.body });
    return { ok: true, detail: `Note added to the ${input.subjectType}.` };
  });
}

export interface UnpaidInvoiceSummary {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  status: string;
  dueDate: string | null;
  currency: string;
  total: number;
  received: number;
  outstanding: number;
}

/** Invoices still owing money (Unpaid / Partial / Overdue — never Draft,
 *  Paid or Credited), soonest-due first. Totals come from invoices.routes.ts's
 *  own exported invoiceGrandTotal() — the exact conversion the Billing page
 *  and the receivables report use — so an agent's figure can never disagree
 *  with what the finance team sees. Same tenant-scoped tables and status
 *  vocabulary as that route's GET /; a read-only projection, no new logic. */
export async function listUnpaidInvoices(tenantId: string, opts: { overdueOnly?: boolean; limit?: number } = {}): Promise<UnpaidInvoiceSummary[]> {
  return withTenant(tenantId, async (trx) => {
    const statuses = opts.overdueOnly ? ['Overdue'] : ['Unpaid', 'Partial', 'Overdue'];
    const invoices = await trx.selectFrom('sales_invoices')
      .select(['id', 'invoice_number', 'client_name', 'status', 'due_date', 'currency', 'exchange_rate', 'received'])
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', statuses)
      .orderBy('due_date', 'asc')
      .limit(opts.limit ?? 25)
      .execute();
    if (invoices.length === 0) return [];
    const lines = await trx.selectFrom('sales_invoice_lines')
      .select(['invoice_id', 'qty', 'rate', 'tax_pct', 'currency'])
      .where('invoice_id', 'in', invoices.map(i => i.id))
      .execute();
    return invoices.map(inv => {
      const total = invoiceGrandTotal(lines.filter(l => l.invoice_id === inv.id), inv.currency, Number(inv.exchange_rate) || 1);
      const received = Number(inv.received) || 0;
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        clientName: inv.client_name,
        status: inv.status,
        dueDate: inv.due_date ? new Date(inv.due_date as any).toISOString().slice(0, 10) : null,
        currency: inv.currency,
        total: Math.round(total * 100) / 100,
        received,
        outstanding: Math.round((total - received) * 100) / 100,
      };
    });
  });
}

export interface MyTicketSummary {
  id: string;
  ref: string;
  subject: string;
  status: string;
  priority: string;
  customer: string | null;
  slaDeadline: string | null;
}

/** Open Bliss support tickets assigned to this user (OPEN / IN_PROGRESS).
 *  support.routes.ts's GET /tickets has no "assigned to me" filter — it's
 *  the same support_tickets/customers tables and the same tenant scoping,
 *  with the one extra assigned_to condition a "my tickets" question needs. */
export async function listMyOpenTickets(tenantId: string, userId: string): Promise<MyTicketSummary[]> {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('support_tickets as st')
      .leftJoin('customers as c', 'c.id', 'st.customer_id')
      .select(['st.id', 'st.ref_number', 'st.subject', 'st.status', 'st.priority', 'c.name as customer', 'st.sla_deadline'])
      .where('st.tenant_id', '=', tenantId)
      .where('st.assigned_to', '=', userId)
      .where('st.status', 'in', ['OPEN', 'IN_PROGRESS'])
      .orderBy('st.sla_deadline', 'asc')
      .limit(25)
      .execute();
    return rows.map(r => ({
      id: r.id, ref: r.ref_number, subject: r.subject, status: r.status, priority: r.priority,
      customer: r.customer ?? null,
      slaDeadline: r.sla_deadline ? new Date(r.sla_deadline).toISOString() : null,
    }));
  });
}
