import { describe, it, expect } from 'vitest';
import {
  isAcceptedCertificateType, isValidCertificate, hasValidCertificate,
  assertCertifiedForShipment, MissingCertificateError, ACCEPTED_CERTIFICATE_TYPES,
} from '../lib/anga-certificate-gate.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const FUTURE = new Date('2027-01-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');

describe('isAcceptedCertificateType', () => {
  it('recognises every declared type', () => {
    for (const t of ACCEPTED_CERTIFICATE_TYPES) expect(isAcceptedCertificateType(t)).toBe(true);
  });

  it('rejects an undeclared type', () => {
    expect(isAcceptedCertificateType('HANDWRITTEN_NOTE')).toBe(false);
  });
});

describe('isValidCertificate', () => {
  it('a non-expiring accepted-type certificate is valid', () => {
    expect(isValidCertificate({ type: 'FAA_8130_3', expiryDate: null }, NOW)).toBe(true);
  });

  it('an accepted-type certificate with a future expiry is valid', () => {
    expect(isValidCertificate({ type: 'EASA_FORM_1', expiryDate: FUTURE }, NOW)).toBe(true);
  });

  it('an accepted-type certificate with a past expiry is invalid', () => {
    expect(isValidCertificate({ type: 'EASA_FORM_1', expiryDate: PAST }, NOW)).toBe(false);
  });

  it('an undeclared certificate type is never valid, even without expiry', () => {
    expect(isValidCertificate({ type: 'SCRAP_PAPER_NOTE', expiryDate: null }, NOW)).toBe(false);
  });
});

describe('hasValidCertificate', () => {
  it('true if at least one certificate is valid, even if others are expired', () => {
    const certs = [
      { type: 'EASA_FORM_1', expiryDate: PAST },
      { type: 'FAA_8130_3', expiryDate: null },
    ];
    expect(hasValidCertificate(certs, NOW)).toBe(true);
  });

  it('false if every certificate is expired', () => {
    const certs = [{ type: 'EASA_FORM_1', expiryDate: PAST }, { type: 'FAA_8130_3', expiryDate: PAST }];
    expect(hasValidCertificate(certs, NOW)).toBe(false);
  });

  it('false for an empty certificate list', () => {
    expect(hasValidCertificate([], NOW)).toBe(false);
  });
});

describe('assertCertifiedForShipment', () => {
  it('passes when no certificate is required, regardless of certificates on file', () => {
    expect(() => assertCertifiedForShipment({ certificateRequired: false, certificates: [] }, NOW)).not.toThrow();
  });

  it('passes when required and a valid certificate exists', () => {
    expect(() => assertCertifiedForShipment({
      certificateRequired: true,
      certificates: [{ type: 'FAA_8130_3', expiryDate: null }],
    }, NOW)).not.toThrow();
  });

  it('throws MissingCertificateError when required and only an expired certificate exists', () => {
    expect(() => assertCertifiedForShipment({
      certificateRequired: true,
      certificates: [{ type: 'EASA_FORM_1', expiryDate: PAST }],
    }, NOW)).toThrow(MissingCertificateError);
  });

  it('throws when required and no certificates exist at all', () => {
    expect(() => assertCertifiedForShipment({ certificateRequired: true, certificates: [] }, NOW)).toThrow(MissingCertificateError);
  });

  it('passes when required and at least one of several certificates is valid', () => {
    expect(() => assertCertifiedForShipment({
      certificateRequired: true,
      certificates: [{ type: 'EASA_FORM_1', expiryDate: PAST }, { type: 'COFC', expiryDate: FUTURE }],
    }, NOW)).not.toThrow();
  });
});
