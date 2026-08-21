import { requireEntitlement } from '../middleware/entitlement.js';
/**
 * Customs Intelligence Routes
 * API endpoints for HS code lookup, landed cost calculation,
 * compliance checking, penalty assessment, and vessel tracking.
 *
 * Free data sources:
 * - HS codes: Internal DB seeded with EAC CET 2022
 * - FX rates: open.er-api.com (no API key required)
 * - Vessel positions: AISstream.io (free WebSocket API)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  searchHsCodes,
  getHsCode,
  getValuationReference,
  classifyValuationSignal,
} from '../services/customs.service.js';
import {
  calculateLandedCost,
  calculateMultiItemLandedCost,
  checkCompliance,
  calculatePenalty,
  getVesselPosition,
  getUsdToTzs,
  getUsdRates,
  type ShipmentMode,
  type RateOverrides,
  type ContainerLot,
} from '../services/customs.service.js';
import {
  checkEligibility,
  createCertificateOfOrigin,
  listCertificatesOfOrigin,
  getCertificateOfOrigin,
  issueCertificateOfOrigin,
  renderCoOPdf,
} from '../services/origin-rules.service.js';
import { suggestHsCodes } from '../services/hs-suggest.service.js';
import { hsMemory } from '../services/intelligence.service.js';
import { callAI } from './ai.routes.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { sql } from 'kysely';

/** Whitelists and coerces the caller-supplied rate overrides. Anything not
 *  a finite, non-negative number is dropped rather than defaulted, so a
 *  malformed value falls back to the tariff-table rate instead of silently
 *  becoming 0% (which would zero out a tax line). */
function parseRateOverrides(raw: any): RateOverrides | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const KEYS: (keyof RateOverrides)[] = ['duty_rate', 'vat_rate', 'rdl_rate', 'cpf_rate', 'wharfage_rate', 'pid_rate', 'insurance_rate'];
  const out: RateOverrides = {};
  for (const k of KEYS) {
    const n = parseFloat(raw[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Whitelists a mixed-container payload. Unknown sizes and non-positive
 *  counts are dropped rather than defaulted — a malformed lot must not
 *  silently become a container the customer gets billed for. */
function parseContainerLots(raw: any): ContainerLot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ContainerLot[] = [];
  for (const lot of raw) {
    const size = lot?.size;
    const count = Math.floor(Number(lot?.count));
    if ((size === '20ft' || size === '40ft') && Number.isFinite(count) && count > 0) {
      out.push({ size, count });
    }
  }
  return out.length > 0 ? out : undefined;
}

// Real values — calculatePenalty()'s own violation_type union
// (services/customs.service.ts) and 036_hs_customs.sql's status comment.
const VIOLATION_TYPES = ['under_declaration', 'misclassification', 'late_payment', 'no_pvoc', 'no_di', 'prohibited_goods'] as const;
const PENALTY_STATUSES = ['open', 'paid', 'appealing', 'waived'] as const;

// .catchall(z.any()) rather than .passthrough(): passthrough types every
// undeclared key as `unknown` in the parsed output, which breaks every
// downstream `body.someOptionalField` access below (they all become
// unknown/{} instead of any) — catchall(z.any()) keeps the same "accept
// anything extra" runtime behavior but types those keys as `any`.
const hsSuggestSchema = z.object({
  items: z.array(z.any()).min(1),
  per_item: z.number().optional(),
}).catchall(z.any());
const hsSuggestAiPickSchema = z.object({
  items: z.array(z.any()).min(1),
}).catchall(z.any());
// Shape-guarded only for the two required fields — every optional numeric
// field already runs through parseFloat/parseInt with NaN-safe fallbacks at
// the point of use below, which z.coerce would duplicate without adding
// protection this calculator doesn't already have.
const landedCostSchema = z.object({
  hs_code: z.string().trim().min(1),
  cif_usd: z.union([z.string(), z.number()]).refine(v => Number.isFinite(parseFloat(String(v))) && parseFloat(String(v)) > 0, 'cif_usd must be a positive number'),
}).catchall(z.any());
const landedCostMultiSchema = z.object({
  items: z.array(z.any()).min(1),
}).catchall(z.any());
const complianceCheckSchema = z.object({
  hs_code: z.string().trim().min(1),
  origin_country: z.string().trim().min(1),
}).catchall(z.any());
const penaltyCalcSchema = z.object({
  violation_type: z.enum(VIOLATION_TYPES),
}).catchall(z.any());
const penaltyPatchSchema = z.object({
  status: z.enum(PENALTY_STATUSES).optional(),
  notes: z.string().max(5000).optional(),
});

export async function customsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  // ── GET /v1/customs/hs-search?q=laptop ───────────────────────────────────────
  // Full-text + code-prefix search of HS code database
  fastify.get('/hs-search', async (request) => {
    const q = (request.query as any).q ?? '';
    const limit = parseInt((request.query as any).limit ?? '20');
    return searchHsCodes(q, limit);
  });

  // ── GET /v1/customs/hs/:code ──────────────────────────────────────────────────
  // Get full details for a specific HS code
  fastify.get('/hs/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const entry = await getHsCode(code);
    if (!entry) return reply.status(404).send({ error: `HS code ${code} not found` });
    return entry;
  });

  // ── GET /v1/customs/valuation-reference?hs_code=&country_of_origin=&declared_unit_value= ──
  // Real historical customs-value stats for this HS code (+ origin, if
  // given), aggregated across every tenant's finalized declarations — see
  // customs.service.ts's getValuationReference for the anonymization and
  // MIN_SAMPLE floor. Pass declared_unit_value to also get back a
  // normal/below_typical/above_typical classification against the best
  // (highest-sample) matching row.
  fastify.get('/valuation-reference', async (request) => {
    const { hs_code, country_of_origin, declared_unit_value } = request.query as {
      hs_code?: string; country_of_origin?: string; declared_unit_value?: string;
    };
    if (!hs_code) return { rows: [], signal: null };
    const rows = await getValuationReference(hs_code, country_of_origin);
    const declared = declared_unit_value ? Number(declared_unit_value) : null;
    const signal = declared != null && Number.isFinite(declared)
      ? classifyValuationSignal(declared, rows[0])
      : null;
    return { rows, signal };
  });

  // ── Preferential origin / Certificate of Origin (M5) ──────────────────
  // See origin-rules.service.ts's header for what's real, sourced data
  // (EAC's First Schedule subset) versus general-framework-only (AfCFTA).

  fastify.get('/origin-eligibility', async (request) => {
    const { agreement, hs_code, non_originating_value_pct, wholly_obtained_confirmed } = request.query as {
      agreement?: string; hs_code?: string; non_originating_value_pct?: string; wholly_obtained_confirmed?: string;
    };
    if (!agreement || !hs_code) return { status: 'INSUFFICIENT_DATA', basis: 'Choose an agreement and HS code.', rule: null };
    return checkEligibility({
      agreementCode: agreement,
      hsCode: hs_code,
      nonOriginatingValuePct: non_originating_value_pct != null ? Number(non_originating_value_pct) : undefined,
      whollyObtainedConfirmed: wholly_obtained_confirmed != null ? wholly_obtained_confirmed === 'true' : undefined,
    });
  });

  fastify.get('/certificates-of-origin', async (request: any, reply) => {
    const { shipment_id } = request.query as { shipment_id?: string };
    try {
      return await listCertificatesOfOrigin(request.user.tenant_id, { subjectId: shipment_id });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/certificates-of-origin/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const row = await getCertificateOfOrigin(request.user.tenant_id, id);
    if (!row) return reply.status(404).send({ error: 'Certificate of Origin not found' });
    return row;
  });

  fastify.post('/certificates-of-origin', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await createCertificateOfOrigin(request.user.tenant_id, request.user.sub, request.body)
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/certificates-of-origin/:id/issue', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await issueCertificateOfOrigin(request.user.tenant_id, id, request.user.sub);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/certificates-of-origin/:id/pdf', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const pdf = await renderCoOPdf(request.user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="coo-${id}.pdf"`);
      return reply.send(pdf);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  /**
   * GET /v1/customs/duty-check/:code
   *
   * The single-code counterpart to landed cost calculation: given one HS
   * code, what duty and excise apply, and what else could this actually be.
   * Backs the Duty Check tool, but deliberately lives as a plain versioned
   * REST route rather than page-specific logic — same auth (JWT) and
   * entitlement gate ('clearos') as every other /v1/customs/* route, so any
   * other page in the platform, or an external integration holding a valid
   * token, can call it the same way.
   *
   * "Alternatives" are sibling tariff lines under the same 4-digit heading
   * (e.g. 8471.30 → the other 8471.xx lines) — not a text search. A
   * classification a person isn't fully sure of is usually one heading over,
   * not a different chapter; the AI/word-match suggester (POST
   * /hs-suggest, /hs-suggest/ai-pick) is the tool for "I don't have a code
   * at all, only a description".
   */
  fastify.get('/duty-check/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const entry: any = await getHsCode(code);
    if (!entry) return reply.status(404).send({ error: `HS code ${code} not found` });

    const digits4 = entry.code.replace(/\./g, '').slice(0, 4);
    const alternatives = digits4.length === 4
      ? await dbPlatform.selectFrom('hs_codes')
          .select(['code', 'description', 'import_duty_rate', 'excise_rate', 'vat_rate'])
          .where(sql<boolean>`replace(code, '.', '') LIKE ${digits4 + '%'}`)
          .where('level', '=', 8)
          .where('code', '!=', entry.code)
          .orderBy('code')
          .limit(8)
          .execute()
      : [];

    return { ...entry, alternatives };
  });

  // ── GET /v1/customs/countries?q= ─────────────────────────────────────────
  // Async country search for the origin picker. Prefix matches rank above
  // substring ones so typing "tan" offers Tanzania before Mauritania.
  fastify.get('/countries', async (request) => {
    const q = String((request.query as any).q ?? '').trim().toLowerCase();
    let query = dbPlatform.selectFrom('reference_countries').select(['code', 'code3', 'name', 'is_eac']);
    if (q) query = query.where(sql<boolean>`lower(name) LIKE ${'%' + q + '%'} OR lower(code) = ${q} OR lower(code3) = ${q}`);
    const rows = await query.orderBy('name').limit(50).execute();
    if (!q) return { data: rows };
    return {
      data: rows.sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      }),
    };
  });

  // ── POST /v1/customs/hs-suggest ───────────────────────────────────────────────
  // Suggests HS codes for goods descriptions. Suggestions only — the response
  // is never written to a line by the server, and the UI requires a human to
  // accept each one, because a wrong HS code is a misclassification.
  fastify.post('/hs-suggest', async (request, reply) => {
    const body = hsSuggestSchema.parse(request.body);
    if (body.items.length > 500) {
      return reply.status(413).send({ error: 'Too many lines in one request — send at most 500.' });
    }
    const items = body.items
      .map((i: any) => ({ id: String(i?.id ?? ''), text: String(i?.text ?? '').trim() }))
      .filter((i: { id: string; text: string }) => i.id && i.text);

    const data = await suggestHsCodes(items, Math.min(Number(body.per_item) || 3, 5));

    // Overlay what this tenant has actually declared before for goods
    // described like this. It does not reorder the tariff-text ranking — it
    // sits alongside it as evidence, because a code declared consistently can
    // still be the wrong code, and the operator is the one who decides. Where
    // memory exists it is by far the strongest signal available, and it is
    // exactly what breaks the three-way ties word-frequency cannot.
    const user = request.user as any;
    const withMemory = await withTenant(user.tenant_id, trx => Promise.all(data.map(async (r) => {
      const item = items.find((i: { id: string }) => i.id === r.id);
      if (!item?.text) return r;
      try {
        const memory = await hsMemory(trx, user.tenant_id, item.text, 3);
        return memory.length ? { ...r, memory } : r;
      } catch {
        // Memory is an enhancement; a failure here must not cost the caller
        // their suggestions.
        return r;
      }
    })));
    return { data: withMemory };
  });

  // ── POST /v1/customs/hs-suggest/ai-pick ───────────────────────────────────
  // Asks the tenant's configured AI which of the candidate headings fits a
  // goods description best. Word-frequency scoring cannot separate three
  // headings that all matched the single word "bolts"; a model that has read
  // the headings can say why one of them is about fasteners and the others
  // about firearms.
  //
  // It picks from the candidates the tariff search already returned — it never
  // invents a code, and a code it names that isn't among them is discarded.
  // Nothing is written to a line here either: the answer is a recommendation
  // the user still accepts by hand.
  fastify.post('/hs-suggest/ai-pick', async (request, reply) => {
    const user = request.user;
    const body = hsSuggestAiPickSchema.parse(request.body);
    if (body.items.length > 40) {
      return reply.status(413).send({ error: 'Too many lines for one AI review — send at most 40.' });
    }

    const items = body.items
      .map((i: any) => ({
        id: String(i?.id ?? ''),
        text: String(i?.text ?? '').trim(),
        candidates: (Array.isArray(i?.candidates) ? i.candidates : [])
          .slice(0, 5)
          .map((c: any) => ({
            code: String(c?.code ?? '').trim(),
            description: String(c?.description ?? '').trim(),
            duty_rate: c?.duty_rate == null ? null : Number(c.duty_rate),
          }))
          .filter((c: any) => c.code),
      }))
      .filter((i: any) => i.id && i.text && i.candidates.length > 1);

    if (items.length === 0) {
      return reply.status(400).send({ error: 'Nothing to review — each line needs a description and at least two candidate codes.' });
    }

    // Tenant-scoped read of the AI configuration, same as ai.routes.ts.
    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings')
        .select('settings')
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      return (row?.settings as any) ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      // Said plainly rather than quietly falling back to the word-count order
      // and presenting it as an AI opinion.
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings → Integrations → AI Integration.' });
    }

    const prompt = `You are a Tanzanian customs classification assistant working from the EAC CET 2022 tariff.

For each line below, choose which of the candidate headings the goods actually belong to. Judge it on what
the goods are, not on word overlap. Watch for headings that share a word but describe something else
entirely (a "bolt" in a firearms heading is not a fastener).

Rules:
- Choose only from the candidate codes given. Never output a code that is not listed.
- If none of the candidates fits the goods, set "code" to null and say so in "reason".
- "confidence" is one of "high", "medium", "low".
- "reason" is one sentence, referring to the goods and the heading wording.

Reply with JSON only, no prose, in exactly this shape:
{"picks":[{"id":"<line id>","code":"<chosen code or null>","confidence":"high|medium|low","reason":"..."}]}

Lines:
${items.map((i: any) => `- id ${i.id} | goods: "${i.text}"\n  candidates:\n${i.candidates
      .map((c: any) => `    ${c.code} — ${c.description}${c.duty_rate != null ? ` (import duty ${c.duty_rate}%)` : ''}`)
      .join('\n')}`).join('\n')}`;

    try {
      const raw = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{ role: 'user', content: prompt }],
        2048,
        0,
      );
      let parsed: any = {};
      try {
        parsed = JSON.parse(String(raw).replace(/```json?/gi, '').replace(/```/g, '').trim());
      } catch {
        return reply.status(502).send({ error: 'The AI reply could not be read as JSON. Nothing was changed.' });
      }
      const byId = new Map(items.map((i: any) => [i.id, i]));
      const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
        .map((p: any) => {
          const line: any = byId.get(String(p?.id ?? ''));
          if (!line) return null;
          const code = p?.code == null ? null : String(p.code).trim();
          // A model naming a code outside the candidate list is guessing at a
          // tariff it was not shown — drop it rather than surface it.
          const valid = code && line.candidates.some((c: any) => c.code === code);
          return {
            id: line.id,
            code: valid ? code : null,
            confidence: ['high', 'medium', 'low'].includes(p?.confidence) ? p.confidence : 'low',
            reason: String(p?.reason ?? '').slice(0, 400)
              || (valid ? '' : 'The AI did not choose any of the candidate headings for this line.'),
          };
        })
        .filter(Boolean);
      return { picks, model: aiCfg.model || 'claude-sonnet-4-6' };
    } catch (e: any) {
      return reply.status(502).send({ error: e?.message || 'The AI request failed.' });
    }
  });

  // ── GET /v1/customs/fx-rates ──────────────────────────────────────────────────
  // Every rate against USD, so an invoice priced in Rand, Euro or Yuan can be
  // converted before it is treated as a customs value.
  fastify.get('/fx-rates', async (_request, reply) => {
    const rates = await getUsdRates();
    if (Object.keys(rates).length === 0) {
      // Never a made-up table — the caller must be able to tell "no rate" from
      // a rate, or it would convert against a fiction.
      return reply.status(503).send({ error: 'FX_UNAVAILABLE', message: 'Live exchange rates are unavailable right now.' });
    }
    return { base: 'USD', rates, source: 'open.er-api.com' };
  });

  // ── GET /v1/customs/fx-rate ───────────────────────────────────────────────────
  // Live USD → TZS exchange rate from open.er-api.com (no key required)
  fastify.get('/fx-rate', async () => {
    const rate = await getUsdToTzs();
    return {
      from: 'USD',
      to: 'TZS',
      rate,
      source: 'open.er-api.com',
      cached: true,
    };
  });

  /**
   * The part of a saved calculation that makes it reopenable.
   *
   * History used to keep totals only, so the panel could offer nothing but a
   * number and the words "re-enter items to recalculate". `payload` holds the
   * request that produced the result alongside the result itself: the inputs
   * are what let a saved estimate be amended, and the result is what lets it
   * be re-rendered without recomputing against a rate that has since moved.
   *
   * A very large consignment can run to megabytes, so it is capped. Dropping
   * the payload leaves the summary row intact — better a history entry that
   * says it cannot be reopened than a failed insert that loses it entirely.
   */
  const MAX_PAYLOAD_BYTES = 4_000_000;
  function historyExtras(body: any, result: any, itemCount: number) {
    const payload = { inputs: body, result };
    let stored: any = payload;
    try {
      if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) stored = null;
    } catch { stored = null; }
    const parentId = typeof body.parent_record_id === 'string' && body.parent_record_id ? body.parent_record_id : null;
    return {
      payload: stored ? JSON.stringify(stored) : null,
      customer_name: String(body.customer_name ?? '').trim() || null,
      customer_email: String(body.customer_email ?? '').trim() || null,
      destination: String(body.destination ?? '').trim() || null,
      title: String(body.title ?? '').trim().slice(0, 160) || null,
      // The shipment this estimate is for, when it was produced for one.
      // Validated as tenant-owned by the caller before it reaches here.
      shipment_id: typeof body.shipment_id === 'string' && body.shipment_id ? body.shipment_id : null,
      parent_id: parentId,
      // An amendment is version N+1 of the original, not a new estimate — the
      // figures a customer was already quoted stay on the record.
      version: parentId ? Math.max(2, (parseInt(body.parent_version) || 1) + 1) : 1,
      item_count: itemCount,
    };
  }

  // ── POST /v1/customs/landed-cost ──────────────────────────────────────────────
  // Full landed cost calculator with live HS rates and FX rate
  fastify.post('/landed-cost', async (request, reply) => {
    const user = request.user as any;
    const body = landedCostSchema.parse(request.body);

    const result = await calculateLandedCost({
      hs_code: body.hs_code,
      cif_usd: parseFloat(String(body.cif_usd)),
      qty: parseInt(body.qty ?? '1'),
      icd_per_container: body.icd_per_container ? parseFloat(body.icd_per_container) : undefined,
      num_containers: body.num_containers ? parseInt(body.num_containers) : undefined,
      fx_rate_override: body.fx_rate_override ? parseFloat(body.fx_rate_override) : undefined,
      shipment_ref: body.shipment_ref,
      description: body.description,
      fob_usd: body.fob_usd ? parseFloat(body.fob_usd) : undefined,
      freight_usd: body.freight_usd ? parseFloat(body.freight_usd) : undefined,
      insurance_usd: body.insurance_usd ? parseFloat(body.insurance_usd) : undefined,
      mode: body.mode as ShipmentMode | undefined,
      container: body.container,
      containers: parseContainerLots(body.containers),
      cbm: body.cbm ? parseFloat(body.cbm) : undefined,
      weight_kg: body.weight_kg ? parseFloat(body.weight_kg) : undefined,
      vehicle_condition: body.vehicle_condition,
      vehicle_age_years: body.vehicle_age_years ? parseFloat(body.vehicle_age_years) : undefined,
      is_plastic_rubber_clogs: !!body.is_plastic_rubber_clogs,
      rate_overrides: parseRateOverrides(body.rate_overrides),
    });

    // Optionally save to history
    if (body.save_to_history !== false) {
      await withTenant(user.tenant_id, trx => trx.insertInto('landed_cost_records').values({
        tenant_id: user.tenant_id,
        shipment_ref: body.shipment_ref ?? null,
        hs_code: result.hs_code,
        description: result.description,
        cif_usd: result.cif_usd,
        fx_rate: result.fx_rate,
        cif_tzs: result.cif_tzs,
        duty_rate: result.duty_rate,
        duty_amount: result.duty,
        vat_amount: result.vat,
        rdl_amount: result.rdl,
        cpf_amount: result.cpf,
        icd_amount: result.icd,
        wharfage_amount: result.wharfage,
        total_tzs: result.total,
        qty: result.qty,
        per_unit_tzs: result.per_unit,
        source: 'calculator',
        created_by: user.sub ?? null,
        // Corridor/source-market data. Stored as given; a blank stays NULL so
        // reporting can tell "not recorded" from a real value.
        origin_country: body.origin_country?.trim() || null,
        loading_point: body.loading_point?.trim() || null,
        loading_point_type: ['SEA_PORT', 'AIRPORT', 'BORDER_POST'].includes(body.loading_point_type) ? body.loading_point_type : null,
        shipment_mode: result.mode,
        price_basis: ['EXW', 'FOB', 'CFR', 'CIF'].includes(body.price_basis) ? body.price_basis : null,
        ...historyExtras(body, result, 1),
      }).execute()).catch(() => {}); // Non-blocking
    }

    return result;
  });

  // ── GET /v1/customs/landed-cost/history ───────────────────────────────────
  // The tenant's saved calculations. Search, sort and paging are done here
  // rather than in the browser: a busy tenant accumulates thousands of these,
  // and shipping them all so the page can filter locally would be both slow
  // and a way to leak rows a narrower query would never have returned.
  fastify.get('/landed-cost/history', async (request) => {
    const user = request.user as any;
    const q = request.query as any;
    const limit = Math.min(Math.max(parseInt(q.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(q.offset) || 0, 0);
    const search = String(q.q ?? '').trim();

    return withTenant(user.tenant_id, async (trx) => {
      const base = () => {
        let qb = trx.selectFrom('landed_cost_records')
          // Tenant isolation is explicit on every branch — RLS is not on its own
          // a guarantee here, and history is the one table that would otherwise
          // hand a competitor's cargo values over whole.
          .where('tenant_id', '=', user.tenant_id);
        if (search) {
          const like = `%${search.replace(/[%_]/g, m => '\\' + m)}%`;
          qb = qb.where(eb => eb.or([
            eb('description', 'ilike', like),
            eb('hs_code', 'ilike', like),
            eb('customer_name', 'ilike', like),
            eb('title', 'ilike', like),
            eb('shipment_ref', 'ilike', like),
            eb('destination', 'ilike', like),
          ]));
        }
        if (q.mode) qb = qb.where('shipment_mode', '=', String(q.mode));
        if (q.kind === 'multi') qb = qb.where('hs_code', '=', 'MULTI');
        if (q.kind === 'single') qb = qb.where('hs_code', '!=', 'MULTI');
        // Only calculations that can actually be reopened.
        if (q.reopenable === 'true') qb = qb.where('payload', 'is not', null);
        return qb;
      };

      // Allow-list, not a pass-through: an ORDER BY built from a query string is
      // an injection surface, and a sort on an unindexed column is a table scan.
      const SORTS: Record<string, 'created_at' | 'total_tzs' | 'customer_name' | 'description' | 'qty'> = {
        created_at: 'created_at', total: 'total_tzs', customer: 'customer_name',
        description: 'description', items: 'qty',
      };
      const sort = SORTS[String(q.sort ?? 'created_at')] ?? 'created_at';
      const dir = String(q.dir ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const [rows, counted] = await Promise.all([
        base()
          // The payload can be megabytes on a 200-line consignment; the list
          // only needs to know whether there is one.
          .select([
            'id', 'tenant_id', 'shipment_ref', 'hs_code', 'description', 'cif_usd', 'fx_rate',
            'cif_tzs', 'duty_amount', 'vat_amount', 'total_tzs', 'qty', 'per_unit_tzs', 'source',
            'created_by', 'created_at', 'origin_country', 'loading_point', 'shipment_mode',
            'price_basis', 'customer_name', 'customer_email', 'destination', 'title',
            'parent_id', 'version', 'item_count', 'share_token',
          ])
          .select(eb => eb.case().when('payload', 'is not', null).then(true).else(false).end().as('has_payload'))
          .orderBy(sort, dir)
          .orderBy('created_at', 'desc')
          .limit(limit).offset(offset)
          .execute(),
        base().select(eb => eb.fn.countAll<string>().as('n')).executeTakeFirst(),
      ]);

      return { data: rows, total: Number(counted?.n ?? 0), limit, offset };
    });
  });

  // ── GET /v1/customs/landed-cost/history/:id ───────────────────────────────
  // One saved calculation in full, including the payload the report renders
  // from. Scoped to the caller's tenant: an id is a guessable-looking handle,
  // and this is the endpoint that would otherwise return another tenant's
  // costings to anyone who had one.
  fastify.get<{ Params: { id: string } }>('/landed-cost/history/:id', async (request, reply) => {
    const user = request.user as any;
    const result = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('landed_cost_records').selectAll()
        .where('id', '=', request.params.id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!row) return null;

      // Every version derived from the same original, so the page can show the
      // lineage instead of presenting an amendment as an unrelated estimate.
      const rootId = row.parent_id ?? row.id;
      const versions = await trx.selectFrom('landed_cost_records')
        .select(['id', 'version', 'title', 'total_tzs', 'created_at', 'parent_id'])
        .where('tenant_id', '=', user.tenant_id)
        .where(eb => eb.or([eb('id', '=', rootId), eb('parent_id', '=', rootId)]))
        .orderBy('version', 'asc')
        .execute();

      return { ...row, versions };
    });
    if (!result) return reply.status(404).send({ error: 'Calculation not found.' });
    return result;
  });

  // ── PATCH /v1/customs/landed-cost/history/:id ─────────────────────────────
  // Renaming a saved estimate. Only the label — the figures a customer was
  // quoted are never editable in place; amending produces a new version.
  fastify.patch<{ Params: { id: string }; Body: { title?: string } }>('/landed-cost/history/:id', async (request, reply) => {
    const user = request.user as any;
    const title = String(request.body?.title ?? '').trim().slice(0, 160);
    const updated = await withTenant(user.tenant_id, trx => trx.updateTable('landed_cost_records')
      .set({ title: title || null })
      .where('id', '=', request.params.id)
      .where('tenant_id', '=', user.tenant_id)
      .returning(['id', 'title'])
      .executeTakeFirst());
    if (!updated) return reply.status(404).send({ error: 'Calculation not found.' });
    return updated;
  });

  // ── POST /v1/customs/landed-cost/multi-item ──────────────────────────────────
  // Multi-line-item landed cost: each line gets its own HS code / duty / VAT
  // assessment; freight, insurance and the destination charge are apportioned
  // across lines by FOB value share.
  fastify.post('/landed-cost/multi-item', async (request, reply) => {
    const user = request.user as any;
    const body = landedCostMultiSchema.parse(request.body);

    let result;
    try {
      result = await calculateMultiItemLandedCost({
        items: body.items.map((it: any) => ({
          description: it.description ?? '',
          hs_code: it.hs_code ?? '',
          qty: parseFloat(it.qty) || 0,
          unit_price_usd: parseFloat(it.unit_price_usd) || 0,
          rate_overrides: parseRateOverrides(it.rate_overrides),
        })),
        freight_usd: parseFloat(body.freight_usd) || 0,
        insurance_usd: body.insurance_usd !== undefined && body.insurance_usd !== '' ? parseFloat(body.insurance_usd) : undefined,
        fx_rate_override: body.fx_rate_override ? parseFloat(body.fx_rate_override) : undefined,
        mode: (body.mode as ShipmentMode) ?? 'sea_fcl',
        container: body.container,
        containers: parseContainerLots(body.containers),
        num_containers: body.num_containers ? parseInt(body.num_containers) : undefined,
        cbm: body.cbm ? parseFloat(body.cbm) : undefined,
        weight_kg: body.weight_kg ? parseFloat(body.weight_kg) : undefined,
      });
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    if (body.save_to_history !== false) {
      await withTenant(user.tenant_id, trx => trx.insertInto('landed_cost_records').values({
        tenant_id: user.tenant_id,
        shipment_ref: body.shipment_ref ?? null,
        hs_code: 'MULTI',
        description: `${result.items.length} line item${result.items.length === 1 ? '' : 's'}`,
        cif_usd: result.totals.cif_tzs / result.fx_rate,
        fx_rate: result.fx_rate,
        cif_tzs: result.totals.cif_tzs,
        duty_rate: null,
        duty_amount: result.totals.duty,
        vat_amount: result.totals.vat,
        rdl_amount: result.totals.rdl,
        cpf_amount: result.totals.cpf,
        icd_amount: result.totals.destination,
        wharfage_amount: result.totals.wharfage,
        total_tzs: result.totals.total,
        qty: result.items.length,
        per_unit_tzs: null,
        source: 'calculator-multi',
        created_by: user.sub ?? null,
        shipment_mode: result.mode,
        ...historyExtras(body, result, result.items.length),
      }).execute()).catch(() => {});
    }

    return result;
  });

  // ── POST /v1/customs/compliance-check ────────────────────────────────────────
  // Check compliance requirements for an import
  fastify.post('/compliance-check', async (request, reply) => {
    const user = request.user as any;
    const body = complianceCheckSchema.parse(request.body);

    const checks = await checkCompliance({
      hs_code: body.hs_code,
      origin_country: body.origin_country,
      goods_value_usd: body.goods_value_usd,
      import_or_export: body.import_or_export ?? 'import',
    });

    const required = checks.filter(c => c.required);
    const optional = checks.filter(c => !c.required);
    const riskLevel = required.filter(c => c.color === 'red').length > 2 ? 'HIGH'
      : required.length > 0 ? 'MEDIUM' : 'LOW';

    if (body.save_to_history !== false) {
      const hsEntry = await getHsCode(body.hs_code).catch(() => null);
      withTenant(user.tenant_id, trx => trx.insertInto('compliance_check_log').values({
        tenant_id: user.tenant_id,
        user_id: user.sub ?? null,
        hs_code: body.hs_code,
        hs_description: hsEntry?.description ?? null,
        origin_country: body.origin_country,
        total_checks: checks.length,
        required_count: required.length,
        risk_level: riskLevel,
      }).execute()).catch(() => {}); // Non-blocking
    }

    return {
      hs_code: body.hs_code,
      origin_country: body.origin_country,
      summary: {
        total_checks: checks.length,
        required_count: required.length,
        compliant_count: optional.length,
        risk_level: riskLevel,
      },
      checks,
    };
  });

  // ── GET /v1/customs/compliance-check/history ─────────────────────────────────
  fastify.get('/compliance-check/history', async (request) => {
    const user = request.user as any;
    return withTenant(user.tenant_id, trx => trx.selectFrom('compliance_check_log')
      .selectAll()
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute());
  });

  // ── POST /v1/customs/penalty-calc ────────────────────────────────────────────
  // Calculate customs penalties under CEMA CAP 403
  fastify.post('/penalty-calc', async (request, reply) => {
    const user = request.user as any;
    const body = penaltyCalcSchema.parse(request.body);

    const result = await calculatePenalty({
      violation_type: body.violation_type,
      hs_code: body.hs_code,
      declared_value_usd: body.declared_value_usd ? parseFloat(body.declared_value_usd) : undefined,
      actual_value_usd: body.actual_value_usd ? parseFloat(body.actual_value_usd) : undefined,
      declared_hs: body.declared_hs,
      actual_hs: body.actual_hs,
      late_months: body.late_months ? parseInt(body.late_months) : undefined,
      fx_rate: body.fx_rate ? parseFloat(body.fx_rate) : undefined,
      shipment_ref: body.shipment_ref,
    });

    // Save penalty record to DB if significant
    if (result.total_penalty_tzs > 0 && body.save_record !== false) {
      await withTenant(user.tenant_id, trx => trx.insertInto('customs_penalties').values({
        tenant_id: user.tenant_id,
        shipment_ref: body.shipment_ref ?? null,
        hs_code: body.hs_code ?? null,
        violation_type: body.violation_type,
        declared_value: body.declared_value_usd ? parseFloat(body.declared_value_usd) : null,
        actual_value: body.actual_value_usd ? parseFloat(body.actual_value_usd) : null,
        declared_hs: body.declared_hs ?? null,
        actual_hs: body.actual_hs ?? null,
        duty_shortfall: result.duty_shortfall_tzs,
        penalty_amount: result.total_penalty_tzs,
        late_months: body.late_months ? parseInt(body.late_months) : 0,
        currency: 'TZS',
        status: 'open',
        created_by: user.sub ?? null,
      }).execute()).catch(() => {});
    }

    return result;
  });

  // ── GET /v1/customs/penalties ─────────────────────────────────────────────────
  // List saved penalty records for tenant
  fastify.get('/penalties', async (request) => {
    const user = request.user as any;
    return withTenant(user.tenant_id, trx => trx.selectFrom('customs_penalties')
      .selectAll()
      .where('tenant_id', '=', user.tenant_id)
      .orderBy('created_at', 'desc')
      .execute());
  });

  // ── PATCH /v1/customs/penalties/:id ──────────────────────────────────────────
  // Update status of a penalty record
  fastify.patch('/penalties/:id', async (request) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };
    const { status, notes } = penaltyPatchSchema.parse(request.body);

    return withTenant(user.tenant_id, trx => trx.updateTable('customs_penalties')
      .set({ status: status ?? undefined, notes: notes ?? undefined, updated_at: new Date() })
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .returningAll()
      .executeTakeFirst());
  });

  // ── GET /v1/customs/vessel/:identifier ───────────────────────────────────────
  // Get vessel position from cache (populated by AIS tracking)
  fastify.get('/vessel/:identifier', async (request, reply) => {
    const { identifier } = request.params as { identifier: string };
    const position = await getVesselPosition(identifier);
    if (!position) {
      return reply.status(404).send({
        error: 'Vessel not found in tracking cache',
        hint: 'Ensure the vessel MMSI or IMO number is correct and has been tracked recently',
        aisstream_url: 'https://aisstream.io',
      });
    }
    return position;
  });

  // ── GET /v1/customs/vessels ───────────────────────────────────────────────────
  // List all tracked vessels (most recently updated first)
  fastify.get('/vessels', async (request) => {
    const q = (request.query as any).q ?? '';
    let query = dbPlatform.selectFrom('vessel_positions').selectAll();
    if (q) {
      query = query.where('vessel_name', 'ilike', `%${q}%`);
    }
    return query.orderBy('last_updated', 'desc').limit(100).execute();
  });

  // ── GET /v1/customs/tariff-summary ────────────────────────────────────────────
  // Returns a summary of the Tanzania tariff schedule (chapter level)
  fastify.get('/tariff-summary', async () => {
    return dbPlatform.selectFrom('hs_codes')
      .select(['code', 'description', 'import_duty_rate', 'vat_rate', 'excise_rate', 'pvoc_required', 'di_required', 'permits', 'notes'])
      .where('level', '=', 2)
      .orderBy('code', 'asc')
      .execute();
  });
}
