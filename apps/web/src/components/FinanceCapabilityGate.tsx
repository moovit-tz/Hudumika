import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { FinanceCapabilityKey } from '@hudumika/types';
import { FINANCE_CAPABILITIES } from '@hudumika/types';
import { Link } from 'react-router-dom';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { PageHeader } from './PageHeader.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { SectionLoading } from './ui/spinner.js';

const FinanceReadOnlyContext = createContext(false);

export function useFinanceReadOnly() {
  return useContext(FinanceReadOnlyContext);
}

// Capability-specific upsell copy shown on the locked page.
const CAPABILITY_UPSELL: Partial<Record<FinanceCapabilityKey, string[]>> = {
  'finance.accounting.advanced': [
    'Manual journal entries and adjustments',
    'Accounting periods — open, close and lock month-end',
    'Bank reconciliation against statement imports',
    'Trial balance and advanced ledger workspace',
  ],
  'finance.budgets': [
    'Account-level budget planning by period',
    'Actual vs. budget variance reports',
    'Budget approval workflow',
  ],
  'finance.fixed_assets': [
    'Asset register with acquisition details',
    'Automatic depreciation scheduling and posting',
    'Asset disposal and gain/loss on sale',
  ],
  'finance.multi_currency': [
    'Foreign-currency transactions in any supported currency',
    'Daily exchange rate management and FX revaluation',
    'Multi-currency financial reports',
  ],
  'finance.inventory': [
    'Stock-aware product catalogue with on-hand tracking',
    'Inventory movements, adjustments and transfers',
    'FIFO/average-cost valuation and landed-cost allocation',
  ],
  'finance.procurement': [
    'Purchase requisitions and approval workflow',
    'Purchase orders sent directly to suppliers',
    'Three-way match — PO, receipt and bill',
  ],
  'finance.pos': [
    'Counter-sales register with shift management',
    'Cash, card and mobile money tender capture',
    'Sale notes, held carts and receipt printing',
  ],
  'finance.consolidation': [
    'Multi-entity consolidation across subsidiary ledgers',
    'Intercompany elimination entries',
    'Consolidated financial statements',
  ],
};

export function FinanceCapabilityGate({ capability, children }: { capability: FinanceCapabilityKey; children: ReactNode }) {
  const { data, loading } = useFinanceCapabilities();
  const [viewingHistory, setViewingHistory] = useState(false);
  if (loading || !data) return <SectionLoading label="Checking Finance access" />;
  const access = data.capabilities.find(item => item.key === capability);
  if (access?.enabled) return <FinanceReadOnlyContext.Provider value={false}>{children}</FinanceReadOnlyContext.Provider>;

  if (viewingHistory) return <div className="finance-readonly-view">
    <div className="finance-readonly-banner"><Icon name="lock" size={16} /><span><strong>Read-only history.</strong> Existing records remain available; the API blocks creates, edits, posting and deletion until {access?.name ?? 'this capability'} is enabled.</span><Button size="sm" variant="outline" onClick={() => setViewingHistory(false)}>Back</Button></div>
    <FinanceReadOnlyContext.Provider value>{children}</FinanceReadOnlyContext.Provider>
  </div>;

  const def = FINANCE_CAPABILITIES.find(c => c.key === capability);
  const bullets = CAPABILITY_UPSELL[capability] ?? (def ? [def.description] : []);
  const isEntitled = access?.entitled ?? false;
  const isAdvanced = def?.edition === 'advanced';

  return <div className="finance-capability-locked-page">
    <PageHeader
      crumbs={['Finance', 'Capability']}
      titlePlain={isEntitled ? 'Capability' : 'Finance'}
      titleEm={isEntitled ? 'disabled' : 'upgrade'}
      subtitle={isEntitled
        ? 'This capability is available in your package but has been turned off by an administrator.'
        : 'Unlock this capability by upgrading your Hudumika Workspace plan.'}
    />

    <div className="finance-upsell-card">
      {/* Left: locked capability details */}
      <div className="finance-upsell-left">
        <div className="finance-upsell-header">
          <span className="finance-upsell-icon">
            <Icon name={isEntitled ? 'settings' : 'lock'} size={20} />
          </span>
          <div>
            <div className="finance-upsell-name">
              {access?.name ?? def?.name ?? 'Finance capability'}
              {isAdvanced && <Badge variant="brand" style={{ marginLeft: 8 }}>Finance Advanced</Badge>}
            </div>
            <p className="finance-upsell-desc">{def?.description ?? 'This capability extends your Finance workspace.'}</p>
          </div>
        </div>

        {bullets.length > 0 && (
          <ul className="finance-upsell-bullets">
            {bullets.map(b => (
              <li key={b}>
                <Icon name="check" size={13} strokeWidth={2.5} style={{ color: 'var(--teal)', flexShrink: 0 } as React.CSSProperties} />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: CTA */}
      <div className="finance-upsell-right">
        {isEntitled ? (
          <>
            <div className="finance-upsell-cta-label">Available in your package</div>
            <p className="finance-upsell-cta-desc">
              Ask a tenant administrator to enable it in Finance Settings, or enable it yourself if you have admin access.
            </p>
            <div className="finance-upsell-cta-actions">
              <Button asChild>
                <Link to="/finance/industries">Open Finance Settings</Link>
              </Button>
              <Button variant="outline" onClick={() => setViewingHistory(true)}>
                View records read-only
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="finance-upsell-cta-label">
              {isAdvanced ? 'Requires Finance Advanced' : 'Contact sales'}
            </div>
            <p className="finance-upsell-cta-desc">
              {isAdvanced
                ? 'Finance Advanced is included in the Growth and Enterprise plans. Upgrade to unlock this and all other Advanced capabilities.'
                : 'Contact the sales team to discuss adding this capability to your workspace.'}
            </p>
            <div className="finance-upsell-cta-actions">
              <Button asChild>
                <Link to="/workspace/billing?tab=plans">
                  {isAdvanced ? 'View plans' : 'Contact sales'}
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setViewingHistory(true)}>
                View records read-only
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>;
}
