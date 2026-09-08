import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

interface Finding {
  id: string;
  check_key: string;
  severity: 'info' | 'warning' | 'critical';
  table_name: string;
  finding_count: number;
  sample_ids: string[];
  description: string;
  tenant_id: string | null;
  tenant_name: string | null;
  run_at: string;
}

const SEVERITY_VARIANT: Record<string, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', critical: 'error' };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export function HuduBIDataQuality() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch('/v1/superadmin/data-quality/findings')
      .then((r: any) => {
        const data: Finding[] = r.data ?? [];
        setFindings(data.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]));
        setLastRunAt(data[0]?.run_at ?? null);
      })
      .catch(() => setFindings([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      await apiFetch('/v1/superadmin/data-quality/run', { method: 'POST' });
      load();
    } finally {
      setRunning(false);
    }
  }

  const critical = findings?.filter(f => f.severity === 'critical').length ?? 0;
  const warning = findings?.filter(f => f.severity === 'warning').length ?? 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Data Quality']}
        titlePlain="Data"
        titleEm="quality"
        subtitle="Real checks over domain_events and the tables the Metric Registry reads from — timestamp ordering, un-deduplicated retries, volume anomalies."
        actions={<Button variant="default" size="sm" onClick={runNow} disabled={running}>{running ? 'Running…' : 'Run checks now'}</Button>}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Badge variant="error">{critical} critical</Badge>
          <Badge variant="warning">{warning} warning</Badge>
          {lastRunAt && <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Last run {new Date(lastRunAt).toLocaleString()}</span>}
        </div>
      </div>

      {findings === null && <SectionCard><SectionLoading /></SectionCard>}

      {findings !== null && (
        <SectionCard title={`${findings.length} finding${findings.length === 1 ? '' : 's'} from the latest run`}>
          {findings.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 4px', color: 'var(--green)' }}>
              <Icon name="checkCircle" size={16} />
              <span style={{ fontSize: 13 }}>No data-quality issues found in the last run.</span>
            </div>
          ) : (
            <div>
              {findings.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--border)' }}>
                  <Badge variant={SEVERITY_VARIANT[f.severity]} style={{ marginTop: 1 }}>{f.severity}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>{f.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <code style={{ fontFamily: 'var(--mono)' }}>{f.check_key}</code>
                      <span>{f.table_name}</span>
                      {f.tenant_name && <span>{f.tenant_name}</span>}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{f.finding_count}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
