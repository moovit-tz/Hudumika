import { NextRequest } from 'next/server';

/**
 * Shared helpers for server-side proxy routes under /api/enterprise/* that
 * front admin-key-gated ondi-api endpoints (currently: the OAuth client
 * registry, services/ondi-api/src/routes/clients.ts — a genuinely
 * platform-level catalog, not org-owned, so ondi-api only knows a shared
 * x-admin-key, never a per-org caller identity).
 *
 * The SAML SP registry used to live behind this same proxy pattern, back
 * when SamlServiceProvider was platform-global. It's now org-owned
 * (organizationId on the model) and services/ondi-api/src/routes/saml.ts
 * does its own real per-org auth (extractUserId + requireManager/Member) —
 * so the web app calls it directly via apiFetch with the user's own Bearer
 * token, same as every other org-scoped resource. No proxy needed there
 * anymore.
 */

const ONDI_API_URL = process.env.ONDI_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export { ONDI_API_URL, ADMIN_API_KEY };

export type Gate = { ok: true } | { ok: false; status: number; error: string };

export async function requireOrgManager(req: NextRequest, orgId: string | null): Promise<Gate> {
  if (!orgId) return { ok: false, status: 400, error: 'org_id_required' };

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'missing_token' };

  let res: Response;
  try {
    res = await fetch(`${ONDI_API_URL}/organizations/mine`, { headers: { Authorization: auth } });
  } catch {
    return { ok: false, status: 502, error: 'upstream_unreachable' };
  }
  if (!res.ok) return { ok: false, status: 401, error: 'invalid_token' };

  const data = await res.json().catch(() => null);
  const org = (data?.organizations ?? []).find((o: any) => o.id === orgId);
  if (!org || (org.role !== 'Owner' && org.role !== 'Admin')) {
    return { ok: false, status: 403, error: 'insufficient_permission' };
  }
  return { ok: true };
}
