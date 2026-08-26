// ─── SignTemplates.tsx — Template library page ────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type { SignTemplate } from '@hudumika/types';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { PageHeader } from '../../components/PageHeader.js';
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
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-140 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="send" size={18} style={{ color: 'var(--teal)' }} />
            Bulk send — {template.name}
          </DialogTitle>
        </DialogHeader>

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
              <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
              <Button variant="default" onClick={handleSend} disabled={!validRows.length || sending} style={{ flex: 2 }}>
                {sending ? 'Sending…' : `Send to ${validRows.length || 0} recipient(s)`}
              </Button>
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
            <Button variant="default" onClick={onClose} style={{ width: '100%', marginTop: 16 }}>Done</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
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
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
        <PageHeader
          crumbs={['Sign', 'Templates']}
          titlePlain="Envelope"
          titleEm="templates"
          subtitle="Reusable document layouts for 1-click envelope creation & bulk sending."
          actions={
            <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ fontWeight: 600 }}>
              <Icon name="plus" size={14} /> New Envelope from Scratch
            </Button>
          }
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 140, borderRadius: 12, background: 'var(--border)', opacity: 0.4, animation: 'pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, textAlign: 'center', color: 'var(--ink3)', padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="layers" size={24} style={{ color: 'var(--ink3)', opacity: 0.6 }} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No templates yet</div>
            <div style={{ fontSize: 13, maxWidth: 340, lineHeight: 1.5, marginBottom: 20 }}>
              Save an envelope layout as a template to reuse field placements and recipients quickly for future documents.
            </div>
            <Button variant="default" onClick={() => navigate('/sign/editor')} style={{ fontWeight: 600 }}>
              <Icon name="plus" size={14} /> Create New Template
            </Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {templates.map(t => (
              <div key={t.id} className="sign-envelope-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="layers" size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', gap: 14, background: 'var(--bg)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="user" size={11} /> {(t.recipients as unknown[]).length ?? 0} recipient(s)</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="fileText" size={11} /> {(t.fields as unknown[]).length ?? 0} field(s)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <Button variant="default" size="sm" onClick={() => navigate(`/sign/editor?template=${t.id}`)} style={{ flex: 2, fontWeight: 600 }}>
                    Use Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBulkSendTarget(t)}
                    title="Send this template to a list of recipients — one envelope each"
                    style={{ flex: 1, borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                    <Icon name="send" size={12} /> Bulk
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => deleteTemplate(t.id)} style={{ color: 'var(--sign-red)' }}>
                    <Icon name="trash" size={12} />
                  </Button>
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
