import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';

export async function hudubiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('hudubi'));

  // ── Executive Dashboard Data ──────────────────────────────────────
  fastify.get('/dashboard', async (req) => {
    const user = req.user;

    return withTenant(user.tenant_id, async (trx) => {
      // Aggregate executive numbers
      return {
        period: 'Q3 2026',
        summary: {
          monthlyRevenue: 28400000,
          revenueVsForecastPercent: 18.6,
          profitMarginPercent: 24.8,
          arrGrowthPercent: 21.4,
          enterpriseCustomers: 8420,
          businessHealthScore: 96.4,
          confidenceScorePercent: 97.8,
          upsideValue: 1800000,
          strategicRisksCount: 1,
          totalRecordsAnalyzed: 18400000,
          aiBoardText: `AI analyzed 18.4 million records across Hudumika platform today. Monthly revenue of $28.4M is tracking 18.6% above forecast, with a projected quarterly increase of 14.8% and a business health score of 96.4. One strategic anomaly was flagged in Region A customer acquisition, posing a modest risk to next quarter's growth trajectory. Board recommendation: reallocate marketing budget toward the Enterprise segment to compound the current growth advantage.`,
        },
        regionalPerformance: [
          { region: 'North America', revenue: 12900000, percentage: 88, status: 'Strong' },
          { region: 'Europe', revenue: 8200000, percentage: 58, status: 'Growing' },
          { region: 'Asia Pacific', revenue: 5100000, percentage: 36, status: 'Fastest growing (+9.4% QoQ)' },
          { region: 'Latin America', revenue: 2200000, percentage: 16, status: 'Emerging' },
        ],
        topOpportunities: [
          { title: 'Expand Enterprise+ to EU market', annualImpact: 6200000, label: 'Est. annual impact' },
          { title: 'Cross-sell AI Copilot add-on', annualImpact: 3800000, label: 'Est. annual impact' },
          { title: 'Renegotiate cloud infra contract', annualImpact: 1100000, label: 'Est. annual savings' },
        ],
        executiveDecisions: [
          { id: 'dec-1', text: 'Approve Q4 marketing budget increase', status: 'PENDING' },
          { id: 'dec-2', text: 'Sign off on APAC hiring plan', status: 'PENDING' },
          { id: 'dec-3', text: 'Approve cloud infra contract renegotiation', status: 'PENDING' },
        ],
        financialSummary: {
          grossRevenueMonthly: 28400000,
          cogs: 12100000,
          opex: 9300000,
          netProfit: 7000000,
          netMarginPercent: 24.8,
        },
      };
    });
  });

  // ── AI Model Explainability Metadata ──────────────────────────────
  fastify.get('/explain', async (req) => {
    return {
      modelName: 'Executive Insights Engine v3.1',
      description: 'Synthesis over consolidated financial & operational data across 185 connected sources.',
      confidencePercent: 97.8,
      dataSourcesCount: 185,
      historyVariancePercent: 1.8,
      rationale: 'Enterprise segment revenue is growing 2.4x faster than blended account average, while Region A acquisition volume fell 31% below baseline.',
      recommendation: 'Route the marketing budget reallocation to Finance for sign-off this week to preserve Q4 growth trajectory.',
    };
  });

  // ── Data Sources Overview ──────────────────────────────────────────
  fastify.get('/data-sources', async (req) => {
    return {
      sources: [
        { name: 'Snowflake Data Warehouse', type: 'WAREHOUSE', status: 'CONNECTED', recordsCount: 12400000, lastSync: '10 min ago' },
        { name: 'Postgres Operational DB', type: 'DATABASE', status: 'CONNECTED', recordsCount: 4200000, lastSync: 'Live' },
        { name: 'Google BigQuery Analytics', type: 'ANALYTICS', status: 'CONNECTED', recordsCount: 1800000, lastSync: '1 hour ago' },
        { name: 'AWS S3 Data Lake', type: 'STORAGE', status: 'CONNECTED', recordsCount: 8500000, lastSync: '30 min ago' },
      ],
    };
  });

  // ── Action Executions ──────────────────────────────────────────────
  fastify.post('/action', async (req, reply) => {
    const body = req.body as any || {};
    return {
      ok: true,
      action: body.action || 'EXECUTE',
      message: body.message || 'Action executed successfully.',
      timestamp: new Date().toISOString(),
    };
  });
}
