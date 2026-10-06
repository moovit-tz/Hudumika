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

  const total = tab === 'triggers' ? shownTriggers.length : shownActions.length;
  const current = Math.min(page, Math.max(1, Math.ceil(total / 6)));
  const byKind = (kind: string) => shownTriggers.slice((current - 1) * 6, current * 6).filter(t => t.kind === kind);

  return (
    <div className="studio-page">
      <div>
        <PageHeader
          crumbs={['Studio', 'Triggers & actions']}
          titlePlain="Triggers &"
          titleEm="actions"
          subtitle="Everything a workflow can react to and everything it can do. Each entry is backed by real code — a trigger is only listed once an app genuinely emits it."
        />
      </div>

      <div className="workflow-toolbar">
        <SingleSelectFilter label="App" value={app} onChange={setApp} options={Array.from(new Map([...triggers, ...actions].map(t => [t.app,t.appName])).entries()).map(([value,label]) => ({value,label}))} />
        <div className="workflow-search"><SearchToolbar search={q} onSearch={setQ} placeholder="Search triggers and actions" /></div>
      </div>
      {!loading && <StudioPagination page={current} total={total} onChange={setPage} />}
      {!loading && !total && <p>No matching entries. Clear your filters to see more.</p>}
      {loading && <SectionLoading />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="triggers">Triggers ({shownTriggers.length})</TabsTrigger>
          <TabsTrigger value="actions">Actions ({shownActions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="triggers">
          {['DOMAIN_EVENT', 'SCHEDULE', 'MANUAL'].map(kind => {
            const rows = byKind(kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind} style={{ marginTop: 16 }}>
                <div className="studio-group-label" style={{ margin: '0 0 8px' }}>{KIND_LABEL[kind]}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 'var(--space-lg)' }}>
                  {rows.map(t => (
                    <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--card-padding)', background: 'var(--card-bg, var(--white))' }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: t.color }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: t.color }}>{t.appName}</span>
                        {t.entityType && <Badge variant="gray" style={{ marginLeft: 'auto' }}>{t.entityType}</Badge>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink)' }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3, lineHeight: 1.5 }}>{t.description}</div>
                      <div className="studio-run-mono" style={{ marginTop: 7 }}>{t.id}</div>
                      {Object.keys(t.samplePayload).length > 0 && (
                        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px dashed var(--border)' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 4 }}>Fields it carries</div>
                          {Object.keys(t.samplePayload).map(k => (
                            <span key={k} className="studio-run-mono" style={{ display: 'inline-block', marginRight: 8 }}>{`{{payload.${k}}}`}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="actions">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 'var(--space-lg)', marginTop: 16 }}>
            {shownActions.slice((current - 1) * 6, current * 6).map(a => (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--card-padding)', background: 'var(--card-bg, var(--white))' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: a.color }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: a.color }}>{a.appName}</span>
                  {a.restricted && <Badge variant="warning" style={{ marginLeft: 'auto' }}>Restricted</Badge>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink)' }}>{a.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3, lineHeight: 1.5 }}>{a.description}</div>
                <div className="studio-run-mono" style={{ marginTop: 7 }}>{a.id}</div>
                {a.requiredEntitlement && (
                  <div style={{ fontSize: 11.5, color: 'var(--gold)', marginTop: 6 }}>
                    Requires the “{a.requiredEntitlement}” entitlement — checked on every run, not just in the editor.
                  </div>
                )}
                <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--ink3)', marginBottom: 4 }}>Inputs</div>
                  {a.inputs.map(i => (
                    <span key={i.name} className="studio-run-mono" style={{ display: 'inline-block', marginRight: 9 }}>
                      {i.name}{i.required && <span style={{ color: 'var(--red)' }}>*</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
