import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DeclarationService } from '../services/declaration.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { CloudSync } from '../services/cloud-sync.service.js';
import type {
  CreateDeclarationInput,
  CreateDeclarationItemInput,
  CreateDeclarationNoticeInput,
  DeclarationStatus,
} from '@hudumika/types';
import { countryCodeFromText } from '@hudumika/types';

// Real values — packages/types/src/declaration.ts.
const DECLARATION_MODES = ['NORMAL', 'SIMPLIFIED', 'PROVISIONAL', 'COMPLEMENTARY'] as const;
const TANSAD_FORM_TYPES = ['G', 'EX', 'TR'] as const;
const SELECTIVITY_CHANNELS = ['GREEN', 'YELLOW', 'RED', 'BLUE'] as const;
const DECLARATION_STATUSES = ['DRAFT', 'VALIDATED', 'SAVED', 'TRANSFERRED', 'ACCEPTED', 'ASSESSED', 'PAID', 'RELEASED', 'AMENDED', 'CANCELLED'] as const;
const NOTICE_TYPES = ['SELECTIVITY_RESULT', 'ASSESSMENT_NOTICE', 'RELEASE_NOTICE', 'PAYMENT_NOTICE', 'QUERY_NOTICE', 'AMENDMENT_NOTICE', 'CANCELLATION_NOTICE'] as const;
const TAX_TYPES = ['IMPORT_DUTY', 'VAT', 'RDL', 'APA', 'IDF', 'EXCISE', 'WITHHOLDING', 'OTHER'] as const;
// cpc_code is CPCCode = 'IM4'|'IM7'|'IM8'|'EX1'|'EX2'|'TR1'|string — the type
// itself keeps an escape hatch for codes outside the common set, so this
// only checks it's a non-empty string, not a closed enum.

const declarationCreateSchema = z.object({
  shipment_id: z.string().min(1),
  tancis_ref: z.string().trim().min(1).max(100),
  declaration_mode: z.enum(DECLARATION_MODES),
  tansad_form_type: z.enum(TANSAD_FORM_TYPES),
  clearing_office: z.string().max(200),
  reference_date: z.string(),
  total_packages: z.number().optional(),
  package_type: z.string().max(100).optional(),
  gross_weight_kg: z.number().optional(),
  net_weight_kg: z.number().optional(),
  no_of_items: z.number().optional(),
  consignment_country: z.string().max(2),
  country_of_export: z.string().max(2),
  country_of_destination: z.string().max(2),
  importer_tin: z.string().max(50),
  importer_name: z.string().max(300),
  declarant_tin: z.string().max(50),
  declarant_name: z.string().max(300),
  total_invoice_value: z.number().optional(),
  invoice_currency: z.string().max(10).optional(),
  exchange_rate: z.number().optional(),
  freight_amount: z.number().optional(),
  insurance_amount: z.number().optional(),
  other_charges: z.number().optional(),
  deductions: z.number().optional(),
  self_assessment: z.boolean().optional(),
});

// The whole-form Declaration tab save (PUT /by-shipment/:shipmentId). Every
// field the service previously spread straight into an UPDATE/INSERT with no
// allowlist — id/tenant_id/shipment_id/status/created_at/updated_at and the
// workflow timestamps (declared_at/assessed_at/paid_at/released_at) are
// deliberately absent here so a client can no longer set them: zod strips
// unrecognized keys by default, so this schema *is* the allowlist.
const declarationSaveSchema = z.object({
  tancis_ref: z.string().max(100).optional(),
  tansad_number: z.string().max(100).nullable().optional(),
  declaration_mode: z.enum(DECLARATION_MODES).optional(),
  tansad_form_type: z.enum(TANSAD_FORM_TYPES).optional(),
  clearing_office: z.string().max(200).optional(),
  reference_date: z.union([z.string(), z.date()]).optional(),
  cl_plan: z.string().max(100).optional(),
  total_packages: z.number().optional(),
  package_type: z.string().max(100).optional(),
  gross_weight_kg: z.number().optional(),
  net_weight_kg: z.number().optional(),
  ucr_number: z.string().max(100).optional(),
  no_of_items: z.number().optional(),
  consignment_country: z.string().max(2).optional(),
  country_of_export: z.string().max(2).optional(),
  trading_country: z.string().max(2).optional(),
  country_of_destination: z.string().max(2).optional(),
  exporter_tin: z.string().max(50).optional(),
  exporter_name: z.string().max(300).optional(),
  exporter_address: z.string().max(500).optional(),
  importer_tin: z.string().max(50).optional(),
  importer_name: z.string().max(300).optional(),
  importer_address: z.string().max(500).optional(),
  declarant_tin: z.string().max(50).optional(),
  declarant_name: z.string().max(300).optional(),
  declarant_address: z.string().max(500).optional(),
  delivery_term: z.string().max(50).optional(),
  delivery_place: z.string().max(200).optional(),
  invoice_number: z.string().max(100).optional(),
  invoice_date: z.union([z.string(), z.date()]).nullable().optional(),
  total_invoice_value: z.number().optional(),
  invoice_currency: z.string().max(10).optional(),
  exchange_rate: z.number().optional(),
  payment_method: z.string().max(100).optional(),
  payment_bank: z.string().max(200).optional(),
  payment_bank_account: z.string().max(100).optional(),
  security_distinction_type: z.string().max(100).optional(),
  security_account_no: z.string().max(100).optional(),
  nature_of_transaction: z.string().max(200).optional(),
  freight_amount: z.number().optional(),
  freight_currency: z.string().max(10).optional(),
  insurance_amount: z.number().optional(),
  insurance_currency: z.string().max(10).optional(),
  other_charges: z.number().optional(),
  other_charges_currency: z.string().max(10).optional(),
  deductions: z.number().optional(),
  deductions_currency: z.string().max(10).optional(),
  total_customs_value: z.number().optional(),
  self_assessment: z.boolean().optional(),
  transport_mode: z.string().max(50).optional(),
  identity_of_transport: z.string().max(200).optional(),
  nationality_of_transport: z.string().max(100).optional(),
  arrival_date: z.union([z.string(), z.date()]).nullable().optional(),
  crn: z.string().max(100).optional(),
  bl_number: z.string().max(100).optional(),
  vessel_name: z.string().max(200).optional(),
  portal_of_bl: z.string().max(200).optional(),
  shipment_place: z.string().max(200).optional(),
  discharge_place: z.string().max(200).optional(),
  discharge_date: z.union([z.string(), z.date()]).nullable().optional(),
  entry_office: z.string().max(200).optional(),
  location_of_goods: z.string().max(200).optional(),
  total_container_count: z.number().optional(),
  warehouse: z.string().max(200).optional(),
  previous_warehouse: z.string().max(200).optional(),
  period_days: z.number().optional(),
  cargo_receipt_ref: z.string().max(100).optional(),
  selectivity_channel: z.enum(SELECTIVITY_CHANNELS).optional(),
});
// Deliberately NOT .passthrough() — id/tenant_id/shipment_id/status/
// created_at/updated_at/declared_at/assessed_at/paid_at/released_at are not
// listed above, and zod's default behavior on a plain z.object() is to
// strip any key that isn't, so this schema doubles as the allowlist that
// upsertByShipment's raw `{ ...input, ... }` spread never had.
// Items are already field-picked one at a time inside
// DeclarationService.upsertByShipment (hs_code, commodity_description,
// country_of_origin, cpc_code, quantity, unit_of_measure, gross_weight_kg,
// net_weight_kg, customs_value, statistical_value) — no mass-assignment risk
// there, so this only guards it's an array of objects, not full per-field.
const declarationSaveBodySchema = z.object({
  items: z.array(z.record(z.string(), z.any())).optional(),
}).passthrough();

const statusPatchSchema = z.object({
  status: z.enum(DECLARATION_STATUSES),
});
const itemCreateSchema = z.object({
  hs_code: z.string().trim().min(1).max(20),
  country_of_origin: z.string().max(2),
  cpc_code: z.string().trim().min(1).max(10),
  quantity: z.number(),
  unit_of_measure: z.string().max(20),
  gross_weight_kg: z.number(),
  net_weight_kg: z.number(),
  customs_value: z.number(),
  statistical_value: z.number().optional(),
  is_vehicle: z.boolean().optional(),
  brand_name: z.string().max(200).optional(),
  commodity_description: z.string().max(2000).optional(),
});
const noticeCreateSchema = z.object({
  shipment_id: z.string().optional(),
  notice_type: z.enum(NOTICE_TYPES),
  notice_number: z.string().trim().min(1).max(100),
  tancis_ref: z.string().max(100),
  importer_tin: z.string().max(50),
  notice_date: z.string(),
  declare_date: z.string(),
  selectivity_channel: z.enum(SELECTIVITY_CHANNELS).optional(),
  total_tax_amount: z.number().optional(),
  bill_number: z.string().max(100).optional(),
  tax_lines: z.array(z.object({
    tax_type: z.enum(TAX_TYPES),
    hs_code: z.string().max(20).optional(),
    duty_rate_code: z.string().max(20).optional(),
    rate_percent: z.number(),
    base_amount: z.number(),
    tax_amount: z.number(),
    mot: z.number().optional(),
  })).optional(),
});

const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function declarationRoutes(fastify: FastifyInstance) {
  // Enforce authentication on all routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /**
   * Proves the :id in the path is a declaration of the caller's own tenant.
   *
   * declaration_attachments has no tenant_id, so the attachment routes below
   * cannot filter by tenant directly — they key on declaration_id alone, which
   * on its own is just an id somebody could supply. This turns that into an
   * ownership check. RLS does not cover the gap: this deployment connects as a
   * role with rolbypassrls, so the policies never evaluate.
   */
  const ownsDeclaration = async (tenantId: string, declarationId: string) =>
    withTenant(tenantId, async (trx) =>
      !!(await trx.selectFrom('declarations').select('id')
        .where('id', '=', declarationId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst()));

  /**
   * GET /v1/declarations
   * List declarations with optional filters
   */
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    const result = await DeclarationService.list(user.tenant_id, {
      shipment_id: query.shipment_id,
      status: query.status,
      selectivity_channel: query.selectivity_channel,
      search: query.search,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return result;
  });

  /**
   * GET /v1/declarations/:id
   * Get declaration with items, notices, and tax lines
   */
  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    const declaration = await DeclarationService.getById(user.tenant_id, id);
    if (!declaration) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }

    return declaration;
  });

  /**
   * POST /v1/declarations
   * Create a new TANSAD declaration linked to a shipment
   */
  fastify.post(
    '/',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const input = declarationCreateSchema.parse(request.body);

      try {
        const created = await DeclarationService.createDeclaration(
          user.tenant_id,
          input
        );
        return reply.status(201).send(created);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to create declaration',
        });
      }
    }
  );

  /**
   * GET /v1/declarations/prefill/:shipmentId
   *
   * Builds a declaration draft from what the shipment already holds. Nothing is
   * saved — the form opens populated, the filer reviews it, and the existing
   * PUT /by-shipment does the writing.
   *
   * This is the difference between 58 shipments carrying a TANSAD number and 1
   * declaration existing: re-keying BL, vessel, weights, invoice value and
   * importer by hand is why the module went unused.
   *
   * Two rules it does not break:
   *  - Nothing is invented. Every value carries a `sources` entry naming the
   *    column it came from, and anything that cannot be resolved is listed in
   *    `missing` instead of being filled with a plausible default. A country
   *    that cannot be read out of a free-text port name stays empty, because
   *    country_of_export is a legal statement on a customs entry.
   *  - The HS code is offered, never assigned. It comes back under
   *    `needsConfirmation` so the filer has to accept it — misclassification
   *    is a penalty offence, and a prefilled field is easy to skim past.
   */
  fastify.get('/prefill/:shipmentId', async (request, reply) => {
    const user = request.user;
    const { shipmentId } = request.params as { shipmentId: string };

    return withTenant(user.tenant_id, async (trx) => {
      const s = await trx.selectFrom('shipment_cases').selectAll()
        .where('id', '=', shipmentId).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!s) return reply.status(404).send({ error: 'Shipment not found' });

      if (s.declaration_id) {
        return reply.status(409).send({
          error: 'This shipment already has a declaration.',
          declarationId: s.declaration_id,
        });
      }

      const customer = s.customer_id
        ? await trx.selectFrom('customers').selectAll()
            .where('id', '=', s.customer_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
        : null;
      const tenant = await trx.selectFrom('tenants').select(['name'])
        .where('id', '=', user.tenant_id).executeTakeFirst();

      const sources: Record<string, string> = {};
      const missing: { field: string; label: string; why: string }[] = [];
      const put = <T,>(field: string, value: T, from: string): T => {
        if (value !== null && value !== undefined && value !== '') sources[field] = from;
        return value;
      };
      const need = (field: string, label: string, why: string) => missing.push({ field, label, why });

      const originCountry = countryCodeFromText(s.origin_port);
      const destCountry = countryCodeFromText(s.dest_port);
      if (!originCountry) need('country_of_export', 'Country of export', `"${s.origin_port ?? 'not set'}" is not a country we can read a code from`);
      if (!destCountry) need('country_of_destination', 'Country of destination', `"${s.dest_port ?? 'not set'}" is not a country we can read a code from`);
      if (!customer?.tax_id) need('importer_tin', 'Importer TIN', customer ? `No tax ID on file for ${customer.name}` : 'This shipment has no customer');
      if (!s.cif_value_usd) need('total_invoice_value', 'Invoice value', 'No CIF value recorded on the shipment');

      const draft = {
        // Identity — the filer supplies the real TANCIS ref on lodgement, so
        // the shipment's own reference stands in as a working label only.
        tancis_ref: put('tancis_ref', s.bl_number || s.awb_number || s.ref_number, s.bl_number ? 'shipment.bl_number' : s.awb_number ? 'shipment.awb_number' : 'shipment.ref_number'),
        tansad_number: put('tansad_number', s.tansad_number ?? null, 'shipment.tansad_number'),
        reference_date: new Date(),

        // General
        gross_weight_kg: put('gross_weight_kg', Number(s.gross_weight_kg ?? 0), 'shipment.gross_weight_kg'),
        total_packages: put('total_packages', Array.isArray(s.containers) ? s.containers.length : 0, 'shipment.containers'),

        // Trade operators
        consignment_country: originCountry ?? '',
        country_of_export: put('country_of_export', originCountry ?? '', 'shipment.origin_port'),
        country_of_destination: put('country_of_destination', destCountry ?? '', 'shipment.dest_port'),
        importer_name: put('importer_name', customer?.name ?? '', 'customer.name'),
        importer_tin: put('importer_tin', customer?.tax_id ?? '', 'customer.tax_id'),
        importer_address: put('importer_address', customer?.registered_address || customer?.address || '', 'customer.address'),
        // The declarant is the clearing agent — this workspace.
        declarant_name: put('declarant_name', tenant?.name ?? '', 'tenant.name'),

        // Financial
        total_invoice_value: put('total_invoice_value', Number(s.cif_value_usd ?? 0), 'shipment.cif_value_usd'),
        invoice_currency: 'USD',

        // Transport
        bl_number: put('bl_number', s.bl_number ?? '', 'shipment.bl_number'),
        vessel_name: put('vessel_name', s.vessel ?? '', 'shipment.vessel'),
        arrival_date: put('arrival_date', s.eta ?? null, 'shipment.eta'),
        shipment_place: put('shipment_place', s.origin_port ?? '', 'shipment.origin_port'),
        discharge_place: put('discharge_place', s.dest_port ?? '', 'shipment.dest_port'),
        total_container_count: put('total_container_count', Array.isArray(s.containers) ? s.containers.length : 0, 'shipment.containers'),
      };

      return {
        shipment: { id: s.id, refNumber: s.ref_number, goodsDescription: s.goods_desc },
        draft,
        sources,
        missing,
        // Offered for review, never applied silently.
        needsConfirmation: s.hs_code
          ? [{ field: 'hs_code', value: s.hs_code, from: 'shipment.hs_code',
               note: 'Carried from the shipment. Confirm it before lodging — a wrong classification is a penalty offence.' }]
          : [],
      };
    });
  });

  /**
   * GET /v1/declarations/by-shipment/:shipmentId
   * Fetch the full TANCIS-style declaration linked to a shipment case (if
   * one exists yet), for ShipmentDetail's in-page Declaration tab.
   */
  fastify.get('/by-shipment/:shipmentId', async (request, reply) => {
    const user = request.user;
    const { shipmentId } = request.params as { shipmentId: string };
    return DeclarationService.getByShipment(user.tenant_id, shipmentId);
  });

  /**
   * PUT /v1/declarations/by-shipment/:shipmentId
   * Create-or-update the full declaration (general/parties/financial/
   * transport + item list) for a shipment case in one save, matching how
   * ShipmentDetail's Declaration tab submits the whole form at once.
   */
  fastify.put(
    '/by-shipment/:shipmentId',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { shipmentId } = request.params as { shipmentId: string };
      const { items } = declarationSaveBodySchema.parse(request.body);
      const fields = declarationSaveSchema.parse(request.body);

      try {
        const saved = await DeclarationService.upsertByShipment(user.tenant_id, shipmentId, fields, items || [], user.sub);
        return saved;
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Failed to save declaration' });
      }
    }
  );

  /**
   * GET /v1/declarations/:id/verify-chain
   * Re-derives every declaration_events row's hash and confirms the
   * append-only chain hasn't been rewritten — mirrors SEAL's
   * GET /lots/:id/verify-chain.
   */
  fastify.get('/:id/verify-chain', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return DeclarationService.verifyChain(user.tenant_id, id);
  });

  /**
   * PATCH /v1/declarations/:id/status
   * Update declaration status (DRAFT → VALIDATED → SAVED → TRANSFERRED → etc.)
   */
  fastify.patch(
    '/:id/status',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const { status } = statusPatchSchema.parse(request.body);

      try {
        const updated = await DeclarationService.updateStatus(
          user.tenant_id,
          id,
          status,
          user.sub
        );

        // Broadcast WebSocket event
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'declaration.status_changed',
              declarationId: id,
              status,
            })
          );
        });

        return updated;
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Status update failed',
        });
      }
    }
  );

  /**
   * POST /v1/declarations/:id/items
   * Add a line item to a declaration
   */
  fastify.post(
    '/:id/items',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const input = itemCreateSchema.parse(request.body);

      try {
        const item = await DeclarationService.addItem(user.tenant_id, {
          ...input,
          declaration_id: id,
        });
        return reply.status(201).send(item);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to add item',
        });
      }
    }
  );

  /**
   * GET /v1/declarations/notices
   * List declaration notices with filters
   */
  fastify.get('/notices/list', async (request, reply) => {
    const user = request.user;
    const query = request.query as any;

    const result = await DeclarationService.listNotices(user.tenant_id, {
      declaration_id: query.declaration_id,
      notice_type: query.notice_type,
      acknowledged: query.acknowledged === 'true' ? true : query.acknowledged === 'false' ? false : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    return result;
  });

  /**
   * POST /v1/declarations/:id/notices
   * Record a TANESW notice (selectivity result, assessment, release, etc.)
   */
  fastify.post(
    '/:id/notices',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER') },
    async (request, reply) => {
      const user = request.user;
      const { id } = request.params as { id: string };
      const input = noticeCreateSchema.parse(request.body);

      // Look up the declaration to get shipment_id
      const declaration = await DeclarationService.getById(user.tenant_id, id);
      if (!declaration) {
        return reply.status(404).send({ error: 'Declaration not found' });
      }

      try {
        const notice = await DeclarationService.recordNotice(user.tenant_id, {
          ...input,
          declaration_id: id,
          shipment_id: input.shipment_id || declaration.shipment_id,
        });

        // Broadcast WebSocket event
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(
            JSON.stringify({
              type: 'declaration.notice_received',
              declarationId: id,
              noticeType: input.notice_type,
            })
          );
        });

        return reply.status(201).send(notice);
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to record notice',
        });
      }
    }
  );

  /**
   * PATCH /v1/declarations/notices/:noticeId/acknowledge
   * Mark a notice as acknowledged
   */
  fastify.patch(
    '/notices/:noticeId/acknowledge',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SENIOR', 'JUNIOR', 'OFFICER', 'MANAGER') },
    async (request, reply) => {
      const user = request.user;
      const { noticeId } = request.params as { noticeId: string };

      try {
        const updated = await DeclarationService.acknowledgeNotice(
          user.tenant_id,
          noticeId,
          user.sub
        );
        return updated;
      } catch (error: any) {
        return reply.status(400).send({
          error: error.message || 'Failed to acknowledge notice',
        });
      }
    }
  );

  // ── Attachments ───────────────────────────────────────────────

  /**
   * GET /v1/declarations/:id/attachments
   */
  fastify.get('/:id/attachments', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    if (!(await ownsDeclaration(user.tenant_id, id))) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id)
        .orderBy('document_no', 'asc')
        .execute()
    );
  });

  /**
   * POST /v1/declarations/:id/attachments/upload
   */
  fastify.post('/:id/attachments/upload', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    if (!(await ownsDeclaration(user.tenant_id, id))) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const documentType = ((data.fields.document_type as any)?.value || (request.query as any).document_type || 'Other') as string;
    const documentDescription = (data.fields.document_description as any)?.value as string | undefined;

    try {
      const fileBuffer = await data.toBuffer();
      const uploadRes = await MinioIntegration.uploadDocument(user.tenant_id, 'declarations', id, data.filename, fileBuffer);

      const attachment = await withTenant(user.tenant_id, async (trx) => {
        const countRow = await trx.selectFrom('declaration_attachments')
          .select(trx.fn.count('id').as('cnt')).where('declaration_id', '=', id).executeTakeFirst();
        const documentNo = Number(countRow?.cnt ?? 0) + 1;

        const row = await trx.insertInto('declaration_attachments').values({
          declaration_id: id,
          document_no: documentNo,
          document_type: documentType,
          document_description: documentDescription ?? null,
          filename: data.filename,
          storage_key: uploadRes.storageKey,
        }).returningAll().executeTakeFirstOrThrow();

        // Mirror into the same "Customers ▸ <customer> ▸ <BL>" Cloud folder
        // shipment documents already land in — a declaration always belongs
        // to exactly one shipment (declarations.shipment_id is NOT NULL), so
        // this needs no new entity kind, just the existing shipment sync.
        const declaration = await trx.selectFrom('declarations').select('shipment_id')
          .where('id', '=', id).executeTakeFirst();
        const shipment = declaration
          ? await trx.selectFrom('shipment_cases')
              .select(['customer_id', 'bl_number', 'awb_number', 'ref_number'])
              .where('id', '=', declaration.shipment_id).executeTakeFirst()
          : null;
        if (shipment) {
          const folderName = shipment.bl_number || shipment.awb_number || shipment.ref_number || declaration!.shipment_id;
          CloudSync.syncShipmentDoc(user.tenant_id, {
            customerId: shipment.customer_id, shipmentId: declaration!.shipment_id, blRef: folderName,
            filename: data.filename, buffer: fileBuffer, mime: data.mimetype,
          }).catch(err => console.error('[Cloud] declaration attachment sync failed:', err.message));
        }

        return row;
      });

      reply.status(201);
      return attachment;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'File upload failed' });
    }
  });

  /**
   * GET /v1/declarations/:id/attachments/:attId/download
   */
  fastify.get('/:id/attachments/:attId/download', async (request, reply) => {
    const user = request.user;
    const { id, attId } = request.params as { id: string; attId: string };
    if (!(await ownsDeclaration(user.tenant_id, id))) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const att = await trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id).where('id', '=', attId).executeTakeFirst();
      if (!att || !att.storage_key) return reply.status(404).send({ error: 'Attachment not found' });

      const fileBuffer = MinioIntegration.readFile(att.storage_key);
      if (fileBuffer) {
        const ext = (att.filename || '').split('.').pop()?.toLowerCase() || '';
        reply.header('Content-Type', ATTACHMENT_MIME_TYPES[ext] || 'application/octet-stream');
        reply.header('Content-Disposition', `inline; filename="${att.filename}"`);
        return reply.send(fileBuffer);
      }

      const signedUrl = await MinioIntegration.getSignedUrl(user.tenant_id, att.storage_key, 600);
      return { url: signedUrl };
    });
  });

  /**
   * DELETE /v1/declarations/:id/attachments/:attId
   */
  fastify.delete('/:id/attachments/:attId', async (request, reply) => {
    const user = request.user;
    const { id, attId } = request.params as { id: string; attId: string };
    if (!(await ownsDeclaration(user.tenant_id, id))) {
      return reply.status(404).send({ error: 'Declaration not found' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const att = await trx.selectFrom('declaration_attachments').selectAll()
        .where('declaration_id', '=', id).where('id', '=', attId).executeTakeFirst();
      if (!att) return reply.status(404).send({ error: 'Attachment not found' });

      if (att.storage_key) await MinioIntegration.deleteDocument(user.tenant_id, att.storage_key);
      await trx.deleteFrom('declaration_attachments').where('id', '=', attId).execute();
      reply.status(204);
      return null;
    });
  });
}
