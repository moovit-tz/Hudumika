import React, { useState, useMemo } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { money, useProjectRows } from './projectData.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface Props {
  projectId?: string;
  projectName?: string;
  risks?: any[];
  onRefresh?: () => void;
  currency?: string;
}

export const ProjectRisksDashboard: React.FC<Props> = ({ projectId, projectName }) => {
  const isMobile = useIsMobile();
  const { rows, loading, error, load } = useProjectRows('risks', projectId);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [riskPage, setRiskPage] = useState(1);
  const [riskPageSize, setRiskPageSize] = useState(25);

  // Edit / Manage Risk state
  const [editing, setEditing] = useState<any>(null);
  const [riskStatus, setRiskStatus] = useState('open');
  const [mitigation, setMitigation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function saveRisk(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveError('');
    try {
      await apiFetch(`/v1/project-os/risks/${editing.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: riskStatus, mitigation_plan: mitigation }),
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      setSaveError(err.message || 'Unable to save risk changes');
    } finally {
      setSaving(false);
    }
  }

  const risks = useMemo(() => {
    return rows.filter(row => {
      if (status !== 'all' && row.status !== status) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return `${row.title} ${row.project_name || ''} ${row.description || ''}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, status, search]);

  const highScores = rows.filter(row => Number(row.score) >= 15);
  const openRisks = rows.filter(row => row.status !== 'closed');
  const totalExposure = rows.reduce((s, r) => s + (Number(r.financial_exposure) || 0), 0);
  const primaryCurrency = rows[0]?.currency || 'TZS';

  function getScoreBadge(score: number) {
    if (score >= 15) return { label: `${score} Critical`, variant: 'error' as const };
    if (score >= 10) return { label: `${score} High`, variant: 'warning' as const };
    if (score >= 5) return { label: `${score} Medium`, variant: 'brand' as const };
    return { label: `${score} Low`, variant: 'gray' as const };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Risk Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Recorded Risks', value: rows.length, icon: 'shield' as const, variant: 'brand' as const },
          { label: 'Open / Monitoring', value: openRisks.length, icon: 'clock' as const, variant: 'warning' as const },
          { label: 'High / Critical', value: highScores.length, icon: 'alertTriangle' as const, variant: highScores.length > 0 ? 'error' as const : 'brand' as const },
          { label: 'Value at Risk (VaR)', value: totalExposure > 0 ? money(totalExposure, primaryCurrency) : '—', icon: 'dollarSign' as const, variant: 'brand' as const },
        ].map(kpi => (
          <div
            key={kpi.label}
            style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: 16,
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FeaturedIcon variant={kpi.variant} size="sm">
                <Icon name={kpi.icon} size={13} />
              </FeaturedIcon>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {kpi.label}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters and View Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Select value={status} onValueChange={v => { setStatus(v); setRiskPage(1); }}>
            <SelectTrigger className="h-8 text-xs" style={{ width: 140 }}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="mitigated">Mitigated</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={view === 'cards' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('cards')}
            style={{ height: 32, fontSize: 12 }}
          >
            <Icon name="grid" size={12} style={{ marginRight: 6 }} /> Cards
          </Button>
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('table')}
            style={{ height: 32, fontSize: 12 }}
          >
            <Icon name="list" size={12} style={{ marginRight: 6 }} /> Table
          </Button>

          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {risks.length} {risks.length === 1 ? 'risk' : 'risks'}
          </span>
        </div>

        <SearchToolbar search={search} onSearch={v => { setSearch(v); setRiskPage(1); }} placeholder="Search risk register…" />
      </div>

      {/* Main Content */}
      {loading ? (
        <SectionLoading />
      ) : risks.length === 0 ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
            <Icon name="shield" size={24} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            No Risks Match Filters
          </h3>
          <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
            No project risks recorded matching the current filter. Open any project to log risks in its Governance register.
          </p>
        </div>
      ) : view === 'cards' ? (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {paginate(risks, riskPage, riskPageSize).visible.map(risk => {
            const scoreMeta = getScoreBadge(Number(risk.score) || 0);
            return (
              <div
                key={risk.id}
                style={{
                  background: 'var(--white)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)',
                  padding: 16,
                  boxShadow: 'var(--card-shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                      {risk.title}
                    </h4>
                    {risk.project_name && (
                      <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, marginTop: 2 }}>
                        {risk.project_name}
                      </div>
                    )}
                  </div>
                  <Badge variant={scoreMeta.variant}>{scoreMeta.label}</Badge>
                </div>

                {/* Description */}
                {risk.description && (
                  <p style={{ fontSize: 12.5, color: 'var(--ink2)', margin: 0, lineHeight: 1.4 }}>
                    {risk.description}
                  </p>
                )}

                {/* Severity Breakdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--ink3)' }}>
                  <span>Probability: <strong style={{ color: 'var(--ink)' }}>{risk.probability || '—'}</strong>/5</span>
                  <span>Impact: <strong style={{ color: 'var(--ink)' }}>{risk.impact || '—'}</strong>/5</span>
                  <span>Status: <strong style={{ color: 'var(--ink)' }}>{risk.status}</strong></span>
                </div>

                {/* Financial Exposure & Owner */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase', fontWeight: 700 }}>Exposure</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {risk.financial_exposure ? money(risk.financial_exposure, risk.currency) : '—'}
                    </div>
                  </div>

                  {risk.owner_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PersonAvatar userId={risk.owner_id} name={risk.owner_name} size={22} />
                      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{risk.owner_name}</span>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    style={{ height: 28, fontSize: 11 }}
                    onClick={() => {
                      setEditing(risk);
                      setRiskStatus(risk.status);
                      setMitigation(risk.mitigation_plan || '');
                      setSaveError('');
                    }}
                  >
                    Manage Risk
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <ListPagination total={risks.length} page={riskPage} pageSize={riskPageSize} onPageChange={setRiskPage} onPageSizeChange={setRiskPageSize} noun="risks" />
        </>
      ) : (
        <>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                {['Risk Title', 'Project', 'Severity', 'Prob / Impact', 'Exposure', 'Status', 'Owner', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginate(risks, riskPage, riskPageSize).visible.map(risk => {
                const scoreMeta = getScoreBadge(Number(risk.score) || 0);
                return (
                  <tr
                    key={risk.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--ink)' }}>
                      {risk.title}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
                      {risk.project_name || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={scoreMeta.variant}>{scoreMeta.label}</Badge>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink2)' }}>
                      P{risk.probability} × I{risk.impact}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {risk.financial_exposure ? money(risk.financial_exposure, risk.currency) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant={risk.status === 'closed' ? 'gray' : risk.status === 'mitigated' ? 'success' : 'warning'}>
                        {risk.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {risk.owner_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <PersonAvatar userId={risk.owner_id} name={risk.owner_name} size={20} />
                          <span style={{ fontSize: 12 }}>{risk.owner_name}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ height: 28, fontSize: 11 }}
                        onClick={() => {
                          setEditing(risk);
                          setRiskStatus(risk.status);
                          setMitigation(risk.mitigation_plan || '');
                          setSaveError('');
                        }}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListPagination total={risks.length} page={riskPage} pageSize={riskPageSize} onPageChange={setRiskPage} onPageSizeChange={setRiskPageSize} noun="risks" />
        </>
      )}

      {/* Manage Risk Radix Dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent size="md">
          <form onSubmit={saveRisk}>
            <DialogHeader>
              <DialogTitle>Manage Risk: {editing?.title}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {saveError && (
                <Alert variant="destructive">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Governance Status
                </label>
                <Select value={riskStatus} onValueChange={setRiskStatus}>
                  <SelectTrigger id="risk-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open (Unmitigated)</SelectItem>
                    <SelectItem value="monitoring">Monitoring</SelectItem>
                    <SelectItem value="mitigated">Mitigated</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1.5">
                  Mitigation and Contingency Plan
                </label>
                <Textarea
                  id="risk-mitigation"
                  value={mitigation}
                  onChange={event => setMitigation(event.target.value)}
                  rows={5}
                  placeholder="Describe treatment strategies, fallback plans, and preventive actions…"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
