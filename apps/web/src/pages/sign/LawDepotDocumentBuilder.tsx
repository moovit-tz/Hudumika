import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  COUNTRIES,
  expandSignDocument,
  type SignDocumentLanguage,
  type SignGeneratedDocument,
  type SignDocumentDefinition,
} from '@hudumika/types';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { useLocale } from '../../hooks/useLocale.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Badge } from '../../components/ui/badge.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { LawDepotTemplateModal } from './LawDepotTemplateModal.js';
import { SaveAsTemplateModal } from './SaveAsTemplateModal.js';
import { LAWDEPOT_TEMPLATES } from './LawDepotTemplateCatalog.js';
import type { LibraryTemplate } from './SignDocumentLibrary.js';
import './LawDepot.css';

interface LawDepotDocumentBuilderProps {
  onBackToHub?: () => void;
  initialTemplateId?: string | null;
  initialDraftId?: string | null;
}

export function LawDepotDocumentBuilder({
  onBackToHub,
  initialTemplateId,
  initialDraftId,
}: LawDepotDocumentBuilderProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const locale = useLocale();

  const templateId = initialTemplateId || params.get('source') || params.get('template') || 'starter-sign-llc-operating-agreement';
  const documentId = initialDraftId || params.get('draft');

  const [language, setLanguage] = useState<SignDocumentLanguage>(
    ['en', 'sw', 'zh'].includes(locale.language) ? (locale.language as SignDocumentLanguage) : 'en'
  );
  const [template, setTemplate] = useState<LibraryTemplate | null>(null);
  const [document, setDocument] = useState<SignGeneratedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [jurisdiction, setJurisdiction] = useState('Tanzania Mainland');
  const [customJurisdiction, setCustomJurisdiction] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [step, setStep] = useState<number>(1);
  const [rawWordingMode, setRawWordingMode] = useState(false);
  const [customWording, setCustomWording] = useState('');

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (savedSuccess) {
      const t = setTimeout(() => setSavedSuccess(false), 3500);
      return () => clearTimeout(t);
    }
  }, [savedSuccess]);

  // Load template or existing document draft
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const fetcher = documentId
      ? apiFetch(`/v1/sign/generated-documents/${documentId}`)
      : apiFetch('/v1/sign/document-library');

    fetcher
      .then(result => {
        if (!active) return;
        if (documentId) {
          const doc = result as SignGeneratedDocument;
          setDocument(doc);
          setTemplate({
            id: doc.template_id || '',
            name: doc.template_name,
            description: null,
            document_definition: doc.definition,
          });
          setTitle(doc.title);
          setJurisdiction(doc.jurisdiction || 'Tanzania Mainland');
          setLanguage(doc.definition.language || 'en');
          setCustomJurisdiction(!COUNTRIES.some(c => c.name === doc.jurisdiction));
          setAnswers(doc.answers || {});
          setBody(doc.body || '');
          setCustomWording(doc.body || '');
        } else {
          const library = result;
          const allTemplates = [...(library?.company || []), ...(library?.starters || [])];
          let item = allTemplates.find((t: LibraryTemplate) => t.id === templateId);

          if (!item) {
            // Fallback match by slug or name
            const catalogItem = LAWDEPOT_TEMPLATES.find(
              t => t.id === templateId || t.starterId === templateId || t.name.toLowerCase() === templateId.toLowerCase()
            );
            if (catalogItem) {
              item = allTemplates.find((t: LibraryTemplate) => t.id === catalogItem.starterId || t.name === catalogItem.name);
            }
          }

          if (!item && allTemplates.length > 0) {
            item = allTemplates[0];
          }

          if (item) {
            setTemplate(item);
            setTitle(item.name);
            const reqLang = params.get('language') as SignDocumentLanguage;
            if (['en', 'sw', 'zh'].includes(reqLang)) setLanguage(reqLang);
            const reqJur = params.get('jurisdiction');
            if (reqJur) setJurisdiction(reqJur);

            // Populate sensible smart defaults for answers
            const defaults: Record<string, string> = {};
            if (item.name.includes('LLC Operating Agreement')) {
              defaults['party_one'] = 'Apex Horizon Ventures LLC (Formation State: Delaware / Tanzania)';
              defaults['party_two'] = 'Founding Member: Alexander Vance (100% Membership Interest)';
              defaults['effective_date'] = toDateOnlyString(new Date());
              defaults['transaction_details'] = 'Member-managed limited liability company operating agreement. Purpose: Commercial software and trade operations.';
              defaults['financial_details'] = 'Initial capital contribution: $10,000 USD. Annual distribution of net operating cash flows.';
              defaults['notice_days'] = '30';
              defaults['cure_days'] = '14';
              defaults['convenience_termination'] = 'no';
            }
            setAnswers(defaults);
          }
        }
      })
      .catch(err => {
        if (active) setError(err.message || 'Failed to load document');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [templateId, documentId]);

  const definition = template?.document_definition;

  // Real-time dynamic preview of legal text
  const renderedPreview = useMemo(() => {
    if (rawWordingMode && customWording) return customWording;
    if (body && step === 4) return body;
    if (!definition) return '';
    try {
      return expandSignDocument(definition, answers, jurisdiction, language, true);
    } catch {
      return definition.body || '';
    }
  }, [definition, answers, jurisdiction, language, body, step, rawWordingMode, customWording]);

  // Jurisdiction options
  const jurisdictionOptions = useMemo(() => {
    if (!definition) return COUNTRIES.map(c => ({ value: c.name, label: c.name }));
    if (definition.jurisdiction_clauses) {
      return Object.keys(definition.jurisdiction_clauses).map(v => ({ value: v, label: v }));
    }
    if (definition.jurisdictions?.length) {
      return definition.jurisdictions.map(v => ({ value: v, label: v }));
    }
    return [
      ...COUNTRIES.map(country => ({ value: country.name, label: country.name })),
      { value: '__custom', label: 'Other country / specific state' },
    ];
  }, [definition]);

  const guidance = definition?.jurisdiction_guidance?.find(item => item.jurisdiction === jurisdiction);

  function handleAnswerChange(key: string, value: string) {
    setAnswers(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSavedSuccess(false);
  }

  // Save draft document
  async function saveDraftDocument(): Promise<SignGeneratedDocument> {
    setBusy(true);
    setError('');
    try {
      const generatedText = rawWordingMode && customWording ? customWording : expandSignDocument(definition!, answers, jurisdiction, language);

      if (document) {
        const updated = await apiFetch(`/v1/sign/generated-documents/${document.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            jurisdiction,
            answers,
            language,
            body: generatedText,
          }),
        });
        setDocument(updated);
        setBody(updated.body);
        setDirty(false);
        setSavedSuccess(true);
        return updated;
      } else {
        let created: SignGeneratedDocument;
        if (template && !template.id.startsWith('starter-')) {
          created = await apiFetch(`/v1/sign/document-library/${template.id}/generate`, {
            method: 'POST',
            body: JSON.stringify({ title, jurisdiction, answers, language }),
          });
        } else {
          created = await apiFetch('/v1/sign/generated-documents', {
            method: 'POST',
            body: JSON.stringify({
              title,
              definition: {
                ...definition,
                language,
                jurisdictions: jurisdiction ? [jurisdiction] : [],
              },
            }),
          });
          // Update draft with answers
          created = await apiFetch(`/v1/sign/generated-documents/${created.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              title,
              jurisdiction,
              answers,
              language,
              body: generatedText,
            }),
          });
        }
        setDocument(created);
        setBody(created.body);
        setDirty(false);
        setSavedSuccess(true);
        // Update URL to draft
        setParams(prev => {
          const next = new URLSearchParams(prev);
          next.set('draft', created.id);
          next.delete('source');
          return next;
        }, { replace: true });
        return created;
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // Download PDF
  async function handleDownloadPdf() {
    setBusy(true);
    setError('');
    try {
      const doc = await saveDraftDocument();
      const blob = await apiFetchBlob(`/v1/sign/generated-documents/${doc.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${title || 'Document'}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Send directly for eSign (hands over to SignEditor)
  async function handleSendForESign() {
    setBusy(true);
    setError('');
    try {
      const doc = await saveDraftDocument();
      // Seamlessly transition into the envelope field placement view with ?document=${doc.id}
      navigate(`/sign/editor?document=${doc.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Save current wording as a reusable company template
  async function handleSaveAsTemplate(data: {
    name: string;
    description: string;
    category: string;
    documentType: string;
  }) {
    if (!definition) return;
    setBusy(true);
    setError('');
    try {
      const updatedDefinition: SignDocumentDefinition = {
        ...definition,
        category: data.category,
        document_type: data.documentType as any,
        body: rawWordingMode && customWording ? customWording : definition.body,
        questions: definition.questions,
      };

      await apiFetch('/v1/sign/document-library', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          document_definition: updatedDefinition,
        }),
      });
      setSavedSuccess(true);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // Handle template selection from LawDepot catalog modal
  function handleSelectTemplateFromModal(selectedId: string, selectedName: string) {
    if (dirty) {
      showConfirm('Switching templates will discard unsaved questionnaire changes for this document.', {
        title: 'Switch Template?',
        confirmLabel: 'Switch Template',
      }).then(confirmed => {
        if (!confirmed) return;
        setParams({ source: selectedId });
      });
    } else {
      setParams({ source: selectedId });
    }
  }

  if (loading) {
    return (
      <div className="lawdepot-studio" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <SectionLoading label="Opening Hudumika document studio…" />
      </div>
    );
  }

  return (
    <div className="lawdepot-studio">
      {/* ── Studio Header Bar ── */}
      <header className="lawdepot-studio-header">
        <div className="lawdepot-studio-header-left">
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              if (dirty) {
                const leave = await showConfirm('You have unsaved changes in this document. Leave anyway?', {
                  title: 'Leave Editor?',
                  confirmLabel: 'Leave',
                });
                if (!leave) return;
              }
              if (onBackToHub) onBackToHub();
              else navigate('/sign/editor');
            }}
            title="Back to Hub"
            aria-label="Back to Hub"
          >
            <Icon name="arrowLeft" size={16} />
          </Button>

          <Input
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Untitled Document"
            className="lawdepot-doc-title-input"
            title="Click to edit document name"
          />

          <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 text-xs font-semibold px-2.5 py-1" style={{ borderColor: 'var(--border)' }}>
            <Icon name="mapPin" size={12} style={{ color: 'var(--teal)' }} />
            <span>{jurisdiction || 'General Jurisdiction'}</span>
          </Badge>
        </div>

        {/* Right Header Actions */}
        <div className="lawdepot-studio-header-right">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const currentContent = rawWordingMode && customWording
                ? customWording
                : (definition ? expandSignDocument(definition, answers, jurisdiction, language) : body);
              navigate(`/sign/editor?mode=studio&title=${encodeURIComponent(title)}`, {
                state: {
                  title,
                  jurisdiction,
                  language,
                  industry: template?.document_definition?.category || 'Corporate & Business',
                  documentType: template?.document_definition?.document_type || 'agreement',
                  body: currentContent,
                },
              });
            }}
            className="gap-1.5 font-medium"
            title="Open in Full Text Studio with rich formatting, code, tables, images and multi-format exports"
          >
            <Icon name="edit" size={14} style={{ color: 'var(--teal)' }} />
            <span className="hidden md:inline">Full Text Editor</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={saveDraftDocument}
            disabled={busy}
            className="gap-1.5 font-medium"
            title="Save as Draft"
          >
            <Icon name="save" size={14} />
            <span className="hidden sm:inline">Save Draft</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setTemplateModalOpen(true)}
            title="Import Template"
            aria-label="Import Template"
          >
            <Icon name="layers" size={15} />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSaveTemplateModalOpen(true)}
            title="Save as Template"
            aria-label="Save as Template"
          >
            <Icon name="copy" size={15} />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleDownloadPdf}
            disabled={busy}
            title="Download PDF"
            aria-label="Download PDF"
          >
            <Icon name="download" size={15} />
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSendForESign}
            disabled={busy || !title.trim()}
            className="gap-1.5 font-bold whitespace-nowrap"
            title="Send for eSign"
          >
            <Icon name="edit" size={14} />
            <span>Send for eSign</span>
          </Button>
        </div>
      </header>

      {/* Error or Success notification banners */}
      {error && <Banner variant="error">{error}</Banner>}
      {savedSuccess && <Banner variant="success">Document progress successfully saved.</Banner>}

      {/* ── Split Workspace (LawDepot Flow) ── */}
      <div className="lawdepot-split-workspace">
        {/* Left Column: Questionnaire Wizard */}
        <div className="lawdepot-questionnaire-col">
          <div className="lawdepot-questionnaire-content">
            {/* Step 1: Location & Language */}
            {step === 1 && (
              <>
                <div className="lawdepot-step-hero">
                  <span className="lawdepot-step-hero-num">Step 1 of 4 · Setup</span>
                  <h2>Governing Jurisdiction &amp; Language</h2>
                  <p>Choose the governing legal jurisdiction and document language for this contract.</p>
                </div>

                <div className="lawdepot-form-group">
                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Document Title</span>
                    </label>
                    <Input
                      value={title}
                      onChange={e => {
                        setTitle(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="e.g., LLC Operating Agreement"
                    />
                    <span className="lawdepot-form-hint">The formal legal title that appears at the top of the instrument.</span>
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Governing Law / Jurisdiction</span>
                    </label>
                    <Combobox
                      options={jurisdictionOptions}
                      value={customJurisdiction ? '__custom' : jurisdiction}
                      onChange={val => {
                        setCustomJurisdiction(val === '__custom');
                        setJurisdiction(val === '__custom' ? '' : val);
                        setDirty(true);
                      }}
                      placeholder="Select country or jurisdiction"
                    />
                    {customJurisdiction && (
                      <Input
                        placeholder="Type country, province or state (e.g., Delaware, US)"
                        value={jurisdiction}
                        onChange={e => {
                          setJurisdiction(e.target.value);
                          setDirty(true);
                        }}
                        style={{ marginTop: 8 }}
                      />
                    )}
                    <span className="lawdepot-form-hint">Governs legal enforceability, dispute resolution, and statutory execution rules.</span>
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Document Language</span>
                    </label>
                    <Select value={language} onValueChange={v => setLanguage(v as SignDocumentLanguage)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (Official wording)</SelectItem>
                        <SelectItem value="sw">Kiswahili (Toleo la Kiswahili)</SelectItem>
                        <SelectItem value="zh">简体中文 (中文正式文本)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {guidance && (
                    <div className="lawdepot-tip-banner">
                      <Icon name="shield" size={18} />
                      <div>
                        <strong>Jurisdiction Execution Note:</strong>
                        <p style={{ margin: '4px 0 0 0' }}>{guidance.notes[language]}</p>
                      </div>
                    </div>
                  )}

                  <div className="lawdepot-tip-banner">
                    <Icon name="helpCircle" size={18} />
                    <div>
                      <strong>LawDepot Legal Tip:</strong>
                      <p style={{ margin: '4px 0 0 0' }}>
                        Entering your company jurisdiction ensures standard dispute escalation and governing law clauses are matched automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Parties & Details */}
            {step === 2 && (
              <>
                <div className="lawdepot-step-hero">
                  <span className="lawdepot-step-hero-num">Step 2 of 4 · Parties</span>
                  <h2>Parties &amp; Signatories</h2>
                  <p>Identify the primary entity and counterparties entering into this agreement.</p>
                </div>

                <div className="lawdepot-form-group">
                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Primary Party (Company / Principal / Disclosing Party) *</span>
                    </label>
                    <Textarea
                      rows={2}
                      value={answers['party_one'] || ''}
                      onChange={e => handleAnswerChange('party_one', e.target.value)}
                      placeholder="e.g., Apex Horizon Ventures LLC, a Delaware company, 1209 Orange St, Wilmington, DE"
                    />
                    <span className="lawdepot-form-hint">Full legal entity name, jurisdiction of formation, and registered address.</span>
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Second Party / Counterparty (Member / Recipient / Contractor)</span>
                    </label>
                    <Textarea
                      rows={2}
                      value={answers['party_two'] || ''}
                      onChange={e => handleAnswerChange('party_two', e.target.value)}
                      placeholder="e.g., Alexander Vance, 452 King Street, Seattle, WA"
                    />
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Effective / Agreement Date</span>
                    </label>
                    <DatePicker
                      date={parseDateOnly(answers['effective_date'])}
                      onChange={date => handleAnswerChange('effective_date', toDateOnlyString(date))}
                      placeholder="Select effective date"
                    />
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Fixed End Date (Optional)</span>
                    </label>
                    <DatePicker
                      date={parseDateOnly(answers['end_date'])}
                      onChange={date => handleAnswerChange('end_date', toDateOnlyString(date))}
                      placeholder="Leave blank if indefinite or continuing"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Key Decisions & Specific Terms */}
            {step === 3 && (
              <>
                <div className="lawdepot-step-hero">
                  <span className="lawdepot-step-hero-num">Step 3 of 4 · Decisions</span>
                  <h2>Transaction Terms &amp; Provisions</h2>
                  <p>Answer specific questions to customize the operative clauses for this transaction.</p>
                </div>

                <div className="lawdepot-form-group">
                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Scope, Purpose &amp; Operational Details *</span>
                    </label>
                    <Textarea
                      rows={3}
                      value={answers['transaction_details'] || ''}
                      onChange={e => handleAnswerChange('transaction_details', e.target.value)}
                      placeholder="Describe the primary objectives, services, or business activities covered..."
                    />
                    <span className="lawdepot-form-hint">Appears in Article I / Particulars as the agreed purpose.</span>
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Financial Terms, Capital &amp; Payment Consideration</span>
                    </label>
                    <Textarea
                      rows={3}
                      value={answers['financial_details'] || ''}
                      onChange={e => handleAnswerChange('financial_details', e.target.value)}
                      placeholder="e.g., Initial capital contribution: $10,000 USD / Monthly rent: $2,500 / Agreed fee schedule..."
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="lawdepot-form-item">
                      <label className="lawdepot-form-label">
                        <span>Notice Period (Days)</span>
                      </label>
                      <Input
                        type="number"
                        value={answers['notice_days'] || '30'}
                        onChange={e => handleAnswerChange('notice_days', e.target.value)}
                      />
                    </div>
                    <div className="lawdepot-form-item">
                      <label className="lawdepot-form-label">
                        <span>Breach Remedy (Days)</span>
                      </label>
                      <Input
                        type="number"
                        value={answers['cure_days'] || '14'}
                        onChange={e => handleAnswerChange('cure_days', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="lawdepot-form-item">
                    <label className="lawdepot-form-label">
                      <span>Termination for Convenience</span>
                    </label>
                    <Select
                      value={answers['convenience_termination'] || 'yes'}
                      onValueChange={v => handleAnswerChange('convenience_termination', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes, either party may terminate on written notice</SelectItem>
                        <SelectItem value="no">No, termination only for breach or agreed expiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Any custom questions defined in template */}
                  {definition?.questions?.filter(
                    q => !['party_one', 'party_two', 'effective_date', 'transaction_details', 'financial_details', 'notice_days', 'cure_days', 'convenience_termination', 'end_date'].includes(q.key)
                  ).map(question => (
                    <div className="lawdepot-form-item" key={question.key}>
                      <label className="lawdepot-form-label">
                        <span>{question.label} {question.required && '*'}</span>
                      </label>
                      {question.type === 'select' ? (
                        <Select
                          value={answers[question.key] || ''}
                          onValueChange={v => handleAnswerChange(question.key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose option" />
                          </SelectTrigger>
                          <SelectContent>
                            {question.options?.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.labels ? opt.labels[language] : opt.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : question.type === 'textarea' ? (
                        <Textarea
                          rows={3}
                          value={answers[question.key] || ''}
                          onChange={e => handleAnswerChange(question.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          type={question.type}
                          value={answers[question.key] || ''}
                          onChange={e => handleAnswerChange(question.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}

                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRawWordingMode(v => !v);
                        if (!customWording) setCustomWording(renderedPreview);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <Icon name="edit" size={14} />
                      <span>{rawWordingMode ? 'Return to Questionnaire Form' : 'Switch to Raw Clause / Wording Editor'}</span>
                    </Button>
                  </div>

                  {rawWordingMode && (
                    <div className="lawdepot-form-item">
                      <label className="lawdepot-form-label">
                        <span>Custom Document Clauses &amp; Wording</span>
                      </label>
                      <Textarea
                        rows={16}
                        value={customWording}
                        onChange={e => {
                          setCustomWording(e.target.value);
                          setDirty(true);
                        }}
                        style={{ fontFamily: 'monospace', fontSize: 13 }}
                      />
                      <span className="lawdepot-form-hint">
                        You can insert variables using <code>{'{{variable_name}}'}</code> syntax.
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Step 4: Review & Finalize */}
            {step === 4 && (
              <>
                <div className="lawdepot-step-hero">
                  <span className="lawdepot-step-hero-num">Step 4 of 4 · Finalize</span>
                  <h2>Review &amp; Execute</h2>
                  <p>Verify your document wording and choose your next action.</p>
                </div>

                <div className="lawdepot-form-group">
                  <div className="lawdepot-tip-banner">
                    <Icon name="check" size={18} />
                    <div>
                      <strong>Document Ready for Signing</strong>
                      <p style={{ margin: '4px 0 0 0' }}>
                        All essential transaction facts have been entered. You can now download a clean PDF or send it directly for eSignature.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Button
                      variant="default"
                      size="lg"
                      onClick={handleSendForESign}
                      disabled={busy}
                      className="gap-2 font-bold w-full"
                    >
                      <Icon name="edit" size={16} />
                      <span>Send for eSign (Place Signature Fields)</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleDownloadPdf}
                      disabled={busy}
                      className="gap-2 w-full"
                    >
                      <Icon name="download" size={16} />
                      <span>Download Clean PDF</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => setSaveTemplateModalOpen(true)}
                      className="gap-2 w-full"
                    >
                      <Icon name="copy" size={14} />
                      <span>Save as Company Template</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="default"
                      onClick={saveDraftDocument}
                      disabled={busy}
                      className="gap-2 w-full"
                    >
                      <Icon name="check" size={14} />
                      <span>Save Draft &amp; Continue Later</span>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Stepper Footer Controls */}
          <div className="lawdepot-questionnaire-footer">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 1}
              onClick={() => setStep(s => Math.max(1, s - 1))}
              className="gap-1"
            >
              <Icon name="arrowLeft" size={14} />
              <span>Back</span>
            </Button>

            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Step {step} of 4
            </span>

            {step < 4 ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => setStep(s => Math.min(4, s + 1))}
                className="gap-1 font-semibold"
              >
                <span>Continue</span>
                <Icon name="arrowRight" size={14} />
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleSendForESign}
                disabled={busy}
                className="gap-1 font-bold"
              >
                <span>Ready to Sign</span>
                <Icon name="arrowRight" size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Right Column: Live Legal Document Parchment Preview */}
        <div className="lawdepot-preview-col">
          {/* Preview Toolbar */}
          <div className="lawdepot-preview-toolbar">
            <div className="lawdepot-preview-lang-tabs">
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginRight: 8 }}>
                Live Preview:
              </span>
              <button
                type="button"
                className={`lawdepot-lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                English
              </button>
              <button
                type="button"
                className={`lawdepot-lang-btn ${language === 'sw' ? 'active' : ''}`}
                onClick={() => setLanguage('sw')}
              >
                Kiswahili
              </button>
              <button
                type="button"
                className={`lawdepot-lang-btn ${language === 'zh' ? 'active' : ''}`}
                onClick={() => setLanguage('zh')}
              >
                简体中文
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
                <Icon name="mapPin" size={12} style={{ color: 'var(--teal)' }} />
                <span>{jurisdiction || 'General Jurisdiction'}</span>
              </Badge>
            </div>
          </div>

          {/* Parchment Document Area */}
          <div className="lawdepot-preview-scroll-area">
            <div className="lawdepot-parchment-sheet">
              <div className="lawdepot-parchment-header">
                <h1 className="lawdepot-parchment-title">{title || template?.name || 'Legal Document'}</h1>
                <p className="lawdepot-parchment-subtitle">
                  Governing Law: {jurisdiction} · Document Date: {answers['effective_date'] || 'Dated on execution'}
                </p>
              </div>

              <div className="lawdepot-parchment-body">
                {renderedPreview}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Template Chooser Modal ── */}
      <LawDepotTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSelectTemplate={handleSelectTemplateFromModal}
        title="Import a LawDepot Template"
        subtitle="Select from 12 legal categories including LLC Operating Agreement, Leases, NDAs, and Service Contracts."
      />

      {/* ── Save as Template Modal ── */}
      <SaveAsTemplateModal
        open={saveTemplateModalOpen}
        onClose={() => setSaveTemplateModalOpen(false)}
        onSave={handleSaveAsTemplate}
        initialName={title || template?.name || 'Company Template'}
        initialCategory={definition?.category || 'Start & Manage a Business'}
        initialDescription={template?.description || ''}
      />
    </div>
  );
}
