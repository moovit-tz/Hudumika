import React, { useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { SignEditor } from './SignEditor.js';
import { LawDepotDocumentBuilder } from './LawDepotDocumentBuilder.js';
import { LawDepotCreationHub } from './LawDepotCreationHub.js';
import { SignTemplatePreview } from './SignTemplatePreview.js';
import './LawDepot.css';

export function SignCreationRedirect({ mode }: { mode: 'author' | 'guided' | 'draft' | 'template' }) {
  const route = useParams();
  const [params] = useSearchParams();
  const target = new URLSearchParams(params);
  target.set('mode', mode === 'author' || mode === 'template' ? 'builder' : mode);
  if (route.templateId) target.set('source', route.templateId);
  if (route.documentId) target.set('draft', route.documentId);
  return <Navigate replace to={`/sign/editor?${target}`} />;
}

export function SignCreationWorkspace() {
  const [params, setParams] = useSearchParams();
  const [viewOverride, setViewOverride] = useState<'editor' | 'builder' | 'hub' | null>(null);

  const mode = params.get('mode');
  const source = params.get('source') || params.get('template');
  const draft = params.get('draft');
  const documentForSigning = params.get('document');
  const fileId = params.get('fileId');

  // If a generated document is ready for signing (from the builder), show the eSign placement canvas
  if (documentForSigning || fileId || viewOverride === 'editor') {
    return <SignEditor />;
  }

  // If viewing template preview
  if (mode === 'preview') {
    return <SignTemplatePreview />;
  }

  // If working on a template, draft, or guided builder
  if (
    source ||
    draft ||
    mode === 'guided' ||
    mode === 'draft' ||
    mode === 'author' ||
    mode === 'builder' ||
    mode === 'template' ||
    viewOverride === 'builder'
  ) {
    return (
      <LawDepotDocumentBuilder
        key={source || draft || 'new'}
        initialTemplateId={source}
        initialDraftId={draft}
        onBackToHub={() => {
          setViewOverride('hub');
          setParams({}, { replace: true });
        }}
      />
    );
  }

  // Otherwise, render the LawDepot Creation Hub (the unified starting point for documents, templates, or files)
  return (
    <div className="lawdepot-studio" style={{ overflowY: 'auto' }}>
      <LawDepotCreationHub
        onSelectTemplate={(templateId, templateName) => {
          setParams({ source: templateId });
        }}
        onUploadFile={() => {
          setViewOverride('editor');
        }}
        onStartBlankSigning={() => {
          setViewOverride('editor');
        }}
        onWriteScratch={() => {
          setParams({ mode: 'builder', source: 'starter-sign-llc-operating-agreement' });
        }}
      />
    </div>
  );
}
