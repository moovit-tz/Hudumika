import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Card } from '../components/ui/card.js';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { useComplyAgencyDirectory } from '../hooks/useComply.js';
import type { CompAgencyDirectoryEntry } from '@hudumika/types';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Button } from '../components/ui/button.js';

type Agency = CompAgencyDirectoryEntry;

const CATEGORIES = ['All', 'Corporate', 'Tax', 'Social Security', 'Regulatory', 'Financial'];

const PORTAL_TYPE_LABEL: Record<string, string> = {
  api: 'Live API', portal: 'Online', manual: 'Walk-in', legal_firm: 'Via Legal Firm',
};

export function ComplyAgencies() {
  const { agencies, loading } = useComplyAgencyDirectory();
  const [cat, setCat] = useState('All');
  const [selected, setSelected] = useState<Agency | null>(null);

  const visible = cat === 'All' ? agencies : agencies.filter(a => a.category === cat);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'Government Agencies']}
        titlePlain="Government"
        titleEm="agencies"
        subtitle="All regulatory bodies relevant to business compliance in Tanzania"
      />

      <Tabs value={cat} onValueChange={setCat}>
        <TabsList style={{ marginBottom: 20 }}>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="comply-card">
        <div className="comply-card-body">
          {loading ? (
            <div className="comply-empty"><SectionLoading label="Loading agencies…" /></div>
          ) : (
          <Table className="comply-table">
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Key Obligations</TableHead>
                <TableHead>Turnaround</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(ag => (
                <TableRow tabIndex={0} onKeyDown={event => {if(event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')){event.preventDefault();event.currentTarget.click();}}} key={ag.code} onClick={() => setSelected(ag)}>
                  <TableCell data-label="Agency">
                    <div className="comply-table-name">{ag.code}</div>
                    <div className="comply-table-sub">{ag.name}</div>
                  </TableCell>
                  <TableCell data-label="Category"><Badge variant={complyBadgeVariant(`comply-agency comply-agency--${ag.agency_class}`)}>{ag.category}</Badge></TableCell>
                  <TableCell data-label="Key Obligations">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ag.obligations.slice(0, 2).map(o => <Badge key={o} variant={complyBadgeVariant("comply-firm-tag")} style={{ fontSize: 10.5 }}>{o}</Badge>)}
                      {ag.obligations.length > 2 && <Badge variant={complyBadgeVariant("comply-firm-tag")} style={{ fontSize: 10.5 }}>+{ag.obligations.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell data-label="Turnaround" style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{ag.turnaround}</TableCell>
                  <TableCell data-label="Channel">
                    {ag.portal_type === 'api' || ag.portal_type === 'portal'
                      ? <Badge variant={complyBadgeVariant("comply-badge comply-badge--active")}>{PORTAL_TYPE_LABEL[ag.portal_type]}</Badge>
                      : <Badge variant={complyBadgeVariant("comply-badge comply-badge--draft")}>{PORTAL_TYPE_LABEL[ag.portal_type]}</Badge>}
                  </TableCell>
                  <TableCell data-label="Actions" onClick={e => e.stopPropagation()}>
                    <Button asChild variant="outline" size="xs"><Link to="/complyos/applications">Apply</Link></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </div>
      </Card>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <SheetContent aria-describedby={undefined} className="comply-detail-sheet w-full sm:max-w-xl flex flex-col p-0 gap-0">
          {selected && (
            <>
              <SheetHeader className="comply-detail-header">
                <SheetTitle style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>{selected.code}</SheetTitle>
                <div style={{ fontSize: 13, color: 'var(--ink2)' }}>{selected.name}</div>
              </SheetHeader>
              <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="comply-grid-2" style={{ gap: 14, marginBottom: 0 }}>
                  {[
                    { label: 'Category', val: selected.category },
                    { label: 'Location', val: selected.location },
                    { label: 'Phone', val: selected.phone },
                    { label: 'Website', val: selected.website },
                    { label: 'Turnaround', val: selected.turnaround },
                    { label: 'Portal', val: PORTAL_TYPE_LABEL[selected.portal_type] },
                  ].map(m => (
                    <div key={m.label}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{m.val}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Obligations</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selected.obligations.map(o => (
                      <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                        <Icon name="fileText" size={13} />
                        <span style={{ fontSize: 13, color: 'var(--ink)' }}>{o}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Button asChild size="sm" style={{alignSelf: 'flex-start'}}><Link to="/complyos/applications" onClick={() => setSelected(null)}><Icon name="plus" size={13} /> Start Application</Link></Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
