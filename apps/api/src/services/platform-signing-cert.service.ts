// ─── Real (CA-issued) platform document-signing certificates ──────────────────
// The SuperAdmin connection point for replacing pdf-signing-identity.service.ts's
// honest self-signed default with a real, purchased certificate — see that
// file's own header for why self-signed is the default and what a real CA
// certificate would change (signer identity showing as trusted, not just
// content-genuine, in a standard PDF viewer).
//
// Storage: platform_signing_identities (migration 281) — encrypted_p12 is
// encryptJson({ p12Base64, password }) via onsite-secrets.service.ts's
// existing AES-256-GCM helpers, reused as-is rather than a new crypto
// wrapper. Parsed metadata (subject/issuer/validity) is stored in the clear
// alongside the ciphertext purely for display — never re-derived from
// decrypting the blob just to show a table row.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SUBFILTER_ETSI_CADES_DETACHED, extractSignature } from '@signpdf/utils';
import { dbPlatform } from '../db/client.js';
import { encryptJson, decryptJson } from './onsite-secrets.service.js';

export class InvalidCertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCertificateError';
  }
}

export interface ParsedCertInfo {
  subject: string;
  issuer: string;
  isSelfSigned: boolean;
  notBefore: Date;
  notAfter: Date;
}

function formatDn(attrs: Array<{ shortName?: string; name?: string; value?: unknown }>): string {
  return attrs.map(a => `${a.shortName || a.name}=${String(a.value ?? '')}`).join(', ');
}

/** Parses a PKCS#12 buffer and extracts the signing certificate's real
 *  identity — the same node-forge `.default` import fix this session
 *  already proved necessary twice (pdf-signing-identity.service.ts,
 *  tra.service.ts). Throws InvalidCertificateError with a specific,
 *  actionable message: a SuperAdmin uploading a real, paid-for certificate
 *  needs to know whether the password was wrong, the file is corrupt, or
 *  the certificate itself has already expired — not a generic failure. */
export async function parseP12(p12Buffer: Buffer, password: string): Promise<{ info: ParsedCertInfo; privateKeyPem: string; certPem: string }> {
  const { default: forge } = await import('node-forge');

  let pfxObj;
  try {
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    pfxObj = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (/mac|invalid password|integrity/i.test(msg)) {
      throw new InvalidCertificateError('Incorrect password for this certificate file.');
    }
    throw new InvalidCertificateError('This file is not a valid PKCS#12 (.p12/.pfx) certificate.');
  }

  const keyBags = pfxObj.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    ?? pfxObj.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const certBags = pfxObj.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

  const forgeKey = keyBags?.[0]?.key;
  const forgeCert = certBags?.[0]?.cert;
  if (!forgeKey || !forgeCert) {
    throw new InvalidCertificateError('This certificate file has no usable private key and certificate pair inside it.');
  }

  const notAfter = forgeCert.validity.notAfter as Date;
  if (notAfter.getTime() < Date.now()) {
    throw new InvalidCertificateError(`This certificate already expired on ${notAfter.toISOString().slice(0, 10)} — it can't be used to sign new documents.`);
  }

  const subject = formatDn(forgeCert.subject.attributes);
  const issuer = formatDn(forgeCert.issuer.attributes);

  return {
    info: {
      subject, issuer,
      isSelfSigned: subject === issuer,
      notBefore: forgeCert.validity.notBefore as Date,
      notAfter,
    },
    privateKeyPem: forge.pki.privateKeyToPem(forgeKey),
    certPem: forge.pki.certificateToPem(forgeCert),
  };
}

/** Signs a real one-page test PDF with the candidate P12, then
 *  independently re-verifies the result — the correct CMS signed-attributes
 *  verification (re-tagging the captured attributes from their parsed
 *  IMPLICIT [0] context tag to a proper universal SET before hashing, per
 *  RFC 5652 §5.4 — the exact step a first attempt at this earlier in this
 *  session got wrong and silently returned a false negative on). Proven
 *  correct against both a genuine signature (passes) and two tampered cases
 *  — flipped content byte, flipped signature byte (both correctly fail) —
 *  before being trusted here. Throws with a specific reason on failure;
 *  never returns a bare boolean, since "verification failed" and "why" are
 *  both needed before a SuperAdmin decides whether to activate this
 *  platform-wide. */
export async function verifyRoundTrip(p12Buffer: Buffer, password: string): Promise<{ ok: true }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hudumika eSign — certificate verification test', { x: 20, y: 160, size: 10, font, color: rgb(0, 0, 0) });

  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: 'Certificate verification test',
    contactInfo: 'support@hudumika.tz',
    name: 'Hudumika eSign',
    location: 'Platform self-test',
    signingTime: new Date(),
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  const placeholderBytes = Buffer.from(await doc.save({ useObjectStreams: false }));

  const signer = new P12Signer(p12Buffer, { passphrase: password });
  const signpdfModule = await import('@signpdf/signpdf') as unknown as { default: { sign(pdf: Buffer, signer: P12Signer): Promise<Buffer> } };
  const signed = await signpdfModule.default.sign(placeholderBytes, signer);

  const { default: forge } = await import('node-forge');
  const { signature, signedData } = extractSignature(signed);
  const sigBytes = Buffer.from(signature, 'binary');
  const p7Asn1 = forge.asn1.fromDer(sigBytes.toString('binary'));
  const msg = forge.pkcs7.messageFromAsn1(p7Asn1);

  // 1. Content integrity — the messageDigest signed attribute must match a
  //    fresh hash of the actual signed byte range.
  const contentDigest = forge.md.sha256.create();
  contentDigest.update(signedData.toString('binary'));
  const contentDigestBytes = contentDigest.digest().getBytes();
  const messageDigestOid = forge.pki.oids.messageDigest;
  let foundMessageDigest: string | null = null;
  for (const attr of msg.rawCapture.authenticatedAttributes) {
    const oid = forge.asn1.derToOid(attr.value[0].value);
    if (oid === messageDigestOid) foundMessageDigest = attr.value[1].value[0].value;
  }
  if (foundMessageDigest !== contentDigestBytes) {
    throw new InvalidCertificateError('Verification failed: the signed content digest did not match — the signing library produced an inconsistent signature.');
  }

  // 2. Cryptographic signature — re-tag the captured signed attributes from
  //    their parsed IMPLICIT [0] context tag to a proper universal SET
  //    (RFC 5652 §5.4) before hashing and verifying, then check the RSA
  //    signature against the embedded certificate's own public key.
  const attrSet = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, msg.rawCapture.authenticatedAttributes);
  const attrDigest = forge.md.sha256.create();
  attrDigest.update(forge.asn1.toDer(attrSet).getBytes());
  // node-forge's own type definitions don't declare `.certificates` on a
  // parsed pkcs7 SignedData message, but it's real at runtime (confirmed
  // live) — the same category of type-defs-lagging-the-real-API gap this
  // session already hit with @signpdf/signpdf's default export.
  const cert = (msg as unknown as { certificates: Array<{ publicKey: { verify(digest: string, signature: string): boolean } }> }).certificates[0];
  let verified = false;
  try {
    verified = cert.publicKey.verify(attrDigest.digest().getBytes(), msg.rawCapture.signature);
  } catch {
    verified = false;
  }
  if (!verified) {
    throw new InvalidCertificateError('Verification failed: the cryptographic signature did not verify against the certificate\'s own public key.');
  }

  return { ok: true };
}

/** The currently-active real identity, or null if the platform is still on
 *  the self-signed default. */
export async function getActiveIdentity(): Promise<{ p12: Buffer; password: string; displayName: string } | null> {
  const row = await dbPlatform.selectFrom('platform_signing_identities')
    .select(['encrypted_p12', 'subject'])
    .where('enabled', '=', true)
    .executeTakeFirst();
  if (!row) return null;

  const { p12Base64, password } = decryptJson(row.encrypted_p12) as { p12Base64: string; password: string };
  const cnMatch = row.subject.match(/CN=([^,]+)/);
  return { p12: Buffer.from(p12Base64, 'base64'), password, displayName: cnMatch ? cnMatch[1] : row.subject };
}

/** Encrypts a P12 + password pair for storage — the one place this codebase
 *  bundles a binary cert blob and its password together for encryptJson(). */
export function encryptP12(p12Buffer: Buffer, password: string): string {
  return encryptJson({ p12Base64: p12Buffer.toString('base64'), password });
}
