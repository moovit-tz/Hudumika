import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type {
  ProjectPurchaseRequest,
  ProjectRfq,
  ProjectPurchaseOrder,
  ProjectGoodsReceipt,
} from '@hudumika/types';

export class ProjectProcurementService {
  // ─── Purchase Requests (Requisitions) ─────────────────────────────

  static requestResponse(row: any) {
    return { ...row, pr_number: row.req_number, estimated_cost: Number(row.total_estimated_cost),
      status: row.status.toLowerCase(), justification: row.metadata.justification ?? null,
      required_date: row.metadata.required_date ?? null };
  }

  static async listPurchaseRequests(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_purchase_requests')
      .leftJoin('users as req', join => join.on(sql<boolean>`req.id = project_purchase_requests.requested_by and req.tenant_id = ${tenantId}`))
      .leftJoin('project_work_packages as wp', join => join.on(sql<boolean>`wp.id = project_purchase_requests.work_package_id and wp.tenant_id = ${tenantId} and wp.project_id = ${projectId}`))
      .where('project_purchase_requests.tenant_id', '=', tenantId).where('project_purchase_requests.project_id', '=', projectId)
      .selectAll('project_purchase_requests').select(['req.name as requester_name', 'wp.name as work_package_name'])
      .orderBy('project_purchase_requests.created_at', 'desc').execute();
    return rows.map(this.requestResponse);
  }

  static async createPurchaseRequest(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    pr_number: string; work_package_id?: string | null; title: string; justification?: string | null;
    estimated_cost: number; required_date?: string | null; items?: any[];
  }) {
    const project = await trx.selectFrom('projects').select(['id', 'currency']).where('tenant_id', '=', tenantId).where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow();
    if (data.work_package_id && !await trx.selectFrom('project_work_packages').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', data.work_package_id).executeTakeFirst())
      throw Object.assign(new Error('Work package not found in this project'), { statusCode: 404 });
    if (await trx.selectFrom('project_purchase_requests').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('req_number', '=', data.pr_number).executeTakeFirst())
      throw Object.assign(new Error('Purchase request number already exists in this project'), { statusCode: 409 });
    const row = await trx.insertInto('project_purchase_requests').values({ tenant_id: tenantId, project_id: projectId,
      work_package_id: data.work_package_id ?? null, req_number: data.pr_number, title: data.title,
      total_estimated_cost: data.estimated_cost, currency: project.currency, status: 'SUBMITTED', requested_by: userId,
      items: JSON.stringify(data.items ?? []) as unknown as any[], metadata: { justification: data.justification ?? null, required_date: data.required_date ?? null },
    }).returningAll().executeTakeFirstOrThrow();
    return this.requestResponse(row);
  }

  static rfqResponse(row: any) {
    return { ...row, scope_description: row.metadata.scope_description ?? null,
      issue_date: row.metadata.issue_date ?? null, closing_date: row.submission_deadline,
      created_by: row.metadata.created_by ?? null,
      status: row.status === 'OPEN' ? 'issued' : row.status.toLowerCase() };
  }

  static async listRfqs(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rfqs = await trx.selectFrom('project_rfqs').selectAll().where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId).orderBy('created_at', 'desc').execute();
    if (!rfqs.length) return [];
    const suppliers = await trx.selectFrom('project_rfq_suppliers as bid')
      .innerJoin('suppliers as supplier', join => join.on(sql<boolean>`supplier.id = bid.supplier_id and supplier.tenant_id = ${tenantId}`))
      .selectAll('bid').select(['supplier.name as supplier_name', 'supplier.email as contact_email'])
      .where('bid.tenant_id', '=', tenantId).where('bid.rfq_id', 'in', rfqs.map(row => row.id)).execute();
    return rfqs.map(row => ({ ...this.rfqResponse(row), suppliers: suppliers.filter(bid => bid.rfq_id === row.id).map(bid => ({
      ...bid, quoted_amount: bid.quoted_amount === null ? null : Number(bid.quoted_amount), bid_currency: bid.currency,
      is_selected: bid.is_awarded, delivery_lead_time_days: bid.metadata.delivery_lead_time_days ?? null,
      technical_compliance_score: bid.metadata.technical_compliance_score ?? null, commercial_score: bid.metadata.commercial_score ?? null,
    })) }));
  }

  static async createRfq(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    purchase_request_id?: string | null; rfq_number: string; title: string; scope_description?: string | null;
    issue_date?: string; closing_date: string;
    suppliers: Array<{ supplier_id: string; quoted_amount?: number | null; delivery_lead_time_days?: number | null;
      technical_compliance_score?: number | null; commercial_score?: number | null }>;
  }) {
    const project = await trx.selectFrom('projects').select(['id', 'currency']).where('tenant_id', '=', tenantId).where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow();
    if (data.purchase_request_id && !await trx.selectFrom('project_purchase_requests').select('id').where('tenant_id', '=', tenantId)
      .where('project_id', '=', projectId).where('id', '=', data.purchase_request_id).executeTakeFirst())
      throw Object.assign(new Error('Purchase request not found in this project'), { statusCode: 404 });
    if (await trx.selectFrom('project_rfqs').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('rfq_number', '=', data.rfq_number).executeTakeFirst())
      throw Object.assign(new Error('RFQ number already exists in this project'), { statusCode: 409 });
    if (new Set(data.suppliers.map(supplier => supplier.supplier_id)).size !== data.suppliers.length)
      throw Object.assign(new Error('Select each supplier only once'), { statusCode: 400 });
    for (const supplier of data.suppliers) if (!await trx.selectFrom('suppliers').select('id').where('tenant_id', '=', tenantId).where('id', '=', supplier.supplier_id).executeTakeFirst())
      throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });
    const issueDate = data.issue_date ?? new Date().toISOString().slice(0, 10);
    if (data.closing_date < issueDate) throw Object.assign(new Error('Closing date must be on or after issue date'), { statusCode: 400 });
    const rfq = await trx.insertInto('project_rfqs').values({ tenant_id: tenantId, project_id: projectId,
      purchase_request_id: data.purchase_request_id ?? null, rfq_number: data.rfq_number, title: data.title,
      submission_deadline: data.closing_date, status: 'OPEN', metadata: { scope_description: data.scope_description ?? null, issue_date: issueDate, created_by: userId },
    }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('project_rfq_suppliers').values(data.suppliers.map(supplier => ({ tenant_id: tenantId, rfq_id: rfq.id,
      supplier_id: supplier.supplier_id, quoted_amount: supplier.quoted_amount ?? null, currency: project.currency, is_awarded: false,
      metadata: { delivery_lead_time_days: supplier.delivery_lead_time_days ?? null, technical_compliance_score: supplier.technical_compliance_score ?? null, commercial_score: supplier.commercial_score ?? null },
    }))).execute();
    return this.rfqResponse(rfq);
  }

  static orderResponse(row: any) {
    return { ...row, total_amount: Number(row.total_amount), status: row.status.toLowerCase(),
      purchase_request_id: row.metadata.purchase_request_id ?? null,
      issue_date: row.metadata.issue_date ?? new Date(row.issued_at).toISOString().slice(0, 10),
      expected_delivery_date: row.delivery_due_date, payment_terms: row.metadata.payment_terms ?? null,
      incoterms: row.metadata.incoterms ?? null, delivery_location: row.metadata.delivery_location ?? null,
      created_by: row.metadata.created_by ?? null, approved_by: null };
  }

  static async listPurchaseOrders(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_purchase_orders as po')
      .innerJoin('suppliers as supplier', join => join.on(sql<boolean>`supplier.id = po.supplier_id and supplier.tenant_id = ${tenantId}`))
      .selectAll('po').select('supplier.name as supplier_name')
      .where('po.tenant_id', '=', tenantId).where('po.project_id', '=', projectId).orderBy('po.created_at', 'desc').execute();
    return rows.map(row => this.orderResponse(row));
  }

  static async createPurchaseOrder(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    rfq_id?: string | null; purchase_request_id?: string | null; po_number: string; supplier_id: string;
    total_amount: number; currency?: string; issue_date?: string; expected_delivery_date?: string | null;
    payment_terms?: string | null; incoterms?: string | null; delivery_location?: string | null; items?: any[];
  }) {
    const project = await trx.selectFrom('projects').select(['id', 'currency']).where('tenant_id', '=', tenantId).where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow();
    if (!await trx.selectFrom('suppliers').select('id').where('tenant_id', '=', tenantId).where('id', '=', data.supplier_id).executeTakeFirst())
      throw Object.assign(new Error('Supplier not found'), { statusCode: 404 });
    if (data.purchase_request_id && !await trx.selectFrom('project_purchase_requests').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', data.purchase_request_id).executeTakeFirst())
      throw Object.assign(new Error('Purchase request not found in this project'), { statusCode: 404 });
    if (data.rfq_id) {
      const rfq = await trx.selectFrom('project_rfqs').select(['id', 'purchase_request_id']).where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', data.rfq_id).executeTakeFirst();
      if (!rfq) throw Object.assign(new Error('RFQ not found in this project'), { statusCode: 404 });
      if (data.purchase_request_id && rfq.purchase_request_id && data.purchase_request_id !== rfq.purchase_request_id)
        throw Object.assign(new Error('Purchase request does not match the RFQ'), { statusCode: 400 });
      if (!await trx.selectFrom('project_rfq_suppliers').select('id').where('tenant_id', '=', tenantId).where('rfq_id', '=', data.rfq_id).where('supplier_id', '=', data.supplier_id).executeTakeFirst())
        throw Object.assign(new Error('Supplier is not part of this RFQ'), { statusCode: 400 });
    }
    if (await trx.selectFrom('project_purchase_orders').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('po_number', '=', data.po_number).executeTakeFirst())
      throw Object.assign(new Error('Purchase order number already exists in this project'), { statusCode: 409 });
    const issueDate = data.issue_date ?? new Date().toISOString().slice(0, 10);
    if (data.expected_delivery_date && data.expected_delivery_date < issueDate)
      throw Object.assign(new Error('Delivery date must be on or after issue date'), { statusCode: 400 });
    const row = await trx.insertInto('project_purchase_orders').values({ tenant_id: tenantId, project_id: projectId,
      rfq_id: data.rfq_id ?? null, supplier_id: data.supplier_id, po_number: data.po_number,
      total_amount: data.total_amount, currency: data.currency ?? project.currency, status: 'DRAFT',
      delivery_due_date: data.expected_delivery_date ?? null, items: JSON.stringify(data.items ?? []) as unknown as any[],
      metadata: { purchase_request_id: data.purchase_request_id ?? null, issue_date: issueDate, created_by: userId,
        payment_terms: data.payment_terms ?? null, incoterms: data.incoterms ?? null, delivery_location: data.delivery_location ?? null },
    }).returningAll().executeTakeFirstOrThrow();
    return this.orderResponse(row);
  }
  // ─── Goods Receipt Notes (GRN) ───────────────────────────────────

  static receiptResponse(row: any) {
    const statuses: Record<string, string> = { PENDING: 'pending_inspection', PASSED: 'accepted', REJECTED_DEFECTIVE: 'rejected', ACCEPTED_WITH_CONCESSION: 'partially_accepted' };
    return { ...row, po_id: row.purchase_order_id, received_by: row.inspector_id,
      received_date: row.metadata.received_date ?? new Date(row.received_at).toISOString().slice(0, 10),
      carrier_delivery_note_ref: row.metadata.carrier_delivery_note_ref ?? null,
      status: statuses[row.inspection_status], items_received: row.received_items, inspector_notes: row.notes };
  }

  static async listGoodsReceipts(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_goods_receipts as grn')
      .innerJoin('project_purchase_orders as po', join => join.on(sql<boolean>`po.id = grn.purchase_order_id and po.tenant_id = ${tenantId} and po.project_id = ${projectId}`))
      .innerJoin('suppliers as supplier', join => join.on(sql<boolean>`supplier.id = po.supplier_id and supplier.tenant_id = ${tenantId}`))
      .innerJoin('users as inspector', join => join.on(sql<boolean>`inspector.id = grn.inspector_id and inspector.tenant_id = ${tenantId}`))
      .selectAll('grn').select(['po.po_number', 'supplier.name as supplier_name', 'inspector.name as received_by_name'])
      .where('grn.tenant_id', '=', tenantId).where('grn.project_id', '=', projectId).orderBy('grn.created_at', 'desc').execute();
    return rows.map(row => this.receiptResponse(row));
  }

  static async createGoodsReceipt(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    po_id: string; grn_number: string; received_date?: string; carrier_delivery_note_ref?: string | null;
    status?: string; items_received: { description: string; quantity: number; unit: string }[]; inspector_notes?: string | null;
  }) {
    await trx.selectFrom('projects').select('id').where('tenant_id', '=', tenantId).where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow();
    const po = await trx.selectFrom('project_purchase_orders').select(['id', 'status']).where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', data.po_id).forUpdate().executeTakeFirst();
    if (!po) throw Object.assign(new Error('Purchase order not found in this project'), { statusCode: 404 });
    if (!['ISSUED', 'PARTIALLY_DELIVERED'].includes(po.status)) throw Object.assign(new Error('Receipts require an issued or partially delivered purchase order'), { statusCode: 409 });
    if (await trx.selectFrom('project_goods_receipts').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('grn_number', '=', data.grn_number).executeTakeFirst())
      throw Object.assign(new Error('Goods receipt number already exists in this project'), { statusCode: 409 });
    const receivedDate = data.received_date ?? new Date().toISOString().slice(0, 10);
    if (receivedDate > new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Received date cannot be in the future'), { statusCode: 400 });
    const statuses: Record<string, string> = { pending_inspection: 'PENDING', accepted: 'PASSED', rejected: 'REJECTED_DEFECTIVE', partially_accepted: 'ACCEPTED_WITH_CONCESSION' };
    const row = await trx.insertInto('project_goods_receipts').values({ tenant_id: tenantId, project_id: projectId,
      purchase_order_id: po.id, grn_number: data.grn_number, inspector_id: userId,
      inspection_status: statuses[data.status ?? 'pending_inspection'], received_items: JSON.stringify(data.items_received) as unknown as any[],
      notes: data.inspector_notes ?? null, metadata: { received_date: receivedDate, carrier_delivery_note_ref: data.carrier_delivery_note_ref ?? null },
    }).returningAll().executeTakeFirstOrThrow();
    return this.receiptResponse(row);
  }
}
