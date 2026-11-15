import { randomBytes, createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { withTenant, dbPlatform, type Database } from '../db/client.js';
import { env } from '../config/env.js';
import { MailService } from './mail.service.js';
import { SmsService } from './sms.service.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';
import { recordTouch, personKey } from './pulse-attribution.service.js';
import { PulseSegments, PulseConsent, consentKey, type SegmentDef } from './pulse-segments.service.js';

/**
 * Pulse campaigns: from a segment to one tracked message per person.
 *
 *   draft ──launch──▶ scheduled ──(due)──▶ sending ──(nothing left)──▶ sent
 *                         └──cancel──▶ cancelled ◀──cancel──┘
 *
 * Launch only schedules. The job (runPulseCampaignJob) materialises the
 * audience at the moment the campaign is due — so a segment edited between
 * launch and send is honoured — writes one pulse_sends row per address, and
 * hands queued rows to the existing outboxes in batches. Email retries live in
 * email_outbox, SMS in sms_messages; Pulse never re-implements delivery.
 *
 * Consent is checked twice: when the audience is materialised (blocked
 * addresses become 'skipped' rows, so the report says why) and again for each
 * batch, so an unsubscribe that lands mid-send still stops the next message.
 */

const BATCH = 200;
const MAX_AUDIENCE = 100_000;

type Campaign = Awaited<ReturnType<typeof loadCampaign>>;

async function loadCampaign(trx: Transaction<Database>, tenantId: string, id: string) {
  return trx.selectFrom('pulse_campaigns').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
}

const apiBase = () => env.API_BASE_URL.replace(/\/$/, '');
export const trackUrls = {
  open: (token: string) => `${apiBase()}/v1/pulse-public/o/${token}.gif`,
  click: (token: string, n: number) => `${apiBase()}/v1/pulse-public/c/${token}/${n}`,
  unsubscribe: (token: string) => `${apiBase()}/v1/pulse-public/u/${token}`,
  sms: (code: string, n: number) => `${apiBase()}/v1/pulse-public/r/${code}${n}`,
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** {{first_name}}, {{name}}, {{email}}, {{company}} and {{unsubscribe_url}}.
 *  Unknown tags are left as written so a typo is visible in the test send. */
export function mergeFields(template: string, vars: Record<string, string>, html: boolean): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const k = key.toLowerCase();
    if (!(k in vars)) return whole;
    return html && k !== 'unsubscribe_url' ? escapeHtml(vars[k]) : vars[k];
  });
}

function varsFor(name: string | null, address: string, company: string, unsubscribeUrl: string) {
  const full = (name ?? '').trim();
  return {
    name: full || 'there', first_name: full.split(/\s+/)[0] || 'there',
    email: address, company, unsubscribe_url: unsubscribeUrl,
  };
}

/** Every distinct http(s) link in an email body, in order of appearance. */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*"(https?:\/\/[^"]+)"/gi)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** Every distinct http(s) URL in an SMS body. */
export function extractSmsLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

/** GSM-7 segments, or UCS-2 (70/67) when the text has characters GSM-7 can't carry. */
export function smsSegments(body: string): number {
  const ucs2 = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€^{}\\[~\]|]/.test(body);
  const [one, many] = ucs2 ? [70, 67] : [160, 153];
  return body.length <= one ? 1 : Math.ceil(body.length / many);
}

function renderEmail(c: NonNullable<Campaign>, send: { token: string; recipient_name: string | null; address: string; variant: string | null }, links: Map<string, number>, company: string) {
  const unsubscribeUrl = trackUrls.unsubscribe(send.token);
  const vars = varsFor(send.recipient_name, send.address, company, unsubscribeUrl);
  const variant = (c.ab_test?.variants ?? []).find((v: any) => v.key === send.variant);
  const subject = mergeFields(variant?.subject || c.subject || '', vars, false);
  let body = mergeFields(c.body_html || '', vars, true);
  body = body.replace(/href\s*=\s*"(https?:\/\/[^"]+)"/gi, (whole, raw: string) => {
    const n = links.get(raw.replace(/&amp;/g, '&'));
    return n ? `href="${trackUrls.click(send.token, n)}"` : whole;
  });
  const preheader = c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(mergeFields(c.preheader, vars, false))}</div>` : '';
  const hasOwnUnsub = (c.body_html || '').includes('{{unsubscribe_url}}');
  const footer = hasOwnUnsub ? '' : `<p style="margin:32px 0 0;font:12px/1.5 Arial,sans-serif;color:#6b7280;text-align:center">`
    + `You are receiving this from ${escapeHtml(company)}. <a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a></p>`;
  const pixel = `<img src="${trackUrls.open(send.token)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`;
  return { subject, html: `${preheader}${body}${footer}${pixel}`, unsubscribeUrl };
}

function renderSms(c: NonNullable<Campaign>, send: { short_code: string; recipient_name: string | null; address: string }, links: Map<string, number>, company: string) {
  const vars = varsFor(send.recipient_name, send.address, company, '');
  let body = mergeFields(c.body_text || '', vars, false);
  body = body.replace(/https?:\/\/[^\s<>"]+/gi, (url) => {
    const n = links.get(url);
    return n ? trackUrls.sms(send.short_code, n) : url;
  });
  return body;
}

async function tenantName(trx: Transaction<Database>, tenantId: string) {
  const t = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
  return t?.name ?? 'us';
}

async function linkMap(trx: Transaction<Database>, tenantId: string, campaignId: string) {
  const rows = await trx.selectFrom('pulse_links').select(['position', 'url'])
    .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).execute();
  return new Map(rows.map((r) => [r.url, r.position]));
}

/** Journey messages are edited while people are mid-journey, so their link
 *  table only ever grows: a link already handed out keeps its number. */
export async function appendLinks(trx: Transaction<Database>, tenantId: string, campaignId: string, urls: string[]) {
  const existing = await trx.selectFrom('pulse_links').select(['position', 'url'])
    .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).execute();
  const known = new Set(existing.map((l) => l.url));
  let next = existing.reduce((m, l) => Math.max(m, l.position), 0);
  const fresh = urls.filter((u) => !known.has(u)).slice(0, Math.max(0, 200 - existing.length));
  if (fresh.length) {
    await trx.insertInto('pulse_links').values(fresh.map((url) => ({ tenant_id: tenantId, campaign_id: campaignId, position: ++next, url }))).execute();
  }
}

/** Writes the campaign's link table from its current content. Only run
 *  before the first send — positions are baked into URLs already sent. */
async function writeLinks(trx: Transaction<Database>, tenantId: string, c: NonNullable<Campaign>) {
  const urls = c.channel === 'email' ? extractLinks(c.body_html || '')
    : c.channel === 'whatsapp' ? extractSmsLinks((c.whatsapp_template?.params ?? []).join(' ')) : extractSmsLinks(c.body_text || '');
  await trx.deleteFrom('pulse_links').where('tenant_id', '=', tenantId).where('campaign_id', '=', c.id).execute();
  if (urls.length) {
    await trx.insertInto('pulse_links').values(urls.slice(0, 200).map((url, i) => ({
      tenant_id: tenantId, campaign_id: c.id, position: i + 1, url,
    }))).execute();
  }
}

/** What would stop this campaign going out; empty when it is ready. */
export function launchProblems(c: NonNullable<Campaign>): string[] {
  const p: string[] = [];
  if (!c.segment_id) p.push('Choose an audience');
  if (c.channel === 'email') {
    if (!c.subject?.trim() && !(c.ab_test?.variants?.length >= 2)) p.push('Add a subject line');
    if (!c.body_html?.trim()) p.push('Write the email');
    if (c.ab_test) {
      const v = c.ab_test.variants ?? [];
      if (v.length < 2 || v.some((x: any) => !x?.subject?.trim())) p.push('An A/B test needs two subject lines');
      const pct = Number(c.ab_test.sample_pct);
      if (!(pct >= 5 && pct <= 50)) p.push('The A/B test sample must be 5–50% of the audience');
    }
  } else if (c.channel === 'sms') {
    if (!c.body_text?.trim()) p.push('Write the message');
  } else {
    // WhatsApp marketing must use a Meta-approved template; free text is
    // only allowed inside a 24-hour customer-initiated window.
    if (!WhatsAppIntegration.isConfigured()) p.push('WhatsApp is not connected on this platform yet. Ask your Hudumika administrator to add the Meta WhatsApp credentials');
    const t = c.whatsapp_template;
    if (!t?.name || !t?.language) p.push('Choose an approved WhatsApp template');
  }
  return p;
}

function newToken() { return randomBytes(16).toString('hex'); }
function newShortCode() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(8);
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
}

/** Turns the segment into pulse_sends rows. Idempotent: an address already
 *  present for the campaign is left alone (UNIQUE (campaign_id, address)). */
async function materialise(trx: Transaction<Database>, tenantId: string, c: NonNullable<Campaign>) {
  const seg = await trx.selectFrom('pulse_segments').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', c.segment_id!).executeTakeFirst();
  if (!seg) throw new Error('The audience for this campaign was deleted');
  const rules = typeof seg.rules === 'string' ? JSON.parse(seg.rules) : seg.rules;
  const def: SegmentDef = { source: seg.source, match_type: seg.match_type as any, rules };
  const members = await PulseSegments.members(trx, tenantId, def, { limit: MAX_AUDIENCE });

  const channel = c.channel;
  const seen = new Set<string>();
  const rows: Array<{ key: string; address: string; m: typeof members[number] }> = [];
  for (const m of members) {
    const raw = channel === 'email' ? m.email : m.phone;
    const key = consentKey(channel, raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, address: channel === 'email' ? key : raw!.trim(), m });
  }
  const blocked = await PulseConsent.blocked(trx, tenantId, channel, rows.map((r) => r.key));

  // A/B: shuffle, give the sample the variants in turn, hold the rest for the winner.
  const ab = c.channel === 'email' && c.ab_test?.variants?.length >= 2 ? c.ab_test : null;
  const order = rows.map((r) => ({ r, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.r);
  const sendable = order.filter((r) => !blocked.has(r.key));
  const sampleSize = ab ? Math.max(ab.variants.length, Math.ceil(sendable.length * Number(ab.sample_pct) / 100)) : 0;
  const variantOf = new Map<string, string | null>();
  sendable.forEach((r, i) => variantOf.set(r.key, ab ? (i < sampleSize ? ab.variants[i % ab.variants.length].key : null) : null));

  for (let i = 0; i < order.length; i += 500) {
    const chunk = order.slice(i, i + 500).map((r) => {
      const isBlocked = blocked.has(r.key);
      const variant = variantOf.get(r.key) ?? null;
      return {
        tenant_id: tenantId, campaign_id: c.id, variant, source: seg.source, source_id: r.m.id,
        recipient_name: r.m.name || null, address: r.address, token: newToken(), short_code: newShortCode(),
        status: (isBlocked ? 'skipped' : ab && !variant ? 'held' : 'queued') as 'skipped' | 'held' | 'queued',
        skip_reason: isBlocked ? 'Unsubscribed, bounced or opted out' : null,
      };
    });
    if (chunk.length) await trx.insertInto('pulse_sends').values(chunk).onConflict((oc) => oc.columns(['campaign_id', 'address']).where('enrollment_id', 'is', null).doNothing()).execute();
  }
  return { total: order.length, sendable: sendable.length };
}

/** Hands one batch of queued sends to the outbox. Returns how many were handed over. */
export async function dispatchBatch(tenantId: string, campaignId: string): Promise<number> {
  // Claim first, in its own transaction: a crash after this point can lose a
  // message but never send it twice — the right side to fail on for marketing.
  const claimed = await withTenant(tenantId, async (trx) => {
    const c = await loadCampaign(trx, tenantId, campaignId);
    // Journey message campaigns stay open for as long as the journey runs.
    if (!c || (c.status !== 'sending' && !c.journey_id)) return null;
    const sends = await trx.selectFrom('pulse_sends').selectAll()
      .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).where('status', '=', 'queued')
      .orderBy('created_at').limit(BATCH).forUpdate().skipLocked().execute();
    if (!sends.length) return { c, sends, blocked: new Set<string>(), links: new Map<string, number>(), company: '' };
    const channel = c.channel;
    const blocked = await PulseConsent.blocked(trx, tenantId, channel, sends.map((s) => consentKey(channel, s.address)!).filter(Boolean));
    const isBlocked = (s: typeof sends[number]) => blocked.has(consentKey(channel, s.address) ?? '');
    const skip = sends.filter(isBlocked).map((s) => s.id);
    const go = sends.filter((s) => !isBlocked(s)).map((s) => s.id);
    if (skip.length) await trx.updateTable('pulse_sends').set({ status: 'skipped', skip_reason: 'Opted out before this message went out' }).where('id', 'in', skip).execute();
    if (go.length) await trx.updateTable('pulse_sends').set({ status: 'sent', sent_at: new Date() }).where('id', 'in', go).execute();
    return { c, sends: sends.filter((s) => !isBlocked(s)), blocked, links: await linkMap(trx, tenantId, campaignId), company: await tenantName(trx, tenantId) };
  });
  if (!claimed || !claimed.sends.length) return 0;
  const { c, sends, links, company } = claimed;

  if (c.channel === 'email') {
    const headersBase: Record<string, string> = {};
    if (c.reply_to) headersBase['Reply-To'] = c.reply_to;
    if (c.from_name) headersBase['From-Name'] = c.from_name;
    for (const s of sends) {
      try {
        const r = renderEmail(c, s, links, company);
        const outboxId = await MailService.enqueue(tenantId, {
          to: s.address, subject: r.subject, bodyHtml: r.html, sourceApp: 'pulse',
          headers: { ...headersBase, 'List-Unsubscribe': `<${r.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        });
        await withTenant(tenantId, (trx) => trx.updateTable('pulse_sends').set({ outbox_id: outboxId })
          .where('tenant_id', '=', tenantId).where('id', '=', s.id).execute());
      } catch (e: any) {
        await withTenant(tenantId, (trx) => trx.updateTable('pulse_sends').set({ status: 'failed', error: String(e?.message ?? e).slice(0, 500) })
          .where('tenant_id', '=', tenantId).where('id', '=', s.id).execute());
      }
    }
  } else if (c.channel === 'whatsapp') {
    const t = c.whatsapp_template ?? {};
    for (const s of sends) {
      const vars = varsFor(s.recipient_name, s.address, company, '');
      const params = (Array.isArray(t.params) ? t.params : []).map((p: string) => {
        const v = mergeFields(String(p ?? ''), vars, false);
        return v.replace(/https?:\/\/[^\s<>"]+/gi, (url) => { const n = links.get(url); return n ? trackUrls.sms(s.short_code, n) : url; });
      });
      const r = await WhatsAppIntegration.sendTemplateMessage(s.address, t.name, t.language, params).catch((e: any) => ({ success: false, error: String(e?.message ?? e), simulated: false }));
      // A simulated send is not a send: it only happens when WhatsApp is not
      // connected, which launch already refuses — record it as a failure if it slips through.
      if (!r.success || (r as any).simulated) {
        await withTenant(tenantId, (trx) => trx.updateTable('pulse_sends').set({ status: 'failed', error: (r as any).simulated ? 'WhatsApp is not connected' : String((r as any).error ?? 'WhatsApp send failed').slice(0, 500) })
          .where('tenant_id', '=', tenantId).where('id', '=', s.id).execute());
      }
    }
  } else {
    try {
      await SmsService.enqueueBulkPersonalized(tenantId, c.created_by, sends.map((s) => ({
        phone: s.address, body: renderSms(c, s, links, company), name: s.recipient_name ?? undefined,
      })), 'pulse');
    } catch (e: any) {
      await withTenant(tenantId, (trx) => trx.updateTable('pulse_sends').set({ status: 'failed', error: String(e?.message ?? e).slice(0, 500) })
        .where('tenant_id', '=', tenantId).where('id', 'in', sends.map((s) => s.id)).execute());
    }
  }
  return sends.length;
}

/** A/B: once the test window has passed, pick the winning subject and release the held audience to it. */
async function decideAbTest(trx: Transaction<Database>, tenantId: string, c: NonNullable<Campaign>) {
  const ab = c.ab_test;
  if (!ab || ab.winner_key || !c.started_at) return;
  const due = new Date(c.started_at).getTime() + Number(ab.decide_after_hours || 4) * 3600_000;
  if (Date.now() < due) return;
  const stats = await trx.selectFrom('pulse_sends')
    .select(['variant', sql<string>`count(*) FILTER (WHERE status = 'sent')`.as('sent'),
      sql<string>`count(*) FILTER (WHERE opened_at IS NOT NULL)`.as('opened'),
      sql<string>`count(*) FILTER (WHERE clicked_at IS NOT NULL)`.as('clicked')])
    .where('tenant_id', '=', tenantId).where('campaign_id', '=', c.id).where('variant', 'is not', null)
    .groupBy('variant').execute();
  const metric = ab.metric === 'click' ? 'clicked' : 'opened';
  const rate = (r: any) => Number(r.sent) ? Number(r[metric]) / Number(r.sent) : 0;
  const best = stats.sort((a, b) => rate(b) - rate(a))[0];
  const winner = best?.variant ?? ab.variants[0].key;
  await trx.updateTable('pulse_campaigns').set({ ab_test: JSON.stringify({ ...ab, winner_key: winner, decided_at: new Date().toISOString() }), updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', c.id).execute();
  await trx.updateTable('pulse_sends').set({ status: 'queued', variant: winner })
    .where('tenant_id', '=', tenantId).where('campaign_id', '=', c.id).where('status', '=', 'held').execute();
}

/** One pass for one campaign: materialise when due, send a few batches, finish when empty. */
export async function advanceCampaign(tenantId: string, campaignId: string): Promise<void> {
  const start = await withTenant(tenantId, async (trx) => {
    const c = await loadCampaign(trx, tenantId, campaignId);
    if (!c) return null;
    if (c.status === 'scheduled' && (!c.scheduled_at || new Date(c.scheduled_at) <= new Date())) {
      // Flip first so a second worker that read 'scheduled' finds nothing to do.
      const flipped = await trx.updateTable('pulse_campaigns').set({ status: 'sending', started_at: new Date(), updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', campaignId).where('status', '=', 'scheduled').executeTakeFirst();
      if (!flipped.numUpdatedRows) return null;
      try {
        await writeLinks(trx, tenantId, c);
        const m = await materialise(trx, tenantId, c);
        await trx.updateTable('pulse_campaigns').set({ total_recipients: m.total }).where('tenant_id', '=', tenantId).where('id', '=', campaignId).execute();
      } catch (e: any) {
        await trx.updateTable('pulse_campaigns').set({ status: 'failed', last_error: String(e?.message ?? e).slice(0, 500), updated_at: new Date() })
          .where('tenant_id', '=', tenantId).where('id', '=', campaignId).execute();
        return null;
      }
    }
    return loadCampaign(trx, tenantId, campaignId);
  });
  if (!start || start.status !== 'sending') return;

  for (let i = 0; i < 10; i++) {
    const n = await dispatchBatch(tenantId, campaignId);
    if (n < BATCH) break;
  }

  await withTenant(tenantId, async (trx) => {
    const c = await loadCampaign(trx, tenantId, campaignId);
    if (!c || c.status !== 'sending') return;
    await decideAbTest(trx, tenantId, c);
    const left = await trx.selectFrom('pulse_sends').select(sql<string>`count(*)`.as('n'))
      .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).where('status', 'in', ['queued', 'held']).executeTakeFirst();
    if (Number(left?.n ?? 0) === 0) {
      await trx.updateTable('pulse_campaigns').set({ status: 'sent', sent_at: new Date(), updated_at: new Date() })
        .where('tenant_id', '=', tenantId).where('id', '=', campaignId).where('status', '=', 'sending').execute();
    }
  });
}

/** Email that the outbox gave up on: count it as bounced, and stop mailing an
 *  address the server rejected outright (5xx) — repeated sends to dead
 *  addresses are what gets a sender blocked. */
async function syncBounces(tenantId: string) {
  await withTenant(tenantId, async (trx) => {
    const failed = await trx.selectFrom('pulse_sends as s')
      .innerJoin('email_outbox as o', 'o.id', 's.outbox_id')
      .select(['s.id', 's.campaign_id', 's.address', 'o.last_error'])
      .where('s.tenant_id', '=', tenantId).where('s.bounced_at', 'is', null)
      .where('o.status', '=', 'failed').where(sql<boolean>`o.attempts >= o.max_attempts`)
      .limit(500).execute();
    for (const f of failed) {
      await trx.updateTable('pulse_sends').set({ bounced_at: new Date(), status: 'failed', error: f.last_error?.slice(0, 500) ?? 'Delivery failed' })
        .where('tenant_id', '=', tenantId).where('id', '=', f.id).execute();
      await trx.insertInto('pulse_events').values({ tenant_id: tenantId, campaign_id: f.campaign_id, send_id: f.id, type: 'bounce' }).execute();
      if (/\b5\d\d\b/.test(f.last_error ?? '')) {
        await PulseConsent.set(trx, tenantId, { channel: 'email', address: f.address, status: 'bounced', source: 'bounce', evidence: { campaign_id: f.campaign_id, error: f.last_error?.slice(0, 300) } });
      }
    }
  });
}

/** Every 30 seconds. Cross-tenant discovery reads only ids, then all work runs inside withTenant. */
export async function runPulseCampaignJob(): Promise<void> {
  const due = await dbPlatform.selectFrom('pulse_campaigns').select(['id', 'tenant_id'])
    .where('journey_id', 'is', null)
    .where((eb) => eb.or([
      eb('status', '=', 'sending'),
      eb.and([eb('status', '=', 'scheduled'), eb.or([eb('scheduled_at', 'is', null), eb('scheduled_at', '<=', new Date())])]),
    ])).limit(50).execute();
  for (const c of due) {
    try { await advanceCampaign(c.tenant_id, c.id); }
    catch (e: any) { console.error('[Pulse] campaign', c.id, e?.message); }
  }
  const tenants = await dbPlatform.selectFrom('pulse_sends').select('tenant_id').distinct()
    .where('bounced_at', 'is', null).where('outbox_id', 'is not', null)
    .where('created_at', '>=', new Date(Date.now() - 7 * 86400_000)).execute();
  for (const t of tenants) {
    try { await syncBounces(t.tenant_id); } catch (e: any) { console.error('[Pulse] bounce sync', e?.message); }
  }
}

// ── Public tracking (token-resolved) ─────────────────────────────────────────

const hashIp = (ip: string | undefined, tenantId: string) =>
  ip ? createHash('sha256').update(`${ip}|${tenantId}|${new Date().toISOString().slice(0, 10)}`).digest('hex').slice(0, 32) : null;

async function sendByToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return dbPlatform.selectFrom('pulse_sends').select(['id', 'tenant_id', 'campaign_id', 'address', 'recipient_name'])
    .where('token', '=', token).executeTakeFirst();
}

export const PulseTracking = {
  async open(token: string, ip?: string, ua?: string) {
    const s = await sendByToken(token);
    if (!s) return;
    await withTenant(s.tenant_id, async (trx) => {
      await trx.updateTable('pulse_sends').set({ opened_at: sql`coalesce(opened_at, now())`, open_count: sql`open_count + 1` })
        .where('tenant_id', '=', s.tenant_id).where('id', '=', s.id).execute();
      await trx.insertInto('pulse_events').values({ tenant_id: s.tenant_id, campaign_id: s.campaign_id, send_id: s.id, type: 'open', ip_hash: hashIp(ip, s.tenant_id), user_agent: ua?.slice(0, 300) ?? null }).execute();
    });
  },

  /** Destination for click n of this send, or null. Only ever a URL the campaign itself contained. */
  async click(token: string, n: number, ip?: string, ua?: string, viaShortCode = false): Promise<string | null> {
    const s = viaShortCode
      ? await dbPlatform.selectFrom('pulse_sends').select(['id', 'tenant_id', 'campaign_id', 'address', 'recipient_name']).where('short_code', '=', token).executeTakeFirst()
      : await sendByToken(token);
    if (!s || !Number.isInteger(n) || n < 1) return null;
    return withTenant(s.tenant_id, async (trx) => {
      const link = await trx.selectFrom('pulse_links').select(['id', 'url'])
        .where('tenant_id', '=', s.tenant_id).where('campaign_id', '=', s.campaign_id).where('position', '=', n).executeTakeFirst();
      if (!link) return null;
      const c = await trx.selectFrom('pulse_campaigns').select(['utm_campaign', 'channel']).where('tenant_id', '=', s.tenant_id).where('id', '=', s.campaign_id).executeTakeFirst();
      await trx.updateTable('pulse_sends').set({
        clicked_at: sql`coalesce(clicked_at, now())`, click_count: sql`click_count + 1`,
        // A click proves the message was opened even when images were blocked.
        opened_at: sql`coalesce(opened_at, now())`,
      }).where('tenant_id', '=', s.tenant_id).where('id', '=', s.id).execute();
      await trx.updateTable('pulse_links').set({ click_count: sql`click_count + 1` }).where('id', '=', link.id).execute();
      await trx.insertInto('pulse_events').values({ tenant_id: s.tenant_id, campaign_id: s.campaign_id, send_id: s.id, type: 'click', link_id: link.id, ip_hash: hashIp(ip, s.tenant_id), user_agent: ua?.slice(0, 300) ?? null }).execute();
      // A click is a touchpoint for attribution: the person is known from the send.
      const key = c?.channel === 'email' ? personKey(s.address, null) : personKey(null, s.address);
      if (key && c) await recordTouch(trx, s.tenant_id, { key, channel: c.channel, campaignId: s.campaign_id, utm: c.utm_campaign ? { source: 'pulse', medium: c.channel, campaign: c.utm_campaign } : null });
      if (!c?.utm_campaign) return link.url;
      try {
        const u = new URL(link.url);
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'pulse');
        if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', c.channel);
        if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', c.utm_campaign);
        return u.toString();
      } catch { return link.url; }
    });
  },

  async unsubscribeInfo(token: string) {
    const s = await sendByToken(token);
    if (!s) return null;
    return withTenant(s.tenant_id, async (trx) => {
      const consent = await trx.selectFrom('pulse_consents').select('status')
        .where('tenant_id', '=', s.tenant_id).where('channel', '=', 'email').where('address', '=', s.address).executeTakeFirst();
      return { company: await tenantName(trx, s.tenant_id), address: s.address, unsubscribed: !!consent && consent.status !== 'subscribed' };
    });
  },

  async unsubscribe(token: string, ip?: string, ua?: string) {
    const s = await sendByToken(token);
    if (!s) return null;
    return withTenant(s.tenant_id, async (trx) => {
      await PulseConsent.set(trx, s.tenant_id, { channel: 'email', address: s.address, status: 'unsubscribed', source: 'unsubscribe_link', evidence: { campaign_id: s.campaign_id, send_id: s.id } });
      const r = await trx.updateTable('pulse_sends').set({ unsubscribed_at: new Date() })
        .where('tenant_id', '=', s.tenant_id).where('id', '=', s.id).where('unsubscribed_at', 'is', null).executeTakeFirst();
      if (r.numUpdatedRows) {
        await trx.insertInto('pulse_events').values({ tenant_id: s.tenant_id, campaign_id: s.campaign_id, send_id: s.id, type: 'unsubscribe', ip_hash: hashIp(ip, s.tenant_id), user_agent: ua?.slice(0, 300) ?? null }).execute();
      }
      return { company: await tenantName(trx, s.tenant_id), address: s.address };
    });
  },
};

// ── Authoring helpers used by the routes ────────────────────────────────────

export const PulseCampaigns = {
  loadCampaign,
  launchProblems,

  /** A one-off copy to a colleague, rendered exactly as a recipient gets it,
   *  but with links pointing straight at their destinations (no tracking). */
  async testSend(tenantId: string, c: NonNullable<Campaign>, to: string) {
    return withTenant(tenantId, async (trx) => {
      const company = await tenantName(trx, tenantId);
      const vars = varsFor('Test Recipient', to, company, '#');
      if (c.channel === 'email') {
        const variant = c.ab_test?.variants?.[0];
        const subject = `[Test] ${mergeFields(variant?.subject || c.subject || '', vars, false)}`;
        const html = mergeFields(c.body_html || '', vars, true);
        const headers: Record<string, string> = {};
        if (c.reply_to) headers['Reply-To'] = c.reply_to;
        if (c.from_name) headers['From-Name'] = c.from_name;
        return MailService.sendNow(tenantId, { to, subject, bodyHtml: html, sourceApp: 'pulse', headers });
      }
      if (c.channel === 'whatsapp') {
        if (!WhatsAppIntegration.isConfigured()) return { success: false, error: 'WhatsApp is not connected on this platform yet' };
        const t = c.whatsapp_template ?? {};
        return WhatsAppIntegration.sendTemplateMessage(to, t.name, t.language, (t.params ?? []).map((p: string) => mergeFields(String(p), vars, false)));
      }
      return SmsService.sendNow(tenantId, null, { to, body: mergeFields(c.body_text || '', vars, false), sourceApp: 'pulse' });
    });
  },

  async report(trx: Transaction<Database>, tenantId: string, campaignId: string) {
    const totals = await trx.selectFrom('pulse_sends as s')
      .leftJoin('email_outbox as o', 'o.id', 's.outbox_id')
      .select([
        sql<string>`count(*)`.as('audience'),
        sql<string>`count(*) FILTER (WHERE s.status = 'sent')`.as('sent'),
        sql<string>`count(*) FILTER (WHERE s.status = 'skipped')`.as('skipped'),
        sql<string>`count(*) FILTER (WHERE s.status = 'failed')`.as('failed'),
        sql<string>`count(*) FILTER (WHERE s.status IN ('queued', 'held'))`.as('pending'),
        sql<string>`count(*) FILTER (WHERE o.status = 'sent')`.as('delivered'),
        sql<string>`count(*) FILTER (WHERE o.status = 'simulated')`.as('simulated'),
        sql<string>`count(*) FILTER (WHERE s.opened_at IS NOT NULL)`.as('opened'),
        sql<string>`count(*) FILTER (WHERE s.clicked_at IS NOT NULL)`.as('clicked'),
        sql<string>`count(*) FILTER (WHERE s.unsubscribed_at IS NOT NULL)`.as('unsubscribed'),
        sql<string>`count(*) FILTER (WHERE s.bounced_at IS NOT NULL)`.as('bounced'),
      ])
      .where('s.tenant_id', '=', tenantId).where('s.campaign_id', '=', campaignId).executeTakeFirst() as Record<string, string>;
    const variants = await trx.selectFrom('pulse_sends')
      .select(['variant', sql<string>`count(*) FILTER (WHERE status = 'sent')`.as('sent'),
        sql<string>`count(*) FILTER (WHERE opened_at IS NOT NULL)`.as('opened'),
        sql<string>`count(*) FILTER (WHERE clicked_at IS NOT NULL)`.as('clicked')])
      .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).where('variant', 'is not', null)
      .groupBy('variant').orderBy('variant').execute();
    const links = await trx.selectFrom('pulse_links').select(['position', 'url', 'click_count'])
      .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).orderBy('click_count', 'desc').execute();
    const timeline = await trx.selectFrom('pulse_events')
      .select([sql<string>`date_trunc('hour', created_at)`.as('hour'), 'type', sql<string>`count(*)`.as('n')])
      .where('tenant_id', '=', tenantId).where('campaign_id', '=', campaignId).where('type', 'in', ['open', 'click'])
      .groupBy([sql`date_trunc('hour', created_at)`, 'type']).orderBy(sql`date_trunc('hour', created_at)`).execute();
    const n = (k: string) => Number(totals?.[k] ?? 0);
    return {
      totals: Object.fromEntries(Object.keys(totals ?? {}).map((k) => [k, n(k)])),
      variants: variants.map((v) => ({ variant: v.variant, sent: Number(v.sent), opened: Number(v.opened), clicked: Number(v.clicked) })),
      links: links.map((l) => ({ ...l, click_count: Number(l.click_count) })),
      timeline: timeline.map((t) => ({ hour: t.hour, type: t.type, n: Number(t.n) })),
    };
  },
};
