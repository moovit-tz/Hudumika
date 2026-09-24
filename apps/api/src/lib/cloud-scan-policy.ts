import { env } from '../config/env.js';
import type { ScanResult } from '../integrations/antivirus.js';

/**
 * Fail-closed malware policy for Cloud.
 *
 * With a scanner configured (CLAMAV_HOST) nothing changes: an infected upload is
 * rejected before it is stored. Without one:
 *   - development / test: files are stored as 'skipped' and served (the old behaviour);
 *   - production (or CLOUD_REQUIRE_SCAN=true): files are stored as 'pending' and are
 *     NOT served — no download, preview, signed URL or public link — until the
 *     nightly re-scan (jobs/cloud-storage-maintenance.job.ts) clears them once a
 *     scanner is available. So an unscanned file is never handed to anyone.
 * CLOUD_REQUIRE_SCAN=false explicitly opts a production deployment out.
 */
export function scanRequired(): boolean {
  if (env.CLOUD_REQUIRE_SCAN === 'true') return true;
  if (env.CLOUD_REQUIRE_SCAN === 'false') return false;
  return env.APP_ENV === 'production';
}

/** The scan_status to store for a scan result. */
export function scanStatusFor(scan: ScanResult): 'clean' | 'infected' | 'skipped' | 'pending' {
  if (!scan.clean) return 'infected';
  if (scan.skipped) return scanRequired() ? 'pending' : 'skipped';
  return 'clean';
}

/** Why a file must not be served right now, or null when it may be. */
export function servingBlock(scanStatus: string | null | undefined): { code: 'QUARANTINED' | 'SCAN_PENDING'; message: string } | null {
  if (scanStatus === 'infected') return { code: 'QUARANTINED', message: 'This file was flagged by the malware scanner and is quarantined.' };
  if (scanStatus === 'pending') return { code: 'SCAN_PENDING', message: 'This file is waiting for a malware scan and cannot be opened yet.' };
  return null;
}
