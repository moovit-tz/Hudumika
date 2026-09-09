// ─── Digital Execution Seal — signing key administration ──────────────────────
// SUPER_ADMIN only, and deliberately platform-wide, not per-tenant: the
// Ed25519 key that signs every tenant's seals is a single platform-level
// secret (sign-seal-crypto.service.ts), the same scope pdf-signing-
// identity.service.ts's certificate already operates at — a tenant admin
// manages their own workspace, not the cryptographic root every tenant's
// documents are signed under.
import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { listSigningKeys, rotateSigningKey, revokeSigningKey } from '../services/sign-seal-crypto.service.js';

export async function signSealAdminRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  // GET /v1/sign/admin/seal/keys — every key ever issued (active, retired,
  // revoked). Never returns key material — listSigningKeys() itself only
  // selects label/algorithm/status/timestamps, the private key column is
  // never selected outside sign-seal-crypto.service.ts's own internal use.
  fastify.get('/admin/seal/keys', async () => {
    return { keys: await listSigningKeys() };
  });

  // POST /v1/sign/admin/seal/keys/rotate — retires the current active key
  // to 'previous' and generates a fresh active one. Every seal already
  // issued keeps verifying fine (§8 — verification looks a seal's own
  // key_label up by name, never "whichever key is active today").
  fastify.post('/admin/seal/keys/rotate', async () => {
    const result = await rotateSigningKey();
    return { rotated: true, ...result };
  });

  // POST /v1/sign/admin/seal/keys/:keyLabel/revoke — marks a *non-active*
  // key revoked (must rotate off it first — see revokeSigningKey's own
  // guard). Every seal signed under it will report signatureValid=false
  // on future verification; sign_verifications records exactly when a
  // given attempt saw that result, not "was always invalid".
  fastify.post<{ Params: { keyLabel: string } }>('/admin/seal/keys/:keyLabel/revoke', async (req, reply) => {
    await revokeSigningKey(req.params.keyLabel);
    reply.status(200);
    return { revoked: true, keyLabel: req.params.keyLabel };
  });
}
