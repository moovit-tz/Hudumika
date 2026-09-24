import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const MY_MERGE_VARS = [
  { tag: 'first_name', label: 'First Name' },
  { tag: 'last_name', label: 'Last Name' },
  { tag: 'company', label: 'Company' },
  { tag: 'email', label: 'Email' },
  { tag: 'date', label: 'Date' },
  { tag: 'invoice_no', label: 'Invoice #' },
  { tag: 'amount', label: 'Amount' },
];

// ── My Templates types ──────────────────────────────────────────────────────

const QUICK_TEMPLATE_CATEGORIES = ['General', 'Transactional & Billing', 'Support & Service', 'Account & Staff'] as const;
type QuickTemplateCategory = string;

interface MyTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  is_html: boolean;
  category: QuickTemplateCategory;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type DraftTemplate = {
  id: string | null;
  name: string;
  subject: string;
  body: string;
  body_html: string;
  is_html: boolean;
  category: QuickTemplateCategory;
  group_id: string | null;
  sort_order: number;
};

function emptyDraft(): DraftTemplate {
  return { id: null, name: '', subject: '', body: '', body_html: '', is_html: false, category: 'General', group_id: null, sort_order: 0 };
}

function decodePastedEmailHtml(value: string): string {
  const encodedEquals = value.match(/=3D/gi)?.length ?? 0;
  const softBreaks = value.match(/=\r?\n/g)?.length ?? 0;
  if (encodedEquals < 2 || softBreaks < 1) return value;

  const unfolded = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < unfolded.length;) {
    const encodedByte = unfolded.slice(i).match(/^=([0-9a-f]{2})/i);
    if (encodedByte) {
      bytes.push(Number.parseInt(encodedByte[1], 16));
      i += 3;
      continue;
    }
    const codePoint = String.fromCodePoint(unfolded.codePointAt(i)!);
    bytes.push(...encoder.encode(codePoint));
    i += codePoint.length;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function PreviewDialog({ open, onOpenChange, subject, html }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  html: string;
}) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [zoom, setZoom] = useState(100);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="email-template-preview-dialog">
        <DialogHeader>
          <DialogTitle>{subject || 'Untitled email'}</DialogTitle>
          <DialogDescription>Full-size email preview. Interactive content and scripts are disabled.</DialogDescription>
        </DialogHeader>
        <DialogBody className="email-template-preview-dialog-body">
          <div className="email-template-preview-controls">
            <Button size="sm" variant={mode === 'desktop' ? 'default' : 'outline'} onClick={() => setMode('desktop')}><Icon name="monitor" size={14} /> Desktop</Button>
            <Button size="sm" variant={mode === 'mobile' ? 'default' : 'outline'} onClick={() => setMode('mobile')}><Icon name="smartphone" size={14} /> Mobile</Button>
            <label>Zoom <input type="range" min="60" max="120" step="10" value={zoom} onChange={event => setZoom(Number(event.target.value))} /> {zoom}%</label>
          </div>
          <div className={`email-template-preview-client email-template-preview-client--${mode}`}>
            <iframe title="Full email template preview" sandbox="" srcDoc={html} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }} />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function plainTextPreviewHtml(value: string): string {
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#172033;padding:24px;line-height:1.55;font-size:14px;white-space:pre-wrap">${escaped}</body></html>`;
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

// ── Shared system template types (used by both My Templates and Marketplace tabs) ──

interface SysTpl {
  template_key: string; category: string; subject: string; body_html: string;
  preheader: string; body_plain: string; locale: string; status: string;
  is_customized: boolean; is_builtin: boolean; available_vars: string[];
  event_key: string | null; application: string | null; revision: number;
  block_document: { version: 1; blocks: Array<Record<string, unknown>> } | null;
}

function htmlToBuilderBlocks(html: string): EmailBlock[] {
  if (!html.trim() || typeof DOMParser === 'undefined') return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const blocks: EmailBlock[] = [];
  const id = () => Math.random().toString(36).slice(2);
  document.body.querySelectorAll('h1,h2,h3,p,a[href],hr,img').forEach(element => {
    const text = element.textContent?.trim() ?? '';
    if (element.matches('h1,h2,h3') && text) {
      blocks.push({ id: id(), type: 'heading', text, level: Number(element.tagName.slice(1)) as 1 | 2 | 3, align: 'left' });
    } else if (element.matches('p') && !element.querySelector('a') && text) {
      blocks.push({ id: id(), type: 'paragraph', text });
    } else if (element.matches('a[href]') && text) {
      blocks.push({ id: id(), type: 'button', label: text, url: element.getAttribute('href') ?? '#', align: 'center', color: '#0d7a6b' });
    } else if (element.matches('hr')) {
      blocks.push({ id: id(), type: 'divider' });
    } else if (element instanceof HTMLImageElement) {
      blocks.push({ id: id(), type: 'image', src: element.src, alt: element.alt, width: element.getAttribute('width') ?? '100%', align: 'center' });
    }
  });
  if (!blocks.length) {
    const text = document.body.textContent?.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ id: id(), type: 'paragraph', text });
  }
  return blocks;
}

// ── Publish-to-store dialog ──────────────────────────────────────────────────

function PublishToStoreDialog({ templateKey, templateId, templateTitle, onClose }: {
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
          title: title.trim(), description: description.trim(), tags,
        }),
      });
      showAlert('Template submitted for review!', { variant: 'success' });
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
          <DialogDescription>Submit this template for review. Once approved, other tenants can import it.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="publish-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="email-template-form-error" role="alert"><Icon name="alertCircle" size={15} /> {error}</div>}
            <div className="email-template-field">
              <label>Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Welcome email for SaaS" />
            </div>
            <div className="email-template-field">
              <label>Description <span style={{ color: 'var(--red)' }}>*</span></label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Describe what this template is for, who it's designed for, and what makes it useful (min 20 chars)." />
              <small style={{ color: 'var(--ink3)' }}>{description.length}/2000</small>
            </div>
            <div className="email-template-field">
              <label>Tags <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(comma-separated)</span></label>
              <Input value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="e.g. onboarding, welcome, saas" />
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

// ── My Templates tab ────────────────────────────────────────────────────────

interface ImportedMarketplaceTpl {
  id: string; title: string; category: string; subject: string;
  is_hudumika_official: boolean; local_template_key: string;
  imported_at?: string; source_version?: string;
}

function MyTemplatesTab({ onGoToMarketplace }: { onGoToMarketplace: () => void }) {
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [groups, setGroups] = useState<EmailTemplateGroup[]>([]);
  const [importedMkt, setImportedMkt] = useState<ImportedMarketplaceTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImportedKey, setSelectedImportedKey] = useState<string | null>(null);
  const [editingImported, setEditingImported] = useState<SysTpl | null>(null);
  const [editingPersonal, setEditingPersonal] = useState<MyTemplate | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState('');
  const [categoryEditor, setCategoryEditor] = useState<'create' | 'rename' | null>(null);
  const [categoryEditorName, setCategoryEditorName] = useState('');
  const [groupEditor, setGroupEditor] = useState<'create' | 'rename' | null>(null);
  const [groupEditorName, setGroupEditorName] = useState('');
  const [librarySource, setLibrarySource] = useState<'all' | 'personal' | 'imported'>('all');
  const [publishOpen, setPublishOpen] = useState(false);
  const [showEditImportedDialog, setShowEditImportedDialog] = useState(false);
  const [showPersonalEditorDialog, setShowPersonalEditorDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [formError, setFormError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [navWidth, setNavWidth] = useState(280);
  const [previewWidth, setPreviewWidth] = useState(400);
  const [formatMode, setFormatMode] = useState<'plain' | 'visual' | 'html'>('plain');
  const [builderBlocks, setBuilderBlocks] = useState<EmailBlock[]>([]);

  function loadTemplates() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/email/quick-templates'),
      apiFetch('/v1/email/template-groups'),
      apiFetch('/v1/marketplace/email-templates/imported').catch(() => [] as ImportedMarketplaceTpl[]),
    ]).then(([rows, loadedGroups, imported]: [MyTemplate[], EmailTemplateGroup[], ImportedMarketplaceTpl[]]) => {
        setGroups(loadedGroups);
        setTemplates(rows);
        setImportedMkt(Array.isArray(imported) ? imported : []);
        if (rows.length > 0) {
          const current = rows.find(t => t.id === selectedId);
          if (current) selectTemplate(current);
          else if (!selectedId) selectTemplate(rows[0]);
        } else {
          newTemplate();
        }
      })
      .catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load templates.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTemplates(); }, []);

  // Select a template → show its preview panel (same pattern as imported templates).
  function selectTemplate(t: MyTemplate) {
    setFormError('');
    setSelectedId(t.id);
    setEditingPersonal(t);
    setEditingImported(null);
    setSelectedImportedKey(null);
    setDraft(null);
  }

  // Enter the editor from the personal preview panel — opens in a dialog.
  function enterPersonalEditor(t: MyTemplate) {
    setDraft({
      id: t.id,
      name: t.name,
      subject: t.subject,
      body: t.body,
      body_html: t.body_html ?? '',
      is_html: t.is_html,
      category: t.category ?? 'General',
      group_id: t.group_id ?? null,
      sort_order: t.sort_order ?? 0,
    });
    setFormatMode(t.is_html ? 'html' : 'plain');
    setBuilderBlocks(t.is_html && t.body_html ? htmlToBuilderBlocks(t.body_html) : []);
    setShowPersonalEditorDialog(true);
  }

  // Close the personal editor dialog without saving.
  function cancelEditing() {
    setDraft(null);
    setShowPersonalEditorDialog(false);
  }

  function newTemplate() {
    setFormError('');
    setSelectedId(null);
    setEditingPersonal(null);
    setEditingImported(null);
    setSelectedImportedKey(null);
    setDraft({
      id: null,
      name: 'New template',
      subject: 'Following up with {{first_name}}',
      body: 'Hi {{first_name}},\n\nThank you for your inquiry. We are reviewing your request and will get back to you shortly.\n\nBest regards,\nOperations Team',
      body_html: '<div style="font-family: Arial, sans-serif; color: #1e293b; padding: 24px; line-height: 1.6;">\n  <h2 style="color: #0d9488; margin-top: 0;">Hello {{first_name}},</h2>\n  <p>Thank you for reaching out to us regarding <strong>{{company}}</strong>.</p>\n  <p>We are reviewing your details and will update you shortly.</p>\n  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />\n  <p style="font-size: 13px; color: #64748b;">Best regards,<br><strong>Operations Team</strong></p>\n</div>',
      is_html: false,
      category: 'General',
      group_id: groups[0]?.id ?? null,
      sort_order: templates.length,
    });
    setFormatMode('plain');
    setBuilderBlocks([]);
  }

  function openVisualBuilder() {
    if (!draft) return;
    const nextBlocks = builderBlocks.length
      ? builderBlocks
      : draft.is_html && draft.body_html.trim()
        ? htmlToBuilderBlocks(draft.body_html)
        : draft.body.split(/\n{2,}/).map((text, index) => ({ id: `text-${Date.now()}-${index}`, type: 'paragraph' as const, text: text.trim() })).filter(block => block.text);
    setBuilderBlocks(nextBlocks);
    setDraft(current => current ? { ...current, is_html: true, body_html: blocksToEmailHtml(nextBlocks) } : current);
    setFormatMode('visual');
  }

  function updateBuilderBlocks(next: EmailBlock[]) {
    setBuilderBlocks(next);
    setDraft(current => current ? { ...current, is_html: true, body_html: blocksToEmailHtml(next) } : current);
  }

  const selected = templates.find(t => t.id === selectedId) ?? null;

  const dirty = draft !== null && (
    draft.id === null ||
    draft.name !== (selected?.name ?? '') ||
    draft.subject !== (selected?.subject ?? '') ||
    (draft.is_html ? draft.body_html !== (selected?.body_html ?? '') : draft.body !== (selected?.body ?? '')) ||
    draft.is_html !== (selected?.is_html ?? false) ||
    draft.category !== (selected?.category ?? 'General')
    || draft.group_id !== (selected?.group_id ?? null)
  );

  async function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) { setFormError('Give this template a name before saving.'); return; }
    if (draft.is_html && !draft.body_html.trim()) { setFormError('Add some HTML content before saving.'); return; }
    if (!draft.is_html && !draft.body.trim()) { setFormError('Add some content before saving.'); return; }
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        subject: draft.subject,
        body: draft.is_html ? '' : draft.body,
        body_html: draft.is_html ? draft.body_html : null,
        is_html: draft.is_html,
        category: draft.category,
        group_id: draft.group_id,
        sort_order: draft.sort_order,
      };
      if (draft.id) {
        const row: MyTemplate = await apiFetch(`/v1/email/quick-templates/${draft.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setTemplates(prev => prev.map(t => t.id === row.id ? row : t));
        setEditingPersonal(row);
        setDraft(null);
        setShowPersonalEditorDialog(false);
        showAlert('Template saved.', { variant: 'success' });
      } else {
        const row: MyTemplate = await apiFetch('/v1/email/quick-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTemplates(prev => [...prev, row]);
        setSelectedId(row.id);
        setEditingPersonal(row);
        setDraft(null);
        setShowPersonalEditorDialog(false);
        showAlert('Template created.', { variant: 'success' });
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not save template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft?.id) return;
    const name = draft.name || 'this template';
    if (!(await showConfirm(`Delete "${name}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/email/quick-templates/${draft.id}`, { method: 'DELETE' });
      const remaining = templates.filter(t => t.id !== draft.id);
      setTemplates(remaining);
      setDraft(null);
      setShowPersonalEditorDialog(false);
      if (remaining.length) selectTemplate(remaining[0]);
      else setEditingPersonal(null);
      showAlert('Template deleted.', { variant: 'success' });
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Could not delete template.');
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'html' && ext !== 'htm') {
      showAlert('Only .html / .htm files are supported.');
      return;
    }
    if (file.size > 500 * 1024) {
      showAlert('File too large. Maximum size is 500 KB.');
      return;
    }

    setImporting(true);
    try {
      const rawHtml = await file.text();
      const res: { html: string } = await apiFetch('/v1/email/quick-templates/import-html', {
        method: 'POST',
        body: JSON.stringify({ html: rawHtml }),
      });
      setDraft(prev => {
        const base = prev ?? emptyDraft();
        return {
          ...base,
          is_html: true,
          body_html: res.html,
          name: base.name || file.name.replace(/\.(html|htm)$/i, ''),
        };
      });
      setFormatMode('html');
      setBuilderBlocks(htmlToBuilderBlocks(res.html));
      showAlert('HTML file imported and sanitized. Review the preview, then save.', { variant: 'success' });
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed to import HTML file.');
    } finally {
      setImporting(false);
    }
  }

  function insertVar(varName: string) {
    if (!draft) return;
    const tag = `{{${varName}}}`;
    const field = draft.is_html ? 'body_html' : 'body';
    const value = draft[field];
    const input = bodyInputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    setDraft(d => d ? { ...d, [field]: `${value.slice(0, start)}${tag}${value.slice(end)}` } : d);
    requestAnimationFrame(() => {
      bodyInputRef.current?.focus();
      bodyInputRef.current?.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  function handleHtmlPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!draft?.is_html) return;
    const pasted = e.clipboardData.getData('text/plain');
    const decoded = decodePastedEmailHtml(pasted);
    if (decoded === pasted) return;

    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    setDraft(current => current ? {
      ...current,
      body_html: `${current.body_html.slice(0, start)}${decoded}${current.body_html.slice(end)}`,
    } : current);
    requestAnimationFrame(() => {
      const cursor = start + decoded.length;
      bodyInputRef.current?.setSelectionRange(cursor, cursor);
    });
    showAlert('Decoded quoted-printable email source.', { variant: 'success' });
  }

  function beginRenameGroup(id: string, name: string) {
    setRenamingGroupId(id);
    setRenamingGroupName(name);
  }

  function cancelRenameGroup() {
    setRenamingGroupId(null);
    setRenamingGroupName('');
  }

  async function renameGroup(group: EmailTemplateGroup) {
    const name = renamingGroupName.trim();
    if (!name) return;
    if (name === group.name) { cancelRenameGroup(); return; }
    try {
      await apiFetch(`/v1/email/template-groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setGroups(current => current.map(item => item.id === group.id ? { ...item, name } : item));
      cancelRenameGroup();
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Could not rename group.');
    }
  }

  async function renameUngrouped() {
    const name = renamingGroupName.trim();
    if (!name || name === 'Ungrouped') { cancelRenameGroup(); return; }
    try {
      const created = await apiFetch('/v1/email/template-groups', { method: 'POST', body: JSON.stringify({ name }) }) as EmailTemplateGroup;
      const ungroupedIds = templates.filter(template => !template.group_id).sort((a, b) => a.sort_order - b.sort_order).map(template => template.id);
      if (ungroupedIds.length) {
        await apiFetch('/v1/email/quick-templates/order', { method: 'PUT', body: JSON.stringify({ group_id: created.id, ids: ungroupedIds }) });
      }
      cancelRenameGroup();
      loadTemplates();
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Could not rename group.');
    }
  }

  async function submitCategoryEditor() {
    if (!draft) return;
    const name = categoryEditorName.trim();
    if (!name) return;
    if (categoryEditor === 'rename' && name !== draft.category && templates.some(template => template.category === draft.category)) {
      try {
        const oldName = draft.category;
        await apiFetch('/v1/email/quick-templates/categories/rename', { method: 'PUT', body: JSON.stringify({ current_name: oldName, name }) });
        setTemplates(current => current.map(template => template.category === oldName ? { ...template, category: name } : template));
      } catch (err: unknown) {
        showAlert(err instanceof Error ? err.message : 'Could not rename category.');
        return;
      }
    }
    setDraft(current => current ? { ...current, category: name } : current);
    setCategoryEditor(null);
    setCategoryEditorName('');
  }

  async function submitGroupEditor() {
    if (!draft) return;
    const name = groupEditorName.trim();
    if (!name) return;
    try {
      if (groupEditor === 'create') {
        const created = await apiFetch('/v1/email/template-groups', { method: 'POST', body: JSON.stringify({ name }) }) as EmailTemplateGroup;
        setGroups(current => [...current, created]);
        setDraft(current => current ? { ...current, group_id: created.id } : current);
      } else {
        const group = groups.find(item => item.id === draft.group_id);
        if (!group) return;
        const updated = await apiFetch(`/v1/email/template-groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }) as EmailTemplateGroup;
        setGroups(current => current.map(item => item.id === group.id ? updated : item));
      }
      setGroupEditor(null);
      setGroupEditorName('');
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Could not update group.');
    }
  }

  async function deleteGroup(group: EmailTemplateGroup) {
    if (!(await showConfirm(`Delete group "${group.name}"? Its templates will become ungrouped.`, { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/email/template-groups/${group.id}`, { method: 'DELETE' }); loadTemplates();
  }

  async function moveGroup(index: number, direction: -1 | 1) {
    const next = [...groups]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; setGroups(next);
    await apiFetch('/v1/email/template-groups/order', { method: 'PUT', body: JSON.stringify({ ids: next.map(g => g.id) }) });
  }

  async function moveTemplate(template: MyTemplate, groupId: string | null, direction = 0) {
    const items = templates.filter(t => (t.group_id ?? null) === groupId).sort((a, b) => a.sort_order - b.sort_order);
    const old = items.findIndex(t => t.id === template.id);
    if (old >= 0 && direction) {
      const target = old + direction; if (target < 0 || target >= items.length) return;
      [items[old], items[target]] = [items[target], items[old]];
    } else if (old < 0) items.push(template);
    await apiFetch('/v1/email/quick-templates/order', { method: 'PUT', body: JSON.stringify({ group_id: groupId, ids: items.map(t => t.id) }) });
    loadTemplates();
  }

  const filtered = templates.filter(t =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );
  const filteredImported = importedMkt.filter(t =>
    !search.trim() ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );
  const importedByCategory = Object.entries(filteredImported.reduce<Record<string, ImportedMarketplaceTpl[]>>((result, template) => {
    const category = MKT_CAT_LABEL[template.category] ?? template.category ?? 'Other';
    (result[category] ??= []).push(template);
    return result;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const personalSections = [...groups.map(group => ({ id: group.id, name: group.name, group })), { id: null, name: 'Ungrouped', group: null }]
    .map(section => ({ ...section, items: filtered.filter(t => (t.group_id ?? null) === section.id).sort((a, b) => a.sort_order - b.sort_order) }))
    .filter(section => section.items.length > 0 || section.group !== null);
  const personalCategories = Array.from(new Set([...QUICK_TEMPLATE_CATEGORIES, ...templates.map(template => template.category), draft?.category ?? 'General'])).sort();

  const previewHtml = draft ? (draft.is_html ? draft.body_html : plainTextPreviewHtml(draft.body)) : '';
  const showPreview = previewHtml.trim().length > 0;
  const personalPreviewHtml = editingPersonal
    ? (editingPersonal.is_html ? (editingPersonal.body_html ?? '') : plainTextPreviewHtml(editingPersonal.body))
    : '';
  const personalHasContent = !!(editingPersonal?.is_html ? (editingPersonal.body_html ?? '').trim() : editingPersonal?.body.trim());

  return (
    <div
      className={`email-templates-workspace${showPreview ? ' email-templates-workspace--preview' : ' email-templates-workspace--no-preview'}`}
      style={{ '--template-nav-width': `${navWidth}px`, '--template-preview-width': `${previewWidth}px` } as React.CSSProperties}
    >
      {/* ── List sidebar ─────────────────────────────────────────────────── */}
      <aside className="email-templates-nav">
        <div className="email-template-nav-top">
          <div className="email-template-search">
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates"
              aria-label="Search templates"
            />
            {search && (
              <Tip label="Clear search">
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                  <Icon name="x" size={13} />
                </button>
              </Tip>
            )}
          </div>

          <button type="button" className="email-template-new-btn" onClick={() => { newTemplate(); setShowPersonalEditorDialog(true); }}>
            <Icon name="plus" size={14} /> <span>New template</span>
          </button>
          <button type="button" className="email-template-new-btn email-template-new-btn--secondary email-template-new-btn--import" onClick={onGoToMarketplace}>
            <Icon name="download" size={14} /> <span>Import from Marketplace</span>
          </button>
          <div className="email-template-library-tabs" role="tablist" aria-label="Template source">
            {(['all', 'personal', 'imported'] as const).map(source => (
              <button key={source} type="button" role="tab" aria-selected={librarySource === source} className={librarySource === source ? 'is-active' : ''} onClick={() => setLibrarySource(source)}>
                {source === 'all' ? 'All' : source === 'personal' ? 'Personal' : 'Imported'}
                <span>{source === 'all' ? templates.length + importedMkt.length : source === 'personal' ? templates.length : importedMkt.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="email-template-nav-summary">
          <span>{librarySource === 'all' ? 'Template library' : librarySource === 'personal' ? 'Personal templates' : 'Marketplace imports'}</span>
          <span>{(librarySource === 'all' ? filtered.length + filteredImported.length : librarySource === 'personal' ? filtered.length : filteredImported.length)} shown</span>
        </div>

        {loading ? (
          <SectionLoading />
        ) : filtered.length || groups.length ? (
          <div className="email-template-group-list">
            {librarySource !== 'imported' && personalSections.map((section, groupIndex) => {
              const sectionKey = section.id ?? '__ungrouped__';
              const isCollapsed = collapsedSections.has(sectionKey);
              const toggleCollapse = () => setCollapsedSections(prev => {
                const next = new Set(prev);
                if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
                return next;
              });
              return <div key={sectionKey} className="email-template-managed-group">
              <div className="email-template-managed-group-header">
                <button type="button" className="email-template-section-toggle" onClick={toggleCollapse} aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}>
                  <Icon name="chevronDown" size={13} className={`email-template-category-chevron${isCollapsed ? ' is-collapsed' : ''}`} />
                </button>
                {renamingGroupId === sectionKey ? (
                  <form className="email-template-group-rename" onSubmit={event => { event.preventDefault(); void (section.group ? renameGroup(section.group) : renameUngrouped()); }}>
                    <Input autoFocus value={renamingGroupName} onChange={event => setRenamingGroupName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') cancelRenameGroup(); }} aria-label="Group name" />
                    <button type="submit" aria-label="Save group name"><Icon name="check" size={13} /></button>
                    <button type="button" onClick={cancelRenameGroup} aria-label="Cancel renaming"><Icon name="x" size={13} /></button>
                  </form>
                ) : (
                  <button type="button" className="email-template-group-name" onClick={() => beginRenameGroup(sectionKey, section.name)} aria-label={`Rename ${section.name} group`}>
                    <span>{section.name}</span>
                    <Icon name="edit" size={12} />
                  </button>
                )}
                <Badge variant="gray">{section.items.length}</Badge>
                {section.group && <div className="email-template-group-actions">
                  <button type="button" onClick={() => moveGroup(groupIndex, -1)} aria-label="Move group up">↑</button>
                  <button type="button" onClick={() => moveGroup(groupIndex, 1)} aria-label="Move group down">↓</button>
                  <button type="button" onClick={() => deleteGroup(section.group!)} aria-label="Delete group"><Icon name="trash" size={12} /></button>
                </div>}
              </div>
              {!isCollapsed && <div className="email-template-nav-list">
            {section.items.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t)}
                className={`email-template-nav-item${t.id === selectedId ? ' is-active' : ''}`}
              >
                <div className="email-template-nav-title">
                  <span>{t.name}</span>
                  <Badge variant={t.is_html ? 'brand' : 'gray'}>{t.is_html ? 'HTML' : 'Text'}</Badge>
                </div>
                {t.subject && <div className="email-template-nav-key">{t.subject}</div>}
                <span className="email-template-item-order" onClick={e => e.stopPropagation()}>
                  <span role="button" tabIndex={0} onClick={() => moveTemplate(t, section.id, -1)} aria-label="Move template up">↑</span>
                  <span role="button" tabIndex={0} onClick={() => moveTemplate(t, section.id, 1)} aria-label="Move template down">↓</span>
                </span>
              </button>
            ))}
              </div>}
            </div>;
            })}

            {/* Imported marketplace templates section */}
            {librarySource !== 'personal' && importedByCategory.map(([category, categoryTemplates]) => (
              <details key={category} className="email-template-managed-group email-template-import-category" open>
                <summary className="email-template-managed-group-header">
                  <FeaturedIcon size="sm" variant="brand"><Icon name="download" size={13} /></FeaturedIcon>
                  <span>{category}</span>
                  <Badge variant="brand">{categoryTemplates.length}</Badge>
                  <Icon name="chevronDown" size={13} className="email-template-category-chevron" />
                </summary>
                <div className="email-template-nav-list">
                  {categoryTemplates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className={`email-template-nav-item${selectedImportedKey === t.local_template_key ? ' is-active' : ''}`}
                        onClick={async () => {
                          setSelectedId(null);
                          setDraft(null);
                          setSelectedImportedKey(t.local_template_key);
                          try {
                            const sysTpl: SysTpl = await apiFetch(`/v1/email-templates/${encodeURIComponent(t.local_template_key)}`);
                            setEditingImported(sysTpl);
                          } catch { setEditingImported(null); }
                        }}
                      >
                        <div className="email-template-nav-title">
                          <span>{t.title}</span>
                          <Badge variant={t.is_hudumika_official ? 'brand' : 'gray'}>{t.is_hudumika_official ? 'Official' : 'Imported'}</Badge>
                        </div>
                        {t.subject && <div className="email-template-nav-key">{t.subject}</div>}
                        <div className="email-template-nav-cat">
                          <Icon name="package" size={10} />
                          {t.imported_at ? `Imported ${new Date(t.imported_at).toLocaleDateString()}` : 'Marketplace import'}
                          {t.source_version && <span>· v{t.source_version}</span>}
                        </div>
                      </button>
                    ))}
                </div>
              </details>
            ))}
            {(librarySource === 'personal' ? filtered.length === 0 : librarySource === 'imported' ? filteredImported.length === 0 : filtered.length + filteredImported.length === 0) && (
              <div className="email-template-no-results">No templates match “{search}”.</div>
            )}
          </div>
        ) : templates.length === 0 && importedMkt.length === 0 ? (
          <div className="email-template-empty">
            <Icon name="layers" size={32} color="var(--ink3)" />
            <p>No templates yet.</p>
            <p>Click <strong>New template</strong> to create your first, or <button type="button" className="em-link-btn" onClick={onGoToMarketplace}>browse the Marketplace</button>.</p>
          </div>
        ) : (
          <div className="email-template-no-results">No templates match "{search}".</div>
        )}
      </aside>

      <div
        className="email-template-column-resizer"
        role="separator"
        aria-label="Resize template list"
        onPointerDown={e => startColumnResize(e, navWidth, 1, setNavWidth, 220, 480)}
      />

      {/* ── Preview panel ────────────────────────────────────────────────── */}
      <main className="email-template-editor">
        {editingImported ? (
          /* ── Imported marketplace template preview ── */
          <div className="email-template-imported-panel">
            <div className="email-template-imported-panel-head">
              <div>
                <h3 className="email-template-imported-panel-title">{editingImported.subject}</h3>
                <code className="email-template-imported-panel-key">{editingImported.template_key}</code>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingImported.is_customized && <Badge variant="success">Customized</Badge>}
                <Badge variant="gray">{editingImported.category}</Badge>
              </div>
            </div>
            {editingImported.preheader && <p className="email-template-imported-panel-preheader">{editingImported.preheader}</p>}
            <div className="email-template-imported-panel-preview">
              <iframe title="Template preview" sandbox="" srcDoc={editingImported.body_html} style={{ width: '100%', height: '100%', border: 'none', background: '#f9f9f9' }} />
            </div>
            {!editingImported.is_customized && (
              <div className="email-template-imported-hint">
                <Icon name="info" size={13} /> Edit this template to customise it before publishing to the Store.
              </div>
            )}
            <div className="email-template-imported-panel-actions">
              <Tip label={editingImported.is_customized ? 'Submit your customised version for Store review' : 'Customise the template first, then you can publish it'}>
                <span>
                  <Button variant="outline" disabled={!editingImported.is_customized} onClick={() => setPublishOpen(true)}>
                    <Icon name="package" size={13} /> Publish to Store
                  </Button>
                </span>
              </Tip>
              <Button onClick={() => setShowEditImportedDialog(true)}>
                <Icon name="edit" size={13} /> Edit template
              </Button>
            </div>
          </div>
        ) : editingPersonal ? (
          /* ── Personal template preview ── */
          <div className="email-template-imported-panel">
            <div className="email-template-imported-panel-head">
              <div>
                <h3 className="email-template-imported-panel-title">{editingPersonal.name}</h3>
                {editingPersonal.subject && <div className="email-template-imported-panel-key">{editingPersonal.subject}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Badge variant={editingPersonal.is_html ? 'brand' : 'gray'}>{editingPersonal.is_html ? 'HTML' : 'Text'}</Badge>
                <Badge variant="gray">{editingPersonal.category}</Badge>
              </div>
            </div>
            <div className="email-template-imported-panel-preview">
              <iframe title="Template preview" sandbox="" srcDoc={personalPreviewHtml} style={{ width: '100%', height: '100%', border: 'none', background: '#f9f9f9' }} />
            </div>
            <div className="email-template-imported-panel-actions">
              <Tip label={personalHasContent ? 'Submit this template for Store review' : 'Add content to the template before publishing'}>
                <span>
                  <Button variant="outline" disabled={!personalHasContent} onClick={() => setPublishOpen(true)}>
                    <Icon name="package" size={13} /> Publish to Store
                  </Button>
                </span>
              </Tip>
              <Button onClick={() => enterPersonalEditor(editingPersonal)}>
                <Icon name="edit" size={13} /> Edit template
              </Button>
            </div>
          </div>
        ) : (
          <div className="email-template-editor-placeholder">
            <Icon name="layers" size={40} color="var(--ink3)" />
            <p>Select a template to edit, or click <strong>New template</strong>.</p>
          </div>
        )}
      </main>

      {/* ── Live preview — shown only for the new-template dialog's HTML draft ── */}
      {showPreview && !showPersonalEditorDialog && (
        <>
        <div
          className="email-template-column-resizer"
          role="separator"
          aria-label="Resize template preview"
          onPointerDown={e => startColumnResize(e, previewWidth, -1, setPreviewWidth, 280, 700)}
        />
        <aside className="email-template-preview">
          <div className="email-template-preview-header">
            <div>
              <span>Live preview</span>
              <small>Rendered in a sandboxed iframe — no scripts run</small>
            </div>
            <button type="button" className="email-template-preview-popout" onClick={() => setPreviewOpen(true)}>
              <Icon name="maximize" size={15} /> Open preview
            </button>
          </div>
          <div className="email-template-preview-envelope">
            <div className="email-template-preview-subject">{draft?.subject || 'Untitled email'}</div>
            <div className="email-template-preview-from">From: notifications@hudumika.internal</div>
            {/* sandbox="" blocks ALL origin-level access AND script execution;
                allow-same-origin is intentionally omitted so the iframe
                cannot reach the parent document even if injected JS were
                somehow present. */}
            <div className="email-template-preview-frame">
              <iframe title="HTML template preview" sandbox="" srcDoc={previewHtml} />
            </div>
          </div>
          <div className="email-template-preview-note">
            <Icon name="shield" size={14} /> Scripts, external loads and form submissions are blocked in preview.
          </div>
        </aside>
        <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} subject={draft?.subject ?? ''} html={previewHtml} />
        </>
      )}

      {/* ── Personal template editor dialog ──────────────────────────────── */}
      {showPersonalEditorDialog && draft && (
        <Dialog open onOpenChange={open => { if (!open) cancelEditing(); }}>
          <DialogContent size={formatMode === 'visual' ? 'full' : 'lg'}>
            <DialogHeader>
              <div className="etd-header-row">
                <DialogTitle>{draft.id ? 'Edit template' : 'New template'}</DialogTitle>
                {dirty && <Badge variant="warning">Unsaved changes</Badge>}
              </div>
            </DialogHeader>
            <DialogBody className="email-template-dialog-body">
              {formError && (
                <div className="email-template-form-error" role="alert">
                  <Icon name="alertCircle" size={15} /> {formError}
                </div>
              )}

              {/* Row 1: Name + Category */}
              <div className="etd-meta-row">
                <div className="etd-meta-field etd-meta-field--wide">
                  <label className="etd-label">Template name</label>
                  <Input
                    value={draft.name}
                    onChange={e => setDraft(d => d ? { ...d, name: e.target.value } : d)}
                    placeholder="e.g. Welcome email, Monthly newsletter…"
                  />
                </div>
                <div className="etd-meta-field">
                  <label className="etd-label">Category</label>
                  <div className="email-template-taxonomy-row">
                    <Select value={draft.category} onValueChange={value => {
                      if (value === '__create__') { setCategoryEditor('create'); setCategoryEditorName(''); return; }
                      setCategoryEditor(null);
                      setDraft(current => current ? { ...current, category: value } : current);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {personalCategories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                        <SelectItem value="__create__">＋ Create new category</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCategoryEditor('rename'); setCategoryEditorName(draft.category); }}><Icon name="edit" size={13} /> Rename</Button>
                  </div>
                  {categoryEditor && (
                    <form className="email-template-taxonomy-editor" onSubmit={event => { event.preventDefault(); void submitCategoryEditor(); }}>
                      <Input autoFocus value={categoryEditorName} onChange={event => setCategoryEditorName(event.target.value)} placeholder={categoryEditor === 'create' ? 'New category name' : 'Rename category'} />
                      <Button type="submit" size="sm" disabled={!categoryEditorName.trim()}>{categoryEditor === 'create' ? 'Add' : 'Save'}</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCategoryEditor(null)}>Cancel</Button>
                    </form>
                  )}
                </div>
              </div>

              {/* Row 2: Subject + Format */}
              <div className="etd-meta-row">
                <div className="etd-meta-field etd-meta-field--wide">
                  <label className="etd-label">Subject line <span className="etd-label-hint">optional — pre-fills compose subject</span></label>
                  <Input value={draft.subject} onChange={e => setDraft(d => d ? { ...d, subject: e.target.value } : d)} placeholder="Optional subject" />
                </div>
                <div className="etd-meta-field">
                  <label className="etd-label">Format</label>
                  <div className="etd-format-row">
                    <div className="email-template-type-toggle">
                      <button type="button" className={`email-template-type-btn${formatMode === 'plain' ? ' is-active' : ''}`} onClick={() => { setFormatMode('plain'); setDraft(d => d ? { ...d, is_html: false } : d); }}>
                        <Icon name="fileText" size={13} /> Plain text
                      </button>
                      <button type="button" className={`email-template-type-btn${formatMode === 'visual' ? ' is-active' : ''}`} onClick={openVisualBuilder}>
                        <Icon name="grid" size={13} /> Visual builder
                      </button>
                      <button type="button" className={`email-template-type-btn${formatMode === 'html' ? ' is-active' : ''}`} onClick={() => { setFormatMode('html'); setDraft(d => d ? { ...d, is_html: true } : d); }}>
                        <Icon name="terminal" size={13} /> HTML
                      </button>
                    </div>
                    {formatMode === 'html' && (
                      <>
                        <Tip label="Import an .html file">
                          <button type="button" className="email-template-import-btn" disabled={importing} onClick={() => fileInputRef.current?.click()}>
                            <Icon name={importing ? 'refresh' : 'upload'} size={13} />
                            {importing ? 'Importing…' : 'Import'}
                          </button>
                        </Tip>
                        <input ref={fileInputRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={handleFileImport} />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {formatMode !== 'visual' && (
                <div className="email-template-tags">
                  <label>Merge variables <span>Click to insert</span></label>
                  <div className="email-template-tag-list">
                    {MY_MERGE_VARS.map(v => (
                      <button key={v.tag} type="button" onClick={() => insertVar(v.tag)} className="email-template-tag">{`{{${v.tag}}}`}</button>
                    ))}
                  </div>
                </div>
              )}

              {formatMode === 'visual' ? (
                <div className="email-template-visual-builder">
                  <EmailBlockBuilder
                    blocks={builderBlocks}
                    onChange={updateBuilderBlocks}
                    varGroups={[{ label: 'Template fields', vars: MY_MERGE_VARS.map(v => ({ key: v.tag, label: v.label, example: `{{${v.tag}}}` })) }]}
                  />
                </div>
              ) : formatMode === 'html' ? (
                <div className="email-template-field email-template-body-field">
                  <div className="email-template-field-label"><label>HTML body</label><span>Scripts and event handlers are stripped on save</span></div>
                  <Textarea ref={bodyInputRef} value={draft.body_html} onChange={e => setDraft(d => d ? { ...d, body_html: e.target.value } : d)} onPaste={handleHtmlPaste} rows={16} className="email-template-code" placeholder="<!doctype html>&#10;<html>…</html>" />
                </div>
              ) : (
                <div className="email-template-field email-template-body-field">
                  <div className="email-template-field-label"><label>Body</label><span>Plain text — line breaks preserved</span></div>
                  <Textarea ref={bodyInputRef} value={draft.body} onChange={e => setDraft(d => d ? { ...d, body: e.target.value } : d)} rows={12} placeholder="Hi {{first_name}},&#10;&#10;…" />
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              {draft.id && (
                <button type="button" className="email-template-revert" onClick={handleDelete} style={{ marginRight: 'auto' }}>
                  <Icon name="trash" size={13} color="var(--red)" /> Delete
                </button>
              )}
              {draft.id && dirty && (
                <Button variant="ghost" onClick={() => { if (editingPersonal) enterPersonalEditor(editingPersonal); }}>Discard changes</Button>
              )}
              <Button variant="outline" onClick={cancelEditing}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modals (imported-template editor + publish) ───────────────────── */}
      {showEditImportedDialog && editingImported && (
        <SystemTemplateDialog
          tpl={editingImported}
          onSaved={(_key, updated) => setEditingImported(prev => prev ? { ...prev, ...updated, is_customized: true } : prev)}
          onClose={() => setShowEditImportedDialog(false)}
        />
      )}
      {publishOpen && editingImported && (
        <PublishToStoreDialog
          templateKey={editingImported.template_key}
          templateTitle={editingImported.subject}
          onClose={() => setPublishOpen(false)}
        />
      )}
      {publishOpen && editingPersonal && !draft && (
        <PublishToStoreDialog
          templateId={editingPersonal.id ?? undefined}
          templateTitle={editingPersonal.name}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

// ── Marketplace tab ───────────────────────────────────────────────────────────

interface MktTemplate {
  id: string; title: string; description: string; category: string;
  application: string | null; author_name: string;
  is_hudumika_official: boolean; downloads: number; version: string;
  subject: string; preheader: string; body_html: string; body_plain: string;
}

const MKT_CAT_LABEL: Record<string, string> = {
  finance: 'Finance', auth: 'Auth & Security', crm: 'CRM', hr: 'HR & Payroll',
  esign: 'eSign', support: 'Support', clearos: 'ClearOS', commerce: 'Commerce', general: 'General',
  projects: 'Projects', security: 'Security',
};

/* ── System template editor dialog ─────────────────────────────────────────── */

function SystemTemplateDialog({ tpl, onSaved, onClose }: {
  tpl: SysTpl;
  onSaved: (key: string, updated: Partial<SysTpl>) => void;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(tpl.subject);
  const [preheader, setPreheader] = useState(tpl.preheader);
  const [bodyHtml, setBodyHtml] = useState(tpl.body_html);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() =>
    tpl.block_document?.blocks?.length ? tpl.block_document.blocks as EmailBlock[] : htmlToBuilderBlocks(tpl.body_html),
  );
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>('visual');
  const [htmlDetached, setHtmlDetached] = useState(false);
  const [saving, setSaving] = useState(false);

  const varGroups = tpl.available_vars.length ? [{
    label: 'Template fields',
    vars: tpl.available_vars.map(variable => ({ key: variable, label: variable.replaceAll('_', ' '), example: `{{${variable}}}` })),
  }] : [];

  function updateBlocks(next: EmailBlock[]) {
    setBlocks(next);
    setBodyHtml(blocksToEmailHtml(next));
    setHtmlDetached(false);
  }

  async function save() {
    setSaving(true);
    try {
      const finalHtml = editorMode === 'visual' ? blocksToEmailHtml(blocks) : bodyHtml;
      const updated = await apiFetch(`/v1/email-templates/${encodeURIComponent(tpl.template_key)}`, {
        method: 'PUT',
        body: JSON.stringify({
          subject, preheader, body_html: finalHtml,
          body_plain: new DOMParser().parseFromString(finalHtml, 'text/html').body.textContent?.trim() || tpl.body_plain,
          locale: tpl.locale, status: 'active',
          block_document: editorMode === 'visual' && !htmlDetached ? { version: 1, blocks } : null,
        }),
      });
      onSaved(tpl.template_key, updated as Partial<SysTpl>);
      showAlert('Template saved.', { variant: 'success' });
      onClose();
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent size="full" className="etab-builder-dialog">
        <DialogHeader className="etab-builder-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DialogTitle style={{ flex: 1 }}>{tpl.subject}</DialogTitle>
            {tpl.is_customized && <Badge variant="success">Customized</Badge>}
          </div>
          <DialogDescription>
            <code style={{ fontSize: 11, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{tpl.template_key}</code>
            {tpl.category && <> · {tpl.category}</>}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="etab-builder-body">
          <div className="etab-builder-meta">
            <label><span>Subject</span><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" /></label>
            <label><span>Preview text</span><Input value={preheader} onChange={e => setPreheader(e.target.value)} placeholder="Preview line shown in inbox…" /></label>
            <div className="etab-builder-mode" role="group" aria-label="Editor mode">
              <Button size="sm" variant={editorMode === 'visual' ? 'default' : 'outline'} onClick={() => setEditorMode('visual')}><Icon name="grid" size={14} /> Visual builder</Button>
              <Button size="sm" variant={editorMode === 'html' ? 'default' : 'outline'} onClick={() => setEditorMode('html')}><Icon name="terminal" size={14} /> Advanced HTML</Button>
            </div>
          </div>
          <div className="etab-builder-workspace">
            {editorMode === 'visual' ? (
              <EmailBlockBuilder blocks={blocks} onChange={updateBlocks} varGroups={varGroups} />
            ) : (
              <div className="etab-builder-html">
                <div className="etab-builder-warning"><Icon name="alertTriangle" size={15} /> Editing HTML directly disconnects it from the visual block document. Return to Visual builder before saving to preserve drag-and-drop editing.</div>
                <Textarea value={bodyHtml} onChange={event => { setBodyHtml(event.target.value); setHtmlDetached(true); }} aria-label="Advanced HTML source" />
                <iframe title="HTML preview" sandbox="" srcDoc={bodyHtml} />
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Installed / system templates view ─────────────────────────────────────── */

function InstalledView() {
  const [templates, setTemplates] = useState<SysTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SysTpl | null>(null);

  useEffect(() => {
    apiFetch('/v1/email-templates/')
      .then((rows: SysTpl[]) => setTemplates(rows))
      .catch((err: any) => showAlert(err?.message ?? 'Could not load templates'))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(key: string, updated: Partial<SysTpl>) {
    setTemplates(prev => prev.map(t => t.template_key === key ? { ...t, ...updated, is_customized: true } : t));
  }

  if (loading) return <SectionLoading />;

  const q = search.trim().toLowerCase();
  const visible = templates.filter(t =>
    !q || t.subject.toLowerCase().includes(q) || t.template_key.toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q)
  );

  const grouped = visible.reduce<Record<string, SysTpl[]>>((acc, t) => {
    const cat = t.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="etab-inst">
      <div className="etab-inst-toolbar">
        <div className="etab-mkt-search-wrap">
          <Icon name="search" size={13} />
          <input className="etab-mkt-search" placeholder="Search system templates…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="etab-mkt-count">{visible.length} template{visible.length !== 1 ? 's' : ''}</span>
      </div>
      {visible.length === 0 ? (
        <div className="etab-mkt-empty"><Icon name="layers" size={28} /><p>No templates match</p></div>
      ) : (
        <div className="etab-inst-groups">
          {Object.entries(grouped).map(([cat, rows]) => (
            <div key={cat} className="etab-inst-group">
              <div className="etab-inst-group-hdr">
                <span className="etab-inst-group-title">{cat}</span>
                <span className="etab-inst-group-count">{rows.length}</span>
              </div>
              <div className="etab-inst-list">
                {rows.map(t => (
                  <button key={t.template_key} type="button" className="etab-inst-row" onClick={() => setEditing(t)}>
                    <div className="etab-inst-row-main">
                      <span className="etab-inst-row-subject">{t.subject}</span>
                      <code className="etab-inst-row-key">{t.template_key}</code>
                    </div>
                    <div className="etab-inst-row-meta">
                      {t.is_customized && <Badge variant="success">Customized</Badge>}
                      <Icon name="chevronRight" size={14} className="etab-inst-row-arrow" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <SystemTemplateDialog
          tpl={editing}
          onSaved={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ── Browse view (marketplace) ──────────────────────────────────────────────── */

function BrowseView() {
  const [templates, setTemplates] = useState<MktTemplate[]>([]);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'all' | 'official' | 'third-party'>('all');
  const [category, setCategory] = useState('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selected, setSelected] = useState<MktTemplate | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/marketplace/email-templates?limit=500'),
      apiFetch('/v1/marketplace/email-templates/imported'),
    ]).then(([rows, imports]: [MktTemplate[], Array<{ id: string }>]) => {
      setTemplates(rows);
      setImportedIds(new Set(imports.map(i => i.id)));
    }).catch((err: any) => showAlert(err?.message ?? 'Could not load marketplace'))
      .finally(() => setLoading(false));
  }, []);

  async function importTemplate(tpl: MktTemplate) {
    setImportingId(tpl.id);
    try {
      await apiFetch(`/v1/marketplace/email-templates/${tpl.id}/import`, { method: 'POST' });
      setImportedIds(prev => new Set([...prev, tpl.id]));
      showAlert('Template imported. It now appears in System Templates.', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Import failed');
    } finally {
      setImportingId(null);
    }
  }

  useEffect(() => setPage(1), [search, source, category, pageSize]);

  if (loading) return <SectionLoading />;

  const q = search.trim().toLowerCase();
  const visible = templates.filter(t => {
    if (source === 'official' && !t.is_hudumika_official) return false;
    if (source === 'third-party' && t.is_hudumika_official) return false;
    if (category !== 'all' && t.category !== category) return false;
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    return true;
  });
  const categories = Array.from(new Set(templates.map(t => t.category))).sort();
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeStart = visible.length ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(currentPage * pageSize, visible.length);

  return (
    <div className="etab-mkt">
      <div className="etab-mkt-toolbar">
        <div className="etab-mkt-source-btns">
          {(['all', 'official', 'third-party'] as const).map(s => (
            <button key={s} type="button" className={`etab-mkt-source-btn${source === s ? ' etab-mkt-source-btn--on' : ''}`} onClick={() => setSource(s)}>
              {s === 'all' ? 'All' : s === 'official' ? 'Official' : 'Third Party'}
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="etab-mkt-category"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(cat => <SelectItem key={cat} value={cat}>{MKT_CAT_LABEL[cat] ?? cat}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="etab-mkt-search-wrap">
          <Icon name="search" size={13} />
          <input className="etab-mkt-search" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="etab-mkt-displaybar">
        <span className="etab-mkt-count">{visible.length} template{visible.length !== 1 ? 's' : ''}</span>
        <div className="etab-mkt-display-actions">
          <span className="etab-mkt-show-label">Show</span>
          <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
            <SelectTrigger className="etab-mkt-page-size"><SelectValue /></SelectTrigger>
            <SelectContent>{[6, 12, 24, 48].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
          </Select>
          <div className="etab-mkt-layout-switch" aria-label="Template layout">
            <button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'is-active' : ''} onClick={() => setLayout('grid')}><Icon name="grid" size={15} /></button>
            <button type="button" aria-label="List view" aria-pressed={layout === 'list'} className={layout === 'list' ? 'is-active' : ''} onClick={() => setLayout('list')}><Icon name="list" size={15} /></button>
          </div>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="etab-mkt-empty">
          <Icon name="package" size={28} />
          <p>{q ? 'No templates match your search' : 'No templates available'}</p>
        </div>
      ) : (
        <>
        <div className={`etab-mkt-list etab-mkt-list--${layout}`}>
          {paged.map(t => (
            <div key={t.id} role="button" tabIndex={0} className={`etab-mkt-row${importedIds.has(t.id) ? ' etab-mkt-row--imported' : ''}`} onClick={() => { setSelected(t); setPreviewMode('desktop'); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(t); setPreviewMode('desktop'); } }}>
              <div className="etab-mkt-row-top">
                <span className="etab-mkt-row-title">{t.title}</span>
                <div className="etab-mkt-row-badges">
                  <Badge variant={t.is_hudumika_official ? 'brand' : 'gray'}>{t.is_hudumika_official ? 'Official' : 'Third Party'}</Badge>
                  <Badge variant="gray">{MKT_CAT_LABEL[t.category] ?? t.category}</Badge>
                </div>
              </div>
              <p className="etab-mkt-row-desc">{t.description}</p>
              <div className="etab-mkt-row-foot">
                <span className="etab-mkt-row-by">By {t.author_name}</span>
                {t.downloads > 0 && <span className="etab-mkt-row-dl"><Icon name="download" size={11} /> {t.downloads.toLocaleString()} imports</span>}
                <Button
                  size="sm"
                  variant={importedIds.has(t.id) ? 'outline' : 'default'}
                  disabled={importedIds.has(t.id) || importingId === t.id}
                  onClick={event => { event.stopPropagation(); importTemplate(t); }}
                >
                  {importingId === t.id ? 'Importing…' : importedIds.has(t.id) ? 'Imported' : 'Import'}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="etab-mkt-pagination">
          <span>Showing {rangeStart}–{rangeEnd} of {visible.length}</span>
          <div>
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
            <span>Page {currentPage} of {pageCount}</span>
            <Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</Button>
          </div>
        </div>
        </>
      )}
      {selected && (
        <Dialog open onOpenChange={open => !open && setSelected(null)}>
          <DialogContent size="xl" className="etab-mkt-preview-dialog">
            <DialogHeader>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>{selected.description}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="etab-mkt-preview-toolbar">
                <div><Badge variant={selected.is_hudumika_official ? 'brand' : 'gray'}>{selected.is_hudumika_official ? 'Official' : 'Third Party'}</Badge><Badge variant="gray">{MKT_CAT_LABEL[selected.category] ?? selected.category}</Badge></div>
                <div className="etab-mkt-layout-switch">
                  <button type="button" className={previewMode === 'desktop' ? 'is-active' : ''} onClick={() => setPreviewMode('desktop')}><Icon name="monitor" size={14} /> Desktop</button>
                  <button type="button" className={previewMode === 'mobile' ? 'is-active' : ''} onClick={() => setPreviewMode('mobile')}><Icon name="smartphone" size={14} /> Mobile</button>
                </div>
              </div>
              <div className="etab-mkt-preview-stage">
                <div className={`etab-mkt-preview-client etab-mkt-preview-client--${previewMode}`}>
                  <div className="etab-mkt-preview-envelope"><strong>{selected.subject}</strong>{selected.preheader && <span>{selected.preheader}</span>}</div>
                  <iframe title={`${selected.title} preview`} sandbox="" srcDoc={selected.body_html} />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <span className="etab-mkt-preview-author">By {selected.author_name} · Version {selected.version}</span>
              <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              <Button disabled={importedIds.has(selected.id) || importingId === selected.id} onClick={() => importTemplate(selected)}>{importedIds.has(selected.id) ? 'Imported' : importingId === selected.id ? 'Importing…' : 'Import template'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Marketplace tab (container) ────────────────────────────────────────────── */

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
      setImportedIds(previous => new Set([...previous, template.id]));
      showAlert(`"${template.title}" imported to My Templates.`, { variant: 'success' });
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
        <Icon name="arrowLeft" size={13} /> My Templates
      </button>
    <div className="etab-marketplace-shell">
      <div className="etab-marketplace-heading">
        <div>
          <span className="etab-marketplace-eyebrow">CURATED FOR YOUR WORKSPACE</span>
          <h2>Featured email templates</h2>
        </div>
        <div className="etab-marketplace-search">
          <Icon name="search" size={15} />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Marketplace templates…" aria-label="Search Marketplace templates" />
          {search && <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="x" size={14} /></Button>}
        </div>
        <div className="etab-marketplace-heading-actions">
          <div className="etab-marketplace-view-switch" role="group" aria-label="Template view">
            <Button size="icon" variant="outline" className={layout === 'grid' ? 'is-active' : ''} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Icon name="grid" size={15} /></Button>
            <Button size="icon" variant="outline" className={layout === 'list' ? 'is-active' : ''} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><Icon name="list" size={15} /></Button>
          </div>
          <Button aria-label="View all templates in Marketplace" onClick={() => navigate('/store?cat=email-templates')}>
            <span className="etab-marketplace-view-all-label">View all in Marketplace</span><Icon name="arrowRight" size={14} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="etab-marketplace-loading"><SectionLoading /></div>
      ) : templates.length === 0 ? (
        <div className="etab-marketplace-empty">
          <FeaturedIcon size="lg" variant="gray"><Icon name="mail" size={20} /></FeaturedIcon>
          <strong>No featured templates yet</strong>
          <span>Visit Marketplace again when new templates are published.</span>
        </div>
      ) : (
        <div className={`etab-marketplace-featured-grid etab-marketplace-featured-grid--${layout}`}>
          {templates.map(template => {
            const icon = categoryIcon(template.category);
            return (
              <div key={template.id} className="etab-marketplace-featured-card">
                <div className="etab-marketplace-card-top">
                  <FeaturedIcon size="lg" variant={icon.variant}><Icon name={icon.name} size={20} /></FeaturedIcon>
                  <Badge variant={template.is_hudumika_official ? 'brand' : 'gray'}>{template.is_hudumika_official ? 'Official' : 'Verified'}</Badge>
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
                    <Button size="xs" variant={importedIds.has(template.id) ? 'outline' : 'default'} disabled={importedIds.has(template.id) || importingId === template.id} onClick={() => importTemplate(template)}>
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
        <div><Icon name="info" size={15} /><span>Marketplace templates become editable copies after import.</span></div>
        <Button variant="outline" onClick={() => navigate('/store?cat=email-templates')}>Browse the full collection</Button>
      </div>
    </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

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
              subtitle="Reusable templates for compose and automated system emails."
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
