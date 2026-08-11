import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';

interface DashboardData {
  period: string;
  summary: {
    monthlyRevenue: number;
    revenueVsForecastPercent: number;
    profitMarginPercent: number;
    arrGrowthPercent: number;
    enterpriseCustomers: number;
    businessHealthScore: number;
    confidenceScorePercent: number;
    upsideValue: number;
    strategicRisksCount: number;
    totalRecordsAnalyzed: number;
    aiBoardText: string;
  };
  regionalPerformance: Array<{
    region: string;
    revenue: number;
    percentage: number;
    status: string;
  }>;
  topOpportunities: Array<{
    title: string;
    annualImpact: number;
    label: string;
  }>;
  executiveDecisions: Array<{
    id: string;
    text: string;
    status: string;
  }>;
  financialSummary: {
    grossRevenueMonthly: number;
    cogs: number;
    opex: number;
    netProfit: number;
    netMarginPercent: number;
  };
}

export function HuduBIDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('Q3 2026');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [showExplainDrawer, setShowExplainDrawer] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Array<{ id: string; text: string; status: string }>>([]);

  const loadData = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hudubi/dashboard');
      if (res) {
        setData(res);
        setDecisions(res.executiveDecisions || []);
      }
    } catch (err) {
      console.error('Failed to load HuduBI dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleDecision = async (id: string, action: 'Approve' | 'Defer') => {
    try {
      await apiFetch('/v1/hudubi/action', {
        method: 'POST',
        body: JSON.stringify({ action, decisionId: id }),
      });
      setDecisions(prev => prev.map(d => d.id === id ? { ...d, status: action.toUpperCase() } : d));
      showToast(action === 'Approve' ? 'Decision approved and updated.' : 'Decision deferred to next board session.');
    } catch {
      showToast(action === 'Approve' ? 'Decision approved.' : 'Decision deferred.');
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#fafafa', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      {/* Page Header */}
      <PageHeader
        crumbs={['HuduBI', 'Overview']}
        titlePlain="Executive Business"
        titleEm="snapshot"
        subtitle="Consolidated multi-tenant AI data engine, board KPIs, and strategic intelligence"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
              >
                <Icon name="calendar" size={14} />
                <span>{period}</span>
                <Icon name="chevronDown" size={12} />
              </button>
              {showPeriodMenu && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 160, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50, padding: 4 }}>
                  {['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'FY 2026'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                      style={{ width: '100%', textAlign: 'left', padding: '6px 12px', border: 'none', background: period === p ? '#18181B' : 'transparent', color: period === p ? '#fff' : 'var(--navy)', borderRadius: 6, fontSize: 12, fontWeight: period === p ? 700 : 500, cursor: 'pointer' }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => showToast('Exporting Q3 2026 Board Report PDF...')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#18181B', color: '#fff' }}
            >
              <Icon name="fileText" size={14} color="#fff" />
              Board Report
            </button>
          </div>
        }
      />

      {/* AI Board Executive Summary Card */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#18181B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="zap" size={16} color="#fcd34d" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>AI Board Executive Summary</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Real-time synthesis across 18.4M data points</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, maxWidth: 960 }}>
          {data?.summary.aiBoardText || `AI analyzed 18.4 million records across Hudumika platform today. Monthly revenue of $28.4M is tracking 18.6% above forecast, with a projected quarterly increase of 14.8% and a business health score of 96.4. One strategic anomaly was flagged in Region A customer acquisition, posing a modest risk to next quarter's growth trajectory. Board recommendation: reallocate marketing budget toward the Enterprise segment to compound the current growth advantage.`}
        </p>

        {/* AI Confidence Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#374151' }}>
            <Icon name="activity" size={13} color="#18181b" /> 97.8% confidence score
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#374151' }}>
            <Icon name="clock" size={13} color="#18181b" /> Generated 18 minutes ago
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#d1fae5', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#065f46' }}>
            <Icon name="trendingUp" size={13} color="#10b981" /> Business impact +$1.8M upside
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#92400e' }}>
            <Icon name="alertTriangle" size={13} color="#f59e0b" /> 1 strategic risk flagged
          </span>
        </div>

        {/* AI Action Triggers */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowExplainDrawer(true)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, fontWeight: 600, color: '#111827', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="info" size={14} /> Explain AI
          </button>
          <button
            type="button"
            onClick={() => showToast('Opening AI reasoning model explainability log...')}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#f3f4f6', fontSize: 12, fontWeight: 600, color: '#4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="helpCircle" size={14} /> Learn Why
          </button>
          <button
            type="button"
            onClick={() => showToast('Marketing budget reallocation request sent to Finance for approval.')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#18181B', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="send" size={14} color="#fff" /> Act on Recommendation
          </button>
        </div>
      </div>

      {/* Board KPI Strip */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', overflow: 'hidden' }}>
        
        {/* Metric 1 */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Monthly Revenue</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>+18.6%</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>$28.4M</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>vs. forecast</div>
        </div>

        {/* Metric 2 */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Profit Margin</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>+1.6 pts</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>24.8%</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>vs. last quarter</div>
        </div>

        {/* Metric 3 */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>ARR Growth</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>YoY</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>+21.4%</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>accelerating</div>
        </div>

        {/* Metric 4 */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Enterprise Accounts</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>+6.2%</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>8,420</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>vs. last quarter</div>
        </div>

        {/* Metric 5 */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Health Score</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Stable</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>96.4</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>vs. last quarter</div>
        </div>

      </div>

      {/* Strategic Risk & Opportunity 3-Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        
        {/* Card 1: Red Risk */}
        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="alertTriangle" size={15} color="#ef4444" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>Region A Acquisition Anomaly</div>
            </div>
            <p style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.5, margin: 0 }}>
              Customer acquisition in Region A fell 31% below baseline this week. AI flags a moderate risk to Q4 growth if unaddressed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => showToast('Region A anomaly escalated to the growth strategy team.')}
            style={{ marginTop: 14, background: 'none', border: 'none', color: '#991b1b', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Escalate to Strategy Team <Icon name="arrowRight" size={12} color="#991b1b" />
          </button>
        </div>

        {/* Card 2: Dark Enterprise Opportunity */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#18181B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trendingUp" size={15} color="#fff" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Enterprise Segment Opportunity</div>
            </div>
            <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5, margin: 0 }}>
              Enterprise accounts are growing 2.4× faster than blended average. Reallocating budget could add an estimated $6.2M in annual revenue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => showToast('Enterprise expansion business case added to the board packet.')}
            style={{ marginTop: 14, background: 'none', border: 'none', color: '#111827', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Add to Board Packet <Icon name="arrowRight" size={12} color="#111827" />
          </button>
        </div>

        {/* Card 3: Amber FX Compression */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="info" size={15} color="#f59e0b" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>APAC Margin Compression</div>
            </div>
            <p style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.5, margin: 0 }}>
              FX headwinds have compressed APAC gross margin by 3.2 points this quarter. Finance recommends a hedging policy review.
            </p>
          </div>
          <button
            type="button"
            onClick={() => showToast('Hedging policy review request sent to Finance.')}
            style={{ marginTop: 14, background: 'none', border: 'none', color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Request Hedging Review <Icon name="arrowRight" size={12} color="#92400e" />
          </button>
        </div>

      </div>

      {/* Visual Analytics Charts Grid: Revenue Bridge & Regional Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        
        {/* Revenue Bridge Waterfall */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Revenue Bridge</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Monthly revenue walk · new business, expansion, churn & discounts</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {[
              { label: 'Starting MRR', val: '$24.2M', barPct: 80, color: '#4b5563' },
              { label: 'New Business', val: '+$2.8M', barPct: 20, color: '#10b981' },
              { label: 'Expansion MRR', val: '+$2.3M', barPct: 16, color: '#10b981' },
              { label: 'Churn & Contraction', val: '-$0.9M', barPct: 8, color: '#ef4444' },
              { label: 'Ending Revenue', val: '$28.4M', barPct: 95, color: '#18181B' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  <span>{item.label}</span>
                  <span>{item.val}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${item.barPct}%`, background: item.color, borderRadius: 4 }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regional Performance */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Regional Performance</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Monthly revenue contribution by region</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46', padding: '4px 10px', borderRadius: 12 }}>
              Fastest: APAC (+9.4%)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(data?.regionalPerformance || [
              { region: 'North America', revenue: 12900000, percentage: 88, status: 'Strong' },
              { region: 'Europe', revenue: 8200000, percentage: 58, status: 'Growing' },
              { region: 'Asia Pacific', revenue: 5100000, percentage: 36, status: 'Fastest (+9.4% QoQ)' },
              { region: 'Latin America', revenue: 2200000, percentage: 16, status: 'Emerging' },
            ]).map(r => (
              <div key={r.region} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, color: '#111827' }}>
                  <span>{r.region}</span>
                  <span style={{ color: '#6b7280' }}>{formatCurrency(r.revenue)}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.percentage}%`, background: '#18181B', borderRadius: 4 }}></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: '#9ca3af' }}>Total Regional Revenue</span>
            <span style={{ fontWeight: 800, color: '#111827', fontSize: 14 }}>$28.4M</span>
          </div>
        </div>

      </div>

      {/* Opportunities & Executive Decisions Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        
        {/* Top Opportunities */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Top Opportunities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(data?.topOpportunities || [
                { title: 'Expand Enterprise+ to EU market', annualImpact: 6200000, label: 'Est. annual impact' },
                { title: 'Cross-sell AI Copilot add-on', annualImpact: 3800000, label: 'Est. annual impact' },
                { title: 'Renegotiate cloud infra contract', annualImpact: 1100000, label: 'Est. annual savings' },
              ]).map(opp => (
                <div key={opp.title} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{opp.title}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{opp.label}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
                    +{formatCurrency(opp.annualImpact)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Total identified upside</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>+$11.1M annualized</span>
          </div>
        </div>

        {/* Executive Decisions Pending */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Executive Decisions Pending</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {decisions.map(dec => (
                <div key={dec.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: '#111827', flex: 1, minWidth: 200 }}>{dec.text}</span>
                  {dec.status === 'PENDING' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleDecision(dec.id, 'Approve')}
                        style={{ padding: '5px 12px', borderRadius: 6, background: '#18181B', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(dec.id, 'Defer')}
                        style={{ padding: '5px 12px', borderRadius: 6, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Defer
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: dec.status === 'APPROVE' ? '#d1fae5' : '#f3f4f6', color: dec.status === 'APPROVE' ? '#065f46' : '#6b7280' }}>
                      {dec.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>3 decisions awaiting sign-off</span>
            <button type="button" onClick={() => showToast('Opening full decision audit log...')} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#111827', cursor: 'pointer' }}>
              View Decision Log
            </button>
          </div>
        </div>

      </div>

      {/* P&L Financial Summary & Board Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        
        {/* Profit & Loss Summary */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14 }}>Profit & Loss Summary</div>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px 0', color: '#6b7280' }}>Gross Revenue (monthly)</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#111827' }}>$28.4M</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px 0', color: '#6b7280' }}>Cost of Goods Sold (COGS)</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#111827' }}>-$12.1M</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px 0', color: '#6b7280' }}>Operating Expenses (OpEx)</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#111827' }}>-$9.3M</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 800, color: '#111827' }}>Net Profit</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, color: '#111827', fontSize: 14 }}>$7.0M</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Net Margin</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>24.8%</span>
          </div>
        </div>

        {/* Board Reports Archive */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14 }}>Board Reports & Decks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { title: 'Q3 2026 Board Deck', type: 'PDF' },
                { title: 'Annual Strategy Review', type: 'PDF' },
                { title: 'Financial Audit 2025', type: 'XLSX' },
              ].map(rep => (
                <button
                  key={rep.title}
                  type="button"
                  onClick={() => showToast(`Downloading ${rep.title}...`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#111827' }}>
                    <Icon name="fileText" size={15} color={rep.type === 'PDF' ? '#ef4444' : '#10b981'} />
                    {rep.title}
                  </span>
                  <Icon name="download" size={14} color="#9ca3af" />
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>3 of 22 board reports shown</span>
            <button type="button" onClick={() => showToast('Opening board report archive...')} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: '#111827', cursor: 'pointer' }}>
              View Archive
            </button>
          </div>
        </div>

      </div>

      {/* AI Explainability Sliding Drawer */}
      {showExplainDrawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(24,24,27,0.3)', backdropFilter: 'blur(2px)' }} onClick={() => setShowExplainDrawer(false)}></div>
          <div style={{ position: 'relative', width: 420, maxWidth: '100%', background: '#fff', borderLeft: '1px solid #e5e7eb', boxShadow: '-10px 0 25px rgba(0,0,0,0.1)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Explain Board Summary</div>
              <button type="button" onClick={() => setShowExplainDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Model</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Executive Insights Engine v3.1</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>Synthesis over consolidated financial & operational data</div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Data Sources</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Revenue Forecasting v2.7, Churn Prediction v3.2, and 185 connected data sources across 14 global regions.
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Why 97.8% Confidence</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Trailing 12-week forecast variance was within ±1.8%, and Revenue Forecasting v2.7 has scored above its 95% minimum accuracy threshold for six consecutive quarters.
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Recommendation Rationale</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Enterprise segment revenue is growing 2.4x faster than blended account average, while Region A acquisition volume fell 31% below baseline.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 110, background: '#18181B', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={16} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
