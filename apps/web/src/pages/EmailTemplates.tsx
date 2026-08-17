import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Textarea } from '../components/ui/textarea.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import type { EmailTemplateView, EmailTemplateCategory } from '@hudumika/types';

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
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!selected) return;
    if (!(await showConfirm(`Revert "${selected.template_key}" to its default content? Your customization will be lost.`, { confirmLabel: 'Revert' }))) return;
    await apiFetch(`/v1/email-templates/${selected.template_key}`, { method: 'DELETE' });
    load();
  }

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: templates.filter(t => t.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Email Templates</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>Every automated email the platform sends, grouped by category.</div>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <Accordion type="multiple" defaultValue={CATEGORY_ORDER} className="flex flex-col gap-2">
            {grouped.map(g => (
              <AccordionItem key={g.category} value={g.category}>
                <AccordionTrigger>{CATEGORY_LABEL[g.category]} <span style={{ fontWeight: 400, color: 'var(--ink3)', marginLeft: 4 }}>({g.items.length})</span></AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {g.items.map(t => (
                      <button
                        key={t.template_key}
                        onClick={() => selectTemplate(t)}
                        style={{
                          textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                          background: t.template_key === selectedKey ? 'var(--teal-l)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                          {t.is_customized && <Badge variant="brand">Customized</Badge>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{t.template_key}</div>
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!selected ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13.5 }}>Select a template to edit.</div>
        ) : (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{selected.template_key}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{CATEGORY_LABEL[selected.category]}</div>
              </div>
              {selected.is_customized && (
                <button onClick={handleRevert} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="refresh" size={13} color="var(--red)" /> Revert to default
                </button>
              )}
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="input-field"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Body (HTML)</label>
              <Textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={12} style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} />
            </div>

            {selected.available_vars.length > 0 && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--ink3)', display: 'block', marginBottom: 6 }}>Merge tags — click to insert</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.available_vars.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBodyHtml(prev => `${prev}{{${v}}}`)}
                      style={{ fontSize: 11, fontFamily: 'var(--mono)', padding: '4px 8px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--teal)', cursor: 'pointer' }}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleSave} disabled={saving || !subject.trim() || !bodyHtml.trim()} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
