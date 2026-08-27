import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MailService } from '../services/mail.service.js';
import { db, withTenant } from '../db/client.js';

type Folder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';
const FOLDERS = ['inbox', 'sent', 'drafts', 'spam', 'trash'] as const;
const messagePatchSchema = z.object({
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
  folder: z.enum(FOLDERS).optional(),
  labels: z.array(z.string()).optional(),
});
const sendSchema = z.object({
  to: z.string().trim().min(1),
  cc: z.string().optional(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1),
});

function daysAgo(n: number, hour = 9, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d;
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

  // GET /v1/emails?folder=inbox|sent|drafts|spam|trash|starred&search=
  fastify.get('/', async (request: any) => {
    const user = request.user;
    const { folder, search } = request.query as { folder?: string; search?: string };

    return withTenant(user.tenant_id, async (trx) => {
      // First-run seed: a brand-new mailbox gets a few realistic sample
      // messages instead of staying permanently empty (or, before this fix,
      // permanently showing a hardcoded frontend-only array).
      const existing = await trx.selectFrom('email_messages').select('id').where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) {
        const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', user.tenant_id).executeTakeFirst();
        const samples = sampleInbox(tenant?.name || 'Hudumika');
        for (const s of samples) {
          await trx.insertInto('email_messages').values({
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
            created_at: s.created_at,
          }).execute();
        }
      }

      let q = trx.selectFrom('email_messages as m')
        .leftJoin('email_outbox as o', 'o.id', 'm.outbox_id')
        .selectAll('m').select('o.status as delivery_status')
        .where('m.user_id', '=', user.sub);
      if (folder === 'starred') {
        q = q.where('m.starred', '=', true).where('m.folder', '!=', 'trash');
      } else if (folder) {
        q = q.where('m.folder', '=', folder as Folder);
      }
      let rows = await q.orderBy('m.created_at', 'desc').execute();

      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r =>
          r.subject.toLowerCase().includes(s) ||
          r.from_name.toLowerCase().includes(s) ||
          r.snippet.toLowerCase().includes(s)
        );
      }

      return rows.map(r => ({
        id: r.id,
        folder: r.folder,
        // A Sent-folder message's sender is always the mailbox owner — a real,
        // known account, not a name string. Inbox/spam senders are external
        // parties with no Hudumika account, so userId stays unset there and
        // PersonAvatar correctly falls back to initials rather than guessing.
        from: { name: r.from_name, email: r.from_email, userId: r.from_email === user.email ? user.sub : undefined },
        to: r.to_addresses,
        cc: r.cc_addresses,
        subject: r.subject,
        body: r.body,
        snippet: r.snippet,
        date: r.created_at,
        read: r.read,
        starred: r.starred,
        labels: r.labels,
        hasAttachment: r.has_attachment,
        // Real delivery status for a Sent-folder row (pending/sending/sent/
        // failed), joined from email_outbox — null for every other folder,
        // and for pre-migration rows sent before outbox_id existed.
        deliveryStatus: (r as any).delivery_status ?? null,
      }));
    });
  });

  // PATCH /v1/emails/:id — read / starred / folder / labels
  fastify.patch('/:id', async (request: any, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const b = messagePatchSchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const patch: Record<string, any> = {};
      if (b.read !== undefined) patch.read = b.read;
      if (b.starred !== undefined) patch.starred = b.starred;
      if (b.folder !== undefined) patch.folder = b.folder;
      if (b.labels !== undefined) patch.labels = JSON.stringify(b.labels);
      if (Object.keys(patch).length === 0) return reply.status(400).send({ error: 'No updatable fields provided' });

      const row = await trx.updateTable('email_messages').set(patch)
        .where('id', '=', id).where('user_id', '=', user.sub)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Message not found' });
      return { success: true };
    });
  });

  // DELETE /v1/emails/:id — permanent delete (from Trash)
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

  // POST /v1/email/send
  fastify.post('/send', async (request: any, reply) => {
    const { to, cc, subject, body } = sendSchema.parse(request.body);

    const user = request.user;
    const tenantId = user.tenant_id;

    const bodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${body}</div>`;
    const ccList = (cc || '').split(',').map(a => a.trim()).filter(Boolean);

    // Sent synchronously, not enqueued — someone actively composing needs to
    // know right now whether it went out, not find out from a queue up to a
    // minute later with no UI feedback in the meantime.
    const result = await MailService.sendNow(tenantId, { to, cc: ccList, subject, bodyHtml, sourceApp: 'email' });

    if (!result.success) {
      return reply.status(500).send({ success: false, error: result.error });
    }

    // Persist a real copy into the sender's own Sent folder so it survives
    // a reload — previously the frontend only ever pushed a local-only
    // object into React state that vanished on refresh.
    await withTenant(tenantId, async (trx) => {
      const toAddrs = to.split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      const ccAddrs = (cc || '').split(',').map(a => a.trim()).filter(Boolean).map(a => ({ name: a, email: a }));
      await trx.insertInto('email_messages').values({
        tenant_id: tenantId,
        user_id: user.sub,
        folder: 'sent',
        from_name: user.name || user.email || 'Me',
        from_email: user.email || '',
        to_addresses: JSON.stringify(toAddrs),
        cc_addresses: JSON.stringify(ccAddrs),
        subject,
        body,
        snippet: body.slice(0, 120),
        read: true,
        starred: false,
        labels: JSON.stringify([]),
        has_attachment: false,
        outbox_id: result.outboxId,
      }).execute();
    });

    return { success: true, outboxId: result.outboxId };
  });
}
