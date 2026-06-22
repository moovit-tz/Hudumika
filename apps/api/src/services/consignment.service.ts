import { db, withTenant } from '../db/client.js';

export const consignmentService = {
  async list(tenantId: string, filters?: { status?: string; customer_id?: string }) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('road_consignments')
        .leftJoin('customers', 'customers.id', 'road_consignments.customer_id')
        .where('road_consignments.tenant_id', '=', tenantId)
        .select([
          'road_consignments.id',
          'road_consignments.consignment_number',
          'road_consignments.goods_description',
          'road_consignments.origin_location',
          'road_consignments.destination_location',
          'road_consignments.distance_km',
          'road_consignments.status',
          'road_consignments.dispatched_at',
          'road_consignments.delivered_at',
          'road_consignments.assigned_driver',
          'road_consignments.vehicle_registration',
          'road_consignments.transport_cost',
          'road_consignments.cost_currency',
          'road_consignments.created_at',
          'customers.name as customer_name',
        ]);

      if (filters?.status) {
        query = query.where('road_consignments.status', '=', filters.status);
      }
      if (filters?.customer_id) {
        query = query.where('road_consignments.customer_id', '=', filters.customer_id);
      }

      return query.orderBy('road_consignments.created_at', 'desc').execute();
    });
  },

  async getById(tenantId: string, id: string) {
    return withTenant(tenantId, async (trx) => {
      const consignment = await trx
        .selectFrom('road_consignments')
        .leftJoin('customers', 'customers.id', 'road_consignments.customer_id')
        .where('road_consignments.id', '=', id)
        .where('road_consignments.tenant_id', '=', tenantId)
        .select([
          'road_consignments.id',
          'road_consignments.consignment_number',
          'road_consignments.shipment_id',
          'road_consignments.customer_id',
          'road_consignments.goods_description',
          'road_consignments.weight_kg',
          'road_consignments.volume_cbm',
          'road_consignments.package_count',
          'road_consignments.origin_location',
          'road_consignments.destination_location',
          'road_consignments.distance_km',
          'road_consignments.estimated_transit_days',
          'road_consignments.status',
          'road_consignments.dispatched_at',
          'road_consignments.delivered_at',
          'road_consignments.assigned_driver',
          'road_consignments.driver_phone',
          'road_consignments.vehicle_registration',
          'road_consignments.trailer_registration',
          'road_consignments.transport_cost',
          'road_consignments.cost_currency',
          'road_consignments.notes',
          'road_consignments.created_at',
          'road_consignments.updated_at',
          'customers.name as customer_name',
        ])
        .executeTakeFirstOrThrow();

      const trips = await trx
        .selectFrom('consignment_trips')
        .where('consignment_id', '=', id)
        .orderBy('trip_number')
        .selectAll()
        .execute();

      const borders = await trx
        .selectFrom('border_crossings')
        .where('consignment_id', '=', id)
        .orderBy('created_at')
        .selectAll()
        .execute();

      return { ...consignment, trips, border_crossings: borders };
    });
  },

  async create(tenantId: string, data: {
    customer_id: string;
    shipment_id?: string;
    goods_description?: string;
    weight_kg?: number;
    volume_cbm?: number;
    package_count?: number;
    origin_location: string;
    destination_location: string;
    distance_km?: number;
    estimated_transit_days?: number;
    assigned_driver?: string;
    driver_phone?: string;
    vehicle_registration?: string;
    trailer_registration?: string;
    transport_cost?: number;
    cost_currency?: string;
    notes?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      const count = await trx
        .selectFrom('road_consignments')
        .where('tenant_id', '=', tenantId)
        .select(trx.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      const nextNum = Number(count.count) + 1;
      const consignmentNumber = `RC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(nextNum).padStart(4, '0')}`;

      return trx
        .insertInto('road_consignments')
        .values({
          tenant_id: tenantId,
          consignment_number: consignmentNumber,
          customer_id: data.customer_id,
          shipment_id: data.shipment_id || null,
          goods_description: data.goods_description || null,
          weight_kg: data.weight_kg || null,
          volume_cbm: data.volume_cbm || null,
          package_count: data.package_count || null,
          origin_location: data.origin_location,
          destination_location: data.destination_location,
          distance_km: data.distance_km || null,
          estimated_transit_days: data.estimated_transit_days || null,
          assigned_driver: data.assigned_driver || null,
          driver_phone: data.driver_phone || null,
          vehicle_registration: data.vehicle_registration || null,
          trailer_registration: data.trailer_registration || null,
          transport_cost: data.transport_cost || null,
          cost_currency: data.cost_currency || 'TZS',
          notes: data.notes || null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async updateStatus(tenantId: string, consignmentId: string, status: string) {
    return withTenant(tenantId, async (trx) => {
      const updateData: any = { status, updated_at: new Date() };
      
      if (status === 'DISPATCHED') updateData.dispatched_at = new Date();
      if (status === 'DELIVERED') updateData.delivered_at = new Date();

      return trx
        .updateTable('road_consignments')
        .set(updateData)
        .where('id', '=', consignmentId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  // ── Trip Management ──

  async addTrip(tenantId: string, consignmentId: string, data: {
    from_location: string;
    to_location: string;
    distance_km?: number;
    driver_name?: string;
    vehicle?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      const existing = await trx
        .selectFrom('consignment_trips')
        .where('consignment_id', '=', consignmentId)
        .select(trx.fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      return trx
        .insertInto('consignment_trips')
        .values({
          consignment_id: consignmentId,
          trip_number: Number(existing.count) + 1,
          from_location: data.from_location,
          to_location: data.to_location,
          distance_km: data.distance_km || null,
          driver_name: data.driver_name || null,
          vehicle: data.vehicle || null,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async updateTripStatus(tenantId: string, tripId: string, status: string) {
    return withTenant(tenantId, async (trx) => {
      const updateData: any = { status };
      if (status === 'IN_PROGRESS') updateData.start_date = new Date();
      if (status === 'COMPLETED') updateData.end_date = new Date();

      return trx
        .updateTable('consignment_trips')
        .set(updateData)
        .where('id', '=', tripId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  // ── Border Crossings ──

  async addBorderCrossing(tenantId: string, consignmentId: string, data: {
    trip_id?: string;
    border_name: string;
    country_from: string;
    country_to: string;
    customs_ref?: string;
    notes?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      return trx
        .insertInto('border_crossings')
        .values({
          consignment_id: consignmentId,
          trip_id: data.trip_id || null,
          border_name: data.border_name,
          country_from: data.country_from,
          country_to: data.country_to,
          arrival_at: new Date(),
          customs_ref: data.customs_ref || null,
          notes: data.notes || null,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async updateBorderStatus(tenantId: string, borderId: string, status: string, delayReason?: string) {
    return withTenant(tenantId, async (trx) => {
      const updateData: any = { status };
      if (status === 'CLEARED') {
        updateData.cleared_at = new Date();
        updateData.documents_checked = true;
      }
      if (status === 'DELAYED' && delayReason) {
        updateData.delay_reason = delayReason;
      }

      return trx
        .updateTable('border_crossings')
        .set(updateData)
        .where('id', '=', borderId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },
};
