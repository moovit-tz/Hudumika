/**
 * Server-side Office → PDF conversion for inline document preview
 * (docx / xlsx / pptx / odt / ...), via a headless LibreOffice binary.
 *
 * Unconfigured (no SOFFICE_BIN) → canConvert() is still true for the known
 * extensions, but convertToPdf() throws OfficeConvertUnavailable; the
 * preview route turns that into a 415 with a "download to view" hint that
 * the frontend renders honestly. Set SOFFICE_BIN=/usr/bin/soffice (or the
 * platform's libreoffice path) → previews convert on demand and are cached.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const execFileP = promisify(execFile);

const CONVERTIBLE = new Set([
  'doc', 'docx', 'odt', 'rtf',
  'xls', 'xlsx', 'ods', 'csv',
  'ppt', 'pptx', 'odp',
]);

export class OfficeConvertUnavailable extends Error {
  constructor() { super('OFFICE_CONVERT_UNAVAILABLE'); this.name = 'OfficeConvertUnavailable'; }
}

export function canConvert(ext: string): boolean {
  return CONVERTIBLE.has((ext || '').toLowerCase());
}

export function officeConfigured(): boolean {
  return !!env.SOFFICE_BIN;
}

/** Converts an Office document buffer to a PDF buffer. Throws
 *  OfficeConvertUnavailable if SOFFICE_BIN is not set. */
export async function convertToPdf(buffer: Buffer, ext: string): Promise<Buffer> {
  if (!env.SOFFICE_BIN) throw new OfficeConvertUnavailable();

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'hud-office-'));
  const inName = `src.${(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const inPath = path.join(work, inName);
  try {
    await fs.writeFile(inPath, buffer);
    // LibreOffice needs a private profile dir or concurrent invocations clash.
    const profile = `-env:UserInstallation=file://${path.join(work, 'profile')}`;
    await execFileP(
      env.SOFFICE_BIN,
      ['--headless', '--nologo', '--nofirststartwizard', profile, '--convert-to', 'pdf', '--outdir', work, inPath],
      { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const outPath = path.join(work, inName.replace(/\.[^.]+$/, '.pdf'));
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Stable cache key for a converted preview — file id + a fingerprint of the
 *  source bytes, so a new version invalidates the cached PDF automatically. */
export function previewCacheKey(fileId: string, sourceBytes: Buffer): string {
  const h = crypto.createHash('sha1').update(sourceBytes).digest('hex').slice(0, 16);
  return `${fileId}/preview/${h}.pdf`;
}
