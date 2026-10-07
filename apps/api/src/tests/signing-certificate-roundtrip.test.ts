import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { verifyRoundTrip } from '../services/platform-signing-cert.service.js';

describe('Certificate verification with native RSA validation', () => {
  it('verifies an actual signed PDF and rejects an incorrect identity password', async () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = '01';
    certificate.validity.notBefore = new Date();
    certificate.validity.notAfter = new Date(Date.now() + 86400000);
    const subject = [{ name: 'commonName', value: 'Audit test identity' }];
    certificate.setSubject(subject);
    certificate.setIssuer(subject);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], 'test-only-password', { algorithm: 'aes256' });
    const bytes = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
    await expect(verifyRoundTrip(bytes, 'test-only-password')).resolves.toEqual({ ok: true });
    await expect(verifyRoundTrip(bytes, 'incorrect-password')).rejects.toThrow();
  });
});
