import type { FastifyInstance } from 'fastify';
import { cosineSimilarity } from './biometrics.js';

// Placeholder threshold, not a calibrated one — needs empirical tuning
// against whatever embedding model ships in production. MobileFaceNet-family
// models commonly separate same-person pairs above ~0.5-0.6 cosine
// similarity on L2-normalized embeddings, but the exact cutoff is model-
// and preprocessing-specific. Set conservatively high to bias toward missed
// duplicates over wrongly flagging two different people as the same person.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Compare a user's face embedding against every other user's most recent
 * enrolled embedding. Flat O(n) scan — fine at today's scale, would need an
 * ANN index (pgvector or similar) before this becomes the bottleneck.
 */
export async function checkForDuplicateEnrollment(
  app: FastifyInstance,
  userId: string,
  embedding: number[],
): Promise<{ duplicateOfUserId: string; similarity: number } | null> {
  const others = await app.prisma.kYCRecord.findMany({
    where: { userId: { not: userId }, NOT: { selfieEmbedding: { isEmpty: true } } },
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    select: { userId: true, selfieEmbedding: true },
  });

  let best: { duplicateOfUserId: string; similarity: number } | null = null;
  for (const other of others) {
    if (other.selfieEmbedding.length !== embedding.length) continue;
    const similarity = cosineSimilarity(embedding, other.selfieEmbedding);
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { duplicateOfUserId: other.userId, similarity };
    }
  }
  return best;
}
