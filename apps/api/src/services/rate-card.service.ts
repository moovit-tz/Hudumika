import { db } from '../db/client.js';

export type RateCardKey = '20ft' | '40ft' | 'sea' | 'air' | 'road';
export const RATE_CARD_KEYS: RateCardKey[] = ['20ft', '40ft', 'sea', 'air', 'road'];

interface TemplateItem {
  code: string;
  category: 'ICD' | 'AGENCY' | 'OTHER';
  charge_name: string;
  unit: string;
}

// Each card has its own real charge structure — a 40ft FCL container isn't
// billed the same line items as consolidated LCL cargo or an air waybill,
// so the template is keyed per card rather than shared. ICD_MOVEMENT has no
// known real figure and stays editable/zero even when the rest of a card
// is populated. Every card starts with all of its own rows, shown at
// rate_amount 0 until the tenant fills them in; tenants can also add
// freeform rows (code: null).
const FCL_TEMPLATE: TemplateItem[] = [
  { code: 'ICD_HANDLING', category: 'ICD', charge_name: 'Handling Charges', unit: 'per consignment' },
  { code: 'ICD_CORRIDOR', category: 'ICD', charge_name: 'Corridor Levy', unit: 'per consignment' },
  { code: 'ICD_VERIFICATION', category: 'ICD', charge_name: 'Verification', unit: 'per consignment' },
  { code: 'ICD_MOVEMENT', category: 'ICD', charge_name: 'ICD Movement Charges', unit: 'per consignment' },
  { code: 'ICD_STRIPPING', category: 'ICD', charge_name: 'Stripping Charges', unit: 'per consignment' },
  { code: 'ICD_TRANSFER', category: 'ICD', charge_name: 'Container Transfer', unit: 'per consignment' },
  { code: 'ICD_REMOVAL', category: 'ICD', charge_name: 'Removal Charges (after storage)', unit: 'per container' },
  { code: 'ICD_STATUS_CHANGE', category: 'ICD', charge_name: 'Change of Status / Info', unit: 'per BL' },
  { code: 'SHIP_LINE_FEE', category: 'OTHER', charge_name: 'Container Drop-off (Shipping Line)', unit: 'per container' },
  { code: 'CF_VERIFICATION', category: 'AGENCY', charge_name: 'Verification', unit: 'per BL' },
  { code: 'CF_DOCUMENTATION', category: 'AGENCY', charge_name: 'Documentation', unit: 'per BL' },
  { code: 'CF_AGENCY_FEE', category: 'AGENCY', charge_name: 'Agency Fees', unit: 'per container' },
];

// LCL/consolidated cargo — from the clearing agent's own CV-SEA consolidated
// rate sheet. Reuses ICD_CORRIDOR/ICD_HANDLING/ICD_STRIPPING (same concepts
// as FCL, just billed per CBM instead of per consignment — each card is its
// own namespace, so the same code can carry a different unit/rate here).
const SEA_LCL_TEMPLATE: TemplateItem[] = [
  { code: 'ICD_CORRIDOR', category: 'ICD', charge_name: 'LCL Corridor Levy', unit: 'per CBM' },
  { code: 'ICD_HANDLING', category: 'ICD', charge_name: 'LCL Handling Charges', unit: 'per CBM' },
  { code: 'ICD_REMOVAL', category: 'ICD', charge_name: 'LCL Removal Charges', unit: 'per CBM' },
  { code: 'ICD_STORAGE', category: 'ICD', charge_name: 'LCL Storage Charges', unit: 'per CBM' },
  { code: 'ICD_STRIPPING', category: 'ICD', charge_name: 'LCL Stripping Charges', unit: 'per CBM' },
  { code: 'SHIP_LINE_FEE', category: 'OTHER', charge_name: 'Shipping Line Charges', unit: 'per BL' },
  { code: 'SHIP_CONSOLIDATION', category: 'OTHER', charge_name: 'Consolidation Charges', unit: 'per CBM' },
  { code: 'SHIP_DO_FEE', category: 'OTHER', charge_name: 'DO Fee', unit: 'per BL' },
  { code: 'CF_DOCUMENTATION', category: 'AGENCY', charge_name: 'Documentation', unit: 'per BL' },
  { code: 'CF_AGENCY_FEE', category: 'AGENCY', charge_name: 'Agency Fees', unit: 'per BL' },
];

// Air cargo — from the clearing agent's own air freight rate sheet.
// AIR_DOCUMENTATION/AIR_HANDLING mirror the same real per-BL/per-kg figures
// customs.service.ts already uses as its blended estimate (see
// AIR_DOCUMENTATION_TZS/AIR_HANDLING_TZS_PER_KG) — these itemized rows let
// the calculator show the real breakdown instead of just the blended total.
const AIR_TEMPLATE: TemplateItem[] = [
  { code: 'AIR_DOCUMENTATION', category: 'AGENCY', charge_name: 'Documentation', unit: 'per AWB' },
  { code: 'AIR_TAA', category: 'OTHER', charge_name: 'Airport Authority (TAA) Charges', unit: 'per kg' },
  { code: 'AIR_NOTIFICATION', category: 'AGENCY', charge_name: 'Notification Charges', unit: 'per AWB' },
  { code: 'AIR_HANDLING', category: 'OTHER', charge_name: 'Handling Charges', unit: 'per kg' },
  { code: 'AIR_EQUIPMENT', category: 'OTHER', charge_name: 'Equipment Charges', unit: 'per AWB' },
  { code: 'AIR_SECURITY', category: 'OTHER', charge_name: 'Security Surcharge', unit: 'per kg' },
  { code: 'AIR_DATA_DISCHARGE', category: 'OTHER', charge_name: 'Data Discharge (TANCIS)', unit: 'per AWB' },
  { code: 'CF_AGENCY_FEE', category: 'AGENCY', charge_name: 'Agency Fees', unit: 'per AWB' },
];

const TEMPLATES: Record<RateCardKey, TemplateItem[]> = {
  '20ft': FCL_TEMPLATE,
  '40ft': FCL_TEMPLATE,
  'sea': SEA_LCL_TEMPLATE,
  'air': AIR_TEMPLATE,
  'road': FCL_TEMPLATE,
};

function templateFor(card: RateCardKey): TemplateItem[] {
  return TEMPLATES[card];
}

export const rateCardService = {
  /** ICD operators the tenant has an actual (non-generic) rate card for,
   *  under this card — joined with icd_directory for display name. */
  async listOperatorsForCard(tenantId: string, card: RateCardKey) {
    return db.selectFrom('clearos_rate_card_items')
      .innerJoin('icd_directory', 'icd_directory.id', 'clearos_rate_card_items.icd_operator_id')
      .select(['icd_directory.id', 'icd_directory.name', 'icd_directory.operator_type', 'icd_directory.region'])
      .distinct()
      .where('clearos_rate_card_items.tenant_id', '=', tenantId)
      .where('clearos_rate_card_items.card', '=', card)
      .orderBy('icd_directory.name')
      .execute();
  },

  /** Search the global ICD directory (Tools -> Reference -> ICD) so a
   *  tenant can attach a rate card to a real, already-licensed operator
   *  instead of typing a freeform name. */
  async searchIcdOperators(q: string) {
    let query = db.selectFrom('icd_directory').select(['id', 'name', 'operator_type', 'region']);
    if (q && q.trim()) query = query.where('name', 'ilike', `%${q.trim()}%`);
    return query.orderBy('name').limit(20).execute();
  },

  /** Template rows merged with the tenant's actual saved values (rate 0 /
   *  id null for anything not yet entered), plus any freeform extra rows
   *  the tenant added — so the UI always shows the full template even
   *  before the tenant has saved anything. icdOperatorId null/undefined
   *  means the card's generic default (not broken out by ICD). */
  async listCard(tenantId: string, card: RateCardKey, icdOperatorId?: string | null) {
    let query = db.selectFrom('clearos_rate_card_items')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('card', '=', card);
    query = icdOperatorId ? query.where('icd_operator_id', '=', icdOperatorId) : query.where('icd_operator_id', 'is', null);
    const rows = await query.orderBy('sort_order').orderBy('created_at').execute();

    const template = templateFor(card);
    const byCode = new Map(rows.filter(r => r.code).map(r => [r.code as string, r]));
    const templateRows = template.map((t, i) => {
      const existing = byCode.get(t.code);
      if (existing) return existing;
      return {
        id: null, tenant_id: tenantId, card, category: t.category, code: t.code,
        charge_name: t.charge_name, unit: t.unit, rate_amount: '0', rate_currency: 'USD', min_charge: null,
        notes: null, sort_order: i, icd_operator_id: icdOperatorId ?? null, created_at: null, updated_at: null, updated_by: null,
      };
    });
    const extraRows = rows.filter(r => !r.code);
    return [...templateRows, ...extraRows];
  },

  /** Upsert a single line item by (tenant, card, code, icdOperatorId) —
   *  used for the template rows, which may not have a DB row yet (id is
   *  null client-side until first saved). */
  async upsertTemplateItem(tenantId: string, card: RateCardKey, code: string, fields: { rate_amount?: number; rate_currency?: string; notes?: string | null; min_charge?: number | null }, userId: string, icdOperatorId?: string | null) {
    const t = templateFor(card).find(x => x.code === code);
    if (!t) throw new Error(`Unknown rate card code "${code}" for card "${card}"`);
    let existingQuery = db.selectFrom('clearos_rate_card_items').selectAll()
      .where('tenant_id', '=', tenantId).where('card', '=', card).where('code', '=', code);
    existingQuery = icdOperatorId ? existingQuery.where('icd_operator_id', '=', icdOperatorId) : existingQuery.where('icd_operator_id', 'is', null);
    const existing = await existingQuery.executeTakeFirst();
    if (existing) {
      return db.updateTable('clearos_rate_card_items').set({
        ...(fields.rate_amount != null ? { rate_amount: String(fields.rate_amount) } : {}),
        ...(fields.min_charge !== undefined ? { min_charge: fields.min_charge == null ? null : String(fields.min_charge) } : {}),
        ...(fields.rate_currency ? { rate_currency: fields.rate_currency } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
        updated_by: userId, updated_at: new Date(),
      }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
    }
    return db.insertInto('clearos_rate_card_items').values({
      tenant_id: tenantId, card, category: t.category, code: t.code,
      charge_name: t.charge_name, unit: t.unit, icd_operator_id: icdOperatorId ?? null,
      rate_amount: String(fields.rate_amount ?? 0), rate_currency: fields.rate_currency ?? 'USD',
      notes: fields.notes ?? null, sort_order: templateFor(card).indexOf(t), updated_by: userId,
    } as any).returningAll().executeTakeFirstOrThrow();
  },

  /** Edits an existing row directly by id — used for freeform extra items
   *  (which always have a real id from the moment they're created), as
   *  opposed to the template rows which are edited via upsertTemplateItem
   *  since they may not have a DB row yet. */
  async updateItem(tenantId: string, id: string, fields: { charge_name?: string; unit?: string | null; rate_amount?: number; rate_currency?: string; notes?: string | null; min_charge?: number | null }) {
    const patch: Record<string, any> = {};
    if (fields.charge_name !== undefined) patch.charge_name = fields.charge_name;
    if (fields.unit !== undefined) patch.unit = fields.unit;
    if (fields.rate_amount !== undefined) patch.rate_amount = String(fields.rate_amount);
    if (fields.min_charge !== undefined) patch.min_charge = fields.min_charge == null ? null : String(fields.min_charge);
    if (fields.rate_currency !== undefined) patch.rate_currency = fields.rate_currency;
    if (fields.notes !== undefined) patch.notes = fields.notes;
    if (Object.keys(patch).length === 0) return null;
    patch.updated_at = new Date();
    return db.updateTable('clearos_rate_card_items').set(patch)
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirst();
  },

  async addCustomItem(tenantId: string, card: RateCardKey, fields: { category: 'ICD' | 'AGENCY' | 'OTHER'; charge_name: string; unit?: string | null; rate_amount?: number; rate_currency?: string; notes?: string | null; min_charge?: number | null }, userId: string, icdOperatorId?: string | null) {
    return db.insertInto('clearos_rate_card_items').values({
      tenant_id: tenantId, card, category: fields.category, code: null, icd_operator_id: icdOperatorId ?? null,
      charge_name: fields.charge_name, unit: fields.unit ?? null,
      rate_amount: String(fields.rate_amount ?? 0), rate_currency: fields.rate_currency ?? 'USD',
      notes: fields.notes ?? null, sort_order: 999, updated_by: userId,
    } as any).returningAll().executeTakeFirstOrThrow();
  },

  async deleteItem(tenantId: string, id: string) {
    return db.deleteFrom('clearos_rate_card_items')
      .where('tenant_id', '=', tenantId).where('id', '=', id)
      .returningAll().executeTakeFirst();
  },

  /** Flat { CODE: amount } map for a card (optionally for a specific ICD
   *  operator) — what LandedCostPage.tsx's printReport() and the on-screen
   *  breakdown actually consume to preload the calculator. Only rows with
   *  a rate_amount > 0 are returned; missing codes mean "no default, stays
   *  editable at 0" rather than a fabricated number. */
  async getDefaults(tenantId: string, card: RateCardKey, icdOperatorId?: string | null): Promise<Record<string, number>> {
    let query = db.selectFrom('clearos_rate_card_items')
      .select(['code', 'rate_amount'])
      .where('tenant_id', '=', tenantId).where('card', '=', card)
      .where('code', 'is not', null);
    query = icdOperatorId ? query.where('icd_operator_id', '=', icdOperatorId) : query.where('icd_operator_id', 'is', null);
    const rows = await query.execute();
    const out: Record<string, number> = {};
    for (const r of rows) {
      const amt = Number(r.rate_amount);
      if (r.code && amt > 0) out[r.code] = amt;
    }
    return out;
  },
};
