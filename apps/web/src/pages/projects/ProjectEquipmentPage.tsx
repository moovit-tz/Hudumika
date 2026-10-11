import React from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { ProjectResources } from './ProjectResources.js';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';

export function ProjectEquipmentPage() {
  const navigate = useNavigate();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Resources']}
        titlePlain="Equipment &"
        titleEm="assets"
        subtitle="Machinery fleet & heavy equipment registry — asset tracking, capacity ratings, rates, and project allocations."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/team')}>
              <Icon name="users" size={13} style={{ marginRight: 6 }} /> Team Directory
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/documents')}>
              <Icon name="archive" size={13} style={{ marginRight: 6 }} /> Documents
            </Button>
          </div>
        }
      />
      <div style={{ marginTop: 20 }}>
        <ProjectResources />
      </div>
    </div>
  );
}
