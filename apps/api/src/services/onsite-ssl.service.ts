/**
 * Read the certificate a domain is actually serving.
 *
 * onsite_ssl_certificates existed, the Overview counted rows in it that were
 * about to expire, and nothing in the codebase ever inserted one — so the SSL
 * page listed domains instead of certificates and the expiry alert could never
 * fire. This fills it in from the only authoritative source there is: the TLS
 * handshake itself.
 *
 * No provider API and no credential is involved. We connect to the host on 443
 * and read the leaf certificate it presents, which is the same thing a browser
 * does and the same thing that will actually break when it expires. A
 * certificate Onsite issued and one somebody else installed are reported
 * identically, because both are equally true of the live site.
 */
import tls from 'node:tls';
import { db } from '../db/client.js';

/** A handshake that has not completed in this long is a failed check. */
const HANDSHAKE_TIMEOUT_MS = 10_000;

export interface CertificateFacts {
  issuer: string | null;
  subject: string | null;
  sans: string[];
  issuedAt: Date | null;
  expiresAt: Date | null;
  selfSigned: boolean;
}

export type InspectionOutcome =
  | { ok: true; cert: CertificateFacts }
  | { ok: false; error: string };

/**
 * Connect and read the leaf certificate.
 *
 * `rejectUnauthorized: false` on purpose: an expired or mismatched certificate
 * is exactly what this is meant to *find*, and refusing the connection would
 * turn the most important finding into a bare error. Nothing is sent over the
 * socket and nothing is trusted because of it — the handshake result is read
 * and the socket is closed.
 */
export function inspectCertificate(hostname: string, port = 443): Promise<InspectionOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (out: InspectionOutcome) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already gone */ }
      resolve(out);
    };

    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,       // SNI, or a shared host serves the wrong cert
      rejectUnauthorized: false,
      timeout: HANDSHAKE_TIMEOUT_MS,
    });

    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate(false) as any;
      if (!peer || Object.keys(peer).length === 0) {
        return done({ ok: false, error: 'The host completed a TLS handshake but presented no certificate.' });
      }

      const parseDate = (v: unknown): Date | null => {
        if (!v) return null;
        const d = new Date(String(v));
        return Number.isNaN(d.getTime()) ? null : d;
      };

      // subjectaltname arrives as 'DNS:a.example.com, DNS:b.example.com'.
      const sans = String(peer.subjectaltname ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((s: string) => s.replace(/^DNS:/i, ''));

      const issuerCN = peer.issuer?.CN ?? peer.issuer?.O ?? null;
      const subjectCN = peer.subject?.CN ?? null;

      done({
        ok: true,
        cert: {
          issuer: issuerCN,
          subject: subjectCN,
          sans,
          issuedAt: parseDate(peer.valid_from),
          expiresAt: parseDate(peer.valid_to),
          // Reported rather than judged: a self-signed certificate is a fact
          // about the deployment, and on an internal host it may be intended.
          selfSigned: !!issuerCN && issuerCN === subjectCN,
        },
      });
    });

    socket.once('timeout', () => done({ ok: false, error: `No TLS handshake within ${HANDSHAKE_TIMEOUT_MS}ms.` }));
    socket.once('error', (err: any) => done({ ok: false, error: `Could not complete a TLS handshake: ${err?.message ?? err}` }));
  });
}

/** Where a certificate stands relative to now. Derived, never stored by hand. */
export function certificateStatus(expiresAt: Date | null): 'active' | 'expiring' | 'expired' | 'pending' {
  if (!expiresAt) return 'pending';
  const msLeft = expiresAt.getTime() - Date.now();
  if (msLeft <= 0) return 'expired';
  // 30 days is the window the Overview's "expiring soon" alert already uses.
  if (msLeft <= 30 * 86_400_000) return 'expiring';
  return 'active';
}

/**
 * Inspect a domain and store what came back.
 *
 * One certificate row per domain, updated in place: the question this answers
 * is "what is this domain serving now", and a history of past certificates
 * would be a different feature with different storage.
 */
export async function refreshDomainCertificate(
  tenantId: string,
  domain: { id: string; domain: string },
): Promise<InspectionOutcome> {
  const outcome = await inspectCertificate(domain.domain);
  const now = new Date();

  const existing = await db.selectFrom('onsite_ssl_certificates')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('domain_id', '=', domain.id)
    .executeTakeFirst();

  const values = outcome.ok
    ? {
        provider: outcome.cert.selfSigned ? ('self_signed' as const) : ('provider' as const),
        issuer: outcome.cert.issuer,
        subject: outcome.cert.subject,
        sans: JSON.stringify(outcome.cert.sans),
        issued_at: outcome.cert.issuedAt,
        expires_at: outcome.cert.expiresAt,
        status: certificateStatus(outcome.cert.expiresAt),
        last_checked_at: now,
        last_error: null,
        updated_at: now,
      }
    : {
        // A failed check does not erase what was last known to be true; it
        // records that the check failed and when.
        status: 'failed' as const,
        last_checked_at: now,
        last_error: outcome.error.slice(0, 500),
        updated_at: now,
      };

  if (existing) {
    await db.updateTable('onsite_ssl_certificates')
      .set(values as any)
      .where('id', '=', existing.id)
      .where('tenant_id', '=', tenantId)
      .execute();
  } else {
    await db.insertInto('onsite_ssl_certificates')
      .values({ tenant_id: tenantId, domain_id: domain.id, ...(values as any) })
      .execute();
  }

  /**
   * The domain's own summary column, so a list of domains can show SSL state
   * without joining every certificate.
   *
   * onsite_domains.ssl_status accepts unknown/active/expiring/expired/none/
   * failed — it has no 'pending', which certificateStatus returns when there is
   * no expiry date to judge. That maps to 'unknown': we reached the host and
   * still cannot say when the certificate runs out.
   */
  const certStatus = outcome.ok ? certificateStatus(outcome.cert.expiresAt) : null;
  const domainSslStatus =
    certStatus === null ? 'failed'
    : certStatus === 'pending' ? 'unknown'
    : certStatus;

  await db.updateTable('onsite_domains')
    .set({
      ssl_status: domainSslStatus,
      ssl_checked_at: now,
      ssl_expires_at: outcome.ok ? outcome.cert.expiresAt : null,
    } as any)
    .where('id', '=', domain.id)
    .where('tenant_id', '=', tenantId)
    .execute();

  return outcome;
}
