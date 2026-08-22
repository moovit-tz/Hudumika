// ─── Platform PDF-signing identity ─────────────────────────────────────────────
// A real, self-signed X.509 certificate + RSA key pair that Hudumika signs
// completed Sign envelopes with — the actual cryptographic mechanism a
// standard PDF viewer (Adobe Reader, Chrome/Edge's built-in viewer) checks
// to show "This document is digitally signed" and validate it hasn't been
// altered since. This is the platform's own signing identity, not a
// per-envelope or per-signer one — the same shape DocuSign itself uses: the
// visual page content shows who the human signers were, but the
// cryptographic certificate attached to the file identifies the platform
// that certified it ("DocuSign, Inc." in DocuSign's own case).
//
// Generated once, lazily, on first real use, and reused after that — no
// manual setup step required, matching how every other integration in this
// codebase either works out of the box or degrades honestly (SmsIntegration,
// WhatsAppIntegration) rather than requiring a setup script before the
// feature functions at all.
//
// Self-signed is an explicit, honest choice: this codebase has no account
// with a real publicly-trusted certificate authority (the same category of
// gap as the "no real KYC vendor" reasoning for Sign's SMS-OTP tier over
// full ID verification). A viewer will show the document as genuinely,
// cryptographically signed and unmodified since signing — the real,
// verifiable part — but the signer identity itself will show as
// self-issued rather than CA-verified, since no CA has attested to it.

import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { getActiveIdentity } from './platform-signing-cert.service.js';

const IDENTITY_DIR = path.join(process.cwd(), 'uploads', 'platform');
const P12_PATH = path.join(IDENTITY_DIR, 'hudumika-sign-identity.p12');

let cached: Buffer | null = null;

/** Generates a fresh 10-year self-signed cert + key, bundled as a
 *  password-protected P12. node-forge is dynamically imported — same
 *  ESM/CJS interop category tra.service.ts's own PFX loader already
 *  documents, though the real fix is one step further than its comment
 *  states: under this project's actual module resolution, `await
 *  import('node-forge')` resolves to `{ default: <the real forge object> }`,
 *  not a namespace with `.pki`/`.md`/etc. spread onto it directly —
 *  confirmed live (`forge.pki` was `undefined`, `forge.default.pki` a real
 *  object) while wiring this up, so `.default` is required here. */
async function generate(): Promise<Buffer> {
  const { default: forge } = await import('node-forge');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName', value: 'Hudumika eSign' },
    { name: 'organizationName', value: 'Hudumika LLC' },
    { shortName: 'OU', value: 'eSign' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed: issuer === subject
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    // keyUsage marked critical (RFC 5280 §4.2.1.3: SHOULD be critical when
    // present) — a real, separate defect from the self-signed-trust
    // question, found via a real PDF viewer's own signature panel (Edge/
    // PDFium) reporting "Invalid Signature" even though OpenSSL confirmed
    // the underlying CMS/PKCS#7 signature itself verifies cleanly. The
    // extKeyUsage extension that used to sit here (codeSigning/
    // emailProtection/timeStamping, all false) is removed rather than
    // fixed: setting every flag false doesn't omit the extension, it emits
    // an EMPTY "permitted uses" list — worse than no extension at all to a
    // strict validator, since it can read as "no use is permitted." PDF/
    // CMS document signing has no dedicated, universally-recognized EKU
    // OID the way code-signing or email does; keyUsage's own
    // digitalSignature + nonRepudiation bits are what the PDF spec (and
    // Adobe/PDFium) actually key off, so the honest fix is to not claim an
    // extended-use restriction this certificate was never given.
    { name: 'keyUsage', critical: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: false, dataEncipherment: false },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], env.SIGN_CERT_PASSWORD, { algorithm: '3des' });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

/** Returns the platform's current signing identity — a real, SuperAdmin-
 *  activated CA-issued certificate (platform-signing-cert.service.ts) if
 *  one exists, otherwise the self-signed default below, generated once and
 *  reused (from disk, then an in-process cache) after that. `password` is
 *  returned alongside the P12 because a real uploaded certificate has its
 *  own password, not the fixed `env.SIGN_CERT_PASSWORD` the self-signed
 *  identity uses — callers must not assume the env password applies.
 *  `displayName` is the real cert's own subject CN once one is active, so
 *  the signature panel a viewer shows reflects who actually signed rather
 *  than a stale "Hudumika eSign" label from the self-signed fallback. */
export async function getSigningIdentity(): Promise<{ p12: Buffer; password: string; displayName: string }> {
  const real = await getActiveIdentity();
  if (real) return real;

  if (cached) return { p12: cached, password: env.SIGN_CERT_PASSWORD, displayName: 'Hudumika eSign' };

  if (fs.existsSync(P12_PATH)) {
    cached = fs.readFileSync(P12_PATH);
    return { p12: cached, password: env.SIGN_CERT_PASSWORD, displayName: 'Hudumika eSign' };
  }

  const p12 = await generate();
  fs.mkdirSync(IDENTITY_DIR, { recursive: true });
  fs.writeFileSync(P12_PATH, p12);
  console.log(`🔏 Generated a new platform PDF-signing identity — ${P12_PATH}`);
  cached = p12;
  return { p12, password: env.SIGN_CERT_PASSWORD, displayName: 'Hudumika eSign' };
}
