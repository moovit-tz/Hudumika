import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, GitMerge, SearchCheck, Users } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface LeadDup { id: string; company: string; contact_name: string; value: number; created_at: string }
interface CustomerDup { id: string; name: string; email?: string; created_at: string }

function fmtValue(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(value);
}

function DupGroup<T extends { id: string; created_at: string }>({ items, renderLabel, renderSub, onMerge }: {
  items: T[];
  renderLabel: (item: T) => string;
  renderSub: (item: T) => string;
  onMerge: (primaryId: string, duplicateIds: string[]) => void;
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
                  selected ? 'border-[var(--teal)] bg-[var(--teal-l)]' : 'border-border bg-card hover:bg-muted/20'
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
          <Button size="sm" className="gap-2" disabled={!primaryId} onClick={() => onMerge(primaryId, items.filter((item) => item.id !== primaryId).map((item) => item.id))}>
            <GitMerge className="h-4 w-4" /> Merge into selected
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

  const load = useCallback(() => {
    apiFetch('/v1/leads/duplicates').then(setLeadGroups).catch(() => setLeadGroups([]));
    apiFetch('/v1/customers/duplicates').then(setCustomerGroups).catch(() => setCustomerGroups([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mergeLeads(primaryId: string, duplicateIds: string[]) {
    const confirmed = await showConfirm(`Merge ${duplicateIds.length} lead(s) into the selected one? This cannot be undone.`, { confirmLabel: 'Merge Leads' });
    if (!confirmed) return;
    try {
      await apiFetch('/v1/leads/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); }
  }

  async function mergeCustomers(primaryId: string, duplicateIds: string[]) {
    const confirmed = await showConfirm(`Merge ${duplicateIds.length} customer(s) into the selected one? Their shipments and invoices move to the surviving record.`, { confirmLabel: 'Merge Customers' });
    if (!confirmed) return;
    try {
      await apiFetch('/v1/customers/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); }
  }

  const activeGroups = tab === 'leads' ? leadGroups : customerGroups;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Data Quality', 'Duplicates']}
        titlePlain="Find"
        titleEm="duplicates"
        subtitle="Review likely matches and select the authoritative record before merging customer data."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="tablist" aria-label="Duplicate record type">
        {([
          { key: 'leads' as const, label: 'Lead duplicates', description: 'Potential matches based on company names.', count: leadGroups?.length ?? 0 },
          { key: 'customers' as const, label: 'Customer duplicates', description: 'Potential matches across customer accounts.', count: customerGroups?.length ?? 0 },
        ]).map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={`flex min-h-20 items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                active ? 'border-[var(--teal)] bg-[var(--teal-l)] ring-1 ring-[var(--teal)]/20' : 'border-border bg-card hover:border-[var(--teal)]/50 hover:bg-muted/20'
              }`}
            >
              <FeaturedIcon variant={active ? 'brand' : 'gray'} size="sm" shape="square"><Users className="h-4 w-4" /></FeaturedIcon>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">{item.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
              </span>
              <Badge variant={active ? 'brand' : 'gray'}>{item.count}</Badge>
            </button>
          );
        })}
      </div>

      {activeGroups === null ? (
        <Card><CardContent className="flex min-h-52 items-center justify-center"><SectionLoading /></CardContent></Card>
      ) : activeGroups.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
            <FeaturedIcon variant="success" size="lg" shape="circle"><CheckCircle2 className="h-6 w-6" /></FeaturedIcon>
            <h2 className="mt-4 text-sm font-bold text-foreground">No duplicate {tab} found</h2>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">The current CRM records do not contain any likely company-name matches.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SearchCheck className="h-4 w-4 text-[var(--teal)]" />
            {activeGroups.length} group{activeGroups.length === 1 ? '' : 's'} require review
          </div>
          {tab === 'leads'
            ? leadGroups!.map((group, index) => <DupGroup key={index} items={group.leads} onMerge={mergeLeads} renderLabel={(lead) => lead.company} renderSub={(lead) => `${lead.contact_name} · ${fmtValue(lead.value)}`} />)
            : customerGroups!.map((group, index) => <DupGroup key={index} items={group.customers} onMerge={mergeCustomers} renderLabel={(customer) => customer.name} renderSub={(customer) => customer.email || 'No email on file'} />)}
        </div>
      )}
    </div>
  );
}
