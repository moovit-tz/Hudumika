import { withTenant } from '../db/client.js';
import { WorkflowService } from './workflow.service.js';
import { NotificationService } from './notification.service.js';
import { MinioIntegration } from '../integrations/minio.js';
import { resolveWorkflowForNewShipment, loadResolvedWorkflow, pickStartStep } from './workflow-resolver.service.js';
import { emitDomainEvent, emitDomainEventStandalone } from './domain-events.service.js';
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
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      const currentCount = Number(countResult?.cnt ?? 0) + 1;
      const refNumber = `CLR-2026-${String(currentCount).padStart(4, '0')}`;

      const now = new Date();
      const etaDate = input.eta ? new Date(input.eta) : null;
      let freeTimeDate = input.free_time_end ? new Date(input.free_time_end) : null;
      const consignmentType = input.consignment_type || 'import';

      // No free_time_end given but we know the vessel ETA — default it from the
      // tenant's configured demurrage free-time window (Settings ▸ ClearOS/Freight,
      // "freight.free_time_days") rather than leaving demurrage risk scoring blind.
      if (!freeTimeDate && etaDate) {
        const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
        const tenantSettings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
        const freeTimeDays = tenantSettings?.freight?.free_time_days ?? 7;
        freeTimeDate = new Date(etaDate.getTime() + freeTimeDays * 24 * 60 * 60 * 1000);
      }

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
      emitDomainEvent(trx, tenantId, {
        type: 'shipment.case_opened', sourceApp: 'clearos', entityType: 'shipment', entityId: shipment.id,
        payload: { refNumber: shipment.ref_number, customerId: shipment.customer_id, assignedTo: shipment.assigned_to },
      }).catch(console.error);

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
    emitDomainEventStandalone(tenantId, {
      type: 'shipment.stage_advanced', sourceApp: 'clearos', entityType: 'shipment', entityId: shipmentId,
      payload: { stage: nextStage, note: note ?? null },
    }).catch(console.error);

    // Run risk scoring calculation in the background when stage changes
    this.evaluateRiskFlags(tenantId, shipmentId).catch(console.error);

    return result;
  }

  /**
   * Fetch all shipments grouped by customer for the command center
   */
  static async listGroupedByCustomer(tenantId: string, filters: {
    assigned_to?: string; stage?: string; customer_id?: string; workflow_id?: string | null;
    /** Folded in from /clearos/declarations, which is being removed. */
    declaration_status?: string; selectivity_channel?: string;
    has_declaration?: boolean; search?: string;
    checked_in?: boolean;
    pending?: boolean;
  }) {
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

      if (filters.checked_in) {
        const today = new Date().toISOString().split('T')[0];
        shipmentsQuery = shipmentsQuery.where('assigned_to', 'in', (eb) => eb.selectFrom('hr_time_entries')
          .select('user_id')
          .where('tenant_id', '=', tenantId)
          .where('date', '=', today)
          .where('ended_at', 'is', null)
        );
      }

      if (filters.pending) {
        shipmentsQuery = shipmentsQuery.where((eb) => eb.exists(
          eb.selectFrom('shipment_tasks')
            .select('id')
            .whereRef('shipment_tasks.shipment_id', '=', 'shipment_cases.id')
            .where('shipment_tasks.tenant_id', '=', tenantId)
            .where('shipment_tasks.status', '=', 'open')
        ));
      }

      /**
       * Declaration filters, applied in SQL rather than in the browser.
       *
       * These carry over from /clearos/declarations, which is being folded
       * into Ops. That page pushed status/lane/search to the API; Ops filtered
       * whatever it had already loaded, which stops working at a few hundred
       * shipments. Doing it here keeps the behaviour the declarations page had.
       *
       * A shipment has zero or one declaration, so these are EXISTS subqueries
       * rather than a join — a join would be fine today but would silently
       * duplicate rows the day a shipment can be re-lodged.
       */
      if (filters.declaration_status) {
        shipmentsQuery = shipmentsQuery.where((eb) => eb.exists(
          eb.selectFrom('declarations').select('id')
            .whereRef('declarations.shipment_id', '=', 'shipment_cases.id')
            .where('declarations.tenant_id', '=', tenantId)
            .where('declarations.status', '=', filters.declaration_status as any)
        ));
      }
      if (filters.selectivity_channel) {
        shipmentsQuery = shipmentsQuery.where((eb) => eb.exists(
          eb.selectFrom('declarations').select('id')
            .whereRef('declarations.shipment_id', '=', 'shipment_cases.id')
            .where('declarations.tenant_id', '=', tenantId)
            .where('declarations.selectivity_channel', '=', filters.selectivity_channel as any)
        ));
      }
      if (filters.has_declaration !== undefined) {
        // The gap list: shipments not lodged yet. /clearos/declarations built
        // this client-side by loading 500 shipments and subtracting the ones
        // with a declaration_id; as a NOT EXISTS it is correct at any size.
        const exists = (eb: any) => eb.exists(
          eb.selectFrom('declarations').select('id')
            .whereRef('declarations.shipment_id', '=', 'shipment_cases.id')
            .where('declarations.tenant_id', '=', tenantId)
        );
        shipmentsQuery = filters.has_declaration
          ? shipmentsQuery.where((eb) => exists(eb))
          : shipmentsQuery.where((eb) => eb.not(exists(eb)));
      }
      if (filters.search) {
        // Ops searched ref/goods/BL/AWB. The declarations page also searched
        // the TANCIS ref, the TANSAD number and the importer name, and those
        // are the identifiers a customs officer actually has to hand.
        const term = `%${filters.search}%`;
        shipmentsQuery = shipmentsQuery.where((eb) => eb.or([
          eb('ref_number', 'ilike', term),
          eb('goods_desc', 'ilike', term),
          eb('bl_number', 'ilike', term),
          eb('awb_number', 'ilike', term),
          eb.exists(
            eb.selectFrom('declarations').select('id')
              .whereRef('declarations.shipment_id', '=', 'shipment_cases.id')
              .where('declarations.tenant_id', '=', tenantId)
              .where((d: any) => d.or([
                d('declarations.tancis_ref', 'ilike', term),
                d('declarations.tansad_number', 'ilike', term),
                d('declarations.importer_name', 'ilike', term),
              ]))
          ),
        ]));
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
      /**
       * The declaration facts Ops now shows in place of /clearos/declarations:
       * the TANCIS ref, the filing status, the TRA selectivity lane, the item
       * count and the declared customs value. One batched query, not N+1.
       *
       * Only the columns the list needs — the full declaration stays behind
       * GET /v1/declarations/:id for the detail view.
       */
      const declRows = shipmentIds.length > 0
        ? await trx.selectFrom('declarations')
            .select(['id', 'shipment_id', 'tancis_ref', 'tansad_number', 'status',
                     'selectivity_channel', 'no_of_items', 'total_customs_value',
                     'importer_name', 'declared_at'])
            .where('tenant_id', '=', tenantId)
            .where('shipment_id', 'in', shipmentIds)
            .execute()
        : [];
      const declByShipment = new Map(declRows.map((d) => [d.shipment_id, d]));

      const workflowIds = [...new Set(shipments.map((s) => s.workflow_id).filter(Boolean))] as string[];
      const stepRows = workflowIds.length > 0
        ? await trx.selectFrom('workflow_steps')
            .select(['id', 'workflow_id', 'step_order', 'is_terminal', 'name'])
            .where('workflow_id', 'in', workflowIds)
            .execute()
        : [];
      const stepCountByWorkflow = new Map<string, number>();
      const stepInfoById = new Map<string, { order: number; isTerminal: boolean; name: string }>();
      for (const row of stepRows) {
        stepCountByWorkflow.set(row.workflow_id, (stepCountByWorkflow.get(row.workflow_id) ?? 0) + 1);
        stepInfoById.set(row.id, { order: row.step_order, isTerminal: row.is_terminal, name: row.name });
      }

      const grouped = customers.map((cust) => {
        const custShipments = shipments.filter((s) => s.customer_id === cust.id);
        const mappedShipments = custShipments.map((s) => {
          const sFlags = riskFlags.filter((f) => f.shipment_id === s.id);
          const customStep = s.workflow_step_id ? stepInfoById.get(s.workflow_step_id) : undefined;
          const decl = declByShipment.get(s.id);
          return {
            ...s,
            // null when nothing has been lodged — that absence is itself the
            // "not declared yet" state Ops surfaces.
            declaration: decl
              ? {
                  id: decl.id,
                  tancis_ref: decl.tancis_ref,
                  tansad_number: decl.tansad_number,
                  status: decl.status,
                  selectivity_channel: decl.selectivity_channel,
                  no_of_items: decl.no_of_items,
                  total_customs_value: decl.total_customs_value,
                  importer_name: decl.importer_name,
                  declared_at: decl.declared_at,
                }
              : null,
            assigned_officer_name: s.assigned_to ? (officerNameMap.get(s.assigned_to) ?? null) : null,
            containers: (typeof s.containers === 'string' ? JSON.parse(s.containers) : s.containers) as Container[],
            risk_flags: sFlags,
            active_risk_types: sFlags.map((f) => f.type),
            document_count: docCountMap.get(s.id) ?? 0,
            message_count: msgCountMap.get(s.id) ?? 0,
            // The step's own name. Without it the list printed
            // shipment.stage raw, and for a shipment on a custom workflow
            // that value is a workflow_steps UUID — so the Status column read
            // "5e9ef8f3-ec93-4bb3-92c7-6d86084dc8cc" to the user.
            workflow_step_name: customStep?.name ?? null,
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

      // uploaded_by is a user id, and the screens that show it were rendering
      // the raw uuid — "Uploaded by f7c30a8f-b30f-…" in the Files tab and
      // "Someone uploaded …" in the activity feed. leftJoin, not innerJoin: a
      // document uploaded by an account since deleted must still be listed.
      const documents = await trx
        .selectFrom('case_documents as d')
        .leftJoin('users as u', 'u.id', 'd.uploaded_by')
        .selectAll('d')
        .select('u.name as uploaded_by_name')
        .where('d.shipment_id', '=', shipmentId)
        .where('d.tenant_id', '=', tenantId)
        .orderBy('d.created_at', 'desc')
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
        .where('id', '=', shipmentId).where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!shipment) return;

      // Real per-tenant thresholds from Workspace ▸ Settings ▸ Notifications /
      // ClearOS-Freight (previously "notifications"/"freight" saved to
      // tenant_settings and never read back by anything — this is that read).
      const settingsRow = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      const tenantSettings = settingsRow ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings) : {};
      const demurrageAlertHours = (tenantSettings?.notifications?.demurrage_alert_days ?? 3) * 24;
      const slaReminderHours = tenantSettings?.notifications?.sla_reminder_hours ?? 24;
      const autoRiskFlagsEnabled = tenantSettings?.freight?.auto_risk_flags !== false;

      if (!autoRiskFlagsEnabled) {
        // Kill switch — resolve any pre-existing flags and stop; no new ones
        // are raised while a tenant has turned off automatic risk detection.
        await trx.updateTable('risk_flags').set({ resolved: true, resolved_at: new Date() })
          .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId).where('resolved', '=', false).execute();
        return;
      }

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
          .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId)
          .where('resolved', '=', false)
          .execute();
        return;
      }

      const now = new Date();
      const activeFlags: { type: RiskFlagType; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; deadline?: Date }[] = [];

      // 1. Demurrage risk: free_time_end is within the tenant's configured alert lead time
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
        } else if (hoursLeft <= demurrageAlertHours) {
          activeFlags.push({
            type: 'DEMURRAGE',
            severity: 'MEDIUM',
            message: `Demurrage free time expires in ${Math.round(hoursLeft)} hours (on ${freeTime.toLocaleDateString()}).`,
            deadline: freeTime,
          });
        }
      }

      // 2. SLA breach: sla_deadline has passed, or is approaching within the
      // tenant's configured reminder window (proactive, before it's actually breached)
      if (shipment.sla_deadline) {
        const deadline = new Date(shipment.sla_deadline);
        if (now > deadline) {
          const hoursOver = (now.getTime() - deadline.getTime()) / (1000 * 60 * 60);
          activeFlags.push({
            type: 'SLA_BREACH',
            severity: 'HIGH',
            message: `Clearance stage "${shipment.stage}" has exceeded its SLA deadline by ${Math.round(hoursOver)} hours.`,
          });
        } else {
          const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (hoursUntil <= slaReminderHours) {
            activeFlags.push({
              type: 'SLA_BREACH',
              severity: 'MEDIUM',
              message: `Clearance stage "${shipment.stage}" SLA deadline is in ${Math.round(hoursUntil)} hours.`,
              deadline,
            });
          }
        }
      }

      // 3. Missing documents: any required document is missing
      const requiredDocs = await trx
        .selectFrom('case_documents')
        .selectAll()
        .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId)
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
        .where('shipment_id', '=', shipmentId).where('tenant_id', '=', tenantId)
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
            emitDomainEvent(trx, tenantId, {
              type: 'shipment.sla_breach', sourceApp: 'clearos', entityType: 'shipment', entityId: shipmentId,
              payload: { hoursExceeded, stage: shipment.stage },
            }).catch(console.error);
          } else if (af.severity === 'HIGH' && af.type === 'DEMURRAGE') {
            NotificationService.triggerNotification(tenantId, shipmentId, 'DEMURRAGE_RISK', {
              hoursLeft: '0',
              freeTimeEnd: shipment.free_time_end?.toString() || '',
              remainingStages: shipment.stage,
            }).catch(console.error);
            emitDomainEvent(trx, tenantId, {
              type: 'shipment.demurrage_risk', sourceApp: 'clearos', entityType: 'shipment', entityId: shipmentId,
              payload: { freeTimeEnd: shipment.free_time_end?.toString() || '', stage: shipment.stage },
            }).catch(console.error);
          }
        }
      }
    });
  }
}
