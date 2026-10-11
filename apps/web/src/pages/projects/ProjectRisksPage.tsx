import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { ProjectRisksDashboard } from './ProjectRisksDashboard.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';

export const ProjectRisksPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Controls']}
        titlePlain="Risk"
        titleEm="register"
        subtitle="Enterprise risk governance — probability scoring, impact severity matrix, and portfolio value-at-risk."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/approvals')}>
              <Icon name="clipboardList" size={13} style={{ marginRight: 6 }} /> Approvals
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/reports')}>
              <Icon name="barChart2" size={13} style={{ marginRight: 6 }} /> Reports
            </Button>
          </div>
        }
      />
      <div style={{ marginTop: 20 }}>
        <ProjectRisksDashboard projectName="All Projects" />
      </div>
    </div>
  );
};
