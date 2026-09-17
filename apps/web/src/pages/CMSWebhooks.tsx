import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { SwitchRow, CheckboxRow } from '../components/ui/list-item-row.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { CmsWebhook, CmsWebhookEvent } from '@hudumika/types';

const EVENTS: { value: CmsWebhookEvent; label: string; description: string }[] = [
  { value: 'page.published', label: 'Page published', description: 'A page is created or edited while set to Published.' },
  { value: 'post.published', label: 'Post published', description: 'A blog post is created or edited while set to Published.' },
  { value: 'entry.published', label: 'Content entry published', description: 'A custom content-model entry is created or edited while set to Published.' },
  { value: 'media.uploaded', label: 'Media uploaded', description: 'A new image or file is added to the Media library.' },
];

/**
 * §78 of the CMS master brief — outbound webhooks. Fire-and-forget by
 * design (no retry queue, no delivery log yet) — the "Send test" button is
 * the only way to confirm a receiver is reachable, so it's surfaced
 * prominently rather than as an afterthought.
 */
export function CMSWebhooks() {
  const [hooks, setHooks] = useState<CmsWebhook[] | null>(null);
  const [form, setForm] = useState<{ url: string; events: CmsWebhookEvent[] }>({ url: '', events: [] });
  const [saving, setSaving] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  function load() {
    apiFetch('/v1/cms/webhooks').then(setHooks).catch(() => setHooks([]));
  }
  useEffect(load, []);

  function toggleEvent(ev: CmsWebhookEvent, checked: boolean) {
    setForm(f => ({ ...f, events: checked ? [...f.events, ev] : f.events.filter(e => e !== ev) }));
  }

  async function handleCreate() {
    if (!form.url.trim()) return showAlert('A URL is required.');
    if (form.events.length === 0) return showAlert('Pick at least one event to send.');
    setSaving(true);
    try {
      const hook: CmsWebhook = await apiFetch('/v1/cms/webhooks', { method: 'POST', body: JSON.stringify(form) });
      setForm({ url: '', events: [] });
      setRevealedSecret({ id: hook.id, secret: hook.secret! });
      load();
    } catch (e: any) {
      showAlert(`Failed to add webhook: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(hook: CmsWebhook, enabled: boolean) {
    try {
      await apiFetch(`/v1/cms/webhooks/${hook.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      load();
    } catch (e: any) {
      showAlert(`Failed to update: ${e.message}`);
    }
  }

  async function handleDelete(hook: CmsWebhook) {
    if (!(await showConfirm(`Delete this webhook? ${hook.url}`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/webhooks/${hook.id}`, { method: 'DELETE' });
      if (revealedSecret?.id === hook.id) setRevealedSecret(null);
      load();
    } catch (e: any) {
      showAlert(`Failed to delete: ${e.message}`);
    }
  }

  async function handleTest(hook: CmsWebhook) {
    setTesting(hook.id);
    try {
      const result: { ok: boolean; status?: number; error?: string } = await apiFetch(`/v1/cms/webhooks/${hook.id}/test`, { method: 'POST' });
      if (result.ok) showAlert(`Test event delivered — receiver responded ${result.status}.`);
      else showAlert(`Test event failed: ${result.error ?? `receiver responded ${result.status}`}`);
    } catch (e: any) {
      showAlert(`Failed to send test: ${e.message}`);
    } finally {
      setTesting(null);
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      showAlert('Signing secret copied.');
    } catch {
      showAlert(secret);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Webhooks']}
        titlePlain="Outbound"
        titleEm="webhooks"
        subtitle="Notify another system the moment content changes — an HMAC-signed POST fires to your URL when a chosen event happens. Best-effort delivery: no retry queue or delivery log yet, so use Send test to confirm a receiver is reachable."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 680 }}>
        <div className="card" style={{ padding: '18px 20px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Add a webhook</div>
          <input className="input-field" placeholder="https://example.com/hooks/hudumika" value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Send on</div>
            <div className="card" style={{ padding: '0 14px' }}>
              {EVENTS.map(ev => (
                <CheckboxRow key={ev.value} title={ev.label} description={ev.description}
                  checked={form.events.includes(ev.value)} onCheckedChange={c => toggleEvent(ev.value, c)} />
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Adding…' : 'Add webhook'}
          </button>
        </div>

        {revealedSecret && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, border: '1px solid var(--gold)', background: 'var(--gold-l)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Signing secret — shown once</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>Store this now; it won't be shown again. Use it to verify the <code>X-Hudumika-Signature</code> header (HMAC-SHA256 of the raw request body).</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 11.5, padding: '6px 10px', background: 'var(--white)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', overflow: 'auto', whiteSpace: 'nowrap' }}>{revealedSecret.secret}</code>
              <button onClick={() => copySecret(revealedSecret.secret)} className="btn btn-secondary btn-sm"><Icon name="copy" size={12} /> Copy</button>
            </div>
          </div>
        )}

        {hooks === null ? <SectionLoading /> : hooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}>
            No webhooks yet — add one above to get notified when content changes.
          </div>
        ) : (
          <div className="card" style={{ padding: '0 18px' }}>
            {hooks.map(hook => (
              <div key={hook.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>{hook.url}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {hook.events.map(ev => <Badge key={ev} variant="gray">{EVENTS.find(e => e.value === ev)?.label ?? ev}</Badge>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleTest(hook)} disabled={testing === hook.id} className="btn btn-secondary btn-sm">
                      <Icon name="send" size={12} /> {testing === hook.id ? 'Sending…' : 'Send test'}
                    </button>
                    <button onClick={() => handleDelete(hook)} title="Delete" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 10px', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center' }}>
                      <Icon name="trash2" size={13} />
                    </button>
                  </div>
                </div>
                <SwitchRow title="Enabled" description={hook.enabled ? 'This webhook fires on its selected events.' : 'Paused — no events will be sent.'}
                  checked={hook.enabled} onCheckedChange={c => handleToggleEnabled(hook, c)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
