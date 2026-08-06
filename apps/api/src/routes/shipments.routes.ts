import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';
import { co2Service } from '../services/co2.service.js';
import { requireRole } from '../middleware/rbac.js';
import { CHARGE_HEADS } from '../services/intelligence.service.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';
import { NotificationService } from '../services/notification.service.js';
import type { CreateShipmentInput, AdvanceStageInput } from '@hudumika/types';
import { buildMockResult, trackViaShipsGo, trackViaShip24 } from './tracker.routes.js';
import { sql } from 'kysely';

/** JSONB arrives as a string from some drivers and an object from others. */
function parseJsonCol<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === 'string') { try { return JSON.parse(val) as T; } catch { return fallback; } }
  return val as T;
}

export async function shipmentRoutes(fastify: FastifyInstance) {
  // Enforce authentication on all routes in this file
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /**
   * GET /v1/shipments
   * Fetch shipments with filters, tenant-scoped, and role-scoped
   */
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    return withTenant(user.tenant_id, async (trx) => {
      // Explicit tenant filter — withTenant()'s SET LOCAL app.tenant_id only
      // enforces RLS for a non-owner DB role; this connection uses a role
      // that owns the tables (see db/client.ts), which Postgres always lets
      // bypass RLS regardless of session settings. Every query here must
      // filter tenant_id itself rather than relying on RLS alone.
      let q = trx.selectFrom('shipment_cases').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('deleted_at', 'is', null);

      // Enforce RBAC filters
      if (user.role === 'OFFICER') {
        q = q.where('assigned_to', '=', user.sub);
      } else if (user.role === 'CUSTOMER') {
        q = q.where('customer_id', '=', user.sub);
      }

      // Query Filters
      if (query.customer_id) {
        q = q.where('customer_id', '=', query.customer_id);
      }
      if (query.stage) {
        q = q.where('stage', '=', query.stage as string);
      }
      if (query.type) {
        q = q.where('type', '=', query.type);
      }
      if (query.search) {
        const searchVal = `%${query.search}%`;
        q = q.where((eb) =>
          eb.or([
            eb('ref_number', 'ilike', searchVal),
            eb('goods_desc', 'ilike', searchVal),
            eb('bl_number', 'ilike', searchVal),
            eb('awb_number', 'ilike', searchVal),
          ])
        );
      }

      const list = await q.orderBy('created_at', 'desc').execute();

      // Batch-resolve customer names
      const customerIds = [...new Set(list.map((s) => s.customer_id).filter(Boolean))] as string[];
      const customerRows = customerIds.length > 0
        ? await trx
            .selectFrom('customers')
            .select(['id', 'name'])
            .where('tenant_id', '=', user.tenant_id)
            .where('id', 'in', customerIds)
            .execute()
        : [];
      const customerNameMap = new Map(customerRows.map((c) => [c.id, c.name]));

      // Fetch active risk flags for these shipments
      const shipmentIds = list.map((s) => s.id);
      const riskFlags = shipmentIds.length > 0
        ? await trx
            .selectFrom('risk_flags')
            .select(['shipment_id', 'type'])
            .where('shipment_id', 'in', shipmentIds)
            .where('resolved', '=', false)
            .execute()
        : [];

      const riskByShipment = new Map<string, string[]>();
      for (const flag of riskFlags) {
        const existing = riskByShipment.get(flag.shipment_id) ?? [];
        if (!existing.includes(flag.type)) existing.push(flag.type);
        riskByShipment.set(flag.shipment_id, existing);
      }

      // Resolve containers from JSON string to object array
      const parsedList = list.map((item) => ({
        ...item,
        customer_name: customerNameMap.get(item.customer_id ?? '') ?? null,
        containers: typeof item.containers === 'string' ? JSON.parse(item.containers) : item.containers,
        active_risk_types: riskByShipment.get(item.id) ?? [],
      }));

      return { data: parsedList };
    });
  });

  /**
   * GET /v1/shipments/grouped
   * List shipments grouped by customer for the Ops Command Center
   */
  fastify.get('/grouped', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE', 'CUSTOMER') }, async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    const filters: any = {};

    if (user.role === 'JUNIOR' || user.role === 'OFFICER') {
      filters.assigned_to = user.sub;
    } else if (user.role === 'CUSTOMER') {
      // Look up the customer record linked to this user's email
      const customerRecord = await db
        .selectFrom('customers')
        .select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('email', '=', user.email)
        .executeTakeFirst();
      if (customerRecord) filters.customer_id = customerRecord.id;
      else return { data: [] };
    } else if (query.assigned_to) {
      filters.assigned_to = query.assigned_to;
    }

    if (query.stage) filters.stage = query.stage;
    // 'legacy' means shipments still on the fixed stage system (workflow_id
    // IS NULL); any other value scopes to that specific custom workflow.
    if (query.workflow_id === 'legacy') filters.workflow_id = null;
    else if (query.workflow_id) filters.workflow_id = query.workflow_id;

    // Declaration filters, carried over from /clearos/declarations so Ops can
    // replace it. All resolved in SQL — see listGroupedByCustomer.
    if (query.declaration_status) filters.declaration_status = query.declaration_status;
    if (query.selectivity_channel) filters.selectivity_channel = query.selectivity_channel;
    if (query.has_declaration === 'true') filters.has_declaration = true;
    else if (query.has_declaration === 'false') filters.has_declaration = false;
    if (query.search) filters.search = String(query.search).trim();

    const groupedData = await ShipmentService.listGroupedByCustomer(user.tenant_id, filters);
    return { data: groupedData };
  });

  /**
   * GET /v1/shipments/:id
   * Fetch a single shipment with complete historical and structural sub-objects
   */
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const shipment = await ShipmentService.getById(user.tenant_id, id);
    if (!shipment) {
      return reply.status(404).send({ error: 'Shipment case not found' });
    }

    // Security check: Officers and Customers must own the case
    if (user.role === 'OFFICER' && shipment.assigned_to !== user.sub) {
      return reply.status(403).send({ error: 'Forbidden: You are not assigned to this case' });
    }
    if (user.role === 'CUSTOMER' && shipment.customer_id !== user.sub) {
      return reply.status(403).send({ error: 'Forbidden: Access denied to this case' });
    }

    // Resolve customer name
    return withTenant(user.tenant_id, async (trx) => {
      const customer = shipment.customer_id
        ? await trx.selectFrom('customers').select(['id', 'name']).where('id', '=', shipment.customer_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
        : null;
      return { ...shipment, customer_name: customer?.name ?? null };
    });
  });

  /**
   * DELETE /v1/shipments/:id
   * Soft-delete a shipment case — sets deleted_at, keeps the row and every
   * child record (documents, expenses, messages, stage history) intact for
   * audit purposes, and removes it from every listing/detail view.
   */
  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx
        .updateTable('shipment_cases')
        .set({ deleted_at: new Date(), deleted_by: user.sub, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) return reply.status(404).send({ error: 'Shipment not found' });
      reply.status(204);
      return null;
    });
  });

  /**
   * GET /v1/shipments/:id/linked
   * Real cross-app data tied to this shipment: sales invoices (finance),
   * demurrage containers, AWB/BL tracker snapshots, and the HuduFreight
   * transport trip — each app's own table, joined here by shipment_id (or
   * ref_number for invoices, which link by text ref rather than FK).
   * Every sub-query is wrapped since a tenant may not have that app
   * provisioned at all.
   */
  fastify.get('/:id/linked', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx.selectFrom('shipment_cases')
        .select(['id', 'ref_number'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const [invoices, containers, trackerSnapshots, trips] = await Promise.all([
        trx.selectFrom('sales_invoices')
          .select(['id', 'invoice_number', 'status', 'due_date', 'tra_total_incl'])
          .where('tenant_id', '=', user.tenant_id)
          .where('shipment_ref', '=', shipment.ref_number)
          .orderBy('created_at', 'desc')
          .execute().catch(() => []),
        trx.selectFrom('container_tracking')
          .select(['id', 'container_number', 'demurrage_days', 'demurrage_cost', 'demurrage_currency', 'status'])
          .where('tenant_id', '=', user.tenant_id)
          .where('shipment_id', '=', id)
          .execute().catch(() => []),
        trx.selectFrom('tracking_snapshots')
          .select(['id', 'tracking_type', 'tracking_number', 'status', 'eta', 'progress_pct'])
          .where('tenant_id', '=', user.tenant_id)
          .where('shipment_id', '=', id)
          .execute().catch(() => []),
        trx.selectFrom('trips')
          .leftJoin('vehicles', 'vehicles.id', 'trips.vehicle_id')
          .leftJoin('drivers', 'drivers.id', 'trips.driver_id')
          .select(['trips.id', 'trips.status', 'trips.job_type', 'trips.scheduled_start', 'trips.actual_start',
                    'vehicles.name as vehicle_name', 'vehicles.plate_number', 'drivers.name as driver_name'])
          .where('trips.tenant_id', '=', user.tenant_id)
          .where('trips.shipment_id', '=', id)
          .orderBy('trips.created_at', 'desc')
          .execute().catch(() => []),
      ]);

      return { invoices, demurrage_containers: containers, tracker_snapshots: trackerSnapshots, transport_trips: trips };
    });
  });

  /**
   * POST /v1/shipments/bulk-import
   * Import multiple shipments from a CSV/parsed payload
   */
  fastify.post('/bulk-import', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SENIOR') }, async (request, reply) => {
    const user = request.user;

    interface BulkRow {
      tansad_number?: string;
      bl_number?: string;
      awb_number?: string;
      client_name: string;
      shipping_line?: string;
      num_containers?: number;
      port?: string;
      port_status?: string;
      shipping_status?: string;
      goods_desc?: string;
      container_deposit?: boolean;
      container_deposit_paid?: boolean;
    }

    const { rows } = request.body as { rows: BulkRow[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return reply.status(400).send({ error: 'rows array is required and must not be empty' });
    }

    const imported: string[] = [];
    const skipped: { row: number; reason: string }[] = [];

    await withTenant(user.tenant_id, async (trx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // 1. Look up customer by name (case-insensitive LIKE), scoped to this
        // tenant. The explicit filter is load-bearing, not belt-and-braces:
        // withTenant() only sets app.tenant_id for the RLS policies, and RLS
        // is not actually enforced for this connection (see CLAUDE.md). Without
        // it, a fuzzy name match reaches every tenant's customer list and an
        // import could bind a shipment to someone else's customer.
        const customer = await trx
          .selectFrom('customers')
          .select(['id', 'name'])
          .where('tenant_id', '=', user.tenant_id)
          .where('name', 'ilike', `%${row.client_name}%`)
          .executeTakeFirst();

        if (!customer) {
          skipped.push({ row: i + 1, reason: 'customer not found' });
          continue;
        }

        // 2. Map port → type
        let shipmentType: string;
        if (row.port === 'JNIA') {
          shipmentType = 'AIR';
        } else if (row.port === 'Namanga' || row.port === 'TZKR') {
          shipmentType = 'ROAD';
        } else {
          shipmentType = 'SEA_FCL';
        }

        // 3. Map port_status → stage
        const statusLower = (row.port_status || '').toLowerCase().trim();
        let stage: string;
        if (statusLower === 'exited' || statusLower === 'closed') {
          stage = 'CLOSED';
        } else if (statusLower === 'to be declared' || statusLower === 'assessed') {
          stage = 'ASSESSMENT';
        } else if (statusLower === 'manifest compared') {
          stage = 'DOCS_RECEIVED';
        } else if (
          statusLower === 'received' ||
          statusLower === 'accepted' ||
          statusLower === 'verifying' ||
          statusLower === 'en route'
        ) {
          stage = 'DOCS_RECEIVED';
        } else {
          stage = 'DOCS_RECEIVED';
        }

        // 4. Generate ref_number based on current count + imported so far
        const countResult = await trx
          .selectFrom('shipment_cases')
          .select(trx.fn.count('id').as('cnt'))
          .executeTakeFirst();
        const currentCount = Number(countResult?.cnt ?? 0) + imported.length + 1;
        const refNumber = `CLR-2026-${String(currentCount).padStart(4, '0')}`;

        const now = new Date();
        const slaDeadline = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        // 5. Insert shipment case
        const shipment = await (trx as any)
          .insertInto('shipment_cases')
          .values({
            tenant_id: user.tenant_id,
            ref_number: refNumber,
            customer_id: customer.id,
            type: shipmentType,
            goods_desc: row.goods_desc || 'Imported Shipment',
            bl_number: row.bl_number || null,
            awb_number: row.awb_number || null,
            tansad_number: row.tansad_number || null,
            vessel: row.shipping_line || null,
            origin_port: '',
            dest_port: row.port || '',
            stage: stage,
            assigned_to: null,
            sla_deadline: slaDeadline,
            created_at: now,
            updated_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        // 6. Insert initial stage_history row
        await trx
          .insertInto('stage_history')
          .values({
            tenant_id: user.tenant_id,
            shipment_id: shipment.id,
            stage: stage as any,
            entered_at: now,
            actor_id: user.sub,
            note: 'Bulk import.',
          })
          .execute();

        // 7. Create BL/shipment folder in file storage
        const folderName = row.bl_number || row.awb_number || refNumber;
        MinioIntegration.ensureFolder(user.tenant_id, customer.id, folderName);

        imported.push(shipment.id);
      }
    });

    return reply.status(200).send({
      imported: imported.length,
      skipped,
    });
  });

  /**
   * POST /v1/shipments
   * Create a new shipment case
   */
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const input = request.body as CreateShipmentInput;

    try {
      // Resolve assigned_to: prefer explicit input, fall back to current user, validate the UUID exists
      const preferredAssignee = (input.assigned_to && input.assigned_to.trim() !== '')
        ? input.assigned_to
        : user.sub;

      // Verify the resolved user exists in this tenant to give a clear error instead of FK violation
      const { db } = await import('../db/client.js');
      const assigneeExists = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', preferredAssignee)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      if (!assigneeExists) {
        return reply.status(401).send({ error: 'Session expired — please log out and log back in.' });
      }

      const created = await ShipmentService.createCase(user.tenant_id, {
        ...input,
        assigned_to: preferredAssignee,
      });

      // 201 Created. This read 211, which is not a registered HTTP status at
      // all — anything checking `res.status === 201`, and any proxy or client
      // that treats an unknown 2xx conservatively, was being told something
      // meaningless about a request that had in fact created a record.
      return reply.status(201).send(created);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Failed to create shipment case' });
    }
  });

  /**
   * GET /v1/shipments/:id/workflow-runs
   *
   * Every transition attempt on THIS shipment, and the automation that ran with
   * it. The workflow-scoped view (GET /v1/workflows/:id/runs) can only show runs
   * belonging to a custom workflow — a shipment on the legacy fixed-stage system
   * has workflow_id NULL, so its runs were being recorded with nowhere to
   * surface them. This is where they surface, and it is also the view an
   * operator actually wants: "what happened to this consignment".
   */
  fastify.get('/:id/workflow-runs', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit) || 30, 1), 200);

    return withTenant(user.tenant_id, async (trx) => {
      // Tenant-scoped existence check first: without it a valid-looking id from
      // another workspace would return that workspace's automation history.
      const shipment = await trx.selectFrom('shipment_cases').select(['id', 'ref_number'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const rows = await trx.selectFrom('workflow_step_runs')
        .leftJoin('users', 'users.id', 'workflow_step_runs.actor_id')
        .leftJoin('workflows', 'workflows.id', 'workflow_step_runs.workflow_id')
        .select([
          'workflow_step_runs.id', 'workflow_step_runs.from_step_id', 'workflow_step_runs.to_step_id',
          'workflow_step_runs.to_step_name', 'workflow_step_runs.status', 'workflow_step_runs.conditions',
          'workflow_step_runs.comms', 'workflow_step_runs.error_message', 'workflow_step_runs.duration_ms',
          'workflow_step_runs.simulated', 'workflow_step_runs.created_at',
          'users.name as actor_name', 'workflows.name as workflow_name',
        ])
        .where('workflow_step_runs.tenant_id', '=', user.tenant_id)
        .where('workflow_step_runs.shipment_id', '=', id)
        .orderBy('workflow_step_runs.created_at', 'desc')
        .limit(take)
        .execute();

      return {
        data: rows.map((r) => ({
          id: r.id,
          fromStepId: r.from_step_id,
          toStepId: r.to_step_id,
          toStepName: r.to_step_name,
          status: r.status,
          conditions: parseJsonCol(r.conditions, [] as any[]),
          comms: parseJsonCol(r.comms, [] as any[]),
          errorMessage: r.error_message,
          durationMs: r.duration_ms,
          simulated: r.simulated,
          actorName: r.actor_name ?? null,
          // NULL means the shipment is on the legacy fixed-stage system, which
          // has no workflows row. Named rather than left blank.
          workflowName: r.workflow_name ?? null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
      };
    });
  });

  /**
   * PATCH /v1/shipments/:id/stage
   * Transition shipment to next stage
   */
  fastify.patch('/:id/stage', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { stage, note, blocker } = request.body as AdvanceStageInput & { stage: string };

    if (!stage) {
      return reply.status(400).send({ error: 'Missing target stage parameter' });
    }

    try {
      const result = await ShipmentService.advanceStage(
        user.tenant_id,
        id,
        stage,
        user.sub,
        note,
        blocker
      );
      
      // Notify clients of change
      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(
          JSON.stringify({
            type: 'case.status_changed',
            caseId: id,
            stage: stage,
          })
        );
      });

      return result;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Stage transition failed' });
    }
  });

  /**
   * PATCH /v1/shipments/:id
   * Update editable fields: BL, vessel, TANSAD, containers, ETA, notes, etc.
   */
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const allowed = [
      'bl_number', 'awb_number', 'tansad_number', 'vessel', 'goods_desc', 'hs_code',
      'origin_port', 'port_of_loading', 'dest_port', 'port_of_discharge',
      'eta', 'free_time_end', 'sla_deadline', 'assigned_to',
      'gross_weight_kg', 'cif_value_usd', 'container_numbers', 'internal_notes',
      'whatsapp_bot_active',
      // Key Dates panel (Shipment Detail sidebar) — editing either sends a
      // real notification to the shipment's listeners, below.
      'due_date', 'created_at',
    ];

    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of allowed) {
      if (key in body) patch[key] = key === 'due_date' || key === 'created_at' ? (body[key] ? new Date(body[key]) : null) : body[key];
    }

    if (Object.keys(patch).length === 1) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const prev = await trx.selectFrom('shipment_cases').select(['assigned_to', 'due_date', 'created_at'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();

      const updated = await trx
        .updateTable('shipment_cases')
        .set(patch)
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirst();

      if (!updated) return reply.status(404).send({ error: 'Shipment not found' });

      // Notify newly assigned user
      const newAssignee = body.assigned_to;
      if (newAssignee && newAssignee !== prev?.assigned_to && newAssignee !== user.sub) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(newAssignee);
        if (isUuid) {
          await trx.insertInto('notifications').values({
            tenant_id: user.tenant_id,
            user_id: newAssignee,
            shipment_id: id,
            type: 'shipment_assigned',
            title: `${user.name || 'Someone'} assigned you to a shipment`,
            message: updated.ref_number || id,
            link: `/clearance/${id}`,
            metadata: JSON.stringify({ shipment_id: id }),
            trigger_type: 'SHIPMENT_ASSIGNED',
            channel: 'IN_APP',
            recipient: newAssignee,
            content: `${user.name || 'Someone'} assigned you to shipment ${updated.ref_number || id}`,
            read: false, status: 'SENT', created_at: new Date(),
          } as any).execute();
        }
      }

      // Key Dates changed — notify this shipment's listeners (WhatsApp/Email/
      // in-app, per each listener's own channel choice) rather than silently
      // updating a date no one downstream ever finds out about.
      for (const [key, label] of [['due_date', 'Due date'], ['created_at', 'Created date']] as const) {
        if (key in body && String(prev?.[key] ?? '') !== String(updated[key] ?? '')) {
          NotificationService.notifyListeners(user.tenant_id, id, 'KEY_DATE_CHANGED', {
            dateLabel: label,
            newValue: updated[key] ? new Date(updated[key] as any).toLocaleDateString('en-GB') : 'cleared',
          }).catch((err) => fastify.log.error('KEY_DATE_CHANGED notify failed: %s', err.message));
        }
      }

      return updated;
    });
  });

  /**
   * GET /v1/shipments/:id/flags  — list active flags
   */
  fastify.get('/:id/flags', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const flags = await trx.selectFrom('risk_flags').selectAll().where('shipment_id', '=', id).where('resolved', '=', false).execute();
      return { data: flags };
    });
  });

  /**
   * POST /v1/shipments/:id/flags  — add a label/flag
   * body: { type: string, severity?: 'LOW'|'MEDIUM'|'HIGH' }
   */
  fastify.post('/:id/flags', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { type, severity } = request.body as { type: string; severity?: string };
    if (!type) return reply.status(400).send({ error: 'type is required' });
    return withTenant(user.tenant_id, async (trx) => {
      // idempotent — if already active, return existing
      const trxAny2 = trx as any;
      const existing = await trxAny2.selectFrom('risk_flags').selectAll()
        .where('shipment_id', '=', id).where('type', '=', type).where('resolved', '=', false)
        .executeTakeFirst();
      if (existing) return existing;
      const flag = await trx.insertInto('risk_flags').values({
        tenant_id: user.tenant_id, shipment_id: id,
        type: type as any, severity: (severity || 'MEDIUM') as any, resolved: false,
      } as any).returningAll().executeTakeFirst();
      return reply.status(201).send(flag);
    });
  });

  /**
   * DELETE /v1/shipments/:id/flags/:type  — resolve a flag
   */
  fastify.delete('/:id/flags/:flagType', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, flagType } = request.params as { id: string; flagType: string };
    return withTenant(user.tenant_id, async (trx) => {
      const trxAny = trx as any;
      await trxAny.updateTable('risk_flags')
        .set({ resolved: true, resolved_at: new Date() })
        .where('shipment_id', '=', id).where('type', '=', flagType).where('resolved', '=', false)
        .execute();
      return reply.status(204).send();
    });
  });

  /**
   * POST /v1/shipments/:id/sync-tracking
   * Fetch BL/AWB tracking data and write back origin_port, dest_port, eta, vessel
   */
  fastify.post('/:id/sync-tracking', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const shipment = await ShipmentService.getById(user.tenant_id, id);
    if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

    const trackingNumber = shipment.awb_number || shipment.bl_number;
    if (!trackingNumber) return reply.status(400).send({ error: 'No BL or AWB number on this shipment' });

    const normalized = trackingNumber.trim().toUpperCase().replace(/\s/g, '');
    const resolvedType: 'AWB' | 'BL' = shipment.awb_number ? 'AWB' : 'BL';

    // Load API keys from tenant settings
    let shipsgoKey: string | null = null;
    let ship24Key:  string | null = null;
    try {
      const setting = await db
        .selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (setting) {
        const s = typeof setting.settings === 'string' ? JSON.parse(setting.settings) : setting.settings as any;
        shipsgoKey = s?.['int-shipsgo']?.shipsgo_api_key ?? null;
        ship24Key  = s?.['int-shipsgo']?.ship24_api_key  ?? null;
      }
    } catch { /* fall through to mock */ }

    let result: any = null;
    if (shipsgoKey && resolvedType === 'BL') result = await trackViaShipsGo(normalized, shipsgoKey);
    if (!result && ship24Key) result = await trackViaShip24(normalized, ship24Key);
    if (!result) result = buildMockResult(normalized, resolvedType);

    // Write back to shipment_cases
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('shipment_cases')
        .set({
          origin_port: result.origin_name ?? shipment.origin_port,
          dest_port:   result.dest_name   ?? shipment.dest_port,
          vessel:      result.vessel_name  ?? shipment.vessel,
          eta:         result.eta ? new Date(result.eta) : (shipment.eta ? new Date(shipment.eta) : null),
          updated_at:  new Date(),
        })
        .where('id', '=', id)
        .execute();

      // Persist snapshot
      await trx.insertInto('tracking_snapshots').values({
        tenant_id:        user.tenant_id,
        shipment_id:      id,
        tracking_type:    result.tracking_type,
        tracking_number:  normalized,
        carrier:          result.carrier ?? null,
        origin_name:      result.origin_name ?? null,
        origin_code:      result.origin_code ?? null,
        dest_name:        result.dest_name   ?? null,
        dest_code:        result.dest_code   ?? null,
        current_location: result.current_location ?? null,
        status:           result.status ?? null,
        status_code:      result.status_code ?? null,
        eta:              result.eta ?? null,
        progress_pct:     result.progress_pct ?? 0,
        events:           JSON.stringify(result.events ?? []),
        created_by:       user.sub,
      }).execute();

      return result;
    });
  });

  /**
   * Looks up a Products & Services catalog entry (tenant-scoped) and returns
   * the fields to snapshot onto a task/time-entry — name/rate/currency/unit
   * are copied at link time rather than trusting whatever the client sent,
   * since these numbers back real billing.
   */
  async function snapshotProduct(trx: any, tenantId: string, productId: string | null | undefined) {
    if (!productId) return { product_id: null, service_name: null, service_rate: null, service_currency: null, service_unit: null };
    const product = await trx.selectFrom('products').selectAll()
      .where('id', '=', productId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!product) return { product_id: null, service_name: null, service_rate: null, service_currency: null, service_unit: null };
    return {
      product_id: product.id, service_name: product.name,
      service_rate: product.sale_price, service_currency: product.currency, service_unit: product.unit,
    };
  }

  /**
   * GET /v1/shipments/:id/tasks
   */
  fastify.get('/:id/tasks', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const tasks = await trx.selectFrom('shipment_tasks').selectAll().where('shipment_id', '=', id).orderBy('created_at', 'asc').execute();
      return { data: tasks };
    });
  });

  /**
   * POST /v1/shipments/:id/tasks
   */
  fastify.post('/:id/tasks', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { title, priority, assigned_to, due_date, note, product_id } = request.body as any;
    if (!title) return reply.status(400).send({ error: 'title is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const snapshot = await snapshotProduct(trx, user.tenant_id, product_id);
      const task = await trx.insertInto('shipment_tasks').values({
        tenant_id: user.tenant_id, shipment_id: id,
        title, status: 'open', priority: priority || 'medium',
        assigned_to: assigned_to || null, due_date: due_date || null, note: note || null,
        created_by: user.name || user.sub,
        created_at: new Date(), updated_at: new Date(),
        ...snapshot,
      }).returningAll().executeTakeFirstOrThrow();

      // Notify assigned user (skip self-assign)
      if (assigned_to && assigned_to !== user.sub) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(assigned_to);
        if (isUuid) {
          await trx.insertInto('notifications').values({
            tenant_id: user.tenant_id,
            user_id: assigned_to,
            shipment_id: id,
            type: 'task_assigned',
            title: `${user.name || 'Someone'} assigned you a task`,
            message: title,
            link: `/clearance/${id}?tab=tasks`,
            metadata: JSON.stringify({ task_id: task.id }),
            trigger_type: 'TASK_ASSIGNED',
            channel: 'IN_APP',
            recipient: assigned_to,
            content: `${user.name || 'Someone'} assigned you a task: ${title}`,
            read: false, status: 'SENT', created_at: new Date(),
          } as any).execute();
        }
      }

      return task;
    });
  });

  /**
   * GET /v1/shipments/:id/listeners
   * Staff/customer contacts tagged to this shipment for notifications
   * ("Tag Staff" / "Add Customer" on the Shipment Detail sidebar).
   */
  fastify.get('/:id/listeners', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('shipment_listeners').selectAll()
        .where('shipment_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc').execute();
      return { data: rows.map((l) => ({ ...l, channels: typeof l.channels === 'string' ? JSON.parse(l.channels) : l.channels })) };
    });
  });

  /**
   * POST /v1/shipments/:id/listeners
   * Tags one or more staff/customer contacts. Body: { type: 'internal'|'customer',
   * people: [{ id?, name, role? }], channels: string[] }. Re-assigning who's
   * tagged/notified is a management decision — same role gate as PATCH /:id.
   */
  fastify.post('/:id/listeners', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { type, people, channels } = request.body as { type: 'internal' | 'customer'; people: { id?: string; name: string; role?: string }[]; channels: string[] };
    if (type !== 'internal' && type !== 'customer') return reply.status(400).send({ error: 'type must be internal or customer' });
    if (!Array.isArray(people) || people.length === 0) return reply.status(400).send({ error: 'people is required' });
    const isUuid = (val?: string) => !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.insertInto('shipment_listeners').values(
        people.map((p) => ({
          tenant_id: user.tenant_id, shipment_id: id, type,
          user_id: isUuid(p.id) ? p.id! : null, name: p.name, role: p.role || null,
          channels: JSON.stringify(channels || []), created_by: user.sub,
        }))
      ).returningAll().execute();
      return { data: rows.map((l) => ({ ...l, channels: typeof l.channels === 'string' ? JSON.parse(l.channels) : l.channels })) };
    });
  });

  /**
   * PATCH /v1/shipments/:id/listeners/:listenerId
   * Updates a single listener's notification channel preferences. Body: { channels: string[] }.
   */
  fastify.patch('/:id/listeners/:listenerId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { id, listenerId } = request.params as { id: string; listenerId: string };
    const { channels } = request.body as { channels: string[] };
    if (!Array.isArray(channels)) return reply.status(400).send({ error: 'channels must be an array' });
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('shipment_listeners')
        .set({ channels: JSON.stringify(channels) })
        .where('id', '=', listenerId).where('shipment_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Listener not found' });
      return { ...row, channels: typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels };
    });
  });

  /**
   * PATCH /v1/shipments/:id/tasks/:taskId
   */
  fastify.patch('/:id/tasks/:taskId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    const body = request.body as any;
    const patch: Record<string, any> = { updated_at: new Date() };
    for (const k of ['title', 'status', 'priority', 'assigned_to', 'due_date', 'note', 'description', 'labels', 'cover_color']) {
      if (k in body) patch[k] = k === 'labels' ? JSON.stringify(body[k]) : body[k];
    }
    return withTenant(user.tenant_id, async (trx) => {
      if ('product_id' in body) Object.assign(patch, await snapshotProduct(trx, user.tenant_id, body.product_id));
      const t = await trx.updateTable('shipment_tasks').set(patch).where('id', '=', taskId).returningAll().executeTakeFirst();
      if (!t) return reply.status(404).send({ error: 'Task not found' });
      return t;
    });
  });

  /**
   * DELETE /v1/shipments/:id/tasks/:taskId
   */
  fastify.delete('/:id/tasks/:taskId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('shipment_tasks').where('id', '=', taskId).execute();
      return reply.status(204).send();
    });
  });

  /**
   * GET /v1/shipments/:id/team
   * Returns tenant users for @mention autocomplete
   */
  fastify.get('/:id/team', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const members = await trx
        .selectFrom('users')
        .select(['id', 'name', 'email', 'role'])
        .where('active', '=', true)
        .orderBy('name', 'asc')
        .execute();
      return { data: members };
    });
  });

  /**
   * GET /v1/shipments/:id/tasks/:taskId/comments
   */
  fastify.get('/:id/tasks/:taskId/comments', async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const comments = await trx
        .selectFrom('task_comments')
        .selectAll()
        .where('task_id', '=', taskId)
        .orderBy('created_at', 'asc')
        .execute();
      return { data: comments };
    });
  });

  /**
   * POST /v1/shipments/:id/tasks/:taskId/comments
   * Body: { content: string, mentions: [{user_id, name}] }
   * Creates notifications for every @mentioned user.
   */
  fastify.post('/:id/tasks/:taskId/comments', async (request, reply) => {
    const user = request.user;
    const { id: shipmentId, taskId } = request.params as { id: string; taskId: string };
    const { content, mentions = [] } = request.body as { content: string; mentions: { user_id: string; name: string }[] };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });

    return withTenant(user.tenant_id, async (trx) => {
      const comment = await trx
        .insertInto('task_comments')
        .values({
          tenant_id: user.tenant_id,
          task_id:    taskId,
          shipment_id: shipmentId,
          author_id:   user.sub,
          author_name: user.name || user.email,
          content:     content.trim(),
          mentions:    JSON.stringify(mentions),
          created_at:  new Date(),
          updated_at:  new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Notify each mentioned user (skip self-mentions)
      for (const m of mentions) {
        if (m.user_id === user.sub) continue;
        await trx.insertInto('notifications').values({
          tenant_id:    user.tenant_id,
          user_id:      m.user_id,
          shipment_id:  shipmentId,
          type:         'mention',
          title:        `${user.name || 'Someone'} mentioned you in a task`,
          message:      content.trim().slice(0, 150),
          link:         `/clearance/${shipmentId}?tab=tasks`,
          metadata:     JSON.stringify({ task_id: taskId, comment_id: comment.id, mention_type: 'task_comment' }),
          channel:      'IN_APP',
          customer_id:  null,
          trigger_type: 'MENTION',
          recipient:    m.user_id,
          content:      `${user.name || 'Someone'} mentioned you in a task comment`,
          read:         false,
          status:       'SENT',
          created_at:   new Date(),
        } as any).execute();
      }

      return comment;
    });
  });

  /**
   * DELETE /v1/shipments/:id/tasks/:taskId/comments/:commentId
   * Author or admin/manager can delete.
   */
  fastify.delete('/:id/tasks/:taskId/comments/:commentId', async (request, reply) => {
    const user = request.user;
    const { taskId, commentId } = request.params as { id: string; taskId: string; commentId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const comment = await trx
        .selectFrom('task_comments')
        .select(['id', 'author_id'])
        .where('id', '=', commentId)
        .executeTakeFirst();
      if (!comment) return reply.status(404).send({ error: 'Comment not found' });
      const canDelete = comment.author_id === user.sub ||
        ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TENANT_ADMIN'].includes(user.role);
      if (!canDelete) return reply.status(403).send({ error: 'Forbidden' });
      await trx.deleteFrom('task_comments').where('id', '=', commentId).execute();
      return reply.status(204).send();
    });
  });

  /**
   * GET /v1/shipments/:id/tasks/:taskId
   * Full task detail with checklists + items embedded
   */
  fastify.get('/:id/tasks/:taskId', async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const task = await trx.selectFrom('shipment_tasks').selectAll().where('id', '=', taskId).executeTakeFirst();
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      const checklists = await trx
        .selectFrom('task_checklists')
        .selectAll()
        .where('task_id', '=', taskId)
        .orderBy('position', 'asc')
        .execute();
      const items = checklists.length > 0
        ? await trx.selectFrom('task_checklist_items').selectAll()
            .where('checklist_id', 'in', checklists.map(c => c.id))
            .orderBy('position', 'asc').execute()
        : [];
      const itemsByChecklist = new Map<string, any[]>();
      for (const item of items) {
        const arr = itemsByChecklist.get(item.checklist_id) ?? [];
        arr.push(item);
        itemsByChecklist.set(item.checklist_id, arr);
      }
      return {
        ...task,
        labels: typeof task.labels === 'string' ? JSON.parse(task.labels) : (task.labels || []),
        checklists: checklists.map(c => ({ ...c, items: itemsByChecklist.get(c.id) || [] })),
      };
    });
  });

  /**
   * POST /v1/shipments/:id/tasks/:taskId/checklists
   */
  fastify.post('/:id/tasks/:taskId/checklists', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { taskId } = request.params as { id: string; taskId: string };
    const { title = 'Checklist' } = request.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const count = await trx.selectFrom('task_checklists').select(trx.fn.countAll().as('n')).where('task_id', '=', taskId).executeTakeFirst();
      const position = Number((count as any)?.n ?? 0);
      const cl = await trx.insertInto('task_checklists').values({
        tenant_id: user.tenant_id, task_id: taskId, title, position, created_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      return { ...cl, items: [] };
    });
  });

  /**
   * DELETE /v1/shipments/:id/tasks/:taskId/checklists/:checklistId
   */
  fastify.delete('/:id/tasks/:taskId/checklists/:checklistId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { checklistId } = request.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('task_checklists').where('id', '=', checklistId).execute();
      return reply.status(204).send();
    });
  });

  /**
   * POST /v1/shipments/:id/tasks/:taskId/checklists/:checklistId/items
   */
  fastify.post('/:id/tasks/:taskId/checklists/:checklistId/items', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { taskId, checklistId } = request.params as any;
    const { title } = request.body as any;
    if (!title?.trim()) return reply.status(400).send({ error: 'title is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const count = await trx.selectFrom('task_checklist_items').select(trx.fn.countAll().as('n')).where('checklist_id', '=', checklistId).executeTakeFirst();
      const position = Number((count as any)?.n ?? 0);
      const item = await trx.insertInto('task_checklist_items').values({
        checklist_id: checklistId, task_id: taskId, title: title.trim(),
        completed: false, position, created_at: new Date(), updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      return item;
    });
  });

  /**
   * PATCH /v1/shipments/:id/tasks/:taskId/checklists/:checklistId/items/:itemId
   */
  fastify.patch('/:id/tasks/:taskId/checklists/:checklistId/items/:itemId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { itemId } = request.params as any;
    const body = request.body as any;
    const patch: Record<string, any> = { updated_at: new Date() };
    if ('title' in body) patch.title = body.title;
    if ('completed' in body) {
      patch.completed = body.completed;
      patch.completed_by = body.completed ? (user.name || user.sub) : null;
      patch.completed_at = body.completed ? new Date() : null;
    }
    if ('assigned_to' in body) patch.assigned_to = body.assigned_to;
    if ('due_date' in body) patch.due_date = body.due_date;
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.updateTable('task_checklist_items').set(patch).where('id', '=', itemId).returningAll().executeTakeFirst();
      if (!item) return reply.status(404).send({ error: 'Item not found' });
      return item;
    });
  });

  /**
   * DELETE /v1/shipments/:id/tasks/:taskId/checklists/:checklistId/items/:itemId
   */
  fastify.delete('/:id/tasks/:taskId/checklists/:checklistId/items/:itemId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { itemId } = request.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('task_checklist_items').where('id', '=', itemId).execute();
      return reply.status(204).send();
    });
  });

  /**
   * GET /v1/shipments/:id/time-entries
   */
  fastify.get('/:id/time-entries', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const entries = await trx.selectFrom('shipment_time_entries').selectAll().where('shipment_id', '=', id).orderBy('log_date', 'asc').execute();
      return { data: entries };
    });
  });

  /**
   * POST /v1/shipments/:id/time-entries
   */
  fastify.post('/:id/time-entries', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { member, task_ref, hours, note, log_date, product_id } = request.body as any;
    if (!hours) return reply.status(400).send({ error: 'hours is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const snapshot = await snapshotProduct(trx, user.tenant_id, product_id);
      const entry = await trx.insertInto('shipment_time_entries').values({
        tenant_id: user.tenant_id, shipment_id: id,
        member: member || user.name || 'Officer',
        task_ref: task_ref || null,
        hours: Number(hours),
        note: note || null,
        log_date: log_date ? new Date(log_date) : new Date(),
        created_at: new Date(),
        ...snapshot,
      }).returningAll().executeTakeFirstOrThrow();
      return entry;
    });
  });

  /**
   * GET /v1/shipments/:id/ledger
   */
  fastify.get('/:id/ledger', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const entries = await trx.selectFrom('expenses').selectAll().where('tenant_id', '=', user.tenant_id).where('shipment_id', '=', id).orderBy('created_at', 'asc').execute();
      return { data: entries };
    });
  });

  /**
   * POST /v1/shipments/:id/ledger
   */
  fastify.post('/:id/ledger', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { description, amount, currency, type, category, ref, charge_head } = request.body as any;
    if (!description || !amount) return reply.status(400).send({ error: 'description and amount are required' });
    return withTenant(user.tenant_id, async (trx) => {
      const entry = await trx.insertInto('expenses').values({
        tenant_id: user.tenant_id, shipment_id: id,
        label: description,
        amount_tzs: Number(amount),
        is_revenue: type === 'payment',
        category: (category || 'CLEARANCE') as any,
        // The landed-cost card this actual belongs under. Whitelisted rather
        // than stored as given: variance is only computable while actuals and
        // estimates share one vocabulary, and a free-text head would quietly
        // create a bucket nothing is ever compared against.
        charge_head: CHARGE_HEADS.includes(charge_head) ? charge_head : null,
        recorded_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      // A recorded cost is the only moment the estimate can be scored against
      // reality. Emitted rather than checked inline so ClearOS's ledger does
      // not need to know that FinOps, or anything else, cares — the subscriber
      // decides whether the gap is worth anyone's attention.
      if (!entry.is_revenue) {
        emitDomainEvent(trx, user.tenant_id, {
          type: 'shipment.cost_recorded',
          sourceApp: 'finops',
          entityType: 'shipment',
          entityId: id,
          payload: { expenseId: entry.id, chargeHead: entry.charge_head, amountTzs: Number(entry.amount_tzs) },
        });
      }
      return entry;
    });
  });

  /**
   * GET /v1/shipments/:id/timeline
   * Timeline endpoint combining stage history and update messages
   */
  fastify.get('/:id/timeline', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const history = await trx
        .selectFrom('stage_history')
        .selectAll()
        .where('shipment_id', '=', id)
        .orderBy('entered_at', 'asc')
        .execute();

      const messages = await trx
        .selectFrom('case_messages')
        .selectAll()
        .where('shipment_id', '=', id)
        .orderBy('created_at', 'asc')
        .execute();

      return {
        stage_history: history,
        messages: messages,
      };
    });
  });

  /**
   * POST /v1/shipments/:id/messages
   * Send outbound WhatsApp message/note and log it on the timeline
   */
  fastify.post('/:id/messages', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { content, channel } = request.body as { content: string; channel: string };

    if (!content) {
      return reply.status(400).send({ error: 'Message content is required' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const shipment = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!shipment) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      const customer = await trx
        .selectFrom('customers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('id', '=', shipment.customer_id)
        .executeTakeFirst();

      // Determine author type
      const isOfficer = user.role !== 'CUSTOMER';
      const authorType = isOfficer ? 'OFFICER' : 'CUSTOMER';

      // Record first reply metrics if officer is replying for the first time
      let firstReplyFields: any = {};
      if (isOfficer && !shipment.first_reply_at) {
        const firstReplyAt = new Date();
        const firstReplySec = Math.floor((firstReplyAt.getTime() - new Date(shipment.created_at).getTime()) / 1000);
        firstReplyFields = {
          first_reply_at: firstReplyAt,
          first_reply_time_seconds: firstReplySec,
        };

        await trx
          .updateTable('shipment_cases')
          .set(firstReplyFields)
          .where('id', '=', id)
          .execute();
      }

      const newMessage = await trx
        .insertInto('case_messages')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          author_id: user.sub,
          author_name: user.name || user.email || 'Unknown',
          author_type: authorType,
          channel: (channel || 'WHATSAPP') as any,
          direction: isOfficer ? 'OUTBOUND' : 'INBOUND',
          content,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Trigger multichannel routing
      const cleanCh = (channel || 'WHATSAPP').toUpperCase();
      if (isOfficer) {
        if (cleanCh === 'WHATSAPP' && customer?.phone_wa) {
          await WhatsAppIntegration.sendMessage(customer.phone_wa, content);
        } else if (cleanCh === 'EMAIL' && customer?.email) {
          await EmailIntegration.sendEmail({
            to: customer.email,
            subject: `Support Ticket Response - Shipment Case #${shipment.ref_number}`,
            bodyHtml: `<p>${content.replace(/\n/g, '<br>')}</p>`,
            tenantId: user.tenant_id,
          });
        }
      }

      // Broadcast websocket message
      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(
          JSON.stringify({
            type: 'case.update_posted',
            caseId: id,
            message: content,
          })
        );
      });

      NotificationService.notifyListeners(user.tenant_id, id, 'MESSAGE_RECEIVED', {
        messageContent: content,
      }).catch(console.error);

      return newMessage;
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Internal Notes
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/notes', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const notes = await trx.selectFrom('shipment_notes').selectAll()
        .where('shipment_id', '=', id).orderBy('created_at', 'asc').execute();
      return { data: notes };
    });
  });

  fastify.post('/:id/notes', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const note = await trx.insertInto('shipment_notes').values({
        tenant_id: user.tenant_id,
        shipment_id: id,
        author_id: user.sub,
        author_name: user.name || user.email,
        content: content.trim(),
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      return note;
    });
  });

  fastify.patch('/:id/notes/:noteId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, noteId } = request.params as { id: string; noteId: string };
    const { content } = request.body as { content: string };
    if (!content?.trim()) return reply.status(400).send({ error: 'content is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('shipment_notes').select(['id', 'author_id'])
        .where('id', '=', noteId).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Note not found' });
      const canEdit = existing.author_id === user.sub ||
        ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canEdit) return reply.status(403).send({ error: 'Forbidden' });
      const updated = await trx.updateTable('shipment_notes')
        .set({ content: content.trim(), updated_at: new Date() })
        .where('id', '=', noteId)
        .returningAll().executeTakeFirst();
      return updated;
    });
  });

  fastify.delete('/:id/notes/:noteId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, noteId } = request.params as { id: string; noteId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('shipment_notes').select(['id', 'author_id'])
        .where('id', '=', noteId).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Note not found' });
      const canDelete = existing.author_id === user.sub ||
        ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
      if (!canDelete) return reply.status(403).send({ error: 'Forbidden' });
      await trx.deleteFrom('shipment_notes').where('id', '=', noteId).execute();
      return reply.status(204).send();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Tags
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/tags', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('shipment_cases').select(['tags'])
        .where('id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Shipment not found' });
      const tags: string[] = Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]');
      return { tags };
    });
  });

  fastify.post('/:id/tags', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { tag } = request.body as { tag: string };
    if (!tag?.trim()) return reply.status(400).send({ error: 'tag is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('shipment_cases').select(['tags'])
        .where('id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Shipment not found' });
      const existing: string[] = Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]');
      const trimmed = tag.trim();
      if (existing.includes(trimmed)) return { tags: existing };
      const newTags = [...existing, trimmed];
      await trx.updateTable('shipment_cases').set({ tags: JSON.stringify(newTags), updated_at: new Date() }).where('id', '=', id).execute();
      return { tags: newTags };
    });
  });

  fastify.delete('/:id/tags/:tag', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, tag } = request.params as { id: string; tag: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('shipment_cases').select(['tags'])
        .where('id', '=', id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Shipment not found' });
      const existing: string[] = Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]');
      const newTags = existing.filter(t => t !== decodeURIComponent(tag));
      await trx.updateTable('shipment_cases').set({ tags: JSON.stringify(newTags), updated_at: new Date() }).where('id', '=', id).execute();
      return { tags: newTags };
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Participant Customers
  // ═══════════════════════════════════════════════════════════════

  fastify.get('/:id/participant-customers', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx
        .selectFrom('shipment_participant_customers as spc')
        .innerJoin('customers as c', 'c.id', 'spc.customer_id')
        .select(['spc.id', 'spc.customer_id', 'spc.wa_enabled', 'spc.created_at', 'c.name', 'c.phone_wa', 'c.email', 'c.phone'])
        .where('spc.shipment_id', '=', id)
        .orderBy('spc.created_at', 'asc')
        .execute();
      return { data: rows };
    });
  });

  fastify.post('/:id/participant-customers', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { customer_id } = request.body as { customer_id: string };
    if (!customer_id) return reply.status(400).send({ error: 'customer_id is required' });
    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('shipment_participant_customers').values({
        tenant_id: user.tenant_id,
        shipment_id: id,
        customer_id,
        added_by: user.sub,
        wa_enabled: true,
        created_at: new Date(),
      }).onConflict(oc => oc.columns(['shipment_id', 'customer_id']).doNothing()).execute();
      const rows = await trx
        .selectFrom('shipment_participant_customers as spc')
        .innerJoin('customers as c', 'c.id', 'spc.customer_id')
        .select(['spc.id', 'spc.customer_id', 'spc.wa_enabled', 'spc.created_at', 'c.name', 'c.phone_wa', 'c.email', 'c.phone'])
        .where('spc.shipment_id', '=', id)
        .orderBy('spc.created_at', 'asc')
        .execute();
      return { data: rows };
    });
  });

  fastify.patch('/:id/participant-customers/:customerId/wa', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, customerId } = request.params as { id: string; customerId: string };
    const { wa_enabled } = request.body as { wa_enabled: boolean };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('shipment_participant_customers')
        .set({ wa_enabled })
        .where('shipment_id', '=', id)
        .where('customer_id', '=', customerId)
        .execute();
      return { ok: true };
    });
  });

  fastify.delete('/:id/participant-customers/:customerId', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id, customerId } = request.params as { id: string; customerId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('shipment_participant_customers')
        .where('shipment_id', '=', id)
        .where('customer_id', '=', customerId)
        .execute();
      return reply.status(204).send();
    });
  });

  /**
   * GET /v1/shipments/metrics
   * Calculates support metrics for bliss command dashboard
   */
  fastify.get('/metrics', async (request, reply) => {
    const user = request.user;
    const { period } = request.query as { period?: '7d' | '30d' | '90d' };

    return withTenant(user.tenant_id, async (trx) => {
      let days = 30;
      if (period === '7d') days = 7;
      if (period === '90d') days = 90;
      const cutoff = new Date(Date.now() - days * 86400000);

      const cases = await trx
        .selectFrom('shipment_cases')
        .selectAll()
        .where('created_at', '>=', cutoff)
        .execute();

      const total = cases.length;
      const open = cases.filter(c => c.stage !== 'CLOSED').length;
      const closed = cases.filter(c => c.stage === 'CLOSED').length;

      // NPS calculation
      const surveyCases = cases.filter(c => c.nps_score !== null && c.nps_score !== undefined);
      const totalNpsCount = surveyCases.length;
      let npsScore = 0;
      let promoters = 0;
      let passives = 0;
      let detractors = 0;

      if (totalNpsCount > 0) {
        const promoterCount = surveyCases.filter(c => c.nps_score! >= 9).length;
        const passiveCount = surveyCases.filter(c => c.nps_score! >= 7 && c.nps_score! <= 8).length;
        const detractorCount = surveyCases.filter(c => c.nps_score! <= 6).length;

        promoters = Math.round((promoterCount / totalNpsCount) * 100);
        passives = Math.round((passiveCount / totalNpsCount) * 100);
        detractors = Math.round((detractorCount / totalNpsCount) * 100);
        npsScore = promoters - detractors;
      }

      // CSAT average
      const csatCases = cases.filter(c => c.csat_score !== null && c.csat_score !== undefined);
      const totalCsatCount = csatCases.length;
      let csatAvg = 0;
      if (totalCsatCount > 0) {
        const sum = csatCases.reduce((acc, c) => acc + c.csat_score!, 0);
        csatAvg = Number((sum / totalCsatCount).toFixed(1));
      }

      // Avg First Reply
      const replyCases = cases.filter(c => c.first_reply_time_seconds !== null && c.first_reply_time_seconds !== undefined);
      let avgFirstReply = 0;
      if (replyCases.length > 0) {
        const sum = replyCases.reduce((acc, c) => acc + c.first_reply_time_seconds!, 0);
        avgFirstReply = Number((sum / replyCases.length / 3600).toFixed(1));
      }

      // Avg Solve Time
      const solveCases = cases.filter(c => c.resolution_time_seconds !== null && c.resolution_time_seconds !== undefined);
      let avgSolveTime = 0;
      if (solveCases.length > 0) {
        const sum = solveCases.reduce((acc, c) => acc + c.resolution_time_seconds!, 0);
        avgSolveTime = Number((sum / solveCases.length / 3600).toFixed(1));
      }

      // SLA Compliance
      let slaCompliantCount = 0;
      let slaEvaluatedCount = 0;
      for (const c of cases) {
        if (c.sla_deadline) {
          slaEvaluatedCount++;
          const deadlineTime = new Date(c.sla_deadline).getTime();
          const resolutionTime = c.resolved_at ? new Date(c.resolved_at).getTime() : Date.now();
          if (resolutionTime <= deadlineTime) {
            slaCompliantCount++;
          }
        }
      }
      const slaCompliance = slaEvaluatedCount > 0 ? Number(((slaCompliantCount / slaEvaluatedCount) * 100).toFixed(1)) : 100;

      // Defect rate
      const defectCount = cases.filter(c => {
        return c.sla_deadline && c.resolved_at && new Date(c.resolved_at).getTime() > new Date(c.sla_deadline).getTime();
      }).length;
      const defectRate = total > 0 ? Number(((defectCount / total) * 100).toFixed(1)) : 0;

      // Daily volume (last 14 days)
      const dailyBars: number[] = [];
      for (let i = 13; i >= 0; i--) {
        const dayStart = new Date(Date.now() - i * 86400000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const dayCount = cases.filter(c => {
          const cDate = new Date(c.created_at);
          return cDate >= dayStart && cDate < dayEnd;
        }).length;
        dailyBars.push(dayCount);
      }

      return {
        total,
        open,
        closed,
        nps: {
          score: npsScore,
          promoters,
          passives,
          detractors,
          total: totalNpsCount,
        },
        csat: csatAvg || 4.5,
        firstReply: avgFirstReply || 1.5,
        resolution: avgSolveTime || 5.0,
        sla: slaCompliance,
        defect: defectRate || 2.5,
        dailyBars,
      };
    });
  });

  /**
   * PATCH /v1/shipments/:id/feedback
   * Save customer support feedback metrics (NPS / CSAT)
   */
  fastify.patch('/:id/feedback', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { nps_score, csat_score, feedback_text } = request.body as { nps_score?: number; csat_score?: number; feedback_text?: string };

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx
        .selectFrom('shipment_cases')
        .select(['id'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.status(404).send({ error: 'Shipment case not found' });
      }

      await trx
        .updateTable('shipment_cases')
        .set({
          nps_score: nps_score !== undefined ? nps_score : null,
          csat_score: csat_score !== undefined ? csat_score : null,
          feedback_text: feedback_text || null,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();

      return { success: true };
    });
  });

  /**
   * POST /v1/shipments/:id/co2
   * Calculate and save CO2 emissions
   */
  fastify.post('/:id/co2', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Partial<{
      origin: string; destination: string; weight_kg: number; mode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL';
    }>;

    // Pull straight from the shipment's own stored fields — a caller only
    // needs to override something if the auto-derived value is wrong, not
    // re-type origin/destination/weight that the shipment already has.
    let { origin, destination, weight_kg, mode } = body;
    if (!origin || !destination || !weight_kg || !mode) {
      const shipment = await withTenant(user.tenant_id, (trx) =>
        trx.selectFrom('shipment_cases')
          .select(['type', 'origin_port', 'dest_port', 'port_of_loading', 'port_of_discharge', 'gross_weight_kg'])
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst()
      );
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });
      origin      = origin      ?? shipment.port_of_loading   ?? shipment.origin_port ?? undefined;
      destination = destination ?? shipment.port_of_discharge ?? shipment.dest_port   ?? undefined;
      weight_kg   = weight_kg   ?? (shipment.gross_weight_kg ? Number(shipment.gross_weight_kg) : undefined);
      mode        = mode        ?? (shipment.type === 'AIR' ? 'AIR' : shipment.type === 'ROAD' ? 'ROAD' : shipment.type === 'RAIL' ? 'RAIL' : 'SEA');
    }

    if (!origin || !destination || !weight_kg) {
      return reply.status(400).send({ error: 'This shipment is missing origin, destination, or gross weight — add those on the Edit page first, or provide them for a one-off calculation.' });
    }

    try {
      const result = await co2Service.calculateForShipment(user.tenant_id, id, {
        origin, destination, weight_kg, mode
      });
      return result;
    } catch (err: any) {
      if (err?.message?.startsWith('Could not resolve')) {
        return reply.status(400).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to calculate CO2 emissions' });
    }
  });
}
