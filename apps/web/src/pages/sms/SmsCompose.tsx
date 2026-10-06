import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Badge } from '../../components/ui/badge.js';
import { DateTimePicker } from '../../components/ui/date-picker.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';

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

interface RecipientHit {
  id: string;
  name: string;
  phone: string;
  source: 'contact' | 'lead' | 'customer' | 'user';
}

interface Gateway {
  id: string;
  provider: string;
  label: string;
  sender_id: string | null;
}

interface CsvRow {
  phone: string;
  name?: string;
  [key: string]: string | undefined;
}

const SOURCE_LABEL: Record<string, string> = {
  contact: 'Contact',
  lead: 'Lead',
  customer: 'Customer',
  user: 'Staff',
};

/** RFC-4180 CSV row parser — handles quoted fields containing commas. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

// GSM 03.38 Basic Character Set regex check
const NON_GSM_REGEX = /[^\u000a\u000c\u000d\u0020-\u007e\u00a0\u00a1\u00a3\u00a4\u00a5\u00a7\u00bf\u00c4\u00c5\u00c6\u00c7\u00c9\u00d1\u00d6\u00d8\u00dc\u00df\u00e0\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ec\u00f1\u00f2\u00f6\u00f8\u00f9\u00fc]/;

function analyzeSms(text: string) {
  const isUnicode = NON_GSM_REGEX.test(text);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;

  if (text.length === 0) {
    return { isUnicode, segments: 0, charsLeft: singleLimit, maxPerSegment: singleLimit };
  }
  if (text.length <= singleLimit) {
    return { isUnicode, segments: 1, charsLeft: singleLimit - text.length, maxPerSegment: singleLimit };
  }
  const segments = Math.ceil(text.length / multiLimit);
  const charsLeft = segments * multiLimit - text.length;
  return { isUnicode, segments, charsLeft, maxPerSegment: multiLimit };
}

function cleanToGsm(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function SmsCompose() {
  usePageSEO('Send SMS & Campaign Composer', 'Compose Quick SMS, multi-recipient blasts, CSV variable campaigns with live preview and segment calculator.');
  const [mode, setMode] = useState<'numbers' | 'csv' | 'group'>('numbers');
  const [numbers, setNumbers] = useState<{ phone: string; name?: string }[]>([]);
  const [phoneInput, setPhoneInput] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [senderHeader, setSenderHeader] = useState<string>('');
  const [body, setBody] = useState('');
  const [includeOptOut, setIncludeOptOut] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // CSV Dynamic campaign state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/sms/groups').then(res => setGroups(res.data || [])).catch(() => {}),
      apiFetch('/v1/sms/templates').then(res => setTemplates(res.data || [])).catch(() => {}),
      apiFetch('/v1/sms/gateways').then(res => {
        const gw: Gateway[] = res.data || [];
        setGateways(gw);
        if (gw.length > 0) {
          setSelectedGatewayId(gw[0].id);
          setSenderHeader(gw[0].sender_id || '');
        }
      }).catch(() => {}),
    ]);
  }, []);

  function addManualNumber() {
    const raw = phoneInput.trim();
    if (!raw) return;
    const split = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const newItems: { phone: string }[] = [];
    for (const p of split) {
      if (!numbers.some(n => n.phone === p) && !newItems.some(n => n.phone === p)) {
        newItems.push({ phone: p });
      }
    }
    setNumbers(prev => [...prev, ...newItems]);
    setPhoneInput('');
  }

  async function searchRecipients(query: string): Promise<PickerItem[]> {
    if (query.trim().length < 2) return [];
    const res = await apiFetch(`/v1/sms/recipients/search?q=${encodeURIComponent(query.trim())}`);
    const hits: RecipientHit[] = res.data || [];
    return hits
      .filter(hit => !numbers.some(n => n.phone === hit.phone))
      .map(hit => ({
        id: hit.phone,
        label: hit.name,
        sublabel: `${hit.phone} · ${SOURCE_LABEL[hit.source]}`,
      }));
  }

  function addFromSearch(item: PickerItem | null) {
    if (!item) return;
    setNumbers(prev => (prev.some(n => n.phone === item.id) ? prev : [...prev, { phone: item.id, name: item.label }]));
  }

  function removeNumber(phone: string) {
    setNumbers(prev => prev.filter(n => n.phone !== phone));
  }

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setBody(t.body);
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      const text = String(evt.target?.result || '');
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) return;

      const headers = parseCsvRow(lines[0]);
      setCsvHeaders(headers);

      const rows: CsvRow[] = [];
      const phoneIndex = headers.findIndex(h => /phone|mobile|number|recipient/i.test(h));
      const nameIndex = headers.findIndex(h => /name|contact|customer/i.test(h));

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvRow(lines[i]);
        const rowObj: CsvRow = { phone: cols[phoneIndex >= 0 ? phoneIndex : 0] || '' };
        if (nameIndex >= 0) rowObj.name = cols[nameIndex];
        headers.forEach((h, idx) => {
          rowObj[h] = cols[idx];
        });
        if (rowObj.phone) rows.push(rowObj);
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
  }

  // Interpolated message content
  const effectiveBody = useMemo(() => {
    let text = body;
    if (includeOptOut && !text.toLowerCase().includes('stop')) {
      text = `${text.trim()} Reply STOP to unsubscribe.`;
    }
    return text;
  }, [body, includeOptOut]);

  // Preview interpolation for first recipient or sample
  const previewInterpolated = useMemo(() => {
    let sample = effectiveBody;
    const sampleRecipient =
      mode === 'csv' && csvRows[0]
        ? csvRows[0]
        : mode === 'numbers' && numbers[0]
        ? { name: numbers[0].name || 'Valued Customer', phone: numbers[0].phone }
        : { name: 'Amani Joseph', amount: '$45.00', ref: 'INV-88902', phone: '+255712345678' };

    for (const [k, v] of Object.entries(sampleRecipient)) {
      if (v) {
        sample = sample.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v);
        sample = sample.replace(new RegExp(`\\{${k}\\}`, 'gi'), v);
      }
    }
    return sample;
  }, [effectiveBody, mode, csvRows, numbers]);

  const analysis = analyzeSms(effectiveBody);
  const selectedGroup = groups.find(g => g.id === groupId);
  const recipientCount =
    mode === 'numbers' ? numbers.length : mode === 'csv' ? csvRows.length : (selectedGroup?.memberCount ?? 0);
  const canSend = recipientCount > 0 && effectiveBody.trim().length > 0 && !sending;

  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      if (mode === 'csv') {
        // Build per-recipient payloads then fire in parallel batches of 20
        // to avoid sequential blocking on large lists while not flooding the server.
        const BATCH = 20;
        let successes = 0;
        for (let i = 0; i < csvRows.length; i += BATCH) {
          const slice = csvRows.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            slice.map(row => {
              let rowBody = effectiveBody;
              for (const [k, v] of Object.entries(row)) {
                if (v) rowBody = rowBody.replace(new RegExp(`\\{\\{${k}\\}\\}|\\{${k}\\}`, 'gi'), v);
              }
              return apiFetch('/v1/sms/send', {
                method: 'POST',
                body: JSON.stringify({ to: [row.phone], body: rowBody, ...(selectedGatewayId ? { gatewayId: selectedGatewayId } : {}) }),
              });
            })
          );
          successes += results.filter(r => r.status === 'fulfilled').length;
        }
        const failed = csvRows.length - successes;
        setResult({
          success: successes > 0,
          message: failed
            ? `Dispatched ${successes} of ${csvRows.length} — ${failed} failed.`
            : `Successfully queued dynamic blast to ${successes} recipients.`,
        });
        setCsvRows([]);
        setCsvFileName('');
      } else {
        const payload: Record<string, unknown> = { body: effectiveBody.trim() };
        if (mode === 'numbers') payload.to = numbers.map(n => n.phone);
        else payload.groupId = groupId;
        if (selectedGatewayId) payload.gatewayId = selectedGatewayId;

        const res = await apiFetch('/v1/sms/send', { method: 'POST', body: JSON.stringify(payload) });
        if (recipientCount === 1) {
          setResult(
            res.data?.success
              ? { success: true, message: 'Message successfully dispatched.' }
              : { success: false, message: res.data?.error || 'Send failed.' }
          );
        } else {
          setResult({
            success: true,
            message: `Queued ${res.data?.queued ?? recipientCount} message(s) — carrier dispatching in progress.`,
          });
        }
        if (res.data?.success !== false) {
          setNumbers([]);
          setBody('');
          setTemplateId('');
        }
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Send failed.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Compose']}
        titlePlain="Compose &"
        titleEm="Dispatch"
        subtitle="Quick SMS, batch phonebook search, dynamic CSV variables, and telecom segment calculations."
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* Main Compose Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Dispatch Target Card */}
          <SectionCard title="1. Recipients & Target" collapsible={false}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { id: 'numbers', label: 'Quick Numbers / Search', icon: 'phone' as const },
                { id: 'csv', label: 'Dynamic CSV / Excel File', icon: 'fileText' as const },
                { id: 'group', label: 'Saved Contact Group', icon: 'users' as const },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id as any)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--r)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    border: `1px solid ${mode === tab.id ? 'var(--teal)' : 'var(--border)'}`,
                    background: mode === tab.id ? 'var(--teal-l)' : 'var(--white)',
                    color: mode === tab.id ? 'var(--teal)' : 'var(--ink2)',
                  }}
                >
                  <Icon name={tab.icon} size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === 'numbers' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Input
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addManualNumber()}
                    placeholder="Enter phone numbers separated by comma or press Enter (+2557..., +2547...)"
                  />
                  <Button variant="outline" onClick={addManualNumber}>
                    <Icon name="plus" size={14} /> Add
                  </Button>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <EntityPicker
                    value={null}
                    onChange={addFromSearch}
                    search={searchRecipients}
                    placeholder="Search across contacts, CRM leads, customers, staff…"
                  />
                </div>
                {numbers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto', padding: 4 }}>
                    {numbers.map(n => (
                      <span
                        key={n.phone}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12.5,
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: 'var(--badge-radius)',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--ink2)',
                        }}
                      >
                        {n.name || n.phone}
                        <button
                          type="button"
                          onClick={() => removeNumber(n.phone)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 2 }}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === 'csv' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '24px 20px',
                    textAlign: 'center',
                    background: 'var(--bg)',
                  }}
                >
                  <Icon name="fileText" size={24} color="var(--teal)" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {csvFileName || 'Upload CSV or TXT file with phone numbers & columns'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, marginBottom: 12 }}>
                    Columns like Name, Amount, Reference will automatically be available as {'{name}'}, {'{amount}'}, etc.
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    id="csv-file-upload"
                    style={{ display: 'none' }}
                    onChange={handleCsvUpload}
                  />
                  <label htmlFor="csv-file-upload">
                    <Button type="button" variant="outline" style={{ pointerEvents: 'none' }}>
                      <Icon name="upload" size={14} /> Choose File
                    </Button>
                  </label>
                </div>

                {csvRows.length > 0 && (
                  <div style={{ background: 'var(--teal-l)', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink)' }}>
                    <strong>{csvRows.length} recipients loaded.</strong> Dynamic variables detected:{' '}
                    {csvHeaders.map(h => (
                      <code key={h} style={{ background: 'var(--white)', padding: '2px 5px', borderRadius: 3, marginRight: 4 }}>
                        {`{${h}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === 'group' && (
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="Choose a contact group…" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.memberCount} members)
                    </SelectItem>
                  ))}
                  {groups.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--ink3)' }}>
                      No contact groups saved yet.
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </SectionCard>

          {/* Message Content & Templates */}
          <SectionCard title="2. Message & Formatting" collapsible={false}>
            {/* Header & Template Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Sender Header / Gateway Route
                </label>
                <Select value={selectedGatewayId} onValueChange={setSelectedGatewayId}>
                  <SelectTrigger><SelectValue placeholder="Default gateway…" /></SelectTrigger>
                  <SelectContent>
                    {gateways.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.sender_id ? `${g.sender_id} (${g.label})` : g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Load Template (Optional)
                </label>
                <Select value={templateId} onValueChange={pickTemplate}>
                  <SelectTrigger><SelectValue placeholder="Pick a saved template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Variable Snippet Shortcuts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontWeight: 600 }}>Insert tag:</span>
              {['{name}', '{phone}', '{company}', '{amount}', '{due_date}'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setBody(prev => `${prev} ${tag}`)}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 7px',
                    fontSize: 11.5,
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>

            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Type your message here or use variables like {name}, {amount}…"
              rows={5}
              maxLength={1600}
              style={{ fontSize: 13.5, lineHeight: 1.5 }}
            />

            {/* Segment & Encoding Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>
                  {effectiveBody.length} chars · {analysis.segments} segment{analysis.segments === 1 ? '' : 's'}
                </span>
                <Badge variant={analysis.isUnicode ? 'warning' : 'brand'}>
                  {analysis.isUnicode ? 'Unicode UTF-16 (70 chars/seg)' : 'GSM 7-bit (160 chars/seg)'}
                </Badge>
              </div>

              {analysis.isUnicode && (
                <button
                  type="button"
                  onClick={() => setBody(cleanToGsm(body))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--teal)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Convert to Standard GSM
                </button>
              )}
            </div>

            {/* Opt-out Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <input
                type="checkbox"
                id="append-optout"
                checked={includeOptOut}
                onChange={e => setIncludeOptOut(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: 'pointer' }}
              />
              <label htmlFor="append-optout" style={{ fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                Append mandatory opt-out clause (<strong>"Reply STOP to unsubscribe"</strong>)
              </label>
            </div>

            {/* Result Alerts */}
            {result && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  borderRadius: 'var(--r)',
                  fontSize: 13,
                  background: result.success ? 'var(--green-l)' : 'var(--red-l)',
                  color: result.success ? 'var(--green)' : 'var(--red)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name={result.success ? 'checkCircle' : 'alertTriangle'} size={15} />
                {result.message}
              </div>
            )}

            {/* Send / Dispatch Trigger */}
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <Button disabled={!canSend} onClick={handleSend} style={{ padding: '0 24px' }}>
                <Icon name="send" size={14} />
                {sending
                  ? 'Dispatching…'
                  : `Send to ${recipientCount || 0} recipient${recipientCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Dispatch Summary & Mobile Device Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Dispatch Summary */}
          <SectionCard title="Telemetry Summary" collapsible={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink3)' }}>Recipients</span>
                <strong>{recipientCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink3)' }}>Encoding</span>
                <span style={{ fontWeight: 600, color: analysis.isUnicode ? 'var(--gold)' : 'var(--green)' }}>
                  {analysis.isUnicode ? 'Unicode (UTF-16)' : 'GSM 7-Bit'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink3)' }}>Segments / msg</span>
                <strong>{analysis.segments}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink3)' }}>Total billable units</span>
                <strong style={{ color: 'var(--teal)', fontSize: 14 }}>
                  {analysis.segments * recipientCount}
                </strong>
              </div>
            </div>
          </SectionCard>

          {/* Smartphone Mockup Preview */}
          <SectionCard title="Live Mobile Preview" collapsible={false}>
            <div
              style={{
                width: '100%',
                background: '#1A1E24',
                borderRadius: 24,
                padding: '16px 12px',
                color: 'white',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Phone Speaker & Camera Notch */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 48, height: 4, background: '#333A44', borderRadius: 2 }} />
              </div>

              {/* Message Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid #2B323D', paddingBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                  {senderHeader || 'HUDUMIKA'}
                </div>
                <div style={{ fontSize: 10, color: '#8E9AA8' }}>Text Message · Carrier Verified</div>
              </div>

              {/* Chat Bubble Body */}
              <div style={{ minHeight: 120, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 9.5, color: '#6A7685', textAlign: 'center', marginBottom: 4 }}>
                  Today · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>

                <div
                  style={{
                    background: '#2B323D',
                    color: '#E8ECF2',
                    padding: '10px 12px',
                    borderRadius: '14px 14px 14px 3px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}
                >
                  {previewInterpolated || 'Type a message to see realistic carrier rendering…'}
                </div>
              </div>

              {/* Phone Bottom Home Bar */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                <div style={{ width: 64, height: 3, background: '#454E5B', borderRadius: 2 }} />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
