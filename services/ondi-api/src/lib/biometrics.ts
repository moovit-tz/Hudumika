/**
 * Face-embedding math — cosine similarity and input validation.
 *
 * What this deliberately does NOT do: extract a face embedding from an
 * image. That requires a face-detection + embedding model (e.g. MobileFaceNet),
 * and every Node option for running one here needs either a paid cloud
 * vision API (no credentials available) or native deps (`canvas`, needed by
 * `face-api.js`) that don't install cleanly in this environment (no
 * `pkg-config`/`cairo`). Rather than fake that with a placeholder that
 * "looks like" face recognition, this module works with embeddings the
 * *client* already computes — the mobile app runs an on-device TFLite
 * MobileFaceNet pipeline for local app-unlock (see project memory); this is
 * that same embedding, reaching the server for the first time.
 *
 * What this DOES do, for real: validate embedding shape, compute cosine
 * similarity, and use that similarity for two honest purposes —
 * (1) recording that a genuine liveness capture happened on this KYC
 * submission (src/routes/kyc.ts), and (2) flagging likely duplicate
 * registrations across users (src/lib/dedup.ts).
 */

// MobileFaceNet-family embeddings are commonly 128 or 192-dim; allow a
// generous range rather than hardcoding one model's exact output size.
const MIN_EMBEDDING_DIMS = 32;
const MAX_EMBEDDING_DIMS = 1024;

export function validateEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < MIN_EMBEDDING_DIMS || value.length > MAX_EMBEDDING_DIMS) return null;
  if (!value.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  return value as number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('embedding dimension mismatch');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
