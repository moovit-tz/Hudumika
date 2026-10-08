import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { showAlert } from '../../lib/alert.js';
import { useCloudStrings } from './locale/index.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface ComplianceReport {
  generated_at: string;
  scanner_configured: boolean;
  totals: {
    files: number;
    legal_hold: number;
    under_retention: number;
    infected: number;
    unscanned: number;
    missing_from_storage: number;
  };
  by_retention_class: { retention_class: string; files: number }[];
}

interface RetentionPolicy {
  retention_class: string;
  retain_days: number;
  is_default: boolean;
  default_days: number;
}

interface FileResult {
  id: string;
  name: string;
  type: string;
  size: number;
  legal_hold: boolean;
  legal_hold_reason: string | null;
  retention_class: string | null;
  updated_at: string;
}

const COMPLIANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, variant = 'gray', note }:
  { label: string; value: number | string; icon: string; variant?: 'gray' | 'success' | 'warning' | 'error' | 'brand' | 'info'; note?: string }) {
  const colors: Record<string, string> = {
    gray: 'var(--ink3)', success: 'var(--green)', warning: 'var(--gold)',
    error: 'var(--red)', brand: 'var(--teal)', info: 'var(--blue)',
  };
  return (
    <div className="cc-stat-card">
      <div className="cc-stat-icon" style={{ color: colors[variant] }}>
        <Icon name={icon as any} size={18} />
      </div>
      <div className="cc-stat-body">
        <div className="cc-stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        <div className="cc-stat-label">{label}</div>
        {note && <div className="cc-stat-note">{note}</div>}
      </div>
    </div>
  );
}

// ── Retention tab ──────────────────────────────────────────────────────────

function RetentionTab() {
  const t = useCloudStrings();
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDays, setEditDays] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<RetentionPolicy[]>('/v1/files/retention-policies')
      .then(setPolicies)
      .catch(e => showAlert(e?.message ?? t('compliance.retention.loadFail')))
      .finally(() => setLoading(false));
  }, []);

  async function save(cls: string) {
    const days = parseInt(editDays, 10);
    if (isNaN(days) || days < 0 || days > 36500) { showAlert(t('compliance.retention.badDays')); return; }
    setSaving(true);
    try {
      await apiFetch(`/v1/files/retention-policies/${encodeURIComponent(cls)}`, {
        method: 'PUT', body: JSON.stringify({ retain_days: days }),
      });
      setPolicies(prev => prev.map(p => p.retention_class === cls
        ? { ...p, retain_days: days, is_default: false }
        : p));
      setEditing(null);
    } catch (e: any) {
      showAlert(e?.message ?? t('compliance.retention.saveFail'));
    } finally {
      setSaving(false);
    }
  }

  function reset(p: RetentionPolicy) {
    setEditDays(String(p.default_days));
    setEditing(p.retention_class);
  }

  function formatDays(days: number) {
    if (days === 0) return t('compliance.retention.noRetention');
    if (days % 365 === 0) return `${days / 365} year${days / 365 !== 1 ? 's' : ''}`;
    if (days % 30 === 0) return `${days / 30} months`;
    return `${days} ${t('compliance.retention.daysUnit')}`;
  }

  if (loading) return <SectionLoading />;

  return (
    <div className="cc-section">
      <p className="cc-section-desc">{t('compliance.retention.desc')}</p>
      <table className="cc-table">
        <thead>
          <tr>
            <th>{t('compliance.retention.col.class')}</th>
            <th>{t('compliance.retention.col.period')}</th>
            <th>{t('compliance.retention.col.default')}</th>
            <th>{t('compliance.retention.col.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {policies.map(p => (
            <tr key={p.retention_class}>
              <td><span className="cc-mono">{p.retention_class}</span></td>
              <td>
                {editing === p.retention_class ? (
                  <form className="cc-inline-edit" onSubmit={e => { e.preventDefault(); void save(p.retention_class); }}>
                    <Input type="number" value={editDays} min={0} max={36500} onChange={e => setEditDays(e.target.value)} style={{ width: 90 }} autoFocus />
                    <span className="cc-inline-edit-unit">{t('compliance.retention.daysUnit')}</span>
                    <Button type="submit" size="sm" disabled={saving}>Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                ) : (
                  <span>{formatDays(p.retain_days)}</span>
                )}
              </td>
              <td>{formatDays(p.default_days)}</td>
              <td>
                {p.is_default
                  ? <Badge variant="gray">{t('compliance.retention.badge.default')}</Badge>
                  : <Badge variant="brand">{t('compliance.retention.badge.custom')}</Badge>}
              </td>
              <td>
                <div className="cc-row-actions">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(p.retention_class); setEditDays(String(p.retain_days)); }}>
                    <Icon name="edit" size={12} /> {t('compliance.retention.edit')}
                  </Button>
                  {!p.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => reset(p)}>{t('compliance.retention.reset')}</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {policies.length === 0 && (
            <tr><td colSpan={5} className="cc-empty">{t('compliance.retention.noClasses')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Legal Hold tab ─────────────────────────────────────────────────────────

function LegalHoldTab() {
  const t = useCloudStrings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [holdTarget, setHoldTarget] = useState<FileResult | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [applying, setApplying] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load files currently on hold on mount
  useEffect(() => {
    setSearching(true);
    apiFetch<{ files: FileResult[] }>('/v1/files?legal_hold=true&limit=50')
      .then(r => setResults(Array.isArray(r) ? r : (r.files ?? [])))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  function search(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = q.trim()
          ? `/v1/files?q=${encodeURIComponent(q.trim())}&limit=30`
          : `/v1/files?legal_hold=true&limit=50`;
        const r = await apiFetch<any>(url);
        setResults(Array.isArray(r) ? r : (r.files ?? []));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function applyHold(file: FileResult, hold: boolean) {
    if (hold && !holdReason.trim()) { showAlert(t('compliance.hold.reasonRequired')); return; }
    setApplying(true);
    try {
      await apiFetch(`/v1/files/${file.id}/legal-hold`, {
        method: 'PUT',
        body: JSON.stringify({ hold, reason: holdReason.trim() || undefined }),
      });
      setResults(prev => prev.map(f => f.id === file.id
        ? { ...f, legal_hold: hold, legal_hold_reason: hold ? holdReason.trim() : null }
        : f));
      setHoldTarget(null);
      setHoldReason('');
      showAlert(t(hold ? 'compliance.hold.placed' : 'compliance.hold.released', { name: file.name }), { variant: 'success' });
    } catch (e: any) {
      showAlert(e?.message ?? 'Failed to update legal hold');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="cc-section">
      <p className="cc-section-desc">{t('compliance.hold.desc')}</p>

      <div className="cc-search-row">
        <Icon name="search" size={15} color="var(--ink3)" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          placeholder={t('compliance.hold.search')}
        />
        {query && <button type="button" className="cc-clear-btn" onClick={() => { setQuery(''); search(''); }} data-ui-native-button=""><Icon name="x" size={13} /></button>}
      </div>

      {searching ? <SectionLoading /> : (
        <table className="cc-table cc-table--files">
          <thead>
            <tr>
              <th>Name</th>
              <th>Retention class</th>
              <th>Hold</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.filter(f => f.type !== 'folder').map(f => (
              <tr key={f.id} className={f.legal_hold ? 'cc-row--held' : ''}>
                <td>
                  <div className="cc-file-name">
                    <Icon name="file" size={13} color="var(--ink3)" />
                    <span>{f.name}</span>
                  </div>
                </td>
                <td>{f.retention_class ? <span className="cc-mono">{f.retention_class}</span> : <span className="cc-dim">—</span>}</td>
                <td>
                  {f.legal_hold
                    ? <Badge variant="error"><Icon name="lock" size={10} /> {t('compliance.hold.badge.held')}</Badge>
                    : <Badge variant="gray">{t('compliance.hold.badge.none')}</Badge>}
                </td>
                <td><span className="cc-dim">{f.legal_hold_reason ?? '—'}</span></td>
                <td>
                  {holdTarget?.id === f.id ? (
                    <form className="cc-hold-form" onSubmit={e => { e.preventDefault(); void applyHold(f, !f.legal_hold); }}>
                      {!f.legal_hold && (
                        <Input
                          autoFocus
                          value={holdReason}
                          onChange={e => setHoldReason(e.target.value)}
                          placeholder={t('compliance.hold.reasonPlaceholder')}
                          style={{ minWidth: 200 }}
                        />
                      )}
                      <Button type="submit" size="sm" variant={f.legal_hold ? 'outline' : 'default'} disabled={applying}>
                        {f.legal_hold ? t('compliance.hold.release') : t('compliance.hold.place')}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setHoldTarget(null); setHoldReason(''); }}>Cancel</Button>
                    </form>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setHoldTarget(f)}>
                      <Icon name={f.legal_hold ? 'lockOpen' : 'lock'} size={12} />
                      {f.legal_hold ? t('compliance.hold.release') : t('compliance.hold.place')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {results.filter(f => f.type !== 'folder').length === 0 && !searching && (
              <tr><td colSpan={5} className="cc-empty">{t(query ? 'compliance.hold.noResults' : 'compliance.hold.noHolds')}</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page root ──────────────────────────────────────────────────────────────

export function CloudCompliance() {
  const t = useCloudStrings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  const role = (user as any)?.role as string | undefined;
  const isAdmin = role && COMPLIANCE_ROLES.includes(role);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<ComplianceReport>('/v1/files/compliance/report')
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setReportLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="cc-access-denied">
        <Icon name="lock" size={32} color="var(--ink3)" />
        <h2>{t('compliance.access.denied.title')}</h2>
        <p>{t('compliance.access.denied.body')}</p>
        <Button onClick={() => navigate('/cloud')}>{t('compliance.access.backToDrive')}</Button>
      </div>
    );
  }

  const totals = report?.totals;

  return (
    <div className="cc-root">
      <PageHeader
        crumbs={['Drive', 'Compliance']}
        titlePlain={t('compliance.title.plain')}
        titleEm={t('compliance.title.em')}
        subtitle={t('compliance.subtitle')}
      />

      {/* ── Overview cards ── */}
      <div className="cc-stats-grid">
        {reportLoading ? <SectionLoading /> : report ? (
          <>
            <StatCard label={t('compliance.stat.files')} value={totals!.files} icon="file" variant="gray" />
            <StatCard label={t('compliance.stat.retention')} value={totals!.under_retention} icon="clock" variant="brand" />
            <StatCard label={t('compliance.stat.holds')} value={totals!.legal_hold} icon="lock" variant="warning" />
            <StatCard label={t('compliance.stat.infected')} value={totals!.infected} icon="alertTriangle" variant="error"
              note={!report.scanner_configured ? t('compliance.stat.noScanner') : undefined} />
            <StatCard label={t('compliance.stat.unscanned')} value={totals!.unscanned} icon="shieldOff"
              variant={totals!.unscanned > 0 ? 'warning' : 'gray'}
              note={!report.scanner_configured ? t('compliance.stat.noScannerCfg') : undefined} />
            <StatCard label={t('compliance.stat.missing')} value={totals!.missing_from_storage} icon="alertCircle"
              variant={totals!.missing_from_storage > 0 ? 'error' : 'gray'} />
          </>
        ) : (
          <p className="cc-dim">{t('compliance.report.fail')}</p>
        )}
      </div>

      {report?.by_retention_class && report.by_retention_class.length > 0 && (
        <div className="cc-byclass">
          <span className="cc-byclass-label">{t('compliance.byclass')}</span>
          {report.by_retention_class.map(r => (
            <Badge key={r.retention_class} variant="gray">
              <span className="cc-mono">{r.retention_class}</span> — {r.files.toLocaleString()}
            </Badge>
          ))}
          {report.generated_at && (
            <span className="cc-byclass-ts">{t('compliance.report.asOf', { date: new Date(report.generated_at).toLocaleString() })}</span>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="retention" className="cc-tabs">
        <TabsList>
          <TabsTrigger value="retention"><Icon name="clock" size={14} /> {t('compliance.tab.retention')}</TabsTrigger>
          <TabsTrigger value="holds"><Icon name="lock" size={14} /> {t('compliance.tab.holds')}</TabsTrigger>
        </TabsList>
        <TabsContent value="retention"><RetentionTab /></TabsContent>
        <TabsContent value="holds"><LegalHoldTab /></TabsContent>
      </Tabs>
    </div>
  );
}
