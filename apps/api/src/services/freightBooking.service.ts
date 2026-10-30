import { trackerPage, type TrackerPage } from './tracker-pagination.js';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { validateTrackerReferences } from './tracker-integrity.js';
import { withTenant } from '../db/client.js';
import { pick } from '../lib/pick.js';
import { getCarrierAdapter } from './carrier-adapter.js';

export const freightBookingService = {
  // ── Carriers ─────────────────────────────────────────────────────────────
  async listCarriers(tenantId: string, activeOnly = false, page?: TrackerPage) {
    return withTenant(tenantId, async (trx) => {
      let query = trx.selectFrom('carriers').where('tenant_id', '=', tenantId).selectAll();
      if (activeOnly) query = query.where('active', '=', true);
      return trackerPage(trx,tenantId,query,'carriers','name','asc',page);
    });
  },

  async createCarrier(tenantId: string, data: { name: string; mode: string; scac_or_iata?: string; contact_name?: string; contact_email?: string; contact_phone?: string }) {
    return withTenant(tenantId, async (trx) => {
      return trx.insertInto('carriers').values({
        tenant_id: tenantId,
        name: data.name,
        mode: data.mode,
        scac_or_iata: data.scac_or_iata || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
    });
  },

  async updateCarrier(tenantId: string, carrierId: string, data: Partial<{ name: string; mode: string; scac_or_iata: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; active: boolean }>) {
    return withTenant(tenantId, async (trx) => {
      const patch = pick(data, ['name', 'mode', 'scac_or_iata', 'contact_name', 'contact_email', 'contact_phone', 'active']);
      return trx.updateTable('carriers')
        .set({ ...patch, updated_at: new Date() })
        .where('id', '=', carrierId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  // ── Rate cards ───────────────────────────────────────────────────────────
  async listRateCards(tenantId: string, filters?: { carrier_id?: string; mode?: string; origin_port?: string; destination_port?: string }, page?: TrackerPage) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('freight_rate_cards')
        .leftJoin('carriers', 'carriers.id', 'freight_rate_cards.carrier_id')
        .where('freight_rate_cards.tenant_id', '=', tenantId)
        .select([
          'freight_rate_cards.id', 'freight_rate_cards.carrier_id', 'freight_rate_cards.mode',
          'freight_rate_cards.origin_port', 'freight_rate_cards.destination_port',
          'freight_rate_cards.cost_rate', 'freight_rate_cards.sell_rate', 'freight_rate_cards.currency',
          'freight_rate_cards.valid_from', 'freight_rate_cards.valid_to', 'freight_rate_cards.notes',
          'freight_rate_cards.active', 'freight_rate_cards.created_at',
          'carriers.name as carrier_name',
        ]);
      if (filters?.carrier_id) query = query.where('freight_rate_cards.carrier_id', '=', filters.carrier_id);
      if (filters?.mode) query = query.where('freight_rate_cards.mode', '=', filters.mode);
      if (filters?.origin_port) query = query.where('freight_rate_cards.origin_port', '=', filters.origin_port);
      if (filters?.destination_port) query = query.where('freight_rate_cards.destination_port', '=', filters.destination_port);
      return trackerPage(trx,tenantId,query,'freight_rate_cards','created_at','desc',page);
    });
  },

  async createRateCard(tenantId: string, data: {
    carrier_id: string; mode: string; origin_port: string; destination_port: string;
    cost_rate: number; sell_rate: number; currency?: string; valid_from?: string; valid_to?: string; notes?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      await validateTrackerReferences(trx, tenantId, data);
      return trx.insertInto('freight_rate_cards').values({
        tenant_id: tenantId,
        carrier_id: data.carrier_id,
        mode: data.mode,
        origin_port: data.origin_port,
        destination_port: data.destination_port,
        cost_rate: data.cost_rate,
        sell_rate: data.sell_rate,
        currency: data.currency || 'USD',
        valid_from: data.valid_from ? new Date(data.valid_from) : null,
        valid_to: data.valid_to ? new Date(data.valid_to) : null,
        notes: data.notes || null,
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
    });
  },

  async updateRateCard(tenantId: string, rateCardId: string, data: Partial<{ cost_rate: number; sell_rate: number; currency: string; valid_from: string | null; valid_to: string | null; notes: string | null; active: boolean }>) {
    return withTenant(tenantId, async (trx) => {
      const { valid_from, valid_to } = data;
      const rest = pick(data, ['cost_rate', 'sell_rate', 'currency', 'notes', 'active']);
      return trx.updateTable('freight_rate_cards')
        .set({
          ...rest,
          ...(valid_from !== undefined ? { valid_from: valid_from ? new Date(valid_from) : null } : {}),
          ...(valid_to !== undefined ? { valid_to: valid_to ? new Date(valid_to) : null } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', rateCardId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  // ── Carrier rate contracts (buy-side only, M7) ──────────────────────────
  async listRateContracts(tenantId: string, filters?: { carrier_id?: string; mode?: string; origin_port?: string; destination_port?: string }, page?: TrackerPage) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('carrier_rate_contracts')
        .leftJoin('carriers', 'carriers.id', 'carrier_rate_contracts.carrier_id')
        .where('carrier_rate_contracts.tenant_id', '=', tenantId)
        .select([
          'carrier_rate_contracts.id', 'carrier_rate_contracts.carrier_id', 'carrier_rate_contracts.contract_reference',
          'carrier_rate_contracts.mode', 'carrier_rate_contracts.origin_port', 'carrier_rate_contracts.destination_port',
          'carrier_rate_contracts.buy_rate', 'carrier_rate_contracts.currency', 'carrier_rate_contracts.transit_days',
          'carrier_rate_contracts.valid_from', 'carrier_rate_contracts.valid_to', 'carrier_rate_contracts.notes',
          'carrier_rate_contracts.active', 'carrier_rate_contracts.created_at',
          'carriers.name as carrier_name',
        ]);
      if (filters?.carrier_id) query = query.where('carrier_rate_contracts.carrier_id', '=', filters.carrier_id);
      if (filters?.mode) query = query.where('carrier_rate_contracts.mode', '=', filters.mode);
      if (filters?.origin_port) query = query.where('carrier_rate_contracts.origin_port', '=', filters.origin_port);
      if (filters?.destination_port) query = query.where('carrier_rate_contracts.destination_port', '=', filters.destination_port);
      return trackerPage(trx,tenantId,query,'carrier_rate_contracts','created_at','desc',page);
    });
  },

  async createRateContract(tenantId: string, userId: string, data: {
    carrier_id: string; contract_reference?: string; mode: string; origin_port: string; destination_port: string;
    buy_rate: number; currency?: string; transit_days?: number; valid_from?: string; valid_to?: string; notes?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      await validateTrackerReferences(trx, tenantId, data);
      return trx.insertInto('carrier_rate_contracts').values({
        tenant_id: tenantId,
        carrier_id: data.carrier_id,
        contract_reference: data.contract_reference || null,
        mode: data.mode,
        origin_port: data.origin_port,
        destination_port: data.destination_port,
        buy_rate: data.buy_rate,
        currency: data.currency || 'USD',
        transit_days: data.transit_days ?? null,
        valid_from: (data.valid_from as any) ?? null,
        valid_to: (data.valid_to as any) ?? null,
        notes: data.notes || null,
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
    });
  },

  async updateRateContract(tenantId: string, id: string, data: Partial<{
    contract_reference: string | null; buy_rate: number; currency: string; transit_days: number | null;
    valid_from: string | null; valid_to: string | null; notes: string | null; active: boolean;
  }>) {
    return withTenant(tenantId, async (trx) => {
      const { valid_from, valid_to } = data;
      const rest = pick(data, ['contract_reference', 'buy_rate', 'currency', 'transit_days', 'notes', 'active']);
      return trx.updateTable('carrier_rate_contracts')
        .set({
          ...rest,
          ...(valid_from !== undefined ? { valid_from: valid_from as any } : {}),
          ...(valid_to !== undefined ? { valid_to: valid_to as any } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  /**
   * Rate shopping — every active carrier contract for a lane+mode whose
   * validity window covers `asOf` (defaults to today), cheapest first. The
   * real "compare carriers" view: before this, one lane could only ever
   * hold a single bundled cost+sell row, so there was nothing to shop
   * between.
   */
  async rateShopping(tenantId: string, params: { mode: string; origin_port: string; destination_port: string; as_of?: string }) {
    const asOf = params.as_of ? new Date(params.as_of) : new Date();
    return withTenant(tenantId, async (trx) => {
      return trx
        .selectFrom('carrier_rate_contracts')
        .leftJoin('carriers', 'carriers.id', 'carrier_rate_contracts.carrier_id')
        .where('carrier_rate_contracts.tenant_id', '=', tenantId)
        .where('carrier_rate_contracts.mode', '=', params.mode)
        .where('carrier_rate_contracts.origin_port', '=', params.origin_port)
        .where('carrier_rate_contracts.destination_port', '=', params.destination_port)
        .where('carrier_rate_contracts.active', '=', true)
        .where(eb => eb.or([eb('carrier_rate_contracts.valid_from', 'is', null), eb('carrier_rate_contracts.valid_from', '<=', asOf as any)]))
        .where(eb => eb.or([eb('carrier_rate_contracts.valid_to', 'is', null), eb('carrier_rate_contracts.valid_to', '>=', asOf as any)]))
        .select([
          'carrier_rate_contracts.id', 'carrier_rate_contracts.carrier_id', 'carrier_rate_contracts.contract_reference',
          'carrier_rate_contracts.buy_rate', 'carrier_rate_contracts.currency', 'carrier_rate_contracts.transit_days',
          'carrier_rate_contracts.valid_to',
          'carriers.name as carrier_name', 'carriers.scac_or_iata',
        ])
        .orderBy('carrier_rate_contracts.currency', 'asc').orderBy('carrier_rate_contracts.buy_rate', 'asc')
        .execute();
    });
  },

  // ── Bookings ─────────────────────────────────────────────────────────────
  async listBookings(tenantId: string, filters?: { status?: string; customer_id?: string }, page?: TrackerPage) {
    return withTenant(tenantId, async (trx) => {
      let query = trx
        .selectFrom('freight_bookings')
        .leftJoin('customers', 'customers.id', 'freight_bookings.customer_id')
        .leftJoin('carriers', 'carriers.id', 'freight_bookings.carrier_id')
        .where('freight_bookings.tenant_id', '=', tenantId)
        .select([
          'freight_bookings.id', 'freight_bookings.booking_number', 'freight_bookings.customer_id',
          'freight_bookings.carrier_id', 'freight_bookings.mode', 'freight_bookings.origin_port',
          'freight_bookings.destination_port', 'freight_bookings.cargo_desc', 'freight_bookings.quantity',
          'freight_bookings.requested_ship_date', 'freight_bookings.status', 'freight_bookings.quoted_cost',
          'freight_bookings.quoted_sell', 'freight_bookings.currency', 'freight_bookings.vessel_name',
          'freight_bookings.voyage_number', 'freight_bookings.eta', 'freight_bookings.converted_shipment_id',
          'freight_bookings.created_at',
          'customers.name as customer_name',
          'carriers.name as carrier_name',
        ]);
      if (filters?.status) query = query.where('freight_bookings.status', '=', filters.status);
      if (filters?.customer_id) query = query.where('freight_bookings.customer_id', '=', filters.customer_id);
      return trackerPage(trx,tenantId,query,'freight_bookings','created_at','desc',page);
    });
  },

  async getBooking(tenantId: string, bookingId: string) {
    return withTenant(tenantId, async (trx) => {
      return trx.selectFrom('freight_bookings')
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId)
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirstOrThrow();
    });
  },

  async getBookingByShipment(tenantId: string, shipmentId: string) {
    return withTenant(tenantId, async (trx) => {
      return trx.selectFrom('freight_bookings')
        .where('converted_shipment_id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .select(['id', 'booking_number'])
        .executeTakeFirst();
    });
  },

  async createBooking(tenantId: string, userId: string, data: {
    customer_id: string; mode: string; origin_port: string; destination_port: string;
    cargo_desc?: string; quantity?: number; requested_ship_date?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      await validateTrackerReferences(trx, tenantId, data);
      // A durable tenant/year counter is seeded from existing numbers under the same lock.
      const year = new Date().getUTCFullYear();
      await sql`select pg_advisory_xact_lock(hashtextextended(${`freight-number:${tenantId}:${year}`},0))`.execute(trx);
      const existing = await trx.selectFrom('freight_bookings').select('booking_number').where('tenant_id','=',tenantId).where('booking_number','like',`FB-${year}-%`).execute();
      const highest = existing.reduce((n,r) => Math.max(n, Number(r.booking_number.split('-').pop()) || 0),0);
      const counter = await trx.insertInto('freight_booking_sequences').values({ tenant_id: tenantId, year, last_number: highest + 1 })
        .onConflict(oc => oc.columns(['tenant_id','year']).doUpdateSet({ last_number: sql<number>`greatest(freight_booking_sequences.last_number, ${highest}) + 1` }))
        .returning('last_number').executeTakeFirstOrThrow();
      const bookingNumber = `FB-${year}-${String(counter.last_number).padStart(4,'0')}`;

      return trx.insertInto('freight_bookings').values({
        tenant_id: tenantId,
        booking_number: bookingNumber,
        customer_id: data.customer_id,
        mode: data.mode,
        origin_port: data.origin_port,
        destination_port: data.destination_port,
        cargo_desc: data.cargo_desc || null,
        quantity: data.quantity || 1,
        requested_ship_date: data.requested_ship_date ? new Date(data.requested_ship_date) : null,
        created_by: userId,
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();
    });
  },

  async quoteBooking(tenantId: string, bookingId: string, data: { rate_card_id?: string; carrier_id?: string; quoted_cost: number; quoted_sell: number; currency?: string }) {
    return withTenant(tenantId, async (trx) => {
      await validateTrackerReferences(trx, tenantId, data);
      const booking = await trx.selectFrom('freight_bookings')
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId).selectAll().forUpdate().executeTakeFirstOrThrow();
      if (booking.status !== 'REQUESTED') throw new Error('Only requested bookings can be quoted');
      const card = data.rate_card_id ? await trx.selectFrom('freight_rate_cards').selectAll().where('tenant_id','=',tenantId).where('id','=',data.rate_card_id).executeTakeFirstOrThrow() : null;
      if (card && data.carrier_id && card.carrier_id !== data.carrier_id) throw Object.assign(new Error('Rate card does not belong to the selected carrier'), { statusCode: 400 });
      if (card && (card.mode !== booking.mode || card.origin_port !== booking.origin_port || card.destination_port !== booking.destination_port)) throw Object.assign(new Error('Rate card does not match the booking lane and mode'), { statusCode: 400 });


      return trx.updateTable('freight_bookings')
        .set({
          rate_card_id: data.rate_card_id || null,
          carrier_id: data.carrier_id || card?.carrier_id || null,
          quoted_cost: data.quoted_cost,
          quoted_sell: data.quoted_sell,
          currency: data.currency || card?.currency || booking.currency || 'USD',
          status: 'RATE_QUOTED',
          updated_at: new Date(),
        })
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  async cancelBooking(tenantId: string, bookingId: string) {
    return withTenant(tenantId, async (trx) => {
      const booking = await trx.selectFrom('freight_bookings')
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId).selectAll().forUpdate().executeTakeFirstOrThrow();
      if (booking.status === 'CONFIRMED') throw new Error('Confirmed bookings cannot be cancelled — cancel the resulting shipment instead');

      return trx.updateTable('freight_bookings')
        .set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  },

  /**
   * Confirms a quoted booking (vessel/voyage/BL now known) and converts it
   * into a real shipment_case, mirroring quotation.service.ts's
   * convertToShipment — same ref-number generation pattern, same
   * DOCS_RECEIVED starting stage — just with vessel/BL pre-filled from the
   * booking instead of left blank.
   */
  async confirmBooking(tenantId: string, bookingId: string, userId: string, data: {
    vessel_name: string; voyage_number?: string; carrier_booking_ref?: string;
    bl_number?: string; awb_number?: string; eta?: string;
  }) {
    return withTenant(tenantId, async (trx) => {
      const booking = await trx.selectFrom('freight_bookings')
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId).selectAll().forUpdate().executeTakeFirstOrThrow();
      if (booking.status === 'CONFIRMED' && booking.converted_shipment_id) {
        if (booking.vessel_name !== data.vessel_name || (data.carrier_booking_ref && booking.carrier_booking_ref !== data.carrier_booking_ref) || (data.bl_number && booking.bl_number !== data.bl_number)) throw Object.assign(new Error('Booking already confirmed with different details'), {statusCode:409});
        const shipment = await trx.selectFrom('shipment_cases').selectAll().where('id','=',booking.converted_shipment_id).where('tenant_id','=',tenantId).executeTakeFirstOrThrow();
        return { booking, shipment };
      }
      if (booking.status !== 'RATE_QUOTED') throw new Error('Only rate-quoted bookings can be confirmed');

      // Routed through the CarrierAdapter seam (M7) so a real carrier
      // integration, once one exists, changes nothing here — only when a
      // reference is actually supplied, preserving the field's existing
      // optional behavior exactly.
      let carrierBookingRef: string | null = data.carrier_booking_ref || null;
      if (data.carrier_booking_ref) {
        const carrier = booking.carrier_id
          ? await trx.selectFrom('carriers').select(['name', 'scac_or_iata']).where('id', '=', booking.carrier_id).where('tenant_id','=',tenantId).executeTakeFirst()
          : null;
        const confirmation = await getCarrierAdapter(carrier?.scac_or_iata, carrier?.name).confirmBooking({ humanProvidedRef: data.carrier_booking_ref });
        carrierBookingRef = confirmation.carrierBookingRef;
      }

      const refNumber = `CLR-${new Date().getUTCFullYear()}-${randomUUID()}`;

      const shipmentType =
        booking.mode === 'LCL' ? 'SEA_LCL'
        : booking.mode === 'AIR' ? 'AIR'
        : booking.mode === 'ROAD' ? 'ROAD'
        : 'SEA_FCL'; // FCL_20 / FCL_40 / FCL_40HC

      const shipment = await trx.insertInto('shipment_cases').values({
        tenant_id: tenantId,
        ref_number: refNumber,
        customer_id: booking.customer_id,
        type: shipmentType as any,
        goods_desc: booking.cargo_desc || `Freight booking ${booking.booking_number}`,
        vessel: data.vessel_name,
        origin_port: booking.origin_port,
        dest_port: booking.destination_port,
        bl_number: data.bl_number || null,
        awb_number: data.awb_number || null,
        containers: '[]',
        eta: data.eta ? new Date(data.eta) : null,
        assigned_to: userId,
        created_at: new Date(),
        updated_at: new Date(),
      }).returningAll().executeTakeFirstOrThrow();

      const updated = await trx.updateTable('freight_bookings')
        .set({
          status: 'CONFIRMED',
          vessel_name: data.vessel_name,
          voyage_number: data.voyage_number || null,
          carrier_booking_ref: carrierBookingRef,
          bl_number: data.bl_number || null,
          awb_number: data.awb_number || null,
          eta: data.eta ? new Date(data.eta) : null,
          converted_shipment_id: shipment.id,
          updated_at: new Date(),
        })
        .where('id', '=', bookingId).where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return { booking: updated, shipment };
    });
  },
};
