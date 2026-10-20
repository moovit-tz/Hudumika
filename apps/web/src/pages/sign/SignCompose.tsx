import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { COUNTRIES, type SignDocumentDefinition, type SignGeneratedDocument, type SignDocumentType } from '@hudumika/types';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Card } from '../../components/ui/card.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog.js';
import { LAWDEPOT_TEMPLATES, LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';
import { SaveAsTemplateModal } from './SaveAsTemplateModal.js';
import { AiDocumentGeneratorModal, type GeneratedDocumentResult } from './AiDocumentGeneratorModal.js';
import './SignCompose.css';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function downloadDocument(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
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

const PAGE_FORMATS = {
  a4:        { label: 'A4',        w: 210,    h: 297,   desc: '210 × 297 mm' },
  letter:    { label: 'US Letter', w: 215.9,  h: 279.4, desc: '8.5 × 11 in' },
  legal:     { label: 'US Legal',  w: 215.9,  h: 355.6, desc: '8.5 × 14 in' },
  a3:        { label: 'A3',        w: 297,    h: 420,   desc: '297 × 420 mm' },
  a5:        { label: 'A5',        w: 148,    h: 210,   desc: '148 × 210 mm' },
  b5:        { label: 'B5',        w: 176,    h: 250,   desc: '176 × 250 mm' },
  executive: { label: 'Executive', w: 184.15, h: 266.7, desc: '7.25 × 10.5 in' },
  tabloid:   { label: 'Tabloid',   w: 279.4,  h: 431.8, desc: '11 × 17 in' },
} as const;

type PageFormatKey = keyof typeof PAGE_FORMATS;

const MM_TO_PX = 96 / 25.4;
const PRINT_OVERHEAD_MM = 20 + 20 + 12 + 10; // top margin + bottom margin + header + footer

function EditorTool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <Tip label={label}><Button variant="ghost" size="icon" aria-label={label} onMouseDown={event => event.preventDefault()} onClick={onClick}>{children}</Button></Tip>;
}

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
  const [dirty, setDirty] = useState(Boolean(initial?.body));
  const savingRef = useRef(false);
  const selectionRef = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkError, setLinkError] = useState('');

  // Editor Typography & Styling state
  const [fontFamily, setFontFamily] = useState('Georgia, serif');
  const [fontSize, setFontSize] = useState('11.5pt');

  // Page format & pagination
  const [pageFormat, setPageFormat] = useState<PageFormatKey>('a4');
  const [pageCount, setPageCount] = useState(1);
  const fmt = PAGE_FORMATS[pageFormat];
  const sheetWidthPx = Math.round(fmt.w * MM_TO_PX);
  const contentPerPage = Math.round((fmt.h - PRINT_OVERHEAD_MM) * MM_TO_PX);

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
        setJurisdiction(item.document_definition.jurisdictions[0] || 'Tanzania Mainland');
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
        setLanguage(d.definition.language || 'en');
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

  useEffect(() => {
    const rememberSelection = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode) && editorRef.current.contains(selection.focusNode)) {
        selectionRef.current = selection.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', rememberSelection);
    return () => document.removeEventListener('selectionchange', rememberSelection);
  }, []);

  function focusEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    let range = selectionRef.current;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  // Auto-pagination: observe body content height → derive page count
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !editing) return;
    const recalc = () => {
      const h = el.scrollHeight;
      setPageCount(Math.max(1, Math.ceil(h / contentPerPage)));
    };
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    const mo = new MutationObserver(recalc);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    recalc();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [editing, contentPerPage]);

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
    focusEditor();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const insertHtmlAtCursor = (insertHtml: string) => {
    focusEditor();
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
    setLinkError('');
    setLinkUrl('https://');
    setLinkLabel(window.getSelection()?.toString() || '');
    setLinkOpen(true);
  };

  const handleImagePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
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
    if (draftId && !doc) throw new Error('This draft has not loaded. Reopen it before saving.');
    const currentHtml = editorRef.current?.innerHTML || html;
    const saved = !doc
      ? await apiFetch<SignGeneratedDocument>('/v1/sign/generated-documents', {
        method: 'POST',
        body: JSON.stringify({ title, jurisdiction, definition: definition() }),
      })
      : await apiFetch<SignGeneratedDocument>(`/v1/sign/generated-documents/${doc.id}/content`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        html: currentHtml,
        jurisdiction,
        category: industry,
        document_type: type,
        language,
        expected_updated_at: doc.updated_at,
      }),
    });
    setDoc(saved);
    setHtml(saved.definition.editor_html || currentHtml);
    if (editorRef.current) editorRef.current.innerHTML = saved.definition.editor_html || currentHtml;
    setDirty(false);
    setNotice('Document saved successfully.');
    if (!draftId) setParams({ mode: 'compose', draft: saved.id }, { replace: true });
    return saved;
  }

  async function run(action: () => Promise<unknown>) {
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  // Multi-format export system
  async function exportFile(format: 'pdf' | 'word' | 'html' | 'txt' | 'json') {
    const saved = await persist();
    const currentHtml = saved.definition.editor_html || textHtml(saved.body);
    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Document';

    if (format === 'pdf') {
      const blob = await apiFetchBlob(`/v1/sign/generated-documents/${saved.id}/pdf`);
      downloadDocument(blob, `${sanitizedTitle}.pdf`);
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
  <div class="header-box">HUDUMIKA DOCUMENT STUDIO &bull; ${escape(jurisdiction.toUpperCase())} &bull; REF: ${saved.id.slice(0, 8).toUpperCase()}</div>
  <article>${currentHtml}</article>
  <div class="footer-box">HUDUMIKA LEGAL STUDIO &bull; DRAFT DOCUMENT — REVIEW BEFORE SIGNING</div>
</body>
</html>`;
      const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword' });
      downloadDocument(blob, `${sanitizedTitle}.doc`);
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
    <span>HUDUMIKA DOCUMENT STUDIO</span>
    <span>${escape(jurisdiction.toUpperCase())}</span>
  </div>
  <article>${currentHtml}</article>
</body>
</html>`;
      const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
      downloadDocument(blob, `${sanitizedTitle}.html`);
      setNotice('HTML web document downloaded.');
      return;
    }

    if (format === 'txt') {
      const blob = new Blob([saved.body || textOf(currentHtml)], { type: 'text/plain;charset=utf-8' });
      downloadDocument(blob, `${sanitizedTitle}.txt`);
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
      downloadDocument(blob, `${sanitizedTitle}.json`);
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
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Insert link</DialogTitle><DialogDescription>Add a website or email link to your document.</DialogDescription></DialogHeader>
          <form onSubmit={event => {
            event.preventDefault();
            try {
              const url = new URL(linkUrl.trim());
              if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error();
              insertHtmlAtCursor(`<a href="${escape(url.href)}">${escape(linkLabel.trim() || url.href)}</a>&nbsp;`);
              setLinkOpen(false);
            } catch { setLinkError('Enter a valid http, https or email link.'); }
          }} className="sign-link-form">
            {linkError && <Banner variant="error">{linkError}</Banner>}
            <label>Link address<Input autoFocus value={linkUrl} onChange={event => setLinkUrl(event.target.value)} required /></label>
            <label>Display text<Input value={linkLabel} onChange={event => setLinkLabel(event.target.value)} /></label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button><Button type="submit">Insert link</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
            disabled={busy}
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
              aria-label="Document title"
              disabled={busy}
              maxLength={250}
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

          {dirty ? (
            <span className="sign-sync-pill sign-sync-pill--dirty" title="Unsaved changes in editor">
              <span className="sign-pulse-dot" /> <span className="sign-sync-label">Unsaved edits</span>
            </span>
          ) : (
            <span className="sign-sync-pill sign-sync-pill--clean" title={doc ? "Draft saved" : "Draft not saved yet"}>
              <Icon name="check" size={12} /> <span className="sign-sync-label">{doc ? 'Saved' : 'New draft'}</span>
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
                aria-label="Save draft" title="Save document draft"
              >
                <Icon name="save" size={14} />
                <span className="hidden sm:inline">Save</span>
              </Button>

              {/* Save as Template */}
              <Button
                variant="outline"
                size="icon"
                disabled={busy}
                onClick={() => setSaveTemplateOpen(true)}
                className="sign-action-btn"
                aria-label="Save as template" title="Save as reusable company template"
              >
                <Icon name="copy" size={14} />

              </Button>

              {/* Multi-Format Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" disabled={busy} className="sign-action-btn" aria-label="Export document" title="Export document">
                    <Icon name="download" size={14} />

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
                size="icon"
                disabled={busy}
                onClick={() => setAiModalOpen(true)}
                className="sign-action-btn"
                aria-label="AI document generator" title="AI Legal Document Generator"
              >
                <Icon name="sparkle" size={14} className="sign-brand-icon" />

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
                <span>Sign</span>
                <Icon name="arrowRight" size={13} className="hidden sm:inline" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── System Feedback Notice ── */}
      {error && <Banner variant="error" onDismiss={() => setError('')}>{error}</Banner>}
      {notice && <Banner variant="success" onDismiss={() => setNotice('')}>{notice}</Banner>}

      {/* ── Document Docket Metadata Ribbon (Single Row) ── */}
      <div className="sign-docket-ribbon">
        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="layers" size={12} className="sign-brand-icon" /> Type:
          </span>
          <Select value={type} disabled={busy} onValueChange={v => { setType(v as SignDocumentType); setDirty(true); }}>
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
            disabled={busy} onChange={value => { setIndustry(value); setDirty(true); }}
            options={[...new Set([industry, 'Business & services', ...LAWDEPOT_TEMPLATES.map(t => t.category), ...LAWDEPOT_CATEGORIES.map(c => c.name)])]
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
            disabled={busy} onChange={value => { setJurisdiction(value); setDirty(true); }}
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
          <Select value={language} disabled={busy} onValueChange={value => { setLanguage(value); setDirty(true); }}>
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

        <div className="sign-docket-field">
          <span className="sign-docket-label">
            <Icon name="fileText" size={12} className="sign-brand-icon" /> Preview page:
          </span>
          <Select value={pageFormat} onValueChange={v => setPageFormat(v as PageFormatKey)}>
            <SelectTrigger className="sign-docket-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAGE_FORMATS) as PageFormatKey[]).map(key => (
                <SelectItem key={key} value={key}>
                  {PAGE_FORMATS[key].label} ({PAGE_FORMATS[key].desc})
                </SelectItem>
              ))}
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
                <span>Guided AI</span>
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
                <Button variant="ghost" size="sm"
                  key={suggest}
                  type="button"
                  className="sign-brief-chip"
                  onClick={() => setRequirements(prev => (prev ? `${prev}\n${suggest}` : suggest))}
                >
                  + {suggest}
                </Button>
              ))}
            </div>

            <div className="sign-brief-footer">
              <p className="sign-brief-note">
                <Icon name="shield" size={13} className="sign-brand-icon" /> Protected by tenant encryption safeguards.
              </p>
              <div className="sign-brief-actions">
                <Button variant="outline" disabled={busy || !valid} onClick={() => start(false)} className="sign-action-btn">
                  Blank document
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
        <div className="sign-studio-workbench" inert={busy} aria-busy={busy}>
          {/* ── Attached Formatting & Insert Ribbon ── */}
          <div className="sign-paper-toolbar" role="toolbar" aria-label="Document formatting">
            <div className="sign-toolbar-group">
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger aria-label="Preview font" className="sign-font-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["Georgia, serif",'Georgia'],["\'Times New Roman\', serif",'Times New Roman'],["\'Inter\', -apple-system, sans-serif",'Inter'],["\'Garamond\', serif",'Garamond'],["\'Courier New\', monospace",'Courier']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger aria-label="Preview font size" className="sign-size-select"><SelectValue /></SelectTrigger>
                <SelectContent>{['10','11','11.5','12','14','16'].map(size => <SelectItem key={size} value={`${size}pt`}>{size} pt</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sign-toolbar-group">
              <EditorTool label="Bold" onClick={() => exec('bold')}><strong>B</strong></EditorTool>
              <EditorTool label="Italic" onClick={() => exec('italic')}><em>I</em></EditorTool>
              <EditorTool label="Underline" onClick={() => exec('underline')}><u>U</u></EditorTool>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Text style" title="Text style">Style<Icon name="chevronDown" size={12} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {[['p','Paragraph'],['h2','Heading 2'],['h3','Heading 3'],['blockquote','Quote']].map(([value,label]) => <DropdownMenuItem key={value} onSelect={() => exec('formatBlock',value)}>{label}</DropdownMenuItem>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => exec('strikeThrough')}>Strikethrough</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exec('removeFormat')}>Clear formatting</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Alignment" title="Alignment"><Icon name="alignLeft" size={16} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>{[['justifyLeft','Left'],['justifyCenter','Center'],['justifyRight','Right'],['justifyFull','Justify']].map(([command,label]) => <DropdownMenuItem key={command} onSelect={() => exec(command)}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Lists and indentation" title="Lists and indentation"><Icon name="list" size={16} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>{[['insertUnorderedList','Bullets'],['insertOrderedList','Numbering'],['outdent','Decrease indent'],['indent','Increase indent']].map(([command,label]) => <DropdownMenuItem key={command} onSelect={() => exec(command)}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="sign-toolbar-group">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Insert content"><Icon name="plus" size={16} />Insert<Icon name="chevronDown" size={12} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={handleInsertLink}><Icon name="link" size={15} />Link</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}><Icon name="image" size={15} />Image</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => insertHtmlAtCursor(MILESTONE_TABLE_HTML)}><Icon name="table" size={15} />Table</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => insertHtmlAtCursor(SIGNATURE_BLOCK_HTML)}><Icon name="edit" size={15} />Signature block</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => insertHtmlAtCursor(CODE_BLOCK_HTML)}><Icon name="terminal" size={15} />Code block</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub><DropdownMenuSubTrigger>Clause</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-w-[calc(100vw-2rem)]">{BOILERPLATE_CLAUSES.map(clause => <DropdownMenuItem key={clause.name} onSelect={() => insertHtmlAtCursor(clause.html)}>{clause.name}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
                  <DropdownMenuSub><DropdownMenuSubTrigger>Placeholder</DropdownMenuSubTrigger><DropdownMenuSubContent>{['party_one','party_two','effective_date','payment_amount','jurisdiction','delivery_date','notice_period'].map(token => <DropdownMenuItem key={token} onSelect={() => insertHtmlAtCursor(`[${token.toUpperCase()}]&nbsp;`)}>{token.replaceAll('_',' ')}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              <EditorTool label="Undo" onClick={() => exec('undo')}><Icon name="arrowLeft" size={16} /></EditorTool>
              <EditorTool label="Redo" onClick={() => exec('redo')}><Icon name="arrowRight" size={16} /></EditorTool>
            </div>
          </div>
          {/* ── Image Resizer & Alignment Floating Controls ── */}
          {selectedImg && (
            <div className="sign-compose-img-toolbar" onMouseDown={e => e.preventDefault()}>
              <div className="sign-img-label">
                <Icon name="image" size={13} />
                <span>Image Resize:</span>
              </div>
              <div className="sign-img-presets">
                <Button variant="ghost" size="sm"
                  type="button"
                  className={`sign-img-btn ${imgWidth === 140 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(140)}
                >
                  Small
                </Button>
                <Button variant="ghost" size="sm"
                  type="button"
                  className={`sign-img-btn ${imgWidth === 260 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(260)}
                >
                  Medium
                </Button>
                <Button variant="ghost" size="sm"
                  type="button"
                  className={`sign-img-btn ${imgWidth === 420 ? 'is-active' : ''}`}
                  onClick={() => applyImageWidth(420)}
                >
                  Large
                </Button>
                <Button variant="ghost" size="sm" type="button" className="sign-img-btn" onClick={() => applyImageWidth('100%')}>
                  Fit Width
                </Button>
                <Button variant="ghost" size="sm" type="button" className="sign-img-btn" onClick={() => applyImageWidth('original')}>
                  Original
                </Button>
              </div>
              <div className="sign-img-aligns">
                <Button variant="ghost" size="sm" type="button" className="sign-img-btn" onClick={() => applyImageAlign('left')}>
                  Left
                </Button>
                <Button variant="ghost" size="sm" type="button" className="sign-img-btn" onClick={() => applyImageAlign('center')}>
                  Center
                </Button>
                <Button variant="ghost" size="sm" type="button" className="sign-img-btn" onClick={() => applyImageAlign('right')}>
                  Right
                </Button>
              </div>
              <Button variant="ghost" size="sm"
                type="button"
                className="sign-img-btn sign-img-btn--danger"
                onClick={deleteSelectedImage}
                title="Remove image"
              >
                <Icon name="trash" size={13} />
              </Button>
            </div>
          )}

          {/* ── Desk Viewport with Centered Legal Parchment Sheet ── */}
          <div className="sign-paper-desk">
            <div className="sign-parchment-sheet" style={{ maxWidth: sheetWidthPx }}>
              {/* Authentic Legal Header Strip */}
              <div className="sign-sheet-header">
                <div className="sign-sheet-header-brand">
                  <span className="sign-sheet-brand-dot" />
                  <span>HUDUMIKA DOCUMENT STUDIO</span>
                </div>
                <div className="sign-sheet-header-meta">
                  <span>{jurisdiction.toUpperCase()}</span>
                  <span>&bull;</span>
                  <span>REF: {doc?.id ? doc.id.slice(0, 8).toUpperCase() : 'LEGAL-DRAFT'}</span>
                </div>
              </div>

              {/* ContentEditable Parchment Body with page-break overlays */}
              <div className="sign-sheet-body-wrap">
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-label="Document body"
                  aria-multiline="true"
                  aria-busy={busy}
                  contentEditable={!busy}
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  className="sign-sheet-body"
                  style={{
                    fontFamily,
                    fontSize,
                    lineHeight: 1.75,
                    minHeight: contentPerPage,
                  }}
                  data-placeholder="Start writing or drafting your legal document…"
                />

                {/* Visual page-break indicators */}
                {pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, i) => (
                  <div
                    key={i}
                    className="sign-page-break-marker"
                    style={{ top: contentPerPage * (i + 1) }}
                  >
                    <span className="sign-page-break-label">
                      Page {i + 2} of {pageCount}
                    </span>
                  </div>
                ))}
              </div>

              {/* Authentic Document Watermark Footer */}
              <div className="sign-sheet-footer">
                <span>HUDUMIKA LEGAL STUDIO &bull; DRAFT DOCUMENT — REVIEW BEFORE SIGNING</span>
                <span>PREVIEW · {fmt.label.toUpperCase()} · PDF EXPORT: A4</span>
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
              <span>&bull;</span>
              <span>
                <strong>{pageCount}</strong> {pageCount === 1 ? 'page' : 'pages'} ({fmt.label})
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
        initialDocumentType={type}
        onSave={async data => {
          if (savingRef.current) throw new Error('Wait for the current save to finish.');
          savingRef.current = true;
          setBusy(true);
          try {
            const saved = await persist();
            await apiFetch('/v1/sign/document-library', {
              method: 'POST',
              body: JSON.stringify({
                name: data.name,
                description: data.description,
                document_definition: {
                  category: data.category,
                  document_type: data.documentType,
                  jurisdictions: [jurisdiction],
                  body: saved.body,
                  editor_html: saved.definition.editor_html,
                  questions: [],
                  language: language as 'en' | 'sw' | 'zh',
                },
              }),
            });
            setNotice('Template published to your Company Template Library.');
            } finally { savingRef.current = false; setBusy(false); }
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
