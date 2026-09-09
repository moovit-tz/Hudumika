import { dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { runContentComparison } from '../services/sign-seal-verify.service.js';
import { verdictNeedsCase, autoOpenCaseFromJob } from '../services/sign-forensic-case.service.js';

/**
 * Digital Execution Seal, Phase 2 — drains sign_forensic_jobs (migration
 * 427). POST /v1/sign/verify/compare only stores the upload and inserts a
 * 'queued' row; this does the real work (hash, real Gemini-vision OCR text
 * extraction, real diff comparison) — the same "insert pending, a frequent
 * sweep claims and processes" split mail-outbox.job.ts/sms-outbox.job.ts
 * already use, at a 10s cadence rather than their 60s one: unlike outbound
 * mail, someone is watching the Verify Document page waiting on this.
 *
 * Claim is a guarded UPDATE (status='queued' -> 'processing', WHERE still
 * 'queued') before any work starts — the same "each row claimed by its own
 * guarded WHERE, only ever processed once" shape sign-anchor-stamp.job.ts
 * uses via its ots_proof IS NULL check. Matters here because both the
 * BullMQ repeat schedule and the setInterval fallback register a sweep,
 * and a Redis blip could in principle let both fire close together.
 */
export async function runSignForensicVerifyJob(): Promise<void> {
  try {
    const queued = await dbPlatform.selectFrom('sign_forensic_jobs')
      .select(['id'])
      .where('status', '=', 'queued')
      .orderBy('created_at', 'asc')
      .limit(5)
      .execute();

    if (queued.length === 0) return;

    for (const row of queued) {
      const claimed = await dbPlatform.updateTable('sign_forensic_jobs')
        .set({ status: 'processing', started_at: new Date() })
        .where('id', '=', row.id).where('status', '=', 'queued')
        .executeTakeFirst();
      if (Number(claimed.numUpdatedRows ?? 0) === 0) continue; // another tick already claimed it

      const job = await dbPlatform.selectFrom('sign_forensic_jobs').selectAll()
        .where('id', '=', row.id).executeTakeFirst();
      if (!job) continue;

      try {
        if (!job.envelope_id) throw new Error('Job has no resolved envelope');
        const envelope = await dbPlatform.selectFrom('sign_envelopes').select([
          'id', 'tenant_id', 'verification_code', 'title', 'anchor_hash', 'stamped_file_url',
          'seal_signature', 'seal_payload', 'seal_key_label', 'seal_type',
          'canonical_text_extract', 'canonical_text_extracted_at',
        ]).where('id', '=', job.envelope_id).executeTakeFirst();
        if (!envelope) throw new Error('Envelope no longer exists');

        const uploadedBuffer = MinioIntegration.readFile(job.storage_key);
        if (!uploadedBuffer) throw new Error('Uploaded file could not be read — it may have already been cleaned up');

        const result = await runContentComparison(
          dbPlatform, envelope, uploadedBuffer, job.media_type,
          { ipAddress: job.ip_address, userAgent: job.user_agent },
        );

        await dbPlatform.updateTable('sign_forensic_jobs')
          .set({ status: 'completed', result: JSON.stringify(result) as any, completed_at: new Date() })
          .where('id', '=', job.id).execute();

        // §35/§46 — a non-clean verdict (seal invalid, content differs, or
        // simply inconclusive) is exactly the case a forensic investigation
        // exists for. Auto-opened here so nobody has to notice and manually
        // trigger it; a clean EXACT_MATCH/SCAN_VARIATION_ONLY never opens
        // one on its own (a human can still open one manually — see
        // sign-forensics.routes.ts's own POST /cases).
        if (verdictNeedsCase(result.content_verdict)) {
          try {
            const caseId = await autoOpenCaseFromJob(dbPlatform, job, envelope, result, (key) => MinioIntegration.readFile(key));
            if (caseId) console.log(`🔎 Forensic case ${caseId} auto-opened for job ${job.id} (${result.content_verdict}).`);
          } catch (caseErr) {
            // A case-opening failure must never undo the comparison result
            // that already completed successfully above.
            console.error(`❌ Failed to auto-open a forensic case for job ${job.id}:`, caseErr);
          }
        }
      } catch (err) {
        console.error(`❌ Sign forensic verify job ${job.id} failed:`, err);
        await dbPlatform.updateTable('sign_forensic_jobs')
          .set({ status: 'failed', error: (err as Error).message || 'Unknown error', completed_at: new Date() })
          .where('id', '=', job.id).execute();
      }
    }
  } catch (error) {
    console.error('❌ Sign forensic verify sweep failed:', error);
  }
}

/**
 * Retention sweep — a verifier's uploaded scan/photo is their own evidence,
 * not the tenant's, and has no reason to sit on disk indefinitely once the
 * result has been readable for a day. Deletes the stored file and the job
 * row together; sign_verifications (the permanent audit log this job's
 * runContentComparison already wrote to) is untouched — only the transient
 * upload + its queue row are swept.
 */
export async function runSignForensicJobCleanupJob(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await dbPlatform.selectFrom('sign_forensic_jobs')
      .select(['id', 'tenant_id', 'storage_key'])
      .where('status', 'in', ['completed', 'failed'])
      .where('created_at', '<', cutoff)
      .limit(100)
      .execute();

    if (stale.length === 0) return;

    for (const row of stale) {
      if (row.tenant_id && row.storage_key) {
        await MinioIntegration.deleteDocument(row.tenant_id, row.storage_key).catch(() => {});
      }
      await dbPlatform.deleteFrom('sign_forensic_jobs').where('id', '=', row.id).execute();
    }
    console.log(`🧹 Sign forensic job cleanup — removed ${stale.length} stale upload(s).`);
  } catch (error) {
    console.error('❌ Sign forensic job cleanup failed:', error);
  }
}
