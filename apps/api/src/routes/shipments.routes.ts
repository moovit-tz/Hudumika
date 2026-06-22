import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { ShipmentService } from '../services/shipment.service.js';
import { requireRole } from '../middleware/rbac.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import type { CreateShipmentInput, AdvanceStageInput, ClearanceStage } from '@clearos/types';

export async function shipmentRoutes(fastify: FastifyInstance) {
  // Enforce authentication on all routes in this file
  fastify.addHook('preHandler', fastify.authenticate);

  /**
   * GET /v1/shipments
   * Fetch shipments with filters, tenant-scoped, and role-scoped
   */
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('shipment_cases').selectAll();

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
        q = q.where('stage', '=', query.stage as ClearanceStage);
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
          ])
        );
      }

      const list = await q.orderBy('created_at', 'desc').execute();

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

    return shipment;
  });

  /**
   * POST /v1/shipments
   * Create a new shipment case
   */
  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const input = request.body as CreateShipmentInput;

    try {
      const created = await ShipmentService.createCase(user.tenant_id, {
        ...input,
        assigned_to: user.role === 'OFFICER' ? user.sub : input.assigned_to || user.sub,
      });

      return reply.status(211).send(created); // Return created shipment
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Failed to create shipment case' });
    }
  });

  /**
   * PATCH /v1/shipments/:id/stage
   * Transition shipment to next stage
   */
  fastify.patch('/:id/stage', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { stage, note, blocker } = request.body as AdvanceStageInput & { stage: ClearanceStage };

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
  fastify.patch('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const allowed = [
      'bl_number', 'awb_number', 'tansad_number', 'vessel', 'goods_desc', 'hs_code',
      'origin_port', 'port_of_loading', 'dest_port', 'port_of_discharge',
      'eta', 'free_time_end', 'sla_deadline', 'assigned_to',
      'gross_weight_kg', 'cif_value_usd', 'container_numbers', 'internal_notes',
    ];

    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 1) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx
        .updateTable('shipment_cases')
        .set(patch)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      if (!updated) return reply.status(404).send({ error: 'Shipment not found' });
      return updated;
    });
  });

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
    const { title, priority, assigned_to, due_date, note } = request.body as any;
    if (!title) return reply.status(400).send({ error: 'title is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const task = await trx.insertInto('shipment_tasks').values({
        tenant_id: user.tenant_id, shipment_id: id,
        title, status: 'open', priority: priority || 'medium',
        assigned_to: assigned_to || null, due_date: due_date || null, note: note || null,
        created_by: user.name || user.sub,
        created_at: new Date(), updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
      return task;
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
    for (const k of ['title', 'status', 'priority', 'assigned_to', 'due_date', 'note']) {
      if (k in body) patch[k] = body[k];
    }
    return withTenant(user.tenant_id, async (trx) => {
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
    const { member, task_ref, hours, note, log_date } = request.body as any;
    if (!hours) return reply.status(400).send({ error: 'hours is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const entry = await trx.insertInto('shipment_time_entries').values({
        tenant_id: user.tenant_id, shipment_id: id,
        member: member || user.name || 'Officer',
        task_ref: task_ref || null,
        hours: Number(hours),
        note: note || null,
        log_date: log_date ? new Date(log_date) : new Date(),
        created_at: new Date(),
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
      const entries = await trx.selectFrom('expenses').selectAll().where('shipment_id', '=', id).orderBy('created_at', 'asc').execute();
      return { data: entries };
    });
  });

  /**
   * POST /v1/shipments/:id/ledger
   */
  fastify.post('/:id/ledger', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { description, amount, currency, type, category, ref } = request.body as any;
    if (!description || !amount) return reply.status(400).send({ error: 'description and amount are required' });
    return withTenant(user.tenant_id, async (trx) => {
      const entry = await trx.insertInto('expenses').values({
        tenant_id: user.tenant_id, shipment_id: id,
        label: description,
        amount_tzs: Number(amount),
        is_revenue: type === 'payment',
        category: (category || 'CLEARANCE') as any,
        recorded_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
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
    const { content, channel } = request.body as { content: string; channel: 'WHATSAPP' | 'IN_APP' | 'SYSTEM' };

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
        .where('id', '=', shipment.customer_id)
        .executeTakeFirst();

      const newMessage = await trx
        .insertInto('case_messages')
        .values({
          tenant_id: user.tenant_id,
          shipment_id: id,
          author_id: user.sub,
          author_name: user.name,
          author_type: 'OFFICER',
          channel: channel || 'WHATSAPP',
          direction: 'OUTBOUND',
          content,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Trigger simulation/Meta API call if WhatsApp
      if ((channel === 'WHATSAPP' || !channel) && customer?.phone_wa) {
        await WhatsAppIntegration.sendMessage(customer.phone_wa, content);
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

      return newMessage;
    });
  });
}
