import { ADMIN_KEY } from './env.js';

/**
 * Gates admin-only routes behind the x-admin-key header (same convention
 * already used by authz.ts policy routes and mfa.ts stats).
 * Sends 403 and returns false on failure — caller must `return` immediately
 * when this returns false, before touching the database.
 */
export function requireAdmin(req: any, reply: any): boolean {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    reply.code(403).send({ error: 'forbidden' });
    return false;
  }
  return true;
}
