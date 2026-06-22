import { withTenant } from '../db/client.js';
import { WorkflowService } from './workflow.service.js';
import { NotificationService } from './notification.service.js';
import type { ShipmentType, ClearanceStage, Container, DocumentType, RiskFlagType } from '@clearos/types';

export class ShipmentService {
  /**
   * Create a new shipment case, initialize its required document list, and log initial stage
   */
  static async createCase(
    tenantId: string,
    input: {
      customer_id: string;
      type: ShipmentType;
      goods_desc: string;
      hs_code?: string;
      containers: Container[];
      bl_number?: string;
      awb_number?: string;
      vessel: string;
      origin_port: string;
      dest_port: string;
      eta?: string;
      assigned_to: string;
      location_id?: string;
      free_time_end?: string;
    }
  ) {
    return withTenant(tenantId, async (trx) => {
      // 1. Generate unique reference number (e.g. CLR-2026-XXXX)
      const countResult = await trx
        .selectFrom('shipment_cases')
        .select(trx.fn.count('id').as('cnt'))
        .executeTakeFirst();
      const currentCount = Number(countResult?.cnt ?? 0) + 1;
      const refNumber = `CLR-2026-${String(currentCount).padStart(4, '0')}`;

      const now = new Date();
      const etaDate = input.eta ? new Date(input.eta) : null;
      const freeTimeDate = input.free_time_end ? new Date(input.free_time_end) : null;

      // 2. Insert shipment case
      const shipment = await trx
        .insertInto('shipment_cases')
        .values({
          tenant_id: tenantId,
          ref_number: refNumber,
          customer_id: input.customer_id,
          type: input.type,
          goods_desc: input.goods_desc,
          hs_code: input.hs_code || null,
          containers: JSON.stringify(input.containers),
          bl_number: input.bl_number || null,
          awb_number: input.awb_number || null,
          vessel: input.vessel,
          origin_port: input.origin_port,
          dest_port: input.dest_port,
          eta: etaDate,
          stage: 'DOCS_RECEIVED',
          assigned_to: input.assigned_to,
          location_id: input.location_id || null,
          sla_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // DOCS_RECEIVED SLA: 24h
          free_time_end: freeTimeDate,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 3. Log initial stage history
      await trx
        .insertInto('stage_history')
        .values({
          tenant_id: tenantId,
          shipment_id: shipment.id,
          stage: 'DOCS_RECEIVED',
          entered_at: now,
          actor_id: input.assigned_to,
          note: 'Shipment case initialized.',
        })
        .execute();

      // 4. Pre-populate required documents checklist
      const requiredDocs: DocumentType[] = ['BL', 'INVOICE', 'PACKING_LIST'];
      if (input.type === 'AIR') {
        // Air shipments require Air Waybill
        requiredDocs[0] = 'BL'; // Let's use BL as a generic transport doc placeholder or add AWB
      }

      for (const docType of requiredDocs) {
        await trx
          .insertInto('case_documents')
          .values({
            tenant_id: tenantId,
            shipment_id: shipment.id,
            type: docType,
            filename: `Pending ${docType}`,
            storage_key: '',
            status: 'REQUIRED',
            created_at: now,
          })
          .execute();
      }

      // 5. Trigger notifications (offloaded dynamically)
      // Call in background so it doesn't block the API transaction
      NotificationService.triggerNotification(tenantId, shipment.id, 'CASE_OPENED').catch(console.error);

      return shipment;
    });
  }

  /**
   * Advance a shipment case to a new stage
   */
  static async advanceStage(
    tenantId: string,
    shipmentId: string,
    nextStage: ClearanceStage,
    actorId: string,
    note?: string,
    blocker?: string
  ) {
    const result = await WorkflowService.transitionStage(tenantId, shipmentId, nextStage, actorId, note, blocker);
    
    // Trigger notification on stage update
    NotificationService.triggerNotification(tenantId, shipmentId, 'STAGE_ADVANCED', {
      stageLabel: nextStage,
    }).catch(console.error);

    // Run risk scoring calculation in the background when stage changes
    this.evaluateRiskFlags(tenantId, shipmentId).catch(console.error);

    return result;
  }

  /**
   * Fetch all shipments grouped by customer for the command center
   */
  static async listGroupedByCustomer(tenantId: string, filters: { assigned_to?: string; stage?: ClearanceStage; customer_id?: string }) {
    return withTenant(tenantId, async (trx) => {
      // Fetch customers (optionally scoped to a single customer for CUSTOMER role)
      let customersQuery = trx.selectFrom('customers').selectAll().where('active', '=', true);
      if (filters.customer_id) {
        customersQuery = customersQuery.where('id', '=', filters.customer_id);
      }
      const customers = await customersQuery.execute();

      // Fetch shipments
      let shipmentsQuery = trx.selectFrom('shipment_cases').selectAll();
      if (filters.assigned_to) {
        shipmentsQuery = shipmentsQuery.where('assigned_to', '=', filters.assigned_to);
      }
      if (filters.customer_id) {
        shipmentsQuery = shipmentsQuery.where('customer_id', '=', filters.customer_id);
      }
      if (filters.stage) {
        shipmentsQuery = shipmentsQuery.where('stage', '=', filters.stage);
      }
      const shipments = await shipmentsQuery.execute();

      // Fetch risk flags
      const riskFlags = await trx
        .selectFrom('risk_flags')
        .selectAll()
        .where('resolved', '=', false)
        .execute();

      const grouped = customers.map((cust) => {
        const custShipments = shipments.filter((s) => s.customer_id === cust.id);
        const mappedShipments = custShipments.map((s) => {
          const sFlags = riskFlags.filter((f) => f.shipment_id === s.id);
          return {
            ...s,
            containers: (typeof s.containers === 'string' ? JSON.parse(s.containers) : s.containers) as Container[],
            risk_flags: sFlags,
            active_risk_types: sFlags.map((f) => f.type),
          };
        });

        const urgent = mappedShipments.filter((s) =>
          s.risk_flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM')
        ).length;

        const locations = Array.from(new Set(mappedShipments.map((s) => s.dest_port).filter(Boolean)));

        return {
          customer: {
            id: cust.id,
            name: cust.name,
            avatar_initials: cust.avatar_initials || cust.name.substring(0, 2).toUpperCase(),
            avatar_color: cust.avatar_color || '#0b7264',
          },
          shipment_count: mappedShipments.length,
          urgent_count: urgent,
          action_count: mappedShipments.filter((s) => s.stage !== 'CLOSED' && s.stage !== 'DELIVERY').length,
          locations,
          shipments: mappedShipments,
        };
      });

      return grouped.filter((g) => g.shipment_count > 0);
    });
  }

  /**
   * Fetch full shipment detail along with timeline, documents, and expenses
   */
  static async getById(tenantId: string, shipmentId: string) {
    return withTenant(tenantId, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', shipmentId)
        .executeTakeFirst();

      if (!shipment) return null;

      const customer = await trx
        .selectFrom('customers')
        .select(['name', 'contact_name', 'email', 'phone'])
        .where('id', '=', shipment.customer_id)
        .executeTakeFirst();

      const officer = shipment.assigned_to
        ? await trx
            .selectFrom('users')
            .select(['name', 'email', 'phone'])
            .where('id', '=', shipment.assigned_to)
            .executeTakeFirst()
        : null;

      const stageHistory = await trx
        .selectFrom('stage_history')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .orderBy('entered_at', 'asc')
        .execute();

      const documents = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .orderBy('created_at', 'desc')
        .execute();

      const expenses = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .orderBy('created_at', 'desc')
        .execute();

      const riskFlags = await trx
        .selectFrom('risk_flags')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('resolved', '=', false)
        .execute();

      const messages = await trx
        .selectFrom('case_messages')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .orderBy('created_at', 'asc')
        .execute();

      return {
        ...shipment,
        containers: (typeof shipment.containers === 'string' ? JSON.parse(shipment.containers) : shipment.containers) as Container[],
        customer_name: customer?.name,
        assigned_officer_name: officer?.name,
        stage_history: stageHistory,
        documents,
        expenses,
        risk_flags: riskFlags,
        active_risk_types: riskFlags.map((f) => f.type),
        messages,
      };
    });
  }

  /**
   * Run risk scoring analysis for a case and persist risk flags
   */
  static async evaluateRiskFlags(tenantId: string, shipmentId: string): Promise<void> {
    return withTenant(tenantId, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', shipmentId)
        .executeTakeFirst();

      if (!shipment || shipment.stage === 'CLOSED' || shipment.stage === 'DELIVERY') {
        // Clear all active flags if closed/delivered
        await trx
          .updateTable('risk_flags')
          .set({ resolved: true, resolved_at: new Date() })
          .where('shipment_id', '=', shipmentId)
          .where('resolved', '=', false)
          .execute();
        return;
      }

      const now = new Date();
      const activeFlags: { type: RiskFlagType; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; deadline?: Date }[] = [];

      // 1. Demurrage risk: free_time_end is within 48h
      if (shipment.free_time_end) {
        const freeTime = new Date(shipment.free_time_end);
        const timeDiff = freeTime.getTime() - now.getTime();
        const hoursLeft = timeDiff / (1000 * 60 * 60);

        if (hoursLeft <= 0) {
          activeFlags.push({
            type: 'DEMURRAGE',
            severity: 'HIGH',
            message: `Demurrage free time expired on ${freeTime.toLocaleDateString()}. Daily charges accruing.`,
          });
        } else if (hoursLeft <= 48) {
          activeFlags.push({
            type: 'DEMURRAGE',
            severity: 'MEDIUM',
            message: `Demurrage free time expires in ${Math.round(hoursLeft)} hours (on ${freeTime.toLocaleDateString()}).`,
            deadline: freeTime,
          });
        }
      }

      // 2. SLA breach: sla_deadline has passed
      if (shipment.sla_deadline) {
        const deadline = new Date(shipment.sla_deadline);
        if (now > deadline) {
          const hoursOver = (now.getTime() - deadline.getTime()) / (1000 * 60 * 60);
          activeFlags.push({
            type: 'SLA_BREACH',
            severity: 'HIGH',
            message: `Clearance stage "${shipment.stage}" has exceeded its SLA deadline by ${Math.round(hoursOver)} hours.`,
          });
        }
      }

      // 3. Missing documents: any required document is missing
      const requiredDocs = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('status', '=', 'REQUIRED')
        .execute();

      if (requiredDocs.length > 0) {
        const docNames = requiredDocs.map((d) => d.type).join(', ');
        activeFlags.push({
          type: 'MISSING_DOC',
          severity: 'MEDIUM',
          message: `Missing required document(s) for clearance: ${docNames}.`,
        });
      }

      // Fetch currently saved active flags from database
      const existingFlags = await trx
        .selectFrom('risk_flags')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('resolved', '=', false)
        .execute();

      // Deactivate flags that are no longer active
      for (const ext of existingFlags) {
        const isStillActive = activeFlags.some((af) => af.type === ext.type);
        if (!isStillActive) {
          await trx
            .updateTable('risk_flags')
            .set({ resolved: true, resolved_at: now })
            .where('id', '=', ext.id)
            .execute();
        }
      }

      // Insert/activate flags
      for (const af of activeFlags) {
        const alreadyExists = existingFlags.some((ext) => ext.type === af.type);
        if (!alreadyExists) {
          await trx
            .insertInto('risk_flags')
            .values({
              tenant_id: tenantId,
              shipment_id: shipmentId,
              type: af.type,
              severity: af.severity,
              message: af.message,
              deadline: af.deadline || null,
              resolved: false,
              created_at: now,
            })
            .execute();

          // If high severity, trigger SLA_BREACH/DEMURRAGE notifications
          if (af.severity === 'HIGH' && af.type === 'SLA_BREACH') {
            NotificationService.triggerNotification(tenantId, shipmentId, 'SLA_BREACH').catch(console.error);
          } else if (af.severity === 'HIGH' && af.type === 'DEMURRAGE') {
            NotificationService.triggerNotification(tenantId, shipmentId, 'DEMURRAGE_RISK', {
              hoursLeft: '0',
              freeTimeEnd: shipment.free_time_end?.toString() || '',
              remainingStages: shipment.stage,
            }).catch(console.error);
          }
        }
      }
    });
  }
}
