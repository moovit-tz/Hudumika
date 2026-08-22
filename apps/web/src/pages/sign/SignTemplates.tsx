// ─── SignTemplates.tsx — Template library page ────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { SignTemplate } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import './Sign.css';

interface BulkSendResult { email: string; ok: boolean; envelope_id?: string; error?: string }

/** DocuSign's real bulk-send shape: one template mapped onto a list of
 *  recipients, each becoming their own independent envelope. A simple
 *  paste-a-list box is enough here — this collects one flat list of rows,
 *  not the kind of branching, multi-step input CLAUDE.md's no-popup-forms
 *  guidance is about. */
function BulkSendModal({ template, onClose }: { template: SignTemplate; onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<BulkSendResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = raw.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [name, email, phone] = line.split(',').map(p => p.trim());
    return { name, email, phone };
  });
  const validRows = rows.filter(r => r.name && r.email);

  async function handleSend() {
    if (!validRows.length) return;
    setSending(true);
    setError(null);
    try {
      const result = await apiFetch(`/v1/sign/templates/${template.id}/bulk-send`, {
        method: 'POST',
        body: JSON.stringify({ recipients: validRows }),
      });
      setResults(result.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bulk send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--card-bg)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--sign-shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name="send" size={18} style={{ color: 'var(--teal)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Bulk send — {template.name}</h3>
        </div>

        {!results ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 14px' }}>
              One line per recipient — a separate envelope is created and sent to each: <code>Name, email@example.com, phone (optional)</code>
            </p>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={'Jane Mwangi, jane@example.com\nJuma Hassan, juma@example.com, 0712345678'}
              rows={8}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
              {validRows.length} of {rows.length} line(s) recognized
            </div>
            {error && <div style={{ fontSize: 12.5, color: 'var(--sign-red)', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSend} disabled={!validRows.length || sending}
                style={{ flex: 2, padding: '9px', borderRadius: 8, background: validRows.length ? 'var(--teal)' : 'var(--border)', color: '#fff', border: 'none', cursor: validRows.length ? 'pointer' : 'default', fontSize: 13.5, fontWeight: 600 }}>
                {sending ? 'Sending…' : `Send to ${validRows.length || 0} recipient(s)`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 600, margin: '10px 0', color: 'var(--ink)' }}>
              {results.filter(r => r.ok).length} sent, {results.filter(r => !r.ok).length} failed
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: r.ok ? 'var(--sign-green-l)' : 'var(--sign-red-l)', fontSize: 12.5 }}>
                  <Icon name={r.ok ? 'checkCircle' : 'xCircle'} size={13} style={{ color: r.ok ? 'var(--sign-green)' : 'var(--sign-red)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink)' }}>{r.email}</span>
                  {!r.ok && <span style={{ marginLeft: 'auto', color: 'var(--sign-red)' }}>{r.error}</span>}
                </div>
              ))}
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function SignTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkSendTarget, setBulkSendTarget] = useState<SignTemplate | null>(null);

  useEffect(() => {
    apiFetch('/v1/sign/templates').then(setTemplates).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await apiFetch(`/v1/sign/templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Templates</h2>
        <button onClick={() => navigate('/sign/editor')}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
          + New Envelope from Scratch
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ color: 'var(--ink3)', textAlign: 'center', marginTop: 48 }}>Loading templates…</div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 64, color: 'var(--ink3)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="clipboardList" size={48} style={{ opacity: 0.25 }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No templates yet</div>
            <div style={{ fontSize: 14, maxWidth: 320, margin: '0 auto 20px' }}>
              Save an envelope layout as a template to reuse it quickly for future documents.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="clipboard" size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{t.description}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={11} /> {(t.recipients as unknown[]).length ?? 0} recipient(s)</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="fileText" size={11} /> {(t.fields as unknown[]).length ?? 0} field(s)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => navigate(`/sign/editor?template=${t.id}`)}
                    style={{ flex: 2, padding: '8px', borderRadius: 7, background: 'var(--teal)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Use Template
                  </button>
                  <button onClick={() => setBulkSendTarget(t)}
                    title="Send this template to a list of recipients — one envelope each"
                    style={{ flex: 1, padding: '8px', borderRadius: 7, border: '1px solid var(--sign-blue)', background: 'transparent', color: 'var(--sign-blue)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Icon name="send" size={12} /> Bulk
                  </button>
                  <button onClick={() => deleteTemplate(t.id)}
                    style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink3)', cursor: 'pointer', fontSize: 13 }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {bulkSendTarget && <BulkSendModal template={bulkSendTarget} onClose={() => setBulkSendTarget(null)} />}
    </div>
  );
}
