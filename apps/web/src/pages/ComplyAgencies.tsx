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

      <Tabs value={cat} onValueChange={setCat} variant="boxed">
        <TabsList style={{ marginBottom: 20 }}>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="comply-card">
        <div className="comply-card-body">
          {loading ? (
            <div className="comply-empty">Loading agencies…</div>
          ) : (
          <table className="comply-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Category</th>
                <th>Key Obligations</th>
                <th>Turnaround</th>
                <th>Channel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(ag => (
                <tr key={ag.code} onClick={() => setSelected(ag)}>
                  <td>
                    <div className="comply-table-name">{ag.code}</div>
                    <div className="comply-table-sub">{ag.name}</div>
                  </td>
                  <td><span className={`comply-agency comply-agency--${ag.agency_class}`}>{ag.category}</span></td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ag.obligations.slice(0, 2).map(o => <span key={o} className="comply-firm-tag" style={{ fontSize: 10.5 }}>{o}</span>)}
                      {ag.obligations.length > 2 && <span className="comply-firm-tag" style={{ fontSize: 10.5 }}>+{ag.obligations.length - 2}</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{ag.turnaround}</td>
                  <td>
                    {ag.portal_type === 'api' || ag.portal_type === 'portal'
                      ? <span className="comply-badge comply-badge--active">{PORTAL_TYPE_LABEL[ag.portal_type]}</span>
                      : <span className="comply-badge comply-badge--draft">{PORTAL_TYPE_LABEL[ag.portal_type]}</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <Button asChild variant="outline" size="xs"><Link to="/complyos/applications">Apply</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <SheetContent className="w-105 sm:max-w-105 flex flex-col p-0 gap-0">
          {selected && (
            <>
              <SheetHeader style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
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
                <Button asChild size="sm" style={{ alignSelf: 'flex-start' }}><Link to="/complyos/applications" onClick={() => setSelected(null)}><Icon name="plus" size={13} /> Start Application</Link></Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
