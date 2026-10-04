import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Save, Target, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface QuotaRow {
  user_id: string;
  user_name: string | null;
  period: string;
  target_value: number;
  target_count: number;
  won_value?: number;
  won_count?: number;
  attainment_pct?: number | null;
  count_pct?: number | null;
}

interface UserOption { id: string; name: string }

function formatPeriod(p: string) {
  const [y, m] = p.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function prevPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function CrmQuotaTargets() {
  const [period, setPeriod]           = useState(currentPeriod);
  const [rows, setRows]               = useState<QuotaRow[] | null>(null);
  const [users, setUsers]             = useState<UserOption[]>([]);
  const [edits, setEdits]             = useState<Record<string, { value: string; count: string }>>({});
  const [saving, setSaving]           = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    Promise.all([
      apiFetch(`/v1/crm/quotas?period=${period}`),
      apiFetch(`/v1/crm/quotas/attainment?period=${period}`),
    ]).then(([quotas, attainment]: any) => {
      const attMap = new Map((attainment as QuotaRow[]).map(a => [a.user_id, a]));
      const merged: QuotaRow[] = (quotas as QuotaRow[]).map(q => ({
        ...q,
        ...(attMap.get(q.user_id) ?? {}),
      }));
      setRows(merged);
      setEdits({});
    }).catch(() => setRows([]));
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch('/v1/ondi/users')
      .then((r: any) => {
        const all: UserOption[] = Array.isArray(r) ? r : [];
        const SALES_ROLES = new Set(['SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'MANAGER', 'ADMIN', 'TENANT_ADMIN']);
        setUsers(all.filter((u: any) => SALES_ROLES.has(u.role) && u.active !== false));
      })
      .catch(() => setUsers([]));
  }, []);

  // Users without a quota this period — available to add
  const usersWithoutQuota = users.filter(u => !rows?.some(r => r.user_id === u.id));

  function getEdit(userId: string, row?: QuotaRow) {
    return edits[userId] ?? {
      value: String(row?.target_value ?? ''),
      count: String(row?.target_count ?? ''),
    };
  }

  function setEdit(userId: string, patch: Partial<{ value: string; count: string }>) {
    setEdits(e => ({ ...e, [userId]: { ...getEdit(userId), ...patch } }));
  }

  async function saveRow(userId: string, userName: string) {
    const e = getEdit(userId);
    setSaving(userId);
    try {
      await apiFetch('/v1/crm/quotas', {
        method: 'PUT',
        body: JSON.stringify({
          user_id: userId,
          period,
          target_value: Number(e.value) || 0,
          target_count: Number(e.count) || 0,
        }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || `Failed to save quota for ${userName}`);
    } finally {
      setSaving(null);
    }
  }

  async function removeRow(userId: string, userName: string) {
    const ok = await showConfirm(`Remove quota target for ${userName} in ${formatPeriod(period)}?`, { confirmLabel: 'Remove' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/crm/quotas/${userId}/${period}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove quota');
    }
  }

  async function addRep(user: UserOption) {
    setSaving(user.id);
    try {
      await apiFetch('/v1/crm/quotas', {
        method: 'PUT',
        body: JSON.stringify({ user_id: user.id, period, target_value: 0, target_count: 0 }),
      });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add rep');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Settings', 'Quota Targets']}
        titlePlain="Quota"
        titleEm="targets"
        subtitle="Set monthly revenue and deal-count targets per rep. Attainment is tracked live on the Pipeline board."
      />

      {/* Period nav */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setPeriod(prevPeriod(period))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-bold text-foreground">{formatPeriod(period)}</span>
        <Button variant="outline" size="icon" onClick={() => setPeriod(nextPeriod(period))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {period !== currentPeriod() && (
          <Button variant="ghost" size="sm" onClick={() => setPeriod(currentPeriod())} className="text-xs text-muted-foreground">
            Back to current month
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="border-b border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Rep targets</CardTitle>
                {rows && <Badge variant="gray">{rows.length} reps</Badge>}
              </div>
              <CardDescription className="mt-1">
                Set the revenue target and deal count for each rep. Click Save to confirm changes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rows === null ? (
            <div className="flex min-h-48 items-center justify-center"><SectionLoading /></div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
              <FeaturedIcon variant="brand" size="lg" shape="circle">
                <Target className="h-6 w-6" />
              </FeaturedIcon>
              <h2 className="mt-4 text-sm font-bold text-foreground">No quotas set for {formatPeriod(period)}</h2>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Add reps below to start setting targets for this period.
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_140px_100px_auto] gap-4 border-b border-border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Rep</span>
                <span>Revenue target</span>
                <span>Deal count</span>
                <span />
              </div>
              <div className="divide-y divide-border">
                {rows.map(row => {
                  const e = getEdit(row.user_id, row);
                  const isDirty = e.value !== String(row.target_value) || e.count !== String(row.target_count);
                  const pct = row.attainment_pct;
                  return (
                    <div key={row.user_id} className="grid grid-cols-[1fr_140px_100px_auto] items-center gap-4 px-5 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <PersonAvatar userId={row.user_id} name={row.user_name ?? '?'} size={32} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{row.user_name ?? 'Unknown'}</div>
                          {pct !== null && pct !== undefined && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Attainment: <span className={`font-bold ${pct >= 100 ? 'text-(--green)' : pct >= 70 ? 'text-(--gold)' : 'text-(--red)'}`}>{pct}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number" min={0} className="pl-6"
                          value={e.value}
                          onChange={ev => setEdit(row.user_id, { value: ev.target.value })}
                          aria-label={`Revenue target for ${row.user_name}`}
                        />
                      </div>
                      <Input
                        type="number" min={0}
                        value={e.count}
                        onChange={ev => setEdit(row.user_id, { count: ev.target.value })}
                        aria-label={`Deal count target for ${row.user_name}`}
                      />
                      <div className="flex items-center gap-1">
                        {isDirty && (
                          <Button
                            size="sm" className="gap-1.5"
                            onClick={() => saveRow(row.user_id, row.user_name ?? '')}
                            disabled={saving === row.user_id}
                          >
                            <Save className="h-3.5 w-3.5" />
                            {saving === row.user_id ? 'Saving…' : 'Save'}
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => removeRow(row.user_id, row.user_name ?? '')}
                          aria-label={`Remove ${row.user_name ?? ''} quota`}
                          className="text-muted-foreground hover:bg-(--red-l) hover:text-(--red)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add reps */}
      {usersWithoutQuota.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border p-5">
            <CardTitle className="text-base">Add rep to this period</CardTitle>
            <CardDescription>Reps not yet tracked for {formatPeriod(period)}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {usersWithoutQuota.map(u => (
                <div key={u.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar userId={u.id} name={u.name} size={28} />
                    <span className="text-sm font-medium text-foreground">{u.name}</span>
                  </div>
                  <Button
                    size="sm" variant="outline" className="gap-1.5"
                    onClick={() => addRep(u)}
                    disabled={saving === u.id}
                  >
                    <Target className="h-3.5 w-3.5" />
                    {saving === u.id ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
