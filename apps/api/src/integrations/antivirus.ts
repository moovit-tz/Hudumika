/**
 * Upload malware scanning via ClamAV's clamd daemon (INSTREAM command over
 * a raw TCP socket — no client library).
 *
 * Unconfigured (no CLAMAV_HOST) → scanBuffer() returns { clean: true,
 * skipped: true } and logs once, so uploads work in dev exactly as before.
 * Same "the feature is real once you point it at a real service" convention
 * as SMTP / Meta / the OAuth integrations.
 *
 * Configured → every Drive upload and every new file version is streamed to
 * clamd before it is written to storage; a positive hit is rejected (the
 * bytes are never persisted) and the signature name is surfaced to the user.
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

const CHUNK = 64 * 1024; // clamd's StreamMaxLength default is 25MB; 64KB frames are well within its per-chunk cap

export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
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

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let off = 0; off < buf.length; off += CHUNK) {
        const slice = buf.subarray(off, Math.min(off + CHUNK, buf.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(slice.length, 0);
        socket.write(len);
        socket.write(slice);
      }
      // zero-length chunk = end of stream
      socket.write(Buffer.from([0, 0, 0, 0]));
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

export const antivirusConfigured = () => !!env.CLAMAV_HOST;
