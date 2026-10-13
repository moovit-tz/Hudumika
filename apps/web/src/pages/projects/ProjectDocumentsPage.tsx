import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface ProjectDoc {
  id: string;
  project_id: string;
  project_name: string;
  project_color: string;
  name: string;
  file_type?: string;
  size?: number;
  uploaded_by_name?: string;
  created_at: string;
  category?: string;
}

const FILE_ICONS: Record<string, string> = {
  pdf: 'fileText',
  doc: 'fileText',
  docx: 'fileText',
  xls: 'barChart2',
  xlsx: 'barChart2',
  csv: 'barChart2',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  zip: 'archive',
  rar: 'archive',
};

export const ProjectDocumentsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [docPage, setDocPage] = useState(1);
  const [docPageSize, setDocPageSize] = useState(25);

  useEffect(() => { setDocPage(1); }, [search, projectFilter, docPageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch('/v1/project-os/all/documents');
      const list = Array.isArray(res) ? res : (res?.data || []);
      setDocs(list.map((d: any) => ({
        id: d.id,
        project_id: d.project_id,
        project_name: d.project_name,
        project_color: d.project_color || 'var(--teal)',
        name: d.name || `Document #${String(d.id).slice(0, 8)}`,
        file_type: d.name?.split('.').pop()?.toLowerCase(),
        size: d.size,
        uploaded_by_name: d.owner_name,
        created_at: d.created_at,
        category: d.mime_type,
      })));
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load project documents');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    docs.forEach(d => map.set(d.project_id, d.project_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [docs]);

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (projectFilter !== 'all' && d.project_id !== projectFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.project_name.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [docs, projectFilter, search]);

  const totalBytes = docs.reduce((s, d) => s + (Number(d.size) || 0), 0);
  const formattedTotalSize = totalBytes > 1048576 ? `${(totalBytes / 1048576).toFixed(1)} MB` : `${(totalBytes / 1024).toFixed(0)} KB`;

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Resources']}
        titlePlain="Project"
        titleEm="documents"
        subtitle="Centralized document repository — architectural blueprints, technical specifications, and project deliverables."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/cloud')}>
              <Icon name="folder" size={13} style={{ marginRight: 6 }} /> Cloud Drive
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/directory')}>
              <Icon name="briefcase" size={13} style={{ marginRight: 6 }} /> Projects Directory
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Documents', value: docs.length, icon: 'fileText' as const, variant: 'brand' as const },
            { label: 'Storage Consumed', value: formattedTotalSize, icon: 'archive' as const, variant: 'brand' as const },
            { label: 'Active Projects with Files', value: uniqueProjects.length, icon: 'layers' as const, variant: 'brand' as const },
            { label: 'PDFs & Blueprints', value: docs.filter(d => d.file_type === 'pdf').length, icon: 'file' as const, variant: 'brand' as const },
          ].map(kpi => (
            <div
              key={kpi.label}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 16,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FeaturedIcon variant={kpi.variant} size="sm">
                  <Icon name={kpi.icon} size={13} />
                </FeaturedIcon>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {kpi.label}
                </span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filters and View Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 160 }}>
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={view === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('grid')}
              style={{ height: 32, fontSize: 12 }}
            >
              <Icon name="grid" size={12} style={{ marginRight: 6 }} /> Grid
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('table')}
              style={{ height: 32, fontSize: 12 }}
            >
              <Icon name="list" size={12} style={{ marginRight: 6 }} /> Table
            </Button>

            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
            </span>
          </div>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search documents by name or project…" />
        </div>

        {/* Content */}
        {loading ? (
          <SectionLoading />
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name="folder" size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              No Documents Found
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
              No project documents recorded matching your filters. Upload documents and attachments directly in any project's Files workspace.
            </p>
          </div>
        ) : view === 'grid' ? (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {paginate(filtered, docPage, docPageSize).visible.map(d => {
              const ext = d.file_type || d.name.split('.').pop() || '';
              const iconName = FILE_ICONS[ext.toLowerCase()] || 'file';

              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/projects/${d.project_id}/files`);
                    }
                  }}
                  onClick={() => navigate(`/projects/${d.project_id}/files`)}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 16,
                    cursor: 'pointer',
                    boxShadow: 'var(--card-shadow)',
                    transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = 'var(--elev)';
                    e.currentTarget.style.borderColor = 'var(--teal)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'var(--card-shadow)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = '';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FeaturedIcon variant="brand" size="md">
                      <Icon name={iconName as any} size={16} />
                    </FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        {ext.toUpperCase()} {d.size ? `· ${(d.size / 1024).toFixed(0)} KB` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.project_color, flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink2)', fontWeight: 600 }}>
                        {d.project_name}
                      </span>
                    </span>
                    {d.created_at && (
                      <span style={{ flexShrink: 0 }}>
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ListPagination total={filtered.length} page={docPage} pageSize={docPageSize} onPageChange={setDocPage} onPageSizeChange={setDocPageSize} noun="documents" />
          </>
        ) : (
          <>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  {['Document Name', 'Project', 'File Type', 'Size', 'Date Added', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginate(filtered, docPage, docPageSize).visible.map(d => {
                  const ext = d.file_type || d.name.split('.').pop() || '';
                  return (
                    <tr
                      key={d.id}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => navigate(`/projects/${d.project_id}/files`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>
                        {d.name}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.project_color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--ink)' }}>{d.project_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                        <Badge variant="gray">{ext.toUpperCase() || 'FILE'}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {d.size ? `${(d.size / 1024).toFixed(0)} KB` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ height: 28, fontSize: 11 }}
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/projects/${d.project_id}/files`);
                          }}
                        >
                          View in Project
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination total={filtered.length} page={docPage} pageSize={docPageSize} onPageChange={setDocPage} onPageSizeChange={setDocPageSize} noun="documents" />
          </>
        )}
      </div>
    </div>
  );
};
