import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { EmailBlockBuilder, blocksToEmailHtml, type EmailBlock } from '../components/EmailBlockBuilder.js';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import type { EmailTemplateView, EmailTemplateCategory, EmailTemplateGroup } from '@hudumika/types';
import './EmailTemplates.css';

export const MY_MERGE_VARS = [
  { tag: 'first_name', label: 'First Name', sample: 'Sarah' },
  { tag: 'last_name', label: 'Last Name', sample: 'Massawe' },
  { tag: 'company', label: 'Company', sample: 'Kilimanjaro Logistics Ltd' },
  { tag: 'email', label: 'Email', sample: 'sarah.m@kilimanjaro.co.tz' },
  { tag: 'date', label: 'Date', sample: '28/09/2026' },
  { tag: 'invoice_no', label: 'Invoice #', sample: 'INV-2026-904' },
  { tag: 'amount', label: 'Amount', sample: 'TZS 3,450,000' },
  { tag: 'order_id', label: 'Order ID', sample: 'ORD-88219' },
  { tag: 'support_url', label: 'Support Link', sample: 'https://hudumika.com/help' },
  { tag: 'unsubscribe_url', label: 'Unsubscribe Link', sample: 'https://hudumika.com/unsub' },
];

const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  first_name: 'Sarah',
  last_name: 'Massawe',
  company: 'Kilimanjaro Logistics Ltd',
  email: 'sarah.m@kilimanjaro.co.tz',
  date: '28/09/2026',
  invoice_no: 'INV-2026-904',
  amount: 'TZS 3,450,000',
  order_id: 'ORD-88219',
  support_url: 'https://hudumika.com/help',
  unsubscribe_url: 'https://hudumika.com/unsub',
};

const QUICK_TEMPLATE_CATEGORIES = [
  'General',
  'Transactional & Billing',
  'Support & Service',
  'Account & Staff',
  'Marketing & Sales',
  'Notifications',
] as const;

export interface MyTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  is_html: boolean;
  category: string;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ImportedMarketplaceTpl {
  id: string;
  title: string;
  category: string;
  subject: string;
  is_hudumika_official: boolean;
  local_template_key: string;
  imported_at?: string;
  source_version?: string;
}

export interface SysTpl {
  template_key: string;
  category: string;
  subject: string;
  body_html: string;
  preheader: string;
  body_plain: string;
  locale: string;
  status: string;
  is_customized: boolean;
  is_builtin: boolean;
  available_vars: string[];
  event_key: string | null;
  application: string | null;
  revision: number;
  block_document: { version: 1; blocks: Array<Record<string, unknown>> } | null;
}

export interface MktTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  application: string | null;
  author_name: string;
  is_hudumika_official: boolean;
  downloads: number;
  version: string;
  subject: string;
  preheader: string;
  body_html: string;
  body_plain: string;
}

export const MKT_CAT_LABEL: Record<string, string> = {
  finance: 'Finance',
  auth: 'Auth & Security',
  crm: 'CRM',
  hr: 'HR & Payroll',
  esign: 'eSign',
  support: 'Support',
  clearos: 'ClearOS',
  commerce: 'Commerce',
  general: 'General',
  projects: 'Projects',
  security: 'Security',
};

function htmlToBuilderBlocks(html: string): EmailBlock[] {
  if (!html.trim() || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: EmailBlock[] = [];
  const id = () => Math.random().toString(36).slice(2);
  doc.body.querySelectorAll('h1,h2,h3,p,a[href],hr,img').forEach(element => {
    const text = element.textContent?.trim() ?? '';
    if (element.matches('h1,h2,h3') && text) {
      blocks.push({ id: id(), type: 'heading', text, level: Number(element.tagName.slice(1)) as 1 | 2 | 3, align: 'left' });
    } else if (element.matches('p') && !element.querySelector('a') && text) {
      blocks.push({ id: id(), type: 'paragraph', text });
    } else if (element.matches('a[href]') && text) {
      blocks.push({ id: id(), type: 'button', label: text, url: element.getAttribute('href') ?? '#', align: 'center', color: '#0d9488' });
    } else if (element.matches('hr')) {
      blocks.push({ id: id(), type: 'divider' });
    } else if (element instanceof HTMLImageElement) {
      blocks.push({ id: id(), type: 'image', src: element.src, alt: element.alt, width: element.getAttribute('width') ?? '100%', align: 'center' });
    }
  });
  if (!blocks.length) {
    const text = doc.body.textContent?.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ id: id(), type: 'paragraph', text });
  }
  return blocks;
}

function plainTextPreviewHtml(value: string): string {
  const escaped = (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,-apple-system,sans-serif;color:#1e293b;padding:28px 24px;line-height:1.6;font-size:14px;white-space:pre-wrap;background:#ffffff;margin:0;">${escaped}</body></html>`;
}

function evaluateSampleMergeTags(templateText: string, sampleData: Record<string, string>): string {
  return templateText.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, tag) => {
    return sampleData[tag] ?? match;
  });
}

function startColumnResize(
  e: React.PointerEvent,
  initialWidth: number,
  direction: 1 | -1,
  setWidth: React.Dispatch<React.SetStateAction<number>>,
  min: number,
  max: number,
) {
  const startX = e.clientX;
  e.preventDefault();
  document.body.classList.add('email-template-is-resizing');
  const onMove = (event: PointerEvent) => {
    setWidth(Math.max(min, Math.min(max, initialWidth + ((event.clientX - startX) * direction))));
  };
  const onUp = () => {
    document.body.classList.remove('email-template-is-resizing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ── Publish to Store Modal ──────────────────────────────────────────────────

function PublishToStoreDialog({
  templateKey,
  templateId,
  templateTitle,
  onClose,
}: {
  templateKey?: string;
  templateId?: string;
  templateTitle: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(templateTitle);
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    if (description.trim().length < 20) { setError('Description must be at least 20 characters.'); return; }
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      await apiFetch('/v1/marketplace/email-templates/submissions', {
        method: 'POST',
        body: JSON.stringify({
          ...(templateKey ? { template_key: templateKey } : { template_id: templateId }),
          title: title.trim(),
          description: description.trim(),
          tags,
        }),
      });
      showAlert('Template submitted for Store review!', { variant: 'success' });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Could not submit template.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Publish to Store</DialogTitle>
          <DialogDescription>Submit this template for marketplace review. Once approved, other tenants can discover and import it.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="publish-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="email-template-form-error" role="alert"><Icon name="alertCircle" size={15} /> {error}</div>}
            <div className="email-template-field">
              <label>Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Modern Invoicing & Payment Follow-up" />
            </div>
            <div className="email-template-field">
              <label>Description <span style={{ color: 'var(--red)' }}>*</span></label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Describe what this template is for, its target audience, and key features (min 20 chars)." />
              <small style={{ color: 'var(--ink3)' }}>{description.length}/2000</small>
            </div>
            <div className="email-template-field">
              <label>Tags <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(comma-separated)</span></label>
              <Input value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="e.g. invoicing, payments, finance, notifications" />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="publish-form" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. SIMPLE WYSIWYG BUILDER COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

interface SimpleWysiwygEditorProps {
  name: string;
  setName: (name: string) => void;
  subject: string;
  setSubject: (subject: string) => void;
  category: string;
  setCategory: (category: string) => void;
  bodyHtml: string;
  setBodyHtml: (html: string) => void;
  isHtml: boolean;
  setIsHtml: (isHtml: boolean) => void;
  availableCategories: string[];
  isImported?: boolean;
  importedKey?: string;
  importedMeta?: ImportedMarketplaceTpl | null;
  onOpenAdvancedBuilder: () => void;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onPublish: () => void;
  saving: boolean;
  dirty: boolean;
}

function SimpleWysiwygEditor({
  name,
  setName,
  subject,
  setSubject,
  category,
  setCategory,
  bodyHtml,
  setBodyHtml,
  isHtml,
  setIsHtml,
  availableCategories,
  isImported = false,
  importedKey,
  importedMeta,
  onOpenAdvancedBuilder,
  onSave,
  onDelete,
  onPublish,
  saving,
  dirty,
}: SimpleWysiwygEditorProps) {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedColor, setSelectedColor] = useState('#0d9488');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [buttonModalOpen, setButtonModalOpen] = useState(false);
  const [btnText, setBtnText] = useState('Click Here');
  const [btnUrl, setBtnUrl] = useState('https://');
  const [btnColor, setBtnColor] = useState('#0d9488');
  const [btnAlign, setBtnAlign] = useState<'center' | 'left' | 'right'>('center');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external HTML into contentEditable canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    canvasRef.current.innerHTML = bodyHtml || '<p>Write your email content here…</p>';
  }, [bodyHtml]);

  function execCmd(command: string, value: string | undefined = undefined) {
    document.execCommand(command, false, value);
    handleCanvasInput();
  }

  function handleCanvasInput() {
    if (!canvasRef.current) return;
    isInternalChange.current = true;
    const currentHtml = canvasRef.current.innerHTML;
    setBodyHtml(currentHtml);
    if (!isHtml) setIsHtml(true);
  }

  function insertHtmlAtCursor(htmlSnippet: string) {
    canvasRef.current?.focus();
    document.execCommand('insertHTML', false, htmlSnippet);
    handleCanvasInput();
  }

  function insertMergeTag(tag: string) {
    insertHtmlAtCursor(`<span class="email-var-tag" style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12.5px;font-weight:700;border:1px solid #bae6fd;" data-var="${tag}">{{${tag}}}</span>&nbsp;`);
    setShowVarMenu(false);
  }

  function insertSubjectTag(tag: string) {
    setSubject(`${subject} {{${tag}}}`);
  }

  function handleInsertLink() {
    if (!linkUrl.trim()) return;
    execCmd('createLink', linkUrl.trim());
    setLinkUrl('');
    setLinkModalOpen(false);
  }

  function handleInsertButton() {
    if (!btnText.trim()) return;
    const btnHtml = `
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 20px ${btnAlign === 'center' ? 'auto' : btnAlign === 'right' ? '0 0 auto' : '0 auto 0 0'}; text-align: ${btnAlign};">
        <tr>
          <td style="background-color: ${btnColor}; border-radius: 6px; padding: 12px 24px;">
            <a href="${btnUrl.trim() || '#'}" style="color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; font-family: Arial, sans-serif; display: inline-block;">
              ${btnText.trim()}
            </a>
          </td>
        </tr>
      </table>
      <p><br></p>
    `;
    insertHtmlAtCursor(btnHtml);
    setButtonModalOpen(false);
    setBtnText('Click Here');
    setBtnUrl('https://');
  }

  function handleInsertCallout(type: 'info' | 'success' | 'warning') {
    const colors = {
      info: { bg: '#f0fdfa', border: '#0d9488', text: '#134e4a', title: 'Information' },
      success: { bg: '#f0fdf4', border: '#16a34a', text: '#14532d', title: 'Success Notice' },
      warning: { bg: '#fffbeb', border: '#f59e0b', text: '#78350f', title: 'Important Reminder' },
    }[type];

    const calloutHtml = `
      <div style="background: ${colors.bg}; border-left: 4px solid ${colors.border}; padding: 14px 18px; margin: 18px 0; border-radius: 0 8px 8px 0; color: ${colors.text}; font-size: 14px; font-family: Arial, sans-serif;">
        <strong style="display: block; margin-bottom: 4px;">${colors.title}</strong>
        <span>Write your highlighted message or instructions here.</span>
      </div>
      <p><br></p>
    `;
    insertHtmlAtCursor(calloutHtml);
  }

  function handleInsertImage() {
    if (!imgSrc.trim()) return;
    const imgHtml = `
      <div style="text-align: center; margin: 20px 0;">
        <img src="${imgSrc.trim()}" alt="${imgAlt.trim() || 'Email Image'}" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0;" />
      </div>
      <p><br></p>
    `;
    insertHtmlAtCursor(imgHtml);
    setImageModalOpen(false);
    setImgSrc('');
    setImgAlt('');
  }

  const BRAND_PALETTE = ['#0f172a', '#0d9488', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#64748b'];

  return (
    <div className="simple-wysiwyg-root">
      {/* ── Top Header Controls ── */}
      <div className="simple-wysiwyg-head">
        <div className="simple-wysiwyg-title-row">
          <div className="simple-wysiwyg-name-field">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Template name (e.g. Invoicing Follow-up)"
              className="simple-wysiwyg-title-input"
            />
          </div>

          <div className="simple-wysiwyg-meta-badges">
            {isImported ? (
              <Badge variant="info" className="simple-wysiwyg-type-badge">
                <Icon name="download" size={11} /> Marketplace Import
              </Badge>
            ) : (
              <Badge variant="brand" className="simple-wysiwyg-type-badge">
                <Icon name="edit" size={11} /> Custom Template
              </Badge>
            )}

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger style={{ height: 32, minWidth: 140, fontSize: 12 }}>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {dirty && <Badge variant="warning">Unsaved</Badge>}
          </div>
        </div>

        {/* Subject Line & Merge Variables */}
        <div className="simple-wysiwyg-subject-row">
          <div className="simple-wysiwyg-subject-wrap">
            <span className="simple-wysiwyg-subject-prefix">Subject</span>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject line seen by recipients…"
              className="simple-wysiwyg-subject-input"
            />
          </div>

          <div className="simple-wysiwyg-var-dropdown-wrap">
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setShowVarMenu(!showVarMenu)}
              className="simple-wysiwyg-var-btn"
            >
              <Icon name="tag" size={12} />
              <span>+ Insert Variable</span>
              <Icon name="chevronDown" size={11} />
            </Button>

            {showVarMenu && (
              <div className="simple-wysiwyg-var-menu">
                <div className="simple-wysiwyg-var-menu-title">Insert into:</div>
                <div className="simple-wysiwyg-var-menu-list">
                  {MY_MERGE_VARS.map(v => (
                    <div key={v.tag} className="simple-wysiwyg-var-menu-item">
                      <div className="simple-wysiwyg-var-menu-info">
                        <strong>{`{{${v.tag}}}`}</strong>
                        <small>{v.label} (e.g. {v.sample})</small>
                      </div>
                      <div className="simple-wysiwyg-var-menu-actions">
                        <button type="button" onClick={() => insertSubjectTag(v.tag)} title="Insert into Subject">Subject</button>
                        <button type="button" onClick={() => insertMergeTag(v.tag)} title="Insert into Body">Body</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── WYSIWYG Toolbar ── */}
      <div className="simple-wysiwyg-toolbar">
        <div className="simple-wysiwyg-toolgroup">
          <button type="button" onClick={() => execCmd('undo')} title="Undo (Ctrl+Z)" className="simple-wysiwyg-btn"><Icon name="arrowLeft" size={13} /></button>
          <button type="button" onClick={() => execCmd('redo')} title="Redo (Ctrl+Y)" className="simple-wysiwyg-btn"><Icon name="arrowRight" size={13} /></button>
        </div>

        <div className="simple-wysiwyg-tool-divider" />

        <div className="simple-wysiwyg-toolgroup">
          <button type="button" onClick={() => execCmd('bold')} title="Bold" className="simple-wysiwyg-btn simple-wysiwyg-btn--bold"><strong>B</strong></button>
          <button type="button" onClick={() => execCmd('italic')} title="Italic" className="simple-wysiwyg-btn simple-wysiwyg-btn--italic"><em>I</em></button>
          <button type="button" onClick={() => execCmd('underline')} title="Underline" className="simple-wysiwyg-btn simple-wysiwyg-btn--underline"><u>U</u></button>
          <button type="button" onClick={() => execCmd('strikeThrough')} title="Strikethrough" className="simple-wysiwyg-btn"><s>S</s></button>
        </div>

        <div className="simple-wysiwyg-tool-divider" />

        <div className="simple-wysiwyg-toolgroup">
          <button type="button" onClick={() => execCmd('formatBlock', '<h2>')} title="Heading 2" className="simple-wysiwyg-btn">H2</button>
          <button type="button" onClick={() => execCmd('formatBlock', '<h3>')} title="Heading 3" className="simple-wysiwyg-btn">H3</button>
          <button type="button" onClick={() => execCmd('formatBlock', '<p>')} title="Paragraph" className="simple-wysiwyg-btn">P</button>
        </div>

        <div className="simple-wysiwyg-tool-divider" />

        <div className="simple-wysiwyg-toolgroup">
          <button type="button" onClick={() => execCmd('justifyLeft')} title="Align Left" className="simple-wysiwyg-btn"><Icon name="alignLeft" size={13} /></button>
          <button type="button" onClick={() => execCmd('justifyCenter')} title="Align Center" className="simple-wysiwyg-btn"><Icon name="alignCenter" size={13} /></button>
          <button type="button" onClick={() => execCmd('justifyRight')} title="Align Right" className="simple-wysiwyg-btn"><Icon name="alignRight" size={13} /></button>
          <button type="button" onClick={() => execCmd('insertUnorderedList')} title="Bullet List" className="simple-wysiwyg-btn"><Icon name="list" size={13} /></button>
        </div>

        <div className="simple-wysiwyg-tool-divider" />

        {/* Color Palette */}
        <div className="simple-wysiwyg-toolgroup simple-wysiwyg-color-group">
          {BRAND_PALETTE.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => { setSelectedColor(color); execCmd('foreColor', color); }}
              className={`simple-wysiwyg-color-swatch${selectedColor === color ? ' is-selected' : ''}`}
              style={{ backgroundColor: color }}
              title={`Color ${color}`}
            />
          ))}
        </div>

        <div className="simple-wysiwyg-tool-divider" />

        {/* Insert Elements */}
        <div className="simple-wysiwyg-toolgroup">
          <button type="button" onClick={() => setButtonModalOpen(true)} title="Insert Action Button" className="simple-wysiwyg-insert-btn">
            <Icon name="mousePointerClick" size={13} /> Button
          </button>
          <button type="button" onClick={() => handleInsertCallout('info')} title="Insert Callout Box" className="simple-wysiwyg-insert-btn">
            <Icon name="alertCircle" size={13} /> Callout
          </button>
          <button type="button" onClick={() => setLinkModalOpen(true)} title="Insert Link" className="simple-wysiwyg-insert-btn">
            <Icon name="externalLink" size={13} /> Link
          </button>
          <button type="button" onClick={() => setImageModalOpen(true)} title="Insert Image" className="simple-wysiwyg-insert-btn">
            <Icon name="image" size={13} /> Image
          </button>
          <button type="button" onClick={() => execCmd('insertHorizontalRule')} title="Insert Horizontal Rule" className="simple-wysiwyg-insert-btn">
            <Icon name="minus" size={13} /> Divider
          </button>
          <button type="button" onClick={() => execCmd('removeFormat')} title="Clear Formatting" className="simple-wysiwyg-btn">
            <Icon name="trash" size={12} />
          </button>
        </div>

        {/* Device Viewport Toggle */}
        <div className="simple-wysiwyg-device-toggle">
          <button
            type="button"
            className={`simple-wysiwyg-device-btn${deviceMode === 'desktop' ? ' is-active' : ''}`}
            onClick={() => setDeviceMode('desktop')}
            title="Desktop View (600px)"
          >
            <Icon name="monitor" size={13} />
          </button>
          <button
            type="button"
            className={`simple-wysiwyg-device-btn${deviceMode === 'mobile' ? ' is-active' : ''}`}
            onClick={() => setDeviceMode('mobile')}
            title="Mobile View (375px)"
          >
            <Icon name="smartphone" size={13} />
          </button>
          <button
            type="button"
            className={`simple-wysiwyg-device-btn${previewMode ? ' is-active' : ''}`}
            onClick={() => setPreviewMode(!previewMode)}
            title={previewMode ? 'Switch to Edit' : 'Live Preview'}
          >
            <Icon name="eye" size={13} />
          </button>
        </div>
      </div>

      {/* ── WYSIWYG Interactive Canvas ── */}
      <div className="simple-wysiwyg-canvas-container">
        <div className={`simple-wysiwyg-paper simple-wysiwyg-paper--${deviceMode}`}>
          {previewMode ? (
            <iframe
              title="Email Preview"
              sandbox=""
              srcDoc={bodyHtml}
              className="simple-wysiwyg-preview-frame"
            />
          ) : (
            <div
              ref={canvasRef}
              contentEditable
              onInput={handleCanvasInput}
              className="simple-wysiwyg-editable"
              spellCheck={false}
            />
          )}
        </div>
      </div>

      {/* ── Bottom Action Footer ── */}
      <div className="simple-wysiwyg-footer">
        <div className="simple-wysiwyg-footer-left">
          {onDelete && !isImported && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="simple-wysiwyg-del-btn">
              <Icon name="trash" size={13} color="var(--red)" /> Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onPublish}>
            <Icon name="package" size={13} /> Publish to Store
          </Button>
        </div>

        <div className="simple-wysiwyg-footer-right">
          {/* Requirement 2: Button to Advanced Builder */}
          <Button
            variant="outline"
            onClick={onOpenAdvancedBuilder}
            className="simple-wysiwyg-adv-btn"
          >
            <Icon name="terminal" size={14} /> Advanced Builder
          </Button>

          {/* Requirement 3: Save to Template Library */}
          <Button
            onClick={onSave}
            disabled={saving}
            className="simple-wysiwyg-save-btn"
          >
            <Icon name="check" size={14} strokeWidth={2.4} />
            {saving ? 'Saving…' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* ── Mini Modals for Link, Button, Image ── */}
      {linkModalOpen && (
        <Dialog open onOpenChange={setLinkModalOpen}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Insert Hyperlink</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600 }}>URL Address</label>
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://example.com" autoFocus />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkModalOpen(false)}>Cancel</Button>
              <Button onClick={handleInsertLink}>Insert Link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {buttonModalOpen && (
        <Dialog open onOpenChange={setButtonModalOpen}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Insert Call-To-Action Button</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Button Label</label>
                  <Input value={btnText} onChange={e => setBtnText(e.target.value)} placeholder="e.g. View Invoice" autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Destination Link</label>
                  <Input value={btnUrl} onChange={e => setBtnUrl(e.target.value)} placeholder="https://example.com/pay" />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Button Color</label>
                    <Input type="color" value={btnColor} onChange={e => setBtnColor(e.target.value)} style={{ height: 36, padding: 2 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Alignment</label>
                    <Select value={btnAlign} onValueChange={v => setBtnAlign(v as any)}>
                      <SelectTrigger style={{ height: 36 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setButtonModalOpen(false)}>Cancel</Button>
              <Button onClick={handleInsertButton}>Insert Button</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {imageModalOpen && (
        <Dialog open onOpenChange={setImageModalOpen}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Insert Email Image</DialogTitle></DialogHeader>
            <DialogBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Image URL (HTTPS)</label>
                  <Input value={imgSrc} onChange={e => setImgSrc(e.target.value)} placeholder="https://images.unsplash.com/…" autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Alt Description</label>
                  <Input value={imgAlt} onChange={e => setImgAlt(e.target.value)} placeholder="e.g. Company Logo or Banner" />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImageModalOpen(false)}>Cancel</Button>
              <Button onClick={handleInsertImage}>Insert Image</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. ADVANCED BUILDER STUDIO DIALOG (Requirement 2)
// ═════════════════════════════════════════════════════════════════════════════

interface AdvancedBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject: string;
  category: string;
  bodyHtml: string;
  isImported?: boolean;
  importedKey?: string;
  onSave: (data: { name: string; subject: string; bodyHtml: string; category: string }) => Promise<void>;
}

function AdvancedBuilderDialog({
  open,
  onOpenChange,
  title: initialTitle,
  subject: initialSubject,
  category: initialCategory,
  bodyHtml: initialHtml,
  isImported,
  importedKey,
  onSave,
}: AdvancedBuilderDialogProps) {
  const [activeTab, setActiveTab] = useState<'blocks' | 'html' | 'css' | 'import' | 'simulator' | 'export'>('blocks');
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [category, setCategory] = useState(initialCategory);
  const [htmlCode, setHtmlCode] = useState(initialHtml);
  const [customCss, setCustomCss] = useState(`/* Custom Email Responsive Styles */
@media only screen and (max-width: 600px) {
  .email-container { width: 100% !important; max-width: 100% !important; }
  .email-stack { display: block !important; width: 100% !important; }
  .email-hero-title { font-size: 22px !important; }
  .email-btn { width: 100% !important; text-align: center !important; }
}

@media (prefers-color-scheme: dark) {
  .email-dark-bg { background-color: #0f172a !important; color: #f8fafc !important; }
}`);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => htmlToBuilderBlocks(initialHtml));
  const [sampleData, setSampleData] = useState<Record<string, string>>(DEFAULT_SAMPLE_DATA);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [simDevice, setSimDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when initialHtml changes
  useEffect(() => {
    setTitle(initialTitle);
    setSubject(initialSubject);
    setCategory(initialCategory);
    setHtmlCode(initialHtml);
    setBlocks(htmlToBuilderBlocks(initialHtml));
  }, [initialTitle, initialSubject, initialCategory, initialHtml]);

  function handleBlocksChange(nextBlocks: EmailBlock[]) {
    setBlocks(nextBlocks);
    const generatedHtml = blocksToEmailHtml(nextBlocks);
    setHtmlCode(generatedHtml);
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.match(/\.(html|htm|eml)$/i)) {
      showAlert('Please select a valid .html or .htm file.');
      return;
    }

    setImporting(true);
    try {
      const rawText = await file.text();
      const res: { html: string } = await apiFetch('/v1/email/quick-templates/import-html', {
        method: 'POST',
        body: JSON.stringify({ html: rawText }),
      });
      setHtmlCode(res.html);
      setBlocks(htmlToBuilderBlocks(res.html));
      showAlert('HTML imported and sanitized successfully!', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Failed to import file.');
    } finally {
      setImporting(false);
    }
  }

  function formatHtml() {
    try {
      const doc = new DOMParser().parseFromString(htmlCode, 'text/html');
      setHtmlCode(doc.documentElement.outerHTML);
      showAlert('HTML formatted.', { variant: 'success' });
    } catch {
      showAlert('Unable to parse HTML for formatting.');
    }
  }

  function handleCopyHtml() {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showAlert('Clean email HTML copied to clipboard!', { variant: 'success' });
  }

  function handleDownloadHtml() {
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'email-template'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleStudioSave() {
    setSaving(true);
    try {
      // If custom CSS is present and not already embedded, inject into <head>
      let finalHtml = htmlCode;
      if (customCss.trim() && !finalHtml.includes(customCss.trim())) {
        if (finalHtml.includes('</head>')) {
          finalHtml = finalHtml.replace('</head>', `<style type="text/css">\n${customCss}\n</style>\n</head>`);
        } else {
          finalHtml = `<style type="text/css">\n${customCss}\n</style>\n${finalHtml}`;
        }
      }

      await onSave({
        name: title.trim(),
        subject: subject.trim(),
        category,
        bodyHtml: finalHtml,
      });
      showAlert('Template saved to library successfully!', { variant: 'success' });
      onOpenChange(false);
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  const simulatedHtml = useMemo(() => {
    return evaluateSampleMergeTags(htmlCode, sampleData);
  }, [htmlCode, sampleData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="adv-builder-dialog-content">
        {/* ── Studio Header ── */}
        <div className="adv-builder-header">
          <div className="adv-builder-header-left">
            <FeaturedIcon size="md" variant="brand">
              <Icon name="terminal" size={18} />
            </FeaturedIcon>
            <div className="adv-builder-title-group">
              <div className="adv-builder-title-row">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Template Title"
                  className="adv-builder-title-input"
                />
                {isImported ? (
                  <Badge variant="info">Marketplace Import ({importedKey})</Badge>
                ) : (
                  <Badge variant="brand">Custom Template</Badge>
                )}
              </div>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject: e.g. Payment receipt for {{company}}"
                className="adv-builder-subject-input"
              />
            </div>
          </div>

          <div className="adv-builder-header-actions">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleStudioSave} disabled={saving} className="adv-builder-save-btn">
              <Icon name="check" size={14} />
              {saving ? 'Saving…' : 'Save to Library'}
            </Button>
          </div>
        </div>

        {/* ── Mode Navigation Tabs ── */}
        <div className="adv-builder-nav-tabs">
          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'blocks' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('blocks')}
          >
            <Icon name="grid" size={14} />
            <span>Block Builder</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'html' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('html')}
          >
            <Icon name="terminal" size={14} />
            <span>HTML & Code Editor</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'css' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('css')}
          >
            <Icon name="color" size={14} />
            <span>Custom CSS & Styles</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'import' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <Icon name="upload" size={14} />
            <span>HTML / File Import</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'simulator' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            <Icon name="play" size={14} />
            <span>Logic & Merge Simulator</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'export' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <Icon name="download" size={14} />
            <span>Export Clean HTML</span>
          </button>
        </div>

        {/* ── Studio Workspace Body ── */}
        <div className="adv-builder-body">
          {/* Tab 1: Visual Drag & Drop Block Builder */}
          {activeTab === 'blocks' && (
            <div className="adv-builder-panel adv-builder-panel--blocks">
              <EmailBlockBuilder
                blocks={blocks}
                onChange={handleBlocksChange}
                varGroups={[{
                  label: 'Template Fields',
                  vars: MY_MERGE_VARS.map(v => ({ key: v.tag, label: v.label, example: `{{${v.tag}}}` })),
                }]}
              />
            </div>
          )}

          {/* Tab 2: HTML & Code Editor */}
          {activeTab === 'html' && (
            <div className="adv-builder-panel adv-builder-panel--html">
              <div className="adv-code-editor-pane">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="terminal" size={14} />
                    <span>Raw HTML Source</span>
                  </div>
                  <div className="adv-pane-actions">
                    <Button size="xs" variant="outline" onClick={formatHtml}>
                      <Icon name="refresh" size={12} /> Format HTML
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={htmlCode}
                  onChange={e => {
                    setHtmlCode(e.target.value);
                    setBlocks(htmlToBuilderBlocks(e.target.value));
                  }}
                  className="adv-code-textarea"
                  spellCheck={false}
                />
              </div>

              <div className="adv-code-preview-pane">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="eye" size={14} />
                    <span>Live Sandboxed Preview</span>
                  </div>
                </div>
                <div className="adv-preview-viewport">
                  <iframe
                    title="Live HTML Preview"
                    sandbox=""
                    srcDoc={htmlCode}
                    className="adv-preview-iframe"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Custom CSS & Styling */}
          {activeTab === 'css' && (
            <div className="adv-builder-panel adv-builder-panel--css">
              <div className="adv-css-editor-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="color" size={14} />
                    <span>Custom Embedded Stylesheet</span>
                  </div>
                  <div className="adv-pane-actions">
                    <Button size="xs" variant="outline" onClick={() => setCustomCss(prev => `${prev}\n\n/* Button Hover */\n.email-btn:hover { opacity: 0.88 !important; }`)}>
                      + Hover Preset
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => setCustomCss(prev => `${prev}\n\n/* Dark Mode Inversion */\n@media (prefers-color-scheme: dark) {\n  .email-card { background: #1e293b !important; color: #ffffff !important; }\n}`)}>
                      + Dark Mode
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={customCss}
                  onChange={e => setCustomCss(e.target.value)}
                  className="adv-code-textarea adv-code-textarea--css"
                  spellCheck={false}
                />
              </div>

              <div className="adv-css-guide-col">
                <div className="adv-guide-card">
                  <h4>Email CSS Guidelines</h4>
                  <p>Most desktop clients (like Outlook) require inlined styles. Media queries in this CSS editor are compiled into the <code>&lt;head&gt;</code> for modern mobile clients (Apple Mail, iOS, Gmail app, Android).</p>
                  <div className="adv-guide-tags">
                    <span className="adv-guide-pill">@media only screen and (max-width: 600px)</span>
                    <span className="adv-guide-pill">@media (prefers-color-scheme: dark)</span>
                    <span className="adv-guide-pill">!important overrides</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: HTML & Asset File Import */}
          {activeTab === 'import' && (
            <div className="adv-builder-panel adv-builder-panel--import">
              <div className="adv-import-dropzone" onClick={() => fileInputRef.current?.click()}>
                <FeaturedIcon size="lg" variant="brand">
                  <Icon name="upload" size={24} />
                </FeaturedIcon>
                <h3>Upload Email HTML File</h3>
                <p>Drag & drop or browse your <code>.html</code>, <code>.htm</code>, or <code>.eml</code> template file. Styles are automatically sanitized and merged.</p>
                <Button size="sm" disabled={importing}>
                  {importing ? 'Sanitizing & Importing…' : 'Browse Files'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,.eml"
                  style={{ display: 'none' }}
                  onChange={handleFileImport}
                />
              </div>
            </div>
          )}

          {/* Tab 5: Dynamic Variable & Logic Simulator */}
          {activeTab === 'simulator' && (
            <div className="adv-builder-panel adv-builder-panel--simulator">
              <div className="adv-sim-controls-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="play" size={14} />
                    <span>Mock Customer Context</span>
                  </div>
                </div>
                <div className="adv-sim-fields-list">
                  {Object.entries(sampleData).map(([key, val]) => (
                    <div key={key} className="adv-sim-field">
                      <label>{`{{${key}}}`}</label>
                      <Input
                        value={val}
                        onChange={e => setSampleData(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="adv-sim-preview-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="eye" size={14} />
                    <span>Evaluated Live Preview</span>
                  </div>
                  <div className="adv-sim-device-btns">
                    <button
                      type="button"
                      className={`adv-sim-device-btn${simDevice === 'desktop' ? ' is-active' : ''}`}
                      onClick={() => setSimDevice('desktop')}
                    >
                      <Icon name="monitor" size={13} /> Desktop
                    </button>
                    <button
                      type="button"
                      className={`adv-sim-device-btn${simDevice === 'mobile' ? ' is-active' : ''}`}
                      onClick={() => setSimDevice('mobile')}
                    >
                      <Icon name="smartphone" size={13} /> Mobile
                    </button>
                  </div>
                </div>
                <div className={`adv-sim-frame-wrap adv-sim-frame-wrap--${simDevice}`}>
                  <iframe
                    title="Simulated Email Preview"
                    sandbox=""
                    srcDoc={simulatedHtml}
                    className="adv-sim-iframe"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Export Clean HTML */}
          {activeTab === 'export' && (
            <div className="adv-builder-panel adv-builder-panel--export">
              <div className="adv-export-card">
                <FeaturedIcon size="lg" variant="brand">
                  <Icon name="package" size={24} />
                </FeaturedIcon>
                <h3>Production-Ready Inlined HTML</h3>
                <p>This email template is fully compiled with table fallbacks, inline CSS styles, and responsive tags ready to paste into SendGrid, Mailchimp, Postmark, Resend, or AWS SES.</p>
                <div className="adv-export-btns">
                  <Button onClick={handleCopyHtml}>
                    <Icon name="copy" size={14} /> {copied ? 'Copied!' : 'Copy Clean HTML'}
                  </Button>
                  <Button variant="outline" onClick={handleDownloadHtml}>
                    <Icon name="download" size={14} /> Download .html File
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. MY TEMPLATES TAB & SIDEBAR LIBRARY (Requirement 3)
// ═════════════════════════════════════════════════════════════════════════════

function MyTemplatesTab({ onGoToMarketplace }: { onGoToMarketplace: () => void }) {
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [groups, setGroups] = useState<EmailTemplateGroup[]>([]);
  const [importedMkt, setImportedMkt] = useState<ImportedMarketplaceTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImportedKey, setSelectedImportedKey] = useState<string | null>(null);
  const [editingImported, setEditingImported] = useState<SysTpl | null>(null);
  const [editingPersonal, setEditingPersonal] = useState<MyTemplate | null>(null);

  // Active form state for the Simple WYSIWYG Builder
  const [formName, setFormName] = useState('New template');
  const [formSubject, setFormSubject] = useState('Following up with {{first_name}}');
  const [formCategory, setFormCategory] = useState('General');
  const [formBodyHtml, setFormBodyHtml] = useState('<div style="font-family: Arial, sans-serif; color: #1e293b; padding: 24px; line-height: 1.6;">\n  <h2 style="color: #0d9488; margin-top: 0;">Hello {{first_name}},</h2>\n  <p>Thank you for reaching out to us regarding <strong>{{company}}</strong>.</p>\n  <p>We are reviewing your details and will update you shortly.</p>\n  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />\n  <p style="font-size: 13px; color: #64748b;">Best regards,<br><strong>Operations Team</strong></p>\n</div>');
  const [formIsHtml, setFormIsHtml] = useState(true);

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState('');
  const [librarySource, setLibrarySource] = useState<'all' | 'personal' | 'imported'>('all');
  const [publishOpen, setPublishOpen] = useState(false);
  const [showAdvancedBuilder, setShowAdvancedBuilder] = useState(false);
  const [navWidth, setNavWidth] = useState(300);

  function loadTemplates() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/email/quick-templates'),
      apiFetch('/v1/email/template-groups'),
      apiFetch('/v1/marketplace/email-templates/imported').catch(() => [] as ImportedMarketplaceTpl[]),
    ])
      .then(([rows, loadedGroups, imported]: [MyTemplate[], EmailTemplateGroup[], ImportedMarketplaceTpl[]]) => {
        setGroups(loadedGroups);
        setTemplates(rows);
        setImportedMkt(Array.isArray(imported) ? imported : []);
        if (rows.length > 0) {
          const current = rows.find(t => t.id === selectedId);
          if (current) selectPersonalTemplate(current);
          else if (!selectedId) selectPersonalTemplate(rows[0]);
        } else {
          initNewTemplate();
        }
      })
      .catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load templates.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function selectPersonalTemplate(t: MyTemplate) {
    setSelectedId(t.id);
    setSelectedImportedKey(null);
    setEditingPersonal(t);
    setEditingImported(null);
    setFormName(t.name);
    setFormSubject(t.subject || '');
    setFormCategory(t.category || 'General');
    setFormBodyHtml(t.is_html && t.body_html ? t.body_html : plainTextPreviewHtml(t.body || ''));
    setFormIsHtml(t.is_html);
  }

  async function selectImportedTemplate(t: ImportedMarketplaceTpl) {
    setSelectedId(null);
    setSelectedImportedKey(t.local_template_key);
    setEditingPersonal(null);
    try {
      const sysTpl: SysTpl = await apiFetch(`/v1/email-templates/${encodeURIComponent(t.local_template_key)}`);
      setEditingImported(sysTpl);
      setFormName(t.title);
      setFormSubject(sysTpl.subject || t.subject || '');
      setFormCategory(sysTpl.category || t.category || 'General');
      setFormBodyHtml(sysTpl.body_html || plainTextPreviewHtml(sysTpl.body_plain || ''));
      setFormIsHtml(true);
    } catch {
      setEditingImported(null);
    }
  }

  function initNewTemplate() {
    setSelectedId(null);
    setSelectedImportedKey(null);
    setEditingPersonal(null);
    setEditingImported(null);
    setFormName('New template');
    setFormSubject('Following up with {{first_name}}');
    setFormCategory('General');
    setFormBodyHtml('<div style="font-family: Arial, sans-serif; color: #1e293b; padding: 24px; line-height: 1.6;">\n  <h2 style="color: #0d9488; margin-top: 0;">Hello {{first_name}},</h2>\n  <p>Thank you for reaching out to us regarding <strong>{{company}}</strong>.</p>\n  <p>We are reviewing your details and will update you shortly.</p>\n  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />\n  <p style="font-size: 13px; color: #64748b;">Best regards,<br><strong>Operations Team</strong></p>\n</div>');
    setFormIsHtml(true);
  }

  const dirty = useMemo(() => {
    if (editingPersonal) {
      return (
        formName !== editingPersonal.name ||
        formSubject !== editingPersonal.subject ||
        formCategory !== editingPersonal.category ||
        formBodyHtml !== (editingPersonal.body_html || editingPersonal.body)
      );
    }
    if (editingImported) {
      return (
        formSubject !== editingImported.subject ||
        formBodyHtml !== editingImported.body_html
      );
    }
    return true;
  }, [editingPersonal, editingImported, formName, formSubject, formCategory, formBodyHtml]);

  // Requirement 3: Save template to Template Library
  async function handleSaveTemplate() {
    if (!formName.trim()) {
      showAlert('Please enter a template name.');
      return;
    }
    setSaving(true);
    try {
      if (editingImported && selectedImportedKey) {
        // Save customized version of imported system template
        const updated = await apiFetch(`/v1/email-templates/${encodeURIComponent(selectedImportedKey)}`, {
          method: 'PUT',
          body: JSON.stringify({
            subject: formSubject,
            preheader: editingImported.preheader || '',
            body_html: formBodyHtml,
            body_plain: new DOMParser().parseFromString(formBodyHtml, 'text/html').body.textContent?.trim() || '',
            locale: editingImported.locale || 'en',
            status: 'active',
          }),
        });
        setEditingImported(prev => prev ? { ...prev, ...updated, is_customized: true } : prev);
        showAlert('Customized marketplace template saved!', { variant: 'success' });
      } else if (editingPersonal?.id) {
        // Update existing personal template in library
        const updated: MyTemplate = await apiFetch(`/v1/email/quick-templates/${editingPersonal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            subject: formSubject,
            body: formIsHtml ? '' : formBodyHtml,
            body_html: formBodyHtml,
            is_html: true,
            category: formCategory,
          }),
        });
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
        setEditingPersonal(updated);
        showAlert('Template updated in library!', { variant: 'success' });
      } else {
        // Create new template in library
        const created: MyTemplate = await apiFetch('/v1/email/quick-templates', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            subject: formSubject,
            body: formIsHtml ? '' : formBodyHtml,
            body_html: formBodyHtml,
            is_html: true,
            category: formCategory,
            group_id: groups[0]?.id ?? null,
            sort_order: templates.length,
          }),
        });
        setTemplates(prev => [...prev, created]);
        setSelectedId(created.id);
        setEditingPersonal(created);
        showAlert('New template saved to library!', { variant: 'success' });
      }
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not save template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!editingPersonal?.id) return;
    if (!(await showConfirm(`Delete "${editingPersonal.name}" from your template library?`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/email/quick-templates/${editingPersonal.id}`, { method: 'DELETE' });
      const remaining = templates.filter(t => t.id !== editingPersonal.id);
      setTemplates(remaining);
      if (remaining.length > 0) {
        selectPersonalTemplate(remaining[0]);
      } else {
        initNewTemplate();
      }
      showAlert('Template deleted from library.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not delete template.');
    }
  }

  // Advanced builder save bridge
  async function handleAdvancedSave(data: { name: string; subject: string; bodyHtml: string; category: string }) {
    setFormName(data.name);
    setFormSubject(data.subject);
    setFormCategory(data.category);
    setFormBodyHtml(data.bodyHtml);

    if (editingImported && selectedImportedKey) {
      await apiFetch(`/v1/email-templates/${encodeURIComponent(selectedImportedKey)}`, {
        method: 'PUT',
        body: JSON.stringify({
          subject: data.subject,
          preheader: editingImported.preheader || '',
          body_html: data.bodyHtml,
          body_plain: new DOMParser().parseFromString(data.bodyHtml, 'text/html').body.textContent?.trim() || '',
          locale: editingImported.locale || 'en',
          status: 'active',
        }),
      });
      setEditingImported(prev => prev ? { ...prev, is_customized: true, body_html: data.bodyHtml, subject: data.subject } : prev);
    } else if (editingPersonal?.id) {
      const updated: MyTemplate = await apiFetch(`/v1/email/quick-templates/${editingPersonal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.name,
          subject: data.subject,
          body_html: data.bodyHtml,
          is_html: true,
          category: data.category,
        }),
      });
      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditingPersonal(updated);
    } else {
      const created: MyTemplate = await apiFetch('/v1/email/quick-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          subject: data.subject,
          body_html: data.bodyHtml,
          is_html: true,
          category: data.category,
          sort_order: templates.length,
        }),
      });
      setTemplates(prev => [...prev, created]);
      setSelectedId(created.id);
      setEditingPersonal(created);
    }
  }

  // Filtering for search & source tabs
  const q = search.toLowerCase().trim();
  const filteredPersonal = templates.filter(t =>
    !q || t.name.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q)
  );
  const filteredImported = importedMkt.filter(t =>
    !q || t.title.toLowerCase().includes(q) || (t.subject ?? '').toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q)
  );

  const importedByCategory = Object.entries(filteredImported.reduce<Record<string, ImportedMarketplaceTpl[]>>((acc, item) => {
    const cat = MKT_CAT_LABEL[item.category] ?? item.category ?? 'Other';
    (acc[cat] ??= []).push(item);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));

  const personalSections = [...groups.map(group => ({ id: group.id, name: group.name, group })), { id: null, name: 'General', group: null }]
    .map(section => ({
      ...section,
      items: filteredPersonal.filter(t => (t.group_id ?? null) === section.id).sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter(section => section.items.length > 0 || (librarySource === 'personal' && section.group !== null));

  const allAvailableCategories = Array.from(new Set([...QUICK_TEMPLATE_CATEGORIES, ...templates.map(t => t.category), formCategory])).sort();

  return (
    <div
      className="email-templates-workspace"
      style={{ '--template-nav-width': `${navWidth}px` } as React.CSSProperties}
    >
      {/* ── Left Sidebar Navigator ── */}
      <aside className="email-templates-nav">
        <div className="email-template-nav-top">
          <div className="email-template-search">
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search template library…"
              aria-label="Search template library"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <Icon name="x" size={13} />
              </button>
            )}
          </div>

          <button type="button" className="email-template-new-btn" onClick={initNewTemplate}>
            <Icon name="plus" size={14} /> <span>+ New template</span>
          </button>

          <button
            type="button"
            className="email-template-new-btn email-template-new-btn--secondary email-template-new-btn--import"
            onClick={onGoToMarketplace}
          >
            <Icon name="download" size={14} /> <span>Import from Marketplace</span>
          </button>

          {/* Requirement 3: Source tabs */}
          <div className="email-template-library-tabs" role="tablist" aria-label="Template source">
            {(['all', 'personal', 'imported'] as const).map(src => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={librarySource === src}
                className={librarySource === src ? 'is-active' : ''}
                onClick={() => setLibrarySource(src)}
              >
                {src === 'all' ? 'All' : src === 'personal' ? 'Custom' : 'Imported'}
                <span>{src === 'all' ? templates.length + importedMkt.length : src === 'personal' ? templates.length : importedMkt.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="email-template-nav-summary">
          <span>{librarySource === 'all' ? 'Template Library' : librarySource === 'personal' ? 'Custom Templates' : 'Marketplace Imports'}</span>
          <span>{librarySource === 'all' ? filteredPersonal.length + filteredImported.length : librarySource === 'personal' ? filteredPersonal.length : filteredImported.length} shown</span>
        </div>

        {loading ? (
          <SectionLoading />
        ) : filteredPersonal.length || filteredImported.length ? (
          <div className="email-template-group-list">
            {/* Custom Personal Templates Section */}
            {librarySource !== 'imported' && personalSections.length > 0 && (
              <>
                <div className="email-template-source-label">
                  <Icon name="edit" size={12} /> Custom Templates
                </div>
                {personalSections.map(section => {
                  const secKey = section.id ?? '__ungrouped__';
                  const isCollapsed = collapsedSections.has(secKey);
                  return (
                    <div key={secKey} className="email-template-managed-group">
                      <div className="email-template-managed-group-header">
                        <button
                          type="button"
                          className="email-template-section-toggle"
                          onClick={() => setCollapsedSections(prev => {
                            const next = new Set(prev);
                            if (next.has(secKey)) next.delete(secKey); else next.add(secKey);
                            return next;
                          })}
                        >
                          <Icon name="chevronDown" size={13} className={`email-template-category-chevron${isCollapsed ? ' is-collapsed' : ''}`} />
                        </button>
                        <span className="email-template-group-name">
                          <span>{section.name}</span>
                        </span>
                        <Badge variant="gray">{section.items.length}</Badge>
                      </div>

                      {!isCollapsed && (
                        <div className="email-template-nav-list">
                          {section.items.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => selectPersonalTemplate(t)}
                              className={`email-template-nav-item${t.id === selectedId ? ' is-active' : ''}`}
                            >
                              <div className="email-template-nav-title">
                                <span>{t.name}</span>
                                <Badge variant="brand">Custom</Badge>
                              </div>
                              {t.subject && <div className="email-template-nav-key">{t.subject}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Imported Marketplace Templates Section */}
            {librarySource !== 'personal' && importedByCategory.length > 0 && (
              <>
                <div className="email-template-source-label" style={{ marginTop: 12 }}>
                  <Icon name="download" size={12} /> Marketplace Imports
                </div>
                {importedByCategory.map(([catName, catTemplates]) => (
                  <details key={catName} className="email-template-managed-group email-template-import-category" open>
                    <summary className="email-template-managed-group-header">
                      <FeaturedIcon size="sm" variant="brand"><Icon name="download" size={13} /></FeaturedIcon>
                      <span>{catName}</span>
                      <Badge variant="info">{catTemplates.length}</Badge>
                      <Icon name="chevronDown" size={13} className="email-template-category-chevron" />
                    </summary>
                    <div className="email-template-nav-list">
                      {catTemplates.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          className={`email-template-nav-item${selectedImportedKey === t.local_template_key ? ' is-active' : ''}`}
                          onClick={() => selectImportedTemplate(t)}
                        >
                          <div className="email-template-nav-title">
                            <span>{t.title}</span>
                            <Badge variant={t.is_hudumika_official ? 'brand' : 'info'}>
                              {t.is_hudumika_official ? 'Official' : 'Marketplace'}
                            </Badge>
                          </div>
                          {t.subject && <div className="email-template-nav-key">{t.subject}</div>}
                          <div className="email-template-nav-cat">
                            <Icon name="package" size={10} />
                            {t.imported_at ? `Imported ${new Date(t.imported_at).toLocaleDateString()}` : 'System template'}
                            {t.source_version && <span> · v{t.source_version}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="email-template-empty">
            <Icon name="layers" size={32} color="var(--ink3)" />
            <p>No templates yet.</p>
            <p>Click <strong>+ New template</strong> to create one, or browse the marketplace.</p>
          </div>
        )}
      </aside>

      {/* Resize handle */}
      <div
        className="email-template-column-resizer"
        role="separator"
        aria-label="Resize template list"
        onPointerDown={e => startColumnResize(e, navWidth, 1, setNavWidth, 240, 480)}
      />

      {/* ── Main Simple WYSIWYG Builder Pane (Requirement 1) ── */}
      <main className="email-template-editor">
        <SimpleWysiwygEditor
          name={formName}
          setName={setFormName}
          subject={formSubject}
          setSubject={setFormSubject}
          category={formCategory}
          setCategory={setFormCategory}
          bodyHtml={formBodyHtml}
          setBodyHtml={setFormBodyHtml}
          isHtml={formIsHtml}
          setIsHtml={setFormIsHtml}
          availableCategories={allAvailableCategories}
          isImported={!!selectedImportedKey}
          importedKey={selectedImportedKey ?? undefined}
          importedMeta={importedMkt.find(m => m.local_template_key === selectedImportedKey)}
          onOpenAdvancedBuilder={() => setShowAdvancedBuilder(true)}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onPublish={() => setPublishOpen(true)}
          saving={saving}
          dirty={dirty}
        />
      </main>

      {/* ── Advanced Builder Studio Modal (Requirement 2) ── */}
      {showAdvancedBuilder && (
        <AdvancedBuilderDialog
          open={showAdvancedBuilder}
          onOpenChange={setShowAdvancedBuilder}
          title={formName}
          subject={formSubject}
          category={formCategory}
          bodyHtml={formBodyHtml}
          isImported={!!selectedImportedKey}
          importedKey={selectedImportedKey ?? undefined}
          onSave={handleAdvancedSave}
        />
      )}

      {/* ── Publish to Store Dialog ── */}
      {publishOpen && (
        <PublishToStoreDialog
          templateKey={selectedImportedKey ?? undefined}
          templateId={editingPersonal?.id ?? undefined}
          templateTitle={formName}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. MARKETPLACE TAB (Store Email Templates Browser)
// ═════════════════════════════════════════════════════════════════════════════

function MarketplaceTab({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MktTemplate[]>([]);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/v1/marketplace/email-templates/imported')
      .then((rows: Array<{ id: string }>) => setImportedIds(new Set(rows.map(row => row.id))))
      .catch(() => setImportedIds(new Set()));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({ limit: '12' });
      if (search.trim()) query.set('q', search.trim());
      apiFetch(`/v1/marketplace/email-templates?${query.toString()}`)
        .then((rows: MktTemplate[]) => setTemplates(rows))
        .catch((err: any) => showAlert(err?.message ?? 'Could not load Marketplace templates'))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function importTemplate(template: MktTemplate) {
    setImportingId(template.id);
    try {
      await apiFetch(`/v1/marketplace/email-templates/${template.id}/import`, { method: 'POST' });
      setImportedIds(prev => new Set([...prev, template.id]));
      showAlert(`"${template.title}" imported into My Templates.`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not import template');
    } finally {
      setImportingId(null);
    }
  }

  const categoryIcon = (category: string) => {
    if (category === 'finance') return { name: 'invoice' as const, variant: 'success' as const };
    if (category === 'auth' || category === 'security') return { name: 'lock' as const, variant: 'gray' as const };
    if (category === 'crm') return { name: 'users' as const, variant: 'warning' as const };
    if (category === 'hr') return { name: 'userCheck' as const, variant: 'info' as const };
    if (category === 'esign') return { name: 'edit' as const, variant: 'info' as const };
    if (category === 'support') return { name: 'headphones' as const, variant: 'brand' as const };
    if (category === 'clearos') return { name: 'ship' as const, variant: 'brand' as const };
    if (category === 'commerce') return { name: 'package' as const, variant: 'success' as const };
    if (category === 'projects') return { name: 'folder' as const, variant: 'info' as const };
    return { name: 'mail' as const, variant: 'brand' as const };
  };

  return (
    <div className="etab-marketplace-outer">
      <button type="button" className="etab-marketplace-back" onClick={onBack}>
        <Icon name="arrowLeft" size={13} /> Back to My Templates
      </button>

      <div className="etab-marketplace-shell">
        <div className="etab-marketplace-heading">
          <div>
            <span className="etab-marketplace-eyebrow">CURATED FOR YOUR WORKSPACE</span>
            <h2>Featured Email Templates</h2>
          </div>
          <div className="etab-marketplace-search">
            <Icon name="search" size={15} />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search Marketplace templates…"
              aria-label="Search Marketplace templates"
            />
            {search && (
              <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setSearch('')}>
                <Icon name="x" size={14} />
              </Button>
            )}
          </div>
          <div className="etab-marketplace-heading-actions">
            <div className="etab-marketplace-view-switch" role="group" aria-label="Template view">
              <Button size="icon" variant="outline" className={layout === 'grid' ? 'is-active' : ''} aria-label="Grid view" onClick={() => setLayout('grid')}><Icon name="grid" size={15} /></Button>
              <Button size="icon" variant="outline" className={layout === 'list' ? 'is-active' : ''} aria-label="List view" onClick={() => setLayout('list')}><Icon name="list" size={15} /></Button>
            </div>
            <Button aria-label="View all templates in Marketplace" onClick={() => navigate('/store?cat=email-templates')}>
              <span className="etab-marketplace-view-all-label">View Store Catalog</span>
              <Icon name="arrowRight" size={14} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="etab-marketplace-loading"><SectionLoading /></div>
        ) : templates.length === 0 ? (
          <div className="etab-marketplace-empty">
            <FeaturedIcon size="lg" variant="gray"><Icon name="mail" size={20} /></FeaturedIcon>
            <strong>No featured templates found</strong>
            <span>Try searching for another keyword or browse the full Store catalog.</span>
          </div>
        ) : (
          <div className={`etab-marketplace-featured-grid etab-marketplace-featured-grid--${layout}`}>
            {templates.map(template => {
              const icon = categoryIcon(template.category);
              return (
                <div key={template.id} className="etab-marketplace-featured-card">
                  <div className="etab-marketplace-card-top">
                    <FeaturedIcon size="lg" variant={icon.variant}><Icon name={icon.name} size={20} /></FeaturedIcon>
                    <Badge variant={template.is_hudumika_official ? 'brand' : 'gray'}>
                      {template.is_hudumika_official ? 'Official' : 'Verified'}
                    </Badge>
                  </div>
                  <div className="etab-marketplace-card-copy">
                    <h3>{template.title}</h3>
                    <span>By {template.author_name}</span>
                    <p>{template.description}</p>
                  </div>
                  <div className="etab-marketplace-card-meta">
                    <Badge variant={icon.variant}>{MKT_CAT_LABEL[template.category] ?? template.application ?? template.category}</Badge>
                    <span>{template.downloads > 0 ? `${template.downloads.toLocaleString()} imports` : 'New'}</span>
                    <div className="etab-marketplace-card-actions">
                      <Button
                        size="xs"
                        variant={importedIds.has(template.id) ? 'outline' : 'default'}
                        disabled={importedIds.has(template.id) || importingId === template.id}
                        onClick={() => importTemplate(template)}
                      >
                        {importingId === template.id ? 'Importing…' : importedIds.has(template.id) ? <><Icon name="check" size={13} /> Imported</> : <><Icon name="download" size={13} /> Import</>}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="etab-marketplace-footer">
          <div><Icon name="info" size={15} /><span>Marketplace templates become editable copies inside your "My Templates" library after import.</span></div>
          <Button variant="outline" onClick={() => navigate('/store?cat=email-templates')}>Browse the Full Collection</Button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. MAIN EMAIL TEMPLATES PAGE ROOT
// ═════════════════════════════════════════════════════════════════════════════

export function EmailTemplates() {
  const [tab, setTab] = useState<'mine' | 'marketplace'>('mine');

  return (
    <div className="email-templates-page">
      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="email-templates-root">
        <div className="email-templates-topbar">
          <div className="email-templates-title-lockup">
            <PageHeader
              crumbs={['Email', 'Templates']}
              titlePlain="Email"
              titleEm="templates"
              subtitle="Reusable templates for compose, notifications, and automated workflows."
            />
          </div>
          <div className="email-templates-tablist-wrap">
            <TabsList className="email-templates-tablist">
              <TabsTrigger value="mine">
                <Icon name="layers" size={14} /> My Templates
              </TabsTrigger>
              <TabsTrigger value="marketplace">
                <Icon name="package" size={14} /> Marketplace
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="mine" className="email-templates-tabcontent">
          <MyTemplatesTab onGoToMarketplace={() => setTab('marketplace')} />
        </TabsContent>
        <TabsContent value="marketplace" className="email-templates-tabcontent">
          <MarketplaceTab onBack={() => setTab('mine')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
