import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * The scalar-KPI half of GET /v1/support/tickets/../metrics (support.
 * routes.ts) — extracted so the Metric Registry (metrics-registry.
 * service.ts) computes the exact same numbers support.routes.ts's own
 * dashboard already shows, instead of a second implementation that could
 * drift from it. The chart-shaped half of that endpoint (the 14-day daily
 * bars, the first-reply histogram, the busiest-hour heatmap, tag
 * breakdown, and per-agent stats) stays inline in support.routes.ts —
 * those are page layout for one screen, not registry-worthy KPIs other
 * surfaces would want to query.
 */
export interface BlissKpis {
  total: number; open: number; inProgress: number; resolved: number; closed: number; urgent: number;
  nps: { score: number; promoters: number; passives: number; detractors: number; total: number };
  csat: number;
  firstReply: number;
  resolution: number;
  sla: number;
  defect: number;
  escalation: number;
}

export async function computeBlissKpis(
  trx: Kysely<Database> | Transaction<Database>,
  tenantId: string,
  days: number,
): Promise<BlissKpis> {
  const cutoff = new Date(Date.now() - days * 86400000);
  const tickets = await trx
    .selectFrom('support_tickets')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('created_at', '>=', cutoff)
    .execute();

  const total = tickets.length;
  const open = tickets.filter(t => t.status === 'OPEN').length;
  const inProgress = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolved = tickets.filter(t => t.status === 'RESOLVED').length;
  const closed = tickets.filter(t => t.status === 'CLOSED').length;
  const urgent = tickets.filter(t => t.priority === 'URGENT').length;

  const surveyTickets = tickets.filter(t => t.nps_score !== null && t.nps_score !== undefined);
  const totalNpsCount = surveyTickets.length;
  let npsScore = 0, promoters = 0, passives = 0, detractors = 0;
  if (totalNpsCount > 0) {
    const promoterCount  = surveyTickets.filter(t => t.nps_score! >= 9).length;
    const passiveCount   = surveyTickets.filter(t => t.nps_score! >= 7 && t.nps_score! <= 8).length;
    const detractorCount = surveyTickets.filter(t => t.nps_score! <= 6).length;
    promoters  = Math.round((promoterCount  / totalNpsCount) * 100);
    passives   = Math.round((passiveCount   / totalNpsCount) * 100);
    detractors = Math.round((detractorCount / totalNpsCount) * 100);
    npsScore = promoters - detractors;
  }

  const csatTickets = tickets.filter(t => t.csat_score !== null && t.csat_score !== undefined);
  const csatAvg = csatTickets.length > 0
    ? Number((csatTickets.reduce((acc, t) => acc + t.csat_score!, 0) / csatTickets.length).toFixed(1))
    : 0;

  const replyTickets = tickets.filter(t => t.first_reply_time_seconds !== null && t.first_reply_time_seconds !== undefined);
  const avgFirstReply = replyTickets.length > 0
    ? Number((replyTickets.reduce((acc, t) => acc + t.first_reply_time_seconds!, 0) / replyTickets.length / 3600).toFixed(1))
    : 0;

  const solveTickets = tickets.filter(t => t.resolution_time_seconds !== null && t.resolution_time_seconds !== undefined);
  const avgSolveTime = solveTickets.length > 0
    ? Number((solveTickets.reduce((acc, t) => acc + t.resolution_time_seconds!, 0) / solveTickets.length / 3600).toFixed(1))
    : 0;

  let slaCompliantCount = 0, slaEvaluatedCount = 0;
  for (const t of tickets) {
    if (t.sla_deadline) {
      slaEvaluatedCount++;
      const deadlineTime = new Date(t.sla_deadline).getTime();
      const resolutionTime = t.resolved_at ? new Date(t.resolved_at).getTime() : Date.now();
      if (resolutionTime <= deadlineTime) slaCompliantCount++;
    }
  }
  const slaCompliance = slaEvaluatedCount > 0 ? Number(((slaCompliantCount / slaEvaluatedCount) * 100).toFixed(1)) : 100;

  const defectCount = tickets.filter(t =>
    t.sla_deadline && t.resolved_at && new Date(t.resolved_at).getTime() > new Date(t.sla_deadline).getTime()
  ).length;
  const defectRate = total > 0 ? Number(((defectCount / total) * 100).toFixed(1)) : 0;

  // sla_escalated_at is stamped by the real sla_escalation rule job
  // (support-rules.job.ts), not derived from another metric.
  const escalatedCount = tickets.filter(t => t.sla_escalated_at != null).length;
  const escalationRate = total > 0 ? Number(((escalatedCount / total) * 100).toFixed(1)) : 0;

  return {
    total, open, inProgress, resolved, closed, urgent,
    nps: { score: npsScore, promoters, passives, detractors, total: totalNpsCount },
    csat: csatAvg,
    firstReply: avgFirstReply,
    resolution: avgSolveTime,
    sla: slaCompliance,
    defect: defectRate,
    escalation: escalationRate,
  };
}
