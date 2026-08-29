import { NextRequest, NextResponse } from 'next/server';
import { requireOrgManager, ONDI_API_URL, ADMIN_API_KEY } from '../_shared';

// See ../_shared.ts for why this proxy exists and its known scoping gap.
// OAuthClient is a platform-level catalog, same tier as SamlServiceProvider
// (see packages/ondi-db/prisma/schema.prisma) — not scoped by organizationId.

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  const gate = await requireOrgManager(req, orgId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!ADMIN_API_KEY) return NextResponse.json({ error: 'admin_proxy_misconfigured' }, { status: 500 });

  const upstream = await fetch(`${ONDI_API_URL}/clients`, {
    headers: { 'x-admin-key': ADMIN_API_KEY },
  });
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { orgId, name, redirectUris, scopes, grantTypes, logoUrl, isFirstParty } = body as {
    orgId?: string; name?: string; redirectUris?: string[]; scopes?: string[];
    grantTypes?: string[]; logoUrl?: string; isFirstParty?: boolean;
  };

  const gate = await requireOrgManager(req, orgId ?? null);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!ADMIN_API_KEY) return NextResponse.json({ error: 'admin_proxy_misconfigured' }, { status: 500 });

  const upstream = await fetch(`${ONDI_API_URL}/clients/register`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, redirectUris, scopes, grantTypes, logoUrl, isFirstParty }),
  });
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}
