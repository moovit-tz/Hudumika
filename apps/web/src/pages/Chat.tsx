import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';

// ─── Types (match apps/api/src/routes/chat.routes.ts) ─────────────────────────

interface ApiChannel {
  id: string;
  type: 'channel' | 'dm' | 'group';
  name: string;
  description: string | null;
  member_ids: string[];
  other_user_id: string | null;
  other_user_role: string | null;
  unread: number;
  last_message: string | null;
  last_message_at: string | null;
}

interface ApiReaction { emoji: string; count: number; mine: boolean; }
interface ApiMessage {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  reactions: ApiReaction[];
}

interface StaffOpt { id: string; name: string; role: string; }

const PALETTE = ['#e8461a', '#0569e3', '#059669', '#9a6700', '#8250df', '#cf222e', '#0a7e6a'];
function abg(name: string) { let h = 0; for (let i = 0; i < (name ?? '').length; i++) h = (name ?? '').charCodeAt(i) + ((h << 5) - h); return PALETTE[Math.abs(h) % PALETTE.length]; }
function ini(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
function ft(d: Date) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
function fd(d: Date) {
  const n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function sd(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function grp(a: ApiMessage, b: ApiMessage) { return a.author_id === b.author_id && (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60000; }

function Av({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: abg(name), flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * .36),
      fontWeight: 700, color: '#fff', userSelect: 'none',
    }}>
      {ini(name)}
    </div>
  );
}

function CRow({ ch, active, onClick }: { ch: ApiChannel; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 'var(--ds-btn-py-sm) 10px',
      border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', textAlign: 'left',
      background: active ? 'rgba(232,70,26,0.10)' : 'transparent',
      color: active ? 'var(--teal)' : ch.unread > 0 ? 'var(--ink)' : 'var(--ink2)',
      fontWeight: ch.unread > 0 ? 600 : 400, fontFamily: 'var(--font)', fontSize: 13,
      transition: 'background 0.1s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
      {ch.type === 'dm' ? (
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: abg(ch.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{ini(ch.name)}</div>
      ) : ch.type === 'group' ? (
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="users" size={11} color="var(--teal)" />
        </div>
      ) : (
        <span style={{ color: 'var(--ink3)', fontSize: 15, width: 16, textAlign: 'center', flexShrink: 0, fontWeight: 800, lineHeight: 1 }}>#</span>
      )}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
      {ch.unread > 0 && <span style={{ background: 'var(--teal)', color: '#fff', borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0 }}>{ch.unread > 99 ? '99+' : ch.unread}</span>}
    </button>
  );
}

const EMOJIS = ['👍', '❤️', '😄', '🎉', '🚀', '👀', '✅', '😂', '🙌', '💯', '🔥', '👋', '🤝', '📦', '✈️', '⚓'];
const POLL_MS = 6000;

export const Chat: React.FC = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [openSecs, setOpenSecs] = useState({ ch: true, dm: true, grp: true });
  const [creating, setCreating] = useState<'channel' | 'dm' | 'group' | null>(null);
  const [newName, setNewName] = useState('');
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async (selectFirst = false) => {
    try {
      const res = await apiFetch('/v1/chat/channels');
      const list: ApiChannel[] = res.data ?? [];
      setChannels(list);
      if (selectFirst && !activeId && list.length > 0) setActiveId(list[0].id);
    } catch { /* keep previous list on a transient poll failure */ } finally { setLoadingChannels(false); }
  }, [activeId]);

  useEffect(() => { loadChannels(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => loadChannels(false), POLL_MS);
    return () => clearInterval(t);
  }, [loadChannels]);

  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE' && u.id !== user?.id).map(u => ({ id: u.id, name: u.name, role: (u.role || '').replace(/_/g, ' ') })));
    }).catch(() => {});
  }, [user?.id]);

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const res = await apiFetch(`/v1/chat/channels/${channelId}/messages`);
      setMessages(res.data ?? []);
    } catch { setMessages([]); }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingMessages(true);
    loadMessages(activeId).finally(() => setLoadingMessages(false));
    apiFetch(`/v1/chat/channels/${activeId}/read`, { method: 'PATCH' }).catch(() => {});
    setChannels(p => p.map(c => c.id === activeId ? { ...c, unread: 0 } : c));
    const t = setInterval(() => loadMessages(activeId), POLL_MS);
    return () => clearInterval(t);
  }, [activeId, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeId]);

  useEffect(() => {
    function h(e: MouseEvent) { if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const activeCh = channels.find(c => c.id === activeId) ?? null;

  async function send() {
    const txt = input.trim();
    if (!txt || !activeId || sending) return;
    setSending(true);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const msg: ApiMessage = await apiFetch(`/v1/chat/channels/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ content: txt }) });
      setMessages(p => [...p, msg]);
      setChannels(p => p.map(c => c.id === activeId ? { ...c, last_message: txt, last_message_at: msg.created_at } : c));
      inputRef.current?.focus();
    } catch (err: any) {
      showAlert(err.message || 'Failed to send message');
      setInput(txt);
    } finally {
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }

  async function react(msgId: string, emoji: string) {
    // Optimistic toggle, reconciled on the next poll.
    setMessages(p => p.map(m => {
      if (m.id !== msgId) return m;
      const rxns = [...m.reactions];
      const ex = rxns.find(r => r.emoji === emoji);
      if (ex) {
        const nextCount = ex.count + (ex.mine ? -1 : 1);
        const nextMine = !ex.mine;
        return { ...m, reactions: nextCount <= 0 ? rxns.filter(r => r.emoji !== emoji) : rxns.map(r => r.emoji === emoji ? { ...r, count: nextCount, mine: nextMine } : r) };
      }
      return { ...m, reactions: [...rxns, { emoji, count: 1, mine: true }] };
    }));
    try { await apiFetch(`/v1/chat/messages/${msgId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }); }
    catch { loadMessages(activeId!); }
  }

  async function createChannelOrGroup() {
    if (creating !== 'channel' && creating !== 'group') return;
    const name = creating === 'channel' ? newName.trim().toLowerCase().replace(/\s+/g, '-') : newName.trim();
    if (!name) return;
    if (creating === 'group' && newMemberIds.length === 0) return;
    try {
      const channel: ApiChannel = await apiFetch('/v1/chat/channels', {
        method: 'POST',
        body: JSON.stringify({ type: creating, name, member_ids: newMemberIds }),
      });
      await loadChannels(false);
      setActiveId(channel.id);
      setCreating(null); setNewName(''); setNewMemberIds([]);
    } catch (err: any) { showAlert(err.message || 'Failed to create'); }
  }

  async function startDm(otherId: string) {
    try {
      const channel: ApiChannel = await apiFetch('/v1/chat/channels', { method: 'POST', body: JSON.stringify({ type: 'dm', member_ids: [otherId] }) });
      await loadChannels(false);
      setActiveId(channel.id);
      setCreating(null);
    } catch (err: any) { showAlert(err.message || 'Failed to start conversation'); }
  }

  function SecHdr({ label, sk, count }: { label: string; sk: keyof typeof openSecs; count: number }) {
    return (
      <button type="button" onClick={() => setOpenSecs(p => ({ ...p, [sk]: !p[sk] }))} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py) 10px 3px', color: 'var(--ink3)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
        <Icon name={openSecs[sk] ? 'chevronDown' : 'chevronRight'} size={10} />
        {label}
        {count > 0 && <span style={{ marginLeft: 'auto', background: 'var(--teal)', color: '#fff', borderRadius: 9, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>{count}</span>}
      </button>
    );
  }

  const q = search.toLowerCase();
  const fil = (arr: ApiChannel[]) => q ? arr.filter(c => c.name.toLowerCase().includes(q)) : arr;
  const chList = fil(channels.filter(c => c.type === 'channel'));
  const dmList = fil(channels.filter(c => c.type === 'dm'));
  const grpList = fil(channels.filter(c => c.type === 'group'));
  const totalUnread = channels.reduce((s, c) => s + c.unread, 0);
  const memberCount = activeCh?.type === 'group' ? activeCh.member_ids.length : activeCh?.type === 'channel' ? activeCh.member_ids.length : 2;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--white)', fontFamily: 'var(--font)' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ width: 244, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--white)', overflow: 'hidden' }}>

        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chatBubble" size={15} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Team Chat</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 500 }}>{channels.length} conversation{channels.length === 1 ? '' : 's'}</div>
          </div>
          <button type="button" onClick={() => setCreating('channel')} title="New channel" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 'var(--r-sm)', color: 'var(--ink3)', display: 'flex' }}>
            <Icon name="edit" size={14} />
          </button>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            { label: 'Channels', value: chList.length + grpList.length, color: 'var(--ink)' },
            { label: 'Direct',   value: dmList.length,                  color: 'var(--ink)' },
            { label: 'Unread',   value: totalUnread,                    color: totalUnread > 0 ? 'var(--teal)' : 'var(--ink3)' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ flex: 1, padding: '7px 4px', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink3)', marginTop: 2, letterSpacing: '0.03em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '10px 10px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <Icon name="search" size={13} color="var(--ink3)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ border: 'none', background: 'none', outline: 'none', flex: 1, fontSize: 12.5, color: 'var(--ink)', fontFamily: 'var(--font)' }} />
            {search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink3)', display: 'flex' }}><Icon name="close" size={12} /></button>}
          </div>
        </div>

        {/* Lists */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 8px' }}>
          {loadingChannels && <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>Loading…</div>}

          <SecHdr label="Channels" sk="ch" count={chList.reduce((s, c) => s + c.unread, 0)} />
          {openSecs.ch && chList.map(ch => <CRow key={ch.id} ch={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} />)}
          <button type="button" onClick={() => setCreating('channel')} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: 'var(--ds-btn-py-xs) 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12, fontFamily: 'var(--font)', borderRadius: 'var(--r)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
            <Icon name="plus" size={12} /> Add a channel
          </button>

          <SecHdr label="Direct Messages" sk="dm" count={dmList.reduce((s, c) => s + c.unread, 0)} />
          {openSecs.dm && dmList.map(ch => <CRow key={ch.id} ch={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} />)}
          <button type="button" onClick={() => setCreating('dm')} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: 'var(--ds-btn-py-xs) 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12, fontFamily: 'var(--font)', borderRadius: 'var(--r)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
            <Icon name="plus" size={12} /> New direct message
          </button>

          <SecHdr label="Groups" sk="grp" count={grpList.reduce((s, c) => s + c.unread, 0)} />
          {openSecs.grp && grpList.map(ch => <CRow key={ch.id} ch={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} />)}
          <button type="button" onClick={() => setCreating('group')} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: 'var(--ds-btn-py-xs) 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 12, fontFamily: 'var(--font)', borderRadius: 'var(--r)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
            <Icon name="plus" size={12} /> Create a group
          </button>
        </div>

        {/* Me */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Av name={user?.name || '?'} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)', fontWeight: 500 }}>{(user?.role || '').replace(/_/g, ' ')}</div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {!activeCh ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--ink3)' }}>
            <Icon name="chatBubble" size={40} strokeWidth={1.25} />
            <div style={{ fontSize: 14 }}>{loadingChannels ? 'Loading conversations…' : 'Select a conversation to start chatting'}</div>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div style={{ padding: '0 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, height: 54, flexShrink: 0, background: 'var(--white)' }}>
              {activeCh.type === 'dm' ? <Av name={activeCh.name} size={30} />
                : activeCh.type === 'group' ? (
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="users" size={15} color="var(--teal)" />
                  </div>
                ) : <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink3)', lineHeight: 1 }}>#</span>}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {activeCh.name}
                  {(activeCh.type === 'channel' || activeCh.type === 'group') && (
                    <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="users" size={11} />{memberCount} members
                    </span>
                  )}
                  {activeCh.type === 'dm' && activeCh.other_user_role && (
                    <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>{activeCh.other_user_role}</span>
                  )}
                </div>
                {activeCh.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeCh.description}</div>}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 4px', display: 'flex', flexDirection: 'column' }}>

              <div style={{ padding: '20px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                {activeCh.type === 'channel' ? (
                  <>
                    <div style={{ width: 48, height: 48, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)' }}>#</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>#{activeCh.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{activeCh.description || 'This is the beginning of this channel.'}</div>
                  </>
                ) : activeCh.type === 'dm' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <Av name={activeCh.name} size={52} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{activeCh.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{activeCh.other_user_role || 'Direct message'}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="users" size={24} color="var(--teal)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{activeCh.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{memberCount} members · Group</div>
                    </div>
                  </div>
                )}
              </div>

              {loadingMessages && <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink3)', fontSize: 12.5 }}>Loading messages…</div>}
              {!loadingMessages && messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink3)', fontSize: 12.5 }}>No messages yet. Say hello!</div>
              )}

              {messages.map((msg, idx) => {
                const prevMsg = messages[idx - 1];
                const ts = new Date(msg.created_at);
                const prevTs = prevMsg ? new Date(prevMsg.created_at) : null;
                const showDay = !prevMsg || !prevTs || !sd(prevTs, ts);
                const isGrpMsg = !!prevMsg && grp(prevMsg, msg) && !showDay;
                const isMe = msg.author_id === user?.id;
                return (
                  <React.Fragment key={msg.id}>
                    {showDay && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 8px' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fd(ts)}</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, padding: isGrpMsg ? '1px 6px' : '7px 6px 1px', alignItems: 'flex-start', borderRadius: 9 }}>
                      <div style={{ width: 36, flexShrink: 0, paddingTop: isGrpMsg ? 0 : 2 }}>
                        {!isGrpMsg ? <Av name={msg.author_name} size={34} /> : (
                          <span style={{ fontSize: 10, color: 'var(--ink3)', display: 'block', textAlign: 'right', paddingTop: 3, paddingRight: 2 }}>
                            {ft(ts).replace(/:\d\d /, ' ')}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {!isGrpMsg && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: isMe ? 'var(--teal)' : 'var(--ink)' }}>{msg.author_name}</span>
                            <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{ft(ts)}</span>
                            {isMe && <span style={{ fontSize: 10, color: 'var(--teal)', background: 'var(--teal-l)', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>You</span>}
                          </div>
                        )}
                        <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, wordBreak: 'break-word' }}>{msg.content}</div>
                        {msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                            {msg.reactions.map(r => (
                              <button type="button" key={r.emoji} onClick={() => react(msg.id, r.emoji)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', border: `1px solid ${r.mine ? 'var(--teal-m)' : 'var(--border)'}`, background: r.mine ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)', transition: 'all 0.1s', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>
                                {r.emoji}<span style={{ fontSize: 11, fontWeight: 600, color: r.mine ? 'var(--teal)' : 'var(--ink2)' }}>{r.count}</span>
                              </button>
                            ))}
                            <button type="button" onClick={() => react(msg.id, '👍')} style={{ padding: 'var(--ds-btn-py-xs) 8px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}}>+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div style={{ padding: '10px 20px 14px', borderTop: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
              <div style={{ border: '1.5px solid var(--border)', borderRadius: 9, overflow: 'visible', background: 'var(--white)', transition: 'border-color 0.15s' }}>
                <textarea
                  ref={inputRef} value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'; }}
                  onKeyDown={onKey}
                  placeholder={`Message ${activeCh.type === 'channel' ? '#' : ''}${activeCh.name}…`}
                  rows={1}
                  style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '12px 14px 8px', fontSize: 13.5, color: 'var(--ink)', background: 'transparent', fontFamily: 'var(--font)', lineHeight: 1.55, minHeight: 44, boxSizing: 'border-box', display: 'block' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 1, borderTop: '1px solid var(--border)' }}>
                  <div ref={emojiRef} style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setShowEmoji(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--ds-btn-py-sm) 6px', borderRadius: 'var(--r)', color: showEmoji ? 'var(--teal)' : 'var(--ink3)', display: 'flex', alignItems: 'center', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
                      <Icon name="smile" size={15} />
                    </button>
                    {showEmoji && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 100 }}>
                        {EMOJIS.map(em => (
                          <button type="button" key={em} onClick={() => { setInput(p => p + em); setShowEmoji(false); inputRef.current?.focus(); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '5px', borderRadius: 'var(--r)', lineHeight: 1 }}>
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }} />

                  {input.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--ink3)', marginRight: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <kbd style={{ fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> send
                      <kbd style={{ fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', marginLeft: 6 }}>⇧↵</kbd> newline
                    </span>
                  )}

                  <button type="button" onClick={send} disabled={!input.trim() || sending} style={{ background: input.trim() ? 'var(--teal)' : 'var(--border)', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-sm) 14px', cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, color: input.trim() ? '#fff' : 'var(--ink3)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box'}}>
                    <Icon name="send" size={13} color={input.trim() ? '#fff' : 'var(--ink3)'} />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Create channel/group — inline slide-in drawer, not a popup ── */}
      {(creating === 'channel' || creating === 'group') && (
        <>
          <div onClick={() => { setCreating(null); setNewName(''); setNewMemberIds([]); }} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'transparent' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, maxWidth: '92vw', zIndex: 1401, background: 'var(--white)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(15,23,42,0.12)', display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{creating === 'channel' ? 'Create a channel' : 'Create a group'}</div>
              <button type="button" onClick={() => { setCreating(null); setNewName(''); setNewMemberIds([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>{creating === 'channel' ? 'Channel name' : 'Group name'}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 9 }}>
                {creating === 'channel' && <span style={{ color: 'var(--ink3)', fontWeight: 700, fontSize: 15 }}>#</span>}
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder={creating === 'channel' ? 'e.g. project-alpha' : 'e.g. Ops Team'}
                  style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--font)', background: 'transparent' }} />
              </div>
            </div>
            {creating === 'group' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Members</label>
                <div style={{ border: '1px solid var(--border)', borderRadius: 9, maxHeight: 260, overflowY: 'auto' }}>
                  {staff.map(s => {
                    const on = newMemberIds.includes(s.id);
                    return (
                      <button type="button" key={s.id} onClick={() => setNewMemberIds(p => on ? p.filter(id => id !== s.id) : [...p, s.id])}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 'var(--ds-btn-py) 12px', border: 'none', borderBottom: '1px solid var(--bg)', background: on ? 'var(--teal-l)' : 'transparent', cursor: 'pointer', textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
                        <Av name={s.name} size={26} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: on ? 'var(--teal)' : 'var(--ink)' }}>{s.name}</span>
                        {on && <Icon name="check" size={14} color="var(--teal)" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setCreating(null); setNewName(''); setNewMemberIds([]); }} style={{ padding: 'var(--ds-btn-py) 16px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink2)', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>Cancel</button>
              <button type="button" onClick={createChannelOrGroup} disabled={!newName.trim() || (creating === 'group' && newMemberIds.length === 0)}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: newName.trim() ? 'var(--teal)' : 'var(--border)', color: newName.trim() ? '#fff' : 'var(--ink3)', cursor: newName.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
                {creating === 'channel' ? 'Create Channel' : 'Create Group'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── New DM — inline slide-in drawer ── */}
      {creating === 'dm' && (
        <>
          <div onClick={() => setCreating(null)} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'transparent' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, maxWidth: '92vw', zIndex: 1401, background: 'var(--white)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(15,23,42,0.12)', display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>New direct message</div>
              <button type="button" onClick={() => setCreating(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
              {staff.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No other staff found.</div>}
              {staff.map(s => (
                <button type="button" key={s.id} onClick={() => startDm(s.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 'var(--ds-btn-py) 12px', border: 'none', borderBottom: '1px solid var(--bg)', background: 'transparent', cursor: 'pointer', textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box'}}>
                  <Av name={s.name} size={30} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
