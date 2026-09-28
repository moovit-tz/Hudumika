import React from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { ClearOSMetricsDashboard } from './ClearOSMetricsDashboard.js';
import { CommandCenter } from './CommandCenter.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { useNavigate } from 'react-router-dom';

/**
 * Landing page for /clearos. Managers/admins land on the operations metrics
 * dashboard; everyone else lands on Ops Command — both render inside the
 * same shell (header, sidebar, footer). The footer itself comes from
 * PageLayout (this route is nested under it), not rendered here.
 */
export const ClearOSLanding: React.FC = () => {
  usePageSEO('ClearOS Dashboard', 'Overview of operations and shipments.');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMgmt = !!user && MGMT_ROLES.includes(user.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <PageHeader
        crumbs={['ClearOS', 'Overview']}
        titlePlain="Clearance"
        titleEm="overview"
        subtitle="Your customs workspace at a glance."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/clearos/ops')}>
              <Icon name="clipboardList" size={15} /> View operations
            </Button>
            <Button onClick={() => navigate('/clearos/ops/new')}>
              <Icon name="plus" size={15} /> New shipment
            </Button>
          </div>
        }
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isMgmt ? <ClearOSMetricsDashboard /> : <CommandCenter />}
      </div>
    </div>
  );
};
