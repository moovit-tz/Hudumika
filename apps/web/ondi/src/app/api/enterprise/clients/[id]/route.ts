import { NextRequest, NextResponse } from 'next/server';
import { requireOrgManager, ONDI_API_URL, ADMIN_API_KEY } from '../../_shared';

// See ../../_shared.ts for why this proxy exists and its known scoping gap.

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get('orgId');

  const gate = await requireOrgManager(req, orgId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!ADMIN_API_KEY) return NextResponse.json({ error: 'admin_proxy_misconfigured' }, { status: 500 });

  const upstream = await fetch(`${ONDI_API_URL}/clients/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_API_KEY },
  });
  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}
