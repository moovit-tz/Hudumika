import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type {
  ProjectPurchaseRequest,
  ProjectRfq,
  ProjectPurchaseOrder,
  ProjectGoodsReceipt,
} from '@hudumika/types';

export class ProjectProcurementService {
  // ─── Purchase Requests (Requisitions) ─────────────────────────────

  static async listPurchaseRequests(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_purchase_requests')
      .leftJoin('users as req', 'req.id', 'project_purchase_requests.requested_by')
      .leftJoin('project_work_packages', 'project_work_packages.id', 'project_purchase_requests.work_package_id')
      .where('project_purchase_requests.tenant_id', '=', tenantId)
      .where('project_purchase_requests.project_id', '=', projectId)
      .select([
        'project_purchase_requests.id',
        'project_purchase_requests.tenant_id',
        'project_purchase_requests.project_id',
        'project_purchase_requests.work_package_id',
        'project_purchase_requests.pr_number',
        'project_purchase_requests.title',
        'project_purchase_requests.justification',
        'project_purchase_requests.estimated_cost',
        'project_purchase_requests.required_date',
        'project_purchase_requests.status',
        'project_purchase_requests.requested_by',
        'project_purchase_requests.approved_by',
        'project_purchase_requests.items',
        'project_purchase_requests.created_at',
        'project_purchase_requests.updated_at',
        'req.name as requester_name',
        'project_work_packages.name as work_package_name',
      ])
      .orderBy('project_purchase_requests.created_at', 'desc')
      .execute();
  }

  static async createPurchaseRequest(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    pr_number: string;
    work_package_id?: string | null;
    title: string;
    justification?: string | null;
    estimated_cost: number;
    required_date?: string | null;
    items?: any[];
  }) {
    return await trx
      .insertInto('project_purchase_requests')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        work_package_id: data.work_package_id ?? null,
        pr_number: data.pr_number,
        title: data.title,
        justification: data.justification ?? null,
        estimated_cost: data.estimated_cost,
        required_date: data.required_date ?? null,
        status: 'submitted',
        requested_by: userId,
        items: data.items ?? [],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── RFQs (Request for Quotation) ─────────────────────────────────

  static async listRfqs(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rfqs = await trx
      .selectFrom('project_rfqs')
      .leftJoin('users', 'users.id', 'project_rfqs.created_by')
      .where('project_rfqs.tenant_id', '=', tenantId)
      .where('project_rfqs.project_id', '=', projectId)
      .select([
        'project_rfqs.id',
        'project_rfqs.tenant_id',
        'project_rfqs.project_id',
        'project_rfqs.purchase_request_id',
        'project_rfqs.rfq_number',
        'project_rfqs.title',
        'project_rfqs.scope_description',
        'project_rfqs.issue_date',
        'project_rfqs.closing_date',
        'project_rfqs.status',
        'project_rfqs.created_by',
        'project_rfqs.created_at',
        'project_rfqs.updated_at',
        'users.name as creator_name',
      ])
      .orderBy('project_rfqs.created_at', 'desc')
      .execute();

    const suppliers = await trx
      .selectFrom('project_rfq_suppliers')
      .where('tenant_id', '=', tenantId)
      .selectAll()
      .execute();

    const suppMap = new Map<string, typeof suppliers>();
    for (const s of suppliers) {
      const list = suppMap.get(s.rfq_id) || [];
      list.push(s);
      suppMap.set(s.rfq_id, list);
    }

    return rfqs.map(r => ({
      ...r,
      suppliers: suppMap.get(r.id) || [],
    }));
  }

  static async createRfq(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    purchase_request_id?: string | null;
    rfq_number: string;
    title: string;
    scope_description?: string | null;
    issue_date?: string | null;
    closing_date?: string | null;
    suppliers?: Array<{
      supplier_name: string;
      contact_email?: string | null;
      quoted_amount?: number | null;
      delivery_lead_time_days?: number | null;
      technical_compliance_score?: number | null;
      commercial_score?: number | null;
    }>;
  }) {
    const rfq = await trx
      .insertInto('project_rfqs')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        purchase_request_id: data.purchase_request_id ?? null,
        rfq_number: data.rfq_number,
        title: data.title,
        scope_description: data.scope_description ?? null,
        issue_date: data.issue_date ?? new Date().toISOString().split('T')[0],
        closing_date: data.closing_date ?? null,
        status: 'issued',
        created_by: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (data.suppliers && data.suppliers.length > 0) {
      for (const s of data.suppliers) {
        await trx
          .insertInto('project_rfq_suppliers')
          .values({
            tenant_id: tenantId,
            rfq_id: rfq.id,
            supplier_name: s.supplier_name,
            contact_email: s.contact_email ?? null,
            quoted_amount: s.quoted_amount ?? null,
            delivery_lead_time_days: s.delivery_lead_time_days ?? null,
            technical_compliance_score: s.technical_compliance_score ?? null,
            commercial_score: s.commercial_score ?? null,
            is_selected: false,
          })
          .execute();
      }
    }

    return rfq;
  }

  // ─── Purchase Orders ──────────────────────────────────────────────

  static async listPurchaseOrders(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_purchase_orders')
      .leftJoin('users as creator', 'creator.id', 'project_purchase_orders.created_by')
      .where('project_purchase_orders.tenant_id', '=', tenantId)
      .where('project_purchase_orders.project_id', '=', projectId)
      .select([
        'project_purchase_orders.id',
        'project_purchase_orders.tenant_id',
        'project_purchase_orders.project_id',
        'project_purchase_orders.rfq_id',
        'project_purchase_orders.purchase_request_id',
        'project_purchase_orders.po_number',
        'project_purchase_orders.supplier_name',
        'project_purchase_orders.supplier_id',
        'project_purchase_orders.total_amount',
        'project_purchase_orders.currency',
        'project_purchase_orders.issue_date',
        'project_purchase_orders.expected_delivery_date',
        'project_purchase_orders.status',
        'project_purchase_orders.payment_terms',
        'project_purchase_orders.incoterms',
        'project_purchase_orders.delivery_location',
        'project_purchase_orders.created_by',
        'project_purchase_orders.approved_by',
        'project_purchase_orders.items',
        'project_purchase_orders.created_at',
        'project_purchase_orders.updated_at',
        'creator.name as creator_name',
      ])
      .orderBy('project_purchase_orders.created_at', 'desc')
      .execute();
  }

  static async createPurchaseOrder(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    rfq_id?: string | null;
    purchase_request_id?: string | null;
    po_number: string;
    supplier_name: string;
    supplier_id?: string | null;
    total_amount: number;
    currency?: string;
    issue_date?: string;
    expected_delivery_date?: string | null;
    payment_terms?: string | null;
    incoterms?: string | null;
    delivery_location?: string | null;
    items?: any[];
  }) {
    return await trx
      .insertInto('project_purchase_orders')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        rfq_id: data.rfq_id ?? null,
        purchase_request_id: data.purchase_request_id ?? null,
        po_number: data.po_number,
        supplier_name: data.supplier_name,
        supplier_id: data.supplier_id ?? null,
        total_amount: data.total_amount,
        currency: data.currency ?? 'USD',
        issue_date: data.issue_date ?? new Date().toISOString().split('T')[0],
        expected_delivery_date: data.expected_delivery_date ?? null,
        status: 'issued',
        payment_terms: data.payment_terms ?? 'Net 30',
        incoterms: data.incoterms ?? 'DAP',
        delivery_location: data.delivery_location ?? null,
        created_by: userId,
        items: data.items ?? [],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Goods Receipt Notes (GRN) ───────────────────────────────────

  static async listGoodsReceipts(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_goods_receipts')
      .leftJoin('project_purchase_orders', 'project_purchase_orders.id', 'project_goods_receipts.po_id')
      .leftJoin('users', 'users.id', 'project_goods_receipts.received_by')
      .where('project_goods_receipts.tenant_id', '=', tenantId)
      .where('project_goods_receipts.project_id', '=', projectId)
      .select([
        'project_goods_receipts.id',
        'project_goods_receipts.tenant_id',
        'project_goods_receipts.po_id',
        'project_goods_receipts.project_id',
        'project_goods_receipts.grn_number',
        'project_goods_receipts.received_date',
        'project_goods_receipts.received_by',
        'project_goods_receipts.carrier_delivery_note_ref',
        'project_goods_receipts.status',
        'project_goods_receipts.items_received',
        'project_goods_receipts.inspector_notes',
        'project_goods_receipts.created_at',
        'project_purchase_orders.po_number',
        'project_purchase_orders.supplier_name',
        'users.name as received_by_name',
      ])
      .orderBy('project_goods_receipts.created_at', 'desc')
      .execute();
  }

  static async createGoodsReceipt(trx: Transaction<Database>, tenantId: string, projectId: string, userId: string, data: {
    po_id: string;
    grn_number: string;
    received_date?: string;
    carrier_delivery_note_ref?: string | null;
    status?: string;
    items_received?: any[];
    inspector_notes?: string | null;
  }) {
    const grn = await trx
      .insertInto('project_goods_receipts')
      .values({
        tenant_id: tenantId,
        po_id: data.po_id,
        project_id: projectId,
        grn_number: data.grn_number,
        received_date: data.received_date ?? new Date().toISOString().split('T')[0],
        received_by: userId,
        carrier_delivery_note_ref: data.carrier_delivery_note_ref ?? null,
        status: data.status ?? 'accepted',
        items_received: data.items_received ?? [],
        inspector_notes: data.inspector_notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update PO status to received
    await trx
      .updateTable('project_purchase_orders')
      .set({
        status: 'received',
        updated_at: new Date(),
      })
      .where('id', '=', data.po_id)
      .where('tenant_id', '=', tenantId)
      .execute();

    return grn;
  }
}
