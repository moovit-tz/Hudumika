import crypto from 'crypto';

// Node-native crypto hashing for security without external binary packages.
//
// The iteration count is embedded in the stored hash (`iterations:salt:hash`)
// rather than hardcoded, so raising CURRENT_ITERATIONS here doesn't
// invalidate every hash already in the database — verifyPassword reads
// whatever count a given hash was actually created with. needsRehash() lets
// the login route silently upgrade an old hash to the current strength on
// the next successful sign-in (the standard rehash-on-login pattern), so
// existing accounts migrate over time with no bulk migration or forced
// password reset.
const CURRENT_ITERATIONS = 210_000; // OWASP minimum for PBKDF2-HMAC-SHA512
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, 'sha512').toString('hex');
  return `${CURRENT_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');

  if (parts.length === 3) {
    const [iterStr, salt, hash] = parts;
    const iterations = Number(iterStr);
    const testHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha512').toString('hex');
    return timingSafeEqualHex(hash, testHash);
  }

  if (parts.length === 2) {
    // Pre-upgrade format, always 1000 iterations — the count wasn't stored
    // because there was only ever one value in use.
    const [salt, hash] = parts;
    const testHash = crypto.pbkdf2Sync(password, salt, 1000, KEY_LENGTH, 'sha512').toString('hex');
    return timingSafeEqualHex(hash, testHash);
  }

  return password === storedHash; // support plaintext seeds safely
}

/** True when a stored hash should be silently replaced on next successful
 *  login — either it predates iteration-count tracking, or it was created
 *  under a since-raised CURRENT_ITERATIONS. Callers must only act on this
 *  after verifyPassword has already returned true for the same password. */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3) return true;
  return Number(parts[0]) < CURRENT_ITERATIONS;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}
