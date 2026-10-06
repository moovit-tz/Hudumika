import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';

interface InboundMessage {
  id: string;
  from_number: string;
  to_number?: string;
  body: string;
  matched_keyword: string | null;
  created_at: string;
}

interface OutboundMessage {
  id: string;
  to_number: string;
  body: string;
  status: string;
  provider: string | null;
  source_app: string;
  contact_name: string | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

interface ThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  phone: string;
  contactName?: string | null;
  body: string;
  status?: string;
  matchedKeyword?: string | null;
  createdAt: string;
}

interface ConversationThread {
  phone: string;
  contactName?: string | null;
  messages: ThreadMessage[];
  lastMessage: ThreadMessage;
  hasInbound: boolean;
  hasStopRequest: boolean;
}

function countSegments(text: string): number {
  if (!text) return 0;
  const isUnicode = /[^\u0000-\u00ff]/.test(text);
  const limit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  if (text.length <= limit) return 1;
  return Math.ceil(text.length / multiLimit);
}

export function SmsInbox() {
  usePageSEO('SMS Inbox & Two-Way Conversations', 'Real-time two-way messaging, inbound customer responses, keyword triggers and customer replies.');
  const [inboundMsgs, setInboundMsgs] = useState<InboundMessage[]>([]);
  const [outboundMsgs, setOutboundMsgs] = useState<OutboundMessage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [optOutPhones, setOptOutPhones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'replies' | 'optouts'>('all');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inRes, outRes, tmplRes, optRes] = await Promise.all([
        apiFetch('/v1/sms/inbound'),
        apiFetch('/v1/sms/messages?limit=200'),
        apiFetch('/v1/sms/templates'),
        apiFetch('/v1/sms/opt-outs'),
      ]);
      setInboundMsgs(inRes.data || []);
      setOutboundMsgs(outRes.data || []);
      setTemplates(tmplRes.data || []);
      const opts = new Set<string>((optRes.data || []).map((o: any) => o.phone));
      setOptOutPhones(opts);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate into 2-way threads
  const threads = useMemo(() => {
    const map = new Map<string, ThreadMessage[]>();

    for (const inMsg of inboundMsgs) {
      const p = inMsg.from_number;
      const list = map.get(p) || [];
      list.push({
        id: inMsg.id,
        direction: 'inbound',
        phone: p,
        body: inMsg.body,
        matchedKeyword: inMsg.matched_keyword,
        createdAt: inMsg.created_at,
      });
      map.set(p, list);
    }

    for (const outMsg of outboundMsgs) {
      const p = outMsg.to_number;
      const list = map.get(p) || [];
      list.push({
        id: outMsg.id,
        direction: 'outbound',
        phone: p,
        contactName: outMsg.contact_name,
        body: outMsg.body,
        status: outMsg.status,
        createdAt: outMsg.created_at,
      });
      map.set(p, list);
    }

    const threadList: ConversationThread[] = [];
    for (const [phone, msgs] of map.entries()) {
      msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const last = msgs[msgs.length - 1];
      const hasInbound = msgs.some(m => m.direction === 'inbound');
      const hasStopRequest = msgs.some(m => m.matchedKeyword?.toUpperCase() === 'STOP' || m.body.trim().toUpperCase() === 'STOP');
      const contactName = msgs.find(m => m.contactName)?.contactName;

      threadList.push({
        phone,
        contactName,
        messages: msgs,
        lastMessage: last,
        hasInbound,
        hasStopRequest,
      });
    }

    // Sort threads by latest message desc
    threadList.sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
    return threadList;
  }, [inboundMsgs, outboundMsgs]);

  // Select first thread by default when loaded
  useEffect(() => {
    if (!selectedPhone && threads.length > 0) {
      setSelectedPhone(threads[0].phone);
    }
  }, [threads, selectedPhone]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [selectedPhone, inboundMsgs, outboundMsgs]);

  const filteredThreads = useMemo(() => {
    return threads.filter(t => {
      const matchesSearch =
        !search.trim() ||
        t.phone.toLowerCase().includes(search.toLowerCase()) ||
        (t.contactName && t.contactName.toLowerCase().includes(search.toLowerCase())) ||
        t.lastMessage.body.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;
      if (filterTab === 'replies') return t.hasInbound;
      if (filterTab === 'optouts') return t.hasStopRequest || optOutPhones.has(t.phone);
      return true;
    });
  }, [threads, search, filterTab, optOutPhones]);

  const activeThread = useMemo(() => {
    return threads.find(t => t.phone === selectedPhone) || null;
  }, [threads, selectedPhone]);

  async function handleSendReply() {
    if (!selectedPhone || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await apiFetch('/v1/sms/send', {
        method: 'POST',
        body: JSON.stringify({
          to: [selectedPhone],
          body: replyText.trim(),
        }),
      });
      if (res.data?.success !== false) {
        setReplyText('');
        setSelectedTemplateId('');
        // Reload messages
        loadData();
      } else {
        showAlert(res.data?.error || 'Send failed.');
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to send SMS reply.');
    } finally {
      setSendingReply(false);
    }
  }

  function handlePickTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find(item => item.id === id);
    if (t) {
      setReplyText(t.body);
    }
  }

  const isOptedOut = selectedPhone ? optOutPhones.has(selectedPhone) : false;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['SMS', 'Inbox']}
        titlePlain="Two-Way"
        titleEm="SMS Inbox"
        subtitle="Live customer conversation stream, incoming webhook triggers, and direct bidirectional SMS replies."
        actions={
          <Button variant="outline" onClick={loadData}>
            <Icon name="refresh" size={14} /> Refresh
          </Button>
        }
      />

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '360px 1fr',
          gap: 0,
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          overflow: 'hidden',
          minHeight: 0,
          marginBottom: 20,
        }}
      >
        {/* Left Side: Threads List */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            overflow: 'hidden',
          }}
        >
          {/* Search and Tabs */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{ marginBottom: 8, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'replies', label: 'Replies' },
                { id: 'optouts', label: 'Opt-outs' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: 'var(--badge-radius)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${filterTab === tab.id ? 'var(--teal)' : 'var(--border)'}`,
                    background: filterTab === tab.id ? 'var(--teal-l)' : 'var(--white)',
                    color: filterTab === tab.id ? 'var(--teal)' : 'var(--ink2)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thread items */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: 24 }}><SectionLoading /></div>
            ) : filteredThreads.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No conversation threads match this filter.
              </div>
            ) : (
              filteredThreads.map(thread => {
                const isSelected = selectedPhone === thread.phone;
                const isStop = thread.hasStopRequest || optOutPhones.has(thread.phone);
                return (
                  <div
                    key={thread.phone}
                    onClick={() => setSelectedPhone(thread.phone)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--teal-l)' : 'var(--white)',
                      borderLeft: isSelected ? '3px solid var(--teal)' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                        {thread.contactName || thread.phone}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        {new Date(thread.lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    {thread.contactName && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 4 }}>
                        {thread.phone}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {thread.lastMessage.direction === 'inbound' ? (
                        <Badge variant="brand">Inbound</Badge>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>You:</span>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--ink2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {thread.lastMessage.body}
                      </div>
                      {isStop && <Badge variant="warning">STOP</Badge>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Chat Stream & Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--white)', overflow: 'hidden' }}>
          {activeThread ? (
            <>
              {/* Active Header */}
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FeaturedIcon variant={isOptedOut ? 'warning' : 'brand'} size="sm" shape="circle">
                    <Icon name={isOptedOut ? 'shield' : 'messageSquare'} size={15} />
                  </FeaturedIcon>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      {activeThread.contactName ? `${activeThread.contactName} (${activeThread.phone})` : activeThread.phone}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {activeThread.messages.length} message(s) in this thread
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isOptedOut ? (
                    <Badge variant="warning">Blacklisted / Opted-Out</Badge>
                  ) : (
                    <Badge variant="success">Active Recipient</Badge>
                  )}
                </div>
              </div>

              {/* Opt-out Warning banner if applicable */}
              {isOptedOut && (
                <div
                  style={{
                    padding: '8px 16px',
                    background: 'var(--gold-l)',
                    borderBottom: '1px solid var(--gold)',
                    fontSize: 12,
                    color: 'var(--ink)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="alertTriangle" size={13} color="var(--gold)" />
                  This recipient has opted out or replied STOP. Outbound messages will be blocked by gateway filters.
                </div>
              )}

              {/* Message Bubbles History */}
              <div
                ref={chatScrollRef}
                style={{
                  flex: 1,
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  background: 'var(--bg)',
                  minHeight: 0,
                }}
              >
                {activeThread.messages.map(msg => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isInbound ? 'flex-start' : 'flex-end',
                        maxWidth: '80%',
                        alignSelf: isInbound ? 'flex-start' : 'flex-end',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: isInbound ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                          background: isInbound ? 'var(--white)' : 'var(--teal)',
                          color: isInbound ? 'var(--ink)' : 'white',
                          border: isInbound ? '1px solid var(--border)' : 'none',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          fontSize: 13,
                          lineHeight: 1.45,
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.body}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 4,
                          fontSize: 11,
                          color: 'var(--ink3)',
                        }}
                      >
                        {isInbound && msg.matchedKeyword && (
                          <Badge variant="warning">Keyword: {msg.matchedKeyword}</Badge>
                        )}
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {!isInbound && (
                          <span style={{ textTransform: 'capitalize' }}>· {msg.status || 'sent'}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Reply Box */}
              <div
                style={{
                  padding: '14px 18px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, maxWidth: 280 }}>
                    <Select value={selectedTemplateId} onValueChange={handlePickTemplate}>
                      <SelectTrigger><SelectValue placeholder="Insert template / canned response…" /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    {replyText.length} chars · {countSegments(replyText)} segment(s)
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <Textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={`Reply to ${activeThread.contactName || activeThread.phone}…`}
                    rows={2}
                    maxLength={1600}
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <Button
                    disabled={!replyText.trim() || sendingReply}
                    onClick={handleSendReply}
                    style={{ height: 42, padding: '0 20px' }}
                  >
                    <Icon name="send" size={14} /> {sendingReply ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', padding: 40 }}>
              Select a conversation thread on the left to view messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
