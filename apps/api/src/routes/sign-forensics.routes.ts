// ─── Digital Execution Seal, Phase 3 — forensic case management ───────────────
// Prefix: /v1/sign (registered alongside sign.routes.ts, its own file for
// the same reason sign-stamps.routes.ts/sign-versions.routes.ts already
// are — an unrelated concern kept out of the already-large main file).
//
// Gated to DOCUMENT_ADMIN_ROLES throughout (sign.routes.ts's own "who can
// see every user's documents" tier) — a forensic case is sensitive
// investigative material (§50: "protect... forensic reports... all private
// forensic analysis requires authorization"), not something every Sign-
// entitled staff member should be able to browse.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { MinioIntegration } from '../integrations/minio.js';
import { openForensicCase, recordCustodyEvent, recordAnalysisRun, storeCaseEvidence, type ForensicCaseStatus } from '../services/sign-forensic-case.service.js';
import { DOCUMENT_ADMIN_ROLES } from './sign.routes.js';
import { runContentComparison, type CompareOutcome } from '../services/sign-seal-verify.service.js';
import { generateForensicReportPdf } from '../services/sign-forensic-report.service.js';

function tenantId(req: FastifyRequest): string { return (req.user as { tenant_id: string }).tenant_id; }
function userId(req: FastifyRequest): string { return (req.user as { sub: string }).sub; }
function userName(req: FastifyRequest): string { return (req.user as { name?: string }).name ?? 'Someone'; }

export async function signForensicsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('sign'));
  fastify.addHook('preHandler', requireRole(...DOCUMENT_ADMIN_ROLES));

  // GET /forensics/cases — every case for this tenant, newest first.
  fastify.get('/forensics/cases', async (req: FastifyRequest) => {
    const tid = tenantId(req);
    const { status } = req.query as { status?: string };
    return withTenant(tid, async (trx) => {
      let q = trx.selectFrom('sign_forensic_cases')
        .innerJoin('sign_envelopes', 'sign_envelopes.id', 'sign_forensic_cases.envelope_id')
        .select([
          'sign_forensic_cases.id', 'sign_forensic_cases.envelope_id', 'sign_forensic_cases.verification_code',
          'sign_forensic_cases.content_verdict', 'sign_forensic_cases.status',
          'sign_forensic_cases.opened_by_name', 'sign_forensic_cases.opened_at',
          'sign_forensic_cases.resolved_by', 'sign_forensic_cases.resolved_at', 'sign_forensic_cases.resolution_note',
          'sign_envelopes.title as envelope_title',
        ])
        .where('sign_forensic_cases.tenant_id', '=', tid);
      if (status) q = q.where('sign_forensic_cases.status', '=', status as ForensicCaseStatus);
      return q.orderBy('sign_forensic_cases.opened_at', 'desc').execute();
    });
  });

  // GET /forensics/cases/:id — full detail: evidence manifest + chain of
  // custody + the originating job's own comparison result. Every view is
  // itself a custody event (§45 — "who viewed results").
  fastify.get<{ Params: { id: string } }>('/forensics/cases/:id', async (req, reply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const kase = await trx.selectFrom('sign_forensic_cases')
        .innerJoin('sign_envelopes', 'sign_envelopes.id', 'sign_forensic_cases.envelope_id')
        .select([
          'sign_forensic_cases.id', 'sign_forensic_cases.envelope_id', 'sign_forensic_cases.forensic_job_id',
          'sign_forensic_cases.verification_code', 'sign_forensic_cases.content_verdict', 'sign_forensic_cases.status',
          'sign_forensic_cases.opened_by_name', 'sign_forensic_cases.opened_at', 'sign_forensic_cases.manifest_hash',
          'sign_forensic_cases.resolved_by', 'sign_forensic_cases.resolved_at', 'sign_forensic_cases.resolution_note',
          'sign_envelopes.title as envelope_title', 'sign_envelopes.anchor_hash as canonical_hash',
        ])
        .where('sign_forensic_cases.id', '=', req.params.id).where('sign_forensic_cases.tenant_id', '=', tid)
        .executeTakeFirst();
      if (!kase) return reply.status(404).send({ error: 'Case not found' });

      const [evidence, audit, job, analysisRuns] = await Promise.all([
        trx.selectFrom('sign_forensic_evidence').selectAll()
          .where('case_id', '=', kase.id).orderBy('created_at', 'asc').execute(),
        trx.selectFrom('sign_forensic_audit').selectAll()
          .where('case_id', '=', kase.id).orderBy('created_at', 'desc').execute(),
        kase.forensic_job_id
          ? trx.selectFrom('sign_forensic_jobs').select(['id', 'result', 'media_type', 'created_at'])
              .where('id', '=', kase.forensic_job_id).executeTakeFirst()
          : Promise.resolve(null),
        // Phase 6 — every analysis pass this case has ever had, oldest first
        // so run #1 (the one that opened the case) reads first.
        trx.selectFrom('sign_forensic_analysis_runs').selectAll()
          .where('case_id', '=', kase.id).orderBy('run_number', 'asc').execute(),
      ]);

      await recordCustodyEvent(trx, tid, kase.id, 'viewed', { id: userId(req), name: userName(req) }, undefined, req.ip);

      return { ...kase, evidence, audit, job, analysisRuns };
    });
  });

  // POST /forensics/cases — manually open a case from a completed job,
  // even one whose verdict was clean (e.g. a compliance officer wants a
  // permanent, exportable record of a specific verification for their own
  // file). Auto-opening (verdictNeedsCase) is handled separately by
  // sign-forensic-verify.job.ts right after a non-clean comparison.
  fastify.post<{ Body: { jobId: string; note?: string } }>('/forensics/cases', async (req, reply) => {
    const tid = tenantId(req);
    const { jobId, note } = req.body || {};
    if (!jobId) return reply.status(400).send({ error: 'jobId is required' });

    return withTenant(tid, async (trx) => {
      const job = await trx.selectFrom('sign_forensic_jobs').selectAll()
        .where('id', '=', jobId).where('tenant_id', '=', tid).executeTakeFirst();
      if (!job || job.status !== 'completed' || !job.result) {
        return reply.status(400).send({ error: 'That job has no completed comparison result to build a case from.' });
      }
      const existing = await trx.selectFrom('sign_forensic_cases').select('id')
        .where('forensic_job_id', '=', jobId).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: 'A case already exists for this job.', case_id: existing.id });

      const envelope = await trx.selectFrom('sign_envelopes')
        .select(['id', 'tenant_id', 'title', 'stamped_file_url'])
        .where('id', '=', job.envelope_id ?? '').executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'The envelope this job belongs to no longer exists.' });

      const uploadedBytes = MinioIntegration.readFile(job.storage_key);
      if (!uploadedBytes) return reply.status(410).send({ error: 'This job\'s uploaded evidence has already been cleaned up — a case can no longer be opened from it.' });
      const canonicalBytes = envelope.stamped_file_url ? MinioIntegration.readFile(envelope.stamped_file_url) : null;

      const outcome = job.result as unknown as CompareOutcome;
      const caseId = await openForensicCase(trx, {
        tenantId: tid, envelopeId: envelope.id, verificationCode: job.verification_code,
        forensicJobId: job.id, outcome,
        canonicalBytes, canonicalFilename: `${envelope.title} — canonical.pdf`,
        uploadedBytes, uploadedFilename: `upload.${job.media_type === 'application/pdf' ? 'pdf' : job.media_type.split('/')[1] || 'bin'}`,
        uploadedMediaType: job.media_type,
      }, { id: userId(req), name: userName(req) }, req.ip);

      if (note) {
        await recordCustodyEvent(trx, tid, caseId, 'opened', { id: userId(req), name: userName(req) }, { note }, req.ip);
      }

      reply.status(201);
      return { case_id: caseId };
    });
  });

  // POST /forensics/cases/:id/status — the only mutation a case's own row
  // ever gets after opening. Every transition is its own custody event;
  // the case row's status is just the current summary of the latest one.
  fastify.post<{ Params: { id: string }; Body: { status: ForensicCaseStatus; note?: string } }>('/forensics/cases/:id/status', async (req, reply) => {
    const tid = tenantId(req);
    const { status, note } = req.body || {};
    if (!status || !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
      return reply.status(400).send({ error: 'A valid status is required.' });
    }
    return withTenant(tid, async (trx) => {
      const kase = await trx.selectFrom('sign_forensic_cases').select(['id', 'status'])
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!kase) return reply.status(404).send({ error: 'Case not found' });

      const isTerminal = status === 'resolved' || status === 'dismissed';
      const updated = await trx.updateTable('sign_forensic_cases').set({
        status,
        resolution_note: note ?? null,
        resolved_by: isTerminal ? userId(req) : null,
        resolved_at: isTerminal ? new Date() : null,
        updated_at: new Date(),
      }).where('id', '=', kase.id).returningAll().executeTakeFirstOrThrow();

      await recordCustodyEvent(trx, tid, kase.id, 'status_changed',
        { id: userId(req), name: userName(req) }, { from: kase.status, to: status, note }, req.ip);

      return updated;
    });
  });

  // POST /forensics/cases/:id/reanalyze — Phase 6, "re-analysis
  // versioning": re-runs the exact same comparison logic
  // (runContentComparison — hash, structural, visual, OCR text diff) as
  // the original job, but against the case's OWN already-stored evidence
  // (no new upload needed), and against the envelope's CURRENT seal/anchor
  // state. Useful the moment the real scenario Phase 3's own live test
  // first hit becomes true: OCR was down when the case opened (an
  // INCONCLUSIVE verdict from a genuine Gemini outage, not a fabricated
  // one), and now it's back. Never overwrites the case's opening verdict —
  // appends a new numbered run instead (recordAnalysisRun).
  fastify.post<{ Params: { id: string } }>('/forensics/cases/:id/reanalyze', async (req, reply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const kase = await trx.selectFrom('sign_forensic_cases').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!kase) return reply.status(404).send({ error: 'Case not found' });

      const uploadedEvidence = await trx.selectFrom('sign_forensic_evidence').selectAll()
        .where('case_id', '=', kase.id).where('source', '=', 'uploaded')
        .orderBy('created_at', 'desc').executeTakeFirst();
      if (!uploadedEvidence) return reply.status(400).send({ error: 'This case has no uploaded evidence file to re-analyze.' });
      const uploadedBytes = MinioIntegration.readFile(uploadedEvidence.storage_key);
      if (!uploadedBytes) return reply.status(410).send({ error: 'The uploaded evidence file is no longer available on disk.' });

      const envelope = await trx.selectFrom('sign_envelopes')
        .select([
          'id', 'tenant_id', 'verification_code', 'title', 'anchor_hash', 'stamped_file_url',
          'seal_signature', 'seal_payload', 'seal_key_label', 'seal_type',
          'canonical_text_extract', 'canonical_text_extracted_at',
        ])
        .where('id', '=', kase.envelope_id).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'The envelope this case belongs to no longer exists.' });

      const outcome = await runContentComparison(trx, envelope, uploadedBytes, uploadedEvidence.media_type, { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? null });
      const run = await recordAnalysisRun(trx, tid, kase.id, outcome, { id: userId(req), name: userName(req) });

      // Any NEW visual-diff pages this pass found become their own
      // durable evidence too, namespaced by run number so they never
      // collide with a prior run's images.
      for (const p of outcome.visual?.pages ?? []) {
        await storeCaseEvidence(trx, tid, kase.id, `visual-diff-page-${p.page}-run${run.runNumber}.png`, 'image/png', Buffer.from(p.diffPngBase64, 'base64'), 'visual_diff');
      }

      await recordCustodyEvent(trx, tid, kase.id, 're_analyzed',
        { id: userId(req), name: userName(req) }, { run_number: run.runNumber, verdict: outcome.content_verdict }, req.ip);

      return { run_number: run.runNumber, content_verdict: outcome.content_verdict, result: outcome };
    });
  });

  // POST /forensics/cases/:id/report — builds (or rebuilds) the formal
  // PDF report and stores it as its own durable evidence row
  // (source='report', reserved since migration 429) — downloadable through
  // the same evidence-download endpoint as everything else, no separate
  // route needed for that half.
  fastify.post<{ Params: { id: string } }>('/forensics/cases/:id/report', async (req, reply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const kase = await trx.selectFrom('sign_forensic_cases')
        .innerJoin('sign_envelopes', 'sign_envelopes.id', 'sign_forensic_cases.envelope_id')
        .select([
          'sign_forensic_cases.id', 'sign_forensic_cases.verification_code', 'sign_forensic_cases.content_verdict',
          'sign_forensic_cases.status', 'sign_forensic_cases.opened_by_name', 'sign_forensic_cases.opened_at',
          'sign_forensic_cases.resolved_at', 'sign_forensic_cases.resolution_note', 'sign_forensic_cases.manifest_hash',
          'sign_envelopes.title as envelope_title', 'sign_envelopes.anchor_hash as canonical_hash',
        ])
        .where('sign_forensic_cases.id', '=', req.params.id).where('sign_forensic_cases.tenant_id', '=', tid)
        .executeTakeFirst();
      if (!kase) return reply.status(404).send({ error: 'Case not found' });

      const [evidence, audit, analysisRuns] = await Promise.all([
        trx.selectFrom('sign_forensic_evidence').select(['filename', 'source', 'size_bytes', 'sha256'])
          .where('case_id', '=', kase.id).where('source', '!=', 'report').orderBy('created_at', 'asc').execute(),
        trx.selectFrom('sign_forensic_audit').select(['action', 'actor_name', 'ip_address', 'created_at'])
          .where('case_id', '=', kase.id).execute(),
        trx.selectFrom('sign_forensic_analysis_runs').select(['run_number', 'content_verdict', 'created_at', 'triggered_by_name'])
          .where('case_id', '=', kase.id).orderBy('run_number', 'asc').execute(),
      ]);

      const reportBytes = await generateForensicReportPdf({ kase, evidence, audit, analysisRuns });
      const entry = await storeCaseEvidence(trx, tid, kase.id, `forensic-report-${new Date().toISOString().slice(0, 10)}.pdf`, 'application/pdf', reportBytes, 'report');
      await recordCustodyEvent(trx, tid, kase.id, 'report_generated', { id: userId(req), name: userName(req) }, { filename: entry.filename }, req.ip);

      reply.status(201);
      return { filename: entry.filename, sha256: entry.sha256 };
    });
  });

  // GET /forensics/cases/:id/evidence/:evidenceId/download — every download
  // is an 'exported' custody event (§45).
  fastify.get<{ Params: { id: string; evidenceId: string } }>('/forensics/cases/:id/evidence/:evidenceId/download', async (req, reply) => {
    const tid = tenantId(req);
    return withTenant(tid, async (trx) => {
      const evidence = await trx.selectFrom('sign_forensic_evidence').selectAll()
        .where('id', '=', req.params.evidenceId).where('case_id', '=', req.params.id).where('tenant_id', '=', tid)
        .executeTakeFirst();
      if (!evidence) return reply.status(404).send({ error: 'Evidence not found' });

      const bytes = MinioIntegration.readFile(evidence.storage_key);
      if (!bytes) return reply.status(404).send({ error: 'Evidence file is no longer available' });

      await recordCustodyEvent(trx, tid, req.params.id, 'exported',
        { id: userId(req), name: userName(req) }, { filename: evidence.filename, evidence_id: evidence.id }, req.ip);

      reply.header('Content-Type', evidence.media_type);
      const safeFilename = evidence.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
      return reply.send(bytes);
    });
  });
}
