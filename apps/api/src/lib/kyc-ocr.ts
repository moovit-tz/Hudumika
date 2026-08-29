import { GoogleGenAI } from '@google/genai';
import { parse as parseMRZ } from 'mrz';
import { dbPlatform } from '../db/client.js';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** Same lookup ocr.routes.ts/comply-ocr.routes.ts already use — one
 *  SuperAdmin-configured key (Platform Settings → OCR / Document Scanning)
 *  shared by every OCR feature on the platform, not a separate KYC key. */
export async function getGeminiApiKey(): Promise<string | null> {
  const row = await dbPlatform.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', GLOBAL_TENANT_ID)
    .executeTakeFirst();
  const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
  return settings?.ocr?.geminiApiKey || process.env.GEMINI_API_KEY || null;
}

const KYC_SYSTEM_PROMPT = `You are an identity-document verification specialist. You are shown a photo of a government-issued ID: a national identity card, a passport bio page, or a driver's license. Extract the printed identity fields.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "full_name": "",
  "date_of_birth": "YYYY-MM-DD or ''",
  "document_number": "",
  "nationality": "",
  "issuing_country": "",
  "expiry_date": "YYYY-MM-DD or ''",
  "mrz_lines": ["", ""],
  "confidence": 0.0-1.0,
  "flags": []
}

Rules:
- Use empty string "" for any field you cannot read with reasonable confidence — never guess or invent a value.
- date_of_birth and expiry_date must be YYYY-MM-DD.
- mrz_lines is the machine-readable zone at the bottom of a passport bio page (two lines of ~44 uppercase letters/digits/"<" characters) — copy it EXACTLY as printed, character for character, including "<" fill characters. Empty array if this document has no MRZ (national ID cards and most driver's licenses don't).
- "flags" is an array of short strings for anything that looks wrong: "EXPIRED", "IMAGE_UNCLEAR", "NOT_AN_ID_DOCUMENT", "TAMPERED_LOOKING".
- If the image is not a government ID at all, set every field to "" and add "NOT_AN_ID_DOCUMENT" to flags.
`;

export interface KycExtraction {
  fullName: string | null;
  dob: string | null;
  documentNumber: string | null;
  nationality: string | null;
  issuingCountry: string | null;
  expiry: string | null;
  mrzRaw: string | null;
  mrzValid: boolean | null;
  confidence: number | null;
  flags: string[];
}

/** Real OCR (no simulated fallback — see this function's own caller for
 *  why: a fabricated identity extraction is a materially different risk
 *  than a fabricated demo shipping document). Throws with a clear message
 *  if no Gemini key is configured; the route maps that to a 503. */
export async function extractKycDocument(imageBase64: string, mediaType: string): Promise<KycExtraction> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('DOCUMENT_READING_UNAVAILABLE');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mediaType, data: imageBase64 } },
        { text: 'Extract this identity document\'s fields and return only the JSON.' },
      ],
    }],
    config: { systemInstruction: KYC_SYSTEM_PROMPT, responseMimeType: 'application/json' },
  });

  const raw = (response.text ?? '{}').trim();
  const result = JSON.parse(raw);

  const mrzLines: string[] = Array.isArray(result.mrz_lines) ? result.mrz_lines.filter((l: unknown) => typeof l === 'string' && l.trim()) : [];
  let mrzRaw: string | null = null;
  let mrzValid: boolean | null = null;
  if (mrzLines.length >= 2) {
    mrzRaw = mrzLines.join('\n');
    try {
      const parsed = parseMRZ(mrzLines);
      mrzValid = parsed.valid;
    } catch {
      // A line Gemini read that doesn't parse as any known MRZ format at
      // all is itself informative — recorded as false, not swallowed.
      mrzValid = false;
    }
  }

  return {
    fullName: result.full_name || null,
    dob: result.date_of_birth || null,
    documentNumber: result.document_number || null,
    nationality: result.nationality || null,
    issuingCountry: result.issuing_country || null,
    expiry: result.expiry_date || null,
    mrzRaw,
    mrzValid,
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    flags: Array.isArray(result.flags) ? result.flags : [],
  };
}

const KYB_SYSTEM_PROMPT = `You are a business-registration document specialist. You are shown a photo of a company's registration document: a certificate of incorporation, a business licence, or a registry printout (e.g. Tanzania's BRELA).

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "company_name": "",
  "registry_number": "",
  "entity_type": "",
  "registration_status": "",
  "incorporation_date": "YYYY-MM-DD or ''",
  "confidence": 0.0-1.0,
  "flags": []
}

Rules:
- Use empty string "" for any field you cannot read with reasonable confidence — never guess or invent a value.
- entity_type is the legal form as printed (e.g. "Private Limited Company", "Sole Proprietorship", "Partnership").
- registration_status is whatever status word is printed (e.g. "Active", "Registered") — leave "" if none is printed.
- "flags": "IMAGE_UNCLEAR", "NOT_A_REGISTRATION_DOCUMENT", "TAMPERED_LOOKING".
- If the image is not a business-registration document at all, set every field to "" and add "NOT_A_REGISTRATION_DOCUMENT" to flags.
`;

export interface KybExtraction {
  companyName: string | null;
  registryNumber: string | null;
  entityType: string | null;
  registrationStatus: string | null;
  incorporationDate: string | null;
  confidence: number | null;
  flags: string[];
}

/** Same engine/key as extractKycDocument above, different prompt/target —
 *  no simulated fallback here either. */
export async function extractKybDocument(imageBase64: string, mediaType: string): Promise<KybExtraction> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('DOCUMENT_READING_UNAVAILABLE');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mediaType, data: imageBase64 } },
        { text: 'Extract this business registration document\'s fields and return only the JSON.' },
      ],
    }],
    config: { systemInstruction: KYB_SYSTEM_PROMPT, responseMimeType: 'application/json' },
  });

  const raw = (response.text ?? '{}').trim();
  const result = JSON.parse(raw);

  return {
    companyName: result.company_name || null,
    registryNumber: result.registry_number || null,
    entityType: result.entity_type || null,
    registrationStatus: result.registration_status || null,
    incorporationDate: result.incorporation_date || null,
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    flags: Array.isArray(result.flags) ? result.flags : [],
  };
}
