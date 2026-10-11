import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { ProjectBudgetTracking } from './ProjectBudgetTracking.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';

export const ProjectBudgetsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Financial']}
        titlePlain="Project"
        titleEm="budgets"
        subtitle="Financial control console — baseline allocations, current budgets, recorded actuals, and burn rate variance."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/procurement')}>
              <Icon name="shoppingCart" size={13} style={{ marginRight: 6 }} /> Procurement
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/finance')}>
              <Icon name="dollarSign" size={13} style={{ marginRight: 6 }} /> Finance App
            </Button>
          </div>
        }
      />
      <div style={{ marginTop: 20 }}>
        <ProjectBudgetTracking
          onNewProject={() => navigate('/projects/new')}
          onSelectProject={id => navigate(`/projects/${id}`)}
        />
      </div>
    </div>
  );
};
