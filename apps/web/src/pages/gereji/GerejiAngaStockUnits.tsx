import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface StockUnit {
  id: string; part_id: string; pn: string; description: string | null; serial: string | null;
  quantity: number; condition: string; ownership: string; customs_status: string; availability: string; created_at: string;
}
interface Certificate { id: string; type: string; expiry_date: string | null }
interface TraceLink { id: string; from_party: string | null; to_party: string | null; hop_type: string | null; occurred_at: string | null }

const AVAILABILITY_STATES = ['AVAILABLE', 'RESERVED', 'ALLOCATED', 'ON_LOAN', 'IN_REPAIR', 'QUARANTINE', 'SOLD', 'SCRAPPED'];
const AVAILABILITY_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['RESERVED', 'ON_LOAN', 'IN_REPAIR', 'QUARANTINE'], RESERVED: ['ALLOCATED', 'AVAILABLE', 'QUARANTINE'],
  ALLOCATED: ['AVAILABLE', 'SOLD', 'QUARANTINE'], ON_LOAN: ['AVAILABLE', 'QUARANTINE'], IN_REPAIR: ['AVAILABLE', 'QUARANTINE'],
  QUARANTINE: ['AVAILABLE', 'SCRAPPED'], SOLD: [], SCRAPPED: [],
};
const AVAILABILITY_BADGE: Record<string, 'success' | 'info' | 'brand' | 'warning' | 'error' | 'gray'> = {
  AVAILABLE: 'success', RESERVED: 'info', ALLOCATED: 'brand', ON_LOAN: 'warning', IN_REPAIR: 'warning', QUARANTINE: 'error', SOLD: 'gray', SCRAPPED: 'gray',
};
const CERT_TYPES = ['FAA_8130_3', 'EASA_FORM_1', 'UK_CAA_FORM_1', 'TCCA_FORM_ONE', 'CASA_FORM_1', 'ANAC_F100', 'COFC', 'ATA_106', 'TEARDOWN_REPORT', 'NON_INCIDENT_STATEMENT'];


export function GerejiAngaStockUnits() {
  const [rows, setRows] = useState<StockUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [availabilityFilter, setAvailabilityFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [traceLinks, setTraceLinks] = useState<TraceLink[]>([]);
  const [certDialog, setCertDialog] = useState<string | null>(null);
  const [certType, setCertType] = useState(CERT_TYPES[0]);
  const [certExpiry, setCertExpiry] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    const qs = availabilityFilter ? `?availability=${availabilityFilter}` : '';
    apiFetch(`/v1/gereji/anga/stock-units${qs}`).then(d => setRows(d.stockUnits ?? [])).finally(() => setLoading(false));
  }, [availabilityFilter]);

  useEffect(() => { reload(); }, [reload]);

  async function expand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const d = await apiFetch(`/v1/gereji/anga/stock-units/${id}`).catch(() => ({ certificates: [], trace_chain: [] }));
    setCerts(d.certificates ?? []);
    setTraceLinks(d.trace_chain ?? []);
  }

  async function transition(id: string, availability: string) {
    try {
      await apiFetch(`/v1/gereji/anga/stock-units/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ availability }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  async function addCertificate() {
    if (!certDialog) return;
    try {
      await apiFetch(`/v1/gereji/anga/stock-units/${certDialog}/certificates`, {
        method: 'POST', body: JSON.stringify({ type: certType, expiry_date: certExpiry || undefined }),
      });
      setCertDialog(null);
      setCertExpiry('');
      const d = await apiFetch(`/v1/gereji/anga/stock-units/${certDialog}`);
      setCerts(d.certificates ?? []);
    } catch (e: any) { showAlert(e.message || 'Failed to add certificate.'); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Stock"
        titleEm="units"
        subtitle="Serialised and lotted inventory — condition, availability, ownership and customs status."
      />

      <div style={{ marginBottom: 12 }}>
        <SingleSelectFilter
          label="Availability" value={availabilityFilter} onChange={setAvailabilityFilter}
          options={AVAILABILITY_STATES.map(a => ({ value: a, label: a.replace(/_/g, ' ') }))}
        />
      </div>

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No stock units yet — receive goods to create some.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['PN', 'Serial', 'Condition', 'Ownership', 'Customs', 'Availability', 'Received', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(u => (
                    <React.Fragment key={u.id}>
                      <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => expand(u.id)}>
                        <td style={{ ...TD, fontWeight: 600, fontFamily: 'var(--font)' }}>{u.pn}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{u.serial ?? '—'}</td>
                        <td style={TD}><Badge variant="gray">{u.condition}</Badge></td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{u.ownership.replace(/_/g, ' ')}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{u.customs_status.replace(/_/g, ' ')}</td>
                        <td style={TD}><Badge variant={AVAILABILITY_BADGE[u.availability] ?? 'gray'}>{u.availability.replace(/_/g, ' ')}</Badge></td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(u.created_at)}</td>
                        <td style={{ ...TD, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {(AVAILABILITY_TRANSITIONS[u.availability] ?? []).map(a => (
                                <DropdownMenuItem key={a} onClick={() => transition(u.id, a)}>Move to {a.replace(/_/g, ' ')}</DropdownMenuItem>
                              ))}
                              <DropdownMenuItem onClick={() => setCertDialog(u.id)}>Add certificate</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                      {expanded === u.id && (
                        <tr><td colSpan={8} style={{ padding: 0, background: 'var(--card-sunken, var(--bg))' }}>
                          <div style={{ padding: '12px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Certificates</div>
                              {certs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>None on file.</div> : certs.map(c => (
                                <div key={c.id} style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>
                                  <Badge variant="gray">{c.type}</Badge> {c.expiry_date ? `exp. ${formatDate(c.expiry_date)}` : 'no expiry'}
                                </div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trace chain</div>
                              {traceLinks.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No hops recorded.</div> : traceLinks.map(t => (
                                <div key={t.id} style={{ fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>
                                  {t.from_party ?? '?'} → {t.to_party ?? '?'} {t.hop_type ? `(${t.hop_type})` : ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={!!certDialog} onOpenChange={v => { if (!v) setCertDialog(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add certificate</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Type</label>
                <Select value={certType} onValueChange={setCertType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CERT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label style={LABEL}>Expiry (optional)</label><Input type="date" value={certExpiry} onChange={e => setCertExpiry(e.target.value)} /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCertDialog(null)}>Cancel</Button>
            <Button onClick={addCertificate}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
