// RFC 6238 TOTP code generation, client-side, using Web Crypto's HMAC-SHA1.
// Ondi's own /mfa/enroll flow hands back the raw base32 secret (that's the
// whole point of an authenticator app), so the live 6-digit code can be
// computed here instead of round-tripping to the server every 30s.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export const TOTP_STEP_SECONDS = 30;

export function totpSecondsRemaining(): number {
  return TOTP_STEP_SECONDS - (Math.floor(Date.now() / 1000) % TOTP_STEP_SECONDS);
}

export async function generateTotp(secretBase32: string, digits = 6): Promise<string> {
  const keyBytes = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  const counterBytes = new ArrayBuffer(8);
  const counterView = new DataView(counterBytes);
  // JS numbers only safely hold 53 bits — fine for a Unix-time-derived
  // counter for the next ~270,000 years, so the high 32 bits are always 0.
  counterView.setUint32(0, 0);
  counterView.setUint32(4, counter);

  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];

  const code = (binCode % 10 ** digits).toString().padStart(digits, "0");
  return code;
}

/**
 * Parses an `otpauth://totp/...` URI (what a QR code or a service's manual
 * setup key ultimately encodes) into its label/issuer/secret parts. Used by
 * the QR scanner and to normalize a pasted otpauth:// link in manual entry.
 */
export function parseOtpAuthUri(uri: string): { issuer?: string; account?: string; secret?: string } | null {
  const match = uri.match(/^otpauth:\/\/totp\/([^?]*)\?(.*)$/i);
  if (!match) return null;
  const label = decodeURIComponent(match[1]);
  const params = new URLSearchParams(match[2]);
  const secret = params.get("secret") ?? undefined;
  const issuerParam = params.get("issuer") ?? undefined;
  const [labelIssuer, labelAccount] = label.includes(":") ? label.split(/:(.+)/) : [undefined, label];
  return { issuer: issuerParam || labelIssuer || undefined, account: labelAccount || label, secret };
}
