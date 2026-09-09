// ─── eSign — AI assistance (Phase S8) ───────────────────────────────────────
// Reuses the platform's existing Gemini-vision OCR key (ocr.routes.ts's
// getGeminiApiKey — the same one sign-seal-verify.service.ts already calls
// for content comparison), not a second AI integration. Gemini reads PDF
// bytes directly via inlineData, no rasterization step needed — same as
// extractDocumentText there.
//
// Bounded to exactly the two tasks the plan calls for: missing-field
// detection and witness/notary-block detection on an uploaded template.
// Never lets the model declare legal validity or completeness — the
// response is phrased as suggestions a human preparer accepts or ignores,
// the same "assistive, not authoritative" pattern hs_classification_events
// already established for HS-code suggestions in ClearOS. No simulated
// fallback if the key isn't configured: `available: false` is returned
// honestly rather than a fabricated result standing in for a real one.
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../routes/ocr.routes.js';

export interface DetectedField {
  description: string; // e.g. "Blank signature line for the second party"
  page: number | null;  // 1-indexed, null if the model couldn't tell
}

export interface DetectedBlock {
  type: 'witness' | 'notary_or_oath';
  description: string; // e.g. "\"Sworn before me\" jurat block with a blank commissioner line"
  page: number | null;
}

export interface SigningAssistResult {
  available: boolean;
  missingFields: DetectedField[];
  blocks: DetectedBlock[];
  reason?: string;
}

const PROMPT = `You are assisting someone preparing a document for electronic signature. Look at every page of this document and identify two things:

1. MISSING FIELDS — blank signature lines, date fields, name fields, or similar "___" placeholder blanks that appear to need to be filled in or signed, but are still empty.
2. WITNESS OR NOTARY/OATH BLOCKS — any section with witnessing language ("Witnessed by", "In the presence of", a witness signature line) or notarial/oath language ("Sworn before me", "Commissioner for Oaths", "Notary Public", a jurat/attestation clause).

This is a SUGGESTION tool only — you are not certifying the document is complete, valid, or ready to sign. Do not comment on legal validity or sufficiency; only report what you can see on the page.

Return ONLY JSON in this exact shape:
{"missing_fields": [{"description": "<what you see>", "page": <1-indexed page number or null>}], "blocks": [{"type": "witness" | "notary_or_oath", "description": "<what you see>", "page": <1-indexed page number or null>}]}

If you find nothing in a category, return an empty array for it — never invent an entry.`;

export async function analyzeDocumentForSigningAssist(fileBase64: string, mediaType: string): Promise<SigningAssistResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return { available: false, missingFields: [], blocks: [], reason: 'AI document assistance is not configured on this platform yet.' };
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mediaType, data: fileBase64 } },
          { text: PROMPT },
        ],
      }],
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      missing_fields?: Array<{ description?: string; page?: number | null }>;
      blocks?: Array<{ type?: string; description?: string; page?: number | null }>;
    };
    return {
      available: true,
      missingFields: (parsed.missing_fields ?? [])
        .filter(f => f.description)
        .map(f => ({ description: f.description!, page: typeof f.page === 'number' ? f.page : null })),
      blocks: (parsed.blocks ?? [])
        .filter(b => b.description && (b.type === 'witness' || b.type === 'notary_or_oath'))
        .map(b => ({ type: b.type as 'witness' | 'notary_or_oath', description: b.description!, page: typeof b.page === 'number' ? b.page : null })),
    };
  } catch (err: any) {
    return { available: false, missingFields: [], blocks: [], reason: err.message || 'Document analysis failed' };
  }
}
