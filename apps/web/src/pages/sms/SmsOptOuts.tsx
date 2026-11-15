import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsListPagination, useSmsList } from './SmsListControls.js';
import './Sms.css';

interface OptOut {
  id: string;
  phone: string;
  reason: string;
  source?: 'UNSUBSCRIBED' | 'BOUNCED' | 'ADDED BY HAND';
  applies_to?: string;
  is_platform_wide?: boolean;
  note: string | null;
  created_at: string;
}

const FILTER_PILLS = ['ALL', 'UNSUBSCRIBED', 'BOUNCED', 'ADDED BY HAND'] as const;

export function SmsOptOuts() {
  usePageSEO('Unsubscribes & Suppression List', 'Manage recipient unsubscribes, bounce suppressions, and tenant-wide DND blacklists.');

  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/opt-outs')
      .then((res) => {
        const rawList = res.data || [];
        const enriched: OptOut[] = rawList.map((item: any) => ({
          ...item,
          source: item.reason === 'stop_keyword' ? 'UNSUBSCRIBED' : item.reason === 'bounce' ? 'BOUNCED' : 'ADDED BY HAND',
          applies_to: item.applies_to || 'Every sender on Hudumika',
          is_platform_wide: item.is_platform_wide ?? true,
        }));
        setOptOuts(enriched);
      })
      .catch(() => setOptOuts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!address.trim()) {
      showAlert('Please enter an address or phone number to suppress.');
      return;
    }
    setAdding(true);
    try {
      await apiFetch('/v1/sms/opt-outs', {
        method: 'POST',
        body: JSON.stringify({ phone: address.trim(), note: note.trim() || undefined }),
      });
      setAddress('');
      setNote('');
      showAlert('Address added to suppression list.');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add address to suppression list.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(item: OptOut) {
    if (
      !(await showConfirm(
        `Remove "${item.phone}" from suppression list? This address will be eligible to receive messages again.`,
        { title: 'Lift Suppression?', confirmLabel: 'Lift Suppression' }
      ))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/opt-outs/${item.id}`, { method: 'DELETE' });
      showAlert('Suppression lifted.');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove suppression.');
    }
  }

  const filteredOptOuts = useMemo(() => {
    return optOuts.filter((o) => {
      const matchesFilter =
        activeFilter === 'ALL' ||
        (activeFilter === 'UNSUBSCRIBED' && o.source === 'UNSUBSCRIBED') ||
        (activeFilter === 'BOUNCED' && o.source === 'BOUNCED') ||
        (activeFilter === 'ADDED BY HAND' && o.source === 'ADDED BY HAND');

      const matchesSearch =
        !search.trim() ||
        o.phone.toLowerCase().includes(search.toLowerCase()) ||
        (o.note && o.note.toLowerCase().includes(search.toLowerCase()));

      return matchesFilter && matchesSearch;
    });
  }, [optOuts, activeFilter, search]);

  const list = useSmsList(filteredOptOuts);

  function exportCsv() {
    downloadSmsCsv(
      `unsubscribes-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Address', 'Source', 'Applies To', 'Platform Wide', 'Note', 'Date Added'],
      list.selectedItems.map((o) => [
        o.phone,
        o.source || '',
        o.applies_to || '',
        o.is_platform_wide ? 'Yes' : 'No',
        o.note || '',
        o.created_at,
      ])
    );
  }

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Unsubscribes']}
        titlePlain="Unsubscribes &"
        titleEm="Suppression"
        subtitle="Addresses this workspace may not message, why, and which sender each one applies to. Someone who left one sender profile can still be reached from another. Platform wide entries are listed so you can see what is blocking a send, but only a platform admin can lift one."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {list.selectedIds.size > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Icon name="download" size={13} /> Export {list.selectedIds.size}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <Icon name="refresh" size={13} /> Refresh
            </Button>
          </div>
        }
      />

      {/* Top Add To List Form matching Image 3 */}
      <SectionCard padded collapsible={false}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
              ADDRESS TO SUPPRESS
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="name@example.com or phone…"
              style={{ fontSize: 13 }} aria-label="ADDRESS TO SUPPRESS" />
          </div>

          <div style={{ flex: '2 1 300px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
              NOTE (OPTIONAL)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this address is on the list"
              style={{ fontSize: 13 }} aria-label="NOTE (OPTIONAL)" />
          </div>

          <Button disabled={adding || !address.trim()} onClick={handleAdd}>
            <Icon name="plus" size={14} /> Add to list
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="sms-filter-pills" style={{ marginTop: 20 }}>
          {FILTER_PILLS.map((p) => (
            <button
              key={p}
              type="button"
              className={`sms-filter-pill ${activeFilter === p ? 'active' : ''}`}
              onClick={() => setActiveFilter(p)}
              data-ui-native-button=""
            >
              {p}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Table matching Image 3 */}
      <SectionCard padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : filteredOptOuts.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>
            No suppressed addresses found matching your filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    ADDRESS
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    SOURCE
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    APPLIES TO
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    ADDED
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    SCOPE / ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.pageItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink)' }}>
                      {item.phone}
                      {item.note && (
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400, marginTop: 2 }}>
                          {item.note}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={item.source === 'UNSUBSCRIBED' ? 'warning' : item.source === 'BOUNCED' ? 'error' : 'gray'}>
                        {item.source}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>
                      {item.applies_to}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink3)' }}>
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {item.is_platform_wide && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            <Icon name="shield" size={12} color="var(--teal)" /> PLATFORM WIDE
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(item)}
                          title="Lift suppression"
                        >
                          <Icon name="trash2" size={13} color="var(--red)" />
                        </Button>
                      </div>
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
