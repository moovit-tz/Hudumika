import { NextRequest, NextResponse } from "next/server";
import { ADMIN_API_KEY, ONDI_API_URL, adminMisconfigured, requireUser } from "./_shared";

export async function GET(req: NextRequest) {
  const authError = await requireUser(req);
  if (authError) return authError;
  if (!ADMIN_API_KEY) return adminMisconfigured();

  const res = await fetch(`${ONDI_API_URL}/clients`, { headers: { "x-admin-key": ADMIN_API_KEY } });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export async function POST(req: NextRequest) {
  const authError = await requireUser(req);
  if (authError) return authError;
  if (!ADMIN_API_KEY) return adminMisconfigured();

  const payload = await req.json();
  const res = await fetch(`${ONDI_API_URL}/clients/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_API_KEY },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
