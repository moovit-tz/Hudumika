import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { GoogleGenAI } from '@google/genai';
import { ComplyService } from '../services/comply.service.js';
import { searchBrelaLive } from '../services/brela.service.js';
import { AGENCY_ADAPTERS } from '../integrations/comply-agencies.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';
import type { UserRole } from '@hudumika/types';
import { renderComplyDeclarationPdf } from '../services/comply-declaration-pdf.service.js';
import { logEvent, notifyRecipients, recipientsToNotify } from '../services/sign-notify.service.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Same role set as comply-renewal.job.ts's own COMPLY_MGMT_ROLES and the
// frontend's MGMT_ROLES (apps/web/src/lib/permissions.ts) — kept local
// rather than shared since every other route file in this codebase
// declares its own copy of this same constant (see api-keys.routes.ts).
const MGMT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

const renewalCreateSchema = z.object({
  cert_id: z.string().min(1),
  trigger: z.enum(['automatic', 'manual']).optional(),
});
const agencySyncSchema = z.object({ tin: z.string().trim().min(1) });
// Shape-guarded only — ComplyService.scanObligations does the real per-field
// business validation of everything besides the one required trigger field.
const obligationScanSchema = z.object({ sector: z.string().trim().min(1) }).catchall(z.any());
// Real values — ComplyBrelaSearch.tsx's own objectType state.
const brelaSearchSchema = z.object({
  objectType: z.enum(['Company', 'Business name']).optional(),
  incNumber: z.string().max(100).optional(),
  companyName: z.string().max(300).optional(),
});
// This never performs a live TRA portal login — it has no public API to call
// — so it only ever needs the TIN. It used to also require a portal
// username/password from the caller even though neither was read below;
// that shape asked the frontend to solicit the user's real TRA portal
// password into a Hudumika-hosted form for a value that was thrown away,
// which is exactly the input shape a credential-harvesting form would have.
// image_base64/media_type are optional, mirroring tausiImportSchema: the
// user can upload their own TRA portal screenshot/statement for real OCR
// extraction instead of the always-fake canned profile.
const traExtractSchema = z.object({
  tin: z.string().trim().min(1),
  image_base64: z.string().optional(),
  media_type: z.string().max(100).optional(),
});
const tausiImportSchema = z.object({
  image_base64: z.string().optional(),
  media_type: z.string().max(100).optional(),
});

// Same superadmin-configurable key lookup as ocr.routes.ts / comply-ocr.routes.ts
// (Platform Settings → OCR / Document Scanning) — one key covers all three.
async function getGeminiApiKey(): Promise<string | null> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings?.ocr?.geminiApiKey || process.env.GEMINI_API_KEY || null;
}

const TAUSI_SYSTEM_PROMPT = `You are a document-extraction specialist for Tanzania's TAMISEMI "Tausi" local government portal. A user has logged into their own Tausi account directly on the government site, exported or screenshotted their business license and levy/payment statement, and uploaded that document here for ComplyOS to file automatically.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "confidence": 0.0-1.0,
  "taxpayer": { "name": "", "tin": "", "nin": "", "registered_council": "", "region": "" },
  "licenses": [ { "name": "", "license_number": "", "lga": "", "issued_date": "YYYY-MM-DD or ''", "expiry_date": "YYYY-MM-DD or ''", "status": "Active | Lapsed | Pending | ''", "cost": 0 } ],
  "levies": [ { "name": "", "control_number": "", "amount": 0, "status": "Paid | Unpaid | ''", "due_date": "YYYY-MM-DD or ''" } ],
  "flags": []
}

Rules:
- Only extract data that is actually visible in the uploaded document — never invent license numbers, control numbers, taxpayer names, or amounts.
- Use empty string / 0 / empty array for anything not visible or not legible.
- "flags" is an array of short strings for anything unusual (e.g. "ILLEGIBLE", "PARTIAL_DOCUMENT", "NOT_A_TAUSI_DOCUMENT").
- Monetary values (cost, amount) must be plain numbers without currency symbols or commas.
`;

const TRA_SYSTEM_PROMPT = `You are a document-extraction specialist for Tanzania Revenue Authority (TRA) taxpayer portal exports. A user has logged into their own TRA account directly on the government site, exported or screenshotted their taxpayer profile / obligations / Tax Compliance Certificate / filing history, and uploaded that document here for ComplyOS to file automatically.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "taxpayer": { "name": "", "tin": "", "vrn": "", "incorporation_date": "YYYY-MM-DD or ''", "registered_office": "", "region": "", "district": "", "tax_office": "", "email": "", "phone": "", "nida": "" },
  "obligations": [ { "name": "", "status": "Active | Inactive | ''", "type": "Annual | Monthly | ''" } ],
  "tcc": { "reference": "", "issued_date": "YYYY-MM-DD or ''", "expiry_date": "YYYY-MM-DD or ''", "status": "Compliant | Non-Compliant | ''" },
  "filing_history": [ { "year": 0, "return_type": "", "filed_date": "YYYY-MM-DD or ''", "status": "Assessed | Pending | ''", "tax_due": 0, "tax_paid": 0 } ],
  "flags": []
}

Rules:
- Only extract data that is actually visible in the uploaded document — never invent a TIN, VRN, TCC reference, or monetary amounts.
- Use empty string / 0 / empty array for anything not visible or not legible.
- "flags" is an array of short strings for anything unusual (e.g. "ILLEGIBLE", "PARTIAL_DOCUMENT", "NOT_A_TRA_DOCUMENT").
- Monetary values (tax_due, tax_paid) must be plain numbers without currency symbols or commas.
`;

// Deterministic, template-based next-step suggestions derived from the
// extracted licenses/levies themselves — never invented by the model. A
// lapsed/pending license gets a renewal checklist; an unpaid levy gets a
// payment checklist. Framed to the user as ComplyOS's own suggestions, not
// as something "found" on the portal.
function buildTausiWorkflows(licenses: any[], levies: any[]) {
  const workflows: any[] = [];
  for (const lic of licenses || []) {
    if (lic.status === 'Lapsed' || lic.status === 'Pending') {
      workflows.push({
        name: `${lic.name || 'License'} Renewal`,
        description: `Suggested by ComplyOS: renew ${lic.name || 'this license'}${lic.license_number ? ` (${lic.license_number})` : ''} at ${lic.lga || 'the issuing council'}.`,
        steps: [
          { name: 'Prepare renewal application & supporting documents', order: 1, type: 'Document' },
          { name: `Submit renewal application to ${lic.lga || 'the council'}`, order: 2, type: 'Form' },
          ...(lic.cost ? [{ name: `Pay renewal fee (${Number(lic.cost).toLocaleString()} TZS)`, order: 3, type: 'Payment' }] : []),
          { name: 'Upload renewed certificate to Vault', order: lic.cost ? 4 : 3, type: 'Archiving' },
        ],
      });
    }
  }
  for (const lev of levies || []) {
    if (lev.status === 'Unpaid') {
      workflows.push({
        name: `${lev.name || 'Levy'} Payment`,
        description: `Suggested by ComplyOS: settle the outstanding ${lev.name || 'levy'}${lev.control_number ? ` (control number ${lev.control_number})` : ''}.`,
        steps: [
          ...(lev.control_number ? [{ name: `Pay via GePG using control number ${lev.control_number}`, order: 1, type: 'Payment' }] : [{ name: 'Generate GePG control number on the Tausi portal', order: 1, type: 'Payment' }]),
          { name: 'Upload payment receipt to ComplyOS', order: 2, type: 'Archiving' },
        ],
      });
    }
  }
  return workflows;
}

export async function complyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));
  // Previously nothing beyond the entitlement check — any authenticated
  // tenant user could reach license applications, the legal document vault,
  // and BRELA/TRA lookups regardless of role. Matches how every other
  // sensitive module in this platform (Ondi, NexusHR, api-keys) already
  // gates itself.
  fastify.addHook('preHandler', requireRoleOrOrgPermission(ORG_PERMISSIONS.COMPLY_MANAGE, ...MGMT_ROLES));

  // ── Dashboard ────────────────────────────────────────────────────────────────
  fastify.get('/dashboard', async (request: any, reply) => {
    try {
      return await ComplyService.getDashboardStats(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Certificates ─────────────────────────────────────────────────────────────
  fastify.get('/certificates', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      return await ComplyService.getCertificates(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/certificates', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createCertificate(request.user.tenant_id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Atomically finds-or-creates the CRM company profile for a BRELA search
  // result (deduped by BRELA registration number) and creates the linked
  // Vault certificate — see ComplyService.importBrelaCompany.
  fastify.post('/brela-import', async (request: any, reply) => {
    try {
      const { tenant_id, sub, role } = request.user;
      return reply.status(201).send(
        await ComplyService.importBrelaCompany(tenant_id, sub, role, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/certificates/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.updateCertificate(request.user.tenant_id, id, request.body);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/certificates/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.revokeCertificate(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Applications ─────────────────────────────────────────────────────────────
  fastify.get('/applications', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      return await ComplyService.getApplications(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/applications', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createApplication(request.user.tenant_id, request.user.sub, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/applications/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.updateApplication(request.user.tenant_id, id, request.body);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Request signature (METRICS_AND_SIGN_PLAN.md §5 Phase S6 — ComplyOS) ──
  // Generates a real declaration cover sheet from this application's own
  // stored facts (see comply-declaration-pdf.service.ts's own header on
  // why it's deliberately factual, not legal boilerplate) and sends it
  // through the platform's one real Sign engine — same shape
  // contracts.routes.ts's /:id/send-for-signature already uses for a
  // customer contract, applicant-as-affiant here since a compliance
  // declaration is self-attested by whoever is filing it. "Return the
  // completed document to the compliance record" (the plan's own phrasing)
  // needs no separate write-back: sign_envelope_id already links this
  // application to its envelope, so ComplyApplications.tsx reads the live
  // envelope status the same way ContractDetail.tsx already does.
  fastify.post<{ Params: { id: string } }>('/applications/:id/request-signature', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const app = await trx.selectFrom('comply_applications')
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .selectAll().executeTakeFirst();
      if (!app) return reply.status(404).send({ error: 'Application not found' });
      if (app.sign_envelope_id) return reply.status(409).send({ error: 'A declaration has already been sent for this application.' });
      if (!user.email) return reply.status(400).send({ error: 'Your account has no email on file — add one before requesting a signature.' });

      const pdfBuffer = await renderComplyDeclarationPdf(user.tenant_id, app.id);
      const documentData = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

      const envelope = await trx.insertInto('sign_envelopes').values({
        tenant_id: user.tenant_id, created_by: user.sub,
        title: `Compliance Declaration — ${app.app_number}`,
        document_data: documentData, file_name: `${app.app_number}-declaration.pdf`,
        order_mode: 'sequential', execution_type: 'AFFIDAVIT',
      }).returningAll().executeTakeFirstOrThrow();

      const recipient = await trx.insertInto('sign_recipients').values({
        envelope_id: envelope.id, tenant_id: user.tenant_id,
        name: user.name || 'Applicant', email: user.email, sign_order: 1,
        execution_role: 'AFFIANT',
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('sign_fields').values({
        envelope_id: envelope.id, tenant_id: user.tenant_id, recipient_id: recipient.id,
        field_type: 'signature', page: 1, x: 0.55, y: 0.85, width: 0.35, height: 0.07, required: true,
      }).execute();

      await logEvent(trx, envelope.id, user.tenant_id, 'created', { actorName: user.name, actorEmail: user.email, note: `Created from compliance application ${app.app_number}` });
      await trx.updateTable('sign_envelopes').set({ status: 'sent', sent_at: new Date() }).where('id', '=', envelope.id).execute();
      await logEvent(trx, envelope.id, user.tenant_id, 'sent', { actorName: user.name, actorEmail: user.email });

      await trx.updateTable('comply_applications').set({ sign_envelope_id: envelope.id, updated_at: new Date() })
        .where('id', '=', app.id).execute();

      await notifyRecipients(user.tenant_id, envelope, recipientsToNotify([recipient], 'sequential'), 'invite');

      reply.status(201);
      return { data: { sign_envelope_id: envelope.id, signing_url: `/sign/public/${recipient.token}` } };
    });
  });

  // Bliss → ComplyOS: raise a draft application from a support ticket's context
  fastify.post('/applications/from-ticket', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createApplicationFromTicket(request.user.tenant_id, request.user.sub, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/applications/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.deleteApplication(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Obligations ──────────────────────────────────────────────────────────────
  fastify.get('/obligations', async (request: any, reply) => {
    try {
      return await ComplyService.getObligations(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/obligations', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createObligation(request.user.tenant_id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/obligations/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.updateObligation(request.user.tenant_id, id, request.body);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/obligations/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.deleteObligation(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Renewals ─────────────────────────────────────────────────────────────────
  fastify.get('/renewals', async (request: any, reply) => {
    try {
      return await ComplyService.getRenewals(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/renewals', async (request: any, reply) => {
    const { cert_id, trigger } = renewalCreateSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await ComplyService.startRenewal(request.user.tenant_id, cert_id, trigger ?? 'manual'),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/renewals/:id/approve', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.approveRenewal(request.user.tenant_id, id, request.user.sub);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Agency Sync ──────────────────────────────────────────────────────────────
  fastify.post('/sync/:agencyCode', async (request: any, reply) => {
    const { tin } = agencySyncSchema.parse(request.body);
    try {
      const { agencyCode } = request.params as { agencyCode: string };
      return await ComplyService.syncAgency(request.user.tenant_id, agencyCode, tin);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // List available agency integrations (public metadata)
  fastify.get('/agencies', async (_request, _reply) => {
    return Object.values(AGENCY_ADAPTERS).map(a => ({
      code:     a.code,
      name:     a.name,
      apiReady: a.apiReady,
      channel:  a.channel,
    }));
  });

  // Agency directory (reference data for the Agencies browse page)
  // ── Business Licence Catalogue ────────────────────────────────────────────────
  fastify.get('/license-catalog', async (_request, reply) => {
    try {
      return await ComplyService.getLicenseCatalog();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/agency-directory', async (_request, reply) => {
    try {
      return await ComplyService.getAgencyDirectory();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Calendar ─────────────────────────────────────────────────────────────────
  fastify.get('/calendar', async (request: any, reply) => {
    try {
      const { year, month } = request.query as { year?: string; month?: string };
      const y = year ? parseInt(year, 10) : new Date().getFullYear();
      const m = month ? parseInt(month, 10) : new Date().getMonth();
      return await ComplyService.getCalendarEvents(request.user.tenant_id, y, m);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/reminders', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createReminder(request.user.tenant_id, request.user.sub, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/reminders/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.deleteReminder(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── AI Obligation Scan ───────────────────────────────────────────────────────
  fastify.get('/profile', async (request: any, reply) => {
    try {
      const profile = await ComplyService.getProfile(request.user.tenant_id);
      return profile ?? null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/obligation-scan', async (request: any, reply) => {
    const body = obligationScanSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await ComplyService.scanObligations(request.user.tenant_id, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── BRELA ORS Live Search & Scraper Endpoint ─────────────────────────────────
  // Real, browser-captured API contract (not reverse-engineered from minified
  // JS — this is what BRELA's own search page actually calls):
  //   POST https://ors.brela.go.tz/orsreg/list/search/businesspublic.json
  //   Content-Type: application/json
  //   Body: { object_type: "ET-COMPANY" | "ET-BUSINESS",
  //           cm_number/cm_name (company) OR bn_number/bn_name (business name),
  //           PageSize, PageNumber }
  // Response is *columnar*, not a plain array of row objects: `Map` is the
  // ordered list of field names and each `Records` entry is a parallel value
  // array (not {field: value} pairs) — zip them per row before reading fields.
  fastify.post('/brela-search', async (request: any, reply) => {
    const { objectType, incNumber, companyName } = brelaSearchSchema.parse(request.body);
    try {
      const { live, results: liveResults } = await searchBrelaLive(objectType, incNumber, companyName);
      if (!live) {
        fastify.log.warn({ objectType, incNumber, companyName }, '[BRELA Scraper] Live fetch found no match (portal unreachable, WAF-blocked, or zero real results) — falling back to local reference data.');
      }

      // Log every search — live or reference-fallback — so a tenant can see
      // its own BRELA search history (who searched what, and whether it was
      // a real portal hit) rather than the result vanishing once the page
      // is left.
      await withTenant(request.user.tenant_id, (trx) =>
        trx.insertInto('comply_brela_search_history').values({
          tenant_id:    request.user.tenant_id,
          searched_by:  request.user.sub,
          object_type:  objectType || 'Company',
          inc_number:   incNumber || null,
          company_name: companyName || null,
          is_live:      liveResults.length > 0,
          result_count: liveResults.length,
          results:      JSON.stringify(liveResults.map(r => ({
            reg_number: r.reg_number, name: r.name, status: r.status,
            type: r.type, registered_office: r.registered_office,
          }))),
        }).execute()
      ).catch((err) => fastify.log.warn({ err: (err as Error).message }, '[BRELA Search History] Failed to log search — not fatal to the search itself.'));

      return {
        success: true,
        live: liveResults.length > 0,
        results: liveResults,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── BRELA Search History ─────────────────────────────────────────────────────
  fastify.get('/brela-search-history', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, (trx) =>
        trx.selectFrom('comply_brela_search_history as h')
          // users.id is uuid, h.searched_by is text (same "created_by" audit-
          // column convention as comply_applications) — Postgres has no
          // implicit uuid = text comparison, so cast the uuid side explicitly.
          .leftJoin('users as u', (join) => join.on(sql`u.id::text`, '=', sql.ref('h.searched_by')))
          .select([
            'h.id', 'h.searched_by', 'u.name as searched_by_name', 'h.object_type',
            'h.inc_number', 'h.company_name', 'h.is_live', 'h.result_count',
            'h.results', 'h.created_at',
          ])
          .where('h.tenant_id', '=', request.user.tenant_id)
          .orderBy('h.created_at', 'desc')
          .limit(200)
          .execute()
      );

      return rows.map(r => {
        // Defensive parse — a raw JSONB round-trip through pg's parameter
        // binding can come back as a string, an already-parsed value, or
        // (for stale rows written before this was fixed) a non-array — never
        // let one bad row take down the whole history list.
        let results: unknown = r.results;
        if (typeof results === 'string') {
          try { results = JSON.parse(results); } catch { results = []; }
        }
        if (!Array.isArray(results)) results = [];

        return {
          id: r.id, searched_by: r.searched_by, searched_by_name: r.searched_by_name,
          object_type: r.object_type, inc_number: r.inc_number, company_name: r.company_name,
          is_live: r.is_live, result_count: r.result_count,
          results, created_at: (r.created_at as Date).toISOString(),
        };
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── TRA Taxpayer Portal Extraction ──────────────────────────────────────────
  // TRA has no public API (same constraint documented on /brela-search above),
  // and this never performs a live scrape/login. It used to always return the
  // same fixed demo profile regardless of the TIN searched — good for
  // previewing the shape of a taxpayer compliance record, but the same
  // "KILIMANJARO LOGISTICS" fake company for every real search. Now mirrors
  // /tausi-import exactly: when the user uploads their own TRA portal
  // screenshot/export, real Gemini OCR extracts it; with no key configured or
  // no image (the bare-TIN preview path), it falls back to the same honestly-
  // labeled simulated profile as before.
  fastify.post('/tra-extract', async (request: any, reply) => {
    const { tin, image_base64, media_type = 'image/jpeg' } = traExtractSchema.parse(request.body);

    const apiKey = await getGeminiApiKey();
    let extracted: any;
    let simulated: boolean;

    if (!apiKey || !image_base64) {
      simulated = true;
      extracted = buildSimulatedTraResult(tin);
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: media_type, data: image_base64 } },
                { text: 'Extract the taxpayer profile, obligations, Tax Compliance Certificate and filing history visible in this TRA portal document/screenshot and return only the JSON.' },
              ],
            },
          ],
          config: {
            systemInstruction: TRA_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
          },
        });
        const raw = (response.text ?? '{}').trim();
        extracted = JSON.parse(raw);
        simulated = false;
      } catch (err: any) {
        fastify.log.error(err, 'TRA document extraction failed');
        return reply.status(500).send({ error: err.message || 'Document extraction failed' });
      }
    }

    return {
      success: true,
      simulated,
      taxpayer: extracted.taxpayer,
      obligations: extracted.obligations || [],
      tcc: extracted.tcc,
      filing_history: extracted.filing_history || [],
      flags: extracted.flags || [],
    };
  });

  // ── Tausi TAMISEMI Portal Import ────────────────────────────────────────────
  // The user logs into their own Tausi account directly on the government
  // site (ComplyOS never sees their portal credentials), exports or
  // screenshots their license/levy statement, and uploads it here. This
  // extracts the real data from that upload — it does not log into or scrape
  // the portal itself.
  fastify.post('/tausi-import', async (request: any, reply) => {
    const { image_base64, media_type = 'image/jpeg' } = tausiImportSchema.parse(request.body);

    const apiKey = await getGeminiApiKey();
    let extracted: any;
    let simulated: boolean;

    if (!apiKey || !image_base64) {
      // Simulated result for demo/dev environments without a key or when capturing directly —
      // a superadmin can set a real key under Platform Settings → OCR.
      simulated = true;
      extracted = buildSimulatedTausiResult();
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: media_type, data: image_base64 } },
                { text: 'Extract all license and levy records visible in this Tausi portal document/screenshot and return only the JSON.' },
              ],
            },
          ],
          config: {
            systemInstruction: TAUSI_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
          },
        });
        const raw = (response.text ?? '{}').trim();
        extracted = JSON.parse(raw);
        simulated = false;
      } catch (err: any) {
        fastify.log.error(err, 'Tausi document extraction failed');
        return reply.status(500).send({ error: err.message || 'Document extraction failed' });
      }
    }

    return {
      success: true,
      simulated,
      taxpayer: extracted.taxpayer,
      licenses: extracted.licenses || [],
      levies: extracted.levies || [],
      workflows: buildTausiWorkflows(extracted.licenses, extracted.levies),
      flags: extracted.flags || [],
    };
  });
}

// Same fixed demo profile /tra-extract always returned before this milestone
// — kept verbatim as the honest no-key/no-image fallback (bare-TIN preview),
// just extracted into its own function to sit alongside the real OCR path.
function buildSimulatedTraResult(tin: string) {
  return {
    taxpayer: {
      name: 'KILIMANJARO LOGISTICS & FREIGHT LTD',
      tin,
      vrn: '40082910-K',
      incorporation_date: '2018-07-22',
      registered_office: 'Bandari Road, Yard 12, Kurasini',
      region: 'Dar es Salaam',
      district: 'Temeke',
      tax_office: 'Temeke Tax Office',
      email: 'tax@kilimanjarologistics.co.tz',
      phone: '+255 715 901 283',
      nida: '20180722-11102-00001-26',
    },
    obligations: [
      { name: 'Income Tax (Corporation)', status: 'Active', type: 'Annual' },
      { name: 'Value Added Tax (VAT)', status: 'Active', type: 'Monthly' },
      { name: 'Pay As You Earn (PAYE)', status: 'Active', type: 'Monthly' },
      { name: 'Skills Development Levy (SDL)', status: 'Inactive', type: 'Monthly' },
    ],
    tcc: {
      reference: 'TCC-2026-00918-B',
      issued_date: '2026-01-15',
      expiry_date: '2026-12-31',
      status: 'Compliant',
    },
    filing_history: [
      { year: 2025, return_type: 'Income Tax (Corporation)', filed_date: '2026-06-15', status: 'Assessed', tax_due: 4200000, tax_paid: 4200000 },
      { year: 2024, return_type: 'Income Tax (Corporation)', filed_date: '2025-06-20', status: 'Assessed', tax_due: 3800000, tax_paid: 3800000 },
      { year: 2026, return_type: 'VAT - June', filed_date: '2026-07-18', status: 'Pending', tax_due: 1250000, tax_paid: 1250000 },
    ],
    flags: [],
  };
}

function buildSimulatedTausiResult() {
  return {
    confidence: 0.9,
    taxpayer: {
      name: 'KILIMANJARO LOGISTICS & FREIGHT LTD',
      tin: '108-449-012',
      nin: '19900315-11102-00001-22',
      registered_council: 'Ilala Municipal Council',
      region: 'Dar es Salaam',
    },
    licenses: [
      {
        name: 'Business License (Retail Trade of Goods)',
        license_number: 'BL-2025-90182',
        lga: 'Ilala Municipal Council',
        issued_date: '2025-07-01',
        expiry_date: '2026-06-30',
        status: 'Lapsed',
        cost: 150000,
      },
      {
        name: 'Liquor License (Ordinary Retail)',
        license_number: 'LL-2025-10293',
        lga: 'Temeke Municipal Council',
        issued_date: '2025-10-16',
        expiry_date: '2026-10-15',
        status: 'Active',
        cost: 250000,
      },
    ],
    levies: [
      {
        name: 'Service Levy (Q2 2026)',
        control_number: '990220319203',
        amount: 850000,
        status: 'Unpaid',
        due_date: '2026-07-31',
      },
      {
        name: 'Billboard Advertising Fee (Annual)',
        control_number: '990220319882',
        amount: 450000,
        status: 'Unpaid',
        due_date: '2026-08-15',
      },
    ],
    flags: [],
  };
}
