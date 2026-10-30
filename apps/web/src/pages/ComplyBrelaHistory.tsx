import {Banner} from '../components/ui/alert.js';
import {Table, TableHeader, TableRow, TableHead, TableBody, TableCell} from '../components/ui/table.js';
import { complyBadgeVariant } from '../lib/complyPresentation.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Card } from '../components/ui/card.js';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyBrelaHistory } from '../hooks/useComply.js';
import type { CompBrelaSearchHistoryEntry } from '@hudumika/types';
import './ComplyOS.css';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function queryLabel(entry: CompBrelaSearchHistoryEntry): string {
  return entry.company_name || entry.inc_number || '(blank search — all records)';
}

export function ComplyBrelaHistory() {
  const navigate = useNavigate();
  const { history, loading, error, refresh } = useComplyBrelaHistory();
  const [selected, setSelected] = useState<CompBrelaSearchHistoryEntry | null>(null);

  return (
    <div className="comply-page">
      <PageHeader
        crumbs={['ComplyOS', 'BRELA history']}
        titlePlain="BRELA"
        titleEm="history"
        subtitle="Every BRELA search run by your team, with what it found."
        actions={
        <div className="comply-action-row">
          <Tip label="Refresh"><Button type="button" variant="outline" size="icon" onClick={refresh} aria-label="Refresh BRELA history">
            <Icon name="refresh" size={13} />
          </Button></Tip>
          <Button type="button" size="sm" onClick={() => navigate('/complyos/brela-search')}>
            <Icon name="search" size={14} /> New Search
          </Button>
        </div>
        }
      />

      {error && <Banner variant="error" icon={false} className="">Failed to load search history: {error}</Banner>}

      <Card className="comply-card">
        <div className="comply-card-body">
          <Table className="comply-table">
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 160 }}>Searched</TableHead>
                <TableHead>Query</TableHead>
                <TableHead style={{ width: 130 }}>Type</TableHead>
                <TableHead style={{ width: 110 }}>Source</TableHead>
                <TableHead style={{ width: 90 }}>Results</TableHead>
                <TableHead style={{ width: 160 }}>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="comply-empty-hint"><SectionLoading label="Loading search history…" /></TableCell></TableRow>}
              {!loading && history.length === 0 && (
                <TableRow><TableCell colSpan={6} className="comply-empty-hint">No BRELA searches yet — searches you run from BRELA Search will show up here.</TableCell></TableRow>
              )}
              {history.map(entry => (
                <TableRow tabIndex={0} onKeyDown={event => {if(event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')){event.preventDefault();event.currentTarget.click();}}}
                  key={entry.id}
                  className="comply-tr-click"
                  onClick={() => setSelected(entry)}
                  style={{ background: selected?.id === entry.id ? 'var(--comply-l)' : undefined }}
                >
                  <TableCell data-label="Searched" className="comply-td-muted">{formatWhen(entry.created_at)}</TableCell>
                  <TableCell data-label="Query" className="comply-table-name">{queryLabel(entry)}</TableCell>
                  <TableCell data-label="Type" className="comply-td-muted">{entry.object_type}</TableCell>
                  <TableCell data-label="Source">
                    <Badge variant={complyBadgeVariant(`comply-badge comply-badge--${entry.is_live ? 'active' : 'draft'}`)}>
                      {entry.is_live ? 'Live' : 'Reference'}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Results" className="comply-td-muted">{entry.result_count}</TableCell>
                  <TableCell data-label="By" className="comply-td-muted">
                    {entry.searched_by_name ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <PersonAvatar userId={entry.searched_by} name={entry.searched_by_name} size={18} />
                        {entry.searched_by_name}
                      </span>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selected && (
        <Card className="comply-card" style={{ marginTop: 24 }}>
          <div className="comply-card-hdr">
            <h3 className="comply-card-title">
              <span className="comply-card-title-row">
                <Icon name="list" size={15} color="var(--comply)" />
                Results for "{queryLabel(selected)}" — {formatWhen(selected.created_at)}
              </span>
            </h3>
            <Tip label="Close"><Button variant="ghost" size="icon" type="button" className="comply-close-btn" aria-label="Close" onClick={() => setSelected(null)} >
              <Icon name="x" size={16} />
            </Button></Tip>
          </div>
          <div className="comply-card-body">
            {(Array.isArray(selected.results) ? selected.results : []).length === 0 ? (
              <div className="comply-empty-hint">This search returned no matching records.</div>
            ) : (
              <Table className="comply-table">
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 140 }}>Object number</TableHead>
                    <TableHead style={{ width: 220 }}>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead style={{ width: 110 }}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(selected.results) ? selected.results : []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell data-label="Object number" className="comply-td-mono">{r.reg_number}</TableCell>
                      <TableCell data-label="Name" className="comply-table-name">{r.name}</TableCell>
                      <TableCell data-label="Address" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{r.registered_office}</TableCell>
                      <TableCell data-label="Status"><Badge variant={complyBadgeVariant("comply-badge comply-badge--active")}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
