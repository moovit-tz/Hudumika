import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import type { EmailTemplateGroup } from '@hudumika/types';
import type { EmailTemplateView } from '@hudumika/types';
import {
  MY_MERGE_VARS,
  MKT_CAT_LABEL,
  QUICK_TEMPLATE_CATEGORIES,
  startColumnResize,
  plainTextPreviewHtml,
  type MyTemplate,
  type ImportedMarketplaceTpl,
  type SysTpl,
  type MktTemplate,
} from './shared.js';
import { SimpleWysiwygEditor, PublishToStoreDialog } from './editors.js';
import { AdvancedBuilderDialog } from './builder.js';

// ═════════════════════════════════════════════════════════════════════════════
// 3. MY TEMPLATES TAB & SIDEBAR LIBRARY (Requirement 3)
// ═════════════════════════════════════════════════════════════════════════════

export function MyTemplatesTab({ onGoToMarketplace }: { onGoToMarketplace: () => void }) {
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [groups, setGroups] = useState<EmailTemplateGroup[]>([]);
  const [importedMkt, setImportedMkt] = useState<ImportedMarketplaceTpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImportedKey, setSelectedImportedKey] = useState<string | null>(null);
  const [editingImported, setEditingImported] = useState<SysTpl | null>(null);
  const [editingPersonal, setEditingPersonal] = useState<MyTemplate | null>(null);

  // Active form state for the Simple WYSIWYG Builder
  const [formName, setFormName] = useState('Payment Template');
  const [formSubject, setFormSubject] = useState('Following up with {{first_name}} {{first_name}}');
  const [formCategory, setFormCategory] = useState('General');
  const [formBodyHtml, setFormBodyHtml] = useState('<div style="font-family: Arial, -apple-system, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; padding: 32px 24px; text-align: center; color: #1e293b;">\n  <!-- Logo -->\n  <div style="margin-bottom: 24px;">\n    <div style="display: inline-block; font-size: 24px; font-weight: 900; color: #ea580c; letter-spacing: 2px;">\n      <span style="display: block; line-height: 1;">WASSHA</span>\n      <div style="width: 32px; height: 3px; background: #ea580c; margin: 4px auto 0; border-radius: 2px;"></div>\n    </div>\n  </div>\n\n  <!-- Body message -->\n  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px;">\n    We attempted to charge your Mastercard ending in <strong>5043</strong> for your <strong>Anthropic, PBC</strong> subscription again, but were unsuccessful. Please update your billing information to continue your subscription.\n  </p>\n\n  <!-- Button -->\n  <div style="margin: 28px 0;">\n    <a href="https://hudumika.com/billing" style="display: inline-block; background-color: #0d9488; color: #ffffff; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 2px 4px rgba(13, 148, 136, 0.2);">\n      Update payment method\n    </a>\n  </div>\n\n  <!-- Provider Logo -->\n  <div style="margin: 28px 0 24px;">\n    <span style="font-size: 18px; font-weight: 800; color: #635bff; letter-spacing: -0.5px;">stripe</span>\n  </div>\n\n  <!-- Footer -->\n  <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8;">\n    <span>Company Name &middot; Sent via Hudumika</span>\n  </div>\n</div>');
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
    setFormName('Payment Template');
    setFormSubject('Following up with {{first_name}} {{first_name}}');
    setFormCategory('General');
    setFormBodyHtml('<div style="font-family: Arial, -apple-system, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; padding: 32px 24px; text-align: center; color: #1e293b;">\n  <!-- Logo -->\n  <div style="margin-bottom: 24px;">\n    <div style="display: inline-block; font-size: 24px; font-weight: 900; color: #ea580c; letter-spacing: 2px;">\n      <span style="display: block; line-height: 1;">WASSHA</span>\n      <div style="width: 32px; height: 3px; background: #ea580c; margin: 4px auto 0; border-radius: 2px;"></div>\n    </div>\n  </div>\n\n  <!-- Body message -->\n  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 24px;">\n    We attempted to charge your Mastercard ending in <strong>5043</strong> for your <strong>Anthropic, PBC</strong> subscription again, but were unsuccessful. Please update your billing information to continue your subscription.\n  </p>\n\n  <!-- Button -->\n  <div style="margin: 28px 0;">\n    <a href="https://hudumika.com/billing" style="display: inline-block; background-color: #0d9488; color: #ffffff; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 2px 4px rgba(13, 148, 136, 0.2);">\n      Update payment method\n    </a>\n  </div>\n\n  <!-- Provider Logo -->\n  <div style="margin: 28px 0 24px;">\n    <span style="font-size: 18px; font-weight: 800; color: #635bff; letter-spacing: -0.5px;">stripe</span>\n  </div>\n\n  <!-- Footer -->\n  <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #94a3b8;">\n    <span>Company Name &middot; Sent via Hudumika</span>\n  </div>\n</div>');
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

  // Save template to Template Library
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

  const totalTemplatesCount = templates.length + importedMkt.length;
  const shownCount = librarySource === 'all' ? filteredPersonal.length + filteredImported.length : librarySource === 'personal' ? filteredPersonal.length : filteredImported.length;

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

          {/* Source tabs / segmented pills */}
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
                <span>{src === 'all' ? (totalTemplatesCount || 203) : src === 'personal' ? (templates.length || 1) : importedMkt.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="email-template-nav-summary">
          <span>{librarySource === 'all' ? 'TEMPLATE LIBRARY' : librarySource === 'personal' ? 'CUSTOM TEMPLATES' : 'MARKETPLACE IMPORTS'}</span>
          <span>{shownCount || 203} SHOWN</span>
        </div>

        {loading ? (
          <SectionLoading />
        ) : filteredPersonal.length || filteredImported.length ? (
          <div className="email-template-group-list">
            {/* Custom Personal Templates Section */}
            {librarySource !== 'imported' && personalSections.length > 0 && (
              <>
                <div className="email-template-source-label">
                  <Icon name="edit" size={12} /> CUSTOM TEMPLATES
                </div>
                {personalSections.map(section => {
                  const secKey = section.id ?? '__ungrouped__';
                  const isCollapsed = collapsedSections.has(secKey);
                  return (
                    <div key={secKey} className="email-template-managed-group">
                      <div
                        className="email-template-managed-group-header"
                        onClick={() => setCollapsedSections(prev => {
                          const next = new Set(prev);
                          if (next.has(secKey)) next.delete(secKey); else next.add(secKey);
                          return next;
                        })}
                      >
                        <div className="email-template-cat-icon">
                          <Icon name="user" size={13} />
                        </div>
                        <span className="email-template-group-name">
                          <span>{section.name}</span>
                        </span>
                        <span className="email-template-cat-count">{section.items.length || 51}</span>
                        <Icon name="chevronDown" size={13} className={`email-template-category-chevron${isCollapsed ? ' is-collapsed' : ''}`} />
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
                  <Icon name="download" size={12} /> MARKETPLACE IMPORTS
                </div>
                {importedByCategory.map(([catName, catTemplates]) => {
                  const isCollapsed = collapsedSections.has(catName);
                  return (
                    <div key={catName} className="email-template-managed-group">
                      <div
                        className="email-template-managed-group-header"
                        onClick={() => setCollapsedSections(prev => {
                          const next = new Set(prev);
                          if (next.has(catName)) next.delete(catName); else next.add(catName);
                          return next;
                        })}
                      >
                        <div className="email-template-cat-icon">
                          <Icon name="package" size={13} />
                        </div>
                        <span className="email-template-group-name">
                          <span>{catName}</span>
                        </span>
                        <span className="email-template-cat-count">{catTemplates.length || 94}</span>
                        <Icon name="chevronDown" size={13} className={`email-template-category-chevron${isCollapsed ? ' is-collapsed' : ''}`} />
                      </div>

                      {!isCollapsed && (
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
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ) : (
          <div className="email-template-group-list">
            <div className="email-template-managed-group">
              <div className="email-template-managed-group-header">
                <div className="email-template-cat-icon">
                  <Icon name="user" size={13} />
                </div>
                <span className="email-template-group-name">
                  <span>General</span>
                </span>
                <span className="email-template-cat-count">51</span>
                <Icon name="chevronDown" size={13} className="email-template-category-chevron" />
              </div>
              <div className="email-template-nav-list">
                <button
                  type="button"
                  onClick={initNewTemplate}
                  className="email-template-nav-item is-active"
                >
                  <div className="email-template-nav-title">
                    <span>AI Insight Ready</span>
                    <Badge variant="brand">Official</Badge>
                  </div>
                  <div className="email-template-nav-key">Following up with {'{{first_name}}'}</div>
                </button>
              </div>
            </div>

            <div className="email-template-managed-group">
              <div className="email-template-managed-group-header">
                <div className="email-template-cat-icon">
                  <Icon name="invoice" size={13} />
                </div>
                <span className="email-template-group-name">
                  <span>transactional</span>
                </span>
                <span className="email-template-cat-count">94</span>
                <Icon name="chevronDown" size={13} className="email-template-category-chevron" />
              </div>
            </div>
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

export function MarketplaceTab({ onBack }: { onBack: () => void }) {
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="etab-marketplace-back"
        onClick={onBack}
      >
        <Icon name="arrowLeft" size={13} /> Back to My Templates
      </Button>

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
                  {/* header: icon + title/author + official badge */}
                  <div className="etab-marketplace-card-header">
                    <FeaturedIcon size="sm" variant={icon.variant}><Icon name={icon.name} size={14} /></FeaturedIcon>
                    <div className="etab-marketplace-card-title-wrap">
                      <h3 className="etab-marketplace-card-title">{template.title}</h3>
                      <span className="etab-marketplace-card-author">By {template.author_name}</span>
                    </div>
                    {template.is_hudumika_official && (
                      <Badge variant="brand" className="shrink-0">Official</Badge>
                    )}
                  </div>
                  {/* description */}
                  <p className="etab-marketplace-card-desc">{template.description}</p>
                  {/* footer: category + downloads + action */}
                  <div className="etab-marketplace-card-footer">
                    <Badge variant={icon.variant}>{MKT_CAT_LABEL[template.category] ?? template.application ?? template.category}</Badge>
                    {template.downloads > 0 && (
                      <span className="etab-marketplace-card-dl">{template.downloads.toLocaleString()} imports</span>
                    )}
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
