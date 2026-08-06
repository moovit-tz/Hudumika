import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { PageHeader } from '../../components/PageHeader.js';

interface TemplateRow {
  id: string; name: string; description: string;
  app: string; appName: string; color: string;
  triggerEvent: string; triggerLabel: string | null; triggerRegistered: boolean;
  steps: number; needs: string[];
}

/**
 * Template gallery.
 *
 * Installing always produces a DRAFT — never a live automation. Templates that
 * still need a value (a recipient, a threshold) say so on the card instead of
 * presenting themselves as ready, and one whose trigger is not registered is
 * shown as uninstallable rather than quietly failing later.
 */
export function TemplateGallery() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/workflow-studio/templates')
      .then(r => { if (alive) setTemplates(r.data ?? []); })
      .catch(e => { if (alive) setError(e?.message ?? 'Could not load templates.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function install(t: TemplateRow) {
    setBusy(t.id); setError('');
    try {
      const res = await apiFetch(`/v1/workflow-studio/templates/${t.id}/install`, { method: 'POST', body: JSON.stringify({}) });
      navigate(`/studio/w/${res.data.id}`);
    } catch (e: any) { setError(e?.message ?? 'Could not install this template.'); setBusy(null); }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      <PageHeader
        crumbs={['Studio', 'Templates']}
        titlePlain="Workflow"
        titleEm="templates"
        subtitle="Ready-made workflows built from real triggers and actions. Installing creates a <strong>draft</strong> you can edit — nothing runs until you switch it on."
      />

      {error && <div style={{ padding: '9px 13px', background: 'var(--red-l)', color: 'var(--red)', borderRadius: 9, fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: 'var(--ink3)', fontSize: 13, padding: 20 }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {templates.map(t => (
          <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))', padding: 15, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: t.color }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: t.color }}>{t.appName}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>{t.steps} step{t.steps === 1 ? '' : 's'}</span>
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)', lineHeight: 1.35 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, flex: 1 }}>{t.description}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)' }}>
              <Icon name="zap" size={12} color="var(--green)" />
              {t.triggerRegistered ? t.triggerLabel : <span style={{ color: 'var(--red)' }}>{t.triggerEvent} — not registered</span>}
            </div>

            {t.needs.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--gold)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="alertCircle" size={12} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Needs before it can run: {t.needs.join(', ')}</span>
              </div>
            )}

            <Button type="button" variant="outline" size="sm" style={{ marginTop: 2, width: "100%" }}
              disabled={!t.triggerRegistered || busy === t.id} onClick={() => install(t)}>
              {busy === t.id ? 'Creating…' : t.triggerRegistered ? 'Use this template' : 'Unavailable'}
            </Button>
          </div>
        ))}
      </div>

      {!loading && templates.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12 }}>
          No templates available.
        </div>
      )}
    </div>
  );
}
