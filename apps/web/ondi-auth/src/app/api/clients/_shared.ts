import { NextRequest, NextResponse } from "next/server";

export const ONDI_API_URL = process.env.NEXT_PUBLIC_ONDI_API_URL ?? "http://localhost:7020/v1";
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/**
 * services/ondi-api's /clients routes are gated by a shared x-admin-key
 * (see requireAdmin in services/ondi-api/src/lib/admin-auth.ts) rather than
 * a per-user role — there is no self-serve "developer" permission today.
 * This route only forwards to that admin surface after confirming the
 * caller is a real logged-in Ondi user, and never exposes ADMIN_API_KEY to
 * the browser.
 */
export async function requireUser(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await fetch(`${ONDI_API_URL}/auth/me`, { headers: { authorization: authHeader } });
  if (!res.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function adminMisconfigured() {
  return NextResponse.json({ error: "admin_proxy_misconfigured" }, { status: 500 });
}
