/**
 * /v1/webhooks/voice — inbound phone calls to a centre's support line.
 *
 * A Vodacom / Yas / Airtel / Halotel business number is connected to a voice
 * platform (Africa's Talking here) which calls this URL at each step of a
 * call and does whatever the XML reply says: speak, collect a key press,
 * ring a phone, record a message. One URL per line:
 *
 *   POST /v1/webhooks/voice/africastalking/:token
 *
 * Africa's Talking does not sign voice callbacks, so the per-line random
 * token in the URL is what proves a request is about that line (and its
 * tenant). Paste the URL shown in Bliss → Network → Lines into the number's
 * callback setting.
 *
 * The flow:
 *   ring        → greeting; the menu if the line has one ("press 1 for …")
 *   key pressed → that option's product/centre; a ticket is opened (or the
 *                 caller's open one reused) and routed like any other ticket;
 *                 the agent it lands with is rung if they have a phone number
 *   nobody free / centre closed → voicemail, attached to the ticket
 *   hang-up     → duration and any recording saved; a call that never got
 *                 past the menu is recorded as missed
 */
import type { FastifyInstance } from 'fastify';
import { dbPlatform, withTenant } from '../db/client.js';
import { env } from '../config/env.js';
import { createTicketRow } from './support.routes.js';
import { isCentreOpen } from '../services/support-network.service.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const say = (text: string) => `<Say voice="en-US-Standard-C" playBeep="false">${esc(text)}</Say>`;

/** Tanzanian numbers as staff type them ("0754 123 456", "754123456") → E.164. */
export function toE164(raw: string | null | undefined, country = '255'): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return /^\+[1-9]\d{6,14}$/.test(d) ? d : null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = country + d.slice(1);
  else if (d.length === 9) d = country + d;
  return /^[1-9]\d{6,14}$/.test(d) ? `+${d}` : null;
}

type Params = Record<string, string | undefined>;

export async function supportVoiceRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try { done(null, Object.fromEntries(new URLSearchParams(body as string))); }
    catch (err: any) { done(err, undefined); }
  });

  fastify.post('/africastalking/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const p = (request.body ?? {}) as Params;
    reply.header('Content-Type', 'application/xml');

    // Pre-tenant: the token is the only way to know whose line this is.
    const line = /^[a-f0-9]{36}$/.test(token)
      ? await dbPlatform.selectFrom('support_lines').selectAll()
        .where('webhook_token', '=', token).where('kind', '=', 'voice').executeTakeFirst()
      : undefined;
    if (!line || line.status !== 'active') return xml('<Reject/>');

    const sessionId = String(p.sessionId ?? '').slice(0, 200);
    if (!sessionId) return reply.status(400).send(xml(''));
    const callbackUrl = `${env.API_BASE_URL}/v1/webhooks/voice/africastalking/${token}`;
    const caller = toE164(p.callerNumber) ?? p.callerNumber ?? null;
    const active = p.isActive !== '0';

    return withTenant(line.tenant_id, async (trx) => {
      const tenantId = line.tenant_id;
      let call = await trx.selectFrom('support_calls').selectAll()
        .where('tenant_id', '=', tenantId).where('provider_session', '=', sessionId).executeTakeFirst();

      // A call-log note on the ticket thread, attributed to the caller (the
      // ticket's customer) the way a ticket's opening message is —
      // support_messages.author_id is required.
      const note = async (ticketId: string | null, content: string) => {
        if (!ticketId) return;
        const t = await trx.selectFrom('support_tickets').select('customer_id').where('id', '=', ticketId).executeTakeFirst();
        if (!t) return;
        await trx.insertInto('support_messages').values({
          tenant_id: tenantId, ticket_id: ticketId, author_id: t.customer_id, author_name: 'Phone line',
          author_type: 'SYSTEM', channel: 'SYSTEM', direction: 'INBOUND', content,
        } as any).execute();
      };

      // ── Hang-up ──────────────────────────────────────────────────────
      if (!active) {
        if (!call) return xml('');
        const duration = Number(p.durationInSeconds ?? 0) || 0;
        const recording = p.recordingUrl || call.recording_url || null;
        const status = call.status === 'menu' ? 'missed'
          : call.status === 'ringing' ? (duration > 0 ? 'completed' : 'missed')
          : call.status;
        await trx.updateTable('support_calls').set({
          status, ended_at: new Date(), duration_seconds: duration, recording_url: recording,
        }).where('id', '=', call.id).execute();
        if (recording && recording !== call.recording_url) await note(call.ticket_id, `Voicemail from ${caller ?? 'caller'}: ${recording}`);
        await note(call.ticket_id, `Call ended — ${status}${duration ? `, ${Math.round(duration)} s` : ''}.`);
        return xml('');
      }

      // A recording finished mid-call (Record's own callback).
      if (call && p.recordingUrl && p.recordingUrl !== call.recording_url) {
        await trx.updateTable('support_calls').set({ recording_url: p.recordingUrl, status: 'voicemail' }).where('id', '=', call.id).execute();
        await note(call.ticket_id, `Voicemail from ${caller ?? 'caller'}: ${p.recordingUrl}`);
        return xml(say('Thank you. We have your message and will call you back.'));
      }

      const firstRing = !call;
      if (!call) {
        call = await trx.insertInto('support_calls').values({
          tenant_id: tenantId, line_id: line.id, provider_session: sessionId, caller_number: caller,
          site_id: line.site_id, product_id: line.product_id,
        }).onConflict(oc => oc.column('provider_session').doNothing()).returningAll().executeTakeFirst()
          ?? await trx.selectFrom('support_calls').selectAll().where('provider_session', '=', sessionId).executeTakeFirstOrThrow();
      }

      /** The caller as a customer: matched on any stored phone format, or created. */
      const customerId = async (): Promise<string> => {
        const local = caller?.startsWith('+255') ? `0${caller.slice(4)}` : null;
        const forms = [caller, caller?.replace(/^\+/, ''), local].filter(Boolean) as string[];
        const found = forms.length ? await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenantId)
          .where(eb => eb.or([eb('phone', 'in', forms), eb('phone_wa', 'in', forms)])).executeTakeFirst() : undefined;
        if (found) return found.id;
        const created = await trx.insertInto('customers').values({
          tenant_id: tenantId, name: caller ?? 'Unknown caller', phone: caller, source: 'phone',
        } as any).returning('id').executeTakeFirstOrThrow();
        return created.id;
      };

      /** Reuse the caller's open phone ticket, else open one routed to this centre/product. */
      const ticketFor = async (siteId: string | null, productId: string | null, label: string | null) => {
        if (call!.ticket_id) {
          return trx.selectFrom('support_tickets').select(['id', 'assigned_to', 'site_id']).where('id', '=', call!.ticket_id).executeTakeFirstOrThrow();
        }
        const cid = await customerId();
        const t = await createTicketRow(trx, tenantId, {
          customerId: cid, subject: `Phone call from ${caller ?? 'unknown number'}${label ? ` · ${label}` : ''}`,
          channel: 'VOICE', priority: 'NORMAL', category: 'Phone call', siteId, productId,
        });
        await trx.updateTable('support_calls').set({ ticket_id: t.id, site_id: t.site_id ?? siteId, product_id: t.product_id ?? productId })
          .where('id', '=', call!.id).execute();
        call = { ...call!, ticket_id: t.id };
        await note(t.id, `Incoming call on ${line.name} (${line.phone_number}) from ${caller ?? 'unknown number'}${label ? ` — chose ${label}` : ''}.`);
        return { id: t.id, assigned_to: t.assigned_to, site_id: t.site_id };
      };

      const voicemail = async (ticketId: string | null, intro: string) => {
        await trx.updateTable('support_calls').set({ status: 'voicemail' }).where('id', '=', call!.id).execute();
        await note(ticketId, 'Caller sent to voicemail.');
        return xml(`${say(intro)}<Record finishOnKey="#" maxLength="120" trimSilence="true" playBeep="true" callbackUrl="${esc(callbackUrl)}"/>`);
      };

      const connect = async (siteId: string | null, productId: string | null, label: string | null) => {
        const t = await ticketFor(siteId, productId, label);
        const agent = t.assigned_to && line.ring_agents
          ? await trx.selectFrom('users').select(['id', 'name', 'phone']).where('tenant_id', '=', tenantId).where('id', '=', t.assigned_to).executeTakeFirst()
          : undefined;
        const agentPhone = toE164(agent?.phone);
        if (agent && agentPhone) {
          await trx.updateTable('support_calls').set({ status: 'ringing', agent_id: agent.id }).where('id', '=', call!.id).execute();
          await note(t.id, `Ringing ${agent.name}.`);
          return xml(`${say('Please hold while we connect you.')}<Dial phoneNumbers="${esc(agentPhone)}" record="true" sequential="true" maxDuration="3600"/>`);
        }
        return voicemail(t.id, 'All our agents are busy right now. Please leave your name and message after the tone, then press the hash key.');
      };

      // ── After hours ──────────────────────────────────────────────────
      if (!call.digits && line.site_id) {
        const site = await trx.selectFrom('tenant_sites').select(['name', 'timezone', 'opening_hours'])
          .where('id', '=', line.site_id).executeTakeFirst();
        if (site && !isCentreOpen(site as any) && line.after_hours === 'voicemail') {
          await trx.updateTable('support_calls').set({ status: 'after_hours' }).where('id', '=', call.id).execute();
          const t = await ticketFor(line.site_id, line.product_id, 'after hours');
          return voicemail(t.id, `Thank you for calling ${site.name}. We are closed right now. Please leave a message after the tone and we will call you back.`);
        }
      }

      const menu = (line.menu ?? []) as { digit: string; label: string; action: 'route' | 'voicemail'; product_id?: string | null; site_id?: string | null }[];
      const greeting = line.greeting_audio_url
        ? `<Play url="${esc(line.greeting_audio_url)}"/>`
        : say(line.greeting || `Thank you for calling ${line.name}.`);

      // ── A key was pressed ────────────────────────────────────────────
      const digits = (p.dtmfDigits ?? '').replace(/[^0-9*]/g, '');
      if (digits) {
        const opt = menu.find(o => o.digit === digits.slice(0, 1));
        await trx.updateTable('support_calls').set({ digits: (call.digits ?? '') + digits.slice(0, 1) }).where('id', '=', call.id).execute();
        if (!opt) {
          if ((call.digits ?? '').length >= 2) return connect(line.site_id, line.product_id, null); // twice wrong: just connect
          call = { ...call, digits: (call.digits ?? '') + digits.slice(0, 1) };
          return xml(`<GetDigits timeout="10" numDigits="1" callbackUrl="${esc(callbackUrl)}">${say(`Sorry, that is not an option. ${menu.map(o => `For ${o.label}, press ${o.digit}.`).join(' ')}`)}</GetDigits>${say('We did not get a choice. Goodbye.')}`);
        }
        if (opt.action === 'voicemail') {
          const t = await ticketFor(opt.site_id ?? line.site_id, opt.product_id ?? line.product_id, opt.label);
          return voicemail(t.id, 'Please leave your message after the tone, then press the hash key.');
        }
        return connect(opt.site_id ?? line.site_id, opt.product_id ?? line.product_id, opt.label);
      }

      // ── First ring ───────────────────────────────────────────────────
      // Back here with no key press (the menu timed out): stop asking, connect.
      if (!firstRing) return connect(line.site_id, line.product_id, null);
      if (menu.length) {
        const prompt = menu.map(o => `For ${o.label}, press ${o.digit}.`).join(' ');
        return xml(`<GetDigits timeout="10" numDigits="1" callbackUrl="${esc(callbackUrl)}">${greeting}${say(prompt)}</GetDigits>${say('We did not get a choice. Connecting you to the next available agent.')}<Redirect>${esc(callbackUrl)}</Redirect>`);
      }
      return xml(greeting + (await connect(line.site_id, line.product_id, null)).replace(/^<\?xml[^>]*\?><Response>|<\/Response>$/g, ''));
    });
  });
}
