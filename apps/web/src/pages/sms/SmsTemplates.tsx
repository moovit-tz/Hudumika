import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsFilterMenu, SmsListPagination, SmsListToolbar, useSmsList } from './SmsListControls.js';

interface Template {
  id: string;
  name: string;
  body: string;
  created_at: string;
}

export function SmsTemplates() {
  usePageSEO('SMS Templates & DLT Patterns', 'Reusable dynamic message templates with {{variable}} placeholders, DLT categorization and instant preview.');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'segments'>('newest');

  const [form, setForm] = useState({ name: '', body: '' });
  const [testVars, setTestVars] = useState<Record<string, string>>({
    name: 'Sarah Mwangi',
    amount: '45,000 TZS',
    code: '892014',
    due_date: 'Tomorrow',
  });

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/templates')
      .then(res => setTemplates(res.data || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function startCreate() {
    setEditing(null);
    setForm({ name: '', body: '' });
    setShowForm(true);
    setError(null);
  }

  function startEdit(t: Template) {
    setEditing(t);
    setForm({ name: t.name, body: t.body });
    setShowForm(true);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || !form.body.trim()) {
      setError('Template name and message body are both required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/v1/sms/templates/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name.trim(), body: form.body.trim() }),
        });
      } else {
        await apiFetch('/v1/sms/templates', {
          method: 'POST',
          body: JSON.stringify({ name: form.name.trim(), body: form.body.trim() }),
        });
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (
      !(await showConfirm(`"${name}" will be permanently removed.`, {
        title: 'Delete template?',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    ) {
      return;
    }
    setTemplates(prev => prev.filter(t => t.id !== id));
    await apiFetch(`/v1/sms/templates/${id}`, { method: 'DELETE' }).catch(load);
  }

  // Live preview interpolation
  const previewBody = useMemo(() => {
    let result = form.body;
    for (const [k, v] of Object.entries(testVars)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}|\\{${k}\\}|\\{#${k}#\\}`, 'gi'), v);
    }
    return result;
  }, [form.body, testVars]);

  const filteredTemplates = useMemo(() => {
    const result = templates.filter(t => {
      const matchSearch =
        !search.trim() ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.body.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
    return result.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'segments' ? Math.ceil(b.body.length / 160) - Math.ceil(a.body.length / 160) : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [templates, search, sortBy]);
  const list = useSmsList(filteredTemplates);

  function exportSelected() {
    downloadSmsCsv(`sms-templates-${new Date().toISOString().slice(0, 10)}.csv`, ['Template', 'Message Pattern', 'Segments', 'Created At'],
      list.selectedItems.map(t => [t.name, t.body, Math.ceil(t.body.length / 160) || 1, t.created_at]));
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Templates']}
        titlePlain="Message"
        titleEm="Templates"
        subtitle="Reusable dynamic {{variable}} templates for quick sends, automated notifications, and bulk campaigns."
        actions={
          <Button onClick={startCreate}>
            <Icon name="plus" size={14} /> New Template
          </Button>
        }
      />

      {/* Editor & Live Preview Card */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title={editing ? 'Edit Template' : 'New Template'} collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
              {/* Form Input Side */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ marginBottom: 2 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                    Template Name *
                  </label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Payment Reminder or OTP Verification"
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>
                      Template Message Body *
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['{{name}}', '{{amount}}', '{{code}}', '{{due_date}}'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, body: `${p.body} ${tag}` }))}
                          style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            color: 'var(--teal)',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                         data-ui-native-button="">
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={form.body}
                    onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                    placeholder="Hello {{name}}, your payment of {{amount}} is due on {{due_date}}."
                    rows={4}
                    maxLength={1600}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                    {(() => {
                      const nonGsm = /[^\u000a\u000c\u000d -~ ¡£¤¥§¿ÄÅÆÇÉÑÖØÜßàäåæçèéìñòöøùü]/.test(form.body);
                      const single = nonGsm ? 70 : 160;
                      const multi = nonGsm ? 67 : 153;
                      const segs = form.body.length === 0 ? 0 : form.body.length <= single ? 1 : Math.ceil(form.body.length / multi);
                      return `${form.body.length} characters · ${segs || 1} segment(s)${nonGsm ? ' · Unicode' : ''}`;
                    })()}
                  </div>
                </div>

                {error && <div style={{ color: 'var(--red)', fontSize: 12.5 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button disabled={saving} onClick={save}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>

              {/* Sample Variable Interpolation Preview */}
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Live Interpolation Preview
                </div>

                <div
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '12px 14px',
                    fontSize: 13,
                    color: 'var(--ink)',
                    lineHeight: 1.45,
                    minHeight: 80,
                  }}
                >
                  {previewBody || 'Type in the template body to test dynamic output…'}
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  Variables are automatically replaced with real customer data during broadcast.
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Templates Grid List */}
      <div style={{ marginBottom: 16 }}>
        <SmsListToolbar search={search} onSearch={setSearch} placeholder="Search templates…" total={filteredTemplates.length}
          page={list.page} pageSize={list.pageSize} selectedCount={list.selectedIds.size} onPageSizeChange={list.setPageSize}
          onExport={exportSelected} activeFilterCount={sortBy === 'newest' ? 0 : 1}
          filterContent={() => <SmsFilterMenu showClear={sortBy !== 'newest'} onClear={() => setSortBy('newest')}>
            <SingleSelectFilter label="Sort" value={sortBy} onChange={value => setSortBy((value ?? 'newest') as typeof sortBy)} options={[
              { value: 'newest', label: 'Newest first' }, { value: 'name', label: 'Name A–Z' }, { value: 'segments', label: 'Most segments' },
            ]} />
          </SmsFilterMenu>} />
      </div>

      <SectionCard title="Template Library" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : filteredTemplates.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No message templates found. Click <strong>New Template</strong> to add your first standard pattern.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 44, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false} onCheckedChange={list.toggleAll} aria-label="Select all filtered templates" />
                  </th>
                  {['Template Name', 'Template Pattern', 'Segments', 'Created', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--ink3)',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.pageItems.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}><Checkbox checked={list.selectedIds.has(t.id)} onCheckedChange={() => list.toggle(t.id)} aria-label={`Select ${t.name}`} /></td>
                    <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {t.name}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 12.5,
                        color: 'var(--ink2)',
                        maxWidth: 420,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.body}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {(() => {
                        const nonGsm = /[^\u000a\u000c\u000d -~ ¡£¤¥§¿ÄÅÆÇÉÑÖØÜßàäåæçèéìñòöøùü]/.test(t.body);
                        const single = nonGsm ? 70 : 160;
                        const multi = nonGsm ? 67 : 153;
                        return t.body.length <= single ? 1 : Math.ceil(t.body.length / multi);
                      })()}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Link to="/sms/compose">
                          <Button size="sm" variant="outline">
                            <Icon name="send" size={12} /> Use
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                          <Icon name="edit" size={13} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(t.id, t.name)}>
                          <Icon name="trash" size={13} color="var(--red)" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </SectionCard>
    </div>
  );
}
