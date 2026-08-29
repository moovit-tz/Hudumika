import { NextRequest, NextResponse } from "next/server";
import { ADMIN_API_KEY, ONDI_API_URL, adminMisconfigured, requireUser } from "../_shared";

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/clients/[clientId]">) {
  const authError = await requireUser(req);
  if (authError) return authError;
  if (!ADMIN_API_KEY) return adminMisconfigured();

  const { clientId } = await ctx.params;
  const res = await fetch(`${ONDI_API_URL}/clients/${clientId}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_API_KEY },
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
