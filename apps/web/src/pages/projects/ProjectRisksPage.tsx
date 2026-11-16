import React from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { ProjectRisksDashboard } from './ProjectRisksDashboard.js';

export const ProjectRisksPage: React.FC = () => {

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Controls']}
        titlePlain="Risk"
        titleEm="register"
        subtitle="Enterprise risk governance — probability scoring, impact severity matrix, and portfolio value-at-risk."
      />
      <div style={{ marginTop: 20 }}>
        <ProjectRisksDashboard projectName="All Projects" />
      </div>
    </div>
  );
};
