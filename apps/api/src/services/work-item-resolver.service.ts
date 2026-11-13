/** Resolves product-owned work records into immutable time-entry snapshots.
 * Every branch is explicit about tenant, lifecycle and worker access; opaque
 * IDs from the browser are never trusted as proof of assignment. */
export interface ResolvedWorkItem {
  appId: string;
  type: string;
  id: string;
  ref: string | null;
  label: string;
  taskName: string;
  billable: boolean;
}

export async function resolveAdditionalWorkItem(
  trx: any,
  tenantId: string,
  userId: string,
  role: string,
  appId: string,
  type: string,
  id: string,
  managerRoles: readonly string[],
): Promise<ResolvedWorkItem | null> {
  const elevated = managerRoles.includes(role) || ['ADMIN', 'SUPER_ADMIN', 'TENANT_ADMIN'].includes(role);

  if (appId === 'tuma' && type === 'parcel') {
    const parcel = await trx.selectFrom('tuma_parcels')
      .select(['id', 'parcel_number', 'name', 'description', 'status', 'created_by', 'dispatcher_id', 'offloader_id', 'deliverer_id'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!parcel || ['DELIVERED', 'PICKED_UP', 'CANCELED'].includes(String(parcel.status).toUpperCase())) throw Object.assign(new Error('Parcel not found or no longer active.'), { statusCode: 404 });
    const assigned = [parcel.created_by, parcel.dispatcher_id, parcel.offloader_id, parcel.deliverer_id].includes(userId);
    if (!assigned && !elevated) throw Object.assign(new Error('You are not assigned to this parcel.'), { statusCode: 403 });
    const label = parcel.name || parcel.description || `Parcel ${parcel.parcel_number}`;
    return { appId, type, id: parcel.id, ref: parcel.parcel_number, label, taskName: `Tuma: ${parcel.parcel_number}`, billable: false };
  }

  if (appId === 'seal' && type === 'task') {
    const task = await trx.selectFrom('seal_tasks')
      .select(['id', 'title', 'status', 'assigned_to', 'created_by'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!task || ['complete', 'blocked', 'cancelled'].includes(String(task.status).toLowerCase())) {
      throw Object.assign(new Error('Seal task not found or no longer active.'), { statusCode: 404 });
    }
    if (task.assigned_to !== userId && task.created_by !== userId && !elevated) {
      throw Object.assign(new Error('You are not assigned to this Seal task.'), { statusCode: 403 });
    }
    return { appId, type, id: task.id, ref: null, label: task.title, taskName: `Seal: ${task.title}`, billable: false };
  }

  if (appId === 'hudufreight' && type === 'booking') {
    const booking = await trx.selectFrom('freight_bookings')
      .select(['id', 'booking_number', 'cargo_desc', 'status', 'created_by'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!booking || ['CANCELLED', 'CANCELED'].includes(String(booking.status).toUpperCase())) {
      throw Object.assign(new Error('Freight booking not found or cancelled.'), { statusCode: 404 });
    }
    if (booking.created_by !== userId && !elevated) {
      throw Object.assign(new Error('Only the booking creator or a workspace manager can log time to this booking.'), { statusCode: 403 });
    }
    const label = booking.cargo_desc || booking.booking_number;
    return { appId, type, id: booking.id, ref: booking.booking_number, label, taskName: `Freight: ${booking.booking_number}`, billable: false };
  }

  if (appId === 'tasks' && type === 'task') {
    const task = await trx.selectFrom('tasks')
      .select(['id', 'title', 'notes', 'status', 'completed', 'assignee_id', 'user_id', 'is_billable'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
    if (!task || task.completed) throw Object.assign(new Error('Workspace task not found or already completed.'), { statusCode: 404 });
    if (task.assignee_id !== userId && task.user_id !== userId && !elevated) {
      throw Object.assign(new Error('You are not assigned to this workspace task.'), { statusCode: 403 });
    }
    return { appId, type, id: task.id, ref: null, label: task.title, taskName: `Task: ${task.title}`, billable: !!task.is_billable };
  }

  if (appId === 'clearos' && type === 'task') {
    const sTask = await trx.selectFrom('shipment_tasks')
      .select(['id', 'title', 'status', 'assigned_to', 'shipment_id'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!sTask || sTask.status === 'complete') throw Object.assign(new Error('Shipment task not found or complete.'), { statusCode: 404 });
    if (sTask.assigned_to !== userId && !elevated) {
      throw Object.assign(new Error('You are not assigned to this clearance task.'), { statusCode: 403 });
    }
    return { appId, type, id: sTask.id, ref: null, label: sTask.title, taskName: `Clearance: ${sTask.title}`, billable: false };
  }

  if (appId === 'crm' && type === 'task') {
    const cTask = await trx.selectFrom('crm_tasks')
      .select(['id', 'title', 'done', 'assigned_to', 'created_by'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!cTask || cTask.done) throw Object.assign(new Error('CRM task not found or already done.'), { statusCode: 404 });
    if (cTask.assigned_to !== userId && cTask.created_by !== userId && !elevated) {
      throw Object.assign(new Error('You are not assigned to this CRM task.'), { statusCode: 403 });
    }
    return { appId, type, id: cTask.id, ref: null, label: cTask.title, taskName: `CRM: ${cTask.title}`, billable: false };
  }

  if (appId === 'support' && type === 'ticket') {
    const ticket = await trx.selectFrom('support_tickets')
      .select(['id', 'ref_number', 'subject', 'status', 'assigned_to'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!ticket || ['resolved', 'closed'].includes(String(ticket.status).toLowerCase())) {
      throw Object.assign(new Error('Support ticket not found or already closed.'), { statusCode: 404 });
    }
    if (ticket.assigned_to !== userId && !elevated) {
      throw Object.assign(new Error('You are not assigned to this support ticket.'), { statusCode: 403 });
    }
    return { appId, type, id: ticket.id, ref: ticket.ref_number, label: ticket.subject, taskName: `Support: ${ticket.ref_number} — ${ticket.subject}`, billable: false };
  }

  if (appId === 'finops' && type === 'invoice') {
    const invoice = await trx.selectFrom('sales_invoices')
      .select(['id', 'invoice_number', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!invoice) throw Object.assign(new Error('Invoice not found in this workspace.'), { statusCode: 404 });
    return { appId, type, id: invoice.id, ref: invoice.invoice_number, label: `Invoice ${invoice.invoice_number}`, taskName: `Billing: ${invoice.invoice_number}`, billable: false };
  }

  if (appId === 'complyos' && type === 'obligation') {
    const ob = await trx.selectFrom('comply_obligations')
      .select(['id', 'title', 'obligation_code', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!ob) throw Object.assign(new Error('Compliance obligation not found.'), { statusCode: 404 });
    return { appId, type, id: ob.id, ref: ob.obligation_code, label: ob.title, taskName: `Compliance: ${ob.title}`, billable: false };
  }

  return null;
}
