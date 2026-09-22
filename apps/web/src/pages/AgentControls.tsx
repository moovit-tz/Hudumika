import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Banner } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { CheckboxRow, SwitchRow } from '../components/ui/list-item-row.js';
import { SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import '../pages/AI.css';

interface ToolInfo { id: string; label: string; description: string; effect: string; risk: string; approvalPolicy: string; appId: string }
interface GrantsResponse {
  restricted: boolean;
  grants: { toolId: string; expiresAt: string | null; maxAmountTzs: number | null }[];
  tools: ToolInfo[];
  amountCappable: string[];
}
interface UsageResponse {
  days: number;
  runs: { total: number; byStatus: Record<string, number> };
  tokens: { in: number; out: number };
  credits: { used: number; limit: number; remaining: number };
  topTools: { toolId: string; calls: number; errors: number }[];
}

const RISK_BADGE: Record<string, 'success' | 'warning' | 'error' | 'gray'> = { low: 'success', medium: 'warning', high: 'error', critical: 'error' };
const APPROVAL_LABEL: Record<string, string> = { never: 'Runs on its own', policy: 'Managers run it, others need approval', always: 'Always needs approval' };

export const AgentControls: React.FC = () => {
  const [data, setData] = useState<GrantsResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caps, setCaps] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const g: GrantsResponse = await apiFetch('/v1/agent/grants');
      setData(g);
      setRestricted(g.restricted);
      setSelected(new Set(g.grants.map(x => x.toolId)));
      setCaps(Object.fromEntries(g.grants.filter(x => x.maxAmountTzs).map(x => [x.toolId, String(x.maxAmountTzs)])));
      apiFetch('/v1/agent/usage?days=30').then(setUsage).catch(() => setUsage(null));
    } catch (e: any) {
      setError(e?.message || 'Could not load agent controls.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toolsByApp = useMemo(() => {
    const groups = new Map<string, ToolInfo[]>();
    for (const t of data?.tools ?? []) groups.set(t.appId, [...(groups.get(t.appId) ?? []), t]);
    return [...groups.entries()];
  }, [data]);

  function toggleRestricted(on: boolean) {
    setRestricted(on);
    setSaved(false);
    // Turning the limit on starts from the read-only tools, so it is never an empty (do-nothing) list.
    if (on && selected.size === 0 && data) setSelected(new Set(data.tools.filter(t => t.effect === 'read').map(t => t.id)));
  }

  function toggleTool(id: string, on: boolean) {
    setSaved(false);
    setSelected(prev => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  }

  async function save() {
    if (!data) return;
    const badCap = data.amountCappable.find(id => selected.has(id) && caps[id] !== undefined && caps[id] !== '' && !(Number(caps[id]) > 0));
    if (restricted && badCap) { setError('An amount limit must be a number above zero.'); return; }
    setSaving(true);
    setError(null);
    try {
      const maxAmountTzs = Object.fromEntries(
        data.amountCappable.filter(id => selected.has(id) && Number(caps[id]) > 0).map(id => [id, Number(caps[id])]));
      await apiFetch('/v1/agent/grants', {
        method: 'PUT',
        body: JSON.stringify({ toolIds: restricted ? [...selected] : null, maxAmountTzs: restricted ? maxAmountTzs : {} }),
      });
      setSaved(true);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && (!restricted || selected.size > 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        crumbs={['AI', 'Controls']}
        titlePlain="Agent"
        titleEm="controls"
        subtitle="Choose what the workspace agent may do, cap what it can spend, and see what it has used."
      />

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {!data && !error && <SectionLoading label="Loading controls…" />}

      {usage && (
        <div style={{ marginBottom: 18 }}>
          <MetricsRow cards={[
            { title: 'AGENT RUNS · 30 DAYS', value: String(usage.runs.total), sub1Label: 'COMPLETED', sub1Value: String(usage.runs.byStatus.completed ?? 0), sub2Label: 'FAILED', sub2Value: String(usage.runs.byStatus.failed ?? 0), barHighlight: 'var(--teal)' },
            { title: 'AI CREDITS THIS MONTH', value: `${usage.credits.used} / ${usage.credits.limit}`, sub1Label: 'REMAINING', sub1Value: String(usage.credits.remaining), barHighlight: 'var(--gold)' },
            { title: 'TOKENS · 30 DAYS', value: (usage.tokens.in + usage.tokens.out).toLocaleString(), sub1Label: 'IN', sub1Value: usage.tokens.in.toLocaleString(), sub2Label: 'OUT', sub2Value: usage.tokens.out.toLocaleString(), barHighlight: 'var(--blue)' },
          ]} />
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <SectionCard
            title="What the agent may do"
            collapsible={false}
            action={<Button size="sm" onClick={save} disabled={!canSave}>{saving ? <ButtonSpinner /> : 'Save changes'}</Button>}
          >
            <SwitchRow
              title="Limit the agent to specific tools"
              description="Off: the agent can use every tool, still subject to approvals. On: it can only use the tools ticked below."
              checked={restricted}
              onCheckedChange={toggleRestricted}
            />
            {saved && <Banner variant="success" className="mt-3">Saved. The change applies to the agent's next request.</Banner>}
            {restricted && selected.size === 0 && <Banner variant="warning" className="mt-3">Tick at least one tool, or turn the limit off.</Banner>}
          </SectionCard>

          {toolsByApp.map(([app, tools]) => (
            <SectionCard key={app} title={app}>
              {tools.map(t => (
                <div key={t.id} style={{ opacity: restricted ? 1 : 0.55 }}>
                  <CheckboxRow
                    title={t.label}
                    description={t.description}
                    checked={restricted ? selected.has(t.id) : true}
                    disabled={!restricted}
                    onCheckedChange={on => toggleTool(t.id, on)}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '0 0 12px 28px' }}>
                    <Badge variant={RISK_BADGE[t.risk] ?? 'gray'}>{t.risk} risk</Badge>
                    <Badge variant="gray">{APPROVAL_LABEL[t.approvalPolicy] ?? t.approvalPolicy}</Badge>
                    {data.amountCappable.includes(t.id) && restricted && selected.has(t.id) && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)' }}>
                        Needs approval above TZS
                        <Input
                          inputMode="numeric"
                          placeholder="No limit"
                          value={caps[t.id] ?? ''}
                          onChange={e => { setSaved(false); setCaps(prev => ({ ...prev, [t.id]: e.target.value.replace(/[^0-9]/g, '') })); }}
                          style={{ width: 140 }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </SectionCard>
          ))}

          {usage && usage.topTools.length > 0 && (
            <SectionCard title="Most-used tools · 30 days" collapsible={false}>
              {usage.topTools.map(t => (
                <div key={t.toolId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{data.tools.find(x => x.id === t.toolId)?.label ?? t.toolId}</span>
                  <span style={{ color: 'var(--ink3)' }}>{t.calls} call{t.calls === 1 ? '' : 's'}{t.errors ? ` · ${t.errors} failed` : ''}</span>
                </div>
              ))}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
};
