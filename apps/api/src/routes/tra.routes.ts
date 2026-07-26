import { requireEntitlement } from '../middleware/entitlement.js';
/**
 * TRA VFD API Routes
 * Endpoints for TRA registration, token management,
 * invoice submission, Z-reports and expense verification.
 */

import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { TRAService } from '../services/tra.service.js';
import { db, withTenant } from '../db/client.js';
import fs from 'fs';
import path from 'path';

export async function traRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('clearos'));

  // ── GET /v1/tra/config ──────────────────────────────────────────────────────
  // Returns current TRA VFD configuration status for the tenant.
  fastify.get('/config', async (request) => {
    const user = request.user as any;
    const config = await TRAService.getConfig(user.tenant_id);
    return config || { isRegistered: false, message: 'TRA VFD not yet configured' };
  });

  // ── POST /v1/tra/register ────────────────────────────────────────────────────
  // One-time VFD registration with TRA. Requires ADMIN role and the PFX file
  // to have been uploaded already (provide pfx_path) or upload via multipart.
  fastify.post(
    '/register',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (request, reply) => {
      const user = request.user as any;
      const body = request.body as any;

      const {
        tin,
        cert_key,
        cert_serial,
        pfx_path,
        pfx_password,
        environment = 'test',
      } = body;

      if (!tin || !cert_key || !cert_serial) {
        return reply.status(400).send({ error: 'tin, cert_key, and cert_serial are required' });
      }

      // Determine PFX path: either provided directly or look in uploads
      let resolvedPfxPath = pfx_path;
      if (!resolvedPfxPath) {
        return reply.status(400).send({ error: 'pfx_path is required. Upload the .pfx file first via POST /v1/tra/upload-cert' });
      }

      if (!fs.existsSync(resolvedPfxPath)) {
        return reply.status(400).send({ error: `PFX file not found at: ${resolvedPfxPath}` });
      }

      const result = await TRAService.register(
        user.tenant_id,
        tin,
        cert_key,
        cert_serial,
        resolvedPfxPath,
        pfx_password || '',
        environment,
      );

      if (!result.success) {
        return reply.status(400).send({ error: result.error, ackCode: result.ackCode, ackMsg: result.ackMsg });
      }

      return { success: true, data: result };
    },
  );

  // ── POST /v1/tra/upload-cert ─────────────────────────────────────────────────
  // Upload the TRA-provided .pfx certificate file.
  fastify.post(
    '/upload-cert',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (request, reply) => {
      const user = request.user as any;

      const data = await (request as any).file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const ext = path.extname(data.filename).toLowerCase();
      if (ext !== '.pfx' && ext !== '.p12') {
        return reply.status(400).send({ error: 'Only .pfx or .p12 files are accepted' });
      }

      const uploadDir = path.join(process.cwd(), 'uploads', 'tra', user.tenant_id);
      fs.mkdirSync(uploadDir, { recursive: true });

      const destPath = path.join(uploadDir, `cert${ext}`);
      const fileBuffer = await data.toBuffer();
      fs.writeFileSync(destPath, fileBuffer);

      return { success: true, pfx_path: destPath, message: 'Certificate uploaded. Use this pfx_path in POST /v1/tra/register' };
    },
  );

  // ── POST /v1/tra/token ───────────────────────────────────────────────────────
  // Manually refresh the TRA bearer token.
  fastify.post(
    '/token',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (request, reply) => {
      const user = request.user as any;
      const result = await TRAService.getToken(user.tenant_id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }
      return { success: true, expiresAt: result.expiresAt };
    },
  );

  // ── POST /v1/tra/z-report ────────────────────────────────────────────────────
  // Manually trigger Z-report submission for today or a specified date.
  fastify.post(
    '/z-report',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') },
    async (request, reply) => {
      const user = request.user as any;
      const body = request.body as any;
      const date = body?.date ? new Date(body.date) : undefined;

      const result = await TRAService.submitZReport(user.tenant_id, date);
      if (!result.success) {
        return reply.status(400).send({ error: result.error, ackCode: result.ackCode, ackMsg: result.ackMsg });
      }
      return { success: true, ackCode: result.ackCode, ackMsg: result.ackMsg };
    },
  );

  // ── POST /v1/tra/verify-receipt ──────────────────────────────────────────────
  // Verify a supplier EFD/VFD receipt number against the TRA portal. When
  // bill_id is provided, the result is persisted onto that supplier bill so
  // Bills/Expenses can show a verified badge without re-checking every time.
  fastify.post(
    '/verify-receipt',
    async (request, reply) => {
      const user = request.user as any;
      const body = request.body as any;
      const { rctvnum, bill_id } = body;

      if (!rctvnum) {
        return reply.status(400).send({ error: 'rctvnum is required' });
      }

      const result = await TRAService.verifyEFDReceipt(rctvnum);

      if (bill_id) {
        const bill = await db
          .selectFrom('supplier_bills')
          .select('id')
          .where('id', '=', bill_id)
          .where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();

        if (!bill) return reply.status(404).send({ error: 'Bill not found' });

        await db.updateTable('supplier_bills').set({
          efd_receipt_number: rctvnum,
          efd_verified: !!result.verified,
          efd_verified_at: new Date(),
          efd_verification_data: result.data ?? { error: result.error },
          updated_at: new Date(),
        }).where('id', '=', bill_id).execute();
      }

      return result;
    },
  );

  // ── GET /v1/tra/invoices/pending ──────────────────────────────────────────────
  // List invoices that haven't been submitted to TRA yet.
  fastify.get('/invoices/pending', async (request) => {
    const user = request.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx
        .selectFrom('sales_invoices')
        .select([
          'id', 'invoice_number', 'client_name', 'bill_date', 'status',
          'tra_status', 'tra_rctnum', 'tra_rctvnum', 'tra_ack_code', 'tra_ack_msg',
          'tra_submitted_at', 'tra_qr_url',
        ])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '!=', 'Draft')
        .orderBy('created_at', 'desc')
        .execute();
    });
  });

  // ── POST /v1/tra/invoices/:id/submit ─────────────────────────────────────────
  // Submit a specific invoice to TRA EFDMS.
  fastify.post(
    '/invoices/:id/submit',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') },
    async (request, reply) => {
      const user = request.user as any;
      const { id } = request.params as { id: string };

      const result = await TRAService.submitInvoice(user.tenant_id, id);
      if (!result.success) {
        return reply.status(400).send({ error: result.error, ackCode: result.ackCode, ackMsg: result.ackMsg });
      }

      await withTenant(user.tenant_id, async (trx) => {
        await trx.insertInto('invoice_activity_log').values({
          tenant_id: user.tenant_id, invoice_id: id, actor_id: user.sub, actor_name: user.name || user.email,
          action: 'tra_submitted', detail: `Receipt ${result.rctvNum}`, created_at: new Date(),
        }).execute();
      });

      return {
        success: true,
        rctNum: result.rctNum,
        rctvNum: result.rctvNum,
        qrUrl: result.qrUrl,
        ackCode: result.ackCode,
        ackMsg: result.ackMsg,
      };
    },
  );

  // ── GET /v1/tra/invoices/:id/qr ──────────────────────────────────────────────
  // Get QR code data URL (base64 PNG) for a submitted invoice.
  fastify.get('/invoices/:id/qr', async (request, reply) => {
    const user = request.user as any;
    const { id } = request.params as { id: string };

    const invoice = await db
      .selectFrom('sales_invoices')
      .select(['tra_rctvnum', 'tra_status', 'tra_qr_url'])
      .where('id', '=', id)
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();

    if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
    if (!invoice.tra_rctvnum) return reply.status(400).send({ error: 'Invoice not yet submitted to TRA' });

    const config = await TRAService.getConfig(user.tenant_id);
    const env = (config?.environment || 'production') as 'test' | 'production';

    const qrDataUrl = await TRAService.generateQRCodeDataUrl(invoice.tra_rctvnum, env);
    return { rctvNum: invoice.tra_rctvnum, qrUrl: invoice.tra_qr_url, qrDataUrl };
  });
}
