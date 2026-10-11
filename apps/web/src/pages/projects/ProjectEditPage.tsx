import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { apiFetch } from '../../lib/api.js';
import { ProjectCreateModal } from './ProjectCreateModal.js';

export function ProjectEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`/v1/tasks/projects/${id}`);
      setProject(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = project && (['owner', 'admin'].includes(project.access) || !project.access);

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      <PageHeader
        crumbs={['Projects', 'Planning']}
        titlePlain="Edit"
        titleEm="project"
        subtitle="Update project parameters — baseline schedules, contract values, industry tag, and portfolio links."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}`)}>
            <Icon name="arrowLeft" size={13} style={{ marginRight: 6 }} /> Back to Workspace
          </Button>
        }
      />

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <SectionLoading />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error} <Button variant="outline" size="sm" onClick={() => void load()} style={{ marginLeft: 8 }}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : !canEdit ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 32, textAlign: 'center', color: 'var(--ink2)' }}>
            Only a project owner or workspace administrator has permissions to edit project parameters.
          </div>
        ) : (
          <ProjectCreateModal
            isOpen
            standalone
            initialProject={project}
            onClose={() => navigate(`/projects/${id}`)}
            onSuccess={savedId => navigate(`/projects/${savedId}`)}
          />
        )}
      </div>
    </div>
  );
}
