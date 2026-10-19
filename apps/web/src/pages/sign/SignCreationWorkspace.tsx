import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SignEditor } from './SignEditor.js';
import { LawDepotDocumentBuilder } from './LawDepotDocumentBuilder.js';
import { LawDepotCreationHub } from './LawDepotCreationHub.js';
import { SignTemplatePreview } from './SignTemplatePreview.js';
import { SignCompose } from './SignCompose.js';
import './LawDepot.css';

export function SignCreationRedirect({ mode }: { mode: 'author' | 'guided' | 'draft' | 'template' }) {
  const route = useParams();
  const [params] = useSearchParams();
  const target = new URLSearchParams(params);
  target.set('mode', mode === 'author' ? 'blank' : mode === 'template' ? 'builder' : mode);
  if (route.templateId) target.set('source', route.templateId);
  if (route.documentId) target.set('draft', route.documentId);
  return <Navigate replace to={`/sign/editor?${target}`} />;
}

export function SignCreationWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [viewOverride, setViewOverride] = useState<'editor' | 'builder' | 'studio' | 'hub' | null>(null);

  const mode = params.get('mode');
  const source = params.get('source') || params.get('template');
  const draft = params.get('draft');
  const documentForSigning = params.get('document');
  const fileId = params.get('fileId');


  // Direct signing canvas (e.g. uploaded file, envelope placement)
  if (documentForSigning || fileId || viewOverride === 'editor') {
    return <SignEditor />;
  }

  if (['studio','blank','compose','resume','author'].includes(mode || '')) return <SignCompose />;

  if (mode === 'preview') {
    return <SignTemplatePreview />;
  }

  // Guided Template Builder
  if (
    source ||
    draft ||
    mode === 'guided' ||
    mode === 'draft' ||
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

  // Default: Creation Hub with 3 Pathways (Templates, Upload, Blank/AI)
  return (
    <div className="lawdepot-studio" style={{ overflowY: 'auto' }}>
      <LawDepotCreationHub
        onSelectTemplate={(templateId) => {
          setParams({ source: templateId });
        }}
        onUploadFile={() => {
          setViewOverride('editor');
        }}
        onBrowseLibrary={() => {
          navigate('/sign/templates?creating=1');
        }}
        onWriteScratch={() => setParams({ mode: 'blank' })}
      />
    </div>
  );
}
