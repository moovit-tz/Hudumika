import { withTenant } from '../db/client.js';
import { WorkflowService } from './workflow.service.js';
import { NotificationService } from './notification.service.js';
import { MinioIntegration } from '../integrations/minio.js';
import { resolveWorkflowForNewShipment, loadResolvedWorkflow, pickStartStep } from './workflow-resolver.service.js';
import type { ShipmentType, ClearanceStage, Container, DocumentType, RiskFlagType } from '@hudumika/types';

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
      consignment_type?: string;
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
      const consignmentType = input.consignment_type || 'import';

      // 1b. Resolve which workflow governs this shipment (legacy fixed
      // stages by default; a tenant's custom workflow if its triggers
      // match). Resolved ONCE here — a workflow owns a case for its
      // lifecycle and is never re-resolved on later transitions.
      const resolvedWorkflow = await resolveWorkflowForNewShipment(trx, tenantId, {
        type: input.type,
        consignmentType,
        customerId: input.customer_id,
        originPort: input.origin_port,
        destPort: input.dest_port,
      });
      const startStep = pickStartStep(resolvedWorkflow.steps);

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
          stage: startStep.id,
          assigned_to: input.assigned_to,
          location_id: input.location_id || null,
          sla_deadline: new Date(now.getTime() + startStep.slaHours * 60 * 60 * 1000),
          free_time_end: freeTimeDate,
          consignment_type: consignmentType,
          workflow_id: resolvedWorkflow.workflowId,
          workflow_step_id: resolvedWorkflow.kind === 'CUSTOM' ? startStep.id : null,
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
          stage: startStep.id,
          entered_at: now,
          actor_id: input.assigned_to,
          note: 'Shipment case initialized.',
        })
        .execute();

      // 4. Pre-populate required documents checklist
      const requiredDocs: DocumentType[] = ['BL', 'INVOICE', 'PACKING_LIST'];
      if (input.type === 'AIR') {
        requiredDocs[0] = 'AWB';
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

      // 5. Create customer/BL folder in storage
      const folderName = input.bl_number || input.awb_number || refNumber;
      MinioIntegration.ensureFolder(tenantId, input.customer_id, folderName);

      // 6. Trigger notifications (offloaded dynamically)
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
    nextStage: string,
    actorId: string,
    note?: string,
    blocker?: string
  ) {
    const result = await WorkflowService.transitionStage(tenantId, shipmentId, nextStage, actorId, note, blocker);
    
    // Trigger notification on stage update
    NotificationService.triggerNotification(tenantId, shipmentId, 'STAGE_ADVANCED', {
      stageLabel: nextStage,
    }).catch(console.error);
    NotificationService.notifyListeners(tenantId, shipmentId, 'STAGE_ADVANCED', {
      stageLabel: nextStage,
    }).catch(console.error);

    // Run risk scoring calculation in the background when stage changes
    this.evaluateRiskFlags(tenantId, shipmentId).catch(console.error);

    return result;
  }

  /**
   * Fetch all shipments grouped by customer for the command center
   */
  static async listGroupedByCustomer(tenantId: string, filters: { assigned_to?: string; stage?: string; customer_id?: string; workflow_id?: string | null }) {
    return withTenant(tenantId, async (trx) => {
      // Explicit tenant filter on every query below — RLS doesn't protect
      // these tables (the DB connection role owns them and bypasses RLS
      // regardless of SET LOCAL app.tenant_id), so relying on withTenant()
      // alone previously let every tenant's Ops Command show every other
      // tenant's customers and shipments mixed together.
      let customersQuery = trx.selectFrom('customers').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('active', '=', true);
      if (filters.customer_id) {
        customersQuery = customersQuery.where('id', '=', filters.customer_id);
      }
      const customers = await customersQuery.execute();

      // Fetch shipments
      let shipmentsQuery = trx.selectFrom('shipment_cases').selectAll()
        .where('tenant_id', '=', tenantId)
        .where('deleted_at', 'is', null);
      if (filters.assigned_to) {
        shipmentsQuery = shipmentsQuery.where('assigned_to', '=', filters.assigned_to);
      }
      if (filters.customer_id) {
        shipmentsQuery = shipmentsQuery.where('customer_id', '=', filters.customer_id);
      }
      if (filters.stage) {
        shipmentsQuery = shipmentsQuery.where('stage', '=', filters.stage);
      }
      if (filters.workflow_id !== undefined) {
        // Ops Kanban workflow filter: null/'legacy' means shipments still on
        // the fixed stage system, a workflow id scopes to that custom workflow.
        shipmentsQuery = filters.workflow_id === null
          ? shipmentsQuery.where('workflow_id', 'is', null)
          : shipmentsQuery.where('workflow_id', '=', filters.workflow_id);
      }
      const shipments = await shipmentsQuery.execute();

      // Batch-resolve officer names from users table
      const officerIds = [...new Set(shipments.map((s) => s.assigned_to).filter(Boolean))] as string[];
      const officerRows = officerIds.length > 0
        ? await trx.selectFrom('users').select(['id', 'name']).where('id', 'in', officerIds).execute()
        : [];
      const officerNameMap = new Map(officerRows.map((u) => [u.id, u.name]));

      // Fetch risk flags
      const riskFlags = await trx
        .selectFrom('risk_flags')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('resolved', '=', false)
        .execute();

      // Batched document/message counts (grouped by shipment) for the kanban
      // card meta row — a single aggregate query per set rather than N+1,
      // and no full document/message arrays fetched (those stay list-only).
      const shipmentIds = shipments.map((s) => s.id);
      const [docCountRows, msgCountRows] = shipmentIds.length > 0
        ? await Promise.all([
            trx.selectFrom('case_documents')
              .select(['shipment_id', (eb) => eb.fn.countAll().as('count')])
              .where('tenant_id', '=', tenantId)
              .where('shipment_id', 'in', shipmentIds)
              .groupBy('shipment_id')
              .execute(),
            trx.selectFrom('case_messages')
              .select(['shipment_id', (eb) => eb.fn.countAll().as('count')])
              .where('tenant_id', '=', tenantId)
              .where('shipment_id', 'in', shipmentIds)
              .groupBy('shipment_id')
              .execute(),
          ])
        : [[], []];
      const docCountMap = new Map(docCountRows.map((r: any) => [r.shipment_id, Number(r.count)]));
      const msgCountMap = new Map(msgCountRows.map((r: any) => [r.shipment_id, Number(r.count)]));

      // Batched (not per-shipment) lookup of custom-workflow step position —
      // powers a proportional progress bar for shipments on a tenant-defined
      // workflow (ProgressSegments/DetailPanel can't index into the fixed
      // CLEARANCE_STAGES array for these, since `stage` is a step UUID) and
      // generalizes the "is this shipment done/terminal" check below.
      const workflowIds = [...new Set(shipments.map((s) => s.workflow_id).filter(Boolean))] as string[];
      const stepRows = workflowIds.length > 0
        ? await trx.selectFrom('workflow_steps')
            .select(['id', 'workflow_id', 'step_order', 'is_terminal'])
            .where('workflow_id', 'in', workflowIds)
            .execute()
        : [];
      const stepCountByWorkflow = new Map<string, number>();
      const stepInfoById = new Map<string, { order: number; isTerminal: boolean }>();
      for (const row of stepRows) {
        stepCountByWorkflow.set(row.workflow_id, (stepCountByWorkflow.get(row.workflow_id) ?? 0) + 1);
        stepInfoById.set(row.id, { order: row.step_order, isTerminal: row.is_terminal });
      }

      const grouped = customers.map((cust) => {
        const custShipments = shipments.filter((s) => s.customer_id === cust.id);
        const mappedShipments = custShipments.map((s) => {
          const sFlags = riskFlags.filter((f) => f.shipment_id === s.id);
          const customStep = s.workflow_step_id ? stepInfoById.get(s.workflow_step_id) : undefined;
          return {
            ...s,
            assigned_officer_name: s.assigned_to ? (officerNameMap.get(s.assigned_to) ?? null) : null,
            containers: (typeof s.containers === 'string' ? JSON.parse(s.containers) : s.containers) as Container[],
            risk_flags: sFlags,
            active_risk_types: sFlags.map((f) => f.type),
            document_count: docCountMap.get(s.id) ?? 0,
            message_count: msgCountMap.get(s.id) ?? 0,
            workflow_step_order: customStep?.order,
            workflow_step_count: s.workflow_id ? stepCountByWorkflow.get(s.workflow_id) : undefined,
            _isTerminal: s.workflow_id ? (customStep?.isTerminal ?? false) : (s.stage === 'CLOSED' || s.stage === 'DELIVERY'),
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
          action_count: mappedShipments.filter((s) => !s._isTerminal).length,
          locations,
          shipments: mappedShipments.map(({ _isTerminal, ...s }) => s),
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
      // Explicit tenant filter — without it, any authenticated user of any
      // tenant could view a full shipment case (documents, expenses,
      // messages) by guessing/enumerating another tenant's UUID, since RLS
      // doesn't apply (see listGroupedByCustomer above for why).
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!shipment) return null;

      const customer = await trx
        .selectFrom('customers')
        .select(['name', 'contact_name', 'email', 'phone'])
        .where('id', '=', shipment.customer_id)
        .where('tenant_id', '=', tenantId)
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
        .where('tenant_id', '=', tenantId)
        .orderBy('entered_at', 'asc')
        .execute();

      const documents = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute();

      const expenses = await trx
        .selectFrom('expenses')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute();

      const riskFlags = await trx
        .selectFrom('risk_flags')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .where('resolved', '=', false)
        .execute();

      const messages = await trx
        .selectFrom('case_messages')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'asc')
        .execute();

      const listeners = await trx
        .selectFrom('shipment_listeners')
        .selectAll()
        .where('shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'asc')
        .execute();

      // Custom-workflow step position — lets the detail page render a
      // proportional progress bar instead of indexing into the fixed
      // CLEARANCE_STAGES array (meaningless once `stage` is a step UUID).
      let workflowStepOrder: number | undefined;
      let workflowStepCount: number | undefined;
      let workflowStepName: string | undefined;
      if (shipment.workflow_id) {
        const [currentStep, allSteps] = await Promise.all([
          shipment.workflow_step_id
            ? trx.selectFrom('workflow_steps').select(['step_order', 'name']).where('id', '=', shipment.workflow_step_id).executeTakeFirst()
            : undefined,
          trx.selectFrom('workflow_steps').select((eb) => eb.fn.countAll().as('count')).where('workflow_id', '=', shipment.workflow_id).executeTakeFirst(),
        ]);
        workflowStepOrder = currentStep?.step_order;
        workflowStepName = currentStep?.name;
        workflowStepCount = allSteps ? Number(allSteps.count) : undefined;
      }

      return {
        ...shipment,
        containers: (typeof shipment.containers === 'string' ? JSON.parse(shipment.containers) : shipment.containers) as Container[],
        customer_name: customer?.name,
        customer_contact_name: customer?.contact_name ?? null,
        customer_email: customer?.email ?? null,
        customer_phone: customer?.phone ?? null,
        assigned_officer_name: officer?.name,
        assigned_officer_email: officer?.email ?? null,
        assigned_officer_phone: officer?.phone ?? null,
        stage_history: stageHistory,
        documents,
        expenses,
        risk_flags: riskFlags,
        active_risk_types: riskFlags.map((f) => f.type),
        messages,
        workflow_step_order: workflowStepOrder,
        workflow_step_count: workflowStepCount,
        workflow_step_name: workflowStepName,
        listeners: listeners.map((l) => ({
          ...l,
          channels: typeof l.channels === 'string' ? JSON.parse(l.channels) : l.channels,
        })),
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

      if (!shipment) return;

      // Legacy shipments keep the exact old two-literal check. Custom-workflow
      // shipments check the resolved step's isTerminal flag instead — there's
      // no generic equivalent of the legacy-specific "DELIVERY" special case,
      // and treating a custom workflow's last non-terminal step as still
      // risk-scored is more correct, not a regression.
      let isInactiveForRiskScoring: boolean;
      if (!shipment.workflow_id) {
        isInactiveForRiskScoring = shipment.stage === 'CLOSED' || shipment.stage === 'DELIVERY';
      } else {
        const resolved = await loadResolvedWorkflow(trx, tenantId, shipment.workflow_id);
        const currentStep = resolved.steps.find((s) => s.id === (shipment.workflow_step_id ?? shipment.stage));
        isInactiveForRiskScoring = currentStep?.isTerminal ?? false;
      }

      if (isInactiveForRiskScoring) {
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
            const hoursExceeded = shipment.sla_deadline
              ? String(Math.round((now.getTime() - new Date(shipment.sla_deadline).getTime()) / (1000 * 60 * 60)))
              : '0';
            NotificationService.triggerNotification(tenantId, shipmentId, 'SLA_BREACH', { hoursExceeded }).catch(console.error);
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
