import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { CmsSite, CreateCmsSiteInput, UpdateCmsSiteInput } from '@hudumika/types';

export function CMSSites() {
  const [sites, setSites] = useState<CmsSite[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<CmsSite | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    slug: string;
    domain: string;
    is_default: boolean;
  }>({
    name: '',
    slug: '',
    domain: '',
    is_default: false,
  });

  function load() {
    setLoading(true);
    apiFetch<CmsSite[]>('/v1/cms/sites')
      .then(res => setSites(res ?? []))
      .catch(() => setSites([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingSite(null);
    setForm({ name: '', slug: '', domain: '', is_default: false });
    setModalOpen(true);
  }

  function openEdit(site: CmsSite) {
    setEditingSite(site);
    setForm({
      name: site.name,
      slug: site.slug,
      domain: site.domain || '',
      is_default: site.is_default,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return showAlert('Site name is required.');
    if (!form.slug.trim()) return showAlert('Site slug is required.');

    setSaving(true);
    try {
      if (editingSite) {
        const payload: UpdateCmsSiteInput = {
          name: form.name.trim(),
          domain: form.domain.trim() || null,
          is_default: form.is_default,
        };
        await apiFetch(`/v1/cms/sites/${editingSite.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showAlert('Site updated successfully.');
      } else {
        const payload: CreateCmsSiteInput = {
          name: form.name.trim(),
          slug: form.slug.trim().toLowerCase(),
          domain: form.domain.trim() || null,
          is_default: form.is_default,
        };
        await apiFetch('/v1/cms/sites', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showAlert('New site created successfully.');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      showAlert(`Failed to save site: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleMakeDefault(site: CmsSite) {
    if (site.is_default) return;
    try {
      await apiFetch(`/v1/cms/sites/${site.id}/make-default`, { method: 'POST' });
      showAlert(`"${site.name}" is now the default site.`);
      load();
    } catch (err: any) {
      showAlert(`Failed to set default: ${err.message}`);
    }
  }

  async function handleDelete(site: CmsSite) {
    if (site.is_default) {
      return showAlert('Cannot delete the primary/default site. Assign another site as default first.');
    }
    const confirmed = await showConfirm(`Are you sure you want to delete site "${site.name}"? Content assigned to this site will become unassigned.`, {
      confirmLabel: 'Delete Site',
    });
    if (!confirmed) return;

    try {
      await apiFetch(`/v1/cms/sites/${site.id}`, { method: 'DELETE' });
      showAlert('Site deleted.');
      load();
    } catch (err: any) {
      showAlert(`Failed to delete site: ${err.message}`);
    }
  }

  const defaultSite = sites?.find(s => s.is_default);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={[{ label: 'CMS', to: '/cms' }, { label: 'Sites' }]}
        title="Multisite Management"
        subtitle="Manage multiple independent domains, microsites, and regional web portals under one unified CMS (§23 Multisite)."
        actions={
          <button
            onClick={openCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: 'var(--teal)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={16} />
            New Site
          </button>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {/* Info Banner */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>TOTAL ACTIVE SITES</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{sites?.length ?? 0}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>PRIMARY SITE</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="globe" size={16} />
              {defaultSite ? defaultSite.name : 'None'}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>CUSTOM DOMAIN MAPPING</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              CNAME / A-record route resolution active
            </div>
          </div>
        </div>

        {loading ? (
          <SectionLoading />
        ) : !sites || sites.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px dashed var(--border)',
            }}
          >
            <Icon name="globe" size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No Sites Configured</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Create your primary site or regional microsites to start organizing your web presence.
            </p>
            <button
              onClick={openCreate}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: 'var(--teal)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Create Default Site
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {sites.map(site => (
              <div
                key={site.id}
                style={{
                  background: 'var(--surface)',
                  border: site.is_default ? '2px solid var(--teal)' : '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'relative',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: site.is_default ? 'var(--teal-l)' : 'var(--bg-muted)',
                          color: site.is_default ? 'var(--teal)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="globe" size={18} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{site.name}</h4>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>slug: <code>{site.slug}</code></div>
                      </div>
                    </div>
                    {site.is_default ? (
                      <Badge variant="success">Primary Default</Badge>
                    ) : (
                      <Badge variant="secondary">Secondary Site</Badge>
                    )}
                  </div>

                  <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-muted)', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Custom Domain:</span>
                      <span style={{ fontWeight: 600, color: site.domain ? 'var(--text)' : 'var(--text-muted)' }}>
                        {site.domain ? site.domain : 'None (path routed)'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Created:</span>
                      <span>{new Date(site.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {!site.is_default && (
                    <button
                      onClick={() => handleMakeDefault(site)}
                      style={{
                        fontSize: 12,
                        color: 'var(--teal)',
                        background: 'transparent',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Make Default
                    </button>
                  )}
                  {site.is_default && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Root Route</span>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => openEdit(site)}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Edit
                    </button>
                    {!site.is_default && (
                      <button
                        onClick={() => handleDelete(site)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: 6,
                          border: '1px solid #fee2e2',
                          background: '#fff1f2',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {editingSite ? 'Edit Site Settings' : 'Create New Site'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Site Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({
                      ...f,
                      name,
                      slug: !editingSite && !f.slug ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) : f.slug,
                    }));
                  }}
                  placeholder="e.g. Careers & Recruitment Portal"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Site Slug (Identifier) *
                </label>
                <input
                  type="text"
                  value={form.slug}
                  disabled={!!editingSite}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))}
                  placeholder="e.g. careers"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: editingSite ? 'var(--bg-muted)' : 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Used for scoped routing: <code>/s/{form.slug || 'slug'}/*</code>
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value.toLowerCase().trim() }))}
                  placeholder="e.g. careers.company.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Point your domain DNS CNAME to <code>host.hudumika.com</code>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="is_default_check"
                  checked={form.is_default}
                  onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                />
                <label htmlFor="is_default_check" style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  Set as Primary / Default Site for this workspace
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--teal)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : editingSite ? 'Update Site' : 'Create Site'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
