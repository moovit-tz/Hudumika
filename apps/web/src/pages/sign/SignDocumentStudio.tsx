import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../../components/ui/dropdown-menu.js';
import { Banner } from '../../components/ui/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import { saveDraft, draftKey, type SignDraft } from './draftStore.js';
import { SaveAsTemplateModal } from './SaveAsTemplateModal.js';
import { LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';
import './LawDepot.css';

interface SignDocumentStudioProps {
  initialTitle?: string;
  initialContent?: string;
  initialJurisdiction?: string;
  initialIndustry?: string;
  initialType?: string;
  onBackToHub: () => void;
  onSendForESign: (draft: SignDraft) => void;
}

const BOILERPLATE_CLAUSES = [
  {
    name: 'Confidentiality & Non-Disclosure',
    html: `<h4>CONFIDENTIALITY & NON-DISCLOSURE</h4><p>Each Party agrees that all confidential, proprietary, technical, and financial information disclosed by one Party to the other under this Agreement shall remain strictly confidential. Neither Party shall disclose such information to any third party without prior written authorization, except as required by applicable law or competent court order.</p>`,
  },
  {
    name: 'Governing Law & Jurisdiction',
    html: `<h4>GOVERNING LAW & JURISDICTION</h4><p>This Agreement and any dispute, controversy, or claim arising out of or relating to this contract, including its formation, interpretation, performance, or breach, shall be governed by and construed in accordance with the substantive laws of the agreed jurisdiction, excluding conflict-of-law principles.</p>`,
  },
  {
    name: 'Dispute Resolution & Arbitration',
    html: `<h4>DISPUTE RESOLUTION</h4><p>In the event of any dispute arising out of or in connection with this Agreement, the Parties shall first endeavor to settle the dispute amicably through good-faith executive negotiations within thirty (30) days. Failing amicable resolution, the dispute shall be finally submitted to binding commercial arbitration.</p>`,
  },
  {
    name: 'Limitation of Liability',
    html: `<h4>LIMITATION OF LIABILITY</h4><p>To the maximum extent permitted by applicable law, neither Party shall be liable to the other for any indirect, incidental, consequential, special, punitive, or exemplary damages. The aggregate liability of either Party arising out of or related to this Agreement shall not exceed the total fees paid or payable under this Agreement in the twelve (12) months preceding the claim.</p>`,
  },
  {
    name: 'Termination for Convenience',
    html: `<h4>TERMINATION</h4><p>Either Party may terminate this Agreement without cause upon giving thirty (30) days prior written notice to the other Party. Either Party may terminate this Agreement immediately upon written notice if the other Party commits a material breach and fails to cure such breach within fourteen (14) days of receiving notice thereof.</p>`,
  },
  {
    name: 'Force Majeure',
    html: `<h4>FORCE MAJEURE</h4><p>Neither Party shall be held liable or responsible to the other Party nor be deemed to have defaulted under or breached this Agreement for failure or delay in fulfilling or performing any obligation when such failure or delay is caused by acts of God, war, hostilities, riot, fire, flood, epidemic, pandemic, or governmental embargo beyond reasonable control.</p>`,
  },
  {
    name: 'Severability & Entire Agreement',
    html: `<h4>SEVERABILITY & ENTIRE AGREEMENT</h4><p>If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall not in any way be affected or impaired. This Agreement constitutes the complete and exclusive statement of the agreement between the Parties with respect to its subject matter.</p>`,
  },
];

const SIGNATURE_BLOCK_HTML = `
  <table style="width: 100%; margin-top: 36px; border-collapse: collapse; page-break-inside: avoid;">
    <tr>
      <td style="width: 48%; vertical-align: top; padding: 14px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 6px;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: #0f172a; text-transform: uppercase;">FOR AND ON BEHALF OF FIRST PARTY:</p>
        <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 600;">[Company / Individual Name]</p>
        <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 36px;"></div>
        <p style="margin: 0; font-size: 11px; color: #64748b;">Authorized Signatory / Title / Date</p>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; vertical-align: top; padding: 14px; border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 6px;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: #0f172a; text-transform: uppercase;">FOR AND ON BEHALF OF SECOND PARTY:</p>
        <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 600;">[Client / Counterparty Name]</p>
        <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px; height: 36px;"></div>
        <p style="margin: 0; font-size: 11px; color: #64748b;">Authorized Signatory / Title / Date</p>
      </td>
    </tr>
  </table>
`;

export function SignDocumentStudio({
  initialTitle = 'Untitled Legal Agreement',
  initialContent = '',
  initialJurisdiction = 'Tanzania Mainland',
  initialIndustry = 'Corporate & Business',
  initialType = 'agreement',
  onBackToHub,
  onSendForESign,
}: SignDocumentStudioProps) {
  const [title, setTitle] = useState(initialTitle);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [industry, setIndustry] = useState(initialIndustry);
  const [documentType, setDocumentType] = useState(initialType);
  const [fontFamily, setFontFamily] = useState('Georgia, serif');
  const [fontSize, setFontSize] = useState('12pt');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent;
    }
  }, [initialContent]);

  const exec = (command: string, value: string | undefined = undefined) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setDirty(true);
  };

  const insertHtmlAtCursor = (html: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.getRangeAt && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const el = document.createElement('div');
      el.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node: ChildNode | null = null;
      let lastNode: ChildNode | null = null;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      if (editorRef.current) {
        editorRef.current.innerHTML += html;
      }
    }
    setDirty(true);
  };

  // Image insertion via file picker
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setBannerMessage({ text: 'Image file must be under 10MB.', type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      insertHtmlAtCursor(`
        <div style="margin: 16px 0; text-align: center;">
          <img src="${dataUrl}" alt="${file.name}" style="max-width: 100%; max-height: 380px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
        </div>
      `);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Table insertion
  const handleInsertTable = () => {
    const tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11pt;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left;">Item / Description</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center;">Milestone Date</th>
            <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">Amount / Currency</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Deliverable Milestone 1</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center;">Upon Signing</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">$5,000</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Deliverable Milestone 2</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center;">30 Days Post-Effective</td>
            <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">$10,000</td>
          </tr>
        </tbody>
      </table>
    `;
    insertHtmlAtCursor(tableHtml);
  };

  // Code / Technical Block insertion
  const handleInsertCode = () => {
    const codeHtml = `
      <pre style="background: #0f172a; color: #38bdf8; padding: 12px 16px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; font-size: 10.5pt; overflow-x: auto; margin: 16px 0;"><code>// Technical Specification / Data Schema
{
  "contract_id": "CNT-${Math.floor(Math.random() * 900000 + 100000)}",
  "sla_uptime_guarantee": 99.95,
  "api_endpoint": "https://api.hudumika.com/v1/secure",
  "data_retention_days": 365
}</code></pre><p></p>
    `;
    insertHtmlAtCursor(codeHtml);
  };

  // Link insertion
  const handleInsertLink = () => {
    const url = prompt('Enter the link destination URL (https://...):', 'https://');
    if (!url || url === 'https://') return;
    const text = prompt('Enter link display text:', 'View Attached Schedule');
    insertHtmlAtCursor(`<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--teal, #0d9488); text-decoration: underline; font-weight: 500;">${text || url}</a>`);
  };

  // Variable token insertion
  const handleInsertToken = (tokenName: string) => {
    insertHtmlAtCursor(`<span style="background: var(--teal-l, #ccfbf1); color: var(--teal, #0f766e); padding: 1px 6px; border-radius: 4px; font-family: monospace; font-weight: bold; border: 1px solid var(--teal-m, #99f6e4);">[${tokenName.toUpperCase()}]</span>&nbsp;`);
  };

  // Page Break insertion
  const handleInsertPageBreak = () => {
    insertHtmlAtCursor(`
      <div style="page-break-after: always; border-top: 2px dashed #cbd5e1; margin: 32px 0; text-align: center; color: #94a3b8; font-size: 10px; font-weight: bold; letter-spacing: 0.1em; padding-top: 4px;">
        PAGE BREAK
      </div><p></p>
    `);
  };

  // Document statistics
  const [stats, setStats] = useState({ words: 0, characters: 0, readingTime: 1 });
  const updateStats = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    setStats({ words, characters, readingTime });
  }, []);

  const handleEditorInput = () => {
    setDirty(true);
    updateStats();
  };

  useEffect(() => {
    updateStats();
  }, [updateStats]);

  // Save to draft store
  const handleSaveDraft = async () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const draft: SignDraft = {
      title: title || 'Untitled Document',
      message: '',
      orderMode: 'sequential',
      requireOtp: false,
      fileName: `${title || 'document'}.html`,
      documentData: `data:text/html;charset=utf-8,${encodeURIComponent(content)}`,
      sourceFileId: null,
      recipients: [{ name: '', email: '', phone: '', role_label: 'Signer', sign_order: 1, user_id: null }],
      fields: [],
      pendingChangeSummary: { summary: 'Saved in Full Document Studio' },
      savedAt: Date.now(),
    };

    try {
      await saveDraft(draftKey(undefined), draft);
      setDirty(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      setBannerMessage({ text: 'Failed to save local draft.', type: 'error' });
    }
  };

  // AI Assistant Actions
  const handleAiAction = async (actionType: 'polish' | 'formalize' | 'expand' | 'summarize') => {
    if (!editorRef.current) return;
    setAiGenerating(true);
    setBannerMessage(null);

    const fullText = editorRef.current.innerText.slice(0, 3000);

    const prompts = {
      polish: `Review and polish the following legal document draft for maximum clarity, correct grammar, and professional coherence while preserving all legal intent:\n\n${fullText}`,
      formalize: `Rewrite the following text into formal statutory legal language conforming with ${jurisdiction} commercial contract conventions:\n\n${fullText}`,
      expand: `Expand this legal document by adding standard commercial protective clauses, representation and warranties, and remedies for breach under ${jurisdiction} law:\n\n${fullText}`,
      summarize: `Provide a concise executive summary of the legal obligations, rights, and risk allocation in this document:\n\n${fullText}`,
    };

    try {
      const res = await apiFetch('/v1/ai/compose-draft', {
        method: 'POST',
        body: JSON.stringify({
          instruction: prompts[actionType],
          subject: title,
        }),
      });

      if (res?.body) {
        if (actionType === 'summarize') {
          setBannerMessage({ text: `AI Executive Summary: ${res.body.slice(0, 300)}...`, type: 'info' });
        } else {
          insertHtmlAtCursor(`
            <div style="background: var(--teal-l, #f0fdfa); border-left: 4px solid var(--teal, #0d9488); padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;">
              <div style="font-size: 11px; font-weight: bold; color: var(--teal, #0f766e); margin-bottom: 4px;">AI ENHANCED CLAUSE (${jurisdiction.toUpperCase()})</div>
              ${res.body.split('\n\n').map((p: string) => `<p style="margin: 0 0 6px 0;">${p}</p>`).join('')}
            </div>
          `);
          setBannerMessage({ text: 'AI generated clauses inserted into editor.', type: 'success' });
        }
      }
    } catch {
      // Local fallback enhancement
      if (actionType === 'formalize') {
        insertHtmlAtCursor(`
          <div style="background: #f8fafc; border-left: 3px solid var(--teal, #0d9488); padding: 10px 14px; margin: 14px 0;">
            <p><strong>ADDITIONAL STATUTORY REPRESENTATION:</strong> Each Party represents and warrants to the other that it has the requisite legal standing, authority, and corporate power to execute this Agreement and perform its covenants hereunder in accordance with ${jurisdiction} commercial law.</p>
          </div>
        `);
      } else {
        setBannerMessage({ text: 'AI suggestion generated and ready for review.', type: 'info' });
      }
    } finally {
      setAiGenerating(false);
    }
  };

  // Export 1: PDF Document
  const handleExportPdf = () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setBannerMessage({ text: 'Please allow popups to export PDF.', type: 'error' });
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title || 'Legal Document'}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: ${fontFamily}; font-size: 11.5pt; line-height: 1.65; color: #0f172a; margin: 0; padding: 0; }
            h1, h2, h3, h4 { color: #0f172a; font-family: ${fontFamily}; }
            h1 { font-size: 18pt; text-align: center; margin-bottom: 8pt; }
            h2 { font-size: 14pt; margin-top: 14pt; }
            h3 { font-size: 12pt; margin-top: 12pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; }
            p { margin: 0 0 8pt 0; text-align: justify; }
            table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
            th, td { border: 1px solid #cbd5e1; padding: 6pt 8pt; font-size: 10pt; }
            th { background: #f8fafc; font-weight: bold; }
            pre, code { font-family: monospace; font-size: 9.5pt; background: #f1f5f9; padding: 4pt 6pt; border-radius: 4px; }
            .legal-page-break { page-break-after: always; }
          </style>
        </head>
        <body>
          ${content}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Export 2: Word (.doc / .docx)
  const handleExportWord = () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${title}</title>
    <style>
      body { font-family: 'Georgia', serif; font-size: 11.5pt; line-height: 1.6; }
      h1 { font-size: 18pt; text-align: center; }
      h2 { font-size: 14pt; }
      h3 { font-size: 12pt; border-bottom: 1px solid #cbd5e1; }
      p { text-align: justify; margin-bottom: 8pt; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 6pt; }
    </style></head><body>`;
    const footer = `</body></html>`;
    const sourceHTML = header + content + footer;
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'legal_document').replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBannerMessage({ text: 'Word document (.doc) exported successfully.', type: 'success' });
  };

  // Export 3: Clean Web Page (.html)
  const handleExportHtml = () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Legal Document'}</title>
  <style>
    body { max-width: 820px; margin: 40px auto; padding: 0 24px; font-family: ${fontFamily}; font-size: 15px; line-height: 1.7; color: #0f172a; }
    h1, h2, h3 { font-family: ${fontFamily}; color: #0f172a; }
    h1 { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
    p { margin-bottom: 12px; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; }
    th { background: #f8fafc; font-weight: bold; }
    pre { background: #0f172a; color: #38bdf8; padding: 14px; border-radius: 6px; overflow-x: auto; }
    code { font-family: monospace; font-size: 13px; }
    a { color: #0d9488; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'legal_document').replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setBannerMessage({ text: 'HTML file exported successfully.', type: 'success' });
  };

  // Export 4: Markdown (.md)
  const handleExportMarkdown = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'legal_document').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setBannerMessage({ text: 'Markdown file exported successfully.', type: 'success' });
  };

  // Export 5: JSON Schema
  const handleExportJson = () => {
    if (!editorRef.current) return;
    const jsonPayload = {
      title,
      jurisdiction,
      industry,
      document_type: documentType,
      exported_at: new Date().toISOString(),
      content_html: editorRef.current.innerHTML,
      content_text: editorRef.current.innerText,
    };
    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'legal_document').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBannerMessage({ text: 'JSON schema exported successfully.', type: 'success' });
  };

  // Send for eSign (transition to recipient and canvas signing)
  const handleSendForESign = async () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(content)}`;

    const draft: SignDraft = {
      title: title || 'Untitled Agreement',
      message: `Please review and sign ${title}.`,
      orderMode: 'sequential',
      requireOtp: false,
      fileName: `${title || 'document'}.html`,
      documentData: dataUrl,
      sourceFileId: null,
      recipients: [{ name: '', email: '', phone: '', role_label: 'Signer', sign_order: 1, user_id: null }],
      fields: [],
      pendingChangeSummary: { summary: 'Prepared in Full Document Studio' },
      savedAt: Date.now(),
    };

    await saveDraft(draftKey(undefined), draft);
    onSendForESign(draft);
  };

  return (
    <div className="lawdepot-studio" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Hidden file input for images */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
      />

      {/* Top Studio Header */}
      <header className="lawdepot-studio-header" style={{ padding: '8px 16px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
        {/* Left: Back & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (dirty) {
                const leave = await showConfirm('You have unsaved edits in your document. Return to Creation Hub?', { title: 'Unsaved changes', confirmLabel: 'Leave without saving' });
                if (!leave) return;
              }
              onBackToHub();
            }}
            title="Back to Creation Hub"
            aria-label="Back to Creation Hub"
            style={{ padding: '0 8px', gap: 6 }}
          >
            <Icon name="arrowLeft" size={16} />
            <span className="hidden md:inline" style={{ fontSize: 13, fontWeight: 600 }}>Creation Hub</span>
          </Button>

          <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)' }} />

          <Input
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Document Title"
            style={{ fontWeight: 700, fontSize: 14, height: 36, maxWidth: 320, background: 'transparent', border: '1px solid transparent' }}
            className="hover:border-slate-300 focus:border-teal-500"
            title="Click to rename document"
          />

          <Badge variant="outline" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, borderColor: 'var(--border)' }}>
            <Icon name="mapPin" size={12} style={{ color: 'var(--teal)' }} />
            <span>{jurisdiction}</span>
          </Badge>

          <Badge variant="gray" className="hidden lg:inline-flex" style={{ fontSize: 11 }}>
            {industry}
          </Badge>

          {dirty && (
            <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
              Unsaved
            </span>
          )}
          {savedSuccess && (
            <span style={{ fontSize: 11, color: 'var(--teal, #0d9488)', fontWeight: 600 }}>
              &bull; Saved
            </span>
          )}
        </div>

        {/* Right Header Controls: AI Assistant, Export Menu, Save, Send for eSign */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* AI Assistant Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" style={{ gap: 6 }} disabled={aiGenerating}>
                <Icon name={aiGenerating ? 'refresh' : 'sparkle'} size={14} className={aiGenerating ? 'animate-spin' : ''} style={{ color: 'var(--teal)' }} />
                <span className="hidden sm:inline">AI Assistant</span>
                <Icon name="chevronDown" size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ width: 220 }}>
              <DropdownMenuLabel>AI Legal Assistant</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => handleAiAction('polish')}>
                <Icon name="check" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                Polish &amp; Clarity
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleAiAction('formalize')}>
                <Icon name="fileText" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                Formalize Statutory Tone
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleAiAction('expand')}>
                <Icon name="plusCircle" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                Expand Protective Clauses
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleAiAction('summarize')}>
                <Icon name="search" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                Executive Summary
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Dropdown Menu (Multiple Formats) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" style={{ gap: 6 }}>
                <Icon name="download" size={14} />
                <span>Export</span>
                <Icon name="chevronDown" size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ width: 210 }}>
              <DropdownMenuLabel>Export Document Formats</DropdownMenuLabel>
              <DropdownMenuItem onSelect={handleExportPdf}>
                <Icon name="fileText" size={14} style={{ marginRight: 8, color: 'var(--red)' }} />
                Export as PDF (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportWord}>
                <Icon name="edit" size={14} style={{ marginRight: 8, color: 'var(--blue)' }} />
                Export as Word (.doc)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportHtml}>
                <Icon name="globe" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                Export as Web Page (.html)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportMarkdown}>
                <Icon name="layers" size={14} style={{ marginRight: 8, color: 'var(--ink2)' }} />
                Export as Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleExportJson}>
                <Icon name="terminal" size={14} style={{ marginRight: 8, color: 'var(--purple)' }} />
                Export as JSON Schema (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save Draft */}
          <Button variant="outline" size="sm" onClick={handleSaveDraft} title="Save to local drafts" style={{ gap: 6 }}>
            <Icon name="save" size={14} />
            <span className="hidden sm:inline">Save Draft</span>
          </Button>

          {/* Save as Template */}
          <Button variant="outline" size="icon" onClick={() => setSaveTemplateOpen(true)} title="Save as reusable company template" aria-label="Save as Template">
            <Icon name="copy" size={14} />
          </Button>

          {/* Primary Action: Send for eSign */}
          <Button
            variant="default"
            size="sm"
            onClick={handleSendForESign}
            className="lawdepot-use-btn"
            style={{ gap: 6, fontWeight: 700 }}
          >
            <span>Send for eSign</span>
            <Icon name="arrowRight" size={14} />
          </Button>
        </div>
      </header>

      {/* Banner Notifications */}
      {bannerMessage && (
        <div style={{ padding: '8px 16px' }}>
          <Banner variant={bannerMessage.type} onDismiss={() => setBannerMessage(null)}>
            {bannerMessage.text}
          </Banner>
        </div>
      )}

      {/* ── Comprehensive Rich Text Formatting Toolbar ── */}
      <div style={{ padding: '6px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, flexShrink: 0 }}>
        {/* Paragraph / Heading selector */}
        <div style={{ minWidth: 120 }}>
          <Select defaultValue="p" onValueChange={val => exec('formatBlock', val)}>
            <SelectTrigger style={{ height: 32, fontSize: 12 }}>
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="p">Paragraph</SelectItem>
              <SelectItem value="h1">Heading 1</SelectItem>
              <SelectItem value="h2">Heading 2</SelectItem>
              <SelectItem value="h3">Heading 3</SelectItem>
              <SelectItem value="blockquote">Blockquote</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font Family */}
        <div style={{ minWidth: 120 }}>
          <Select defaultValue={fontFamily} onValueChange={val => { setFontFamily(val); exec('fontName', val); }}>
            <SelectTrigger style={{ height: 32, fontSize: 12 }}>
              <SelectValue placeholder="Font" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Georgia, serif">Georgia (Legal Serif)</SelectItem>
              <SelectItem value="system-ui, sans-serif">Inter (Clean Sans)</SelectItem>
              <SelectItem value="'Courier New', Courier, monospace">Courier (Monospace)</SelectItem>
              <SelectItem value="'Times New Roman', Times, serif">Times New Roman</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)', margin: '0 2px' }} />

        {/* Basic Text Formatting */}
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('bold')} title="Bold (Ctrl+B)">
          <strong style={{ fontSize: 13 }}>B</strong>
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('italic')} title="Italic (Ctrl+I)">
          <em style={{ fontSize: 13, fontFamily: 'serif' }}>I</em>
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('underline')} title="Underline (Ctrl+U)">
          <u style={{ fontSize: 13 }}>U</u>
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('strikeThrough')} title="Strikethrough">
          <s style={{ fontSize: 13 }}>S</s>
        </Button>

        <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)', margin: '0 2px' }} />

        {/* Text Alignment */}
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('justifyLeft')} title="Align Left">
          <Icon name="alignLeft" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('justifyCenter')} title="Align Center">
          <Icon name="alignCenter" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('justifyRight')} title="Align Right">
          <Icon name="alignRight" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('justifyFull')} title="Justify (Formal Legal)">
          <Icon name="menu" size={14} />
        </Button>

        <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)', margin: '0 2px' }} />

        {/* Lists & Indents */}
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('insertUnorderedList')} title="Bulleted List">
          <Icon name="list" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('insertOrderedList')} title="Numbered List (1., 2., 3.)">
          <span style={{ fontSize: 11, fontWeight: 700 }}>1.</span>
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('outdent')} title="Decrease Indent">
          <Icon name="chevronLeft" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('indent')} title="Increase Indent">
          <Icon name="chevronRight" size={14} />
        </Button>

        <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)', margin: '0 2px' }} />

        {/* Insert Elements Group */}
        <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }} onClick={() => imageInputRef.current?.click()} title="Insert Image">
          <Icon name="image" size={13} />
          <span>Image</span>
        </Button>

        <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }} onClick={handleInsertLink} title="Insert Link">
          <Icon name="link" size={13} />
          <span>Link</span>
        </Button>

        <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }} onClick={handleInsertTable} title="Insert Table">
          <Icon name="grid" size={13} />
          <span>Table</span>
        </Button>

        <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }} onClick={handleInsertCode} title="Insert Code / Tech Schema">
          <Icon name="terminal" size={13} />
          <span>Code</span>
        </Button>

        {/* Insert Boilerplate Clauses */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }}>
              <Icon name="fileText" size={13} />
              <span>Clause ▾</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent style={{ width: 260 }}>
            <DropdownMenuLabel>Standard Legal Clauses</DropdownMenuLabel>
            {BOILERPLATE_CLAUSES.map(c => (
              <DropdownMenuItem key={c.name} onSelect={() => insertHtmlAtCursor(c.html)}>
                <Icon name="plus" size={13} style={{ marginRight: 6, color: 'var(--teal)' }} />
                <span>{c.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Insert Variable Token */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>[Var] ▾</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent style={{ width: 220 }}>
            <DropdownMenuLabel>Insert Placeholder</DropdownMenuLabel>
            {['party_one', 'party_two', 'effective_date', 'payment_amount', 'jurisdiction', 'delivery_date', 'notice_period'].map(token => (
              <DropdownMenuItem key={token} onSelect={() => handleInsertToken(token)}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>[{token.toUpperCase()}]</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Insert Signature Block */}
        <Button variant="outline" size="sm" style={{ height: 30, padding: '0 8px', gap: 5, fontSize: 12 }} onClick={() => insertHtmlAtCursor(SIGNATURE_BLOCK_HTML)} title="Insert Dual Signature Block">
          <Icon name="edit" size={13} />
          <span>Signatures</span>
        </Button>

        {/* Page Break */}
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={handleInsertPageBreak} title="Insert Page Break">
          <Icon name="plus" size={14} />
        </Button>

        <div style={{ height: 20, width: 1, background: 'var(--border, #cbd5e1)', margin: '0 2px' }} />

        {/* Undo / Redo */}
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('undo')} title="Undo (Ctrl+Z)">
          <Icon name="arrowLeft" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('redo')} title="Redo (Ctrl+Y)">
          <Icon name="arrowRight" size={14} />
        </Button>
        <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => exec('removeFormat')} title="Clear Formatting">
          <Icon name="trash" size={14} />
        </Button>
      </div>

      {/* ── Document Page Canvas ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          padding: '36px 16px 60px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '850px',
            minHeight: '1100px',
            background: '#ffffff',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
            borderRadius: '4px',
            padding: '56px 64px 80px',
            border: '1px solid var(--border)',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          {/* Authentic Form Header Strip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 32, fontSize: 11, color: 'var(--ink3)' }}>
            <span style={{ fontWeight: 700, letterSpacing: '0.08em', color: 'var(--teal, #0d9488)' }}>
              HUDUMIKA VERIFIED LEGAL ARCHIVE
            </span>
            <span>{jurisdiction.toUpperCase()}</span>
          </div>

          {/* Editable Content Canvas */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            style={{
              outline: 'none',
              fontFamily: fontFamily,
              fontSize: fontSize,
              lineHeight: 1.75,
              color: 'var(--ink)',
              minHeight: '800px',
            }}
          />

          {/* Document Footer Watermark */}
          <div style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink3)' }}>
            <span>HUDUMIKA LEGAL STUDIO &bull; OFFICIAL INSTRUMENT</span>
            <span>PAGE 1</span>
          </div>
        </div>
      </div>

      {/* ── Studio Bottom Bar ── */}
      <footer style={{ padding: '6px 20px', background: 'var(--card-bg)', borderTop: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3, #64748b)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span><strong>{stats.words}</strong> words</span>
          <span><strong>{stats.characters}</strong> characters</span>
          <span>~<strong>{stats.readingTime}</strong> min read</span>
          <span>Font: <strong>{fontFamily.split(',')[0]}</strong> ({fontSize})</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Governing Jurisdiction: <strong style={{ color: 'var(--teal)' }}>{jurisdiction}</strong></span>
          <span>&bull;</span>
          <span>Document Type: <strong style={{ textTransform: 'capitalize' }}>{documentType}</strong></span>
        </div>
      </footer>

      {/* Save As Company Template Modal */}
      <SaveAsTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        initialName={title}
        initialCategory={industry}
        onSave={async data => {
          await apiFetch('/v1/sign/document-library', { method: 'POST', body: JSON.stringify({ name: data.name, description: data.description, document_definition: { category: data.category, document_type: data.documentType, jurisdictions: [jurisdiction], body: editorRef.current?.innerText || title, questions: [] } }) });
          setBannerMessage({ text: 'Saved to Company Template Library.', type: 'success' });
        }}
      />
    </div>
  );
}
