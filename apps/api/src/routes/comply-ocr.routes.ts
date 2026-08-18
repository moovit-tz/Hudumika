import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { dbPlatform } from '../db/client.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const scanSchema = z.object({
  image_base64: z.string().min(1),
  media_type: z.string().optional(),
});

// Superadmin-configurable key (Platform Settings → OCR / Document Scanning) takes
// priority over the env var — same lookup ocr.routes.ts uses for ClearOS, shared
// across both apps so a single key configured by the superadmin covers both.
// GLOBAL_TENANT_ID is a platform sentinel row, not real tenant data — dbPlatform.
async function getGeminiApiKey(): Promise<string | null> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings?.ocr?.geminiApiKey || process.env.GEMINI_API_KEY || null;
}

const SYSTEM_PROMPT = `You are a compliance-document OCR specialist for Tanzanian government-issued business certificates. Extract structured data from scanned/photographed compliance documents.

Supported document types:
- BRELA_CERT: BRELA Certificate of Incorporation / Business Name Registration
- TIN_CERT: TRA Taxpayer Identification Number (TIN) Certificate
- TAX_CLEARANCE: TRA Tax Compliance / Tax Clearance Certificate
- NSSF_CERT: NSSF Employer Registration Certificate
- WCF_CERT: WCF Employer Registration Certificate
- NHIF_CERT: NHIF Employer Registration Certificate
- OTHER: Any other compliance certificate

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "doc_type": "BRELA_CERT | TIN_CERT | TAX_CLEARANCE | NSSF_CERT | WCF_CERT | NHIF_CERT | OTHER",
  "confidence": 0.0-1.0,
  "entity_name": "",
  "cert_number": "",
  "agency_code": "BRELA | TRA | NSSF | WCF | NHIF | ''",
  "issued_date": "YYYY-MM-DD or ''",
  "expiry_date": "YYYY-MM-DD or ''",
  "registered_address": "",
  "tin": "",
  "vrn": "",
  "directors": [],
  "flags": []
}

Rules:
- Use empty string "" (or empty array) for any field you cannot extract with reasonable confidence
- "flags" is an array of short strings for anything unusual (e.g. "EXPIRED", "ILLEGIBLE", "LOW_RESOLUTION")
- Dates must be YYYY-MM-DD format
- TIN certificates and tax clearance certificates typically have no expiry_date unless explicitly stated — leave it "" in that case
`;

export async function complyOcrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));

  /**
   * POST /v1/comply/ocr/scan
   * Body: { image_base64: string, media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
   * Returns structured extraction from a compliance certificate/document, used
   * to auto-fill a new comply_certificates row before the user confirms it.
   */
  fastify.post('/scan', async (request, reply) => {
    const { image_base64, media_type = 'image/jpeg' } = scanSchema.parse(request.body);

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      // Simulated result for demo/dev environments without a key configured —
      // a superadmin can set a real key under Platform Settings → OCR.
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
              { text: 'Identify the compliance document type, then extract all available data from this certificate and return only the JSON.' },
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
      fastify.log.error(err, 'ComplyOS OCR scan failed');
      return reply.status(500).send({ error: err.message || 'OCR scan failed' });
    }
  });
}

function buildSimulatedResult() {
  return {
    doc_type: 'BRELA_CERT',
    confidence: 0.93,
    entity_name: 'ALEKA HOLDINGS LIMITED',
    cert_number: '137644169',
    agency_code: 'BRELA',
    issued_date: '2019-05-14',
    expiry_date: '',
    registered_address: 'Dar Es Salaam, Kinondoni, Mikocheni, 14112',
    tin: '137-644-169',
    vrn: '40092831-A',
    directors: ['Aleka Managing Director'],
    flags: [],
  };
}
