import type { FastifyInstance, FastifyReply } from 'fastify';
import { PulseTracking } from '../services/pulse-campaigns.service.js';

/**
 * Pulse's public endpoints — reached from a recipient's inbox or phone with
 * no Hudumika session. Everything is resolved from the opaque per-send token
 * (or SMS short code); nothing in a URL names a tenant, campaign or address.
 *
 *   GET  /o/:token.gif   open pixel — always answers with the image
 *   GET  /c/:token/:n    click — redirects only to link n of that campaign
 *   GET  /r/:code        SMS short link (8-char code + link number)
 *   GET  /u/:token       unsubscribe page (a confirm button, not a GET side effect,
 *                        so mail scanners that prefetch links don't unsubscribe people)
 *   POST /u/:token       unsubscribe — the page's button and RFC 8058 one-click
 */

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(reply: FastifyReply, status: number, title: string, body: string) {
  reply.status(status).header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', 'no-store')
    .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'")
    .header('X-Robots-Tag', 'noindex');
  return reply.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--ink:#111827;--muted:#4b5563;--line:#e5e7eb;--btn:#111827;--btn-ink:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--ink:#f3f4f6;--muted:#9ca3af;--line:#2a2f3a;--btn:#f3f4f6;--btn-ink:#111827}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:440px;width:100%;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}strong{color:var(--ink)}
button{font:inherit;font-weight:600;min-height:44px;padding:0 20px;border-radius:8px;border:0;background:var(--btn);color:var(--btn-ink);cursor:pointer}
</style></head><body><main>${body}</main></body></html>`);
}

export async function pulsePublicRoutes(fastify: FastifyInstance) {
  // The unsubscribe button and RFC 8058 one-click both post a form body; the
  // content is never read (the token in the URL is the whole request).
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_req, body, done) => done(null, body));

  fastify.get('/o/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    reply.header('Content-Type', 'image/gif').header('Cache-Control', 'no-store, private');
    try { await PulseTracking.open(file.replace(/\.gif$/, ''), request.ip, request.headers['user-agent']); }
    catch { /* the inbox is waiting on an image either way */ }
    return reply.send(GIF);
  });

  fastify.get('/c/:token/:n', async (request, reply) => {
    const { token, n } = request.params as { token: string; n: string };
    const url = await PulseTracking.click(token, Number(n), request.ip, request.headers['user-agent']).catch(() => null);
    if (!url) return page(reply, 404, 'Link not found', '<h1>This link is no longer available</h1><p>It may have been mistyped or come from an old message.</p>');
    return reply.redirect(url, 302);
  });

  fastify.get('/r/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const m = /^([A-Za-z0-9]{8})(\d{1,3})$/.exec(code);
    const url = m ? await PulseTracking.click(m[1], Number(m[2]), request.ip, request.headers['user-agent'], true).catch(() => null) : null;
    if (!url) return page(reply, 404, 'Link not found', '<h1>This link is no longer available</h1><p>It may have been mistyped or come from an old message.</p>');
    return reply.redirect(url, 302);
  });

  fastify.get('/u/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const info = await PulseTracking.unsubscribeInfo(token).catch(() => null);
    if (!info) return page(reply, 404, 'Unsubscribe', '<h1>We couldn’t find this subscription</h1><p>The link may be incomplete. Reply to the email and ask to be removed instead.</p>');
    if (info.unsubscribed) return page(reply, 200, 'Unsubscribed', `<h1>You’re unsubscribed</h1><p><strong>${esc(info.address)}</strong> won’t get marketing email from ${esc(info.company)}.</p>`);
    return page(reply, 200, 'Unsubscribe', `<h1>Unsubscribe from ${esc(info.company)}?</h1>
<p>You’ll stop getting marketing email at <strong>${esc(info.address)}</strong>. Messages about your own orders or account may still arrive.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`);
  });

  fastify.post('/u/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const done = await PulseTracking.unsubscribe(token, request.ip, request.headers['user-agent']).catch(() => null);
    // RFC 8058 one-click posts come from the mail provider, not a browser — it only reads the status.
    if (!done) return page(reply, 404, 'Unsubscribe', '<h1>We couldn’t find this subscription</h1><p>Reply to the email and ask to be removed instead.</p>');
    return page(reply, 200, 'Unsubscribed', `<h1>You’re unsubscribed</h1><p><strong>${esc(done.address)}</strong> won’t get marketing email from ${esc(done.company)}.</p>`);
  });
}
