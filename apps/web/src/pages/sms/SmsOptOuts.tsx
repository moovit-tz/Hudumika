import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsFilterMenu, SmsListPagination, SmsListToolbar, useSmsList } from './SmsListControls.js';

interface OptOut {
  id: string;
  phone: string;
  reason: string;
  note: string | null;
  created_at: string;
}

interface Inbound {
  id: string;
  from_number: string;
  body: string;
  matched_keyword: string | null;
  created_at: string;
}

export function SmsOptOuts() {
  usePageSEO('SMS Opt-outs & DND Blacklist', 'Enforce carrier DND compliance, manage self-opted STOP requests, and block unwanted numbers.');
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [inbound, setInbound] = useState<Inbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/opt-outs').then(res => setOptOuts(res.data || [])),
      apiFetch('/v1/sms/inbound').then(res => setInbound(res.data || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function addOptOut() {
    if (!phone.trim()) {
      setError('Please enter a phone number to block.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await apiFetch('/v1/sms/opt-outs', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), note: note.trim() || undefined }),
      });
      setPhone('');
      setNote('');
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to blacklist number.');
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string, phoneNum: string) {
    if (
      !(await showConfirm(
        `Remove "${phoneNum}" from blacklist? The recipient will be eligible to receive SMS broadcasts again.`,
        { title: 'Remove from blacklist?', confirmLabel: 'Unblock' }
      ))
    ) {
      return;
    }
    setOptOuts(prev => prev.filter(o => o.id !== id));
    await apiFetch(`/v1/sms/opt-outs/${id}`, { method: 'DELETE' }).catch(err => {
      showAlert(err.message || 'Failed to remove opt-out.');
      load();
    });
  }

  const filteredOptOuts = useMemo(() => {
    return optOuts.filter(o => {
      const match =
        !search.trim() ||
        o.phone.toLowerCase().includes(search.toLowerCase()) ||
        (o.note && o.note.toLowerCase().includes(search.toLowerCase()));
      return match && (!reasonFilter || o.reason === reasonFilter);
    });
  }, [optOuts, search, reasonFilter]);
  const list = useSmsList(filteredOptOuts);

  function exportSelected() {
    downloadSmsCsv(`sms-opt-outs-${new Date().toISOString().slice(0, 10)}.csv`, ['Phone', 'Type', 'Reason / Note', 'Recorded At'],
      list.selectedItems.map(o => [o.phone, o.reason === 'stop_keyword' ? 'Inbound STOP Keyword' : 'Manual Block', o.note, o.created_at]));
  }

  const stopReplies = inbound.filter(
    i => i.matched_keyword?.toUpperCase() === 'STOP' || i.body.trim().toUpperCase() === 'STOP'
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Configuration', 'Opt-outs']}
        titlePlain="Opt-Outs &"
        titleEm="DND Blacklist"
        subtitle="Telecom regulatory compliance — numbers in this registry are strictly excluded from all outgoing SMS dispatches."
      />

      {/* Compliance Information Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <FeaturedIcon variant="warning" size="sm" shape="circle">
          <Icon name="shield" size={16} />
        </FeaturedIcon>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Carrier-Enforced Do-Not-Disturb (DND) Registry</div>
          <div style={{ color: 'var(--ink2)', lineHeight: 1.45 }}>
            Any incoming message containing the keyword <strong>STOP</strong> automatically opts out the recipient. The dispatch engine intercepts and suppresses outgoing messages to blacklisted numbers prior to telecom gateway charging.
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="error" size="md" shape="circle"><Icon name="shield" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Blacklisted Numbers</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : optOuts.length}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="warning" size="md" shape="circle"><Icon name="inbox" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Automated STOP Replies</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : stopReplies.length}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="checkCircle" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Compliance Status</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>100% Active Guard</div>
          </div>
        </div>
      </div>

      {/* Manual Blacklist Form */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard title="Manual Blacklist Entry" collapsible={false}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, maxWidth: 280 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Phone Number *
              </label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+255700000000"
              />
            </div>
            <div style={{ flex: 1, maxWidth: 360 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Reason / Note (Optional)
              </label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Customer requested email only"
              />
            </div>
            <Button disabled={adding} onClick={addOptOut}>
              <Icon name="plus" size={14} /> Add to Blacklist
            </Button>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        </SectionCard>
      </div>

      {/* Blacklist Table */}
      <div style={{ marginBottom: 14 }}>
        <SmsListToolbar search={search} onSearch={setSearch} placeholder="Search blacklist…" total={filteredOptOuts.length}
          page={list.page} pageSize={list.pageSize} selectedCount={list.selectedIds.size} onPageSizeChange={list.setPageSize}
          onExport={exportSelected} activeFilterCount={reasonFilter ? 1 : 0}
          filterContent={() => <SmsFilterMenu showClear={Boolean(reasonFilter)} onClear={() => setReasonFilter(null)}>
            <SingleSelectFilter label="Opt-out type" value={reasonFilter} onChange={setReasonFilter} options={[
              { value: 'stop_keyword', label: 'Inbound STOP keyword' }, { value: 'manual', label: 'Manual block' },
            ]} />
          </SmsFilterMenu>} />
      </div>

      <SectionCard title="Blacklisted Numbers" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : filteredOptOuts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No blacklisted numbers found.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 44, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false} onCheckedChange={list.toggleAll} aria-label="Select all filtered opt-outs" />
                  </th>
                  {['Phone Number', 'Opt-Out Type', 'Reason / Note', 'Recorded Date', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--ink3)',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.pageItems.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}><Checkbox checked={list.selectedIds.has(o.id)} onCheckedChange={() => list.toggle(o.id)} aria-label={`Select ${o.phone}`} /></td>
                    <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
                      {o.phone}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={o.reason === 'stop_keyword' ? 'warning' : 'gray'}>
                        {o.reason === 'stop_keyword' ? 'Inbound STOP Keyword' : 'Manual Block'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>
                      {o.note || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button size="sm" variant="ghost" onClick={() => remove(o.id, o.phone)}>
                        <Icon name="x" size={13} color="var(--red)" /> Unblock
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </SectionCard>
    </div>
  );
}
