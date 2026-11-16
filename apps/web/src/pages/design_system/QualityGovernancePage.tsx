import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tip } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader.js';
import { MetricCard, MetricsRow } from '../../components/MetricCard.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import {
  ADOPTION_BASELINE_METRICS,
  EXCEPTION_REGISTER,
  PILOT_APPS,
  QUALITY_CHECKS,
} from './dsCatalogData.js';
import { DesignSystemStudioBar, useDesignStudioController } from './helpers.js';
import './DesignSystemApp.css';

const QUALITY_TABS = [
  { id: 'checks', label: 'Automated & Manual Checks' },
  { id: 'adoption', label: 'Adoption & Deprecated Paths' },
  { id: 'exceptions', label: 'Exception Register' },
  { id: 'pilots', label: 'FinOps & Axis Pilots' },
  { id: 'governance', label: 'Governance & Checklists' },
] as const;

type QualityTab = (typeof QUALITY_TABS)[number]['id'];

const RELEASE_CHECKLIST_ITEMS = [
  { id: 'chk-ts', label: 'Run npm run typecheck (tsc --noEmit, check:triggers, check:design-system, check:encoding)' },
  { id: 'chk-a11y', label: 'Run check:icon-button-names, check:field-labels, check:ui-focus-targets, check:ui-zoom-rtl' },
  { id: 'chk-layout', label: 'Wrap standard shell routes inside <Route element={<PageLayout />}>' },
  { id: 'chk-tokens', label: 'Use components/ui/* primitives and var(--*) CSS tokens — zero @hudumika/ui or hardcoded hex' },
  { id: 'chk-browser', label: 'Verify light/dark modes and 320px/375px/768px/1440px viewports in browser or PreviewStage' },
];

export function QualityGovernancePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const studio = useDesignStudioController();
  const activeTab: QualityTab = QUALITY_TABS.some(t => t.id === tab) ? (tab as QualityTab) : 'checks';

  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    'chk-ts': true,
    'chk-a11y': true,
  });

  function copyCmd(cmd: string) {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1300);
  }

  return (
    <div className="dsa-page">
      <PageHeader
        crumbs={['Design System', 'Quality & Governance']}
        titlePlain="Quality &"
        titleEm="governance"
        subtitle="Real verification gates, documented exception waivers, deprecated package blockers, FinOps & Axis adoption pilots, and release playbooks."
        actions={
          <Tip label="Inspect working production screen pilots assembled from shared primitives">
            <Button variant="outline" size="sm" asChild>
              <Link to="/design-system/components/examples">View Working Pilot Examples</Link>
            </Button>
          </Tip>
        }
      />

      <DesignSystemStudioBar studio={studio} />

      <MetricsRow
        cards={ADOPTION_BASELINE_METRICS.map(m => ({
          title: m.label,
          value: m.value,
          sub1Label: 'SCOPE',
          sub1Value: m.sub,
        }))}
      />

      <Tabs
        value={activeTab}
        variant="segmented"
        onValueChange={val => navigate(`/design-system/quality/${val}`)}
      >
        <TabsList className="flex-wrap">
          {QUALITY_TABS.map(t => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="checks" className="space-y-4 mt-4">
          <SectionCard title="Platform Verification & Accessibility Checks">
            <div className="space-y-3">
              {QUALITY_CHECKS.map(chk => (
                <div key={chk.id} className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{chk.name}</span>
                      <Badge variant={chk.status === 'automated' ? 'success' : chk.status === 'manual' ? 'brand' : 'warning'}>
                        {chk.status === 'automated' ? 'Automated CI Gate' : chk.status === 'manual' ? 'Manually Verified' : 'Scheduled E2E'}
                      </Badge>
                      <Badge variant="outline">{chk.lastResult}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{chk.description}</p>
                    <div className="text-[11px] font-mono text-muted-foreground">Scope: {chk.scope}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <code className="text-xs font-mono px-2.5 py-1.5 rounded bg-muted text-foreground border border-border">
                      {chk.command}
                    </code>
                    <Tip label={`Copy command: ${chk.command}`}>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Copy command ${chk.command}`}
                        onClick={() => copyCmd(chk.command)}
                      >
                        <Icon name={copiedCmd === chk.command ? 'check' : 'copy'} size={13} />
                      </Button>
                    </Tip>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="adoption" className="space-y-4 mt-4">
          <div className="dsa-grid-2">
            <SectionCard title="Deprecated Primitives & Frozen Dead Ends">
              <div className="space-y-2.5 text-xs">
                {[
                  { item: '@hudumika/ui (packages/ui)', count: '2 legacy sites', rule: 'Frozen — migrate to @/components/ui/*' },
                  { item: '@hudumika/api-client (packages/api-client)', count: '0 live imports', rule: 'Do not wire up — use apiFetch from lib/api.ts' },
                  { item: 'TopBar.tsx (apps/web/src/components/TopBar.tsx)', count: '0 live imports', rule: 'Replaced by AppHeader.tsx inside WorkspaceApp shells' },
                  { item: 'Uncontracted .btn / raw hardcoded hex accents', count: 'Gated in pilot apps', rule: 'Tracked in check-design-system.mjs & docs/DESIGN_SYSTEM_ADOPTION.md' },
                ].map(d => (
                  <div key={d.item} className="dsa-waterfall-step">
                    <div>
                      <div className="font-bold text-foreground">{d.item}</div>
                      <div className="text-muted-foreground">{d.rule}</div>
                    </div>
                    <Badge variant="destructive">{d.count}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Platform Source of Truth Documents">
              <div className="space-y-2.5 text-xs">
                <div className="dsa-waterfall-step">
                  <div>
                    <div className="font-bold">Component Mapping & Tenant Rule</div>
                    <div className="text-muted-foreground">Authoritative primitive mapping and Tailwind v4 rules</div>
                  </div>
                  <a href="file:///D:/Apps/Hudumika/CLAUDE.md" className="font-mono text-primary underline">CLAUDE.md</a>
                </div>
                <div className="dsa-waterfall-step">
                  <div>
                    <div className="font-bold">Design System Engineering Spec</div>
                    <div className="text-muted-foreground">Token architecture, PageHeader, and portal scoping</div>
                  </div>
                  <a href="file:///D:/Apps/Hudumika/docs/DESIGN_SYSTEM.md" className="font-mono text-primary underline">docs/DESIGN_SYSTEM.md</a>
                </div>
                <div className="dsa-waterfall-step">
                  <div>
                    <div className="font-bold">Adoption Metrics & Exception Register</div>
                    <div className="text-muted-foreground">Historical migration batches and tracked waivers</div>
                  </div>
                  <a href="file:///D:/Apps/Hudumika/docs/DESIGN_SYSTEM_ADOPTION.md" className="font-mono text-primary underline">DESIGN_SYSTEM_ADOPTION.md</a>
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-4 mt-4">
          <SectionCard title="Documented Design System Exception Register">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">ID</th>
                    <th className="py-2 pr-3 font-semibold">Surface / Path</th>
                    <th className="py-2 pr-3 font-semibold">Category</th>
                    <th className="py-2 pr-3 font-semibold">Rationale</th>
                    <th className="py-2 pr-3 font-semibold">Review</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {EXCEPTION_REGISTER.map(ex => (
                    <tr key={ex.id} className="border-b border-border/60">
                      <td className="py-2.5 pr-3 font-mono font-bold">{ex.id}</td>
                      <td className="py-2.5 pr-3 font-semibold text-foreground">{ex.surface}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{ex.category}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{ex.reason}</td>
                      <td className="py-2.5 pr-3 font-mono">{ex.reviewDate}</td>
                      <td className="py-2.5">
                        <Badge variant={ex.status === 'active-waiver' ? 'secondary' : 'warning'}>
                          {ex.status === 'active-waiver' ? 'Waiver' : 'Remediation'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="pilots" className="space-y-4 mt-4">
          <div className="dsa-grid-2">
            {PILOT_APPS.map(pilot => (
              <Card key={pilot.appId}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">{pilot.appName}</CardTitle>
                    <Badge variant={pilot.status === 'audited-clean' ? 'success' : pilot.status === 'in-progress' ? 'brand' : 'outline'}>
                      {pilot.status === 'audited-clean' ? 'Pilot Clean' : pilot.status === 'in-progress' ? 'Rebuilt' : 'Baseline'}
                    </Badge>
                  </div>
                  <CardDescription>{pilot.adoptionScore} · <code>{pilot.shellFile}</code></CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                    {pilot.highlights.map(h => <li key={h}>{h}</li>)}
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={pilot.route}>Open {pilot.appName}</Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/design-system/configurator/${pilot.appId}`}>Configure Accent</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="governance" className="space-y-4 mt-4">
          <div className="dsa-grid-2">
            <SectionCard title="Interactive Pre-Merge Release Checklist">
              <div className="space-y-3">
                {RELEASE_CHECKLIST_ITEMS.map(item => (
                  <div key={item.id} className="flex items-start gap-2.5">
                    <Checkbox
                      id={item.id}
                      checked={Boolean(checkedItems[item.id])}
                      onCheckedChange={v => setCheckedItems(p => ({ ...p, [item.id]: Boolean(v) }))}
                    />
                    <Label htmlFor={item.id} className="text-xs leading-relaxed cursor-pointer">
                      {item.label}
                    </Label>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="How to Add Tokens, Components & Waivers">
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-4 leading-relaxed">
                <li><strong>Propose or reuse first:</strong> Check Components Catalog & <code>apps/web/src/components/ui/</code> before writing custom CSS.</li>
                <li><strong>Tokens before hexes:</strong> Express every color through <code>--surface</code>, <code>--border</code>, <code>--ink*</code>, <code>--teal</code>, or semantic status vars.</li>
                <li><strong>Register variants:</strong> Document any new <code>ui/</code> primitive in <code>dsCatalogData.ts</code> alongside a live <code>PreviewStage</code> specimen.</li>
                <li><strong>Request an exception:</strong> Only full-bleed canvas views, print PDFs, or registered brand marks qualify for waivers in <code>DESIGN_SYSTEM_ADOPTION.md</code>.</li>
              </ol>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
