import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DataTable } from '@/components/ui/DataTable';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { showConfirm } from '../../lib/confirm.js';
import { PATTERN_SPECS, type PatternSpec } from './dsCatalogData.js';
import { DesignSystemStudioBar, useDesignStudioController } from './helpers.js';
import './DesignSystemApp.css';

const BULK_DEMO_ROWS = [
  { id: 'b1', ref: 'PO-2026-881', vendor: 'Dar Port Authority', amount: 'TZS 3,150,000' },
  { id: 'b2', ref: 'PO-2026-882', vendor: 'East Coast Hauliers', amount: 'TZS 1,420,000' },
  { id: 'b3', ref: 'PO-2026-883', vendor: 'Kilimanjaro Fuel Ltd', amount: 'TZS 890,000' },
];

export function PatternsPage() {
  const { patternId } = useParams<{ patternId?: string }>();
  const navigate = useNavigate();
  const studio = useDesignStudioController();

  const selected: PatternSpec =
    PATTERN_SPECS.find(p => p.id === patternId) ?? PATTERN_SPECS[0]!;

  // Interactive Pattern Demonstrations
  const [tinInput, setTinInput] = useState('INVALID-TIN');
  const [formError, setFormError] = useState<string | null>('TIN must be 9 numeric digits (e.g. 102445890).');
  const [formSaved, setFormSaved] = useState(false);

  const [confirmOutcome, setConfirmOutcome] = useState<string>('No confirmation triggered yet.');
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(() => new Set(['b1']));
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<'error' | 'loading' | 'ready'>('error');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function validateDemoForm(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{9}$/.test(tinInput.trim())) {
      setFormError('TIN must be 9 numeric digits (e.g. 102445890).');
      setFormSaved(false);
      return;
    }
    setFormError(null);
    setFormSaved(true);
  }

  async function triggerDeleteConfirm() {
    const ok = await showConfirm('Archiving removes this vendor from active PO creation across workspaces.', {
      title: 'Archive vendor profile?',
      confirmLabel: 'Archive Vendor',
      variant: 'danger',
    });
    setConfirmOutcome(ok ? 'Confirmed: destructive callback executed cleanly.' : 'Cancelled: record remained untouched.');
  }

  function triggerRetryFlow() {
    setRetryState('loading');
    setTimeout(() => setRetryState('ready'), 450);
  }

  function renderInteractiveDemo(spec: PatternSpec) {
    switch (spec.id) {
      case 'form-validation':
        return (
          <form onSubmit={validateDemoForm} className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="pat-vendor-tin">Vendor TIN *</Label>
              <Input
                id="pat-vendor-tin"
                value={tinInput}
                onChange={e => setTinInput(e.target.value)}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? 'pat-tin-err' : undefined}
              />
              {formError && (
                <p id="pat-tin-err" role="alert" className="text-xs text-destructive flex items-center gap-1.5">
                  <Icon name="alertCircle" size={12} />
                  {formError}
                </p>
              )}
              {formSaved && (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
                  <Icon name="checkCircle" size={12} />
                  Valid 9-digit TIN accepted without mutating unrelated fields.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">Validate Submission</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setTinInput('102445890'); setFormError(null); }}>
                Fill Valid TIN
              </Button>
            </div>
          </form>
        );

      case 'destructive-confirmation':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="destructive" size="sm" onClick={triggerDeleteConfirm}>
                Archive Vendor (Live ConfirmHost)
              </Button>
              <span className="text-xs text-muted-foreground">{confirmOutcome}</span>
            </div>
          </div>
        );

      case 'table-bulk-actions':
        return (
          <div className="space-y-3">
            {selectedBulkIds.size > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg border border-border bg-card">
                <span className="text-xs font-semibold">{selectedBulkIds.size} purchase orders selected</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setBulkMessage(`Approved ${selectedBulkIds.size} selected order(s).`)}>
                    Approve Selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedBulkIds(new Set()); setBulkMessage(null); }}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
            {bulkMessage && <Alert><AlertDescription>{bulkMessage}</AlertDescription></Alert>}
            <DataTable
              columns={[
                { key: 'ref', header: 'PO #' },
                { key: 'vendor', header: 'Vendor' },
                { key: 'amount', header: 'Total', align: 'right' },
              ]}
              rows={BULK_DEMO_ROWS}
              selectedIds={selectedBulkIds}
              onSelectionChange={setSelectedBulkIds}
              pageSize={5}
            />
          </div>
        );

      case 'permission-gates':
        return (
          <div className="space-y-3">
            <Alert>
              <Icon name="lock" size={14} />
              <AlertTitle>Read-only preview enabled for non-admin staff</AlertTitle>
              <AlertDescription>
                Staff roles can inspect token resolution, contrast scores, and isolated previews. Platform Publish requires <code>SUPER_ADMIN</code>.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline">Run Local Draft Preview (Allowed)</Button>
              <Button type="button" size="sm" disabled>Publish Platform Accent (Admin Only)</Button>
            </div>
          </div>
        );

      case 'retry-error-flows':
        return (
          <div className="space-y-3">
            {retryState === 'error' && (
              <Alert variant="destructive">
                <AlertTitle>Failed to sync upstream invoice feed</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
                  <span>Request timed out after 5s. Your draft changes remain preserved.</span>
                  <Button type="button" size="sm" variant="outline" onClick={triggerRetryFlow}>
                    Retry Sync
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {retryState === 'loading' && <div className="text-xs text-muted-foreground">Retrying API fetch...</div>}
            {retryState === 'ready' && (
              <Alert>
                <AlertTitle>Synchronized cleanly</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>34 invoices reconciled without data loss.</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRetryState('error')}>Simulate Error Again</Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      default:
        return (
          <div className="text-xs text-muted-foreground">
            Master/Detail routes split a 320px rail + fluid workspace inside <code>PageLayout</code>, collapsing to a stacked column below 960px.
          </div>
        );
    }
  }

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'Patterns']}
        titlePlain="Interaction"
        titleEm="patterns"
        subtitle="End-to-end UX contracts ensuring validation, confirmations, bulk tables, permission boundaries, and recovery flows feel identical across apps."
      />

      <DesignSystemStudioBar studio={studio} />

      <div className="dsa-split-workspace">
        <aside className="dsa-list-rail" aria-label="Pattern index">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1">
            Platform Blueprints ({PATTERN_SPECS.length})
          </div>
          <div className="dsa-list-scroll">
            {PATTERN_SPECS.map(spec => {
              const active = spec.id === selected.id;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => navigate(`/design-system/patterns/${spec.id}`)}
                  aria-current={active ? 'true' : undefined}
                  className={`dsa-rail-item ${active ? 'dsa-rail-item--active' : ''}`}
                  data-ui-native-button=""
                >
                  <span className="truncate">{spec.title}</span>
                  <Icon name="chevronRight" size={13} />
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-5 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <Badge variant="outline" className="mb-1.5">{selected.category}</Badge>
                  <CardTitle className="text-lg">{selected.title}</CardTitle>
                  <CardDescription className="mt-1">{selected.summary}</CardDescription>
                </div>
                <Tip label={`Copy ${selected.title} recipe code snippet`}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(selected.codeSnippet);
                      setCopiedId(selected.id);
                      setTimeout(() => setCopiedId(null), 1400);
                    }}
                  >
                    <Icon name={copiedId === selected.id ? 'check' : 'copy'} size={13} />
                    {copiedId === selected.id ? 'Copied' : 'Copy Recipe'}
                  </Button>
                </Tip>
              </div>
            </CardHeader>
          </Card>

          <SectionCard title="Interactive Pattern Demonstration">
            {renderInteractiveDemo(selected)}
          </SectionCard>

          <div className="dsa-grid-2">
            <SectionCard title="Implementation Rules">
              <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4 leading-relaxed">
                {selected.rules.map(rule => <li key={rule}>{rule}</li>)}
              </ul>
            </SectionCard>

            <SectionCard title="Accessibility Checklist & Sources">
              <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4 leading-relaxed mb-4">
                {selected.a11yChecklist.map(chk => <li key={chk}>{chk}</li>)}
              </ul>
              <div className="space-y-1 border-t border-border pt-3">
                {selected.sourceFiles.map(sf => (
                  <div key={sf}>
                    <a href={`file:///D:/Apps/Hudumika/${sf}`} className="text-xs font-mono text-primary underline underline-offset-4">
                      {sf}
                    </a>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Reference Snippet"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/design-system/components">Inspect Underlying Primitives</Link>
              </Button>
            }
          >
            <pre className="dsa-code-block">{selected.codeSnippet}</pre>
          </SectionCard>
        </main>
      </div>
    </div>
  );
}
