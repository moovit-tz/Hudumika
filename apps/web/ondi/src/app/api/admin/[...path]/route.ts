import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for the Ondi admin console.
 *
 * The real ondi-api admin key (ADMIN_API_KEY) lives only in this process's
 * environment (apps/web/ondi/.env, NOT prefixed NEXT_PUBLIC_, so Next.js
 * never inlines it into the client bundle). The browser only ever talks to
 * this same-origin /api/admin/* route; this handler attaches the real
 * x-admin-key header when forwarding to services/ondi-api server-to-server.
 *
 * Previously the admin console page shipped the raw key
 * (`x-admin-key: 'ondi_admin_2026'`) in client-side React code, which meant
 * it was readable in the browser bundle / devtools by anyone who loaded
 * /admin. That is the vulnerability this route closes.
 */

const ONDI_API_URL = process.env.ONDI_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  if (!ADMIN_API_KEY) {
    // Fail closed: never forward a request without the admin key attached.
    return NextResponse.json({ error: 'admin_proxy_misconfigured' }, { status: 500 });
  }

  const targetUrl = `${ONDI_API_URL}/${path.join('/')}${req.nextUrl.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      'x-admin-key': ADMIN_API_KEY,
      'Content-Type': req.headers.get('content-type') ?? 'application/json',
    },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text();
    if (body) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err: any) {
    return NextResponse.json({ error: 'admin_upstream_unreachable', detail: err?.message }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const status = upstream.status;

  if (contentType.includes('application/json')) {
    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data, { status });
  }

  const text = await upstream.text();
  return new NextResponse(text, { status, headers: { 'Content-Type': contentType || 'text/plain' } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
