import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../lib/admin-auth.js';

/**
 * GET /v1/metrics
 *
 * Lightweight observability endpoint.
 * Returns platform-wide KPIs for the admin monitoring dashboard.
 * Gated behind x-admin-key — internal/admin tokens only.
 *
 * For deeper observability, emit these metrics to Prometheus/Grafana
 * via a metrics plugin (e.g. fastify-metrics).
 */
export async function metricsRoutes(app: FastifyInstance) {

  app.get('/', async (req: any, reply) => {
    if (!requireAdmin(req, reply)) return;

    const now   = new Date();
    const day   = new Date(now.getTime() - 24 * 60 * 60_000);
    const week  = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

    const [
      // User counts
      totalUsers,
      usersLast24h,
      verifiedUsers,
      l2Users,

      // Auth health
      loginsSuccess24h,
      loginsFailed24h,
      otpIssued24h,

      // KYC pipeline
      kycPending,
      kycVerified,
      kycRejected,

      // Trust distribution
      lowTrust,
      mediumTrust,
      highTrust,

      // Credit
      activeLoans,
      defaultedLoans,
      loansIssuedWeek,

      // Fraud
      openAlerts,
      criticalAlerts,

      // Audit chain
      auditEntries,
      regulatoryEntries,
    ] = await Promise.all([
      // Users
      app.prisma.user.count(),
      app.prisma.user.count({ where: { createdAt: { gte: day } } }),
      app.prisma.user.count({ where: { kycStatus: 'VERIFIED' } }),
      app.prisma.user.count({ where: { verificationLevel: 'L2_GOV_VERIFIED' } }),

      // Auth
      app.prisma.auditLog.count({ where: { action: 'LOGIN_SUCCESS', timestamp: { gte: day } } }),
      app.prisma.auditLog.count({ where: { action: 'LOGIN_FAILED',  timestamp: { gte: day } } }),
      app.prisma.auditLog.count({ where: { action: 'OTP_ISSUED',    timestamp: { gte: day } } }),

      // KYC
      app.prisma.kYCRecord.count({ where: { status: 'PENDING'  } }),
      app.prisma.kYCRecord.count({ where: { status: 'VERIFIED' } }),
      app.prisma.kYCRecord.count({ where: { status: 'REJECTED' } }),

      // Trust tiers
      app.prisma.trustProfile.count({ where: { trustTier: 'LOW'    } }),
      app.prisma.trustProfile.count({ where: { trustTier: 'MEDIUM' } }),
      app.prisma.trustProfile.count({ where: { trustTier: 'HIGH'   } }),

      // Credit
      app.prisma.creditAccount.count({ where: { status: 'ACTIVE'    } }),
      app.prisma.creditAccount.count({ where: { status: 'DEFAULTED' } }),
      app.prisma.auditLog.count({ where: { action: 'LOAN_ISSUED', timestamp: { gte: week } } }),

      // Fraud
      app.prisma.fraudAlert.count({ where: { status: 'OPEN' } }),
      app.prisma.fraudAlert.count({ where: { status: 'OPEN', severity: 'HIGH' } }),

      // Audit
      app.prisma.auditLog.count(),
      app.prisma.auditLog.count({ where: { isRegulatory: true } }),
    ]);

    const loginSuccessRate = loginsSuccess24h + loginsFailed24h > 0
      ? ((loginsSuccess24h / (loginsSuccess24h + loginsFailed24h)) * 100).toFixed(1)
      : '0.0';

    return reply.send({
      generatedAt: now.toISOString(),
      platform: {
        totalUsers,
        newUsers24h:     usersLast24h,
        verifiedUsers,
        govVerifiedUsers: l2Users,
      },
      auth: {
        loginSuccess24h: loginsSuccess24h,
        loginFailed24h:  loginsFailed24h,
        loginSuccessRate: `${loginSuccessRate}%`,
        otpIssued24h,
      },
      kyc: {
        pending:  kycPending,
        verified: kycVerified,
        rejected: kycRejected,
        approvalRate: kycVerified + kycRejected > 0
          ? `${((kycVerified / (kycVerified + kycRejected)) * 100).toFixed(1)}%`
          : 'N/A',
      },
      trust: {
        distribution: { low: lowTrust, medium: mediumTrust, high: highTrust },
      },
      credit: {
        activeLoans,
        defaultedLoans,
        defaultRate: activeLoans + defaultedLoans > 0
          ? `${((defaultedLoans / (activeLoans + defaultedLoans)) * 100).toFixed(1)}%`
          : 'N/A',
        loansIssuedThisWeek: loansIssuedWeek,
      },
      fraud: {
        openAlerts,
        criticalAlerts,
      },
      governance: {
        totalAuditEntries: auditEntries,
        regulatoryEntries,
      },
    });
  });
}
