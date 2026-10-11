import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { ProjectCreateModal } from './ProjectCreateModal.js';

export function ProjectCreatePage() {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Planning']}
        titlePlain="New"
        titleEm="project"
        subtitle="Initialize project governance — define scope, industry classification, portfolio alignment, and baseline budgets."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/projects/directory')}>
            <Icon name="arrowLeft" size={13} style={{ marginRight: 6 }} /> Back to Directory
          </Button>
        }
      />
      <div style={{ marginTop: 20 }}>
        <ProjectCreateModal
          isOpen
          standalone
          onClose={() => navigate('/projects/directory')}
          onSuccess={id => navigate(`/projects/${id}`)}
        />
      </div>
    </div>
  );
}
