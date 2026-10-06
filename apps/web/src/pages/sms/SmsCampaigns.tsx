import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DateTimePicker } from '../../components/ui/date-picker.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';
import { downloadSmsCsv, SmsFilterMenu, SmsListPagination, SmsListToolbar, useSmsList } from './SmsListControls.js';

interface Campaign {
  id: string;
  name: string;
  body: string;
  status: string;
  group_id: string | null;
  template_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  created_at: string;
  messageStats: Record<string, number>;
}

interface Group {
  id: string;
  name: string;
  memberCount: number;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'info'> = {
  draft: 'gray',
  scheduled: 'info',
  sending: 'warning',
  sent: 'success',
  failed: 'error',
  cancelled: 'gray',
};

export function SmsCampaigns() {
  usePageSEO('SMS Campaigns', 'Bulk marketing and transactional SMS broadcast campaigns, scheduling, and live delivery telemetry.');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'scheduled' | 'sending' | 'sent'>('all');
  const [form, setForm] = useState({ name: '', body: '', templateId: '', groupId: '', scheduledAt: '' });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/campaigns').then(res => setCampaigns(res.data || [])),
      apiFetch('/v1/sms/groups').then(res => setGroups(res.data || [])),
      apiFetch('/v1/sms/templates').then(res => setTemplates(res.data || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function pickTemplate(id: string) {
    const t = templates.find(x => x.id === id);
    setForm(p => ({ ...p, templateId: id, body: t ? t.body : p.body }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (!form.body.trim() && !form.templateId) {
      setError('Provide a message body or select a template.');
      return;
    }
    if (!form.groupId) {
      setError('Please choose a target group.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/sms/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          body: form.body.trim() || undefined,
          templateId: form.templateId || undefined,
          groupId: form.groupId,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        }),
      });
      setForm({ name: '', body: '', templateId: '', groupId: '', scheduledAt: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create campaign.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow(campaign: Campaign) {
    if (
      !(await showConfirm(
        `Send "${campaign.name}" to all members in the target group now?`,
        { title: 'Launch campaign?', confirmLabel: 'Send now' }
      ))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/campaigns/${campaign.id}/send`, { method: 'POST' });
      showAlert('Campaign dispatch initiated.');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send campaign.');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (
      !(await showConfirm(`"${name}" will be permanently removed.`, {
        title: 'Delete campaign?',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/campaigns/${id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete campaign.');
    }
  }

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      const matchSearch =
        !search.trim() ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.body.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      return true;
    });
  }, [campaigns, search, statusFilter]);
  const list = useSmsList(filteredCampaigns);

  function exportSelected() {
    downloadSmsCsv(`sms-campaigns-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Campaign', 'Message', 'Recipients', 'Status', 'Scheduled At', 'Sent At', 'Created At'],
      list.selectedItems.map(c => [c.name, c.body, c.total_recipients, c.status, c.scheduled_at, c.sent_at, c.created_at]));
  }

  // Overall campaign metrics
  const totalRecipients = campaigns.reduce((acc, c) => acc + (c.total_recipients || 0), 0);
  const activeCount = campaigns.filter(c => c.status === 'scheduled' || c.status === 'sending').length;
  const completedCount = campaigns.filter(c => c.status === 'sent').length;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Campaigns']}
        titlePlain="Bulk SMS"
        titleEm="Campaigns"
        subtitle="Schedule, launch, and inspect high-volume transactional and marketing SMS broadcasts."
        actions={
          <Button onClick={() => { setShowForm(true); setError(null); }}>
            <Icon name="plus" size={14} /> New Campaign
          </Button>
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="send" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Campaigns</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : campaigns.length}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="info" size="md" shape="circle"><Icon name="clock" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active / Scheduled</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : activeCount}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="checkCircle" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed Blasts</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : completedCount}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="users" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Recipients Target</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : totalRecipients.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* New Campaign Creation Drawer / Form */}
      {showForm && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Create New Campaign" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Campaign Title *</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. End of Month Promotion"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Target Group *</label>
                <Select value={form.groupId} onValueChange={v => setForm(p => ({ ...p, groupId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose contact group…" /></SelectTrigger>
                  <SelectContent>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.memberCount} members)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Start from Template (Optional)</label>
                <Select value={form.templateId} onValueChange={pickTemplate}>
                  <SelectTrigger><SelectValue placeholder="Select template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Schedule For (Optional)</label>
                <DateTimePicker
                  date={form.scheduledAt ? new Date(form.scheduledAt) : undefined}
                  onChange={d => setForm(p => ({ ...p, scheduledAt: d ? d.toISOString() : '' }))}
                  placeholder="Send immediately (Draft) or pick time…"
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Message Body *</label>
              <Textarea
                value={form.body}
                onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="Type the message to be broadcasted to all group members…"
                rows={4}
                maxLength={1600}
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                {form.body.length} characters · {Math.ceil(form.body.length / 160) || 1} segment(s) per recipient
              </div>
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled={saving} onClick={save}>
                {saving ? 'Creating…' : 'Create Campaign'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SmsListToolbar search={search} onSearch={setSearch} placeholder="Search campaigns…" total={filteredCampaigns.length}
          page={list.page} pageSize={list.pageSize} selectedCount={list.selectedIds.size} onPageSizeChange={list.setPageSize}
          onExport={exportSelected} activeFilterCount={statusFilter === 'all' ? 0 : 1}
          filterContent={() => <SmsFilterMenu showClear={statusFilter !== 'all'} onClear={() => setStatusFilter('all')}>
            <SingleSelectFilter label="Status" value={statusFilter === 'all' ? null : statusFilter}
              onChange={value => setStatusFilter((value ?? 'all') as typeof statusFilter)} options={[
                { value: 'draft', label: 'Draft' }, { value: 'scheduled', label: 'Scheduled' },
                { value: 'sending', label: 'Sending' }, { value: 'sent', label: 'Sent' },
              ]} />
          </SmsFilterMenu>} />
      </div>

      {/* Campaigns Table */}
      <SectionCard title="Campaign Dispatches" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : filteredCampaigns.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No campaigns found. Click <strong>New Campaign</strong> to create one.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 44, padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <Checkbox checked={list.allSelected ? true : list.someSelected ? 'indeterminate' : false} onCheckedChange={list.toggleAll} aria-label="Select all filtered campaigns" />
                  </th>
                  {['Campaign Name', 'Message Preview', 'Recipients', 'Delivery Progress', 'Status', 'When', ''].map(h => (
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
                {list.pageItems.map(c => {
                  const delivered = c.messageStats?.delivered ?? 0;
                  const sent = (c.messageStats?.sent ?? 0) + delivered;
                  const failed = (c.messageStats?.failed ?? 0) + (c.messageStats?.undelivered ?? 0);
                  const total = Math.max(c.total_recipients || sent || 1, 1);
                  const pct = Math.min(100, Math.round((sent / total) * 100));

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}><Checkbox checked={list.selectedIds.has(c.id)} onCheckedChange={() => list.toggle(c.id)} aria-label={`Select ${c.name}`} /></td>
                      <td style={{ padding: '12px 16px' }}>
                        <Link
                          to={`/sms/campaigns/${c.id}`}
                          style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: 12.5,
                          color: 'var(--ink2)',
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.body}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {c.total_recipients}
                      </td>
                      <td style={{ padding: '12px 16px', minWidth: 150 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: failed > 0 ? 'var(--gold)' : 'var(--green)' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={STATUS_VARIANT[c.status] || 'gray'}>{c.status}</Badge>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                        {c.scheduled_at
                          ? `Scheduled: ${new Date(c.scheduled_at).toLocaleDateString()}`
                          : new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {(c.status === 'draft' || c.status === 'scheduled') && (
                            <Button size="sm" variant="outline" onClick={() => handleSendNow(c)}>
                              <Icon name="send" size={12} /> Send Now
                            </Button>
                          )}
                          <Link to={`/sms/campaigns/${c.id}`}>
                            <Button size="sm" variant="ghost">
                              <Icon name="eye" size={13} />
                            </Button>
                          </Link>
                          {c.status !== 'sending' && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id, c.name)}>
                              <Icon name="trash" size={13} color="var(--red)" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <SmsListPagination page={list.page} totalPages={list.totalPages} onPage={list.setPage} />
      </SectionCard>
    </div>
  );
}
