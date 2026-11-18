import { createHash } from 'node:crypto';
import { dbPlatform } from '../db/client.js';
import { objectStore } from '../integrations/object-storage.js';
import type { LensSnapshotType, LensSnapshot } from '@hudumika/types';

export interface CreateSnapshotInput {
  itemId?: string;
  repoId?: string;
  snapshotType: LensSnapshotType;
  commitSha?: string;
  branchLabel?: string;
  reason?: string;
  createdBy?: string;
  rawContent: string | Buffer;
  manifest?: Record<string, any>;
}

export interface SnapshotRestorePreview {
  snapshotId: string;
  snapshotType: LensSnapshotType;
  checksum: string;
  sizeBytes: number;
  files: Array<{ path: string; size: number }>;
  downloadUrl?: string;
}

/**
 * Capture a code or file snapshot, store bytes safely in object storage,
 * and verify checksum integrity.
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<LensSnapshot> {
  const buf = Buffer.isBuffer(input.rawContent)
    ? input.rawContent
    : Buffer.from(input.rawContent, 'utf8');

  const checksum = createHash('sha256').update(buf).digest('hex');
  const sizeBytes = buf.length;

  // Insert initial queued record
  const snapshot = await dbPlatform.insertInto('lens_snapshots').values({
    item_id: input.itemId ?? null,
    repo_id: input.repoId ?? null,
    snapshot_type: input.snapshotType,
    commit_sha: input.commitSha ?? null,
    branch_label: input.branchLabel ?? null,
    storage_path: 'pending',
    checksum_sha256: checksum,
    size_bytes: sizeBytes,
    manifest: JSON.stringify(input.manifest ?? {}) as any,
    status: 'CAPTURING',
    reason: input.reason ?? null,
    capture_tool_version: '2.0',
    created_by: input.createdBy ?? null,
  }).returningAll().executeTakeFirstOrThrow();

  const storageKey = `lens/snapshots/${snapshot.id}/artifact`;

  try {
    // Write bytes to object storage
    await objectStore.put(storageKey, buf, 'application/octet-stream');

    // Verify stored bytes
    const readBack = await objectStore.get(storageKey);
    if (!readBack) throw new Error('Object storage verification read failed');
    const readChecksum = createHash('sha256').update(readBack).digest('hex');
    if (readChecksum !== checksum) {
      throw new Error(`Checksum mismatch: expected ${checksum}, got ${readChecksum}`);
    }

    const updated = await dbPlatform.updateTable('lens_snapshots')
      .set({
        storage_path: storageKey,
        status: 'READY',
        updated_at: new Date(),
      })
      .where('id', '=', snapshot.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return formatSnapshotRow(updated);
  } catch (err: any) {
    const failed = await dbPlatform.updateTable('lens_snapshots')
      .set({
        storage_path: storageKey,
        status: 'FAILED',
        error_message: err?.message || 'Storage error',
        updated_at: new Date(),
      })
      .where('id', '=', snapshot.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return formatSnapshotRow(failed);
  }
}

/**
 * Retrieve snapshot metadata and content for download or restore preview.
 */
export async function getSnapshotContent(snapshotId: string): Promise<{
  snapshot: LensSnapshot;
  content: Buffer;
  verified: boolean;
}> {
  const row = await dbPlatform.selectFrom('lens_snapshots')
    .selectAll()
    .where('id', '=', snapshotId)
    .executeTakeFirst();

  if (!row) throw new Error('Snapshot not found');
  if (row.status !== 'READY') throw new Error(`Snapshot is in ${row.status} state`);

  const content = await objectStore.get(row.storage_path);
  if (!content) throw new Error('Snapshot artifact missing from storage backend');

  const actualHash = createHash('sha256').update(content).digest('hex');
  const verified = actualHash === row.checksum_sha256;

  return {
    snapshot: formatSnapshotRow(row),
    content,
    verified,
  };
}

/**
 * Prepare restore preview and download link.
 */
export async function prepareSnapshotRestore(snapshotId: string): Promise<SnapshotRestorePreview> {
  const { snapshot, content, verified } = await getSnapshotContent(snapshotId);
  if (!verified) throw new Error('Snapshot artifact checksum verification failed on restore check');

  let presigned = '';
  try {
    presigned = await objectStore.presignGet(snapshot.storage_path, 3600, `snapshot-${snapshot.id}.bin`);
  } catch {
    presigned = `/v1/lens/snapshots/${snapshot.id}/download`;
  }

  const manifest = snapshot.manifest || {};
  const files: Array<{ path: string; size: number }> = manifest.files || [];

  return {
    snapshotId: snapshot.id,
    snapshotType: snapshot.snapshot_type,
    checksum: snapshot.checksum_sha256,
    sizeBytes: snapshot.size_bytes,
    files,
    downloadUrl: presigned,
  };
}

function formatSnapshotRow(row: any): LensSnapshot {
  return {
    id: row.id,
    item_id: row.item_id,
    repo_id: row.repo_id,
    snapshot_type: row.snapshot_type,
    commit_sha: row.commit_sha,
    branch_label: row.branch_label,
    storage_path: row.storage_path,
    checksum_sha256: row.checksum_sha256,
    size_bytes: Number(row.size_bytes || 0),
    manifest: typeof row.manifest === 'string' ? JSON.parse(row.manifest) : (row.manifest ?? {}),
    status: row.status,
    reason: row.reason,
    capture_tool_version: row.capture_tool_version,
    created_by: row.created_by,
    error_message: row.error_message,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
