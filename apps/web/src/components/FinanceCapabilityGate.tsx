import type { ReactNode } from 'react';
import type { FinanceCapabilityKey } from '@hudumika/types';
import { Link } from 'react-router-dom';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { PageHeader } from './PageHeader.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { SectionLoading } from './ui/spinner.js';

export function FinanceCapabilityGate({ capability, children }: { capability: FinanceCapabilityKey; children: ReactNode }) {
  const { data, loading } = useFinanceCapabilities();
  if (loading || !data) return <SectionLoading label="Checking Finance access" />;
  const access = data.capabilities.find(item => item.key === capability);
  if (access?.enabled) return <>{children}</>;

  return <div className="finance-capability-locked-page">
    <PageHeader crumbs={['Finance', 'Capability']} titlePlain="Capability" titleEm="unavailable" subtitle="This Finance workspace is preserving your existing records while preventing new restricted activity." />
    <section className="finance-capability-locked-card">
      <span className="finance-capability-locked-icon"><Icon name="lock" size={22} /></span>
      <div><h2>{access?.name ?? 'Finance capability'}</h2><p>{access?.entitled ? 'Included in your workspace package, but currently disabled by an administrator.' : 'Not included in your current Hudumika Workspace package.'}</p></div>
      <Button asChild><Link to="/finance/settings/capabilities">{access?.entitled ? 'Open capabilities' : 'View availability'}</Link></Button>
    </section>
  </div>;
}
