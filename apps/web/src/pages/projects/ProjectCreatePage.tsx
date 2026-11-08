import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDocumentAnalysis, ProjectDocumentBrief } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion.js';
import { apiFetch } from '../../lib/api.js';
import { ProjectCreateModal } from './ProjectCreateModal.js';
import './ProjectCreatePage.css';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ProjectDocumentReview({
  brief,
  onChange,
}: {
  brief: ProjectDocumentBrief;
  onChange?: (brief: ProjectDocumentBrief) => void;
}) {
  const metaKeys = [
    { key: 'client_name', label: 'Client', icon: 'building' as const },
    { key: 'tender_reference', label: 'Tender reference', icon: 'fileText' as const },
    { key: 'submission_deadline', label: 'Tender submission deadline', icon: 'calendar' as const },
    { key: 'submission_instructions', label: 'How to submit', icon: 'send' as const },
  ] as const;

  const listKeys = [
    { key: 'scope', label: 'Work to be done', variant: 'brand' as const, icon: 'briefcase' as const },
    { key: 'deliverables', label: 'Expected results', variant: 'success' as const, icon: 'checkCircle' as const },
    { key: 'requirements', label: 'Requirements and documents to provide', variant: 'info' as const, icon: 'clipboardList' as const },
    { key: 'risks', label: 'Points to review', variant: 'warning' as const, icon: 'alertTriangle' as const },
    { key: 'missing_information', label: 'Information still needed', variant: 'gray' as const, icon: 'info' as const },
  ] as const;

  return (
    <section className="pcp-section-card">
      <div className="pcp-section-header">
        <div className="pcp-section-header-left">
          <FeaturedIcon variant="brand" size="md">
            <Icon name="sparkle" size={18} />
          </FeaturedIcon>
          <div>
            <h2 className="pcp-section-title">Details from your documents</h2>
            <p className="pcp-section-subtitle">
              Review these suggestions against the originals. They are saved with your project.
            </p>
          </div>
        </div>
        <Badge variant="brand">
          {brief.sources?.length || 1} {brief.sources?.length === 1 ? 'Source' : 'Sources'}
        </Badge>
      </div>

      <div className="pcp-section-body">
        {brief.sources && brief.sources.length > 0 && (
          <div className="pcp-sources-wrap">
            <div className="pcp-sources-badges">
              {brief.sources.map(source => (
                <Badge key={source.id} variant="gray">
                  <Icon name="fileText" size={11} /> Source: {source.name}
                </Badge>
              ))}
            </div>
            {brief.sources.flatMap(source =>
              source.warnings.map((warning, index) => (
                <Alert key={`${source.id}-${index}`}>
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))
            )}
          </div>
        )}

        <dl className="pcp-review-grid">
          {metaKeys.map(({ key, label, icon }) =>
            (brief[key] || onChange) ? (
              <div key={key} className="pcp-review-block">
                <dt className="pcp-label pcp-label--muted">
                  <Icon name={icon} size={13} color="var(--teal)" /> {label}
                </dt>
                <dd className="pcp-review-dd">
                  {onChange ? (
                    <Textarea
                      aria-label={key.replaceAll('_', ' ')}
                      rows={2}
                      value={brief[key] || ''}
                      maxLength={
                        key === 'submission_instructions'
                          ? 3000
                          : key === 'submission_deadline'
                          ? 200
                          : 300
                      }
                      onChange={event =>
                        onChange({ ...brief, [key]: event.target.value || null })
                      }
                    />
                  ) : (
                    brief[key]
                  )}
                </dd>
              </div>
            ) : null
          )}
        </dl>

        <div className="pcp-review-grid">
          {listKeys.map(({ key, label, variant, icon }) =>
            (brief[key].length > 0 || onChange) ? (
              <div key={key} className="pcp-review-block">
                <div className="pcp-review-block-header">
                  <h3 className="pcp-label">
                    <Icon name={icon} size={13} color="var(--teal)" /> {label}
                  </h3>
                  <Badge variant={variant}>{brief[key].filter(Boolean).length}</Badge>
                </div>
                {onChange ? (
                  <Textarea
                    aria-label={key.replaceAll('_', ' ')}
                    rows={4}
                    value={brief[key].join('\n')}
                    onChange={event =>
                      onChange({ ...brief, [key]: event.target.value.split('\n') })
                    }
                  />
                ) : (
                  <ul className="pcp-review-list">
                    {brief[key].map((item, index) => (
                      <li key={index}>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null
          )}
        </div>

        {brief.evidence.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="evidence">
              <AccordionTrigger>
                <span className="pcp-evidence-trigger">
                  <Icon name="bookOpen" size={14} color="var(--teal)" />
                  View supporting passages ({brief.evidence.length})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pcp-evidence-items">
                  {brief.evidence.map((item, index) => (
                    <blockquote key={index} className="pcp-evidence-quote">
                      <p className="pcp-evidence-text">
                        "{item.quote}"
                      </p>
                      <p className="pcp-evidence-source">
                        {brief.sources?.find(source => source.id === item.file_id)?.name || item.file_id} · {item.locator}
                      </p>
                    </blockquote>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </section>
  );
}

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<ProjectDocumentAnalysis | null>(null);
  const [selected, setSelected] = useState<ProjectDocumentBrief | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [intakeOpen, setIntakeOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  async function finishCreation(id: string) {
    setCreatedId(id);
    const related = files.filter((_file, index) =>
      selected?.source_ids.includes(`file-${index + 1}`)
    );
    setPendingFiles(related);
    await attachOriginals(id, related);
  }

  async function attachOriginals(id: string, originals: File[]) {
    setAttaching(true);
    setError('');
    let remaining = originals;
    try {
      if (remaining.length) {
        const drives = await apiFetch('/v1/drives');
        const driveId = (Array.isArray(drives) ? drives : drives.data || []).find(
          (drive: { id: string; type: string }) => drive.type === 'business'
        )?.id;
        if (!driveId) {
          throw new Error(
            'The shared Business Records drive is unavailable. Open Cloud to check your workspace storage, then try again.'
          );
        }
        for (const file of originals) {
          const body = new FormData();
          body.append('file', file);
          await apiFetch(
            `/v1/files/upload?drive_id=${driveId}&entity_type=project&entity_id=${id}`,
            { method: 'POST', body }
          );
          remaining = remaining.slice(1);
          setPendingFiles(remaining);
        }
      }
      navigate(`/projects/${id}`);
    } catch (err: any) {
      setError(
        `Your project has been saved, but some original files could not be attached. ${
          err.message || 'Attach them in the project’s Files section.'
        }`
      );
    } finally {
      setAttaching(false);
    }
  }

  async function analyse() {
    setError('');
    if (!files.length) {
      setError('Choose at least one document.');
      return;
    }
    if (
      files.length > 8 ||
      files.some(file => file.size > 15 * 1024 * 1024) ||
      files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024
    ) {
      setError('Choose up to 8 files, no more than 15 MB each and 30 MB in total.');
      return;
    }
    setBusy(true);
    setAnalysis(null);
    setSelected(undefined);
    try {
      const body = new FormData();
      files.forEach(file => body.append('files', file));
      const result = (await apiFetch('/v1/project-os/document-analysis', {
        method: 'POST',
        body,
      })) as ProjectDocumentAnalysis;
      setAnalysis(result);
      if (result.candidates.length === 1) setSelected(result.candidates[0]);
    } catch (err: any) {
      setError(err.message || 'The documents could not be reviewed.');
    } finally {
      setBusy(false);
    }
  }

  function removeFileAt(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setAnalysis(null);
    setSelected(undefined);
    setError('');
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="pcp-page">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/projects' },
          { label: 'All Projects', to: '/projects/directory' },
          'New Project',
        ]}
        titlePlain="New"
        titleEm="project"
        subtitle="Start with your documents or enter the project details yourself."
        backTo="/projects/directory"
        backLabel="Back to projects"
      />

      {createdId ? (
        <Card>
          <CardHeader className="pcp-success-header">
            <FeaturedIcon variant="success" size="md">
              <Icon name="checkCircle" size={18} />
            </FeaturedIcon>
            <div>
              <CardTitle>Project created</CardTitle>
              <CardDescription>
                Finalizing document storage and initializing workspace views.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pcp-success-body">
            {attaching ? (
              <SectionLoading label="Attaching your original documents" />
            ) : (
              <>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {pendingFiles.length > 0 && (
                  <>
                    <p className="pcp-field-hint">Files still to attach:</p>
                    <ul className="pcp-file-list">
                      {pendingFiles.map((file, index) => (
                        <li key={index} className="pcp-file-chip">
                          <div className="pcp-file-chip-info">
                            <FeaturedIcon variant="warning" size="sm">
                              <Icon name="fileText" size={14} />
                            </FeaturedIcon>
                            <span className="pcp-file-chip-name">{file.name}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="pcp-success-actions">
                  {pendingFiles.length > 0 && (
                    <Button onClick={() => attachOriginals(createdId, pendingFiles)}>
                      <Icon name="refresh" size={14} /> Retry attachments
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate(`/projects/${createdId}`)}>
                    Open project <Icon name="arrowRight" size={14} />
                  </Button>
                </div>
                <p className="pcp-field-hint">
                  Keep this page open to retry. You can also attach missing files later in the project’s Files section.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top Intake Mode Selector Strip */}
          <div className="pcp-intake-strip">
            <button data-ui-native-button=""
              type="button"
              className={`pcp-intake-mode-card${intakeOpen ? ' is-active' : ''}`}
              onClick={() => setIntakeOpen(true)}
            >
              <FeaturedIcon variant="brand" size="md">
                <Icon name="sparkle" size={18} />
              </FeaturedIcon>
              <div className="pcp-intake-mode-body">
                <div className="pcp-intake-mode-top">
                  <span className="pcp-intake-mode-title">Start from project documents</span>
                  <Badge variant="brand">AI Extraction</Badge>
                </div>
                <span className="pcp-intake-mode-desc">
                  Upload a tender, contract, or scope of work to automatically extract project scope, deadlines, deliverables, and risks.
                </span>
              </div>
            </button>

            <button data-ui-native-button=""
              type="button"
              className={`pcp-intake-mode-card${!intakeOpen ? ' is-active' : ''}`}
              onClick={() => setIntakeOpen(false)}
            >
              <FeaturedIcon variant={!intakeOpen ? 'brand' : 'gray'} size="md">
                <Icon name="briefcase" size={18} />
              </FeaturedIcon>
              <div className="pcp-intake-mode-body">
                <div className="pcp-intake-mode-top">
                  <span className="pcp-intake-mode-title">Manual Charter & Blueprints</span>
                  <Badge variant={!intakeOpen ? 'brand' : 'gray'}>Direct Setup</Badge>
                </div>
                <span className="pcp-intake-mode-desc">
                  Configure project parameters, strategic portfolio links, budgets, and milestone dates directly or from an industry blueprint.
                </span>
              </div>
            </button>
          </div>

          {/* AI Document Intake Panel */}
          {intakeOpen && (
            <section className="pcp-doc-panel">
              <div className="pcp-doc-panel-header">
                <div className="pcp-doc-panel-title-group">
                  <FeaturedIcon variant="brand" size="md">
                    <Icon name="upload" size={18} />
                  </FeaturedIcon>
                  <div>
                    <h2 className="pcp-doc-panel-title">Start from project documents</h2>
                    <p className="pcp-doc-panel-sub">
                      Upload a tender, contract, scope of work or related annexes. Your workspace AI service will prepare details for you to review.
                    </p>
                  </div>
                </div>
                <div className="pcp-doc-panel-actions">
                  {files.length > 0 && (
                    <Badge variant="brand">
                      {files.length}/8 files · {formatFileSize(totalSize)}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIntakeOpen(false)}
                  >
                    Hide panel
                  </Button>
                </div>
              </div>

              <div className="pcp-doc-panel-body">
                <div
                  className={`pcp-dropzone${dragOver ? ' is-dragover' : ''}`}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    if (busy) return;
                    const dropped = Array.from(e.dataTransfer.files || []);
                    if (dropped.length) {
                      setFiles(dropped);
                      setAnalysis(null);
                      setSelected(undefined);
                      setError('');
                    }
                  }}
                >
                  <Input
                    id="project-documents"
                    aria-label="Project documents"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xlsx"
                    disabled={busy}
                    className="pcp-dropzone-input"
                    onChange={event => {
                      setFiles(Array.from(event.target.files || []));
                      setAnalysis(null);
                      setSelected(undefined);
                      setError('');
                    }}
                  />
                  <FeaturedIcon variant="brand" size="lg">
                    <Icon name="upload" size={22} />
                  </FeaturedIcon>
                  <label htmlFor="project-documents" className="pcp-dropzone-title">
                    <span>Choose project documents</span> or drag and drop files here
                  </label>
                  <p className="pcp-dropzone-hint">
                    PDF, Word and Excel · Up to 8 files · 15 MB per file. Upload related documents together. Unrelated tenders will be offered as separate projects.
                  </p>
                  <div className="pcp-dropzone-badges">
                    <Badge variant="brand">PDF</Badge>
                    <Badge variant="brand">DOC / DOCX</Badge>
                    <Badge variant="brand">XLSX</Badge>
                    <Badge variant="gray">Max 30 MB total</Badge>
                  </div>
                </div>

                {files.length > 0 && (
                  <ul className="pcp-file-list">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="pcp-file-chip">
                        <div className="pcp-file-chip-info">
                          <FeaturedIcon variant="brand" size="sm">
                            <Icon name="fileText" size={14} />
                          </FeaturedIcon>
                          <div className="pcp-file-chip-body">
                            <div className="pcp-file-chip-name">{file.name}</div>
                            <div className="pcp-file-chip-meta">{formatFileSize(file.size)}</div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy}
                          onClick={() => removeFileAt(index)}
                          aria-label={`Remove ${file.name}`}
                        >
                          <Icon name="close" size={13} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pcp-doc-actions-bar">
                  <div className="pcp-doc-actions-left">
                    <Button onClick={analyse} disabled={busy || !files.length}>
                      {busy ? <ButtonSpinner /> : <Icon name="sparkle" size={14} />}
                      {busy ? 'Reviewing documents…' : 'Prepare project details'}
                    </Button>
                    {files.length > 0 && !busy && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFiles([]);
                          setAnalysis(null);
                          setSelected(undefined);
                          setError('');
                        }}
                      >
                        Clear files
                      </Button>
                    )}
                  </div>
                  <span className="pcp-field-hint">
                    Originals are automatically linked to your workspace Business Records drive on creation.
                  </span>
                </div>

                {busy && (
                  <SectionLoading label="Reading your documents and preparing project suggestions" />
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {analysis && (
                  <div className="pcp-candidates-box">
                    {[
                      ...analysis.warnings,
                      ...analysis.sources.flatMap(source =>
                        source.warnings.map(warning => `${source.name}: ${warning}`)
                      ),
                    ].map((warning, index) => (
                      <Alert key={index}>
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}

                    <div className="pcp-candidates-header">
                      <p className="pcp-candidates-intro">
                        {analysis.candidates.length} project{' '}
                        {analysis.candidates.length === 1 ? 'suggestion' : 'suggestions'} found. Choose one to fill the form below.
                      </p>
                      <Badge variant="brand">AI Grounded</Badge>
                    </div>

                    <div className="pcp-candidates-grid">
                      {analysis.candidates.map((brief, index) => {
                        const isSelected = Boolean(
                          selected &&
                            selected.name === brief.name &&
                            selected.source_ids.join(',') === brief.source_ids.join(',')
                        );
                        return (
                          <button data-ui-native-button=""
                            key={index}
                            type="button"
                            className={`pcp-candidate-btn${isSelected ? ' is-selected' : ''}`}
                            onClick={() => setSelected(brief)}
                          >
                            <div className="pcp-candidate-top">
                              <span className="pcp-candidate-name">
                                {brief.name}
                              </span>
                              {isSelected && <Icon name="checkCircle" size={15} color="var(--teal)" />}
                            </div>
                            <div className="pcp-candidate-badges">
                              <Badge variant="brand">{brief.industry.replaceAll('_', ' ')}</Badge>
                              <Badge variant="gray">
                                {brief.source_ids.length} {brief.source_ids.length === 1 ? 'file' : 'files'}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <p className="pcp-candidates-footnote">
                      The review and related original files will be saved with the project. A workspace drive in Cloud is needed to store the originals.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {selected && <ProjectDocumentReview brief={selected} onChange={setSelected} />}

          <ProjectCreateModal
            isOpen
            standalone
            documentBrief={selected}
            onClose={() => navigate('/projects/directory')}
            onSuccess={finishCreation}
          />
        </>
      )}
    </div>
  );
}
