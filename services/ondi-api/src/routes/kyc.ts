import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { requireAdmin } from '../lib/admin-auth.js';
import { verifyDocument } from '../lib/document-verification.js';
import { validateEmbedding } from '../lib/biometrics.js';
import { checkForDuplicateEnrollment } from '../lib/dedup.js';

const kycSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  nin: z.string(),
  documentType: z.enum(['NIN', 'PASSPORT', 'DRIVER_LICENSE']),
});

// Local disk storage for dev — a real deployment should point this at S3 or
// equivalent object storage instead. Real either way; this isn't the fake
// S3 URL the old code returned.
const UPLOAD_DIR = process.env.KYC_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'kyc');

async function extractUserId(request: any, reply: any): Promise<string | null> {
  const authHeader = request.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

const kycRoutes: FastifyPluginAsync = async (fastify) => {

  // ─── 1. Initiate KYC Submission ─────────────────────────────────────────────
  fastify.post('/submit', async (request, reply) => {
    const userId = await extractUserId(request, reply);
    if (!userId) return;

    const data = kycSchema.parse(request.body);

    // Create a KYC submission record
    const submission = await fastify.prisma.kYCRecord.create({
      data: {
        userId,
        documentType:       data.documentType as any,
        documentNumber:     data.nin,
        fullName:           `${data.firstName} ${data.lastName}`,
        status:             'PENDING',
        verificationSource: 'NIDA',
      }
    });

    // Create an ActivityEvent
    await fastify.prisma.activityEvent.create({
      data: {
        userId,
        type: 'KYC',
        status: 'PENDING',
        metadata: { submissionId: submission.id }
      }
    });

    return {
      submissionId: submission.id,
      uploadUrl: `/v1/kyc/submissions/${submission.id}/document`,
      expiresIn: 3600
    };
  });

  // ─── 1b. Upload the document image ──────────────────────────────────────────
  fastify.post('/submissions/:id/document', async (request: any, reply) => {
    const userId = await extractUserId(request, reply);
    if (!userId) return;

    const { id } = request.params as { id: string };
    const existing = await fastify.prisma.kYCRecord.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId)
      return reply.code(404).send({ error: 'submission_not_found' });
    if (existing.status !== 'PENDING' && existing.status !== 'REVIEW')
      return reply.code(409).send({ error: 'submission_already_resolved' });

    const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: 'file_required' });
    const buffer = await file.toBuffer();

    const ext = (file.filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const filename = `${id}.${ext}`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

    await fastify.prisma.kYCRecord.update({ where: { id }, data: { documentImageUrl: filename } });

    return reply.send({ uploaded: true });
  });

  // ─── 1c. Admin: fetch the uploaded document image ───────────────────────────
  fastify.get('/submissions/:id/document', async (request: any, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const record = await fastify.prisma.kYCRecord.findUnique({ where: { id } });
    if (!record?.documentImageUrl) return reply.code(404).send({ error: 'no_document_uploaded' });

    try {
      const buffer = await fs.readFile(path.join(UPLOAD_DIR, record.documentImageUrl));
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({ error: 'document_file_missing' });
    }
  });

  // ─── 1d. Submit the liveness-check selfie's face embedding ─────────────────
  // The mobile app already computes this on-device (TFLite MobileFaceNet) for
  // local app-unlock — this is that same embedding, now also reaching the
  // server for the first time. No image is sent or needed here, only the
  // already-computed vector. See src/lib/biometrics.ts for exactly what this
  // is (and isn't) used for.
  fastify.post('/submissions/:id/selfie', async (request: any, reply) => {
    const userId = await extractUserId(request, reply);
    if (!userId) return;

    const { id } = request.params as { id: string };
    const existing = await fastify.prisma.kYCRecord.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId)
      return reply.code(404).send({ error: 'submission_not_found' });

    const embedding = validateEmbedding((request.body as any)?.embedding);
    if (!embedding) return reply.code(400).send({ error: 'invalid_embedding' });

    await fastify.prisma.kYCRecord.update({ where: { id }, data: { selfieEmbedding: embedding } });

    const duplicate = await checkForDuplicateEnrollment(fastify, userId, embedding);
    if (duplicate) {
      await fastify.prisma.fraudAlert.create({
        data: {
          userId,
          type: 'MULTIPLE_ACCOUNTS',
          severity: 'HIGH',
          description: `Liveness-check face embedding closely matches an existing user (${duplicate.duplicateOfUserId}) — possible duplicate registration.`,
          metadata: { submissionId: id, duplicateOfUserId: duplicate.duplicateOfUserId, similarity: duplicate.similarity },
        },
      });
      await fastify.audit.write({
        entityType: 'USER', entityId: userId, action: 'ADMIN_UPDATE', category: 'FRAUD',
        performedBy: 'system:dedup', metadata: { submissionId: id, duplicateOfUserId: duplicate.duplicateOfUserId, similarity: duplicate.similarity },
        severity: 'WARNING', isRegulatory: true,
      });
    }

    return reply.send({ captured: true, duplicateFlagged: !!duplicate });
  });

  // ─── 2. Mark Upload Complete & Run Real Verification ────────────────────────
  fastify.post('/complete-upload', async (request, reply) => {
    const userId = await extractUserId(request, reply);
    if (!userId) return;

    const { submissionId } = z.object({ submissionId: z.string() }).parse(request.body);

    const existing = await fastify.prisma.kYCRecord.findUnique({ where: { id: submissionId } });
    if (!existing || existing.userId !== userId)
      return reply.code(404).send({ error: 'submission_not_found' });

    const submission = await fastify.prisma.kYCRecord.update({
      where: { id: submissionId },
      data: { status: 'REVIEW' }
    });

    // Real OCR + MRZ/structural verification, run in background — errors
    // logged not swallowed. If no document image was ever uploaded (older
    // mobile client flows that only submit typed fields), this stays in
    // REVIEW rather than guessing — a human needs a photo to check.
    const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

    const runVerification = async () => {
      if (!submission.documentImageUrl) {
        await fastify.audit.write({
          entityType: 'USER', entityId: submission.userId, action: 'ADMIN_UPDATE', category: 'IDENTITY',
          performedBy: 'system:document-verification',
          metadata: { submissionId, reason: 'no_document_image_uploaded' },
          severity: 'INFO', isRegulatory: false,
        });
        return;
      }

      // OCR/MRZ verification only understands raster images (sharp can't
      // read PDF/DOC) — a PDF or Word doc was still uploaded and stored
      // above, it just needs a human reviewer instead of the automated path.
      const ext = submission.documentImageUrl.split('.').pop()?.toLowerCase() ?? '';
      if (!IMAGE_EXTENSIONS.has(ext)) {
        await fastify.audit.write({
          entityType: 'USER', entityId: submission.userId, action: 'ADMIN_UPDATE', category: 'IDENTITY',
          performedBy: 'system:document-verification',
          metadata: { submissionId, reason: 'non_image_document_needs_manual_review', ext },
          severity: 'INFO', isRegulatory: false,
        });
        return;
      }

      const imageBuffer = await fs.readFile(path.join(UPLOAD_DIR, submission.documentImageUrl));
      const result = await verifyDocument({
        documentType: submission.documentType as 'NIN' | 'PASSPORT' | 'DRIVER_LICENSE',
        imageBuffer,
        claimedFullName: submission.fullName ?? '',
        claimedDocumentNumber: submission.documentNumber,
      });

      await fastify.prisma.kYCRecord.update({
        where: { id: submissionId },
        data: {
          status: result.status,
          confidenceScore: result.confidenceScore,
          verificationDetails: { ...result.details, livenessCaptured: submission.selfieEmbedding.length > 0 } as any,
          verifiedAt: result.status === 'VERIFIED' ? new Date() : null,
        },
      });

      if (result.status === 'VERIFIED') {
        await fastify.prisma.user.update({
          where: { id: submission.userId },
          data: { verificationLevel: 'L2_GOV_VERIFIED' }
        });
      }

      await fastify.prisma.activityEvent.create({
        data: {
          userId: submission.userId,
          type: 'KYC',
          status: result.status === 'VERIFIED' ? 'SUCCESS' : result.status === 'REJECTED' ? 'FAILED' : 'PENDING',
          metadata: { submissionId, confidenceScore: result.confidenceScore, reasons: result.details.reasons }
        }
      });

      await fastify.audit.write({
        entityType: 'USER', entityId: submission.userId,
        action: result.status === 'VERIFIED' ? 'KYC_VERIFIED' : result.status === 'REJECTED' ? 'KYC_REJECTED' : 'ADMIN_UPDATE',
        category: 'IDENTITY', performedBy: 'system:document-verification',
        metadata: { submissionId, status: result.status, confidenceScore: result.confidenceScore, reasons: result.details.reasons },
        severity: result.status === 'REJECTED' ? 'WARNING' : 'INFO', isRegulatory: true,
      });
    };

    runVerification().catch(err => fastify.log.error(err, 'KYC verification background task failed'));

    return { status: 'REVIEW_STARTED' };
  });

  // ─── 3. Get Status ─────────────────────────────────────────────────────────
  fastify.get('/status', async (request, reply) => {
    const userId = await extractUserId(request, reply);
    if (!userId) return;

    const submission = await fastify.prisma.kYCRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return submission || { status: 'NOT_STARTED' };
  });

  // ─── 4. List all KYC Submissions (Admin Console) ────────────────────────────
  fastify.get('/submissions', async (request: any, reply) => {
    if (!requireAdmin(request, reply)) return;

    const submissions = await fastify.prisma.kYCRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            phoneNumber: true,
            email: true,
            firstName: true,
            lastName: true,
          }
        }
      }
    });
    return submissions;
  });

  // ─── 5. Resolve a KYC Submission (Approve / Reject) ─────────────────────────
  fastify.patch('/submissions/:id/resolve', async (request: any, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id } = request.params;
    const { status } = request.body; // 'VERIFIED' or 'REJECTED'
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return reply.code(400).send({ error: 'invalid_status' });
    }

    const record = await fastify.prisma.kYCRecord.update({
      where: { id },
      data: {
        status,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
      },
    });

    // Update user's general KYC status and verification level
    await fastify.prisma.user.update({
      where: { id: record.userId },
      data: {
        kycStatus: status,
        verificationLevel: status === 'VERIFIED' ? 'L2_GOV_VERIFIED' : undefined,
      },
    });

    // Write to audit log
    await fastify.audit.write({
      entityType: 'USER',
      entityId: record.userId,
      action: status === 'VERIFIED' ? 'KYC_VERIFIED' : 'KYC_REJECTED',
      category: 'IDENTITY',
      performedBy: 'admin',
      metadata: { recordId: id },
      severity: status === 'VERIFIED' ? 'INFO' : 'WARNING',
      isRegulatory: true,
    });

    return record;
  });

};

export default kycRoutes;
