import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import crypto from 'node:crypto';
import { z } from 'zod';
import { MinioIntegration } from '../integrations/minio.js';
import { withTenant } from '../db/client.js';
import { env } from '../config/env.js';

type Folder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash' | 'scheduled' | 'archive';
const FOLDERS = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'scheduled', 'archive'] as const;

/** The Gmail-style "Undo send" window — every send lands in the 'scheduled'
 *  folder with scheduled_at this far out by default; scheduled-email-
 *  send.job.ts performs the real delivery once it arrives. Cancel/undo is
 *  just DELETE /v1/emails/:id on the still-'scheduled' row. A caller-
 *  supplied sendAt (schedule-send for later) uses the same mechanism with a
 *  longer delay instead of this default. */
const UNDO_WINDOW_MS = 10_000;

const attachmentInputSchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().optional(),
});

const messagePatchSchema = z.object({
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
  folder: z.enum(FOLDERS).optional(),
  labels: z.array(z.string()).optional(),
  // Draft/scheduled-content edits — only ever applied when the existing row
  // is still in 'drafts' or 'scheduled' (enforced in the handler, not by
  // this schema alone), so this can never be used to silently rewrite a
  // message that has actually gone out.
  to: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachments: z.array(attachmentInputSchema).max(10).optional(),
});
const draftSchema = z.object({
  to: z.string().optional().default(''),
  cc: z.string().optional().default(''),
  bcc: z.string().optional().default(''),
  subject: z.string().optional().default(''),
  body: z.string().optional().default(''),
  attachments: z.array(attachmentInputSchema).max(10).optional().default([]),
});
const sendSchema = z.object({
  to: z.string().trim().min(1),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1),
  // Legacy single-attachment trio — kept so any not-yet-updated caller still
  // works; merged with the array below rather than made dead.
  attachmentStorageKey: z.string().optional(),
  attachmentFilename: z.string().optional(),
  attachmentSize: z.number().optional(),
  attachments: z.array(attachmentInputSchema).max(10).optional(),
  requestReadReceipt: z.boolean().optional(),
  /** The message being replied to (from GET /v1/emails) — carries the
   *  reply into the same thread instead of starting a new one, and (once
   *  the parent has a real message_id) into the same RFC 5322 thread. */
  inReplyTo: z.string().uuid().optional(),
  /** A drafts-folder row this send supersedes — deleted once queued so it
   *  doesn't linger as an orphaned draft. */
  draftId: z.string().uuid().optional(),
  /** Explicit future delivery time (ISO datetime) — "Schedule send" using
   *  the same scheduled/undo mechanism as a normal send, just a longer
   *  delay. Omitted = the default UNDO_WINDOW_MS. */
  sendAt: z.string().datetime().optional(),
  /** Compose's "From" picker (email_send_identities, migration 494) — which
   *  of the user's own aliases to send as, when they have more than one.
   *  Omitted = whichever alias is marked default at actual send time. */
  fromIdentityId: z.string().uuid().optional(),
});
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['read', 'unread', 'archive', 'trash', 'spam', 'inbox', 'delete', 'label', 'unlabel']),
  // Required for 'label'/'unlabel' — the label name to add/remove on every
  // matched message. Ignored for every other action.
  label: z.string().trim().min(1).max(100).optional(),
});

function daysAgo(n: number, hour = 9, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d;
}

/** Strips leading Re:/Fwd:/Fw: chains so "Re: Re: Booking" and "Fwd:
 *  Booking" both key off the same "booking" — used only as the subject-
 *  based threading fallback for inbound mail with no References/In-Reply-To
 *  header this mailbox can match (imap-email-ingest.job.ts). Not a
 *  substitute for real Message-ID/References threading, which is preferred
 *  whenever a header match exists. */
export function normalizeSubjectForThread(subject: string): string {
  return subject.replace(/^\s*(re|fwd?|回复|转发)\s*:\s*/i, '').trim().toLowerCase();
}

/** Merges the legacy singular attachment trio (migration 460) with the
 *  plural `attachments` JSONB array (461) into one list, newest field
 *  first-write-wins — used by every route that reads attachments off a row. */
function mergeAttachments(row: { attachments: any; attachment_storage_key: string | null; attachment_filename: string | null; attachment_size: number | null }): { storageKey: string; filename: string; size: number | null }[] {
  const plural = Array.isArray(row.attachments) ? row.attachments : [];
  if (plural.length) return plural;
  if (row.attachment_storage_key) {
    return [{ storageKey: row.attachment_storage_key, filename: row.attachment_filename || 'attachment', size: row.attachment_size }];
  }
  return [];
}

/** Shared row → API-shape mapper for GET / and GET /thread/:id, so the two
 *  listings can never silently drift apart on field shape. */
function mapMessageRow(r: any, user: { sub: string; email?: string }, threadCounts: Map<string, number>) {
  const attachments = mergeAttachments(r);
  return {
    id: r.id,
    folder: r.folder,
    // A Sent-folder message's sender is always the mailbox owner — a real,
    // known account, not a name string. Inbox/spam senders are external
    // parties with no Hudumika account, so userId stays unset there and
    // PersonAvatar correctly falls back to initials rather than guessing.
    from: { name: r.from_name, email: r.from_email, userId: r.from_email === user.email ? user.sub : undefined },
    to: r.to_addresses,
    cc: r.cc_addresses,
    bcc: r.bcc_addresses,
    subject: r.subject,
    body: r.body,
    snippet: r.snippet,
    date: r.created_at,
    read: r.read,
    starred: r.starred,
    labels: r.labels,
    hasAttachment: r.has_attachment,
    attachment: attachments[0] ? { filename: attachments[0].filename, size: attachments[0].size } : null,
    attachments: attachments.map(a => ({ storageKey: a.storageKey, filename: a.filename, size: a.size })),
    threadId: r.thread_id,
    threadCount: threadCounts.get(r.thread_id) ?? 1,
    inReplyTo: r.in_reply_to,
    messageId: r.message_id,
    readReceiptRequested: r.read_receipt_requested,
    readReceiptConfirmedAt: r.read_receipt_confirmed_at,
    scheduledAt: r.scheduled_at,
    sendError: r.send_error,
    // Real delivery status for a Sent-folder row (pending/sending/sent/
    // failed), joined from email_outbox — null for every other folder,
    // and for pre-migration rows sent before outbox_id existed.
    deliveryStatus: r.delivery_status ?? null,
  };
}

// Realistic first-run sample mailbox — real DB rows tied to the actual user/
// tenant rather than a permanent hardcoded frontend array, computed relative
// to today rather than pinned to a fixed calendar date.
function sampleInbox(tenantName: string) {
  const opsAddr = { name: `${tenantName} Operations`, email: 'ops@' + tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.co.tz' };
  return [
    {
      folder: 'inbox' as Folder,
      from_name: 'Tanzania Revenue Authority', from_email: 'customs@tra.go.tz',
      to_addresses: [opsAddr],
      subject: 'Customs Duty Assessment — Import Declaration TZ-48821',
      body: 'Dear ' + tenantName + ',\n\nPlease find the customs duty assessment for Import Declaration TZ-48821.\n\nTotal Assessable Value: USD 142,500\nCustoms Duty (25%): TZS 9,053,250\nVAT (18%): TZS 4,342,560\n\nTotal Amount Due: TZS 14,156,283\n\nKindly effect payment within 7 working days to avoid penalties and storage charges.\n\nRegards,\nCustoms Commissioner\nTanzania Revenue Authority',
      snippet: 'Customs duty assessment for Import Declaration TZ-48821. Total Amount Due: TZS 14,156,283...',
      created_at: daysAgo(0, 8, 22), read: false, starred: true, labels: ['Finance', 'Urgent'], has_attachment: true,
    },
    {
      folder: 'inbox' as Folder,
      from_name: 'Dar es Salaam Port Authority', from_email: 'ops@dpa.go.tz',
      to_addresses: [opsAddr],
      subject: 'URGENT: Demurrage Notice — Container TXCU4829310',
      body: 'Dear Agent,\n\nContainer TXCU4829310 has exceeded the free storage period at TICTS terminal.\n\nFree Period Expired: 4 days ago\nAccrued Demurrage: USD 480 (4 days @ USD 120/day)\n\nDemurrage will continue to accrue until the container is collected.\n\nPort Operations\nDar es Salaam Port Authority',
      snippet: 'Container TXCU4829310 has exceeded free storage. Demurrage accruing at USD 120/day...',
      created_at: daysAgo(0, 9, 5), read: false, starred: true, labels: ['Shipments', 'Urgent'], has_attachment: false,
    },
    {
      folder: 'inbox' as Folder,
      from_name: 'Karibu Trading Co. Ltd', from_email: 'finance@kaributrading.co.tz',
      to_addresses: [opsAddr],
      subject: 'RE: Outstanding Freight Invoice #IV-2026-0488',
      body: 'Hi Operations Team,\n\nWe have processed the payment for Freight Invoice #IV-2026-0488. The bank transfer slip is attached.\n\nAmount Paid: TZS 4,820,000\nBank: NMB Bank Tanzania\n\nPlease confirm receipt and issue the original Bill of Lading.\n\nThanks,\nSarah Mushi\nFinance Department',
      snippet: 'Payment processed for Freight Invoice #IV-2026-0488. Bank receipt attached...',
      created_at: daysAgo(1, 11, 30), read: true, starred: false, labels: ['Shipments'], has_attachment: true,
    },
    {
      folder: 'inbox' as Folder,
      from_name: 'Alibaba International Logistics', from_email: 'shipments@alibaba-logistics.com',
      to_addresses: [opsAddr],
      subject: 'Booking Confirmation — Shipment Ref: ALIBABA-99281A',
      body: 'Dear Partner,\n\nWe confirm the sea freight booking for your shipment.\n\nBooking Ref: ALIBABA-99281A\nPort of Loading: Shenzhen (Yantian), China\nPort of Discharge: Dar es Salaam, Tanzania\nCargo: 2 x 40ft Containers (General Merchandise)\n\nPlease ensure export documentation is submitted 48 hours before ETD.\n\nBest regards,\nAlibaba Logistics Team',
      snippet: 'Sea freight booking confirmation. 2 x 40ft containers, Shenzhen to Dar es Salaam...',
      created_at: daysAgo(2, 10, 15), read: true, starred: false, labels: ['Shipments'], has_attachment: true,
    },
    {
      folder: 'inbox' as Folder,
      from_name: 'NexusHR Payroll', from_email: 'payroll@nexushr.internal',
      to_addresses: [opsAddr],
      subject: 'July Payroll — Approval Required',
      body: 'Hi,\n\nJuly payroll is ready for review and approval. Please log in to NexusHR to approve before the 25th to ensure timely disbursement.\n\nRegards,\nNexusHR',
      snippet: 'July payroll is ready for review and approval before the 25th...',
      created_at: daysAgo(3, 14, 0), read: true, starred: false, labels: ['HR'], has_attachment: false,
    },
  ];
}

export async function emailRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  // HUD-0034: Email is an internal staff app — the frontend hard-routes
  // CUSTOMER/ORG accounts to their own dedicated portal shells and never
  // renders /email/*, but nothing stopped a CUSTOMER JWT from hitting this
  // API directly (proven live: GET /v1/emails returned 200 and auto-seeded
  // a personal mailbox for a CUSTOMER account; POST /v1/email/send passed
  // every check and reached the usage gate). A customer account should not
  // get a mailbox on the tenant's internal mail app, let alone be able to
  // send mail that appears to come from the tenant's own address.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // GET /v1/emails/folder-counts — the sidebar's per-folder and label badge counts
  // (Gmail's own "Inbox 2 / Drafts 87" pattern). Unread count for
  // inbox/spam (folders where "unread" is the thing worth flagging) and
  // starred (unread among starred messages); total item count for
  // drafts/scheduled (nothing there is ever "read", the count that matters
  // is "how many exist"). Sent/archive/trash intentionally carry none,
  // same as Gmail.
  fastify.get('/folder-counts', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('email_messages')
        .select(['folder', 'starred', sql<number>`count(*)`.as('total'), sql<number>`count(*) filter (where read = false)`.as('unread')])
        .where('user_id', '=', user.sub)
        .groupBy(['folder', 'starred'])
        .execute();

      const labelResult = await sql<{ label: string; unread: number }>`
        select expanded.label, count(*) filter (where m.read = false)::int as unread
        from email_messages m
        cross join lateral jsonb_array_elements_text(coalesce(m.labels, '[]'::jsonb)) as expanded(label)
        where m.tenant_id = ${user.tenant_id}
          and m.user_id = ${user.sub}
          and m.folder <> 'trash'
        group by expanded.label
      `.execute(trx);

      const byFolder = new Map<string, { total: number; unread: number }>();
      let starredTotal = 0, starredUnread = 0;
      for (const r of rows) {
        const prev = byFolder.get(r.folder) ?? { total: 0, unread: 0 };
        byFolder.set(r.folder, { total: prev.total + Number(r.total), unread: prev.unread + Number(r.unread) });
        if (r.starred && r.folder !== 'trash') {
          starredTotal += Number(r.total);
          starredUnread += Number(r.unread);
        }
      }

      const of = (folder: string) => byFolder.get(folder) ?? { total: 0, unread: 0 };
      return {
        inbox: of('inbox').unread,
        starred: starredUnread,
        drafts: of('drafts').total,
        scheduled: of('scheduled').total,
        spam: of('spam').unread,
        labels: Object.fromEntries(labelResult.rows.map(r => [r.label, Number(r.unread)])),
      };
    });
  });

  // GET /v1/emails?folder=inbox|sent|drafts|spam|trash|scheduled|archive|starred&search=&limit=&offset=
  // Used to return the entire matched folder in one response and let the
  // frontend slice it into pages of 15 — fine for a demo mailbox, real cost
  // for a real one. Now a real LIMIT/OFFSET with a total count alongside it.
  fastify.get('/', async (request: any) => {
    const user = request.user;
    const query = request.query as Record<string, string | undefined>;
    const { folder, search } = query;
    const rawLimit = parseInt((request.query as any).limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const rawOffset = parseInt((request.query as any).offset, 10);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    // Advanced search (Gmail's own "From/To/Subject/Has the words/Doesn't
    // have/Size/Date within/Search/Has attachment" form) — every field is
    // optional and independently combinable; an empty/absent field applies
    // no constraint at all, so a plain folder view is unaffected.
    const adv = {
      from: query.advFrom?.trim(),
      to: query.advTo?.trim(),
      subject: query.advSubject?.trim(),
      hasWords: query.advHasWords?.trim(),
      doesntHave: query.advDoesntHave?.trim(),
      hasAttachment: query.advHasAttachment === '1',
      sizeCmp: query.advSizeCmp as 'gt' | 'lt' | undefined,
      sizeMb: query.advSizeMb ? Number(query.advSizeMb) : undefined,
      dateWithin: query.advDateWithin as string | undefined,
      dateAfter: query.advDateAfter,
      dateBefore: query.advDateBefore,
      scope: query.advScope,
    };

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('email_messages as m')
        .leftJoin('email_outbox as o', 'o.id', 'm.outbox_id')
        .selectAll('m').select('o.status as delivery_status')
        .where('m.user_id', '=', user.sub);
      // advScope, when present, replaces the plain folder/starred filter —
      // 'all' searches every folder, 'label:<name>' searches every folder
      // carrying that label, and a bare folder name behaves like `folder`.
      if (adv.scope === 'all') {
        // no folder constraint
      } else if (adv.scope?.startsWith('label:')) {
        const labelName = adv.scope.slice('label:'.length);
        q = q.where(sql<boolean>`m.labels @> ${JSON.stringify([labelName])}::jsonb`);
      } else if (adv.scope) {
        q = adv.scope === 'starred'
          ? q.where('m.starred', '=', true).where('m.folder', '!=', 'trash')
          : q.where('m.folder', '=', adv.scope as Folder);
      } else if (folder === 'starred') {
        q = q.where('m.starred', '=', true).where('m.folder', '!=', 'trash');
      } else if (folder) {
        q = q.where('m.folder', '=', folder as Folder);
      }
      // Real full-text search over subject + body (migration 461's
      // generated tsvector column + GIN index) — replaces the in-memory JS
      // substring filter this route used to run over every fetched row,
      // which could never rank matches or search anything not already on
      // this page's result set.
      if (search && search.trim()) {
        q = q.where(sql<boolean>`m.search_vector @@ plainto_tsquery('english', ${search.trim()})`);
      }
      if (adv.from) q = q.where(sql<boolean>`(m.from_name ILIKE ${'%' + adv.from + '%'} OR m.from_email ILIKE ${'%' + adv.from + '%'})`);
      if (adv.to) q = q.where(sql<boolean>`(m.to_addresses::text ILIKE ${'%' + adv.to + '%'} OR m.cc_addresses::text ILIKE ${'%' + adv.to + '%'})`);
      if (adv.subject) q = q.where('m.subject', 'ilike', `%${adv.subject}%`);
      if (adv.hasWords) q = q.where(sql<boolean>`m.search_vector @@ plainto_tsquery('english', ${adv.hasWords})`);
      if (adv.doesntHave) q = q.where(sql<boolean>`NOT (m.search_vector @@ plainto_tsquery('english', ${adv.doesntHave}))`);
      if (adv.hasAttachment) q = q.where('m.has_attachment', '=', true);
      // Approximates a message's size from its stored plain-text body bytes
      // — this app has no separately tracked total-MIME-size column, so
      // this is honestly "how long is the text," not the exact byte count a
      // real mail client reports (which also counts headers/encoding).
      if (adv.sizeCmp && adv.sizeMb != null && !Number.isNaN(adv.sizeMb)) {
        const bytes = Math.round(adv.sizeMb * 1024 * 1024);
        q = adv.sizeCmp === 'gt'
          ? q.where(sql<boolean>`octet_length(m.body) > ${bytes}`)
          : q.where(sql<boolean>`octet_length(m.body) < ${bytes}`);
      }
      if (adv.dateWithin) {
        const match = /^(\d+)([dwmy])$/.exec(adv.dateWithin);
        if (match) {
          const [, n, unit] = match;
          const interval = { d: 'days', w: 'weeks', m: 'months', y: 'years' }[unit as 'd' | 'w' | 'm' | 'y'];
          q = q.where(sql<boolean>`m.created_at >= now() - (${n + ' ' + interval})::interval`);
        }
      }
      if (adv.dateAfter) {
        const d = new Date(adv.dateAfter);
        if (!Number.isNaN(d.getTime())) q = q.where('m.created_at', '>=', d);
      }
      if (adv.dateBefore) {
        const d = new Date(adv.dateBefore);
        if (!Number.isNaN(d.getTime())) q = q.where('m.created_at', '<=', d);
      }

      // Same filters, no join/columns — just the count this folder+search
      // combination matches in total, independent of the page being fetched.
      const totalRow = await q.clearSelect().select(sql<number>`count(*)`.as('n')).executeTakeFirst();
      const total = Number(totalRow?.n ?? 0);

      // Inbox display preference (Settings ▸ Inbox) — 'default' is plain
      // chronological, unchanged from before this preference existed.
      const accountRow = await trx.selectFrom('user_email_accounts').select('inbox_sort').where('user_id', '=', user.sub).executeTakeFirst();
      let sortedQ = q.selectAll('m').select('o.status as delivery_status');
      if (accountRow?.inbox_sort === 'unread_first') sortedQ = sortedQ.orderBy('m.read', 'asc');
      else if (accountRow?.inbox_sort === 'starred_first') sortedQ = sortedQ.orderBy('m.starred', 'desc');
      const rows = await sortedQ
        .orderBy('m.created_at', 'desc')
        .limit(limit).offset(offset)
        .execute();

      // Cross-folder thread counts — a genuine conversation count (a reply
      // that moved to Sent, or an original that's since been archived, both
      // still count), not just "how many rows share this thread_id within
      // the folder currently being viewed." Trash is excluded, matching how
      // most mail clients don't count a deleted copy as part of a live
      // conversation.
      const threadIds = Array.from(new Set(rows.map(r => r.thread_id)));
      const threadCounts = new Map<string, number>();
      if (threadIds.length) {
        const counts = await trx.selectFrom('email_messages')
          .select(['thread_id', sql<number>`count(*)`.as('n')])
          .where('user_id', '=', user.sub)
          .where('thread_id', 'in', threadIds)
          .where('folder', '!=', 'trash')
          .groupBy('thread_id')
          .execute();
        for (const c of counts) threadCounts.set(c.thread_id, Number(c.n));
      }

      return {
        items: rows.map(r => mapMessageRow(r, user, threadCounts)),
        total,
        hasMore: offset + rows.length < total,
      };
    });
  });

  // POST /v1/emails/seed-demo — explicit, dev/demo-only sample-mailbox
  // action. This used to run automatically on every GET / against an empty
  // mailbox, which meant an empty production mailbox got real (fake)
  // correspondence written into it, and deleting all of it just brought the
  // samples back on the next request. Now it's opt-in and disabled in
  // production, same guard integrations/email.ts's dev-only simulated-send
  // fallback already uses.
  fastify.post('/seed-demo', async (request: any, reply) => {
    if (env.APP_ENV === 'production') {
      return reply.status(403).send({ error: 'Sample data is not available in production.' });
    }
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_messages').select('id').where('user_id', '=', user.sub).executeTakeFirst();
      if (existing) {
        return reply.status(409).send({ error: 'This mailbox already has messages.' });
      }
      const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', user.tenant_id).executeTakeFirst();
      const samples = sampleInbox(tenant?.name || 'Hudumika');
      for (const s of samples) {
        const id = crypto.randomUUID();
        await trx.insertInto('email_messages').values({
          id,
          tenant_id: user.tenant_id,
          user_id: user.sub,
          folder: s.folder,
          from_name: s.from_name,
          from_email: s.from_email,
          to_addresses: JSON.stringify(s.to_addresses),
          cc_addresses: JSON.stringify([]),
          subject: s.subject,
          body: s.body,
          snippet: s.snippet,
          read: s.read,
          starred: s.starred,
          labels: JSON.stringify(s.labels),
          has_attachment: s.has_attachment,
          thread_id: id,
          created_at: s.created_at,
        }).execute();
      }
      return { success: true, count: samples.length };
    });
  });

  // GET /v1/emails/thread/:threadId — every message in a conversation,
  // across all folders (except Trash), oldest first — the merged
  // conversation view a single folder listing can't give on its own.
  fastify.get('/thread/:threadId', async (request: any, reply) => {
    const user = request.user;
    const { threadId } = request.params as { threadId: string };
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('email_messages as m')
        .leftJoin('email_outbox as o', 'o.id', 'm.outbox_id')
        .selectAll('m').select('o.status as delivery_status')
        .where('m.user_id', '=', user.sub)
        .where('m.thread_id', '=', threadId)
        .where('m.folder', '!=', 'trash')
        .orderBy('m.created_at', 'asc')
        .execute();
      if (rows.length === 0) return reply.status(404).send({ error: 'Thread not found' });
      const threadCounts = new Map([[threadId, rows.length]]);
      return rows.map(r => mapMessageRow(r, user, threadCounts));
    });
  });

  // POST /v1/emails/attachments — upload one file, returns the storage
  // pointer POST /v1/email/send takes. Not tied to a message id: a compose
  // draft has no row yet, so the file has to be stored first and attached
  // by reference at send time (same pattern MailService.sendNow already
  // uses for the daily-shipment-report PDF). Called once per file for
  // multiple attachments — the frontend's own compose picker loops this.
  fastify.post('/attachments', async (request: any, reply) => {
    const user = request.user;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });
    const buffer = await data.toBuffer();
    // 20MB — the same ceiling most real SMTP relays enforce in practice, so
    // an attachment that uploads here won't then silently fail to send.
    if (buffer.length > 20 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Attachments are limited to 20MB.' });
    }
    const up = await MinioIntegration.uploadEmailAttachment(user.tenant_id, user.sub, data.filename || 'attachment', buffer);
    return { storageKey: up.storageKey, filename: data.filename || 'attachment', size: up.size };
  });

  // GET /v1/emails/:id/attachment?key=<storageKey> — a short-lived signed
  // download URL for one attachment on a message this user actually owns.
  // `key` selects which one on a multi-attachment message; omitted = the
  // first. The key is validated against this message's own attachment list
  // (not taken on faith) so this can't be used to sign an arbitrary
  // storage key belonging to a different message or tenant.
  fastify.get('/:id/attachment', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { key } = request.query as { key?: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('email_messages')
        .select(['attachments', 'attachment_storage_key', 'attachment_filename', 'attachment_size'])
        .where('id', '=', id).where('user_id', '=', user.sub)
        .executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Message not found' });
      const list = mergeAttachments(row);
      const target = key ? list.find(a => a.storageKey === key) : list[0];
      if (!target) return reply.status(404).send({ error: 'No attachment on this message.' });
      const url = await MinioIntegration.getSignedUrl(user.tenant_id, target.storageKey, 600);
      return { url, filename: target.filename };
    });
  });

  // POST /v1/emails/drafts — create a new draft. Saved as a real
  // email_messages row from the first keystroke onward (via the frontend's
  // debounced autosave), not held only in React state until Send is
  // clicked — closing the tab used to lose it.
  fastify.post('/drafts', async (request: any, reply) => {
    const user = request.user;
    const b = draftSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const toAddrs = b.to.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      const ccAddrs = b.cc.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      const bccAddrs = b.bcc.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      const id = crypto.randomUUID();
      const row = await trx.insertInto('email_messages').values({
        id,
        tenant_id: user.tenant_id,
        user_id: user.sub,
        folder: 'drafts',
        from_name: user.name || user.email || 'Me',
        from_email: user.email || '',
        to_addresses: JSON.stringify(toAddrs),
        cc_addresses: JSON.stringify(ccAddrs),
        bcc_addresses: JSON.stringify(bccAddrs),
        subject: b.subject,
        body: b.body,
        snippet: b.body.slice(0, 120),
        read: true,
        starred: false,
        labels: JSON.stringify([]),
        has_attachment: b.attachments.length > 0,
        attachments: JSON.stringify(b.attachments),
        thread_id: id,
      }).returning('id').executeTakeFirstOrThrow();
      reply.status(201);
      return { id: row.id };
    });
  });

  // PATCH /v1/emails/:id — read / starred / folder / labels, and (drafts or
  // still-scheduled rows only) the message's own content fields.
  fastify.patch('/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = messagePatchSchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_messages').select(['folder']).where('id', '=', id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Message not found' });

      const patch: Record<string, any> = {};
      if (b.read !== undefined) patch.read = b.read;
      if (b.starred !== undefined) patch.starred = b.starred;
      if (b.folder !== undefined) patch.folder = b.folder;
      if (b.labels !== undefined) patch.labels = JSON.stringify(b.labels);

      // Content edits only ever apply to a message still sitting in Drafts,
      // or one still waiting out its scheduled/undo-send window — this is
      // the one place a "PATCH content" call could otherwise rewrite a
      // message someone already sent or received.
      if (existing.folder === 'drafts' || existing.folder === 'scheduled') {
        if (b.to !== undefined) patch.to_addresses = JSON.stringify(b.to.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a })));
        if (b.cc !== undefined) patch.cc_addresses = JSON.stringify(b.cc.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a })));
        if (b.bcc !== undefined) patch.bcc_addresses = JSON.stringify(b.bcc.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a })));
        if (b.subject !== undefined) patch.subject = b.subject;
        if (b.body !== undefined) { patch.body = b.body; patch.snippet = b.body.slice(0, 120); }
        if (b.attachments !== undefined) { patch.attachments = JSON.stringify(b.attachments); patch.has_attachment = b.attachments.length > 0; }
      }
      if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No updatable fields provided' });

      const row = await trx.updateTable('email_messages').set(patch)
        .where('id', '=', id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Message not found' });
      return { success: true };
    });
  });

  // POST /v1/emails/bulk — the bulk-select toolbar's actions beyond
  // single-delete: mark read/unread, archive, trash, spam/not-spam, and
  // permanent delete. Every id is scoped to this user's own mailbox, same
  // as the single-item routes above.
  fastify.post('/bulk', async (request: any, reply) => {
    const user = request.user;
    const b = bulkSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      if (b.action === 'delete') {
        const res = await trx.deleteFrom('email_messages')
          .where('id', 'in', b.ids).where('user_id', '=', user.sub)
          .executeTakeFirst();
        return { success: true, count: Number(res.numDeletedRows ?? 0) };
      }
      if (b.action === 'label' || b.action === 'unlabel') {
        if (!b.label) return reply.status(400).send({ error: 'A label is required for this action.' });
        // Per-row read-modify-write, not a single set() — each message's
        // `labels` array can already differ, so there's no one JSON patch
        // that adds/removes the same value from every row at once.
        const rows = await trx.selectFrom('email_messages').select(['id', 'labels'])
          .where('id', 'in', b.ids).where('user_id', '=', user.sub).execute();
        let count = 0;
        for (const row of rows) {
          const current: string[] = Array.isArray(row.labels) ? row.labels : [];
          const next = b.action === 'label'
            ? (current.includes(b.label) ? current : [...current, b.label])
            : current.filter(l => l !== b.label);
          if (next.length === current.length && next.every((l, i) => l === current[i])) continue;
          await trx.updateTable('email_messages').set({ labels: JSON.stringify(next) })
            .where('id', '=', row.id).where('user_id', '=', user.sub).execute();
          count++;
        }
        return { success: true, count };
      }
      const patch: Record<string, any> =
        b.action === 'read' ? { read: true } :
        b.action === 'unread' ? { read: false } :
        { folder: b.action }; // 'archive' | 'trash' | 'spam' | 'inbox'
      const res = await trx.updateTable('email_messages').set(patch)
        .where('id', 'in', b.ids).where('user_id', '=', user.sub)
        .executeTakeFirst();
      return { success: true, count: Number(res.numUpdatedRows ?? 0) };
    });
  });

  // DELETE /v1/emails/:id — permanent delete. Used both from Trash (final
  // delete) and as the cancel/undo mechanism for a still-'scheduled' row —
  // deleting it before scheduled-email-send.job.ts's next sweep is exactly
  // "undo send" / "cancel scheduled send", with no separate endpoint needed.
  fastify.delete('/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('email_messages')
        .where('id', '=', id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Message not found' });
      reply.status(204);
      return null;
    });
  });
}

export async function emailSendRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  // HUD-0034 — see emailRoutes above; same file-boundary gap, separate plugin.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // POST /v1/email/send — queues the message into the 'scheduled' folder
  // rather than sending synchronously; scheduled-email-send.job.ts performs
  // the real delivery once scheduled_at arrives (UNDO_WINDOW_MS by default,
  // or the caller's own sendAt for "Schedule send"). The compose UI's own
  // "message sent" feedback is immediate either way — what's deferred is
  // only the real network send, giving the short window Undo needs.
  fastify.post('/send', async (request: any, reply) => {
    const input = sendSchema.parse(request.body);
    const { to, cc, bcc, subject } = input;

    const user = request.user;
    const tenantId = user.tenant_id;

    const attachments = [
      ...(input.attachmentStorageKey ? [{ storageKey: input.attachmentStorageKey, filename: input.attachmentFilename || 'attachment', size: input.attachmentSize ?? null }] : []),
      ...(input.attachments ?? []).map(a => ({ storageKey: a.storageKey, filename: a.filename, size: a.size ?? null })),
    ];

    return withTenant(tenantId, async (trx) => {
      // Thread resolution — a reply inherits its parent's thread_id and, for
      // real RFC 5322 threading, its parent's own message_id/references
      // chain (this message's own message_id isn't known yet — it comes
      // from the deferred job's real send result, not at queue time). A
      // fresh compose starts its own thread (own id, decided up front so
      // the insert below can set it in the same statement as the row itself).
      const newId = crypto.randomUUID();
      let threadId: string = newId;
      let inReplyTo: string | null = null;
      let inReplyToMessageId: string | null = null;
      let referencesIds: string[] = [];
      if (input.inReplyTo) {
        const parent = await trx.selectFrom('email_messages').select(['thread_id', 'message_id', 'references_ids'])
          .where('id', '=', input.inReplyTo).where('user_id', '=', user.sub).executeTakeFirst();
        if (parent) {
          threadId = parent.thread_id;
          inReplyTo = input.inReplyTo;
          inReplyToMessageId = parent.message_id ?? null;
          const parentRefs = Array.isArray(parent.references_ids) ? parent.references_ids : [];
          referencesIds = parent.message_id ? [...parentRefs, parent.message_id] : parentRefs;
        }
      }

      // Signature — appended server-side so every send path picks it up
      // the same way regardless of which frontend surface built the body.
      // EmailApp.tsx's own Compose/Reply now insert it into the editable
      // body directly (so the sender can actually see and edit what's
      // about to go out, matching every real mail client) — the check
      // below skips re-appending when that's already happened, so only a
      // caller that never touched the signature at all (the right-sidebar
      // quick-composer in GoogleWorkspaceRightSidebar.tsx, still a bare
      // to/subject/body form) gets it added here.
      const account = await trx.selectFrom('user_email_accounts').select(['signature']).where('user_id', '=', user.sub).executeTakeFirst();
      const signature = account?.signature?.trim();
      const fullBody = signature && !input.body.includes(signature) ? `${input.body}\n\n--\n${signature}` : input.body;

      // A draft this send supersedes is gone the moment it's queued — the
      // compose is "done" the instant Send is clicked even though real
      // delivery is deferred a few seconds for the undo window.
      if (input.draftId) {
        await trx.deleteFrom('email_messages').where('id', '=', input.draftId).where('user_id', '=', user.sub).execute();
      }

      const toAddrs = to.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      const ccList = (cc || '').split(',').map(a => a.trim()).filter(Boolean);
      const ccAddrs = ccList.map(a => ({ name: a, email: a }));
      const bccAddrs = (bcc || '').split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));

      const scheduledAt = input.sendAt ? new Date(input.sendAt) : new Date(Date.now() + UNDO_WINDOW_MS);
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.status(400).send({ success: false, error: 'Invalid sendAt.' });
      }

      // A chosen "From" alias (Compose's From picker, migration 494) shows
      // in the Sent-folder copy as the address it was actually sent from —
      // scoped to this user so someone else's tenant-mate alias can't be
      // spoofed by id; silently ignored (falls back to the account address)
      // rather than erroring, same as any other stale/foreign reference.
      const identity = input.fromIdentityId
        ? await trx.selectFrom('email_send_identities').select(['id', 'from_name', 'from_email'])
            .where('id', '=', input.fromIdentityId).where('user_id', '=', user.sub).executeTakeFirst()
        : null;

      await trx.insertInto('email_messages').values({
        id: newId,
        tenant_id: tenantId,
        user_id: user.sub,
        folder: 'scheduled',
        from_name: identity?.from_name || user.name || user.email || 'Me',
        from_email: identity?.from_email || user.email || '',
        from_identity_id: identity?.id ?? null,
        to_addresses: JSON.stringify(toAddrs),
        cc_addresses: JSON.stringify(ccAddrs),
        bcc_addresses: JSON.stringify(bccAddrs),
        subject,
        body: fullBody,
        snippet: fullBody.slice(0, 120),
        read: true,
        starred: false,
        labels: JSON.stringify([]),
        has_attachment: attachments.length > 0,
        attachments: JSON.stringify(attachments),
        thread_id: threadId,
        in_reply_to: inReplyTo,
        in_reply_to_message_id: inReplyToMessageId,
        references_ids: JSON.stringify(referencesIds),
        read_receipt_requested: !!input.requestReadReceipt,
        scheduled_at: scheduledAt,
      }).execute();

      return {
        success: true,
        id: newId,
        scheduledAt: scheduledAt.toISOString(),
        // null when this was an explicit schedule-send — the frontend only
        // shows the "Undo" countdown toast for the default short window.
        undoWindowMs: input.sendAt ? null : UNDO_WINDOW_MS,
      };
    });
  });
}
