import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { DataTable, type TableColumn } from '../../components/ui/DataTable.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { SOURCE_LABEL, type PulseSource } from './pulseFields.js';
import { apiError, fmtNum, fmtWhen } from './pulseShared.js';

export type JourneyStatus = 'draft' | 'active' | 'paused' | 'archived';
export const JOURNEY_STATUS: Record<JourneyStatus, { label: string; variant: 'gray' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', variant: 'gray' }, active: { label: 'Running', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' }, archived: { label: 'Archived', variant: 'gray' },
};
const TRIGGER_TEXT: Record<string, string> = { segment: 'Joins an audience', event: 'Something happens', date: 'On a date', manual: 'Added by hand' };

interface Row {
  id: string; name: string; description: string | null; status: JourneyStatus; source: PulseSource; trigger: any;
  step_count: number; active: number; finished: number; updated_at: string;
  created_by: string | null; created_by_name: string | null; created_by_avatar: string | null;
}

export function PulseJourneys() {
  usePageSEO('Journeys', 'Automated Pulse sequences that each person walks through on their own clock.');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/pulse/journeys').then((r: any) => { setRows(r.data); setError(undefined); }).catch((e) => setError(apiError(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const columns: TableColumn<Row>[] = [
    { key: 'name', header: 'Journey', sortable: true, sortValue: (r) => r.name, render: (r) => (
      <div><div className="pulse-strong">{r.name}</div><div className="pulse-muted">{SOURCE_LABEL[r.source]} · {TRIGGER_TEXT[typeof r.trigger === 'string' ? JSON.parse(r.trigger).type : r.trigger?.type] ?? ''} · {r.step_count} {r.step_count === 1 ? 'step' : 'steps'}</div></div>
    ) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={JOURNEY_STATUS[r.status].variant}>{JOURNEY_STATUS[r.status].label}</Badge> },
    { key: 'active', header: 'In it now', align: 'right', render: (r) => fmtNum(r.active) },
    { key: 'finished', header: 'Finished', align: 'right', hideAt: 'sm', render: (r) => fmtNum(r.finished) },
    { key: 'updated', header: 'Updated', hideAt: 'md', render: (r) => fmtWhen(r.updated_at) },
    { key: 'owner', header: 'Owner', hideAt: 'md', render: (r) => r.created_by_name
      ? <div className="pulse-person"><PersonAvatar userId={r.created_by} name={r.created_by_name} src={r.created_by_avatar} size={24} /><span>{r.created_by_name}</span></div> : '—' },
  ];

  return (
    <div className="pulse-page">
      <PageHeader crumbs={['Pulse', 'Journeys']} titlePlain="Automated" titleEm="journeys"
        subtitle="Sequences that run for each person on their own clock: a welcome series, lead follow-up, a nudge to people who went quiet."
        actions={<Button onClick={() => navigate('/pulse/journeys/new')}><Icon name="plus" size={14} /> New journey</Button>} />
      <SectionCard title="Journeys" padded={false} collapsible={false}>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={load}
          empty={!loading && rows.length === 0} emptyIcon="gitBranch" emptyTitle="No journeys yet"
          emptyMessage="Start from a template — welcome series, lead nurture, re-engagement — and change it to suit you."
          emptyAction={{ label: 'New journey', onClick: () => navigate('/pulse/journeys/new') }}
          onRowClick={(r) => navigate(`/pulse/journeys/${r.id}`)} />
      </SectionCard>
    </div>
  );
}

export function PulseJourneyNew() {
  usePageSEO('New journey', 'Start a Pulse journey from a template or from scratch.');
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<{ key: string; name: string; description: string; source: PulseSource; trigger: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { apiFetch('/v1/pulse/journeys/meta').then((r: any) => setTemplates(r.data.templates)).catch(() => {}); }, []);

  async function start(key: string | null) {
    setBusy(key ?? 'blank');
    try {
      const body = key ? { template: key } : { name: 'New journey', source: 'contacts', trigger: { type: 'manual' }, steps: [], reentry: 'never', quiet_hours: { start: '21:00', end: '08:00' } };
      const r: any = await apiFetch('/v1/pulse/journeys', { method: 'POST', body: JSON.stringify(body) });
      navigate(`/pulse/journeys/${r.data.id}?edit=1`);
    } catch (e) { showAlert(apiError(e), { variant: 'error' }); setBusy(null); }
  }

  return (
    <div className="pulse-page">
      <PageHeader variant="create" backTo="/pulse/journeys" backLabel="Journeys" crumbs={['Pulse', { label: 'Journeys', to: '/pulse/journeys' }, 'New']} title="New journey"
        subtitle="Nothing sends until you start it." />
      <div className="pulse-templates">
        {templates.map((t) => (
          <button key={t.key} type="button" className="pulse-template" onClick={() => start(t.key)} disabled={!!busy}>
            <span className="pulse-strong">{t.name}</span>
            <span className="pulse-muted">{t.description}</span>
            <span className="pulse-template-meta">{SOURCE_LABEL[t.source]} · {TRIGGER_TEXT[t.trigger]}</span>
          </button>
        ))}
        <button type="button" className="pulse-template pulse-template-blank" onClick={() => start(null)} disabled={!!busy}>
          <Icon name="plus" size={18} />
          <span className="pulse-strong">Start from scratch</span>
          <span className="pulse-muted">An empty journey you build step by step.</span>
        </button>
      </div>
    </div>
  );
}
