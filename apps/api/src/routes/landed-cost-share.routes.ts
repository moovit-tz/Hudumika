/**
 * Shareable landed-cost estimates.
 *
 * The exported PDF carries a QR code pointing at /r/<token>. Scanning it opens
 * a public page showing a teaser of the estimate; the full report is released
 * only after the scanner supplies an email address, which is captured as a CRM
 * lead for the tenant that produced the estimate.
 *
 * Only POST / is authenticated — the whole point of the other two is that an
 * unauthenticated scanner can reach them. Access control is the unguessable
 * token, so every read path filters on the token alone and never trusts a
 * tenant id supplied by the caller.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { db } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { env } from '../config/env.js';

/** URL-safe, ~132 bits. Long enough that tokens can't be walked. */
function newToken(): string {
  return randomBytes(18).toString('base64url');
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * Where the scanner should land.
 *
 * Never derived from a request header — a spoofed Host would mint QR codes
 * pointing elsewhere, and these are printed on paper so a wrong link can't be
 * recalled. Reads PUBLIC_APP_URL, falling back to the first configured CORS
 * origin (already the frontend URL in most deployments).
 *
 * `trusted` is the important part: in production a localhost-ish or malformed
 * origin means we do NOT yet know the real domain. The share is still created
 * — the token stays valid, so it resolves the moment the domain is set — but
 * the QR is withheld. An estimate that prints without a QR is a small loss; a
 * thousand estimates printed with a QR pointing at localhost is unrecoverable.
 */
function resolvePublicBaseUrl(): { url: string; trusted: boolean; reason?: string } {
  const configured = (env.PUBLIC_APP_URL || env.CORS_ORIGINS.split(',')[0] || '').trim().replace(/\/+$/, '');
  if (!configured) {
    return { url: '', trusted: false, reason: 'Neither PUBLIC_APP_URL nor CORS_ORIGINS is set, so the QR target is unknown.' };
  }
  let host: string;
  try {
    host = new URL(configured).hostname;
  } catch {
    return { url: configured, trusted: false, reason: `PUBLIC_APP_URL is not a valid absolute URL ("${configured}").` };
  }
  if (env.APP_ENV === 'production' && (LOCAL_HOSTS.has(host) || host.endsWith('.local'))) {
    return {
      url: configured,
      trusted: false,
      reason: `The public URL still resolves to "${host}". Set PUBLIC_APP_URL to the live domain to start printing QR codes.`,
    };
  }
  return { url: configured, trusted: true };
}

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const SHARE_TTL_DAYS = 90;

export async function landedCostShareRoutes(fastify: FastifyInstance) {
  // ── POST /v1/landed-cost-shares ─────────────────────────────────────────
  // Authenticated. Called just before the PDF is rendered; returns the token,
  // the public URL and a QR PNG data URI to embed in the document.
  fastify.post('/', { preHandler: [fastify.authenticate, requireEntitlement('clearos')] }, async (req: FastifyRequest, reply) => {
    const user = req.user as any;
    const body = req.body as { payload?: any; hs_code?: string; description?: string; customer_name?: string };
    if (!body?.payload || typeof body.payload !== 'object') {
      return reply.status(400).send({ error: 'payload is required' });
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const row = await db.insertInto('landed_cost_shares').values({
      token,
      tenant_id: user.tenant_id,
      hs_code: body.hs_code ?? null,
      description: body.description ?? null,
      customer_name: body.customer_name ?? null,
      payload: JSON.stringify(body.payload),
      created_by: user.sub ?? null,
      expires_at: expiresAt,
    } as any).returning(['id', 'token']).executeTakeFirstOrThrow();

    const base = resolvePublicBaseUrl();
    const url = base.url ? `${base.url}/r/${row.token}` : null;

    // Rendered server-side so the print document only has to embed an <img> —
    // the PDF popup has no bundler and can't pull in a QR library. Withheld
    // when the public URL isn't trustworthy yet (see resolvePublicBaseUrl):
    // the share row and token are still valid and will resolve once the
    // domain is configured, no re-export needed for future estimates.
    const qr_data_uri = base.trusted && url
      ? await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
          color: { dark: '#14181B', light: '#FFFFFF' },
        })
      : null;

    if (!base.trusted) {
      fastify.log.warn({ reason: base.reason }, 'landed-cost share created without a QR code');
    }

    return {
      id: row.id,
      token: row.token,
      url,
      qr_data_uri,
      qr_unavailable_reason: base.trusted ? null : base.reason,
      expires_at: expiresAt,
    };
  });

  // ── GET /v1/landed-cost-shares/:token ───────────────────────────────────
  // PUBLIC. Teaser only — enough to prove the link is real and show what the
  // report covers, but never the figures, which are what the email buys.
  fastify.get('/:token', async (req: FastifyRequest, reply) => {
    const { token } = req.params as { token: string };
    const share = await db.selectFrom('landed_cost_shares')
      .select(['id', 'tenant_id', 'hs_code', 'description', 'customer_name', 'created_at', 'expires_at'])
      .where('token', '=', token)
      .executeTakeFirst();

    if (!share) return reply.status(404).send({ error: 'This report link is not valid.' });
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'This report link has expired. Ask the clearing agent for a fresh copy.' });
    }

    await db.updateTable('landed_cost_shares')
      .set(eb => ({ view_count: eb('view_count', '+', 1) }))
      .where('id', '=', share.id).execute();

    const tenant = await db.selectFrom('tenants').select(['name'])
      .where('id', '=', share.tenant_id).executeTakeFirst();

    return {
      hs_code: share.hs_code,
      description: share.description,
      customer_name: share.customer_name,
      generated_at: share.created_at,
      prepared_by: tenant?.name ?? null,
    };
  });

  // ── POST /v1/landed-cost-shares/:token/unlock ───────────────────────────
  // PUBLIC. Trades an email address for the full report payload, and records
  // that email as a CRM lead on the originating tenant.
  fastify.post('/:token/unlock', async (req: FastifyRequest, reply) => {
    const { token } = req.params as { token: string };
    const body = req.body as { email?: string; full_name?: string; company?: string };

    if (!isEmail(body?.email)) {
      return reply.status(400).send({ error: 'Enter a valid email address to download the report.' });
    }
    const email = body.email!.trim().toLowerCase();
    const fullName = (body.full_name ?? '').trim() || null;
    const company = (body.company ?? '').trim() || null;

    const share = await db.selectFrom('landed_cost_shares')
      .select(['id', 'tenant_id', 'payload', 'hs_code', 'description', 'expires_at'])
      .where('token', '=', token)
      .executeTakeFirst();

    if (!share) return reply.status(404).send({ error: 'This report link is not valid.' });
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'This report link has expired. Ask the clearing agent for a fresh copy.' });
    }

    // One capture per (share, email) — re-downloading must not spam the
    // pipeline with duplicate leads.
    const existing = await db.selectFrom('landed_cost_share_leads')
      .select(['id'])
      .where('share_id', '=', share.id).where('email', '=', email)
      .executeTakeFirst();

    if (!existing) {
      // `leads.company` and `contact_name` are NOT NULL. When the scanner
      // doesn't volunteer them we derive from the address rather than invent:
      // the domain is a factual part of the email, and the local part is
      // flagged in `notes` as derived so sales knows it wasn't self-reported.
      const domain = email.split('@')[1] ?? '';
      const localPart = email.split('@')[0] ?? email;
      const derived = !fullName || !company;

      const lead = await db.insertInto('leads').values({
        tenant_id: share.tenant_id,
        company: company ?? domain,
        contact_name: fullName ?? localPart,
        contact_email: email,
        source: 'Landed Cost QR',
        stage: 'NEW',
        notes: [
          `Scanned the QR code on a landed-cost estimate${share.hs_code ? ` for HS ${share.hs_code}` : ''}${share.description ? ` (${share.description})` : ''} and requested the full report.`,
          derived ? 'Company and/or contact name were derived from the email address, not supplied by the contact — confirm before onboarding.' : null,
        ].filter(Boolean).join(' '),
      } as any).returning(['id']).executeTakeFirstOrThrow();

      await db.insertInto('landed_cost_share_leads').values({
        share_id: share.id,
        tenant_id: share.tenant_id,
        email,
        full_name: fullName,
        company,
        lead_id: lead.id,
      } as any).execute();
    }

    await db.updateTable('landed_cost_shares')
      .set(eb => ({ unlock_count: eb('unlock_count', '+', 1) }))
      .where('id', '=', share.id).execute();

    const payload = typeof share.payload === 'string' ? JSON.parse(share.payload) : share.payload;
    return { data: payload };
  });
}
