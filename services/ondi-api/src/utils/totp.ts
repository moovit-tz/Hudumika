import crypto from 'crypto';

/**
 * Custom Base32 decoder conforming to RFC 4648.
 * Decodes a base32 encoded string into a Buffer.
 */
export function decodeBase32(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=+$/, '');
  const length = cleaned.length;
  const buffer = Buffer.alloc(Math.floor((length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < length; i++) {
    const val = alphabet.indexOf(cleaned[i]);
    if (val === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return buffer;
}

/**
 * Computes a 6-digit TOTP code for a base32 secret and given timestamp (in ms).
 */
export function getTOTP(secretBase32: string, timeMs: number = Date.now()): string {
  const key = decodeBase32(secretBase32);
  const epoch = Math.floor(timeMs / 1000);
  const counter = Math.floor(epoch / 30);

  const counterBuffer = Buffer.alloc(8);
  // Write counter as 64-bit big-endian integer
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = temp & 0xff;
    temp = temp >> 8;
  }

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = code % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with a search window (default +/- 1 step).
 */
export function verifyTOTP(secretBase32: string, code: string, windowSteps: number = 1): boolean {
  const now = Date.now();
  const stepSizeMs = 30 * 1000;

  for (let step = -windowSteps; step <= windowSteps; step++) {
    const calculated = getTOTP(secretBase32, now + (step * stepSizeMs));
    if (calculated === code) {
      return true;
    }
  }
  return false;
}
