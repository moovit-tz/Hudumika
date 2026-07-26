import { withTenant } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import type {
  DeclarationStatus,
  SelectivityChannel,
  DeclarationNoticeType,
  CreateDeclarationInput,
  CreateDeclarationItemInput,
  CreateDeclarationNoticeInput,
} from '@hudumika/types';

export class DeclarationService {
  /**
   * Create a new declaration (TANSAD) linked to a shipment case
   */
  static async createDeclaration(tenantId: string, input: CreateDeclarationInput) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();

      const declaration = await trx
        .insertInto('declarations')
        .values({
          tenant_id: tenantId,
          shipment_id: input.shipment_id,
          tancis_ref: input.tancis_ref,
          declaration_mode: input.declaration_mode,
          tansad_form_type: input.tansad_form_type,
          clearing_office: input.clearing_office,
          reference_date: new Date(input.reference_date),
          total_packages: input.total_packages || 0,
          package_type: input.package_type || null,
          gross_weight_kg: input.gross_weight_kg || 0,
          net_weight_kg: input.net_weight_kg || 0,
          no_of_items: input.no_of_items || 0,
          consignment_country: input.consignment_country,
          country_of_export: input.country_of_export,
          country_of_destination: input.country_of_destination,
          importer_tin: input.importer_tin,
          importer_name: input.importer_name,
          declarant_tin: input.declarant_tin,
          declarant_name: input.declarant_name,
          total_invoice_value: input.total_invoice_value || 0,
          invoice_currency: input.invoice_currency || 'USD',
          exchange_rate: input.exchange_rate || 1,
          freight_amount: input.freight_amount || 0,
          freight_currency: 'USD',
          insurance_amount: input.insurance_amount || 0,
          insurance_currency: 'USD',
          other_charges: input.other_charges || 0,
          other_charges_currency: 'USD',
          deductions: input.deductions || 0,
          deductions_currency: 'USD',
          total_customs_value: 0, // Calculated below
          self_assessment: input.self_assessment || false,
          status: 'DRAFT',
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Link declaration to shipment case
      await trx
        .updateTable('shipment_cases')
        .set({
          declaration_id: declaration.id,
          tancis_ref: input.tancis_ref,
          updated_at: now,
        })
        .where('id', '=', input.shipment_id)
        .execute();

      return declaration;
    });
  }

  /**
   * Update declaration status and track timestamps
   */
  static async updateStatus(
    tenantId: string,
    declarationId: string,
    newStatus: DeclarationStatus
  ) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const updates: Record<string, any> = {
        status: newStatus,
        updated_at: now,
      };

      // Track status-specific timestamps
      switch (newStatus) {
        case 'TRANSFERRED':
          updates.declared_at = now;
          break;
        case 'ASSESSED':
          updates.assessed_at = now;
          break;
        case 'PAID':
          updates.paid_at = now;
          break;
        case 'RELEASED':
          updates.released_at = now;
          break;
      }

      const updated = await trx
        .updateTable('declarations')
        .set(updates)
        .where('id', '=', declarationId)
        .returningAll()
        .executeTakeFirstOrThrow();

      // When transferred, also update shipment stage
      if (newStatus === 'TRANSFERRED') {
        const decl = await trx
          .selectFrom('declarations')
          .select('shipment_id')
          .where('id', '=', declarationId)
          .executeTakeFirst();

        if (decl) {
          NotificationService.triggerNotification(
            tenantId,
            decl.shipment_id,
            'DECLARATION_TRANSFERRED'
          ).catch(console.error);
        }
      }

      return updated;
    });
  }

  /**
   * Add an item to a declaration
   */
  static async addItem(tenantId: string, input: CreateDeclarationItemInput) {
    return withTenant(tenantId, async (trx) => {
      // Get next item number
      const lastItem = await trx
        .selectFrom('declaration_items')
        .select('item_number')
        .where('declaration_id', '=', input.declaration_id)
        .orderBy('item_number', 'desc')
        .executeTakeFirst();

      const nextItemNo = (lastItem?.item_number || 0) + 1;

      const item = await trx
        .insertInto('declaration_items')
        .values({
          declaration_id: input.declaration_id,
          item_number: nextItemNo,
          hs_code: input.hs_code,
          commodity_description: input.commodity_description || null,
          country_of_origin: input.country_of_origin,
          cpc_code: input.cpc_code,
          quantity: input.quantity,
          unit_of_measure: input.unit_of_measure,
          gross_weight_kg: input.gross_weight_kg,
          net_weight_kg: input.net_weight_kg,
          customs_value: input.customs_value,
          statistical_value: input.statistical_value || 0,
          is_vehicle: input.is_vehicle || false,
          brand_name: input.brand_name || null,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update item count and total customs value on declaration
      const totals = await trx
        .selectFrom('declaration_items')
        .select([
          trx.fn.count('id').as('item_count'),
          trx.fn.sum('customs_value').as('total_value'),
        ])
        .where('declaration_id', '=', input.declaration_id)
        .executeTakeFirst();

      await trx
        .updateTable('declarations')
        .set({
          no_of_items: Number(totals?.item_count || 0),
          total_customs_value: Number(totals?.total_value || 0),
          updated_at: new Date(),
        })
        .where('id', '=', input.declaration_id)
        .execute();

      return item;
    });
  }

  /**
   * Record a declaration notice (selectivity, assessment, release, etc.)
   */
  static async recordNotice(tenantId: string, input: CreateDeclarationNoticeInput) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();

      // Insert the notice
      const notice = await trx
        .insertInto('declaration_notices')
        .values({
          declaration_id: input.declaration_id,
          shipment_id: input.shipment_id,
          tenant_id: tenantId,
          notice_type: input.notice_type,
          notice_number: input.notice_number,
          tancis_ref: input.tancis_ref,
          importer_tin: input.importer_tin,
          notice_date: new Date(input.notice_date),
          declare_date: new Date(input.declare_date),
          selectivity_channel: input.selectivity_channel || null,
          total_tax_amount: input.total_tax_amount || null,
          bill_number: input.bill_number || null,
          acknowledged: false,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Insert tax lines if assessment notice
      if (input.tax_lines && input.tax_lines.length > 0) {
        for (const line of input.tax_lines) {
          await trx
            .insertInto('tax_lines')
            .values({
              notice_id: notice.id,
              tax_type: line.tax_type,
              hs_code: line.hs_code || null,
              duty_rate_code: line.duty_rate_code || null,
              rate_percent: line.rate_percent,
              base_amount: line.base_amount,
              tax_amount: line.tax_amount,
              mot: line.mot || null,
            })
            .execute();
        }
      }

      // Handle selectivity result: update declaration & shipment
      if (input.notice_type === 'SELECTIVITY_RESULT' && input.selectivity_channel) {
        await trx
          .updateTable('declarations')
          .set({
            selectivity_channel: input.selectivity_channel,
            status: 'ACCEPTED',
            updated_at: now,
          })
          .where('id', '=', input.declaration_id)
          .execute();

        await trx
          .updateTable('shipment_cases')
          .set({
            selectivity_channel: input.selectivity_channel,
            updated_at: now,
          })
          .where('id', '=', input.shipment_id)
          .execute();

        // Trigger selectivity notification
        const triggerMap: Record<string, string> = {
          GREEN: 'SELECTIVITY_GREEN',
          YELLOW: 'SELECTIVITY_YELLOW',
          RED: 'SELECTIVITY_RED',
        };
        const trigger = triggerMap[input.selectivity_channel];
        if (trigger) {
          NotificationService.triggerNotification(
            tenantId,
            input.shipment_id,
            trigger as any
          ).catch(console.error);
        }
      }

      // Handle assessment notice: update declaration status
      if (input.notice_type === 'ASSESSMENT_NOTICE') {
        await trx
          .updateTable('declarations')
          .set({
            status: 'ASSESSED',
            assessed_at: now,
            updated_at: now,
          })
          .where('id', '=', input.declaration_id)
          .execute();

        NotificationService.triggerNotification(
          tenantId,
          input.shipment_id,
          'ASSESSMENT_RECEIVED'
        ).catch(console.error);
      }

      // Handle release notice
      if (input.notice_type === 'RELEASE_NOTICE') {
        await trx
          .updateTable('declarations')
          .set({
            status: 'RELEASED',
            released_at: now,
            updated_at: now,
          })
          .where('id', '=', input.declaration_id)
          .execute();

        NotificationService.triggerNotification(
          tenantId,
          input.shipment_id,
          'RELEASE_ORDER'
        ).catch(console.error);
      }

      return notice;
    });
  }

  /**
   * Acknowledge a notice (officer has seen it)
   */
  static async acknowledgeNotice(tenantId: string, noticeId: string, userId: string) {
    return withTenant(tenantId, async (trx) => {
      return trx
        .updateTable('declaration_notices')
        .set({
          acknowledged: true,
          acknowledged_at: new Date(),
          acknowledged_by: userId,
        })
        .where('id', '=', noticeId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  /**
   * Get declaration by ID with items and notices
   */
  static async getById(tenantId: string, declarationId: string) {
    return withTenant(tenantId, async (trx) => {
      const declaration = await trx
        .selectFrom('declarations')
        .selectAll()
        .where('id', '=', declarationId)
        .executeTakeFirst();

      if (!declaration) return null;

      const items = await trx
        .selectFrom('declaration_items')
        .selectAll()
        .where('declaration_id', '=', declarationId)
        .orderBy('item_number', 'asc')
        .execute();

      const notices = await trx
        .selectFrom('declaration_notices')
        .selectAll()
        .where('declaration_id', '=', declarationId)
        .orderBy('notice_date', 'desc')
        .execute();

      // Fetch tax lines for each notice
      const noticesWithTaxLines = await Promise.all(
        notices.map(async (notice) => {
          const taxLines = await trx
            .selectFrom('tax_lines')
            .selectAll()
            .where('notice_id', '=', notice.id)
            .execute();
          return { ...notice, tax_lines: taxLines };
        })
      );

      return {
        ...declaration,
        items,
        notices: noticesWithTaxLines,
      };
    });
  }

  /**
   * List declarations for a tenant with optional filters
   */
  static async list(
    tenantId: string,
    filters: {
      shipment_id?: string;
      status?: string;
      selectivity_channel?: string;
      search?: string;
      limit?: number;
    }
  ) {
    return withTenant(tenantId, async (trx) => {
      let query = trx.selectFrom('declarations').selectAll();

      if (filters.shipment_id) {
        query = query.where('shipment_id', '=', filters.shipment_id);
      }
      if (filters.status) {
        query = query.where('status', '=', filters.status);
      }
      if (filters.selectivity_channel) {
        query = query.where('selectivity_channel', '=', filters.selectivity_channel);
      }
      if (filters.search) {
        const s = `%${filters.search}%`;
        query = query.where((eb) =>
          eb.or([
            eb('tancis_ref', 'ilike', s),
            eb('tansad_number', 'ilike', s),
            eb('importer_name', 'ilike', s),
          ])
        );
      }

      const limit = filters.limit || 50;
      const results = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();

      return { data: results };
    });
  }

  /**
   * Get the declaration linked to a shipment case (if any), with items.
   */
  static async getByShipment(tenantId: string, shipmentId: string) {
    return withTenant(tenantId, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select('declaration_id')
        .where('id', '=', shipmentId)
        .executeTakeFirst();
      if (!shipment?.declaration_id) return null;

      const declaration = await trx
        .selectFrom('declarations')
        .selectAll()
        .where('id', '=', shipment.declaration_id)
        .executeTakeFirst();
      if (!declaration) return null;

      const items = await trx
        .selectFrom('declaration_items')
        .selectAll()
        .where('declaration_id', '=', declaration.id)
        .orderBy('item_number', 'asc')
        .execute();

      return { ...declaration, items };
    });
  }

  /**
   * Create-or-update the full TANCIS-style declaration for a shipment case
   * (general/parties/financial/transport fields + a full item-list replace).
   * Used by ShipmentDetail's in-page Declaration tab, which — unlike the
   * SEAL bonded-warehouse declaration flow — has no separate "create" step
   * before the user starts filling the form.
   */
  static async upsertByShipment(
    tenantId: string,
    shipmentId: string,
    input: Record<string, any>,
    items: Array<Record<string, any>>
  ) {
    return withTenant(tenantId, async (trx) => {
      const now = new Date();
      const shipment = await trx
        .selectFrom('shipment_cases')
        .select('declaration_id')
        .where('id', '=', shipmentId)
        .executeTakeFirstOrThrow();

      // input is a fully-built payload from the frontend's declaration-form
      // mapper (buildDeclarationPayload), not raw pass-through user input —
      // cast needed because Kysely can't statically verify a Record<string,
      // any> against the generated Insertable/Updateable shape.
      const values: any = { ...input, tenant_id: tenantId, shipment_id: shipmentId, updated_at: now };

      let declaration;
      if (shipment.declaration_id) {
        declaration = await trx
          .updateTable('declarations')
          .set(values)
          .where('id', '=', shipment.declaration_id)
          .returningAll()
          .executeTakeFirstOrThrow();
      } else {
        declaration = await trx
          .insertInto('declarations')
          .values({ ...values, status: 'DRAFT', created_at: now })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('shipment_cases')
          .set({ declaration_id: declaration.id, tancis_ref: values.tancis_ref, updated_at: now })
          .where('id', '=', shipmentId)
          .execute();
      }

      // Full replace of line items — this tab saves the whole form at once,
      // not incremental line-by-line adds like the SEAL declaration flow.
      await trx.deleteFrom('declaration_items').where('declaration_id', '=', declaration.id).execute();
      let itemNo = 1;
      for (const item of items) {
        if (!item.hs_code) continue;
        await trx
          .insertInto('declaration_items')
          .values({
            declaration_id: declaration.id,
            item_number: itemNo++,
            hs_code: item.hs_code,
            commodity_description: item.commodity_description || null,
            country_of_origin: item.country_of_origin,
            cpc_code: item.cpc_code,
            quantity: item.quantity || 0,
            unit_of_measure: item.unit_of_measure || 'PC',
            gross_weight_kg: item.gross_weight_kg || 0,
            net_weight_kg: item.net_weight_kg || 0,
            customs_value: item.customs_value || 0,
            statistical_value: item.statistical_value || 0,
            created_at: now,
          })
          .execute();
      }

      declaration = await trx
        .updateTable('declarations')
        .set({ no_of_items: itemNo - 1, updated_at: now })
        .where('id', '=', declaration.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      const savedItems = await trx
        .selectFrom('declaration_items')
        .selectAll()
        .where('declaration_id', '=', declaration.id)
        .orderBy('item_number', 'asc')
        .execute();

      return { ...declaration, items: savedItems };
    });
  }

  /**
   * List all notices for a tenant with filters
   */
  static async listNotices(
    tenantId: string,
    filters: {
      declaration_id?: string;
      notice_type?: string;
      acknowledged?: boolean;
      limit?: number;
    }
  ) {
    return withTenant(tenantId, async (trx) => {
      let query = trx.selectFrom('declaration_notices').selectAll();

      if (filters.declaration_id) {
        query = query.where('declaration_id', '=', filters.declaration_id);
      }
      if (filters.notice_type) {
        query = query.where('notice_type', '=', filters.notice_type);
      }
      if (filters.acknowledged !== undefined) {
        query = query.where('acknowledged', '=', filters.acknowledged);
      }

      const limit = filters.limit || 50;
      const results = await query
        .orderBy('notice_date', 'desc')
        .limit(limit)
        .execute();

      // Fetch tax lines for each notice
      const withTaxLines = await Promise.all(
        results.map(async (notice) => {
          const taxLines = await trx
            .selectFrom('tax_lines')
            .selectAll()
            .where('notice_id', '=', notice.id)
            .execute();
          return { ...notice, tax_lines: taxLines };
        })
      );

      return { data: withTaxLines };
    });
  }
}
