import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { ProjectPortfolios } from './ProjectPortfolios.js';

export const ProjectPortfoliosPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Overview']}
        titlePlain="Project"
        titleEm="portfolios"
        subtitle="Organize multi-project portfolios and strategic programs for executive alignment."
      />
      <div style={{ marginTop: 20 }}>
        <ProjectPortfolios onSelectProject={id => navigate(`/projects/${id}`)} />
      </div>
    </div>
  );
};
