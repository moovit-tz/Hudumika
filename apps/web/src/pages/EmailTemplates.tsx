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
type QuickTemplateCategory = typeof QUICK_TEMPLATE_CATEGORIES[number];

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
}

// ── Publish-to-store dialog ──────────────────────────────────────────────────

function PublishToStoreDialog({ templateKey, templateTitle, onClose }: {
  templateKey: string;
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
        body: JSON.stringify({ template_key: templateKey, title: title.trim(), description: description.trim(), tags }),
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
}

function MyTemplatesTab({ onGoToMarketplace }: { onGoToMarketplace: () => void }) {
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [groups, setGroups] = useState<EmailTemplateGroup[]>([]);
  const [importedMkt, setImportedMkt] = useState<ImportedMarketplaceTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImportedKey, setSelectedImportedKey] = useState<string | null>(null);
  const [editingImported, setEditingImported] = useState<SysTpl | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [showEditImportedDialog, setShowEditImportedDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [formError, setFormError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [navWidth, setNavWidth] = useState(280);
  const [previewWidth, setPreviewWidth] = useState(400);

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

  function selectTemplate(t: MyTemplate) {
    setFormError('');
    setSelectedId(t.id);
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
  }

  function newTemplate() {
    setFormError('');
    setSelectedId(null);
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
        setDraft({ ...draft, ...payload, body_html: row.body_html ?? '', id: row.id });
        showAlert('Template saved.', { variant: 'success' });
      } else {
        const row: MyTemplate = await apiFetch('/v1/email/quick-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setTemplates(prev => [...prev, row]);
        setSelectedId(row.id);
        setDraft({ ...draft, id: row.id, body_html: row.body_html ?? '' });
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
      if (remaining.length) selectTemplate(remaining[0]);
      else newTemplate();
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

  async function createGroup() {
    const name = window.prompt('Group name')?.trim();
    if (!name) return;
    try { await apiFetch('/v1/email/template-groups', { method: 'POST', body: JSON.stringify({ name }) }); loadTemplates(); }
    catch (err: unknown) { showAlert(err instanceof Error ? err.message : 'Could not create group.'); }
  }

  async function renameGroup(group: EmailTemplateGroup) {
    const name = window.prompt('Rename group', group.name)?.trim();
    if (!name || name === group.name) return;
    await apiFetch(`/v1/email/template-groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); loadTemplates();
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
  const personalSections = [...groups.map(group => ({ id: group.id, name: group.name, group })), { id: null, name: 'Ungrouped', group: null }]
    .map(section => ({ ...section, items: filtered.filter(t => (t.group_id ?? null) === section.id).sort((a, b) => a.sort_order - b.sort_order) }))
    .filter(section => section.items.length > 0 || section.group !== null);

  const previewHtml = draft ? (draft.is_html ? draft.body_html : plainTextPreviewHtml(draft.body)) : '';
  const showPreview = previewHtml.trim().length > 0;

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

          <button type="button" className="email-template-new-btn" onClick={newTemplate}>
            <Icon name="plus" size={14} /> <span>New template</span>
          </button>
          <div className="email-template-new-row">
            <button type="button" className="email-template-new-btn email-template-new-btn--secondary email-template-new-btn--half" onClick={createGroup}>
              <Icon name="folder" size={14} /> <span>New group</span>
            </button>
            <button type="button" className="email-template-new-btn email-template-new-btn--secondary email-template-new-btn--half email-template-new-btn--import" onClick={onGoToMarketplace}>
              <Icon name="download" size={14} /> <span>Import</span>
            </button>
          </div>
        </div>

        <div className="email-template-nav-summary">
          <span>{templates.length + importedMkt.length} template{templates.length + importedMkt.length !== 1 ? 's' : ''}</span>
          <span>{templates.filter(t => t.is_html).length} HTML</span>
        </div>

        {loading ? (
          <SectionLoading />
        ) : filtered.length || groups.length ? (
          <div className="email-template-group-list">
            {personalSections.map((section, groupIndex) => <div key={section.id ?? '__ungrouped__'} className="email-template-managed-group">
              <div className="email-template-managed-group-header">
                <span>{section.name}</span><Badge variant="gray">{section.items.length}</Badge>
                {section.group && <div className="email-template-group-actions">
                  <button type="button" onClick={() => moveGroup(groupIndex, -1)} aria-label="Move group up">↑</button>
                  <button type="button" onClick={() => moveGroup(groupIndex, 1)} aria-label="Move group down">↓</button>
                  <button type="button" onClick={() => renameGroup(section.group!)} aria-label="Rename group"><Icon name="edit" size={12} /></button>
                  <button type="button" onClick={() => deleteGroup(section.group!)} aria-label="Delete group"><Icon name="trash" size={12} /></button>
                </div>}
              </div>
              <div className="email-template-nav-list">
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
              </div>
            </div>)}

            {/* Imported marketplace templates section */}
            {importedMkt.filter(t => !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())).length > 0 && (
              <div className="email-template-managed-group">
                <div className="email-template-managed-group-header">
                  <Icon name="download" size={13} />
                  <span>Imported</span>
                  <Badge variant="brand">{importedMkt.length}</Badge>
                </div>
                <div className="email-template-nav-list">
                  {importedMkt
                    .filter(t => !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))
                    .map(t => (
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
                          <Badge variant="brand">Imported</Badge>
                        </div>
                        {t.subject && <div className="email-template-nav-key">{t.subject}</div>}
                        <div className="email-template-nav-cat">{t.category}</div>
                      </button>
                    ))}
                </div>
              </div>
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

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <main className="email-template-editor">
        {draft === null && editingImported ? (
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
            <div className="email-template-imported-panel-actions">
              <Button variant="outline" onClick={() => setPublishOpen(true)}>
                <Icon name="package" size={13} /> Publish to Store
              </Button>
              <Button onClick={() => setShowEditImportedDialog(true)}>
                <Icon name="edit" size={13} /> Edit template
              </Button>
            </div>
          </div>
        ) : draft === null ? (
          <div className="email-template-editor-placeholder">
            <Icon name="layers" size={40} color="var(--ink3)" />
            <p>Select a template to edit, or click <strong>New template</strong>.</p>
          </div>
        ) : (
          <div className="email-template-editor-inner">
            <div className="email-template-editor-titlebar">
              <div>
                <div className="email-template-editor-key">
                  {draft.id ? 'Edit template' : 'New template'}
                </div>
                {dirty && <Badge variant="warning">Unsaved changes</Badge>}
              </div>
              <div className="email-template-editor-titlebar-actions">
                {draft.id && (
                  <button type="button" className="email-template-revert" onClick={handleDelete}>
                    <Icon name="trash" size={13} color="var(--red)" /> Delete
                  </button>
                )}
              </div>
            </div>

            {formError && (
              <div className="email-template-form-error" role="alert">
                <Icon name="alertCircle" size={15} /> {formError}
              </div>
            )}

            <div className="email-template-field">
              <label>Template name</label>
              <Input
                value={draft.name}
                onChange={e => setDraft(d => d ? { ...d, name: e.target.value } : d)}
                placeholder="e.g. Welcome email, Monthly newsletter…"
              />
            </div>

            <div className="email-template-field">
              <label>Category</label>
              <Select value={draft.category} onValueChange={v => setDraft(d => d ? { ...d, category: v as QuickTemplateCategory } : d)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUICK_TEMPLATE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="email-template-field">
              <label>Group</label>
              <Select value={draft.group_id ?? '__none__'} onValueChange={v => setDraft(d => d ? { ...d, group_id: v === '__none__' ? null : v } : d)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ungrouped</SelectItem>
                  {groups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="email-template-field">
              <label>Subject line <span>(optional — pre-fills compose subject)</span></label>
              <Input
                value={draft.subject}
                onChange={e => setDraft(d => d ? { ...d, subject: e.target.value } : d)}
                placeholder="Optional subject"
              />
            </div>

            {/* Type toggle */}
            <div className="email-template-type-row">
              <span className="email-template-type-label">Format</span>
              <div className="email-template-type-toggle">
                <button
                  type="button"
                  className={`email-template-type-btn${!draft.is_html ? ' is-active' : ''}`}
                  onClick={() => setDraft(d => d ? { ...d, is_html: false } : d)}
                >
                  <Icon name="fileText" size={13} /> Plain text
                </button>
                <button
                  type="button"
                  className={`email-template-type-btn${draft.is_html ? ' is-active' : ''}`}
                  onClick={() => setDraft(d => d ? { ...d, is_html: true } : d)}
                >
                  <Icon name="terminal" size={13} /> HTML
                </button>
              </div>
              {draft.is_html && (
                <>
                  <Tip label="Import an .html file — the server sanitizes it before it reaches the editor">
                    <button
                      type="button"
                      className="email-template-import-btn"
                      disabled={importing}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name={importing ? 'refresh' : 'upload'} size={13} />
                      {importing ? 'Importing…' : 'Import .html file'}
                    </button>
                  </Tip>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".html,.htm"
                    style={{ display: 'none' }}
                    onChange={handleFileImport}
                  />
                </>
              )}
            </div>

            {/* Quick Merge Variables */}
            <div className="email-template-tags">
              <label>Merge variables <span>Click to insert into template</span></label>
              <div className="email-template-tag-list">
                {MY_MERGE_VARS.map(v => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVar(v.tag)}
                    className="email-template-tag"
                  >
                    {`{{${v.tag}}}`}
                  </button>
                ))}
              </div>
            </div>

            {draft.is_html ? (
              <div className="email-template-field email-template-body-field">
                <div className="email-template-field-label">
                  <label>HTML body</label>
                  <span>Full HTML + inline CSS supported · scripts and event handlers are stripped on save</span>
                </div>
                <Textarea
                  ref={bodyInputRef}
                  value={draft.body_html}
                  onChange={e => setDraft(d => d ? { ...d, body_html: e.target.value } : d)}
                  onPaste={handleHtmlPaste}
                  rows={18}
                  className="email-template-code"
                  placeholder="<!doctype html>&#10;<html>…</html>"
                />
              </div>
            ) : (
              <div className="email-template-field email-template-body-field">
                <div className="email-template-field-label">
                  <label>Body</label>
                  <span>Plain text — line breaks preserved</span>
                </div>
                <Textarea
                  ref={bodyInputRef}
                  value={draft.body}
                  onChange={e => setDraft(d => d ? { ...d, body: e.target.value } : d)}
                  rows={14}
                  placeholder="Hi {{first_name}},&#10;&#10;…"
                />
              </div>
            )}

            <div className="email-template-actions">
              <button type="button" className="email-template-mobile-preview" onClick={() => setPreviewOpen(true)}><Icon name="eye" size={14} /> Preview</button>
              {draft.id && dirty && (
                <button type="button" className="em-text-btn" onClick={() => selectTemplate(selected!)}>
                  Discard changes
                </button>
              )}
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create template'}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* ── Live preview (HTML templates only) ───────────────────────────── */}
      {showPreview && (
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
  const [saving, setSaving] = useState(false);
  const previewHtml = bodyHtml;

  function insertVar(v: string) {
    setBodyHtml(prev => prev + `{{${v}}}`);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await apiFetch(`/v1/email-templates/${encodeURIComponent(tpl.template_key)}`, {
        method: 'PUT',
        body: JSON.stringify({ subject, preheader, body_html: bodyHtml, body_plain: tpl.body_plain, locale: tpl.locale, status: 'active' }),
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
      <DialogContent size="xl">
        <DialogHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DialogTitle style={{ flex: 1 }}>{tpl.subject}</DialogTitle>
            {tpl.is_customized && <Badge variant="success">Customized</Badge>}
          </div>
          <DialogDescription>
            <code style={{ fontSize: 11, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{tpl.template_key}</code>
            {tpl.category && <> · {tpl.category}</>}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="etab-sys-dlg-body">
            <div className="etab-sys-dlg-fields">
              <div className="etab-sys-dlg-field">
                <label className="etab-sys-dlg-label">Subject</label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" />
              </div>
              <div className="etab-sys-dlg-field">
                <label className="etab-sys-dlg-label">Preview text</label>
                <Input value={preheader} onChange={e => setPreheader(e.target.value)} placeholder="Preview line shown in inbox…" />
              </div>
              <div className="etab-sys-dlg-field etab-sys-dlg-field--grow">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="etab-sys-dlg-label">HTML body</label>
                  {tpl.available_vars.length > 0 && (
                    <div className="etab-sys-vars">
                      {tpl.available_vars.slice(0, 8).map(v => (
                        <button key={v} type="button" className="etab-sys-var-chip" onClick={() => insertVar(v)}>
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Textarea
                  value={bodyHtml}
                  onChange={e => setBodyHtml(e.target.value)}
                  className="etab-sys-editor"
                  rows={14}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
            <div className="etab-sys-dlg-preview">
              <div className="etab-sys-preview-bar">
                <span className="etab-sys-preview-label">Preview</span>
              </div>
              <div className="etab-sys-preview-frame">
                <iframe
                  title="Template preview"
                  sandbox=""
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#f9f9f9' }}
                />
              </div>
            </div>
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

function MarketplaceTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MktTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/marketplace/email-templates?limit=4')
      .then((rows: MktTemplate[]) => setTemplates(rows))
      .catch((err: any) => showAlert(err?.message ?? 'Could not load Marketplace templates'))
      .finally(() => setLoading(false));
  }, []);

  const categoryIcon = (category: string) => {
    if (category === 'finance') return { name: 'invoice' as const, variant: 'success' as const };
    if (category === 'auth' || category === 'security') return { name: 'lock' as const, variant: 'gray' as const };
    if (category === 'hr') return { name: 'userCheck' as const, variant: 'info' as const };
    if (category === 'clearos') return { name: 'ship' as const, variant: 'brand' as const };
    return { name: 'mail' as const, variant: 'brand' as const };
  };

  return (
    <div className="etab-marketplace-shell">
      <div className="etab-marketplace-heading">
        <div>
          <span className="etab-marketplace-eyebrow">CURATED FOR YOUR WORKSPACE</span>
          <h2>Featured email templates</h2>
          <p>Preview a selection here, then open Marketplace to browse, compare and import templates.</p>
        </div>
        <Button onClick={() => navigate('/store?cat=email-templates')}>
          View all in Marketplace <Icon name="arrowRight" size={14} />
        </Button>
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
        <div className="etab-marketplace-featured-grid">
          {templates.map(template => {
            const icon = categoryIcon(template.category);
            return (
              <button key={template.id} type="button" className="etab-marketplace-featured-card" onClick={() => navigate('/store?cat=email-templates')}>
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
                  <Badge variant="gray">{MKT_CAT_LABEL[template.category] ?? template.category}</Badge>
                  <span>{template.downloads > 0 ? `${template.downloads.toLocaleString()} imports` : 'New'}</span>
                  <Icon name="arrowRight" size={14} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="etab-marketplace-footer">
        <div><Icon name="info" size={15} /><span>Marketplace templates become editable copies after import.</span></div>
        <Button variant="outline" onClick={() => navigate('/store?cat=email-templates')}>Browse the full collection</Button>
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
          <MarketplaceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
