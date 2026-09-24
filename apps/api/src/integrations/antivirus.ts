/**
 * Upload malware scanning via ClamAV's clamd daemon (INSTREAM command over
 * a raw TCP socket — no client library).
 *
 * Unconfigured (no CLAMAV_HOST) → scanBuffer()/scanChunks() return { clean:
 * true, skipped: true } and log once, so uploads work in dev exactly as
 * before. Same "the feature is real once you point it at a real service"
 * convention as SMTP / Meta / the OAuth integrations.
 *
 * Configured → every Drive upload and every new file version is streamed to
 * clamd before it is written to storage; a positive hit is rejected (the
 * bytes are never persisted) and the signature name is surfaced to the user.
 *
 * Production readiness: with no scanner configured, lib/cloud-scan-policy.ts
 * decides what happens to the result (dev/test: served as-is; production:
 * held as 'pending' until a scanner becomes available and the nightly
 * re-scan clears it — see jobs/cloud-storage-maintenance.job.ts). That is
 * the actual fail-closed behaviour; this module cannot invent a scanner
 * where none is configured, only refuse to silently pretend one ran.
 */
import net from 'node:net';
import { env } from '../config/env.js';

export interface ScanResult {
  clean: boolean;
  signature?: string;
  skipped?: boolean;
  error?: string;
}

let warnedUnconfigured = false;

const FRAME = 64 * 1024; // clamd's StreamMaxLength default is 25MB; 64KB frames are well within its per-chunk cap

/**
 * Scans a file without ever holding the whole thing in memory at once: each
 * source chunk (whatever size the caller already has in hand — e.g. one
 * resumable-upload chunk) is forwarded to clamd inside ONE INSTREAM session,
 * re-split into 64KB frames as it goes. `scanBuffer` below is the same
 * function fed a single chunk, for the common small-file case.
 */
export async function scanChunks(chunks: AsyncIterable<Buffer> | Iterable<Buffer>): Promise<ScanResult> {
  if (!env.CLAMAV_HOST) {
    if (!warnedUnconfigured) {
      console.warn('⚠️  Antivirus: CLAMAV_HOST not set — Drive uploads are NOT being malware-scanned.');
      warnedUnconfigured = true;
    }
    return { clean: true, skipped: true };
  }

  return new Promise<ScanResult>((resolve) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST!, port: env.CLAMAV_PORT });
    let response = '';
    let settled = false;
    const done = (r: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };

    const timer = setTimeout(
      () => done({ clean: true, skipped: true, error: `clamd timeout after ${env.CLAMAV_TIMEOUT_MS}ms` }),
      env.CLAMAV_TIMEOUT_MS,
    );

    socket.on('connect', async () => {
      try {
        socket.write('zINSTREAM\0');
        for await (const chunk of chunks) {
          for (let off = 0; off < chunk.length; off += FRAME) {
            const slice = chunk.subarray(off, Math.min(off + FRAME, chunk.length));
            const len = Buffer.alloc(4);
            len.writeUInt32BE(slice.length, 0);
            socket.write(len);
            socket.write(slice);
          }
        }
        // zero-length chunk = end of stream
        socket.write(Buffer.from([0, 0, 0, 0]));
      } catch (err: any) {
        clearTimeout(timer);
        done({ clean: true, skipped: true, error: err.message });
      }
    });

    socket.on('data', (d) => { response += d.toString('utf8'); });

    socket.on('end', () => {
      clearTimeout(timer);
      // "stream: OK\0"  |  "stream: Eicar-Test-Signature FOUND\0"  |  "... ERROR\0"
      const line = response.replace(/\0/g, '').trim();
      if (/\bOK$/.test(line)) return done({ clean: true });
      const found = line.match(/^stream:\s+(.*)\s+FOUND$/);
      if (found) return done({ clean: false, signature: found[1] });
      return done({ clean: true, skipped: true, error: line || 'no response from clamd' });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      // Fail open — a scanner outage must not take Drive uploads down with
      // it — but say so loudly.
      console.error('❌ Antivirus: clamd connection failed —', err.message);
      done({ clean: true, skipped: true, error: err.message });
    });
  });
}

export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
  return scanChunks([buf]);
}

export const antivirusConfigured = () => !!env.CLAMAV_HOST;

/**
 * A real connectivity check (clamd's PING/PONG, not just "is the env var set") — used at server
 * boot and by the health endpoint, so a wrong host/port or a scanner that's down is caught
 * immediately rather than discovered the first time someone uploads a file.
 */
export async function pingClamd(timeoutMs = 3000): Promise<{ ok: boolean; error?: string }> {
  if (!env.CLAMAV_HOST) return { ok: false, error: 'not configured' };
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST!, port: env.CLAMAV_PORT });
    let response = '';
    let settled = false;
    const done = (r: { ok: boolean; error?: string }) => { if (settled) return; settled = true; socket.destroy(); resolve(r); };
    const timer = setTimeout(() => done({ ok: false, error: `timed out after ${timeoutMs}ms` }), timeoutMs);
    socket.on('connect', () => socket.write('zPING\0'));
    socket.on('data', (d) => { response += d.toString('utf8'); });
    socket.on('end', () => { clearTimeout(timer); done(/PONG/.test(response) ? { ok: true } : { ok: false, error: response.replace(/\0/g, '').trim() || 'unexpected response' }); });
    socket.on('error', (err) => { clearTimeout(timer); done({ ok: false, error: err.message }); });
  });
}

/**
 * Called once at server boot (index.ts). Never blocks startup or fails the process — Cloud already
 * fails closed per-file in production (lib/cloud-scan-policy.ts: an unscanned upload is held as
 * 'pending' and never served) — this only makes a missing or broken scanner impossible to miss in
 * the logs, instead of a one-line warning that scrolls by on the first upload.
 */
export async function checkAntivirusAtBoot(appEnv: string): Promise<void> {
  if (!env.CLAMAV_HOST) {
    if (appEnv === 'production') {
      console.error('━'.repeat(72));
      console.error('❌ ANTIVIRUS NOT CONFIGURED IN PRODUCTION');
      console.error('   CLAMAV_HOST is unset. Every Cloud upload will be held as "pending" and');
      console.error('   never served (download/preview/share/link) until a scanner is connected');
      console.error('   and the nightly re-scan clears it. Set CLAMAV_HOST (+ CLAMAV_PORT) to a');
      console.error('   real clamd instance, or set CLOUD_REQUIRE_SCAN=false to accept unscanned');
      console.error('   uploads (not recommended).');
      console.error('━'.repeat(72));
    }
    return;
  }
  const result = await pingClamd();
  if (result.ok) {
    console.log(`🛡️  Antivirus: connected to clamd at ${env.CLAMAV_HOST}:${env.CLAMAV_PORT}`);
  } else {
    console.error('━'.repeat(72));
    console.error(`❌ ANTIVIRUS CONFIGURED BUT UNREACHABLE — clamd at ${env.CLAMAV_HOST}:${env.CLAMAV_PORT}: ${result.error}`);
    console.error('   Uploads will still be accepted; in production they are held as "pending"');
    console.error('   (not served) until the scanner comes back and the nightly re-scan runs.');
    console.error('━'.repeat(72));
  }
}
