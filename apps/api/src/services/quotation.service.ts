import { db, withTenant } from '../db/client.js';

export const quotationService = {
  async list(tenantId: string, filters?: { status?: string; customer_id?: string }) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('quotations')
        .leftJoin('customers', 'customers.id', 'quotations.customer_id')
        .where('quotations.tenant_id', '=', tenantId)
        .select([
          'quotations.id',
          'quotations.quote_number',
          'quotations.title',
          'quotations.shipment_type',
          'quotations.origin_port',
          'quotations.destination_port',
          'quotations.subtotal',
          'quotations.tax_amount',
          'quotations.total_amount',
          'quotations.currency',
          'quotations.status',
          'quotations.valid_until',
          'quotations.created_at',
          'customers.name as customer_name',
        ]);

      if (filters?.status) {
        query = query.where('quotations.status', '=', filters.status);
      }
      if (filters?.customer_id) {
        query = query.where('quotations.customer_id', '=', filters.customer_id);
      }

      return query.orderBy('quotations.created_at', 'desc').execute();
    });
  },

  async getById(tenantId: string, id: string) {
    return withTenant(tenantId, async (trx) => {
      const quote = await trx
        .selectFrom('quotations')
        .leftJoin('customers', 'customers.id', 'quotations.customer_id')
        .where('quotations.id', '=', id)
        .where('quotations.tenant_id', '=', tenantId)
        .select([
          'quotations.id',
          'quotations.quote_number',
          'quotations.customer_id',
          'quotations.title',
          'quotations.shipment_type',
          'quotations.goods_description',
          'quotations.origin_port',
          'quotations.origin_city',
          'quotations.destination_port',
          'quotations.destination_city',
          'quotations.container_requirements',
          'quotations.subtotal',
          'quotations.tax_amount',
          'quotations.total_amount',
          'quotations.currency',
          'quotations.valid_from',
          'quotations.valid_until',
          'quotations.status',
          'quotations.converted_shipment_id',
          'quotations.notes',
          'quotations.rejection_reason',
          'quotations.created_at',
          'quotations.updated_at',
          'customers.name as customer_name',
        ])
        .executeTakeFirstOrThrow();

      const lines = await trx
        .selectFrom('quotation_lines')
        .where('quotation_id', '=', id)
        .orderBy('line_number')
        .selectAll()
        .execute();

      return { ...quote, lines };
    });
  },

  async create(tenantId: string, userId: string, data: {
    customer_id: string;
    title: string;
    shipment_type: string;
    goods_description?: string;
    origin_port?: string;
    origin_city?: string;
    destination_port?: string;
    destination_city?: string;
    container_requirements?: any[];
    currency?: string;
    valid_from?: string;
    valid_until?: string;
    notes?: string;
    lines?: Array<{
      description: string;
      category: string;
      quantity: number;
      unit_price: number;
      tax_rate?: number;
      is_optional?: boolean;
      vendor?: string;
    }>;
  }) {
    return withTenant(tenantId, async (trx) => {
      // Generate quote number
      const count = await trx
        .selectFrom('quotations')
        .where('tenant_id', '=', tenantId)
        .select(trx.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      const nextNum = Number(count.count) + 1;
      const quoteNumber = `QT-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;

      // Calculate line totals
      let subtotal = 0;
      let totalTax = 0;
      const lines = (data.lines || []).map((line, idx) => {
        const lineTotal = line.quantity * line.unit_price;
        const taxRate = line.tax_rate || 0;
        const taxAmount = lineTotal * (taxRate / 100);
        subtotal += lineTotal;
        totalTax += taxAmount;
        return {
          ...line,
          line_number: idx + 1,
          line_total: lineTotal,
          tax_amount: taxAmount,
          tax_rate: taxRate,
        };
      });

      const quote = await trx
        .insertInto('quotations')
        .values({
          tenant_id: tenantId,
          quote_number: quoteNumber,
          customer_id: data.customer_id,
          title: data.title,
          shipment_type: data.shipment_type,
          goods_description: data.goods_description || null,
          origin_port: data.origin_port || null,
          origin_city: data.origin_city || null,
          destination_port: data.destination_port || null,
          destination_city: data.destination_city || null,
          container_requirements: data.container_requirements ? JSON.stringify(data.container_requirements) : null,
          subtotal,
          tax_amount: totalTax,
          total_amount: subtotal + totalTax,
          currency: data.currency || 'USD',
          valid_from: data.valid_from ? new Date(data.valid_from) : null,
          valid_until: data.valid_until ? new Date(data.valid_until) : null,
          prepared_by: userId,
          notes: data.notes || null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Insert lines
      if (lines.length > 0) {
        await trx
          .insertInto('quotation_lines')
          .values(
            lines.map(l => ({
              quotation_id: quote.id,
              line_number: l.line_number,
              description: l.description,
              category: l.category,
              quantity: l.quantity,
              unit_price: l.unit_price,
              tax_rate: l.tax_rate,
              tax_amount: l.tax_amount,
              line_total: l.line_total,
              is_optional: l.is_optional || false,
              vendor: l.vendor || null,
              created_at: new Date(),
            }))
          )
          .execute();
      }

      return quote;
    });
  },

  async updateStatus(tenantId: string, quoteId: string, status: string, userId: string, reason?: string) {
    return withTenant(tenantId, async (trx) => {
      const updateData: any = { status, updated_at: new Date() };
      
      if (status === 'APPROVED') {
        updateData.approved_by = userId;
        updateData.approved_at = new Date();
      }
      if (status === 'REJECTED') {
        updateData.rejected_at = new Date();
        if (reason) updateData.rejection_reason = reason;
      }

      return trx
        .updateTable('quotations')
        .set(updateData)
        .where('id', '=', quoteId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async convertToShipment(tenantId: string, quoteId: string, userId: string) {
    return withTenant(tenantId, async (trx) => {
      const quote = await trx
        .selectFrom('quotations')
        .where('id', '=', quoteId)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirstOrThrow();

      if (quote.status !== 'APPROVED') {
        throw new Error('Only approved quotations can be converted');
      }

      // Generate shipment ref
      const count = await trx
        .selectFrom('shipment_cases')
        .where('tenant_id', '=', tenantId)
        .select(trx.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      const nextNum = Number(count.count) + 1;
      const refNumber = `CLR-${new Date().getFullYear()}-${String(nextNum).padStart(4, '0')}`;

      const shipment = await trx
        .insertInto('shipment_cases')
        .values({
          tenant_id: tenantId,
          ref_number: refNumber,
          customer_id: quote.customer_id,
          type: quote.shipment_type as any,
          goods_desc: quote.goods_description || quote.title,
          vessel: '',
          origin_port: quote.origin_port || '',
          dest_port: quote.destination_port || '',
          containers: quote.container_requirements || '[]',
          assigned_to: userId,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update quotation status
      await trx
        .updateTable('quotations')
        .set({
          status: 'CONVERTED',
          converted_shipment_id: shipment.id,
          updated_at: new Date(),
        })
        .where('id', '=', quoteId)
        .execute();

      return { quotation: quote, shipment };
    });
  },
};
