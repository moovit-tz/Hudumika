import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { COUNTRIES, type SignDocumentDefinition, type SignGeneratedDocument, type SignDocumentType } from '@hudumika/types';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { LAWDEPOT_TEMPLATES, LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';
import { SaveAsTemplateModal } from './SaveAsTemplateModal.js';
import { AiDocumentGeneratorModal, type GeneratedDocumentResult } from './AiDocumentGeneratorModal.js';
import './SignCompose.css';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textHtml = (s: string) => s.split(/\n\n+/).map(p => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
const textOf = (html: string) => {
  const node = document.createElement('div');
  node.innerHTML = html.replace(/<\/(p|div|h[1-4]|li|tr)>/g, '\n');
  return node.textContent || '';
};

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
    html: `<h4>LIMITATION OF LIABILITY</h4><p>To the maximum extent permitted by applicable law, neither Party shall be liable to the other for any indirect, incidental, exemplary, special, or consequential damages. The aggregate liability of either Party arising out of or related to this Agreement shall not exceed the total fees paid or payable under this Agreement in the twelve (12) months preceding the claim.</p>`,
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
  {
    name: 'Payment Milestones & Invoicing',
    html: `<h4>PAYMENT TERMS & INVOICING</h4><p>All invoices issued pursuant to this Agreement are due and payable within fourteen (14) calendar days from receipt. Undisputed overdue amounts shall accrue interest at the statutory rate or 1.5% per month, whichever is lower, from the due date until paid in full.</p>`,
  },
];

const SIGNATURE_BLOCK_HTML = `
  <table style="width: 100%; margin-top: 36px; border-collapse: collapse; page-break-inside: avoid;">
    <tr>
      <td style="width: 48%; vertical-align: top; padding: 14px 16px; border: 1px dashed var(--border, #cbd5e1); background: var(--bg-subtle, #f8fafc); border-radius: 6px;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: var(--ink, #0f172a); text-transform: uppercase;">FOR AND ON BEHALF OF FIRST PARTY:</p>
        <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 600; color: var(--ink, #0f172a);">[Company / Individual Name]</p>
        <div style="border-bottom: 1.5px solid var(--ink, #0f172a); margin-bottom: 6px; height: 38px;"></div>
        <p style="margin: 0; font-size: 11px; color: var(--ink3, #64748b);">Authorized Signatory / Title / Date</p>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; vertical-align: top; padding: 14px 16px; border: 1px dashed var(--border, #cbd5e1); background: var(--bg-subtle, #f8fafc); border-radius: 6px;">
        <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: var(--ink, #0f172a); text-transform: uppercase;">FOR AND ON BEHALF OF SECOND PARTY:</p>
        <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 600; color: var(--ink, #0f172a);">[Counterparty / Client Name]</p>
        <div style="border-bottom: 1.5px solid var(--ink, #0f172a); margin-bottom: 6px; height: 38px;"></div>
        <p style="margin: 0; font-size: 11px; color: var(--ink3, #64748b);">Authorized Signatory / Title / Date</p>
      </td>
    </tr>
  </table>
`;

const MILESTONE_TABLE_HTML = `
  <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 11pt;">
    <thead>
      <tr style="background: var(--bg-subtle, #f1f5f9);">
        <th style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: left; font-weight: 600;">Milestone / Deliverable</th>
        <th style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: center; font-weight: 600; width: 140px;">Completion Date</th>
        <th style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: right; font-weight: 600; width: 140px;">Amount Due</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px;">Phase 1: Project Initiation & Workplan Approval</td>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: center;">Upon Execution</td>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: right;">$5,000.00</td>
      </tr>
      <tr>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px;">Phase 2: Intermediate Delivery & Acceptance Testing</td>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: center;">30 Days Post-Effective</td>
        <td style="border: 1px solid var(--border, #cbd5e1); padding: 9px 12px; text-align: right;">$10,000.00</td>
      </tr>
    </tbody>
  </table>
`;

const CODE_BLOCK_HTML = `
  <pre style="background: #0f172a; color: #38bdf8; padding: 12px 16px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; font-size: 10pt; overflow-x: auto; margin: 16px 0;"><code>// Technical Schedule & Parameter Specifications
{
  "contract_spec_version": "2.4",
  "sla_uptime_percent": 99.95,
  "data_retention_period_days": 365,
  "incident_response_target_hours": 2
}</code></pre><p></p>
`;

export function SignCompose() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state as {
    title?: string;
    body?: string;
    jurisdiction?: string;
    industry?: string;
    documentType?: SignDocumentType;
    language?: 'en' | 'sw' | 'zh';
  } | null;

  const [params, setParams] = useSearchParams();
  const draftId = params.get('draft');
  const [editing, setEditing] = useState(Boolean(draftId || initial?.body));
  const [title, setTitle] = useState(initial?.title || 'Hudumika Agreement');
  const [type, setType] = useState<SignDocumentType>(initial?.documentType || 'agreement');
  const [industry, setIndustry] = useState(initial?.industry || 'Business & services');
  const [jurisdiction, setJurisdiction] = useState(initial?.jurisdiction || 'Tanzania Mainland');
  const [language, setLanguage] = useState<string>(initial?.language || 'en');
  const [requirements, setRequirements] = useState('');
  const [html, setHtml] = useState(initial?.body ? textHtml(initial.body) : '');
  const [doc, setDoc] = useState<SignGeneratedDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);

  // Editor Typography & Styling state
  const [fontFamily, setFontFamily] = useState('Georgia, serif');
  const [fontSize, setFontSize] = useState('11.5pt');

  // Modals state
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // ContentEditable ref
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected Image for Resizer
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(240);

  // Document stats state
  const [stats, setStats] = useState({ words: 0, characters: 0, readingTime: 1 });

  const updateStats = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const characters = text.length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    setStats({ words, characters, readingTime });
  }, []);

  // Sync initial html to editor ref
  useEffect(() => {
    if (editorRef.current && editing) {
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
        updateStats();
      }
    }
  }, [editing]);

  // Load template or draft from query params
  useEffect(() => {
    const source = params.get('source');
    if (!source || draftId) return;
    let active = true;
    setBusy(true);
    apiFetch<{ company: { id: string; name: string; document_definition: SignDocumentDefinition }[] }>('/v1/sign/document-library')
      .then(library => {
        const item = library.company.find(t => t.id === source);
        if (!item?.document_definition.editor_html) {
          throw new Error('This template cannot be opened in the rich editor. Choose it from the template library.');
        }
        if (!active) return;
        setTitle(item.name);
        setHtml(item.document_definition.editor_html);
        if (editorRef.current) editorRef.current.innerHTML = item.document_definition.editor_html;
        setIndustry(item.document_definition.category);
        setType(item.document_definition.document_type || 'agreement');
        setLanguage(item.document_definition.language || 'en');
        setEditing(true);
        setDirty(true);
        updateStats();
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [params.get('source'), draftId]);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    setBusy(true);
    apiFetch<SignGeneratedDocument>(`/v1/sign/generated-documents/${draftId}`)
      .then(d => {
        if (!active) return;
        if (d.definition.jurisdiction_clauses) {
          navigate(`/sign/editor?mode=draft&draft=${d.id}`, { replace: true });
          return;
        }
        setDoc(d);
        setTitle(d.title);
        setJurisdiction(d.jurisdiction || 'Tanzania Mainland');
        setType(d.definition.document_type || 'agreement');
        setIndustry(d.definition.category);
        const nextHtml = d.definition.editor_html || textHtml(d.body);
        setHtml(nextHtml);
        if (editorRef.current) editorRef.current.innerHTML = nextHtml;
        setEditing(true);
        updateStats();
      })
      .catch(e => setError(e.message))
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [draftId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Track image selection inside editor for resizing
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        editor.querySelectorAll('img.rte-img-selected').forEach(el => el.classList.remove('rte-img-selected'));
        img.classList.add('rte-img-selected');
        setSelectedImg(img);
        const curW = img.offsetWidth || parseInt(img.style.width, 10) || 240;
        setImgWidth(curW);
      } else {
        if (!(e.target as HTMLElement)?.closest('.sign-compose-img-toolbar')) {
          editor.querySelectorAll('img.rte-img-selected').forEach(el => el.classList.remove('rte-img-selected'));
          setSelectedImg(null);
        }
      }
    };

    editor.addEventListener('click', handleClick);
    return () => editor.removeEventListener('click', handleClick);
  }, [editing]);

  function definition(): SignDocumentDefinition {
    const currentHtml = editorRef.current?.innerHTML || html;
    return {
      category: industry,
      document_type: type,
      jurisdictions: [],
      body: textOf(currentHtml).trim() || title,
      editor_html: currentHtml,
      questions: [],
      language: language as 'en' | 'sw' | 'zh',
    };
  }

  const handleEditorInput = () => {
    if (editorRef.current) {
      setHtml(editorRef.current.innerHTML);
    }
    setDirty(true);
    updateStats();
  };

  const exec = (command: string, value: string | undefined = undefined) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const insertHtmlAtCursor = (insertHtml: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel && sel.getRangeAt && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const el = document.createElement('div');
      el.innerHTML = insertHtml;
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
        editorRef.current.innerHTML += insertHtml;
      }
    }
    handleEditorInput();
  };

  const handleInsertLink = () => {
    const url = prompt('Enter link destination URL (https://...):', 'https://');
    if (!url || url === 'https://') return;
    const label = prompt('Enter display text for this link:', 'Attached Schedule / Agreement');
    insertHtmlAtCursor(`<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--teal, #0d9488); text-decoration: underline; font-weight: 500;">${label || url}</a>&nbsp;`);
  };

  const handleImagePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG or JPEG under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      insertHtmlAtCursor(`
        <div style="margin: 16px 0; text-align: center;">
          <img src="${dataUrl}" alt="${escape(file.name)}" style="max-width: 100%; max-height: 360px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
        </div><p></p>
      `);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const applyImageWidth = (w: number | '100%' | 'original') => {
    if (!selectedImg) return;
    if (typeof w === 'number') {
      selectedImg.style.width = `${w}px`;
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.setAttribute('width', String(w));
      setImgWidth(w);
    } else if (w === '100%') {
      selectedImg.style.width = '100%';
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.removeAttribute('width');
      setImgWidth(editorRef.current?.clientWidth || 700);
    } else {
      selectedImg.style.width = '';
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.height = 'auto';
      selectedImg.removeAttribute('width');
      setImgWidth(selectedImg.naturalWidth || 300);
    }
    handleEditorInput();
  };

  const applyImageAlign = (align: 'left' | 'center' | 'right') => {
    if (!selectedImg) return;
    if (align === 'left') {
      selectedImg.style.display = 'inline-block';
      selectedImg.style.marginLeft = '0';
      selectedImg.style.marginRight = 'auto';
    } else if (align === 'center') {
      selectedImg.style.display = 'block';
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = 'auto';
    } else if (align === 'right') {
      selectedImg.style.display = 'inline-block';
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = '0';
    }
    handleEditorInput();
  };

  const deleteSelectedImage = () => {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
    handleEditorInput();
  };

  async function start(ai: boolean) {
    setError('');
    setBusy(true);
    try {
      const result = ai
        ? await apiFetch<{ body: string }>('/v1/ai/document-draft', {
            method: 'POST',
            body: JSON.stringify({ title, type, industry, jurisdiction, language, requirements }),
          })
        : null;
      const initialContent = textHtml(result?.body || `${title}\n\n${requirements || 'Start writing your document here.'}`);
      setHtml(initialContent);
      if (editorRef.current) editorRef.current.innerHTML = initialContent;
      setEditing(true);
      setDirty(true);
      setNotice(ai ? 'AI draft ready. Review wording and facts before using it.' : '');
      updateStats();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function persist() {
    let current = doc;
    const currentHtml = editorRef.current?.innerHTML || html;
    if (!current) {
      current = await apiFetch<SignGeneratedDocument>('/v1/sign/generated-documents', {
        method: 'POST',
        body: JSON.stringify({ title, definition: definition() }),
      });
    }
    const saved = await apiFetch<SignGeneratedDocument>(`/v1/sign/generated-documents/${current.id}/content`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        html: currentHtml,
        jurisdiction,
        category: industry,
        document_type: type,
        language,
      }),
    });
    setDoc(saved);
    setHtml(saved.definition.editor_html || currentHtml);
    setDirty(false);
    setNotice('Document saved successfully.');
    if (!draftId) setParams({ mode: 'compose', draft: saved.id }, { replace: true });
    return saved;
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Multi-format export system
  async function exportFile(format: 'pdf' | 'word' | 'html' | 'txt' | 'json') {
    const saved = await persist();
    const currentHtml = editorRef.current?.innerHTML || saved.definition.editor_html || html;
    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Document';

    if (format === 'pdf') {
      const blob = await apiFetchBlob(`/v1/sign/generated-documents/${saved.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('PDF document downloaded.');
      return;
    }

    if (format === 'word') {
      const wordDocHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${escape(title)}</title>
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11.5pt; line-height: 1.6; color: #111827; margin: 40px; }
    h1, h2, h3, h4 { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #0f172a; margin-top: 18px; margin-bottom: 8px; }
    p { margin: 0 0 10px 0; text-align: justify; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; }
    .header-box { border-bottom: 2px solid #0d9488; padding-bottom: 8px; margin-bottom: 24px; font-size: 10pt; color: #64748b; }
    .footer-box { border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 36px; font-size: 9.5pt; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header-box">HUDUMIKA VERIFIED LEGAL ARCHIVE &bull; ${escape(jurisdiction.toUpperCase())} &bull; REF: ${saved.id.slice(0, 8).toUpperCase()}</div>
  <article>${currentHtml}</article>
  <div class="footer-box">HUDUMIKA LEGAL STUDIO &bull; OFFICIAL BINDING INSTRUMENT</div>
</body>
</html>`;
      const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}.doc`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Microsoft Word document (.doc) downloaded.');
      return;
    }

    if (format === 'html') {
      const standaloneHtml = `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <style>
    body { max-width: 840px; margin: 40px auto; padding: 0 24px; font-family: Georgia, serif; font-size: 11.5pt; line-height: 1.75; color: #0f172a; background: #ffffff; }
    h1, h2, h3, h4 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; }
    p { margin: 0 0 14px 0; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 9px 12px; }
    .legal-strip { border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 24px; font-size: 10px; font-weight: bold; color: #0d9488; letter-spacing: 0.08em; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="legal-strip">
    <span>HUDUMIKA VERIFIED LEGAL ARCHIVE</span>
    <span>${escape(jurisdiction.toUpperCase())}</span>
  </div>
  <article>${currentHtml}</article>
</body>
</html>`;
      const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}.html`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('HTML web document downloaded.');
      return;
    }

    if (format === 'txt') {
      const blob = new Blob([saved.body || textOf(currentHtml)], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Plain text document downloaded.');
      return;
    }

    if (format === 'json') {
      const jsonStr = JSON.stringify(
        {
          title: saved.title,
          document_id: saved.id,
          jurisdiction: saved.jurisdiction,
          language: saved.definition.language,
          document_type: saved.definition.document_type,
          category: saved.definition.category,
          metadata: {
            exported_at: new Date().toISOString(),
            platform: 'Hudumika eSign Studio',
            words: stats.words,
            characters: stats.characters,
          },
          definition: saved.definition,
        },
        null,
        2
      );
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedTitle}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Contract JSON schema exported.');
      return;
    }
  }

  const handleAiGeneratedResult = (res: GeneratedDocumentResult) => {
    setTitle(res.title);
    setIndustry(res.industry);
    setJurisdiction(res.jurisdiction);
    setType(res.documentType as SignDocumentType);
    const generatedHtml = textHtml(res.body);
    setHtml(generatedHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = generatedHtml;
    }
    setEditing(true);
    setDirty(true);
    setNotice('Document draft generated with Hudumika AI.');
    updateStats();
  };

  const valid = Boolean(title.trim() && jurisdiction.trim());

  return (
    <div className="sign-studio-root">
      {/* ── Hidden File Picker for Image Uploads ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={handleImagePickerChange}
      />

      {/* ── Top Executive Studio App Bar (Unified Header) ── */}
      <header className="sign-studio-app-bar">
        {/* Left Section: Back button, Inline Title, Jurisdiction Pill, Save status */}
        <div className="sign-studio-bar-left">
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              if (!dirty || (await showConfirm('Leave without saving your document changes?', { title: 'Unsaved changes', confirmLabel: 'Leave' }))) {
                navigate('/sign/editor');
              }
            }}
            title="Back to Document Hub"
            aria-label="Back to Document Hub"
            className="sign-back-btn"
          >
            <Icon name="arrowLeft" size={16} />
          </Button>

          <div className="sign-title-input-wrap">
            <Input
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="Untitled Document"
              className="sign-title-input"
              title="Click to edit document name"
            />
          </div>

          <Badge variant="outline" className="sign-jurisdiction-badge" title="Governing Jurisdiction">
            <Icon name="mapPin" size={12} className="sign-brand-icon" />
            <span>{jurisdiction}</span>
          </Badge>

          {dirty ? (
            <span className="sign-sync-pill sign-sync-pill--dirty" title="Unsaved changes in editor">
              <span className="sign-pulse-dot" /> <span className="hidden xl:inline">Unsaved edits</span>
            </span>
          ) : (
            <span className="sign-sync-pill sign-sync-pill--clean" title="All edits saved to cloud">
              <Icon name="check" size={12} /> <span className="hidden xl:inline">Saved</span>
            </span>
          )}
        </div>

        {/* Right Section: Responsive Action Buttons */}
        <div className="sign-studio-bar-right">
          {editing && (
            <>
              {/* Save Draft */}
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !valid}
                onClick={() => run(persist)}
                className="sign-action-btn"
                title="Save document draft"
              >
                <Icon name="save" size={14} />
                <span className="hidden sm:inline">{dirty ? 'Save Draft *' : 'Save Draft'}</span>
              </Button>

              {/* Save as Template */}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setSaveTemplateOpen(true)}
                className="sign-action-btn"
                title="Save as reusable company template"
              >
                <Icon name="copy" size={14} />
                <span className="hidden md:inline">Save as Template</span>
              </Button>

              {/* Multi-Format Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy} className="sign-action-btn" title="Export document">
                    <Icon name="download" size={14} />
                    <span className="hidden md:inline">Export ▾</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" style={{ width: 230 }}>
                  <DropdownMenuLabel>Export Document</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => run(() => exportFile('pdf'))}>
                    <Icon name="fileText" size={14} style={{ marginRight: 8, color: 'var(--teal)' }} />
                    <span>Adobe PDF (.pdf)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => exportFile('word'))}>
                    <Icon name="fileText" size={14} style={{ marginRight: 8 }} />
                    <span>Microsoft Word (.doc)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => exportFile('html'))}>
                    <Icon name="globe" size={14} style={{ marginRight: 8 }} />
                    <span>Web Page (.html)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => exportFile('txt'))}>
                    <Icon name="file" size={14} style={{ marginRight: 8 }} />
                    <span>Plain Text (.txt)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => exportFile('json'))}>
                    <Icon name="terminal" size={14} style={{ marginRight: 8 }} />
                    <span>Contract Schema (.json)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* AI Generator */}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setAiModalOpen(true)}
                className="sign-action-btn"
                title="AI Legal Document Generator"
              >
                <Icon name="sparkle" size={14} className="sign-brand-icon" />
                <span className="hidden lg:inline">AI Wizard</span>
              </Button>

              {/* KEY PRIMARY ACTION: Prepare for signing */}
              <Button
                size="sm"
                disabled={busy || !valid}
                onClick={() =>
                  run(async () => {
                    const saved = await persist();
                    navigate(`/sign/editor?document=${saved.id}`);
                  })
                }
                className="sign-btn-primary"
                title="Proceed to recipient and signature tag placement"
              >
                <Icon name="edit" size={14} />
                <span>Prepare for signing</span>
                <Icon name="arrowRight" size={13} className="hidden sm:inline" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── System Feedback Notice ── */}
      {error && (
        <div className="sign-studio-banner sign-studio-banner--error">
          <Icon name="alertCircle" size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="sign-banner-dismiss" aria-label="Dismiss error">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {notice && (
        <div className="sign-studio-banner sign-studio-banner--success">
          <Icon name="checkCircle" size={15} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="sign-banner-dismiss" aria-label="Dismiss notice">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {/* ── Document Docket Metadata Ribbon (Single Row) ── */}
      <div className="sign-docket-ribbon">
        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="layers" size={12} className="sign-brand-icon" /> Type:
          </span>
          <Select value={type} onValueChange={v => setType(v as SignDocumentType)}>
            <SelectTrigger className="sign-docket-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ['agreement', 'Agreement / Contract'],
                ['letter', 'Letter / Notice'],
                ['policy', 'Policy / Guidelines'],
                ['record', 'Record / Certificate'],
                ['form', 'Form / Checklist'],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="briefcase" size={12} className="sign-brand-icon" /> Industry:
          </span>
          <Combobox
            value={industry}
            onChange={setIndustry}
            options={[...new Set(['Business & services', ...LAWDEPOT_TEMPLATES.map(t => t.category), ...LAWDEPOT_CATEGORIES.map(c => c.name)])]
              .sort()
              .map(v => ({ value: v, label: v }))}
          />
        </div>

        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="mapPin" size={12} className="sign-brand-icon" /> Jurisdiction:
          </span>
          <Combobox
            value={jurisdiction}
            onChange={setJurisdiction}
            options={[
              { value: 'Tanzania Mainland', label: 'Tanzania Mainland' },
              { value: 'Zanzibar', label: 'Zanzibar' },
              { value: 'Kenya', label: 'Kenya' },
              { value: 'Uganda', label: 'Uganda' },
              { value: 'Rwanda', label: 'Rwanda' },
              { value: 'United Kingdom', label: 'United Kingdom' },
              { value: 'United States', label: 'United States' },
              ...COUNTRIES.map(c => ({ value: c.name, label: c.name })),
            ]}
          />
        </div>

        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="globe" size={12} className="sign-brand-icon" /> Language:
          </span>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="sign-docket-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="sw">Kiswahili</SelectItem>
              <SelectItem value="zh">简体中文</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Brief Intake Screen if not yet in Editing State ── */}
      {!editing ? (
        <div className="sign-brief-wrap">
          <Card className="sign-compose-brief-card">
            <div className="sign-brief-header">
              <div className="sign-brief-header-copy">
                <div className="sign-brief-badge">
                  <Icon name="wand" size={13} />
                  <span>AI Intake Assistant</span>
                </div>
                <h3>Describe what this document needs to achieve</h3>
                <p>State the parties involved, scope of work or property, key terms, dates, and covenants. Our AI provider will formulate the complete legal wording.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAiModalOpen(true)} className="sign-brief-guided-btn">
                <Icon name="sparkle" size={13} className="sign-brand-icon" />
                <span>Guided AI Wizard</span>
              </Button>
            </div>

            <label className="sign-brief-label">
              <span>Intake Requirements & Clauses Prompt</span>
              <Textarea
                rows={7}
                value={requirements}
                onChange={e => setRequirements(e.target.value)}
                placeholder="e.g. Agreement between Acme Corp and John Doe for Software Development Services. Project commences Nov 1st, 2026. Total fee is $15,000 paid in 2 milestones. Must include 3-year mutual confidentiality, full IP assignment, and 14 days termination notice."
                className="sign-brief-textarea"
              />
            </label>

            <div className="sign-brief-chips">
              <span className="sign-brief-chip-label">Suggestions:</span>
              {[
                'Mutual Non-Disclosure Agreement (3-year term)',
                'Independent Contractor Services Agreement',
                'Commercial Lease Agreement with 3-month deposit',
                'Shareholder Resolution for Bank Mandate',
              ].map(suggest => (
                <button
                  key={suggest}
                  type="button"
                  className="sign-brief-chip"
                  onClick={() => setRequirements(prev => (prev ? `${prev}\n${suggest}` : suggest))}
                >
                  + {suggest}
                </button>
              ))}
            </div>

            <div className="sign-brief-footer">
              <p className="sign-brief-note">
                <Icon name="shield" size={13} className="sign-brand-icon" /> Protected by tenant encryption safeguards.
              </p>
              <div className="sign-brief-actions">
                <Button variant="outline" disabled={busy || !valid} onClick={() => start(false)} className="sign-action-btn">
                  Open Blank Parchment Editor
                </Button>
                <Button
                  disabled={busy || !valid || requirements.trim().length < 8}
                  onClick={() => start(true)}
                  className="sign-btn-primary"
                >
                  <Icon name="sparkle" size={14} />
                  <span>{busy ? 'Formulating Legal Draft…' : 'Generate with AI'}</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* ── Full Studio Workbench with Top Ribbon & Centered Parchment Sheet ── */
        <div className="sign-studio-workbench">
          {/* ── Attached Formatting & Insert Ribbon ── */}
          <div className="sign-paper-toolbar">
            {/* Font Family Selector */}
            <div className="sign-toolbar-select-wrap">
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger style={{ width: 125, height: 28, fontSize: 12 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                  <SelectItem value="'Inter', -apple-system, sans-serif">Inter</SelectItem>
                  <SelectItem value="'Garamond', serif">Garamond</SelectItem>
                  <SelectItem value="'Courier New', monospace">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Font Size Selector */}
            <div className="sign-toolbar-select-wrap">
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger style={{ width: 80, height: 28, fontSize: 12 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10pt">10 pt</SelectItem>
                  <SelectItem value="11pt">11 pt</SelectItem>
                  <SelectItem value="11.5pt">11.5 pt</SelectItem>
                  <SelectItem value="12pt">12 pt</SelectItem>
                  <SelectItem value="14pt">14 pt</SelectItem>
                  <SelectItem value="16pt">16 pt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sign-toolbar-divider" />

            {/* Formatting Glyphs: B, I, U, S */}
            <button type="button" className="sign-fmt-btn" onClick={() => exec('bold')} title="Bold (Ctrl+B)">
              <strong>B</strong>
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('italic')} title="Italic (Ctrl+I)">
              <em style={{ fontFamily: 'serif' }}>I</em>
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('underline')} title="Underline (Ctrl+U)">
              <u>U</u>
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('strikeThrough')} title="Strikethrough">
              <s>S</s>
            </button>

            <div className="sign-toolbar-divider" />

            {/* Headings */}
            <button type="button" className="sign-fmt-btn" onClick={() => exec('formatBlock', 'h2')} title="Heading 2">
              H2
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('formatBlock', 'h3')} title="Heading 3">
              H3
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('formatBlock', 'p')} title="Paragraph (¶)">
              ¶
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('formatBlock', 'blockquote')} title="Blockquote">
              &ldquo;
            </button>

            <div className="sign-toolbar-divider" />

            {/* Alignment */}
            <button type="button" className="sign-fmt-btn" onClick={() => exec('justifyLeft')} title="Align Left">
              <Icon name="alignLeft" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('justifyCenter')} title="Align Center">
              <Icon name="alignCenter" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('justifyRight')} title="Align Right">
              <Icon name="alignRight" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('justifyFull')} title="Justify (Formal Legal)">
              <Icon name="menu" size={13} />
            </button>

            <div className="sign-toolbar-divider" />

            {/* Lists & Indents */}
            <button type="button" className="sign-fmt-btn" onClick={() => exec('insertUnorderedList')} title="Bullet List">
              <Icon name="list" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('insertOrderedList')} title="Numbered List (1., 2.)">
              <span style={{ fontSize: 11, fontWeight: 700 }}>1.</span>
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('outdent')} title="Decrease Indent">
              <Icon name="chevronLeft" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('indent')} title="Increase Indent">
              <Icon name="chevronRight" size={13} />
            </button>

            <div className="sign-toolbar-divider" />

            {/* Quick Insertion Tools */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="sign-fmt-btn sign-fmt-btn--wide" title="Insert Standard Legal Clauses">
                  <Icon name="fileText" size={13} />
                  <span>Clause ▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent style={{ width: 270 }}>
                <DropdownMenuLabel>Standard Legal Clauses</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {BOILERPLATE_CLAUSES.map(c => (
                  <DropdownMenuItem key={c.name} onSelect={() => insertHtmlAtCursor(c.html)}>
                    <Icon name="plus" size={13} style={{ marginRight: 6, color: 'var(--teal)' }} />
                    <span>{c.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              className="sign-fmt-btn"
              onClick={() => insertHtmlAtCursor(SIGNATURE_BLOCK_HTML)}
              title="Insert Dual Signature Block"
            >
              <Icon name="edit" size={13} />
            </button>

            <button
              type="button"
              className="sign-fmt-btn"
              onClick={() => insertHtmlAtCursor(MILESTONE_TABLE_HTML)}
              title="Insert Milestone Deliverables Table"
            >
              <Icon name="table" size={13} />
            </button>

            <button
              type="button"
              className="sign-fmt-btn"
              onClick={() => insertHtmlAtCursor(CODE_BLOCK_HTML)}
              title="Insert Code / Tech Spec Block"
            >
              <Icon name="terminal" size={13} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="sign-fmt-btn" title="Insert Variable Placeholder">
                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 11 }}>[V] ▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent style={{ width: 210 }}>
                <DropdownMenuLabel>Insert Merge Placeholder</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['party_one', 'party_two', 'effective_date', 'payment_amount', 'jurisdiction', 'delivery_date', 'notice_period'].map(token => (
                  <DropdownMenuItem
                    key={token}
                    onSelect={() =>
                      insertHtmlAtCursor(
                        `<span style="background: var(--teal-l, #ccfbf1); color: var(--teal, #0f766e); padding: 1px 6px; border-radius: 4px; font-family: monospace; font-weight: bold; border: 1px solid var(--teal-m, #99f6e4);">[${token.toUpperCase()}]</span>&nbsp;`
                      )
                    }
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>[{token.toUpperCase()}]</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button type="button" className="sign-fmt-btn" onClick={handleInsertLink} title="Insert Link">
              <Icon name="link" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => fileInputRef.current?.click()} title="Insert Image / Seal">
              <Icon name="image" size={13} />
            </button>

            <div className="sign-toolbar-divider" />

            {/* Undo / Redo / Clear formatting */}
            <button type="button" className="sign-fmt-btn" onClick={() => exec('undo')} title="Undo (Ctrl+Z)">
              <Icon name="arrowLeft" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('redo')} title="Redo (Ctrl+Y)">
              <Icon name="arrowRight" size={13} />
            </button>
            <button type="button" className="sign-fmt-btn" onClick={() => exec('removeFormat')} title="Clear Formatting">
              <Icon name="trash" size={13} />
            </button>
          </div>

          {/* ── Image Resizer & Alignment Floating Controls ── */}
          {selectedImg && (
            <div className="sign-compose-img-toolbar" onMouseDown={e => e.preventDefault()}>
              <div className="sign-img-label">
                <Icon name="image" size={13} />
                <span>Image Resize:</span>
              </div>
              <div className="sign-img-presets">
                <button
                  type="button"
                  className={`sign-img-btn ${imgWidth === 140 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(140)}
                >
                  Small
                </button>
                <button
                  type="button"
                  className={`sign-img-btn ${imgWidth === 260 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(260)}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className={`sign-img-btn ${imgWidth === 420 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(420)}
                >
                  Large
                </button>
                <button type="button" className="sign-img-btn" onClick={() => applyImageWidth('100%')}>
                  Fit Width
                </button>
                <button type="button" className="sign-img-btn" onClick={() => applyImageWidth('original')}>
                  Original
                </button>
              </div>
              <div className="sign-img-aligns">
                <button type="button" className="sign-img-btn" onClick={() => applyImageAlign('left')}>
                  Left
                </button>
                <button type="button" className="sign-img-btn" onClick={() => applyImageAlign('center')}>
                  Center
                </button>
                <button type="button" className="sign-img-btn" onClick={() => applyImageAlign('right')}>
                  Right
                </button>
              </div>
              <button
                type="button"
                className="sign-img-btn sign-img-btn--danger"
                onClick={deleteSelectedImage}
                title="Remove image"
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          )}

          {/* ── Desk Viewport with Centered Legal Parchment Sheet ── */}
          <div className="sign-paper-desk">
            <div className="sign-parchment-sheet">
              {/* Authentic Legal Header Strip */}
              <div className="sign-sheet-header">
                <div className="sign-sheet-header-brand">
                  <span className="sign-sheet-brand-dot" />
                  <span>HUDUMIKA VERIFIED LEGAL ARCHIVE</span>
                </div>
                <div className="sign-sheet-header-meta">
                  <span>{jurisdiction.toUpperCase()}</span>
                  <span>&bull;</span>
                  <span>REF: {doc?.id ? doc.id.slice(0, 8).toUpperCase() : 'LEGAL-DRAFT'}</span>
                </div>
              </div>

              {/* ContentEditable Parchment Body */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                className="sign-sheet-body"
                style={{
                  fontFamily,
                  fontSize,
                  lineHeight: 1.75,
                }}
                data-placeholder="Start writing or drafting your legal document…"
              />

              {/* Authentic Document Watermark Footer */}
              <div className="sign-sheet-footer">
                <span>HUDUMIKA LEGAL STUDIO &bull; OFFICIAL BINDING INSTRUMENT</span>
                <span>PAGE 1 OF 1</span>
              </div>
            </div>
          </div>

          {/* ── Studio Live Document Statistics Bar ── */}
          <footer className="sign-paper-stats-bar">
            <div className="sign-stats-left">
              <span>
                <strong>{stats.words}</strong> words
              </span>
              <span>&bull;</span>
              <span>
                <strong>{stats.characters}</strong> characters
              </span>
              <span>&bull;</span>
              <span>
                ~<strong>{stats.readingTime}</strong> min read
              </span>
              <span>&bull;</span>
              <span>
                Font: <strong>{fontFamily.split(',')[0].replace(/'/g, '')}</strong> ({fontSize})
              </span>
            </div>

            <div className="sign-stats-right">
              <span className="sign-stats-jurisdiction">
                <Icon name="mapPin" size={11} className="sign-brand-icon" /> {jurisdiction}
              </span>
              <span>&bull;</span>
              <span>
                Type: <strong style={{ textTransform: 'capitalize' }}>{type}</strong>
              </span>
            </div>
          </footer>
        </div>
      )}

      {/* ── Reusable Save As Template Modal ── */}
      <SaveAsTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        initialName={title}
        initialCategory={industry}
        initialDescription={requirements}
        onSave={async data => {
          await persist();
          await apiFetch('/v1/sign/document-library', {
            method: 'POST',
            body: JSON.stringify({
              name: data.name,
              description: data.description,
              document_definition: {
                category: data.category,
                document_type: data.documentType,
                jurisdictions: [jurisdiction],
                body: editorRef.current?.innerText || title,
                editor_html: editorRef.current?.innerHTML || html,
                questions: [],
                language: language as 'en' | 'sw' | 'zh',
              },
            }),
          });
          setNotice('Template published to your Company Template Library.');
        }}
      />

      {/* ── AI Document Generator Modal ── */}
      <AiDocumentGeneratorModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onDocumentCreated={handleAiGeneratedResult}
      />
    </div>
  );
}
