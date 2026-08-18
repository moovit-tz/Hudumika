import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { dbPlatform } from '../db/client.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const scanSchema = z.object({
  image_base64: z.string().min(1),
  media_type: z.string().optional(),
  // Callers that would feed the result into a real calculation set this
  // false — a fabricated demo document must never become cargo lines.
  allow_simulated: z.boolean().optional(),
});

// Superadmin-configurable key (Platform Settings → OCR / Document Scanning) takes
// priority over the env var, so it can be rotated from the UI without a redeploy.
// GLOBAL_TENANT_ID is a platform sentinel row, not real tenant data — dbPlatform.
async function getGeminiApiKey(): Promise<string | null> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings?.ocr?.geminiApiKey || process.env.GEMINI_API_KEY || null;
}

const SYSTEM_PROMPT = `You are a logistics, customs, and payment document OCR specialist. Extract structured data from shipping, customs, and payment documents.

Supported document types:
- BL: Bill of Lading
- INVOICE: Commercial Invoice
- PACKING_LIST: Packing List
- AWB: Air Waybill
- TANSAD: Tanzania Revenue Authority Assessment Document (TRA / TANCIS customs declaration)
- PAYMENT_RECEIPT: Bank transfer receipt, mobile payment, CRDB / NMB / M-Pesa payment advice
- CERTIFICATE: Certificate of Origin or other certificates
- OTHER: Any other document

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "doc_type": "BL | INVOICE | PACKING_LIST | AWB | TANSAD | PAYMENT_RECEIPT | CERTIFICATE | OTHER",
  "confidence": 0.0-1.0,
  "overview": {
    "bl_number": "",
    "tansad_number": "",
    "declaration_type": "",
    "processing_office": "",
    "bank_name": "",
    "transaction_status": "",
    "from_account": "",
    "account_owner": "",
    "beneficiary_name": "",
    "phone_number": "",
    "amount_tzs": "",
    "company_category": "",
    "company_type": "",
    "transfer_date": "",
    "reference_number": "",
    "created_by": "",
    "vessel": "",
    "voyage": "",
    "origin_port": "",
    "dest_port": "",
    "goods_desc": "",
    "eta": "YYYY-MM-DD or ''",
    "free_time_end": "YYYY-MM-DD or ''",
    "container_number": "",
    "container_size": "20GP | 40GP | 40HC | 45HC | 20RF | 40RF | ''",
    "seal_number": "",
    "gross_weight_kg": "",
    "net_weight_kg": "",
    "cbm": "",
    "packages": "",
    "package_type": ""
  },
  "parties": {
    "shipper_name": "",
    "shipper_address": "",
    "shipper_country": "",
    "consignee_name": "",
    "consignee_address": "",
    "consignee_country": "",
    "consignee_tin": "",
    "notify_name": "",
    "notify_address": "",
    "declarant_name": "",
    "declarant_tin": "",
    "declarant_address": ""
  },
  "financial": {
    "invoice_number": "",
    "invoice_date": "YYYY-MM-DD or ''",
    "invoice_value_usd": "",
    "customs_value_tzs": "",
    "currency": "USD | EUR | GBP | TZS | ''",
    "incoterms": "CIF | FOB | CFR | EXW | DDP | ''",
    "freight_usd": "",
    "insurance_usd": "",
    "exchange_rate": "",
    "total_imp_duty_tzs": "",
    "total_vat_tzs": "",
    "total_excise_tzs": "",
    "total_levy_tzs": "",
    "total_tax_tzs": ""
  },
  "hs_lines": [
    {
      "item_number": "",
      "hs_code": "",
      "description": "",
      "origin_country": "",
      "quantity": "",
      "unit": "",
      "gross_weight_kg": "",
      "net_weight_kg": "",
      "value_usd": "",
      "customs_value_tzs": "",
      "imp_duty_tzs": "",
      "vat_tzs": "",
      "excise_tzs": "",
      "levy_tzs": ""
    }
  ],
  "flags": []
}

Rules:
- Use empty string "" for any field you cannot extract with reasonable confidence
- "flags" is an array of short strings for anything unusual (e.g. "HAZMAT", "REFRIGERATED", "TAX_EXEMPTION", "UPLIFT", "PENALTY", "DANGEROUS_GOODS")
- Dates must be YYYY-MM-DD format
- All monetary values should be numeric strings without currency symbols or commas
- hs_lines may have 0 or more entries depending on document type
- For TANSAD documents: tansad_number is the declaration reference (e.g. "TZNG261406947"), declaration_type is the regime code (e.g. "IM4"), processing_office is the customs station (e.g. "TZNG NAMANGA"); extract all tax lines per HS item (IMP=import duty, CPF=customs processing fee, RDL=railway development levy, VAT=value added tax)
- For TANSAD documents: shipper is the exporter, consignee is the importer/taxpayer, declarant is the clearing agent
`;

export async function ocrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  /**
   * POST /v1/ocr/scan
   * Body: { image_base64: string, media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
   * Returns structured OCR extraction from Gemini vision
   */
  fastify.post('/scan', async (request, reply) => {
    const { image_base64, media_type = 'image/jpeg', allow_simulated = true } = scanSchema.parse(request.body);

    // Gemini reads PDFs directly through inlineData, so a scanned or
    // born-digital invoice needs no client-side rasterising.
    const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!SUPPORTED.includes(media_type)) {
      return reply.status(415).send({
        error: `Unsupported document type "${media_type}". Supported: ${SUPPORTED.join(', ')}.`,
      });
    }

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      if (!allow_simulated) {
        return reply.status(503).send({
          error: 'DOCUMENT_READING_UNAVAILABLE',
          message: 'Reading documents needs an OCR key, which is not configured. A SuperAdmin sets it under Platform Settings → OCR / Document Scanning.',
        });
      }
      // Demo/dev only, and clearly labelled: a superadmin can set a real key
      // under Platform Settings → OCR / Document Scanning.
      return {
        success: true,
        simulated: true,
        result: buildSimulatedResult(),
      };
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: media_type, data: image_base64 } },
              {
                text: 'Identify the document type, then extract all available data from this document and return only the JSON. If this is a TANSAD or TRA Assessment Document, set doc_type to "TANSAD" and extract all tax/duty lines per HS item.',
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
        },
      });

      const raw = (response.text ?? '{}').trim();
      const result = JSON.parse(raw);

      return { success: true, simulated: false, result };
    } catch (err: any) {
      fastify.log.error(err, 'OCR scan failed');
      return reply.status(500).send({ error: err.message || 'OCR scan failed' });
    }
  });
}

function buildSimulatedResult() {
  return {
    doc_type: 'BL',
    confidence: 0.94,
    overview: {
      bl_number: 'MEDU' + Math.floor(1000000 + Math.random() * 9000000),
      vessel: 'MSC ANTHEA',
      voyage: '425E',
      origin_port: 'Port of Shanghai',
      dest_port: 'Port of Dar es Salaam',
      goods_desc: 'General Merchandise — Electronic Components (500 CTNs)',
      eta: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
      free_time_end: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
      container_number: 'MSCU' + Math.floor(1000000 + Math.random() * 9000000),
      container_size: '40HC',
      seal_number: 'SL' + Math.floor(100000 + Math.random() * 900000),
      gross_weight_kg: '18240',
      cbm: '67.5',
      packages: '500',
      package_type: 'CTN',
    },
    parties: {
      shipper_name: 'Shenzhen Trade Logistics Co., Ltd.',
      shipper_address: 'Unit 12, Longhua Industrial Park, Shenzhen, China 518131',
      shipper_country: 'CN',
      consignee_name: 'East Africa General Traders Ltd',
      consignee_address: 'Plot 45, Nyerere Road, Dar es Salaam, Tanzania',
      consignee_country: 'TZ',
      notify_name: 'East Africa General Traders Ltd',
      notify_address: 'Plot 45, Nyerere Road, Dar es Salaam, Tanzania',
    },
    financial: {
      invoice_number: 'INV-2026-' + Math.floor(10000 + Math.random() * 90000),
      invoice_date: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
      invoice_value_usd: '48500',
      currency: 'USD',
      incoterms: 'CIF',
      freight_usd: '3200',
      insurance_usd: '485',
      exchange_rate: '2560',
    },
    hs_lines: [
      {
        hs_code: '8471.30.00',
        description: 'Portable automatic data processing machines',
        origin_country: 'CN',
        quantity: '300',
        unit: 'PCS',
        gross_weight_kg: '9000',
        net_weight_kg: '8400',
        value_usd: '36000',
      },
      {
        hs_code: '8517.62.00',
        description: 'Apparatus for reception of voice/data',
        origin_country: 'CN',
        quantity: '200',
        unit: 'PCS',
        gross_weight_kg: '9240',
        net_weight_kg: '8640',
        value_usd: '12500',
      },
    ],
    flags: [],
  };
}
