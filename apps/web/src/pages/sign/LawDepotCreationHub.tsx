import React, { useState, useRef, useCallback } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { LawDepotTemplateModal } from './LawDepotTemplateModal.js';
import { saveDraft, draftKey, type SignDraft } from './draftStore.js';
import { LAWDEPOT_CATEGORIES, LAWDEPOT_TEMPLATES } from './LawDepotTemplateCatalog.js';
import './LawDepot.css';

interface LawDepotCreationHubProps {
  onSelectTemplate: (templateId: string, templateName?: string) => void;
  onUploadFile: () => void;
  onBrowseLibrary: () => void;
  onWriteScratch: () => void;
}

export function LawDepotCreationHub({
  onSelectTemplate,
  onUploadFile,
  onBrowseLibrary,
  onWriteScratch,
}: LawDepotCreationHubProps) {
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setUploadError('');
    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];

    const extension = file.name.split('.').pop()?.toLowerCase();
    const isExtensionValid = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'].includes(extension || '');

    if (!validTypes.includes(file.type) && !isExtensionValid) {
      setUploadError('Please select a valid document (PDF, Word DOCX/DOC, PNG, or JPG).');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File size exceeds the 50MB limit.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
        let dataUrl = e.target?.result as string;
        const wordDocument = ['doc','docx'].includes(extension || '');
        if (wordDocument) {
          const converted = await apiFetch<{document_data:string}>('/v1/sign/import-document', { method: 'POST', body: JSON.stringify({extension,data:dataUrl}) });
          dataUrl = converted.document_data;
        }
        const cleanTitle = file.name
          .replace(/\.[^./]+$/, '')
          .replace(/[_-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const draft: SignDraft = {
          title: cleanTitle || 'Untitled Document',
          message: '',
          orderMode: 'sequential',
          requireOtp: false,
          fileName: wordDocument ? file.name.replace(/\.[^.]+$/, '.pdf') : file.name,
          documentData: dataUrl,
          sourceFileId: null,
          recipients: [{ name: '', email: '', phone: '', role_label: 'Signer', sign_order: 1, user_id: null }],
          fields: [],
          pendingChangeSummary: { summary: 'Document uploaded for eSign' },
          savedAt: Date.now(),
        };

        await saveDraft(draftKey(undefined), draft);
        setUploading(false);
        onUploadFile();
        } catch(error) { setUploadError((error as Error).message); setUploading(false); }
      };

      reader.onerror = () => {
        setUploadError('Failed to read the selected file. Please try again.');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch {
      setUploadError('An error occurred while preparing the document for signing.');
      setUploading(false);
    }
  }, [onUploadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Top popular starters across Hudumika industries
  const featuredStarters = [
    {
      id: 'starter-sign-llc-operating-agreement',
      name: 'LLC Operating Agreement',
      category: 'Corporate & Business',
      desc: 'Member-managed or manager-managed limited liability company operating agreement with capital contributions.',
    },
    {
      id: 'starter-sign-residential-lease-agreement',
      name: 'Residential Lease Agreement',
      category: 'Rent or Lease',
      desc: 'Lease residential property, house or apartment with customizable deposit, rent terms and house rules.',
    },
    {
      id: 'starter-workspace-commercial-lease-agreement',
      name: 'Commercial Lease Agreement',
      category: 'Rent or Lease',
      desc: 'Commercial premises lease for offices, retail stores, or warehouses with maintenance and renewal terms.',
    },
    {
      id: 'starter-sign-non-disclosure-agreement',
      name: 'Non-Disclosure Agreement (NDA)',
      category: 'Protect Contracts & IP',
      desc: 'Mutual or unilateral confidentiality agreement safeguarding proprietary business secrets and data.',
    },
    {
      id: 'starter-cargotracker-freight-forwarding-agreement',
      name: 'Freight Forwarding Agreement',
      category: 'Logistics & Freight',
      desc: 'Standard multimodal freight forwarding contract covering cargo transport, customs clearance and liability.',
    },
    {
      id: 'starter-sign-independent-contractor-agreement',
      name: 'Independent Contractor Agreement',
      category: 'Sell or Provide Services',
      desc: 'Engage freelance professionals and service contractors with clear milestones, IP handover and payment terms.',
    },
  ];

  return (
    <div className="creation-hub">
      <PageHeader
        crumbs={['eSign', 'Create']}
        titlePlain="Create"
        titleEm="document"
        subtitle="Start from verified templates, upload an existing file for signing, or draft a blank document with AI assistance."
      />

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* ── 3 Primary Document Creation Pathways ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 18,
          marginBottom: 36,
        }}
      >
        {/* Pathway 1: Start from Templates */}
        <div
          className="creation-hub-pathway-card"
          onClick={onBrowseLibrary}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onBrowseLibrary();
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="creation-hub-pathway-top">
            <FeaturedIcon variant="brand" size="md" shape="circle">
              <Icon name="layers" size={20} />
            </FeaturedIcon>
            <Badge variant="brand">{LAWDEPOT_CATEGORIES.length} Industries</Badge>
          </div>
          <div className="creation-hub-pathway-copy">
            <h3>Start from Templates</h3>
            <p>
              Browse 80+ verified legal contracts covering Real Estate, Corporate &amp; LLC, Loans, Logistics, Trade, HR, and SaaS.
            </p>
          </div>
          <div className="creation-hub-pathway-action">
            <span>Browse Template Library</span>
            <Icon name="arrowRight" size={14} />
          </div>
        </div>

        {/* Pathway 2: Upload Existing File */}
        <div
          className={`creation-hub-pathway-card ${isDragging ? 'border-teal-500 bg-teal-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="creation-hub-pathway-top">
            <FeaturedIcon variant="brand" size="md" shape="circle">
              <Icon name={uploading ? 'refresh' : 'upload'} size={20} className={uploading ? 'animate-spin' : ''} />
            </FeaturedIcon>
            <Badge variant="gray">PDF, DOCX, Images</Badge>
          </div>
          <div className="creation-hub-pathway-copy">
            <h3>Upload Existing File</h3>
            <p>
              Drag &amp; drop an existing contract or prepared document to place signatures, dates, stamps, and dispatch for signing.
            </p>
            {uploadError && (
              <span style={{ color: 'var(--red)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                {uploadError}
              </span>
            )}
          </div>
          <div className="creation-hub-pathway-action">
            <span>{uploading ? 'Processing File…' : 'Upload & Open Editor'}</span>
            <Icon name="arrowRight" size={14} />
          </div>
        </div>

        {/* Pathway 3: Start from Blank / AI Assistant */}
        <div
          className="creation-hub-pathway-card"
          onClick={onWriteScratch}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onWriteScratch();
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="creation-hub-pathway-top">
            <FeaturedIcon variant="brand" size="md" shape="circle">
              <Icon name="sparkle" size={20} />
            </FeaturedIcon>
            <Badge variant="warning">AI-Assisted</Badge>
          </div>
          <div className="creation-hub-pathway-copy">
            <h3>Start Blank or with AI</h3>
            <p>
              Select your document type, industry, jurisdiction, and terms. The AI assistant drafts your agreement, or write freely in the Full Text Editor.
            </p>
          </div>
          <div className="creation-hub-pathway-action">
            <span>Set Up Document &amp; Draft</span>
            <Icon name="arrowRight" size={14} />
          </div>
        </div>
      </div>

      {/* ── Popular Starters Across Industries ── */}
      <div className="creation-hub-starters-section">
        <div className="creation-hub-starters-header">
          <h2>Popular Legal Templates Across Industries</h2>
          <Button variant="ghost" size="sm" onClick={onBrowseLibrary}>
            View all {LAWDEPOT_TEMPLATES.length} templates
            <Icon name="arrowRight" size={13} />
          </Button>
        </div>

        <div className="creation-hub-starters-grid">
          {featuredStarters.map(starter => (
            <button
              key={starter.id}
              type="button"
              className="creation-hub-starter-card"
              onClick={() => onSelectTemplate(starter.id, starter.name)}
            >
              <div className="creation-hub-starter-card-top">
                <span className="creation-hub-starter-category">{starter.category}</span>
                <Icon name="chevronRight" size={14} style={{ color: 'var(--ink3)' }} />
              </div>
              <h4>{starter.name}</h4>
              <p>{starter.desc}</p>
              <div className="creation-hub-starter-btn">
                <span>Start Template</span>
                <Icon name="arrowRight" size={12} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="creation-hub-footer" style={{ marginTop: 24 }}>
        <Button variant="outline" size="sm" onClick={onBrowseLibrary} className="gap-2">
          <Icon name="grid" size={14} />
          Open Document Library ({LAWDEPOT_CATEGORIES.length} Categories)
        </Button>
      </div>

      {/* Pathway 1: Template Chooser Modal with Two-Pane Industry Navigation */}
      <LawDepotTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelectTemplate={(templateId, name) => {
          setTemplateModalOpen(false);
          onSelectTemplate(templateId, name);
        }}
        title="Select a Verified Legal Template"
        subtitle={`Browse ${LAWDEPOT_CATEGORIES.length} industries covering business, real estate, logistics, trade, and legal agreements.`}
      />


    </div>
  );
}
