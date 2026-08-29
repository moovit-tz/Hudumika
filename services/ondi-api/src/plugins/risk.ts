import fp from 'fastify-plugin';
import type { AuthSessionRisk, RiskFactor } from '@ondi/shared-types';
import { randomUUID } from 'crypto';

interface RiskInput {
  userId: string;
  deviceFingerprint: string;
  isNewDevice: boolean;
  trustScore: number;
  recentFailedAttempts: number;
  ipAddress: string;
  lastKnownIp: string | null;
}

export const riskPlugin = fp(async (app) => {
  app.decorate('riskEngine', {
    assess: async (input: RiskInput): Promise<AuthSessionRisk> => {
      const factors: RiskFactor[] = [];
      let riskScore = 0;

      // Factor 1: device recognition. Callers resolve this against the Device
      // table themselves (see /auth/verify-otp, which upserts the device row
      // before calling assess) and pass the result in — re-querying here
      // would always read back "known" since the device was just written.
      if (input.isNewDevice) { riskScore += 30; factors.push('new_device'); }

      // Factor 2: geolocation anomaly
      if (input.lastKnownIp && input.ipAddress !== input.lastKnownIp) {
        riskScore += 25; factors.push('unusual_location');
      }

      // Factor 3: recent failed attempts
      if (input.recentFailedAttempts >= 3) {
        riskScore += 20; factors.push('failed_attempts');
      }

      // Decision tree: trust score + contextual risk
      const decision =
        input.trustScore >= 700 && riskScore < 20  ? 'allow'     :
        input.trustScore >= 500 && riskScore < 50  ? 'otp'       :
        input.trustScore >= 300 && riskScore < 80  ? 'biometric' :
                                                       'block';

      return { sessionId: randomUUID(), riskScore, factors, decision };
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    riskEngine: {
      assess: (input: RiskInput) => Promise<AuthSessionRisk>;
    };
  }
}
