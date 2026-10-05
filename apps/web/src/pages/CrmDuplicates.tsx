import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, GitMerge, SearchCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.js';
import { MetricsRow } from '../components/MetricCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { Banner } from '../components/ui/alert.js';
import { Slider } from '../components/ui/slider.js';

interface LeadDup { id: string; company: string; contact_name: string; value: number; created_at: string }
interface CustomerDup { id: string; name: string; email?: string; created_at: string }

function fmtValue(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(value);
}

function DupGroup<T extends { id: string; created_at: string }>({ items, renderLabel, renderSub, onMerge, busy }: {
  items: T[];
  renderLabel: (item: T) => string;
  renderSub: (item: T) => string;
  onMerge: (primaryId: string, duplicateIds: string[]) => void;
  busy: boolean;
}) {
  const [primaryId, setPrimaryId] = useState(items[0]?.id ?? '');

  return (
    <Card>
      <CardHeader className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Possible duplicate group</CardTitle>
            <CardDescription className="mt-1">Choose the record to keep. Data from the others will be merged into it.</CardDescription>
          </div>
          <Badge variant="warning">{items.length} records</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="gap-2">
          {items.map((item) => {
            const selected = primaryId === item.id;
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition-colors ${
                  selected ? 'border-(--teal) bg-(--teal-l)' : 'border-border bg-card hover:bg-muted/20'
                }`}
              >
                <RadioGroupItem value={item.id} aria-label={`Keep ${renderLabel(item)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{renderLabel(item)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{renderSub(item)}</span>
                </span>
                {selected && <Badge variant="brand">Keep</Badge>}
              </label>
            );
          })}
        </RadioGroup>
        <div className="mt-4 flex justify-end">
          <Button size="sm" className="gap-2" disabled={!primaryId || busy} onClick={() => onMerge(primaryId, items.filter((item) => item.id !== primaryId).map((item) => item.id))}>
            <GitMerge className="h-4 w-4" /> {busy ? 'Merging…' : 'Merge selected'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CrmDuplicates() {
  const [tab, setTab] = useState<'leads' | 'customers'>('leads');
  const [leadGroups, setLeadGroups] = useState<{ leads: LeadDup[] }[] | null>(null);
  const [customerGroups, setCustomerGroups] = useState<{ customers: CustomerDup[] }[] | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(50); // 1–100, divided by 100 for API
  const [bulkMerging, setBulkMerging] = useState(false);

  const autoSwitched = useRef(false);

  const load = useCallback(() => {
    autoSwitched.current = false;
    const t = threshold / 100;
    apiFetch(`/v1/leads/duplicates?threshold=${t}`).then(data => { setLeadGroups(data); setLoadErrors(e => e.filter(x => x !== 'lead duplicates')); }).catch(() => { setLeadGroups([]); setLoadErrors(e => e.includes('lead duplicates') ? e : [...e, 'lead duplicates']); });
    apiFetch(`/v1/customers/duplicates?threshold=${t}`).then(data => { setCustomerGroups(data); setLoadErrors(e => e.filter(x => x !== 'customer duplicates')); }).catch(() => { setCustomerGroups([]); setLoadErrors(e => e.includes('customer duplicates') ? e : [...e, 'customer duplicates']); });
  }, [threshold]);
  useEffect(() => { load(); }, [load]);

  // Auto-switch to the tab that has results on initial load
  useEffect(() => {
    if (autoSwitched.current || leadGroups === null || customerGroups === null) return;
    autoSwitched.current = true;
    if (leadGroups.length === 0 && customerGroups.length > 0) setTab('customers');
    else if (customerGroups.length === 0 && leadGroups.length > 0) setTab('leads');
  }, [leadGroups, customerGroups]);

  async function mergeLeads(primaryId: string, duplicateIds: string[]) {
    const confirmed = await showConfirm(`Merge ${duplicateIds.length} lead(s) into the selected one? This cannot be undone.`, { confirmLabel: 'Merge Leads' });
    if (!confirmed) return;
    setMergingId(primaryId);
    try {
      await apiFetch('/v1/leads/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); } finally { setMergingId(null); }
  }

  async function mergeCustomers(primaryId: string, duplicateIds: string[]) {
    const confirmed = await showConfirm(`Merge ${duplicateIds.length} customer(s) into the selected one? Their shipments and invoices move to the surviving record.`, { confirmLabel: 'Merge Customers' });
    if (!confirmed) return;
    setMergingId(primaryId);
    try {
      await apiFetch('/v1/customers/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); } finally { setMergingId(null); }
  }

  async function mergeAll() {
    const groups = tab === 'leads' ? leadGroups : customerGroups;
    if (!groups || groups.length === 0) return;
    const confirmed = await showConfirm(
      `Auto-merge all ${groups.length} group(s)? The oldest record in each group is kept as the primary. This cannot be undone.`,
      { confirmLabel: 'Merge All' },
    );
    if (!confirmed) return;
    setBulkMerging(true);
    try {
      for (const group of groups) {
        const items = tab === 'leads' ? (group as any).leads : (group as any).customers;
        const sorted = [...items].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const primaryId = sorted[0].id;
        const duplicateIds = sorted.slice(1).map((x: any) => x.id);
        const endpoint = tab === 'leads' ? '/v1/leads/merge' : '/v1/customers/merge';
        await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      }
      load();
    } catch (err: any) {
      showAlert(err.message || 'Bulk merge failed');
    } finally {
      setBulkMerging(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Data Quality', 'Duplicates']}
        titlePlain="Find"
        titleEm="duplicates"
        subtitle="Review likely matches and select the authoritative record before merging customer data."
      />

      {/* Threshold tuning */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Match threshold</span>
              <span className="mono text-xs font-bold text-foreground">{threshold}%</span>
            </div>
            <Slider
              min={20} max={90} step={5}
              value={[threshold]}
              onValueChange={([v]) => setThreshold(v)}
              className="w-full"
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>More matches (looser)</span>
              <span>Fewer matches (stricter)</span>
            </div>
          </div>
          {(() => { const g = tab === 'leads' ? leadGroups : customerGroups; return g !== null && g.length > 0; })() && (
            <Button
              variant="outline" size="sm" className="shrink-0 gap-2"
              disabled={bulkMerging}
              onClick={mergeAll}
            >
              <GitMerge className="h-4 w-4" />
              {bulkMerging ? 'Merging…' : `Merge all (${(tab === 'leads' ? leadGroups : customerGroups)?.length ?? 0})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {loadErrors.length > 0 && <Banner variant="error" title="Duplicate records could not be checked">Unavailable: {loadErrors.join(', ')}. Refresh and try again.</Banner>}

      <MetricsRow cards={[
        {
          title: 'LEAD DUPLICATES',
          value: leadGroups === null ? '—' : String(leadGroups.length),
          loading: leadGroups === null,
          emphasis: tab === 'leads' ? 'primary' : 'default',
          onClick: () => setTab('leads'),
          icon: 'users',
        },
        {
          title: 'CUSTOMER DUPLICATES',
          value: customerGroups === null ? '—' : String(customerGroups.length),
          loading: customerGroups === null,
          emphasis: tab === 'customers' ? 'primary' : 'default',
          onClick: () => setTab('customers'),
          icon: 'users',
        },
      ]} />

      <div className="space-y-3">
        {tab === 'leads' ? (
          leadGroups === null ? (
            <Card><CardContent className="flex min-h-52 items-center justify-center"><SectionLoading /></CardContent></Card>
          ) : leadGroups.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <FeaturedIcon variant="success" size="lg" shape="circle"><CheckCircle2 className="h-6 w-6" /></FeaturedIcon>
                <h2 className="mt-4 text-sm font-bold text-foreground">No duplicate leads found</h2>
                {customerGroups !== null && customerGroups.length > 0 ? (
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    No lead matches at this threshold —{' '}
                    <button type="button" className="font-semibold text-(--teal) underline-offset-2 hover:underline" onClick={() => setTab('customers')}>
                      {customerGroups.length} customer group{customerGroups.length === 1 ? '' : 's'} need review
                    </button>.
                  </p>
                ) : (
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">No likely company-name matches at the current threshold.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SearchCheck className="h-4 w-4 text-(--teal)" />
                {leadGroups.length} group{leadGroups.length === 1 ? ' requires' : 's require'} review
              </div>
              {leadGroups.map((group, index) => (
                <DupGroup key={index} items={group.leads} onMerge={mergeLeads} busy={group.leads.some(item => item.id === mergingId)} renderLabel={(lead) => lead.company} renderSub={(lead) => `${lead.contact_name} · ${fmtValue(lead.value)}`} />
              ))}
            </>
          )
        ) : (
          customerGroups === null ? (
            <Card><CardContent className="flex min-h-52 items-center justify-center"><SectionLoading /></CardContent></Card>
          ) : customerGroups.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <FeaturedIcon variant="success" size="lg" shape="circle"><CheckCircle2 className="h-6 w-6" /></FeaturedIcon>
                <h2 className="mt-4 text-sm font-bold text-foreground">No duplicate customers found</h2>
                {leadGroups !== null && leadGroups.length > 0 ? (
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    No customer matches at this threshold —{' '}
                    <button type="button" className="font-semibold text-(--teal) underline-offset-2 hover:underline" onClick={() => setTab('leads')}>
                      {leadGroups.length} lead group{leadGroups.length === 1 ? '' : 's'} need review
                    </button>.
                  </p>
                ) : (
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">No likely account matches at the current threshold.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SearchCheck className="h-4 w-4 text-(--teal)" />
                {customerGroups.length} group{customerGroups.length === 1 ? ' requires' : 's require'} review
              </div>
              {customerGroups.map((group, index) => (
                <DupGroup key={index} items={group.customers} onMerge={mergeCustomers} busy={group.customers.some(item => item.id === mergingId)} renderLabel={(customer) => customer.name} renderSub={(customer) => customer.email || 'No email on file'} />
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}
