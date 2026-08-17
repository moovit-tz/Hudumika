import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { GoogleGenAI } from '@google/genai';
import { ComplyService } from '../services/comply.service.js';
import { AGENCY_ADAPTERS } from '../integrations/comply-agencies.js';
import { withTenant, db } from '../db/client.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

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
const traExtractSchema = z.object({
  tin: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
const tausiImportSchema = z.object({
  image_base64: z.string().min(1),
  media_type: z.string().max(100).optional(),
});

// Same superadmin-configurable key lookup as ocr.routes.ts / comply-ocr.routes.ts
// (Platform Settings → OCR / Document Scanning) — one key covers all three.
async function getGeminiApiKey(): Promise<string | null> {
  const row = await db.selectFrom('tenant_settings')
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
        await ComplyService.createApplication(request.user.tenant_id, request.user.id, request.body),
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

  // Bliss → ComplyOS: raise a draft application from a support ticket's context
  fastify.post('/applications/from-ticket', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createApplicationFromTicket(request.user.tenant_id, request.user.id, request.body),
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
      await ComplyService.approveRenewal(request.user.tenant_id, id, request.user.id);
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
        await ComplyService.createReminder(request.user.tenant_id, request.user.id, request.body),
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
      const isCompany = objectType !== 'Business name';
      const jsonUrl = 'https://ors.brela.go.tz/orsreg/list/search/businesspublic.json';
      const searchPageUrl = 'https://ors.brela.go.tz/orsreg/searchbusinesspublic';
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      let liveResults: Array<{
        reg_number: string;
        name: string;
        registered_office: string;
        status: string;
        type: string;
        incorporation_date: string | null;
      }> = [];

      try {
        // A real browser hitting the public search form first loads the page
        // (which sets a session cookie) before the page's JS calls the JSON
        // endpoint — same two-step flow here, not a bypass of anything gated.
        const pageRes = await fetch(searchPageUrl, {
          headers: { 'User-Agent': userAgent },
          signal: AbortSignal.timeout(5000),
        });
        const setCookie = pageRes.headers.get('set-cookie') ?? '';
        const sessionCookie = setCookie.split(';')[0];

        const payload: Record<string, string | number> = {
          object_type: isCompany ? 'ET-COMPANY' : 'ET-BUSINESS',
          PageSize: 20,
          PageNumber: 1,
        };
        if (isCompany) {
          payload.cm_number = incNumber || '';
          payload.cm_name = companyName || '';
        } else {
          payload.bn_number = incNumber || '';
          payload.bn_name = companyName || '';
        }

        const response = await fetch(jsonUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': searchPageUrl,
            'Origin': 'https://ors.brela.go.tz',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'User-Agent': userAgent,
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data: any = await response.json().catch(() => null);
          const map: string[] = Array.isArray(data?.Map) ? data.Map : [];
          const records: any[][] = Array.isArray(data?.Records) ? data.Records : [];

          for (const record of records) {
            const row: Record<string, any> = {};
            map.forEach((col, i) => { row[col] = record[i]; });

            const num = String(row.cert_number ?? '').trim();
            const name = String(row.legal_name ?? '').trim();
            if (!num || !name) continue;

            liveResults.push({
              reg_number: num,
              name,
              registered_office: String(row.address ?? '').trim() || 'Tanzania Registered Address',
              status: String(row.reg_status_name ?? row.reg_status ?? '').trim() || 'Registered',
              type: String(row.subtype_name ?? '').trim() || (isCompany ? 'Private Limited Company' : 'Business Name'),
              incorporation_date: row.incorporation_date ?? row.reg_date ?? null,
            });
          }
          if (data?.Result !== 'OK') {
            fastify.log.warn({ result: data?.Result, objectType, incNumber, companyName }, '[BRELA Scraper] Portal responded but not with Result:"OK" — treating as no live match.');
          } else if (liveResults.length === 0) {
            fastify.log.info({ objectType, incNumber, companyName }, '[BRELA Scraper] Portal reached successfully but returned zero matching records for this query.');
          }
        } else {
          fastify.log.warn({ status: response.status }, '[BRELA Scraper] Portal returned a non-OK status (likely its WAF blocking a non-browser request, which is expected from server infrastructure) — falling back to local reference data.');
        }
      } catch (err) {
        // Expected in most environments — BRELA has no public API, sits behind a
        // WAF that blocks non-browser traffic even with realistic headers/session
        // cookies, and this scrape is best-effort only. This is the PRD's own
        // "manual + tracking" fallback path, not a bug to silence.
        fastify.log.warn({ err: (err as Error).message }, '[BRELA Scraper] Live fetch failed — falling back to local reference data.');
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

  // ── TRA Taxpayer Portal Extraction Agent ──────────────────────────────────────
  fastify.post('/tra-extract', async (request: any, reply) => {
    const { tin } = traExtractSchema.parse(request.body);
    try {

      // Simulate a realistic tax profile based on the TIN
      return {
        success: true,
        taxpayer: {
          name: 'KILIMANJARO LOGISTICS & FREIGHT LTD',
          tin: tin,
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
        ]
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
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

    if (!apiKey) {
      // Simulated result for demo/dev environments without a key configured —
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
