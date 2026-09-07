import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import type { IconName } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Tip } from '../components/ui/tooltip.js';

// ─── Types (match apps/api/src/routes/chat.routes.ts) ─────────────────────────

interface ApiChannel {
  id: string;
  type: 'channel' | 'dm' | 'group';
  name: string;
  description: string | null;
  member_ids: string[];
  created_by: string;
  other_user_id: string | null;
  other_user_role: string | null;
  unread: number;
  last_message: string | null;
  last_message_at: string | null;
  is_favorite: boolean;
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

interface StaffOpt { id: string; name: string; role: string; email?: string; }
interface BrowseChannel { id: string; type: 'channel' | 'group'; name: string; description: string | null; member_count: number; }

function ft(d: Date) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
function fd(d: Date) {
  const n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function sd(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function grp(a: ApiMessage, b: ApiMessage) { return a.author_id === b.author_id && (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60000; }

const EMOJIS = ['👍', '❤️', '😄', '🎉', '🚀', '👀', '✅', '😂', '🙌', '💯', '🔥', '👋', '🤝', '📦', '✈️', '⚓'];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥'];
const POLL_MS = 6000;

const fieldStyle: React.CSSProperties = { width: '100%', height: 38, background: 'var(--card-sunken)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0 12px', color: 'var(--ink)', fontSize: 13, outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 };

export const Chat: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // A phone has room for exactly one of {conversation list, active thread} —
  // this file had no mobile handling at all (two fixed 280px <aside>s either
  // side of the thread, unconditionally rendered), which on a narrow screen
  // squeezed the actual conversation into a sliver a few dozen pixels wide.
  const isMobile = useMediaQuery('(max-width: 900px)');

  // State
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'favorites' | 'groups'>('all');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [creating, setCreating] = useState<'channel' | 'dm' | 'group' | null>(null);
  const [newName, setNewName] = useState('');
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [browseList, setBrowseList] = useState<BrowseChannel[] | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load Channels from Backend
  const loadChannels = useCallback(async (selectFirst = false) => {
    try {
      const res = await apiFetch('/v1/chat/channels');
      const list: ApiChannel[] = res.data ?? [];
      setChannels(list);
      // A search/notification result linking here (?channel=<id>) should
      // open on that channel, not silently fall back to whichever one
      // happens to be first. Consumed once, like Support.tsx/SupportKB.tsx's
      // own ?id= — this runs again every 6s poll, so leaving the param in
      // the URL would snap the user back to it the moment they switched to
      // a different channel themselves.
      const wantedId = searchParams.get('channel');
      if (wantedId && list.some(c => c.id === wantedId)) {
        setActiveId(wantedId);
        setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('channel'); return next; }, { replace: true });
      } else if (selectFirst && !activeId && list.length > 0) {
        setActiveId(list[0].id);
      }
    } catch { /* keep previous list */ } finally { setLoadingChannels(false); }
  }, [activeId, searchParams, setSearchParams]);

  useEffect(() => { loadChannels(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => loadChannels(false), POLL_MS);
    return () => clearInterval(t);
  }, [loadChannels]);

  // Load Staff
  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE' && u.id !== user?.id).map(u => ({
        id: u.id, name: u.name, role: (u.role || 'Team Member').replace(/_/g, ' '), email: u.email
      })));
    }).catch(() => {});
  }, [user?.id]);

  // Load Messages for Active Conversation
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

  const activeCh = channels.find(c => c.id === activeId) ?? null;

  // Send Message
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

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Toggle Reactions
  async function react(msgId: string, emoji: string) {
    setMessages(p => p.map(m => {
      if (m.id !== msgId) return m;
      const rxns = [...(m.reactions || [])];
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

  // Create Channel / Group
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

  // Delete or Leave Channel
  async function leaveOrDeleteChannel(ch: ApiChannel) {
    const isOwner = ch.type !== 'dm' && ch.created_by === user?.id;
    const message = ch.type === 'dm'
      ? `Remove your conversation with ${ch.name}?`
      : isOwner
        ? `Delete #${ch.name} for everyone?`
        : `Leave ${ch.name}?`;
    const ok = await showConfirm(message, { title: isOwner && ch.type !== 'dm' ? 'Delete channel' : 'Leave conversation', confirmLabel: isOwner && ch.type !== 'dm' ? 'Delete' : 'Leave' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/chat/channels/${ch.id}`, { method: 'DELETE' });
      setChannels(p => p.filter(c => c.id !== ch.id));
      if (activeId === ch.id) { setActiveId(null); setMessages([]); }
    } catch (err: any) { showAlert(err.message || 'Could not leave conversation.'); }
  }

  // Start DM
  async function startDm(otherId: string) {
    try {
      const channel: ApiChannel = await apiFetch('/v1/chat/channels', { method: 'POST', body: JSON.stringify({ type: 'dm', member_ids: [otherId] }) });
      await loadChannels(false);
      setActiveId(channel.id);
      setCreating(null);
    } catch (err: any) { showAlert(err.message || 'Failed to start conversation'); }
  }

  // Toggle favorite — optimistic, persisted server-side so it survives the next poll.
  const toggleFav = async (chId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChannels(p => p.map(c => c.id === chId ? { ...c, is_favorite: !c.is_favorite } : c));
    try { await apiFetch(`/v1/chat/channels/${chId}/favorite`, { method: 'PATCH' }); }
    catch { setChannels(p => p.map(c => c.id === chId ? { ...c, is_favorite: !c.is_favorite } : c)); }
  };

  // Browse & join channels/groups the user hasn't joined yet
  async function openBrowse() {
    setBrowseOpen(true);
    setBrowseLoading(true);
    try {
      const res = await apiFetch('/v1/chat/channels/browse');
      setBrowseList(res.data ?? []);
    } catch { setBrowseList([]); } finally { setBrowseLoading(false); }
  }
  async function joinChannel(id: string) {
    setJoiningId(id);
    try {
      const channel: ApiChannel = await apiFetch(`/v1/chat/channels/${id}/join`, { method: 'POST' });
      await loadChannels(false);
      setActiveId(channel.id);
      setBrowseOpen(false);
      setBrowseList(null);
    } catch (err: any) { showAlert(err.message || 'Failed to join'); } finally { setJoiningId(null); }
  }

  // Filter Conversations
  const q = search.toLowerCase();
  const filteredChannels = channels.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !(c.last_message || '').toLowerCase().includes(q)) return false;
    if (activeTab === 'unread') return c.unread > 0;
    if (activeTab === 'favorites') return !!c.is_favorite;
    if (activeTab === 'groups') return c.type === 'group' || c.type === 'channel';
    return true;
  });

  const totalUnread = channels.reduce((s, c) => s + c.unread, 0);
  const favList = filteredChannels.filter(c => c.is_favorite);
  const dmList = filteredChannels.filter(c => c.type === 'dm' && !c.is_favorite);
  const groupList = filteredChannels.filter(c => (c.type === 'group' || c.type === 'channel') && !c.is_favorite);

  return (
    <div className="bliss-chat-shell" style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)' }}>

      {/* ─── 1. CONVERSATIONS PANEL (280px) ─────────────────────────────────── */}
      {(!isMobile || !activeId) && (
      <aside style={{ width: isMobile ? '100%' : 280, flexShrink: 0, background: 'var(--white)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Sidebar Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Messages</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <Tip label="Browse channels">
              <button type="button" onClick={openBrowse} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--card-sunken)', color: 'var(--ink2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={"compass" as IconName} size={15} />
              </button>
            </Tip>
            <Tip label="New Direct Message">
              <button type="button" onClick={() => setCreating('dm')} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--card-sunken)', color: 'var(--ink2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="edit" size={15} />
              </button>
            </Tip>
            <Tip label="New Channel">
              <button type="button" onClick={() => setCreating('channel')} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--card-sunken)', color: 'var(--ink2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={15} />
              </button>
            </Tip>
          </div>
        </div>

        {/* Unified Search & Filter Row */}
        <div style={{ padding: '8px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 9, pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{
                width: '100%',
                height: 32,
                background: 'var(--card-sunken)',
                border: '1px solid var(--border2)',
                borderRadius: 8,
                paddingLeft: 28,
                paddingRight: search ? 24 : 8,
                color: 'var(--ink)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink3)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2,
                }}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          <DropdownMenu>
            <Tip label="Filter conversations">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  style={{
                    height: 32,
                    padding: '0 8px',
                    borderRadius: 8,
                    border: activeTab !== 'all' ? '1px solid var(--teal)' : '1px solid var(--border2)',
                    background: activeTab !== 'all' ? 'var(--teal-l)' : 'var(--card-sunken)',
                    color: activeTab !== 'all' ? 'var(--teal)' : 'var(--ink2)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon
                    name={
                      activeTab === 'favorites' ? 'star' :
                      activeTab === 'groups' ? 'users' :
                      activeTab === 'unread' ? 'messageSquare' : 'filter'
                    }
                    size={12}
                    strokeWidth={2}
                  />
                  <span>
                    {activeTab === 'all' ? 'All' :
                     activeTab === 'unread' ? `Unread${totalUnread ? ` (${totalUnread})` : ''}` :
                     activeTab === 'favorites' ? 'Favs' : 'Groups'}
                  </span>
                  <Icon name="chevronDown" size={10} style={{ opacity: 0.6 }} />
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setActiveTab('all')} className={activeTab === 'all' ? 'font-bold text-primary' : ''}>
                <Icon name="layers" size={13} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>All Chats</span>
                {activeTab === 'all' && <Icon name="check" size={12} />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('unread')} className={activeTab === 'unread' ? 'font-bold text-primary' : ''}>
                <Icon name="messageSquare" size={13} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>Unread</span>
                {totalUnread > 0 && (
                  <span style={{ fontSize: 9.5, background: 'var(--red)', color: '#ffffff', padding: '1px 5px', borderRadius: 8, fontWeight: 800, marginRight: 4 }}>
                    {totalUnread}
                  </span>
                )}
                {activeTab === 'unread' && <Icon name="check" size={12} />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('favorites')} className={activeTab === 'favorites' ? 'font-bold text-primary' : ''}>
                <Icon name="star" size={13} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>Favorites</span>
                {favList.length > 0 && <span style={{ fontSize: 10, color: 'var(--ink3)', marginRight: 4 }}>{favList.length}</span>}
                {activeTab === 'favorites' && <Icon name="check" size={12} />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('groups')} className={activeTab === 'groups' ? 'font-bold text-primary' : ''}>
                <Icon name="users" size={13} style={{ marginRight: 8 }} />
                <span style={{ flex: 1 }}>Groups & Channels</span>
                {groupList.length > 0 && <span style={{ fontSize: 10, color: 'var(--ink3)', marginRight: 4 }}>{groupList.length}</span>}
                {activeTab === 'groups' && <Icon name="check" size={12} />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Conversations List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {loadingChannels && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>Loading chats…</div>}

          {/* Favorites Section */}
          {favList.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                Favorites
              </div>
              {favList.map(ch => (
                <ConversationItem key={ch.id} channel={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} onFav={toggleFav} onDelete={leaveOrDeleteChannel} />
              ))}
            </div>
          )}

          {/* Direct Messages Section */}
          {dmList.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 10px' }}>
                Recent Direct Messages
              </div>
              {dmList.map(ch => (
                <ConversationItem key={ch.id} channel={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} onFav={toggleFav} onDelete={leaveOrDeleteChannel} />
              ))}
            </div>
          )}

          {/* Groups & Channels Section */}
          {groupList.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 10px' }}>
                Group Channels
              </div>
              {groupList.map(ch => (
                <ConversationItem key={ch.id} channel={ch} active={activeId === ch.id} onClick={() => setActiveId(ch.id)} onFav={toggleFav} onDelete={leaveOrDeleteChannel} />
              ))}
            </div>
          )}

          {!loadingChannels && filteredChannels.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
              No conversations found.
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setCreating('dm')}
            style={{ width: '100%', height: 34, borderRadius: 10, background: 'var(--card-sunken)', border: '1px solid var(--border2)', color: 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name="plus" size={14} /> New direct message
          </button>
        </div>
      </aside>
      )}

      {/* ─── 2. MAIN CHAT STAGE ────────────────────────────────────────────── */}
      {(!isMobile || activeId) && (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative', minWidth: 0 }}>
        {!activeCh ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--ink3)' }}>
            <Icon name="messageSquare" size={48} strokeWidth={1} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Select a conversation to start messaging</div>
          </div>
        ) : (
          <>
            {/* Main Stage Header */}
            <header style={{ height: 64, padding: '0 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--elev-sm)', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {isMobile && (
                  <button type="button" onClick={() => setActiveId(null)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--ink2)', flexShrink: 0 }}>
                    <Icon name="arrowLeft" size={18} />
                  </button>
                )}
                {activeCh.type === 'dm' ? (
                  <PersonAvatar userId={activeCh.other_user_id} name={activeCh.name} size={38} />
                ) : (
                  <div style={{ width: 38, height: 38, borderRadius: 'var(--r)', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={activeCh.type === 'channel' ? 'hash' : 'users'} size={17} />
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{activeCh.name}</span>
                    <Tip label="Favorite">
                      <button type="button" onClick={(e) => toggleFav(activeCh.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: activeCh.is_favorite ? 'var(--gold)' : 'var(--ink3)' }}>
                        ★
                      </button>
                    </Tip>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeCh.type === 'dm' ? (activeCh.other_user_role || '') : (activeCh.description || `${activeCh.member_ids.length} members`)}
                  </div>
                </div>
              </div>

              {/* Header Right Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tip label="Start Voice Call">
                  <button type="button" onClick={() => navigate('/bliss/calls')} style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--card-sunken)', border: 'none', color: 'var(--ink2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="phone" size={16} />
                  </button>
                </Tip>
                <Tip label="Start Video Call">
                  <button type="button" onClick={() => navigate('/bliss/calls')} style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--card-sunken)', border: 'none', color: 'var(--ink2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="camera" size={16} />
                  </button>
                </Tip>
                <Tip label="Toggle Info Drawer">
                  <button type="button" onClick={() => setShowDetails(v => !v)} style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: showDetails ? 'var(--teal-l)' : 'var(--card-sunken)', border: 'none', color: showDetails ? 'var(--teal)' : 'var(--ink2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="info" size={16} />
                  </button>
                </Tip>
              </div>
            </header>

            {/* Message Stream */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loadingMessages && <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, padding: 20 }}>Loading conversation history…</div>}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 8px' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', background: 'var(--white)', padding: '3px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', boxShadow: 'var(--elev-sm)' }}>
                          {fd(ts)}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                    )}

                    {/* Message Row — hover-highlighted like the rest of the
                        platform's list rows, not a bubble floating in space */}
                    <div
                      className="group hover:bg-(--card-sunken) transition-colors"
                      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative', margin: '0 -12px', padding: isGrpMsg ? '1px 12px' : '4px 12px', borderRadius: 'var(--r)' }}
                    >
                      {!isGrpMsg ? (
                        <PersonAvatar userId={msg.author_id} name={msg.author_name} size={36} />
                      ) : (
                        <div style={{ width: 36, flexShrink: 0 }} />
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {!isGrpMsg && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: isMe ? 'var(--teal)' : 'var(--ink)' }}>{msg.author_name}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{ft(ts)}</span>
                            {isMe && <span style={{ fontSize: 9.5, fontWeight: 700, background: 'var(--teal-l)', color: 'var(--teal)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>You</span>}
                          </div>
                        )}

                        {/* Asymmetric tail corner (nearest the avatar) reads
                            as a real speech bubble instead of a uniform pill —
                            radius comes off the platform's own --r-lg token,
                            not an invented pixel value. */}
                        <div style={{
                          background: isMe ? 'var(--teal-l)' : 'var(--card-sunken)',
                          borderRadius: 'var(--r-sm) var(--r-lg) var(--r-lg) var(--r-lg)',
                          padding: '9px 14px', maxWidth: '85%', width: 'fit-content',
                          color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.55,
                          boxShadow: isMe ? 'none' : 'var(--elev-sm)',
                          borderLeft: isMe ? '3px solid var(--teal)' : 'none',
                        }}>
                          {msg.content}
                        </div>

                        {/* Emoji Reaction Chips */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {msg.reactions.map(r => (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() => react(msg.id, r.emoji)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--r-lg)',
                                  background: r.mine ? 'var(--teal-l)' : 'var(--card-sunken)', border: r.mine ? '1px solid var(--teal)' : '1px solid var(--border2)',
                                  color: r.mine ? 'var(--teal)' : 'var(--ink2)', fontSize: 12, cursor: 'pointer'
                                }}
                              >
                                {r.emoji} <span>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hover Action Bar */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ position: 'absolute', right: 10, top: -6, background: 'var(--white)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', padding: '2px 6px', display: 'flex', gap: 4, boxShadow: 'var(--elev)' }}>
                        {QUICK_REACTIONS.map(em => (
                          <button key={em} type="button" onClick={() => react(msg.id, em)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>{em}</button>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer Footer */}
            <div style={{ padding: '12px 20px 16px', background: 'var(--white)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="focus-within:border-(--teal) focus-within:shadow-[0_0_0_3px_var(--teal-l)]" style={{ background: 'var(--card-sunken)', border: '1px solid var(--border2)', borderRadius: 'var(--r-lg)', padding: 8, transition: 'border-color 0.15s, box-shadow 0.15s' }}>
                {/* Input Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
                  onKeyDown={onKey}
                  placeholder={`Message ${activeCh.type === 'channel' ? '#' : ''}${activeCh.name}… (Enter to send, Shift+Enter for a new line)`}
                  rows={1}
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--ink)', fontSize: 13.5, fontFamily: 'inherit', padding: '4px 6px', minHeight: 38 }}
                />

                {/* Dock Action Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {/* Emoji Popover */}
                    <Popover open={showEmoji} onOpenChange={setShowEmoji}>
                      <Tip label="Emoji">
                        <PopoverTrigger asChild>
                          <button type="button" style={{ width: 30, height: 30, borderRadius: 'var(--r)', background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="smile" size={16} />
                          </button>
                        </PopoverTrigger>
                      </Tip>
                      <PopoverContent align="start" side="top" className="w-auto p-2">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4 }}>
                          {EMOJIS.map(em => (
                            <button key={em} type="button" onClick={() => { setInput(i => i + em); setShowEmoji(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>
                              {em}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <button
                    type="button"
                    onClick={send}
                    disabled={!input.trim() || sending}
                    style={{
                      height: 32, padding: '0 16px', borderRadius: 'var(--r)',
                      background: input.trim() ? 'hsl(var(--primary))' : 'var(--border2)',
                      color: input.trim() ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', border: 'none', fontWeight: 700, fontSize: 12.5,
                      cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'background 0.15s',
                      boxShadow: input.trim() ? 'var(--elev-sm)' : 'none'
                    }}
                  >
                    <Icon name="send" size={14} /> Send
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      )}

      {/* ─── 3. RIGHT CONTACT / DETAILS DRAWER (280px; a full-screen overlay
             on mobile instead — there's no room for a third 280px column
             next to a phone-width thread). ─────────────────────────────── */}
      {showDetails && activeCh && (
        <aside style={isMobile
          ? { position: 'fixed', inset: 0, zIndex: 200, background: 'var(--white)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16, gap: 16 }
          : { width: 280, flexShrink: 0, background: 'var(--white)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16, gap: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{activeCh.type === 'dm' ? 'User Details' : 'Channel Details'}</span>
            <button type="button" onClick={() => setShowDetails(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer' }}>
              <Icon name="close" size={16} />
            </button>
          </div>

          {/* Profile Card */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'var(--card-sunken)', borderRadius: 16, padding: 18, border: '1px solid var(--border2)' }}>
            {activeCh.type === 'dm' ? (
              <PersonAvatar userId={activeCh.other_user_id} name={activeCh.name} size={64} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={activeCh.type === 'channel' ? 'hash' : 'users'} size={26} />
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginTop: 10 }}>{activeCh.name}</div>
            {activeCh.type === 'dm' ? (
              activeCh.other_user_role && <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginTop: 2 }}>{activeCh.other_user_role}</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                {activeCh.name.toLowerCase() === 'general' ? staff.length + 1 : (activeCh.member_ids?.length || 1)} member{(activeCh.name.toLowerCase() === 'general' ? staff.length + 1 : (activeCh.member_ids?.length || 1)) === 1 ? '' : 's'}
              </div>
            )}
            {activeCh.description && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.5 }}>{activeCh.description}</div>}
          </div>

          {/* Members Section for Channels / Groups */}
          {activeCh.type !== 'dm' && (() => {
            const isGeneral = activeCh.name.toLowerCase() === 'general';
            const me = {
              id: user?.id || 'me',
              name: user?.name || 'You',
              role: (user?.role || 'Team Member').replace(/_/g, ' '),
              email: user?.email,
              isCurrent: true,
            };
            const others = staff
              .filter(s => isGeneral || (activeCh.member_ids || []).includes(s.id) || activeCh.created_by === s.id)
              .map(s => ({ ...s, isCurrent: false }));
            const allMembers = [me, ...others];
            const filteredMembers = allMembers.filter(m =>
              !memberSearch.trim() ||
              m.name.toLowerCase().includes(memberSearch.toLowerCase().trim()) ||
              m.role.toLowerCase().includes(memberSearch.toLowerCase().trim())
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
                {/* Section Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Channel Members</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--teal-l)', color: 'var(--teal)' }}>
                      {allMembers.length}
                    </span>
                  </div>
                </div>

                {/* Filter Search */}
                {allMembers.length > 2 && (
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Icon name="search" size={12} color="var(--ink3)" style={{ position: 'absolute', left: 8 }} />
                    <input
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Filter members…"
                      style={{ width: '100%', height: 28, background: 'var(--card-sunken)', border: '1px solid var(--border2)', borderRadius: 6, paddingLeft: 26, paddingRight: 8, color: 'var(--ink)', fontSize: 11.5, outline: 'none' }}
                    />
                    {memberSearch && (
                      <button type="button" onClick={() => setMemberSearch('')} style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 0 }}>
                        <Icon name="close" size={11} />
                      </button>
                    )}
                  </div>
                )}

                {/* Member items list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
                  {filteredMembers.map(m => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 8px', borderRadius: 8, background: 'var(--card-sunken)',
                        border: '1px solid var(--border2)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <PersonAvatar name={m.name} userId={m.isCurrent ? user?.id : m.id} size={28} />
                          <span style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: '#10b981', border: '1.5px solid var(--white)' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.name}
                            </span>
                            {m.isCurrent && (
                              <span style={{ fontSize: 9.5, padding: '1px 4px', borderRadius: 4, background: 'var(--teal-l)', color: 'var(--teal)', fontWeight: 800 }}>You</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.role}
                          </div>
                        </div>
                      </div>

                      {!m.isCurrent && (
                        <button
                          type="button"
                          onClick={() => startDm(m.id)}
                          title={`Message ${m.name}`}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink3)', padding: 4, display: 'flex', alignItems: 'center',
                            borderRadius: 4, transition: 'color 0.12s'
                          }}
                        >
                          <Icon name="message" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* User Details & Actions for DMs */}
          {activeCh.type === 'dm' && (() => {
            const otherStaff = staff.find(s => s.id === activeCh.other_user_id);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card-sunken)', borderRadius: 10, padding: 12, border: '1px solid var(--border2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Status</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981', fontWeight: 700, fontSize: 11.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Online
                    </span>
                  </div>
                  {otherStaff?.email && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Email</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{otherStaff.email}</span>
                    </div>
                  )}
                  {activeCh.other_user_role && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Role</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 11.5 }}>{activeCh.other_user_role}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigate('/bliss/calls')}
                    style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--card-sunken)', color: 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Icon name="phone" size={13} /> Call
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/bliss/calls')}
                    style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--card-sunken)', color: 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Icon name="camera" size={13} /> Video
                  </button>
                </div>
              </div>
            );
          })()}
        </aside>
      )}

      {/* ─── 4. CREATE CHANNEL / GROUP ──────────────────────────────────────── */}
      <Dialog open={creating === 'channel' || creating === 'group'} onOpenChange={(o) => { if (!o) { setCreating(null); setNewName(''); setNewMemberIds([]); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{creating === 'channel' ? 'Create a channel' : 'Create a group'}</DialogTitle>
          </DialogHeader>

          <div>
            <label style={labelStyle}>{creating === 'channel' ? 'Channel name' : 'Group title'}</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={creating === 'channel' ? 'e.g. project-launch' : 'e.g. Design Leads'}
              style={fieldStyle}
            />
          </div>

          {creating === 'group' && (
            <div>
              <label style={labelStyle}>Select members</label>
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--card-sunken)' }}>
                {staff.map(s => {
                  const sel = newMemberIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setNewMemberIds(p => sel ? p.filter(x => x !== s.id) : [...p, s.id])}
                      style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, background: sel ? 'var(--teal-m)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border2)' }}
                    >
                      <PersonAvatar name={s.name} userId={s.id} size={26} />
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
                      {sel && <Icon name="check" size={14} color="var(--teal)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <button type="button" onClick={() => setCreating(null)} style={{ height: 38, padding: '0 16px', borderRadius: 8, background: 'var(--card-sunken)', border: '1px solid var(--border2)', color: 'var(--ink2)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={createChannelOrGroup} style={{ height: 38, padding: '0 16px', borderRadius: 8, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 5. NEW DIRECT MESSAGE ──────────────────────────────────────────── */}
      <Dialog open={creating === 'dm'} onOpenChange={(o) => { if (!o) setCreating(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New direct message</DialogTitle>
          </DialogHeader>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8, background: 'var(--card-sunken)' }}>
            {staff.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => startDm(s.id)}
                style={{ width: '100%', padding: 10, display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border2)' }}
              >
                <PersonAvatar name={s.name} userId={s.id} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.role}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 6. BROWSE CHANNELS ─────────────────────────────────────────────── */}
      <Dialog open={browseOpen} onOpenChange={(o) => { setBrowseOpen(o); if (!o) setBrowseList(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Browse channels</DialogTitle>
          </DialogHeader>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {browseLoading && <SectionLoading />}
            {!browseLoading && browseList?.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No channels to join — you're already in every one.</div>
            )}
            {!browseLoading && browseList?.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--border2)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={c.type === 'channel' ? 'hash' : 'users'} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.member_count} member{c.member_count === 1 ? '' : 's'}{c.description ? ` · ${c.description}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => joinChannel(c.id)}
                  disabled={joiningId === c.id}
                  style={{ height: 28, padding: '0 12px', borderRadius: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', fontSize: 11.5, fontWeight: 700, cursor: joiningId === c.id ? 'default' : 'pointer', opacity: joiningId === c.id ? 0.6 : 1, flexShrink: 0 }}
                >
                  {joiningId === c.id ? 'Joining…' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sub-component for sidebar item
function ConversationItem({
  channel, active, onClick, onFav, onDelete
}: {
  channel: ApiChannel; active: boolean; onClick: () => void;
  onFav: (id: string, e: React.MouseEvent) => void;
  onDelete: (ch: ApiChannel) => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
        background: active ? 'var(--card-sunken)' : 'transparent', transition: 'background 0.1s', marginBottom: 2
      }}
    >
      {channel.type === 'dm' ? (
        <PersonAvatar userId={channel.other_user_id} name={channel.name} size={32} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={channel.type === 'channel' ? 'hash' : 'users'} size={14} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? 'var(--ink)' : 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {channel.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>
            {channel.last_message_at ? ft(new Date(channel.last_message_at)) : ''}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {channel.last_message || 'Start chatting…'}
        </div>
      </div>

      <Tip label="Favorite">
        <button
          type="button"
          onClick={(e) => onFav(channel.id, e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: channel.is_favorite ? 'var(--gold)' : 'var(--ink3)', flexShrink: 0, fontSize: 13, padding: 0 }}
        >
          ★
        </button>
      </Tip>

      {channel.unread > 0 && (
        <span style={{ fontSize: 9.5, background: 'var(--red)', color: 'hsl(var(--red-foreground))', padding: '1px 6px', borderRadius: 10, fontWeight: 800, flexShrink: 0 }}>
          {channel.unread}
        </span>
      )}

      <DropdownMenu>
        <Tip label="More">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', flexShrink: 0, padding: 2, display: 'flex' }}
            >
              <Icon name="moreVertical" size={14} />
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onDelete(channel)} className="text-xs cursor-pointer" style={{ color: 'var(--red)' }}>
            {channel.type === 'dm' ? 'Remove conversation' : 'Leave / delete'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
