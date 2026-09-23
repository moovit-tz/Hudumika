import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion.js';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import type { EmailTemplateView, EmailTemplateCategory } from '@hudumika/types';
import './EmailTemplates.css';

const CATEGORY_LABEL: Record<EmailTemplateCategory, string> = {
  transactional: 'Transactional & Billing',
  support: 'Support & Service',
  account: 'Account & Staff',
};
const CATEGORY_ORDER: EmailTemplateCategory[] = ['transactional', 'support', 'account'];

export function EmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  function load() {
    setLoading(true);
    apiFetch('/v1/email-templates')
      .then((rows: EmailTemplateView[]) => {
        setTemplates(rows);
        // Re-sync the open editor with fresh data — a save/revert changes what
        // the currently selected template's content actually is server-side,
        // and the form must reflect that instead of showing what was just
        // overwritten (or reverted away from).
        const current = rows.find(t => t.template_key === selectedKey);
        if (current) selectTemplate(current);
        else if (!selectedKey && rows.length) selectTemplate(rows[0]);
      })
      .catch((err: unknown) => showAlert(err instanceof Error ? err.message : 'Could not load email templates.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectTemplate(t: EmailTemplateView) {
    setSelectedKey(t.template_key);
    setSubject(t.subject);
    setBodyHtml(t.body_html);
  }

  const selected = templates.find(t => t.template_key === selectedKey) ?? null;

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/email-templates/${selected.template_key}`, {
        method: 'PUT',
        body: JSON.stringify({ subject, body_html: bodyHtml }),
      });
      load();
      showAlert('Template saved.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not save this template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!selected) return;
    if (!(await showConfirm(`Revert "${selected.template_key}" to its default content? Your customization will be lost.`, { confirmLabel: 'Revert' }))) return;
    try {
      await apiFetch(`/v1/email-templates/${selected.template_key}`, { method: 'DELETE' });
      load();
      showAlert('Template restored to its default content.', { variant: 'success' });
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Could not restore this template.');
    }
  }

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: templates.filter(t => t.category === cat && (!search.trim() || t.subject.toLowerCase().includes(search.toLowerCase()) || t.template_key.toLowerCase().includes(search.toLowerCase()))),
  })).filter(g => g.items.length > 0);

  const dirty = !!selected && (subject !== selected.subject || bodyHtml !== selected.body_html);

  return (
    <div className="email-templates-page">
      <div className="email-templates-header">
        <PageHeader crumbs={['Email', 'Templates']} titlePlain="Email" titleEm="templates" subtitle="Every automated email the platform sends, grouped by category." />
      </div>
      <div className="email-templates-workspace">
        <aside className="email-templates-nav">
          <div className="email-template-search">
            <Icon name="search" size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates" aria-label="Search templates" />
            {search && (
              <Tip label="Clear search">
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="x" size={13} /></button>
              </Tip>
            )}
          </div>
          <div className="email-template-nav-summary">
            <span>{templates.length} templates</span>
            <span>{templates.filter(t => t.is_customized).length} customized</span>
          </div>
          {loading ? <SectionLoading /> : grouped.length ? <Accordion type="multiple" defaultValue={CATEGORY_ORDER} className="flex flex-col gap-2">
            {grouped.map(g => (
              <AccordionItem key={g.category} value={g.category} className="email-template-category-card">
                <AccordionTrigger>{CATEGORY_LABEL[g.category]} <span className="email-template-category-count">{g.items.length}</span></AccordionTrigger>
                <AccordionContent><div className="email-template-nav-list">{g.items.map(t => (
                  <button key={t.template_key} type="button" onClick={() => selectTemplate(t)} className={`email-template-nav-item${t.template_key === selectedKey ? ' is-active' : ''}`}>
                    <div className="email-template-nav-title"><span>{t.subject}</span>{t.is_customized && <Badge variant="brand">Customized</Badge>}</div>
                    <div className="email-template-nav-key">{t.template_key}</div>
                  </button>
                ))}</div></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion> : <div className="email-template-no-results">No templates match “{search}”.</div>
          }
        </aside>

      <main className="email-template-editor">
        {!selected ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13.5 }}>Select a template to edit.</div>
        ) : (
          <div className="email-template-editor-inner">
            <div className="email-template-editor-titlebar">
              <div>
                <div className="email-template-editor-key">{selected.template_key}</div>
                <div className="email-template-editor-meta">{CATEGORY_LABEL[selected.category]} {dirty && <Badge variant="warning">Unsaved changes</Badge>}</div>
              </div>
              {selected.is_customized && (
                <button className="email-template-revert" onClick={handleRevert}>
                  <Icon name="refresh" size={13} color="var(--red)" /> Revert to default
                </button>
              )}
            </div>

            <div className="email-template-field">
              <label>Subject line</label>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>

            <div className="email-template-field email-template-body-field">
              <div className="email-template-field-label"><label>Message body</label><span>HTML supported</span></div>
              <Textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={16} className="email-template-code" />
            </div>

            {selected.available_vars.length > 0 && (
              <div className="email-template-tags">
                <label>Merge tags <span>Click to insert</span></label>
                <div className="email-template-tag-list">
                  {selected.available_vars.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBodyHtml(prev => `${prev}{{${v}}}`)}
                      className="email-template-tag"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="email-template-actions">
            <Button onClick={handleSave} disabled={saving || !dirty || !subject.trim() || !bodyHtml.trim()}>
              {saving ? 'Saving…' : 'Save template'}
            </Button>
            </div>
          </div>
        )}
      </main>
      {selected && <aside className="email-template-preview">
        <div className="email-template-preview-header"><div><span>Live preview</span><small>Desktop email</small></div><Icon name="eye" size={16} /></div>
        <div className="email-template-preview-envelope">
          <div className="email-template-preview-subject">{subject || 'Untitled email'}</div>
          <div className="email-template-preview-from">Hudumika notifications</div>
          <iframe title="Email template preview" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033;padding:24px;line-height:1.55;font-size:14px}a{color:#0d7a6b}</style></head><body>${bodyHtml}</body></html>`} />
        </div>
        <div className="email-template-preview-note"><Icon name="info" size={14} /> Merge tags remain as placeholders in preview.</div>
      </aside>}
      </div>
    </div>
  );
}
