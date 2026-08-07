import { createHash } from 'crypto';
import { emitDomainEvent } from './domain-events.service.js';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import {
  isLegalCustomsTransition, CUSTOMS_STATUS_ENTRY_POINTS,
  type CustomsStatus, type SealMovementType,
} from '@hudumika/types';

export class IllegalCustomsTransition extends Error {
  constructor(public from: CustomsStatus, public to: CustomsStatus) {
    super(`Illegal customs transition: ${from} → ${to}`);
    this.name = 'IllegalCustomsTransition';
  }
}

export class DgSegregationViolation extends Error {
  constructor(
    public classA: string,
    public classB: string,
    public conflictingLotDescription: string,
    public note: string | null,
  ) {
    super(`IMDG class ${classA} cannot share this location with class ${classB} (${conflictingLotDescription})${note ? ` — ${note}` : ''}.`);
    this.name = 'DgSegregationViolation';
  }
}

export class BondHeadroomExceeded extends Error {
  constructor(
    public guaranteeReference: string,
    public faceValue: number,
    public currentlyAtRisk: number,
    public requestedAtRisk: number,
    public currency: string,
  ) {
    super(`Receiving this lot would put guarantee ${guaranteeReference} over its face value.`);
    this.name = 'BondHeadroomExceeded';
  }
  get shortfall() { return this.requestedAtRisk - (this.faceValue - this.currentlyAtRisk); }
}

/** hash = sha256(prev_hash || canonical_json(payload) || occurred_at || actor_id) — spec §8.3. */
function computeMovementHash(prevHash: string | null, payload: Record<string, unknown>, occurredAtIso: string, actorId: string | null): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update((prevHash ?? '') + canonical + occurredAtIso + (actorId ?? '')).digest('hex');
}

interface RecordMovementInput {
  actorId: string | null;
  actorType?: 'user' | 'system' | 'api_client';
  movementType: SealMovementType;
  lotId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  stackTier?: number;
  qtyDelta?: number;
  toCustomsStatus?: CustomsStatus | null;
  entryReference?: string | null;
  reasonCode?: string | null;
  reference?: string | null;
}

export class SealService {
  /**
   * Records one row on the append-only dual ledger and applies its effect
   * to the lot projection in the same transaction. This is the *only* path
   * that may change a lot's location, quantity, or customs_status — never
   * update those columns directly, or the ledger and the projection it
   * feeds will disagree (spec §4.2's central architectural rule).
   */
  static async recordMovement(trx: Transaction<Database>, tenantId: string, input: RecordMovementInput) {
    const lot = await trx.selectFrom('seal_lots')
      .select(['id', 'customs_status', 'current_location_id', 'qty_on_hand', 'is_dangerous_goods', 'imdg_class'])
      .where('id', '=', input.lotId)
      .executeTakeFirst();
    if (!lot) throw new Error(`Lot not found: ${input.lotId}`);

    const fromStatus = lot.customs_status as CustomsStatus;
    const toStatus = input.toCustomsStatus ?? null;

    if (input.toLocationId && input.toLocationId !== lot.current_location_id) {
      await SealService.checkDgSegregation(trx, input.toLocationId, {
        isDangerousGoods: lot.is_dangerous_goods, imdgClass: lot.imdg_class,
      }, input.lotId);
    }
    if (input.stackTier != null && input.toLocationId) {
      const targetLocation = await trx.selectFrom('seal_locations').select('max_stack_tiers').where('id', '=', input.toLocationId).executeTakeFirst();
      if (targetLocation && input.stackTier > targetLocation.max_stack_tiers) {
        throw new Error(`Location only supports ${targetLocation.max_stack_tiers} stack tier(s) — tier ${input.stackTier} is out of range.`);
      }
    }

    // Fiscal-effect movements (a customs status change) must be a legal
    // transition per the domain table — enforced here, not the UI, not the
    // database CHECK constraint (which only knows the value is a valid
    // status, not that this specific from→to move is permitted).
    if (toStatus && toStatus !== fromStatus && !isLegalCustomsTransition(fromStatus, toStatus)) {
      throw new IllegalCustomsTransition(fromStatus, toStatus);
    }

    const occurredAt = new Date();
    const occurredAtIso = occurredAt.toISOString();
    const qtyDelta = input.qtyDelta ?? 0;

    const last = await trx.selectFrom('seal_movements')
      .select('hash')
      .where('lot_id', '=', input.lotId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    const prevHash = last?.hash ?? null;

    const payload = {
      tenant_id: tenantId,
      movement_type: input.movementType,
      lot_id: input.lotId,
      from_location_id: input.fromLocationId ?? lot.current_location_id,
      to_location_id: input.toLocationId ?? lot.current_location_id,
      qty_delta: qtyDelta,
      from_customs_status: toStatus ? fromStatus : null,
      to_customs_status: toStatus,
      entry_reference: input.entryReference ?? null,
      reason_code: input.reasonCode ?? null,
      reference: input.reference ?? null,
    };
    const hash = computeMovementHash(prevHash, payload, occurredAtIso, input.actorId);

    const movement = await trx.insertInto('seal_movements')
      .values({
        tenant_id: tenantId,
        occurred_at: occurredAt,
        actor_id: input.actorId,
        actor_type: input.actorType ?? 'user',
        movement_type: input.movementType,
        lot_id: input.lotId,
        from_location_id: payload.from_location_id,
        to_location_id: payload.to_location_id,
        qty_delta: String(qtyDelta),
        from_customs_status: payload.from_customs_status,
        to_customs_status: toStatus,
        entry_reference: input.entryReference ?? null,
        reason_code: input.reasonCode ?? null,
        reference: input.reference ?? null,
        prev_hash: prevHash,
        hash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Apply the movement's effect to the lot projection.
    await trx.updateTable('seal_lots')
      .set({
        current_location_id: payload.to_location_id,
        qty_on_hand: String(Number(lot.qty_on_hand) + qtyDelta),
        ...(toStatus ? { customs_status: toStatus } : {}),
        ...(input.stackTier != null ? { stack_tier: input.stackTier } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', input.lotId)
      .execute();

    return movement;
  }

  /** Creates a lot and its founding "receipt" movement — the only way a lot
   *  may come into existence, so it always has a movement #1 to chain from. */
  /** Face value minus duty+tax at risk across all currently-suspended lots
   *  secured by this instrument (spec §2.4). Returns null if the compartment
   *  has no guarantee attached — headroom simply isn't checked in that case
   *  (Increment 1 compartments have none, by design). */
  static async getHeadroom(trx: Transaction<Database>, tenantId: string, guaranteeId: string) {
    const guarantee = await trx.selectFrom('seal_guarantees').selectAll().where('tenant_id', '=', tenantId).where('id', '=', guaranteeId).executeTakeFirstOrThrow();
    const row = await trx.selectFrom('seal_lots')
      .innerJoin('seal_compartments', 'seal_compartments.id', 'seal_lots.compartment_id')
      .select(({ fn }) => [
        fn.sum<string>('seal_lots.duty_at_risk').as('duty_sum'),
        fn.sum<string>('seal_lots.tax_at_risk').as('tax_sum'),
      ])
      .where('seal_lots.tenant_id', '=', tenantId)
      .where('seal_compartments.guarantee_id', '=', guaranteeId)
      .where('seal_lots.customs_status', '=', 'FOREIGN_DUTY_SUSPENDED')
      .executeTakeFirst();
    const currentlyAtRisk = Number(row?.duty_sum ?? 0) + Number(row?.tax_sum ?? 0);
    const faceValue = Number(guarantee.face_value);
    return { guarantee, faceValue, currentlyAtRisk, headroom: faceValue - currentlyAtRisk, currency: guarantee.currency };
  }

  /** Throws BondHeadroomExceeded unless there's room, an override is supplied
   *  (which writes the audit record spec §2.4 requires), or the compartment
   *  has no guarantee attached at all. */
  static async checkHeadroom(trx: Transaction<Database>, tenantId: string, compartmentId: string, requestedAtRisk: number, override?: { actorId: string | null; reason: string }) {
    if (requestedAtRisk <= 0) return;
    const compartment = await trx.selectFrom('seal_compartments').select('guarantee_id').where('tenant_id', '=', tenantId).where('id', '=', compartmentId).executeTakeFirst();
    if (!compartment?.guarantee_id) return; // no instrument attached — nothing to check against yet

    const { guarantee, faceValue, currentlyAtRisk, headroom, currency } = await SealService.getHeadroom(trx, tenantId, compartment.guarantee_id);
    if (requestedAtRisk <= headroom) return;

    if (override) {
      await trx.insertInto('seal_bond_overrides').values({
        tenant_id: tenantId, guarantee_id: guarantee.id, actor_id: override.actorId,
        reason: override.reason, shortfall: String(requestedAtRisk - headroom), currency,
      }).execute();
      return;
    }

    throw new BondHeadroomExceeded(guarantee.reference, faceValue, currentlyAtRisk, requestedAtRisk, currency);
  }

  /** Throws DgSegregationViolation if placing a dangerous-goods lot at
   *  `locationId` would put it alongside another DG lot its IMDG class is
   *  marked incompatible with (seal_dg_segregation_rules — a representative
   *  subset of the real IMDG Code segregation table, spec's warehouse-ops
   *  deferral from Increment 2). Same-class co-location is always allowed;
   *  an unrated pair (no rule either direction) is treated as compatible —
   *  the rule table is a known-bad list, not a known-good allowlist. */
  static async checkDgSegregation(trx: Transaction<Database>, locationId: string | null | undefined, lot: { isDangerousGoods: boolean; imdgClass: string | null | undefined }, excludeLotId?: string) {
    if (!locationId || !lot.isDangerousGoods || !lot.imdgClass) return;

    const others = await trx.selectFrom('seal_lots')
      .select(['id', 'imdg_class', 'description'])
      .where('current_location_id', '=', locationId)
      .where('is_dangerous_goods', '=', true)
      .where('qty_on_hand', '>', '0')
      .execute();

    for (const other of others) {
      if (excludeLotId && other.id === excludeLotId) continue;
      if (!other.imdg_class || other.imdg_class === lot.imdgClass) continue;
      const rule = await trx.selectFrom('seal_dg_segregation_rules').selectAll()
        .where(eb => eb.or([
          eb.and([eb('class_a', '=', lot.imdgClass!), eb('class_b', '=', other.imdg_class!)]),
          eb.and([eb('class_a', '=', other.imdg_class!), eb('class_b', '=', lot.imdgClass!)]),
        ]))
        .executeTakeFirst();
      if (rule && !rule.compatible) {
        throw new DgSegregationViolation(lot.imdgClass, other.imdg_class, other.description, rule.note);
      }
    }
  }

  static async receiveLot(trx: Transaction<Database>, tenantId: string, actorId: string | null, input: {
    compartmentId: string; ownerId: string; description: string; hsCode?: string | null;
    countryOfOrigin?: string | null; customsStatus: CustomsStatus; entryReference?: string | null;
    locationId?: string | null; qty: number; uom: string; customsValue?: number | null; currency?: string | null;
    warehousedOn?: string | null; expiresOn?: string | null; batch?: string | null;
    // Manual estimate until the real duty engine (spec Increment 3) exists —
    // never presented as an authoritative computation, see the UI copy.
    dutyAtRisk?: number | null; taxAtRisk?: number | null;
    bondOverrideReason?: string | null;
    isDangerousGoods?: boolean; unNumber?: string | null; imdgClass?: string | null;
    requiresReefer?: boolean; reeferSetpointC?: number | null;
    stackTier?: number;
    volumeCbm?: number | null; grossWeightKg?: number | null;
    destinationLabel?: string | null;
  }) {
    if (!CUSTOMS_STATUS_ENTRY_POINTS.includes(input.customsStatus)) {
      throw new Error(`A lot cannot be received directly into ${input.customsStatus} — valid entry statuses are ${CUSTOMS_STATUS_ENTRY_POINTS.join(', ')}`);
    }

    const dutyAtRisk = input.dutyAtRisk ?? 0;
    const taxAtRisk = input.taxAtRisk ?? 0;
    if (input.customsStatus === 'FOREIGN_DUTY_SUSPENDED') {
      await SealService.checkHeadroom(trx, tenantId, input.compartmentId, dutyAtRisk + taxAtRisk,
        input.bondOverrideReason ? { actorId, reason: input.bondOverrideReason } : undefined);
    }
    const stackTier = input.stackTier ?? 1;
    if (input.locationId) {
      await SealService.checkDgSegregation(trx, input.locationId, {
        isDangerousGoods: !!input.isDangerousGoods, imdgClass: input.imdgClass,
      });
      const targetLocation = await trx.selectFrom('seal_locations').select('max_stack_tiers').where('id', '=', input.locationId).executeTakeFirst();
      if (targetLocation && stackTier > targetLocation.max_stack_tiers) {
        throw new Error(`Location only supports ${targetLocation.max_stack_tiers} stack tier(s) — tier ${stackTier} is out of range.`);
      }
    }

    const lot = await trx.insertInto('seal_lots')
      .values({
        tenant_id: tenantId,
        compartment_id: input.compartmentId,
        owner_id: input.ownerId,
        description: input.description,
        hs_code: input.hsCode ?? null,
        country_of_origin: input.countryOfOrigin ?? null,
        customs_status: input.customsStatus,
        entry_reference: input.entryReference ?? null,
        current_location_id: input.locationId ?? null,
        qty_on_hand: '0',
        uom: input.uom,
        customs_value: input.customsValue != null ? String(input.customsValue) : null,
        currency: input.currency ?? null,
        duty_at_risk: String(dutyAtRisk),
        tax_at_risk: String(taxAtRisk),
        warehoused_on: input.warehousedOn ? new Date(input.warehousedOn) : new Date(),
        expires_on: input.expiresOn ? new Date(input.expiresOn) : null,
        batch: input.batch ?? null,
        is_dangerous_goods: input.isDangerousGoods ?? false,
        un_number: input.unNumber ?? null,
        imdg_class: input.imdgClass ?? null,
        requires_reefer: input.requiresReefer ?? false,
        reefer_setpoint_c: input.reeferSetpointC != null ? String(input.reeferSetpointC) : null,
        stack_tier: stackTier,
        volume_cbm: input.volumeCbm != null ? String(input.volumeCbm) : null,
        gross_weight_kg: input.grossWeightKg != null ? String(input.grossWeightKg) : null,
        destination_label: input.destinationLabel ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await SealService.recordMovement(trx, tenantId, {
      actorId,
      movementType: 'receipt',
      lotId: lot.id,
      toLocationId: input.locationId ?? null,
      stackTier: input.locationId ? stackTier : undefined,
      qtyDelta: input.qty,
      toCustomsStatus: input.customsStatus,
      entryReference: input.entryReference ?? null,
      reasonCode: 'INITIAL_RECEIPT',
    });

    // Cargo has physically landed in the warehouse — the point every
    // downstream journey (billing, storage, dispatch) actually starts from.
    emitDomainEvent(trx, tenantId, {
      type: 'seal.lot_received', sourceApp: 'seal', entityType: 'seal_lot', entityId: lot.id,
      payload: { description: input.description, customsStatus: input.customsStatus, entryReference: input.entryReference ?? null },
    }).catch(err => console.error('[SEAL] lot_received emit failed:', err.message));

    return trx.selectFrom('seal_lots').selectAll().where('id', '=', lot.id).executeTakeFirstOrThrow();
  }

  /** Recomputes the hash chain for a lot's movement history from scratch and
   *  compares it against what's stored — spec §8.3's verify_chain(). */
  static async verifyChain(trx: Transaction<Database>, lotId: string): Promise<{ valid: boolean; brokenAtMovementId: string | null; checked: number }> {
    const movements = await trx.selectFrom('seal_movements')
      .selectAll()
      .where('lot_id', '=', lotId)
      .orderBy('id', 'asc')
      .execute();

    let prevHash: string | null = null;
    for (const m of movements) {
      const payload = {
        tenant_id: m.tenant_id,
        movement_type: m.movement_type,
        lot_id: m.lot_id,
        from_location_id: m.from_location_id,
        to_location_id: m.to_location_id,
        qty_delta: Number(m.qty_delta),
        from_customs_status: m.from_customs_status,
        to_customs_status: m.to_customs_status,
        entry_reference: m.entry_reference,
        reason_code: m.reason_code,
        reference: m.reference,
      };
      const expected = computeMovementHash(prevHash, payload, new Date(m.occurred_at as any).toISOString(), m.actor_id);
      if (expected !== m.hash || (m.prev_hash ?? null) !== prevHash) {
        return { valid: false, brokenAtMovementId: String(m.id), checked: movements.length };
      }
      prevHash = m.hash;
    }
    return { valid: true, brokenAtMovementId: null, checked: movements.length };
  }

  /** Builds the deterministic checkpoint a compartment's ledger anchors
   *  against: every lot's current chain-tip movement (the per-lot hash
   *  chain means a single tenant-wide chain doesn't exist — this is the
   *  closest real analogue, a canonical snapshot of every lot's latest
   *  proven-linked hash at this moment). Sorted by lot_id so the same
   *  ledger state always produces the same checkpoint_hash regardless of
   *  query-execution order. */
  static async buildCompartmentCheckpoint(trx: Transaction<Database>, compartmentId: string): Promise<{ snapshot: { lotId: string; movementId: string; hash: string }[]; checkpointHash: string }> {
    const tips = await trx.selectFrom('seal_movements as m')
      .innerJoin('seal_lots as l', 'l.id', 'm.lot_id')
      .where('l.compartment_id', '=', compartmentId)
      .select(['m.lot_id', 'm.id', 'm.hash'])
      .distinctOn('m.lot_id')
      .orderBy('m.lot_id')
      .orderBy('m.id', 'desc')
      .execute();

    // Each entry is always constructed with this exact literal key order
    // (lotId, movementId, hash), so JSON.stringify's own deterministic
    // insertion-order serialization already gives a stable, reproducible
    // string — no key-sorting replacer needed (unlike computeMovementHash's
    // payload, which is built from data whose key order isn't guaranteed).
    const snapshot = tips
      .map(t => ({ lotId: t.lot_id, movementId: String(t.id), hash: t.hash }))
      .sort((a, b) => a.lotId.localeCompare(b.lotId));

    const checkpointHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

    return { snapshot, checkpointHash };
  }
}
