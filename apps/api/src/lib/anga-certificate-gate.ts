/**
 * ANGA certificate & traceability gate — ported verbatim from the
 * standalone Gereji app's lib/anga/certificate-gate.ts. Pure, no I/O.
 * Wired into the ALLOCATED -> SOLD availability transition.
 */
export const ACCEPTED_CERTIFICATE_TYPES = [
  'FAA_8130_3',
  'EASA_FORM_1',
  'UK_CAA_FORM_1',
  'TCCA_FORM_ONE',
  'CASA_FORM_1',
  'ANAC_F100',
  'COFC',
  'ATA_106',
  'TEARDOWN_REPORT',
  'NON_INCIDENT_STATEMENT',
] as const;

export type CertificateType = typeof ACCEPTED_CERTIFICATE_TYPES[number];

export function isAcceptedCertificateType(value: string): value is CertificateType {
  return (ACCEPTED_CERTIFICATE_TYPES as readonly string[]).includes(value);
}

export type CertificateLike = {
  type: string;
  expiryDate: Date | null;
};

export function isValidCertificate(cert: CertificateLike, now: Date = new Date()): boolean {
  if (!isAcceptedCertificateType(cert.type)) return false;
  if (cert.expiryDate && cert.expiryDate.getTime() < now.getTime()) return false;
  return true;
}

export function hasValidCertificate(certs: CertificateLike[], now: Date = new Date()): boolean {
  return certs.some(c => isValidCertificate(c, now));
}

export class MissingCertificateError extends Error {
  constructor() {
    super('No valid certificate is linked to this stock unit — shipment blocked');
    this.name = 'MissingCertificateError';
  }
}

export function assertCertifiedForShipment(
  input: { certificateRequired: boolean; certificates: CertificateLike[] },
  now: Date = new Date(),
): void {
  if (!input.certificateRequired) return;
  if (!hasValidCertificate(input.certificates, now)) {
    throw new MissingCertificateError();
  }
}
