import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading, ButtonSpinner } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { StudioPagination } from './StudioPagination.js';
import { SingleSelectFilter, SearchToolbar } from '../../components/ui/filter-dropdown.js';
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
  const [app, setApp] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [readiness, setReadiness] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [app, q, readiness]);
  const filtered = templates.filter(t => (!app || t.app === app) && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())) && (!readiness || (readiness === 'registered' ? t.triggerRegistered : !t.triggerRegistered)));
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 6)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const hasActiveFilters = app !== null || readiness !== null || q.trim().length > 0;
  const clearFilters = () => {
    setApp(null);
    setReadiness(null);
    setQ('');
    setPage(1);
  };

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
    <div className="studio-page studio-template-page">
      <PageHeader
        crumbs={['Studio', 'Templates']}
        titlePlain="Workflow"
        titleEm="templates"
        subtitle={<>Ready-made workflows built from real triggers and actions. Installing creates a <strong>draft</strong> you can edit — nothing runs until you switch it on.</>}
      />

      <div className="workflow-toolbar">
        <SingleSelectFilter
          label="App"
          value={app}
          onChange={setApp}
          options={Array.from(new Map(templates.map(t => [t.app, t.appName])).entries()).map(([value, label]) => ({ value, label }))}
        />
        <SingleSelectFilter
          label="Trigger"
          value={readiness}
          onChange={setReadiness}
          options={[
            { value: 'registered', label: 'Registered' },
            { value: 'missing', label: 'Missing' },
          ]}
        />
        <div className="workflow-search">
          <SearchToolbar search={q} onSearch={setQ} placeholder="Search templates by name or description…" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {loading && <SectionLoading label="Loading workflow templates…" />}

      {!loading && !filtered.length && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--card-bg, var(--white))' }}>
          <Icon name="copy" size={28} color="var(--ink3)" />
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {hasActiveFilters ? 'No matching templates found.' : 'No templates available.'}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, maxWidth: 360, margin: '6px auto 14px' }}>
            {hasActiveFilters ? 'Try adjusting your app or trigger filters to find what you need.' : 'Workflow templates will appear here once published.'}
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 'var(--space-lg)' }}>
            {filtered.slice((current - 1) * 6, current * 6).map(t => (
              <div
                key={t.id}
                className="studio-card-interactive"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--card-radius)',
                  background: 'var(--card-bg, var(--white))',
                  padding: 'var(--card-padding)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: 'var(--elev-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: t.color }}>{t.appName}</span>
                  <Badge variant="gray" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {t.steps} step{t.steps === 1 ? '' : 's'}
                  </Badge>
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5, flex: 1 }}>
                  {t.description}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                  <Icon name="zap" size={13} color="var(--green)" />
                  {t.triggerRegistered ? (
                    <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>{t.triggerLabel}</span>
                  ) : (
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>{t.triggerEvent} — not registered</span>
                  )}
                </div>

                {t.needs.length > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--gold)', display: 'flex', gap: 6, alignItems: 'flex-start', background: 'var(--gold-l)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                    <Icon name="alertCircle" size={13} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Requires before activation: {t.needs.join(', ')}</span>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  style={{ marginTop: 4, width: '100%' }}
                  disabled={!t.triggerRegistered || busy === t.id}
                  onClick={() => install(t)}
                >
                  {busy === t.id ? (
                    <>
                      <ButtonSpinner /> Installing template…
                    </>
                  ) : t.triggerRegistered ? (
                    <>
                      <Icon name="plus" size={13} /> Use this template
                    </>
                  ) : (
                    'Unavailable'
                  )}
                </Button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <StudioPagination page={current} total={filtered.length} size={6} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
