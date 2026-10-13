import React, { useEffect, useState } from 'react';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { StudioPagination } from './StudioPagination.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.js';
import type { WorkflowStudioTriggerDef, WorkflowStudioActionDef } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';

const KIND_LABEL: Record<string, string> = {
  DOMAIN_EVENT: 'Something happened in an app',
  SCHEDULE: 'On a schedule',
  MANUAL: 'When someone presses Run',
};

/**
 * The building blocks a workflow can be made of, straight from the API's
 * registries. This page is the honest answer to "what can Studio actually do?" —
 * if an integration is not listed here, it does not exist.
 */
export function CatalogPage() {
  const [triggers, setTriggers] = useState<WorkflowStudioTriggerDef[]>([]);
  const [actions, setActions] = useState<WorkflowStudioActionDef[]>([]);
  const [q, setQ] = useState('');
  const [app, setApp] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('triggers');
  useEffect(() => { setPage(1); }, [app, q, tab]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([apiFetch('/v1/workflow-studio/triggers'), apiFetch('/v1/workflow-studio/actions')])
      .then(([t, a]) => { if (!alive) return; setTriggers(t.data ?? []); setActions(a.data ?? []); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const shownTriggers = triggers.filter(t => (!app || t.app === app) && match(`${t.label} ${t.id} ${t.appName} ${t.description}`));
  const shownActions = actions.filter(a => (!app || a.app === app) && match(`${a.label} ${a.id} ${a.appName} ${a.description}`));

  const hasActiveFilters = app !== null || q.trim().length > 0;
  const clearFilters = () => {
    setApp(null);
    setQ('');
    setPage(1);
  };

  const actionPageSize = 9;
  const actionPages = Math.max(1, Math.ceil(shownActions.length / actionPageSize));
  const currentActionPage = Math.min(page, actionPages);
  const pagedActions = shownActions.slice((currentActionPage - 1) * actionPageSize, currentActionPage * actionPageSize);

  return (
    <div className="studio-page">
      <PageHeader
        crumbs={['Studio', 'Triggers & actions']}
        titlePlain="Triggers &"
        titleEm="actions"
        subtitle="Everything a workflow can react to and everything it can do. Each entry is backed by real code — a trigger is only listed once an app genuinely emits it."
      />

      <div className="workflow-toolbar">
        <SingleSelectFilter
          label="App"
          value={app}
          onChange={setApp}
          options={Array.from(new Map([...triggers, ...actions].map(t => [t.app, t.appName])).entries()).map(([value, label]) => ({ value, label }))}
        />
        <div className="workflow-search">
          <SearchToolbar search={q} onSearch={setQ} placeholder="Search triggers and actions by name, app or ID…" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {loading && <SectionLoading label="Loading catalog components…" />}

      {!loading && (
        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="mb-4">
            <TabsTrigger value="triggers">Triggers ({shownTriggers.length})</TabsTrigger>
            <TabsTrigger value="actions">Actions ({shownActions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="triggers">
            {shownTriggers.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--card-bg, var(--white))' }}>
                <Icon name="zap" size={28} color="var(--ink3)" />
                <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  {hasActiveFilters ? 'No matching triggers found.' : 'No triggers registered.'}
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} style={{ marginTop: 14 }}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              ['DOMAIN_EVENT', 'SCHEDULE', 'MANUAL'].map(kind => {
                const rows = shownTriggers.filter(t => t.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <div key={kind} style={{ marginBottom: 28 }}>
                    <div className="studio-group-label" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink2)' }}>
                      {KIND_LABEL[kind]} ({rows.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-lg)' }}>
                      {rows.map(t => (
                        <div
                          key={t.id}
                          className="studio-card-interactive"
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--card-radius)',
                            padding: 'var(--card-padding)',
                            background: 'var(--card-bg, var(--white))',
                            boxShadow: 'var(--elev-sm)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: t.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: t.color }}>{t.appName}</span>
                            {t.entityType && <Badge variant="gray" style={{ marginLeft: 'auto', fontSize: 11 }}>{t.entityType}</Badge>}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, flex: 1 }}>{t.description}</div>
                          <div className="studio-run-mono" style={{ fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)', padding: '3px 7px', borderRadius: 'var(--r-sm)', width: 'fit-content' }}>
                            {t.id}
                          </div>
                          {Object.keys(t.samplePayload).length > 0 && (
                            <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 5 }}>Carried payload fields</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {Object.keys(t.samplePayload).map(k => (
                                  <span key={k} className="studio-run-mono" style={{ fontSize: 11, background: 'var(--teal-l)', color: 'var(--teal)', padding: '2px 6px', borderRadius: 'var(--r-sm)' }}>
                                    {`{{payload.${k}}}`}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="actions">
            {shownActions.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', border: '1px dashed var(--border)', borderRadius: 'var(--card-radius)', background: 'var(--card-bg, var(--white))' }}>
                <Icon name="play" size={28} color="var(--ink3)" />
                <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  {hasActiveFilters ? 'No matching actions found.' : 'No actions registered.'}
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} style={{ marginTop: 14 }}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-lg)' }}>
                  {pagedActions.map(a => (
                    <div
                      key={a.id}
                      className="studio-card-interactive"
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--card-radius)',
                        padding: 'var(--card-padding)',
                        background: 'var(--card-bg, var(--white))',
                        boxShadow: 'var(--elev-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: a.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: a.color }}>{a.appName}</span>
                        {a.restricted && <Badge variant="warning" style={{ marginLeft: 'auto', fontSize: 11 }}>Restricted</Badge>}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, flex: 1 }}>{a.description}</div>
                      <div className="studio-run-mono" style={{ fontSize: 11, color: 'var(--ink3)', background: 'var(--bg)', padding: '3px 7px', borderRadius: 'var(--r-sm)', width: 'fit-content' }}>
                        {a.id}
                      </div>
                      {a.requiredEntitlement && (
                        <div style={{ fontSize: 11.5, color: 'var(--gold)', background: 'var(--gold-l)', padding: '6px 8px', borderRadius: 'var(--r-sm)' }}>
                          Requires the “{a.requiredEntitlement}” entitlement — checked on every run.
                        </div>
                      )}
                      <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 5 }}>Configurable inputs</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {a.inputs.map(i => (
                            <span key={i.name} className="studio-run-mono" style={{ fontSize: 11, background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--r-sm)' }}>
                              {i.name}{i.required && <span style={{ color: 'var(--red)', fontWeight: 700 }}> *</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {shownActions.length > actionPageSize && (
                  <div style={{ marginTop: 24 }}>
                    <StudioPagination page={currentActionPage} total={shownActions.length} size={actionPageSize} onChange={setPage} />
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
