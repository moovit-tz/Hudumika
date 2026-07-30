import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { parse } from 'csv-parse/sync';

/**
 * /v1/reference — tenant-agnostic customs reference lookups (same convention
 * as hs_codes): ICD/dry-port directory, TASAC clearing-agent registry, and
 * EAC excise schedules. Read-only for all staff, authenticated, no tenant
 * filter — these tables deliberately carry no tenant_id (public-record
 * gazette data shared by every tenant on the platform).
 *
 * Writes (single-row edit, bulk CSV import) are restricted to SUPER_ADMIN:
 * this is shared cross-tenant reference data, not a tenant's own records, so
 * only the platform operator curates it — a tenant admin editing it would be
 * silently changing what every other tenant on the platform sees.
 *
 * Bulk import is a merge/upsert, never a wipe: uploaded rows are matched to
 * existing ones by a natural key (licence no., falling back to name; for
 * excise, category + item description) and updated in place. Rows with no
 * match are inserted as new. Rows in the DB that aren't in the uploaded file
 * are left untouched — nothing is deleted by an import.
 */

const REFERENCE_ADMIN = requireRole('SUPER_ADMIN');

// ── CSV header normalization — accept "Licence No.", "license_no", "License Number", etc. ──
function normalizeHeaders(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    out[key] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  }
  return out;
}

function pick(norm: Record<string, string>, aliases: string[]): string | undefined {
  for (const a of aliases) {
    const v = norm[a];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

function parseFlexibleDate(s: string | undefined): Date | null {
  if (!s) return null;
  // DD/MM/YYYY (gazette convention)
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  // YYYY-MM-DD (ISO, from <input type="date"> or a re-exported CSV)
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseCsv(buf: Buffer): Record<string, unknown>[] {
  return parse(buf, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
}

interface ImportSummary { total: number; inserted: number; updated: number; skipped: number }

export async function referenceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/reference/carriers?q=&mode=&limit=&offset= — global carrier
  // directory (ocean SCAC / air IATA / road & rail operators), tenant-agnostic.
  // Used by CarriersPage's "Browse directory" picker to one-click add real
  // carriers into a tenant's own carriers list instead of hand-typing codes.
  fastify.get('/carriers', async (req: FastifyRequest) => {
    const { q, mode } = req.query as { q?: string; mode?: string };
    const limit = Math.min(Number((req.query as any).limit) || 50, 200);
    const offset = Math.max(Number((req.query as any).offset) || 0, 0);

    let base = db.selectFrom('carrier_directory');
    if (q) base = base.where(eb => eb.or([
      eb('name', 'ilike', `%${q}%`),
      eb('scac_or_iata', 'ilike', `%${q}%`),
      eb('country', 'ilike', `%${q}%`),
    ]));
    if (mode) base = base.where('mode', '=', mode.toUpperCase());

    const [rows, total] = await Promise.all([
      base.selectAll().orderBy('name').limit(limit).offset(offset).execute(),
      base.select(eb => eb.fn.countAll().as('c')).executeTakeFirst(),
    ]);
    return { data: rows, total: Number(total?.c ?? 0), limit, offset };
  });

  // GET /v1/reference/icd-operators?q=&region=&type=
  fastify.get('/icd-operators', async (req: FastifyRequest) => {
    const { q, region, type } = req.query as { q?: string; region?: string; type?: string };
    let query = db.selectFrom('icd_directory').selectAll();
    if (q) query = query.where(eb => eb.or([
      eb('name', 'ilike', `%${q}%`),
      eb('license_no', 'ilike', `%${q}%`),
      eb('address', 'ilike', `%${q}%`),
    ]));
    if (region) query = query.where('region', '=', region);
    if (type) query = query.where('operator_type', '=', type);
    const data = await query.orderBy('name').limit(200).execute();
    return { data };
  });

  // PATCH /v1/reference/icd-operators/:id
  fastify.patch('/icd-operators/:id', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, any>;
    const editable = ['operator_type', 'name', 'email', 'tel', 'address', 'region', 'license_no', 'license_start', 'license_exp'];
    const patch: Record<string, any> = {};
    for (const k of editable) {
      if (!(k in body)) continue;
      patch[k] = (k === 'license_start' || k === 'license_exp')
        ? (body[k] ? parseFlexibleDate(String(body[k])) : null)
        : (body[k] === '' ? null : body[k]);
    }
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No editable fields provided' });
    if (!patch.name && patch.name !== undefined) return reply.status(400).send({ error: 'Name cannot be empty' });
    patch.updated_at = new Date();
    const row = await db.updateTable('icd_directory').set(patch).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Operator not found' });
    return { data: row };
  });

  // POST /v1/reference/icd-operators/import — multipart CSV, merge/upsert by license_no → name
  fastify.post('/icd-operators/import', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });
    let records: Record<string, unknown>[];
    try { records = parseCsv(await file.toBuffer()); }
    catch (e: any) { return reply.status(400).send({ error: 'Could not parse CSV: ' + (e.message || 'invalid format') }); }

    const summary: ImportSummary = { total: records.length, inserted: 0, updated: 0, skipped: 0 };
    for (const raw of records) {
      const norm = normalizeHeaders(raw);
      const name = pick(norm, ['name', 'operator', 'operator_name']);
      if (!name) { summary.skipped++; continue; }
      const license_no = pick(norm, ['license_no', 'licence_no', 'license_number', 'licence_number', 'lic']) ?? null;

      let existing = license_no
        ? await db.selectFrom('icd_directory').select('id').where('license_no', '=', license_no).executeTakeFirst()
        : undefined;
      if (!existing) {
        existing = await db.selectFrom('icd_directory').select('id').where('name', 'ilike', name).executeTakeFirst();
      }

      const fields: Record<string, any> = {};
      const operatorType = pick(norm, ['operator_type', 'type']);
      const email = pick(norm, ['email']);
      const tel = pick(norm, ['tel', 'phone', 'telephone']);
      const address = pick(norm, ['address']);
      const region = pick(norm, ['region']);
      const licenseStart = pick(norm, ['license_start', 'licence_start', 'start_date', 'start']);
      const licenseExp = pick(norm, ['license_exp', 'licence_exp', 'expiry', 'expiry_date', 'expires', 'exp']);
      if (operatorType) fields.operator_type = operatorType;
      if (email) fields.email = email;
      if (tel) fields.tel = tel;
      if (address) fields.address = address;
      if (region) fields.region = region;
      if (license_no) fields.license_no = license_no;
      if (licenseStart) fields.license_start = parseFlexibleDate(licenseStart);
      if (licenseExp) fields.license_exp = parseFlexibleDate(licenseExp);
      fields.name = name;

      if (existing) {
        fields.updated_at = new Date();
        await db.updateTable('icd_directory').set(fields).where('id', '=', existing.id).execute();
        summary.updated++;
      } else {
        await db.insertInto('icd_directory').values({ ...fields, operator_type: fields.operator_type || 'OTHER' } as any).execute();
        summary.inserted++;
      }
    }
    return { data: summary };
  });

  // GET /v1/reference/clearing-agents?q=&region=&limit=&offset=
  fastify.get('/clearing-agents', async (req: FastifyRequest) => {
    const { q, region } = req.query as { q?: string; region?: string };
    const limit = Math.min(Number((req.query as any).limit) || 50, 200);
    const offset = Math.max(Number((req.query as any).offset) || 0, 0);

    let base = db.selectFrom('clearing_agents_registry');
    if (q) base = base.where(eb => eb.or([
      eb('name', 'ilike', `%${q}%`),
      eb('license_no', 'ilike', `%${q}%`),
      eb('email', 'ilike', `%${q}%`),
    ]));
    if (region) base = base.where('region', '=', region);

    const [rows, total] = await Promise.all([
      base.selectAll().orderBy('license_no').limit(limit).offset(offset).execute(),
      base.select(eb => eb.fn.countAll().as('c')).executeTakeFirst(),
    ]);
    return { data: rows, total: Number(total?.c ?? 0), limit, offset };
  });

  // PATCH /v1/reference/clearing-agents/:id
  fastify.patch('/clearing-agents/:id', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, any>;
    const editable = ['name', 'email', 'license_no', 'region', 'address', 'tel'];
    const patch: Record<string, any> = {};
    for (const k of editable) if (k in body) patch[k] = body[k] === '' ? null : body[k];
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No editable fields provided' });
    if (patch.name === null) return reply.status(400).send({ error: 'Name cannot be empty' });
    patch.updated_at = new Date();
    const row = await db.updateTable('clearing_agents_registry').set(patch).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Agent not found' });
    return { data: row };
  });

  // POST /v1/reference/clearing-agents/import — multipart CSV, merge/upsert by license_no → name
  fastify.post('/clearing-agents/import', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });
    let records: Record<string, unknown>[];
    try { records = parseCsv(await file.toBuffer()); }
    catch (e: any) { return reply.status(400).send({ error: 'Could not parse CSV: ' + (e.message || 'invalid format') }); }

    const summary: ImportSummary = { total: records.length, inserted: 0, updated: 0, skipped: 0 };
    for (const raw of records) {
      const norm = normalizeHeaders(raw);
      const name = pick(norm, ['name', 'agent', 'agent_name']);
      if (!name) { summary.skipped++; continue; }
      const license_no = pick(norm, ['license_no', 'licence_no', 'license_number', 'licence_number', 'lic']) ?? null;

      let existing = license_no
        ? await db.selectFrom('clearing_agents_registry').select('id').where('license_no', '=', license_no).executeTakeFirst()
        : undefined;
      if (!existing) {
        existing = await db.selectFrom('clearing_agents_registry').select('id').where('name', 'ilike', name).executeTakeFirst();
      }

      const fields: Record<string, any> = { name };
      const email = pick(norm, ['email']);
      const region = pick(norm, ['region']);
      const address = pick(norm, ['address']);
      const tel = pick(norm, ['tel', 'phone', 'telephone']);
      if (email) fields.email = email;
      if (region) fields.region = region;
      if (address) fields.address = address;
      if (tel) fields.tel = tel;
      if (license_no) fields.license_no = license_no;

      if (existing) {
        fields.updated_at = new Date();
        await db.updateTable('clearing_agents_registry').set(fields).where('id', '=', existing.id).execute();
        summary.updated++;
      } else {
        await db.insertInto('clearing_agents_registry').values(fields as any).execute();
        summary.inserted++;
      }
    }
    return { data: summary };
  });

  // GET /v1/reference/excise?q=&category=
  fastify.get('/excise', async (req: FastifyRequest) => {
    const { q, category } = req.query as { q?: string; category?: string };
    let query = db.selectFrom('eac_excise_schedules').selectAll();
    if (q) query = query.where('item_description', 'ilike', `%${q}%`);
    if (category) query = query.where('category', '=', category);
    const data = await query.orderBy('category').orderBy('item_description').execute();
    return { data };
  });

  // GET /v1/reference/excise/categories
  fastify.get('/excise/categories', async () => {
    const rows = await db
      .selectFrom('eac_excise_schedules')
      .select('category')
      .distinct()
      .orderBy('category')
      .execute();
    return { data: rows.map(r => r.category) };
  });

  // PATCH /v1/reference/excise/:id
  fastify.patch('/excise/:id', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, any>;
    const editable = ['category', 'item_description', 'tz_rate', 'ke_rate', 'ug_rate', 'rw_rate', 'bi_rate'];
    const patch: Record<string, any> = {};
    for (const k of editable) if (k in body) patch[k] = body[k] === '' ? null : body[k];
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No editable fields provided' });
    if (patch.category === null || patch.item_description === null) {
      return reply.status(400).send({ error: 'Category and item description cannot be empty' });
    }
    patch.updated_at = new Date();
    const row = await db.updateTable('eac_excise_schedules').set(patch).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Excise line not found' });
    return { data: row };
  });

  // GET /v1/reference/tariff?authority=&category=&q=&limit=&offset= — TPA
  // Sea Ports Tariff Book / TASAC CFA agency-fee guide reference lines. Used
  // by CustomsReference's "Tariff" tab, LandedCostPage's additional-charges
  // picker, and ProductsServices' "add from tariff" flow.
  fastify.get('/tariff', async (req: FastifyRequest) => {
    const { authority, category, q } = req.query as { authority?: string; category?: string; q?: string };
    const limit = Math.min(Number((req.query as any).limit) || 100, 500);
    const offset = Math.max(Number((req.query as any).offset) || 0, 0);

    let base = db.selectFrom('port_tariff_items').where('status', '=', 'active');
    if (authority) base = base.where('authority', '=', authority);
    if (category) base = base.where('category', '=', category);
    if (q) base = base.where(eb => eb.or([
      eb('item_name', 'ilike', `%${q}%`),
      eb('subcategory', 'ilike', `%${q}%`),
      eb('category', 'ilike', `%${q}%`),
      eb('clause_ref', 'ilike', `%${q}%`),
    ]));

    const [rows, total] = await Promise.all([
      base.selectAll().orderBy('authority').orderBy('category').orderBy('clause_ref').limit(limit).offset(offset).execute(),
      base.select(eb => eb.fn.countAll().as('c')).executeTakeFirst(),
    ]);
    return { data: rows, total: Number(total?.c ?? 0), limit, offset };
  });

  // GET /v1/reference/tariff/categories?authority=
  fastify.get('/tariff/categories', async (req: FastifyRequest) => {
    const { authority } = req.query as { authority?: string };
    let query = db.selectFrom('port_tariff_items').select('category').distinct().where('status', '=', 'active');
    if (authority) query = query.where('authority', '=', authority);
    const rows = await query.orderBy('category').execute();
    return { data: rows.map(r => r.category) };
  });

  // PATCH /v1/reference/tariff/:id
  fastify.patch('/tariff/:id', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, any>;
    const editable = [
      'authority', 'clause_ref', 'category', 'subcategory', 'item_name', 'unit', 'cargo_type',
      'container_size', 'rate_amount', 'rate_currency', 'rate_type', 'min_charge', 'free_period',
      'source_document', 'source_page', 'notes', 'is_placeholder', 'status',
    ];
    const patch: Record<string, any> = {};
    for (const k of editable) if (k in body) patch[k] = body[k] === '' ? null : body[k];
    if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No editable fields provided' });
    if (patch.item_name === null) return reply.status(400).send({ error: 'Item name cannot be empty' });
    patch.updated_by = (req as any).user?.id ?? null;
    patch.updated_at = new Date();
    const row = await db.updateTable('port_tariff_items').set(patch).where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Tariff item not found' });
    return { data: row };
  });

  // POST /v1/reference/tariff — add a single new line item
  fastify.post('/tariff', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const b = req.body as Record<string, any>;
    if (!b.authority || !b.category || !b.item_name || !b.source_document) {
      return reply.status(400).send({ error: 'authority, category, item_name and source_document are required' });
    }
    const row = await db.insertInto('port_tariff_items').values({
      authority: b.authority, clause_ref: b.clause_ref ?? null, category: b.category,
      subcategory: b.subcategory ?? null, item_name: b.item_name, unit: b.unit ?? null,
      cargo_type: b.cargo_type ?? null, container_size: b.container_size ?? null,
      rate_amount: b.rate_amount ?? null, rate_currency: b.rate_currency ?? 'USD',
      rate_type: b.rate_type ?? 'fixed', min_charge: b.min_charge ?? null,
      free_period: b.free_period ?? null, source_document: b.source_document,
      source_page: b.source_page ?? null, notes: b.notes ?? null,
      is_placeholder: b.is_placeholder ?? false, updated_by: (req as any).user?.id ?? null,
    } as any).returningAll().executeTakeFirst();
    return reply.status(201).send({ data: row });
  });

  // POST /v1/reference/tariff/bulk — seed/refresh many rows at once (used by
  // the one-off TPA/TASAC transcription seed script). Always inserts fresh
  // rows; re-running with the same source_document + item_name will create
  // duplicates by design — this is a one-off seeding tool, not a sync, so a
  // re-run is expected to be preceded by a manual cleanup if needed.
  fastify.post('/tariff/bulk', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const items = req.body as Record<string, any>[];
    if (!Array.isArray(items) || items.length === 0) return reply.status(400).send({ error: 'Body must be a non-empty array' });
    const values = items.map(b => ({
      authority: b.authority, clause_ref: b.clause_ref ?? null, category: b.category,
      subcategory: b.subcategory ?? null, item_name: b.item_name, unit: b.unit ?? null,
      cargo_type: b.cargo_type ?? null, container_size: b.container_size ?? null,
      rate_amount: b.rate_amount ?? null, rate_currency: b.rate_currency ?? 'USD',
      rate_type: b.rate_type ?? 'fixed', min_charge: b.min_charge ?? null,
      free_period: b.free_period ?? null, source_document: b.source_document,
      source_page: b.source_page ?? null, notes: b.notes ?? null,
      is_placeholder: b.is_placeholder ?? false, updated_by: (req as any).user?.id ?? null,
    }));
    const rows = await db.insertInto('port_tariff_items').values(values as any).returningAll().execute();
    return reply.status(201).send({ data: { inserted: rows.length } });
  });

  // DELETE /v1/reference/tariff/:id
  fastify.delete('/tariff/:id', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await db.deleteFrom('port_tariff_items').where('id', '=', id).returningAll().executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Tariff item not found' });
    return { data: row };
  });

  // POST /v1/reference/excise/import — multipart CSV, merge/upsert by category + item_description
  fastify.post('/excise/import', { preHandler: REFERENCE_ADMIN }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded' });
    let records: Record<string, unknown>[];
    try { records = parseCsv(await file.toBuffer()); }
    catch (e: any) { return reply.status(400).send({ error: 'Could not parse CSV: ' + (e.message || 'invalid format') }); }

    const summary: ImportSummary = { total: records.length, inserted: 0, updated: 0, skipped: 0 };
    for (const raw of records) {
      const norm = normalizeHeaders(raw);
      const category = pick(norm, ['category', 'cat']);
      const item_description = pick(norm, ['item_description', 'item', 'description', 'product']);
      if (!category || !item_description) { summary.skipped++; continue; }

      const existing = await db.selectFrom('eac_excise_schedules').select('id')
        .where('category', 'ilike', category)
        .where('item_description', 'ilike', item_description)
        .executeTakeFirst();

      const fields: Record<string, any> = { category, item_description };
      const tz = pick(norm, ['tz_rate', 'tz', 'tanzania']);
      const ke = pick(norm, ['ke_rate', 'ke', 'kenya']);
      const ug = pick(norm, ['ug_rate', 'ug', 'uganda']);
      const rw = pick(norm, ['rw_rate', 'rw', 'rwanda']);
      const bi = pick(norm, ['bi_rate', 'bi', 'burundi']);
      if (tz) fields.tz_rate = tz;
      if (ke) fields.ke_rate = ke;
      if (ug) fields.ug_rate = ug;
      if (rw) fields.rw_rate = rw;
      if (bi) fields.bi_rate = bi;

      if (existing) {
        fields.updated_at = new Date();
        await db.updateTable('eac_excise_schedules').set(fields).where('id', '=', existing.id).execute();
        summary.updated++;
      } else {
        await db.insertInto('eac_excise_schedules').values(fields as any).execute();
        summary.inserted++;
      }
    }
    return { data: summary };
  });
}
