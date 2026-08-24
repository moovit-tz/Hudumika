import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';

interface Group { id: string; name: string; memberCount: number; }
interface Template { id: string; name: string; body: string; }
interface RecipientHit { id: string; name: string; phone: string; source: 'contact' | 'lead' | 'customer' | 'user'; }

const SOURCE_LABEL: Record<string, string> = { contact: 'Contact', lead: 'Lead', customer: 'Customer', user: 'Staff' };

function countSegments(body: string): number {
  if (body.length <= 160) return body.length === 0 ? 0 : 1;
  return Math.ceil(body.length / 153);
}

export function SmsCompose() {
  usePageSEO('Send SMS', 'Send an SMS to one or more numbers, a saved group, or search contacts, leads, customers and staff.');
  const [mode, setMode] = useState<'numbers' | 'group'>('numbers');
  const [numbers, setNumbers] = useState<{ phone: string; name?: string }[]>([]);
  const [phoneInput, setPhoneInput] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<RecipientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    apiFetch('/v1/sms/groups').then(res => setGroups(res.data || [])).catch(() => {});
    apiFetch('/v1/sms/templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/sms/recipients/search?q=${encodeURIComponent(search.trim())}`)
        .then(res => { if (alive) setSearchResults((res.data || []).filter((r: RecipientHit) => !numbers.some(n => n.phone === r.phone))); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function addManualNumber() {
    const phone = phoneInput.trim();
    if (!phone) return;
    if (!numbers.some(n => n.phone === phone)) setNumbers(prev => [...prev, { phone }]);
    setPhoneInput('');
  }
  function addFromSearch(hit: RecipientHit) {
    setNumbers(prev => prev.some(n => n.phone === hit.phone) ? prev : [...prev, { phone: hit.phone, name: hit.name }]);
    setSearch(''); setSearchResults([]);
  }
  function removeNumber(phone: string) {
    setNumbers(prev => prev.filter(n => n.phone !== phone));
  }

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setBody(t.body);
  }

  const selectedGroup = groups.find(g => g.id === groupId);
  const recipientCount = mode === 'numbers' ? numbers.length : (selectedGroup?.memberCount ?? 0);
  const canSend = recipientCount > 0 && body.trim().length > 0 && !sending;

  async function handleSend() {
    setSending(true); setResult(null);
    try {
      const payload: Record<string, unknown> = { body: body.trim() };
      if (mode === 'numbers') payload.to = numbers.map(n => n.phone);
      else payload.groupId = groupId;
      const res = await apiFetch('/v1/sms/send', { method: 'POST', body: JSON.stringify(payload) });
      if (recipientCount === 1) {
        setResult(res.data?.success ? { success: true, message: 'Sent.' } : { success: false, message: res.data?.error || 'Send failed.' });
      } else {
        setResult({ success: true, message: `Queued ${res.data?.queued ?? recipientCount} message(s) — they'll go out shortly.` });
      }
      if (res.data?.success !== false) { setNumbers([]); setBody(''); setTemplateId(''); }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Send failed.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader crumbs={['SMS', 'Compose']} titlePlain="Send" titleEm="message" subtitle="One number, several, or a whole saved group." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <SectionCard title="Recipients" collapsible={false}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['numbers', 'group'] as const).map(m => (
              <button
                key={m} type="button" onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${mode === m ? 'var(--teal)' : 'var(--border)'}`,
                  background: mode === m ? 'var(--teal-l)' : 'var(--white)', color: mode === m ? 'var(--teal)' : 'var(--ink2)',
                }}
              >
                {m === 'numbers' ? 'Numbers / search' : 'Saved group'}
              </button>
            ))}
          </div>

          {mode === 'numbers' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <Input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManualNumber()} placeholder="Type a phone number and press Enter" />
                <Button variant="outline" onClick={addManualNumber}><Icon name="plus" size={14} /></Button>
              </div>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Or search contacts, leads, customers, staff…" />
                {(searchResults.length > 0 || searching) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--elev)', zIndex: 20, maxHeight: 240, overflowY: 'auto' }}>
                    {searching && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--ink3)' }}>Searching…</div>}
                    {!searching && searchResults.map(hit => (
                      <button key={`${hit.source}-${hit.id}`} type="button" onClick={() => addFromSearch(hit)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{hit.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{hit.phone}</div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{SOURCE_LABEL[hit.source]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {numbers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {numbers.map(n => (
                    <span key={n.phone} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '5px 6px 5px 10px', borderRadius: 20, background: 'var(--bg)', color: 'var(--ink2)' }}>
                      {n.name || n.phone}
                      <button type="button" onClick={() => removeNumber(n.phone)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 2 }}>
                        <Icon name="x" size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'group' && (
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="Choose a group…" /></SelectTrigger>
              <SelectContent>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>)}
                {groups.length === 0 && <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--ink3)' }}>No groups yet.</div>}
              </SelectContent>
            </Select>
          )}
        </SectionCard>

        <SectionCard title="Summary" collapsible={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ink3)' }}>Recipients</span><strong>{recipientCount}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ink3)' }}>Segments each</span><strong>{countSegments(body)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ink3)' }}>Total segments</span><strong>{countSegments(body) * recipientCount}</strong></div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="Message" collapsible={false}>
          {templates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Select value={templateId} onValueChange={pickTemplate}>
                <SelectTrigger><SelectValue placeholder="Start from a template (optional)…" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Type your message…" rows={5} maxLength={1600} />
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 6 }}>{body.length} characters · {countSegments(body)} segment{countSegments(body) === 1 ? '' : 's'}</div>

          {result && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: result.success ? 'var(--green-l)' : 'var(--red-l)', color: result.success ? 'var(--green)' : 'var(--red)' }}>
              {result.message}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button disabled={!canSend} onClick={handleSend}>
              {sending ? 'Sending…' : `Send to ${recipientCount || 0} recipient${recipientCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
