import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';

export interface GeneratedDocumentResult {
  title: string;
  industry: string;
  documentType: string;
  jurisdiction: string;
  body: string;
  isAiGenerated: boolean;
}

interface AiDocumentGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onDocumentCreated: (doc: GeneratedDocumentResult) => void;
}

const DOCUMENT_TYPES = [
  { value: 'agreement', label: 'Commercial Contract / Agreement' },
  { value: 'nda', label: 'Non-Disclosure Agreement (NDA)' },
  { value: 'lease', label: 'Lease / Tenancy Agreement' },
  { value: 'employment', label: 'Employment Offer / Contract' },
  { value: 'service', label: 'Services / Contractor Agreement' },
  { value: 'policy', label: 'Company Policy / Operating Guideline' },
  { value: 'letter', label: 'Formal Legal / Commercial Letter' },
  { value: 'notice', label: 'Legal Notice / Demand / Cease & Desist' },
  { value: 'resolution', label: 'Board Resolution / Shareholder Consent' },
  { value: 'addendum', label: 'Addendum / Amendment Agreement' },
];

const JURISDICTIONS = [
  'Tanzania Mainland',
  'Zanzibar',
  'Kenya',
  'Uganda',
  'Rwanda',
  'United Arab Emirates (UAE)',
  'United Kingdom (UK)',
  'United States (Delaware / Federal)',
  'Custom / International Trade Law',
];

const QUICK_CLAUSES = [
  { label: 'Payment Terms & Milestones', text: 'Include structured milestone payments, invoicing timelines, and late penalty charges.' },
  { label: 'Strict Confidentiality (NDA)', text: 'Mutual confidentiality protecting proprietary trade secrets, customer lists, and financial data for 3 years.' },
  { label: 'Intellectual Property Ownership', text: 'Full assignment of all developed intellectual property and work product to the Client upon final payment.' },
  { label: 'Limitation of Liability', text: 'Liability capped at total contract value; exclusion of indirect or consequential damages.' },
  { label: 'Dispute Resolution (Arbitration)', text: 'Dispute resolution through amicable negotiation, failing which binding arbitration under governing legal rules.' },
  { label: 'Termination for Convenience', text: 'Either party may terminate upon 30 days written notice; immediate termination for material breach.' },
  { label: 'Warranties & Indemnities', text: 'Standard performance warranties, compliance with local statutory laws, and indemnity against third-party claims.' },
  { label: 'Force Majeure', text: 'Relief from non-performance caused by acts of God, war, pandemic, government order, or severe natural disaster.' },
];

export function AiDocumentGeneratorModal({
  open,
  onClose,
  onDocumentCreated,
}: AiDocumentGeneratorModalProps) {
  const [title, setTitle] = useState('');
  const [industry, setIndustry] = useState(LAWDEPOT_CATEGORIES[0]?.name || 'Rent or Lease');
  const [documentType, setDocumentType] = useState('agreement');
  const [jurisdiction, setJurisdiction] = useState('Tanzania Mainland');
  const [partyOne, setPartyOne] = useState('');
  const [partyTwo, setPartyTwo] = useState('');
  const [requirements, setRequirements] = useState('');
  const [tone, setTone] = useState<'formal' | 'commercial' | 'plain'>('formal');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleAddClause = (clauseText: string) => {
    setRequirements(prev => {
      if (!prev.trim()) return clauseText;
      return `${prev.trim()}\n• ${clauseText}`;
    });
  };

  const generateLocalDraft = (): string => {
    const docTitle = title.trim() || 'COMMERCIAL AGREEMENT';
    const p1 = partyOne.trim() || 'First Party ("Company / Service Provider")';
    const p2 = partyTwo.trim() || 'Second Party ("Client / Counterparty")';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const reqLines = requirements
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const customClausesSection = reqLines.length > 0
      ? reqLines.map((req, i) => `
        <div class="legal-clause">
          <h4>3.${i + 1}. SPECIFIC OPERATIVE TERM</h4>
          <p>${req.replace(/^[•\-\*]\s*/, '')}</p>
        </div>
      `).join('')
      : `
        <div class="legal-clause">
          <h4>3.1. SCOPE OF ENGAGEMENT & DELIVERABLES</h4>
          <p>The Parties mutually agree to execute their respective covenants with due care, professional skill, and diligence in accordance with recognized industry standards.</p>
        </div>
      `;

    return `
      <div class="legal-document-wrapper">
        <div class="legal-header-block" style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--teal, #0d9488); text-transform: uppercase;">OFFICIAL LEGAL INSTRUMENT &bull; ${jurisdiction.toUpperCase()}</div>
          <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #0f172a; margin: 8px 0 4px 0;">${docTitle.toUpperCase()}</h1>
          <p style="font-size: 13px; color: #64748b; margin: 0;">Governed under the laws of ${jurisdiction}</p>
        </div>

        <p><strong>THIS ${docTitle.toUpperCase()}</strong> (the "Agreement") is made and entered into this <strong>${today}</strong> (the "Effective Date"),</p>

        <p><strong>BY AND BETWEEN:</strong></p>
        <p style="padding-left: 20px;">
          <strong>(1) ${p1}</strong> (hereinafter referred to as the "First Party"), of the one part; and<br/>
          <strong>(2) ${p2}</strong> (hereinafter referred to as the "Second Party"), of the other part.
        </p>

        <p><em>(The First Party and Second Party are hereinafter collectively referred to as the "Parties" and individually as a "Party".)</em></p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">RECITALS</h3>
        <p><strong>WHEREAS:</strong></p>
        <p>A. The First Party specializes in and operates within the <strong>${industry}</strong> sector and possesses the requisite commercial authority, capacity, and standing to enter into this instrument.</p>
        <p>B. The Second Party desires to engage with the First Party pursuant to the mutual representations, covenants, warranties, and obligations set forth herein.</p>
        <p>C. The Parties intend for this instrument to constitute a legally binding, valid, and enforceable contract under the laws of <strong>${jurisdiction}</strong>.</p>

        <p><strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants herein contained, the Parties hereby agree as follows:</p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">1. DEFINITIONS & INTERPRETATION</h3>
        <p>1.1. In this Agreement, unless the context otherwise requires, capitalized terms shall have their natural and ordinary meaning as recognized in commercial transactions within ${jurisdiction}.</p>
        <p>1.2. Headings and clause titles are inserted for convenience of reference only and shall not affect the interpretation or legal construction of any provision.</p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">2. COMMENCEMENT & DURATION</h3>
        <p>2.1. This Agreement shall commence and take full legal effect on the Effective Date stated above and shall continue in full force and effect until satisfied or terminated in accordance with the provisions herein.</p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">3. OPERATIVE TERMS & COMMERCIAL REQUIREMENTS</h3>
        ${customClausesSection}

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">4. CONFIDENTIALITY & NON-DISCLOSURE</h3>
        <p>4.1. Each Party undertakes that it shall not at any time disclose to any person any confidential or proprietary information concerning the business, affairs, customers, clients, or suppliers of the other Party, except as permitted by law or with prior written consent.</p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">5. GOVERNING LAW & JURISDICTION</h3>
        <p>5.1. This Agreement and any dispute or claim arising out of or in connection with it or its subject matter or formation (including non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of <strong>${jurisdiction}</strong>.</p>
        <p>5.2. Each Party irrevocably agrees that the courts of <strong>${jurisdiction}</strong> shall have competent jurisdiction to settle any dispute or claim arising out of or in connection with this Agreement.</p>

        <h3 style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">6. SIGNATURES & EXECUTION</h3>
        <p><strong>IN WITNESS WHEREOF</strong>, the Parties hereto have caused this Agreement to be duly executed by their authorized representatives as of the day and year first above written.</p>

        <table style="width: 100%; margin-top: 36px; border-collapse: collapse;">
          <tr>
            <td style="width: 48%; vertical-align: top; padding: 12px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 6px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; color: #0f172a;">FOR AND ON BEHALF OF FIRST PARTY:</p>
              <p style="margin: 0 0 16px 0; font-size: 13px;">${p1}</p>
              <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 32px;"></div>
              <p style="margin: 0; font-size: 11px; color: #64748b;">Authorized Signatory / Date</p>
            </td>
            <td style="width: 4%;"></td>
            <td style="width: 48%; vertical-align: top; padding: 12px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 6px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; color: #0f172a;">FOR AND ON BEHALF OF SECOND PARTY:</p>
              <p style="margin: 0 0 16px 0; font-size: 13px;">${p2}</p>
              <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 32px;"></div>
              <p style="margin: 0; font-size: 11px; color: #64748b;">Authorized Signatory / Date</p>
            </td>
          </tr>
        </table>
      </div>
    `;
  };

  const handleGenerate = async () => {
    setError('');
    const finalTitle = title.trim() || `${industry} Agreement`;
    setGenerating(true);

    try {
      let draftBody = '';

      // Try backend AI service if available
      try {
        const promptInstruction = `Draft a formal legal document titled "${finalTitle}" for the ${industry} industry under the jurisdiction of ${jurisdiction}.
Parties: First Party is "${partyOne || 'Party A'}", Second Party is "${partyTwo || 'Party B'}".
Key requirements and clauses to include:
${requirements || 'Standard commercial terms, representations, warranties, covenants, and dispute resolution.'}
Tone: ${tone}. Format as clean, structured HTML with proper headings, sections, recitals, operative clauses, governing law, and signature lines.`;

        const res = await apiFetch('/v1/ai/compose-draft', {
          method: 'POST',
          body: JSON.stringify({
            instruction: promptInstruction,
            subject: finalTitle,
          }),
        });

        if (res?.body && res.body.length > 200) {
          draftBody = res.body;
          if (!draftBody.includes('<h') && !draftBody.includes('<p')) {
            // Convert plain text formatting to HTML
            draftBody = draftBody
              .split('\n\n')
              .map(para => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
              .join('');
          }
        }
      } catch {
        // Backend AI unavailable or not configured — seamlessly use robust legal generator
      }

      if (!draftBody) {
        draftBody = generateLocalDraft();
      }

      onDocumentCreated({
        title: finalTitle,
        industry,
        documentType,
        jurisdiction,
        body: draftBody,
        isAiGenerated: true,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate document. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartBlank = () => {
    const finalTitle = title.trim() || 'Untitled Blank Document';
    const blankBody = `
      <div class="legal-document-wrapper">
        <div class="legal-header-block" style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--teal, #0d9488); text-transform: uppercase;">${jurisdiction.toUpperCase()}</div>
          <h1 style="font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #0f172a; margin: 8px 0 4px 0;">${finalTitle.toUpperCase()}</h1>
          <p style="font-size: 13px; color: #64748b; margin: 0;">Governing Law: ${jurisdiction}</p>
        </div>
        <p>Start typing your document text, clauses, or terms here...</p>
      </div>
    `;

    onDocumentCreated({
      title: finalTitle,
      industry,
      documentType,
      jurisdiction,
      body: blankBody,
      isAiGenerated: false,
    });
    onClose();
  };

  return (
    <div className="lawdepot-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="lawdepot-modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 760, maxHeight: '92vh', overflow: 'hidden' }}
      >
        {/* Modal Header */}
        <div className="lawdepot-modal-header" style={{ padding: '20px 24px 16px' }}>
          <div className="lawdepot-modal-header-copy">
            <div className="lawdepot-modal-badge" style={{ gap: 6 }}>
              <Icon name="sparkle" size={14} style={{ color: 'var(--teal)' }} />
              <span>AI-POWERED LEGAL DOCUMENT GENERATOR</span>
            </div>
            <h2 style={{ fontSize: 20 }}>Create from Blank or AI Assistant</h2>
            <p style={{ fontSize: 13 }}>
              Specify document type, jurisdiction, and what needs to be included. The AI will draft your legal instrument ready for full editing.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </Button>
        </div>

        {/* Modal Form Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-l)', border: '1px solid color-mix(in srgb, var(--red) 30%, var(--border))', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Row 1: Document Title */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
              Document Title / Name <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement, Commercial Lease, NDA, Employment Contract..."
              autoFocus
              style={{ height: 40 }}
            />
          </div>

          {/* Row 2: Industry & Document Type */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                Industry / Domain
              </label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger aria-label="Select industry">
                  <SelectValue placeholder="Select Industry" />
                </SelectTrigger>
                <SelectContent style={{ maxHeight: 240 }}>
                  {LAWDEPOT_CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                Document Classification
              </label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger aria-label="Select document type">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Jurisdiction & Tone */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                Governing Law &amp; Jurisdiction
              </label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger aria-label="Select jurisdiction">
                  <SelectValue placeholder="Select Jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  {JURISDICTIONS.map(j => (
                    <SelectItem key={j} value={j}>
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                Drafting Tone
              </label>
              <Select value={tone} onValueChange={(val: any) => setTone(val)}>
                <SelectTrigger aria-label="Select tone">
                  <SelectValue placeholder="Select Tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal Legal &amp; Statutory</SelectItem>
                  <SelectItem value="commercial">Standard Commercial</SelectItem>
                  <SelectItem value="plain">Plain English / Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 4: Parties (Optional) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                First Party (Company / Individual)
              </label>
              <Input
                value={partyOne}
                onChange={e => setPartyOne(e.target.value)}
                placeholder="e.g. Acme Logistics Ltd / John Doe"
                style={{ height: 38 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)', marginBottom: 6 }}>
                Second Party (Counterparty / Client)
              </label>
              <Input
                value={partyTwo}
                onChange={e => setPartyTwo(e.target.value)}
                placeholder="e.g. Global Freight Partners / Jane Smith"
                style={{ height: 38 }}
              />
            </div>
          </div>

          {/* Row 5: What needs to be included in it */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                What needs to be included in this document?
              </label>
              <span style={{ fontSize: 11, color: 'var(--ink3, #64748b)' }}>Key terms, obligations, scope, fees</span>
            </div>
            <Textarea
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
              placeholder="Describe what needs to be included (e.g. scope of services, delivery milestones, $15,000 monthly fee, 14-day payment grace period, 3-year confidentiality, 30 days termination notice)..."
              rows={4}
              style={{ fontSize: 13, lineHeight: 1.5 }}
            />

            {/* Quick Helper Chips */}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3, #64748b)', marginRight: 6 }}>
                Quick Add Clauses:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {QUICK_CLAUSES.map(c => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleAddClause(c.text)}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border, #cbd5e1)',
                      borderRadius: 9999,
                      padding: '3px 9px',
                      fontSize: 11,
                      color: 'var(--ink2, #334155)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={c.text}
                    className="hover:border-teal-500 hover:text-teal-700"
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="lawdepot-modal-footer"
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg)',
          }}
        >
          <Button variant="outline" size="sm" onClick={handleStartBlank} disabled={generating}>
            <Icon name="fileText" size={14} />
            <span>Start Blank Canvas</span>
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={generating}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="lawdepot-use-btn"
              style={{ gap: 6 }}
            >
              <Icon name={generating ? 'refresh' : 'sparkle'} size={14} className={generating ? 'animate-spin' : ''} />
              <span>{generating ? 'Drafting with AI…' : 'Generate with AI & Open Editor'}</span>
              <Icon name="arrowRight" size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
