import crypto from 'crypto';

// RFC 4648 base32 (no padding) — Node has no built-in base32 codec, and TOTP
// secrets/URIs are conventionally base32, so this is implemented directly
// rather than pulling in a dependency for ~15 lines of bit-shifting.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a new random TOTP secret, base32-encoded (RFC 4648, no padding). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Standard `otpauth://totp/...` URI a QR code encodes — RFC 6238 / Google Authenticator convention. */
export function buildTotpUri(secret: string, accountLabel: string, issuer = 'Hudumika'): string {
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountLabel)}?${params.toString()}`;
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/** Verifies a 6-digit TOTP code against ±1 30s time step (90s total tolerance for clock drift). */
export function verifyTotp(secret: string, token: string, stepSeconds = 30, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, counter + i) === token) return true;
  }
  return false;
}

/** Random human-typeable backup codes (recovery when the authenticator device is unavailable). */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{4})(.{4})/, '$1-$2')
  );
}
