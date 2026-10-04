import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../../components/ui/dialog.js';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import type { EmailTemplateView } from '@hudumika/types';
import { MY_MERGE_VARS, evaluateSampleMergeTags, startColumnResize } from './shared.js';
import type { ImportedMarketplaceTpl } from './shared.js';

// ── Publish to Store Modal ──────────────────────────────────────────────────

export function PublishToStoreDialog({
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

export function SimpleWysiwygEditor({
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
                    <ColorSwatchPicker value={btnColor} onChange={setBtnColor} />
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
