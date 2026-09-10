// ─── Digital Execution Seal, Phase 3 — forensic case, evidence manifest, ──────
// ─── and chain of custody ──────────────────────────────────────────────────
//
// A case is NOT opened for every verification attempt — sign_verifications
// (267/424) already logs every one of those, forever, cheaply. A case is
// for when there's something to actually investigate: opened automatically
// by sign-forensic-verify.job.ts when a comparison comes back non-clean, or
// manually by an authorized staff member (POST /v1/sign/forensics/cases).
//
// Evidence (§43/§44): every file the case is built from gets its own row in
// sign_forensic_evidence — filename, media type, size, sha256, storage_key,
// source — plus the manifest listing them all, which is ALSO hashed and
// stored as one more evidence row (source='manifest'), so the manifest's
// own integrity is checkable the same way any other piece of evidence is.
// Nothing here ever updates an evidence row once inserted.
//
// Chain of custody (§45): every meaningful action (opened, evidence
// uploaded, analysis initiated, viewed, exported, status changed) is a new
// row in sign_forensic_audit — append-only, same reasoning.

import { createHash } from 'crypto';
import { MinioIntegration } from '../integrations/minio.js';
import type { Db } from './sign-notify.service.js';
import type { CompareOutcome } from './sign-seal-verify.service.js';

export type ForensicCaseStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type CustodyAction = 'opened' | 'uploaded' | 'analysis_initiated' | 'viewed' | 'exported' | 'status_changed' | 're_analyzed' | 'report_generated';

interface ManifestEntry {
  filename: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  source: string;
  created_at: string;
}

/** Verdicts that warrant a case on their own — a clean EXACT_MATCH or
 *  SEAL_VERIFIED_SCAN_VARIATION_ONLY never auto-opens one; a human can
 *  still open one manually (openForensicCase doesn't gate on this, only
 *  the auto-open call site in the verify job does). */
const NEEDS_CASE_VERDICTS = new Set(['SEAL_VERIFIED_CONTENT_DIFFERENCE', 'SEAL_INVALID', 'DOCUMENT_MISMATCH', 'INCONCLUSIVE']);

export function verdictNeedsCase(verdict: string): boolean {
  return NEEDS_CASE_VERDICTS.has(verdict);
}

/** Appends one chain-of-custody row. Never updates/deletes an existing one
 *  — every call is a new fact, not a correction to a prior one. */
export async function recordCustodyEvent(
  db: Db, tenantId: string, caseId: string,
  action: CustodyAction,
  actor: { id: string | null; name: string | null },
  detail?: Record<string, unknown>,
  ipAddress?: string | null,
): Promise<void> {
  await db.insertInto('sign_forensic_audit').values({
    tenant_id: tenantId, case_id: caseId,
    actor_id: actor.id, actor_name: actor.name,
    action, detail: detail ? (JSON.stringify(detail) as any) : null,
    ip_address: ipAddress ?? null,
  }).execute();
}

/** Stores one file as a durable, permanent piece of case evidence — the
 *  same operation openForensicCase uses for canonical/uploaded/manifest,
 *  exported standalone so a later re-analysis (POST .../reanalyze) or
 *  report generation (POST .../report) can add to an already-open case's
 *  evidence without going through the whole case-opening flow again. */
export async function storeCaseEvidence(
  db: Db, tenantId: string, caseId: string,
  filename: string, mediaType: string, bytes: Buffer, source: 'canonical' | 'uploaded' | 'manifest' | 'report' | 'visual_diff',
): Promise<ManifestEntry> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { storageKey } = await MinioIntegration.uploadForensicEvidence(tenantId, caseId, filename, bytes);
  await db.insertInto('sign_forensic_evidence').values({
    tenant_id: tenantId, case_id: caseId,
    filename, media_type: mediaType, size_bytes: bytes.length, sha256, storage_key: storageKey, source,
  }).execute();
  return { filename, media_type: mediaType, size_bytes: bytes.length, sha256, source, created_at: new Date().toISOString() };
}

/** Records one pass of analysis against a case (Phase 6 — "re-analysis
 *  versioning"). The case's own content_verdict (set once, at opening —
 *  see openForensicCase) never changes; every run, including the first,
 *  appends a new numbered row here instead, so a case accumulates a real
 *  history rather than only ever reflecting its latest check. */
export async function recordAnalysisRun(
  db: Db, tenantId: string, caseId: string, outcome: CompareOutcome,
  triggeredBy: { id: string | null; name: string | null },
): Promise<{ id: string; runNumber: number }> {
  const last = await db.selectFrom('sign_forensic_analysis_runs').select('run_number')
    .where('case_id', '=', caseId).orderBy('run_number', 'desc').limit(1).executeTakeFirst();
  const runNumber = (last?.run_number ?? 0) + 1;
  const row = await db.insertInto('sign_forensic_analysis_runs').values({
    tenant_id: tenantId, case_id: caseId, run_number: runNumber,
    content_verdict: outcome.content_verdict, result: JSON.stringify(outcome) as any,
    triggered_by: triggeredBy.id, triggered_by_name: triggeredBy.name,
  }).returningAll().executeTakeFirstOrThrow();
  return { id: row.id, runNumber: row.run_number };
}

/** Opens a forensic case from a completed comparison — copies the
 *  canonical stamped PDF and the verifier's uploaded file (plus any visual-
 *  diff images the comparison produced) into the case's own durable
 *  evidence store (distinct from the job's ephemeral one, which the 24h
 *  cleanup sweep deletes regardless), builds the evidence manifest, hashes
 *  it, records the opening custody event, and logs the comparison itself
 *  as analysis run #1. Idempotent per job: a job that already has a case
 *  (checked by the caller — see sign-forensic-verify.job.ts) is never
 *  re-opened. */
export async function openForensicCase(
  db: Db,
  input: {
    tenantId: string; envelopeId: string; verificationCode: string;
    forensicJobId: string | null; outcome: CompareOutcome;
    canonicalBytes: Buffer | null; canonicalFilename: string;
    uploadedBytes: Buffer; uploadedFilename: string; uploadedMediaType: string;
  },
  openedBy: { id: string | null; name: string | null },
  ipAddress?: string | null,
): Promise<string> {
  const caseRow = await db.insertInto('sign_forensic_cases').values({
    tenant_id: input.tenantId,
    envelope_id: input.envelopeId,
    forensic_job_id: input.forensicJobId,
    verification_code: input.verificationCode,
    content_verdict: input.outcome.content_verdict,
    opened_by: openedBy.id,
    opened_by_name: openedBy.name,
  }).returningAll().executeTakeFirstOrThrow();

  const entries: ManifestEntry[] = [];
  const store = async (filename: string, mediaType: string, bytes: Buffer, source: 'canonical' | 'uploaded' | 'visual_diff') =>
    entries.push(await storeCaseEvidence(db, input.tenantId, caseRow.id, filename, mediaType, bytes, source));

  if (input.canonicalBytes) {
    await store(input.canonicalFilename, 'application/pdf', input.canonicalBytes, 'canonical');
  }
  await store(input.uploadedFilename, input.uploadedMediaType, input.uploadedBytes, 'uploaded');
  // Phase 5 — a visual anomaly's diff-highlight image(s), stored as their
  // own evidence rows rather than staying buried as base64 inside JSON.
  for (const p of input.outcome.visual?.pages ?? []) {
    await store(`visual-diff-page-${p.page}-run1.png`, 'image/png', Buffer.from(p.diffPngBase64, 'base64'), 'visual_diff');
  }

  // The manifest itself — §44's own requirement that the manifest is hashed
  // too, not just the files it lists. Built from `entries` (the real files
  // already stored above), then stored and hashed the same way they were.
  const manifestJson = JSON.stringify({ case_id: caseRow.id, verification_code: input.verificationCode, entries }, null, 2);
  const manifestBytes = Buffer.from(manifestJson, 'utf8');
  const manifestEntry = await storeCaseEvidence(db, input.tenantId, caseRow.id, 'manifest.json', 'application/json', manifestBytes, 'manifest');

  await db.updateTable('sign_forensic_cases').set({ manifest_hash: manifestEntry.sha256, updated_at: new Date() })
    .where('id', '=', caseRow.id).execute();

  await recordAnalysisRun(db, input.tenantId, caseRow.id, input.outcome, openedBy);

  await recordCustodyEvent(db, input.tenantId, caseRow.id, 'opened', openedBy,
    { verification_code: input.verificationCode, content_verdict: input.outcome.content_verdict, evidence_count: entries.length + 1 },
    ipAddress);

  return caseRow.id;
}

/** Convenience wrapper the verify job calls right after a non-clean
 *  comparison — resolves the canonical file (if the envelope has one) and
 *  the job's own ephemeral upload, then delegates to openForensicCase. */
export async function autoOpenCaseFromJob(
  db: Db,
  job: { id: string; envelope_id: string | null; verification_code: string; storage_key: string; media_type: string },
  envelope: { id: string; tenant_id: string; title: string; stamped_file_url: string | null },
  outcome: CompareOutcome,
  readFile: (storageKey: string) => Promise<Buffer | null>,
): Promise<string | null> {
  if (!job.envelope_id) return null;
  const uploadedBytes = await readFile(job.storage_key);
  if (!uploadedBytes) return null;
  const canonicalBytes = envelope.stamped_file_url ? await readFile(envelope.stamped_file_url) : null;

  return openForensicCase(db, {
    tenantId: envelope.tenant_id, envelopeId: envelope.id, verificationCode: job.verification_code,
    forensicJobId: job.id, outcome,
    canonicalBytes, canonicalFilename: `${envelope.title} — canonical.pdf`,
    uploadedBytes, uploadedFilename: `upload.${job.media_type === 'application/pdf' ? 'pdf' : job.media_type.split('/')[1] || 'bin'}`,
    uploadedMediaType: job.media_type,
  }, { id: null, name: 'System — Digital Execution Seal verification' }, null);
}
