import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectDocumentAnalysis, ProjectDocumentBrief } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion.js';
import { apiFetch } from '../../lib/api.js';
import { ProjectCreateModal } from './ProjectCreateModal.js';

export function ProjectDocumentReview({ brief, onChange }: { brief: ProjectDocumentBrief; onChange?: (brief: ProjectDocumentBrief) => void }) {
  return <Card>
    <CardHeader><CardTitle>Details from your documents</CardTitle><CardDescription>Review these suggestions against the originals. They are saved with your project.</CardDescription></CardHeader>
    <CardContent className="space-y-4 text-sm">
      {brief.sources?.map(source => <div key={source.id}><p className="break-words text-muted-foreground">Source: {source.name}</p>{source.warnings.map((warning, index) => <Alert key={index}><AlertDescription>{warning}</AlertDescription></Alert>)}</div>)}
      <dl className="grid gap-3 sm:grid-cols-2">
        {(['client_name', 'tender_reference', 'submission_deadline', 'submission_instructions'] as const).map(key => (brief[key] || onChange) && <div key={key} className="min-w-0"><dt className="text-muted-foreground">{{ client_name: 'Client', tender_reference: 'Tender reference', submission_deadline: 'Tender submission deadline', submission_instructions: 'How to submit' }[key]}</dt><dd className="whitespace-pre-wrap break-words">{onChange ? <Textarea aria-label={key.replaceAll('_', ' ')} value={brief[key] || ''} maxLength={key === 'submission_instructions' ? 3000 : key === 'submission_deadline' ? 200 : 300} onChange={event => onChange({ ...brief, [key]: event.target.value || null })} /> : brief[key]}</dd></div>)}
      </dl>
      {(['scope', 'deliverables', 'requirements', 'risks', 'missing_information'] as const).map(key => (brief[key].length > 0 || onChange) && <div key={key}><h3 className="font-semibold">{{ scope: 'Work to be done', deliverables: 'Expected results', requirements: 'Requirements and documents to provide', risks: 'Points to review', missing_information: 'Information still needed' }[key]}</h3>{onChange ? <Textarea aria-label={key.replaceAll('_', ' ')} value={brief[key].join('\n')} onChange={event => onChange({ ...brief, [key]: event.target.value.split('\n') })} /> : <ul className="mt-2 list-disc space-y-1 pl-5">{brief[key].map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul>}</div>)}
      <Accordion type="single" collapsible><AccordionItem value="evidence"><AccordionTrigger>View supporting passages</AccordionTrigger><AccordionContent><div className="space-y-3">{brief.evidence.map((item, index) => <blockquote key={index} className="border-l-2 pl-3"><p className="break-words">{item.quote}</p><p className="text-muted-foreground">{brief.sources?.find(source => source.id === item.file_id)?.name || item.file_id} · {item.locator}</p></blockquote>)}</div></AccordionContent></AccordionItem></Accordion>
    </CardContent>
  </Card>;
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

  async function finishCreation(id: string) {
    setCreatedId(id);
    const related = files.filter((_file, index) => selected?.source_ids.includes(`file-${index + 1}`));
    setPendingFiles(related);
    await attachOriginals(id, related);
  }

  async function attachOriginals(id: string, originals: File[]) {
    setAttaching(true); setError('');
    let remaining = originals;
    try {
      if (remaining.length) {
        const drives = await apiFetch('/v1/drives');
        const driveId = (Array.isArray(drives) ? drives : drives.data || []).find((drive: { id: string; type: string }) => drive.type === 'business')?.id;
        if (!driveId) throw new Error('The shared Business Records drive is unavailable. Open Cloud to check your workspace storage, then try again.');
        for (const file of originals) {
          const body = new FormData(); body.append('file', file);
          await apiFetch(`/v1/files/upload?drive_id=${driveId}&entity_type=project&entity_id=${id}`, { method: 'POST', body });
          remaining = remaining.slice(1);
          setPendingFiles(remaining);
        }
      }
      navigate(`/projects/${id}`);
    } catch (err: any) { setError(`Your project has been saved, but some original files could not be attached. ${err.message || 'Attach them in the project’s Files section.'}`); }
    finally { setAttaching(false); }
  }

  async function analyse() {
    setError('');
    if (!files.length) { setError('Choose at least one document.'); return; }
    if (files.length > 8 || files.some(file => file.size > 15 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) {
      setError('Choose up to 8 files, no more than 15 MB each and 30 MB in total.'); return;
    }
    setBusy(true); setAnalysis(null); setSelected(undefined);
    try {
      const body = new FormData(); files.forEach(file => body.append('files', file));
      const result = await apiFetch('/v1/project-os/document-analysis', { method: 'POST', body }) as ProjectDocumentAnalysis;
      setAnalysis(result);
      if (result.candidates.length === 1) setSelected(result.candidates[0]);
    } catch (err: any) { setError(err.message || 'The documents could not be reviewed.'); }
    finally { setBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <PageHeader crumbs={['Projects', 'Planning']} titlePlain="New" titleEm="project"
      subtitle="Start with your documents or enter the project details yourself."
      actions={<Button variant="outline" size="sm" onClick={() => navigate('/projects/directory')}>Back to projects</Button>} />
    {createdId ? <Card><CardHeader><CardTitle>Project created</CardTitle></CardHeader><CardContent className="space-y-3">{attaching ? <SectionLoading label="Attaching your original documents" /> : <><Alert><AlertDescription>{error}</AlertDescription></Alert>{pendingFiles.length > 0 && <><p className="text-sm text-muted-foreground">Files still to attach:</p><ul className="text-sm space-y-1">{pendingFiles.map((file, index) => <li key={index} className="break-words">{file.name}</li>)}</ul></>}<div className="flex flex-wrap gap-2">{pendingFiles.length > 0 && <Button onClick={() => attachOriginals(createdId, pendingFiles)}>Retry attachments</Button>}<Button variant="outline" onClick={() => navigate(`/projects/${createdId}`)}>Open project</Button></div><p className="text-sm text-muted-foreground">Keep this page open to retry. You can also attach missing files later in the project’s Files section.</p></>}</CardContent></Card> : <>
    <Card>
      <CardHeader><CardTitle>Start from project documents</CardTitle><CardDescription>Upload a tender, contract, scope of work or related annexes. Your workspace AI service will prepare details for you to review.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="project-documents" className="text-sm font-medium">Project documents</label>
        <Input id="project-documents" type="file" multiple accept=".pdf,.doc,.docx,.xlsx" disabled={busy}
          onChange={event => { setFiles(Array.from(event.target.files || [])); setAnalysis(null); setSelected(undefined); setError(''); }} />
        <p className="text-sm text-muted-foreground">PDF, Word and Excel · Up to 8 files · 15 MB per file. Upload related documents together. Unrelated tenders will be offered as separate projects.</p>
        {files.length > 0 && <ul className="text-sm space-y-1">{files.map((file, index) => <li key={index} className="break-words">{file.name}</li>)}</ul>}
        <Button onClick={analyse} disabled={busy || !files.length}>{busy ? 'Reviewing documents…' : 'Prepare project details'}</Button>
        {busy && <SectionLoading label="Reading your documents and preparing project suggestions" />}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {analysis && <>
          {[...analysis.warnings, ...analysis.sources.flatMap(source => source.warnings.map(warning => `${source.name}: ${warning}`))].map((warning, index) => <Alert key={index}><AlertDescription>{warning}</AlertDescription></Alert>)}
          <p className="text-sm">{analysis.candidates.length} project {analysis.candidates.length === 1 ? 'suggestion' : 'suggestions'} found. Choose one to fill the form below.</p>
          <div className="flex flex-wrap gap-2">{analysis.candidates.map((brief, index) => <Button key={index} variant={selected && selected.name === brief.name && selected.source_ids.join(',') === brief.source_ids.join(',') ? 'default' : 'outline'} className="h-auto whitespace-normal text-left" onClick={() => setSelected(brief)}>{brief.name}</Button>)}</div>
          <p className="text-sm text-muted-foreground">The review and related original files will be saved with the project. A workspace drive in Cloud is needed to store the originals.</p>
        </>}
      </CardContent>
    </Card>
    {selected && <ProjectDocumentReview brief={selected} onChange={setSelected} />}
    <ProjectCreateModal isOpen standalone documentBrief={selected} onClose={() => navigate('/projects/directory')} onSuccess={finishCreation} />
    </>}
  </div>;
}
