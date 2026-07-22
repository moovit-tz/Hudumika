import React from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { ClearOSMetricsDashboard } from './ClearOSMetricsDashboard.js';
import { CommandCenter } from './CommandCenter.js';

/**
 * Landing page for /clearos. Managers/admins land on the operations metrics
 * dashboard; everyone else lands on Ops Command — both render inside the
 * same shell (header, sidebar, footer). The footer itself comes from
 * PageLayout (this route is nested under it), not rendered here.
 */
export const ClearOSLanding: React.FC = () => {
  usePageSEO('ClearOS Dashboard', 'Overview of operations and shipments.');
  const { user } = useAuth();
  const isMgmt = !!user && MGMT_ROLES.includes(user.role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isMgmt ? <ClearOSMetricsDashboard /> : <CommandCenter />}
      </div>
    </div>
  );
};
