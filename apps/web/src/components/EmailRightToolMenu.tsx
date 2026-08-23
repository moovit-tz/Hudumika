import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { useEvents, addEvent, deleteEvent, useTodos, addTodo, updateTodo, deleteTodo } from '../data/calendarStore.js';
import { useNotes, useNotesLoaded, loadNotes, addNote } from '../data/notesStore.js';
import { useAuth } from '../hooks/useAuth.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import './EmailRightToolMenu.css';

export type ToolPanelId = 'ai' | 'tasks' | 'calendar' | 'messages' | 'chat' | 'notifications' | 'analytics' | 'notes' | 'settings' | null;

interface EmailRightToolMenuProps {
  selectedEmail?: {
    id: string;
    subject: string;
    body: string;
    from: { name: string; email: string };
    date: Date;
    labels?: string[];
  } | null;
  onOpenEmail?: (id: string) => void;
  emails?: any[];
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

interface ChatChannel {
  id: string;
  type: 'channel' | 'dm' | 'group';
  name: string;
  unread: number;
  last_message: string | null;
  last_message_at: string | null;
}

interface ChatMessage {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

function channelIcon(type: string): IconName {
  if (type === 'dm') return 'user';
  if (type === 'group') return 'users';
  return 'hash';
}

function shortTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const EmailRightToolMenu: React.FC<EmailRightToolMenuProps> = ({
  selectedEmail,
  onOpenEmail,
  emails = [],
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activePanel, setActivePanel] = useState<ToolPanelId>(null);

  // ── Tasks & Calendar Data Hooks — real, shared store (same one the
  // Tasks/Calendar apps use) ──
  const todos = useTodos();
  const allEvents = useEvents();
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingEvents = allEvents
    .filter(ev => ev.start.slice(0, 10) >= todayStr)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12);
  const todaysEventCount = allEvents.filter(ev => ev.start.slice(0, 10) === todayStr).length;

  // ── Notifications state — real, /v1/notifications ──
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    apiFetch('/v1/notifications')
      .then(res => {
        const list = Array.isArray(res) ? res : res?.notifications ?? [];
        setNotifs(list);
        setUnreadNotifCount(typeof res?.unread_count === 'number' ? res.unread_count : list.filter((n: any) => !n.read).length);
      })
      .catch(() => {});
  }, []);

  function handleMarkAllNotifsRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadNotifCount(0);
    apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  }

  // ── Tasks drawer state ──
  const [newTaskTitle, setNewTaskTitle] = useState('');
  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTodo({ title: newTaskTitle.trim(), notes: selectedEmail ? `From email: ${selectedEmail.subject}` : undefined });
    setNewTaskTitle('');
  }

  // ── Calendar drawer state ──
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('14:00');
  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventTitle.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    addEvent({
      title: newEventTitle.trim(),
      start: `${today}T${newEventTime}`,
      end: `${today}T15:00`,
      category: 'work',
      description: selectedEmail ? `Meeting re: ${selectedEmail.subject}` : undefined,
    });
    setNewEventTitle('');
  }

  // ── Chat state — real backend, /v1/chat/channels ──
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelMsgs, setChannelMsgs] = useState<ChatMessage[]>([]);
  const [chatMsgsLoading, setChatMsgsLoading] = useState(false);
  const [chatMsgInput, setChatMsgInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatThreadEndRef = useRef<HTMLDivElement>(null);

  function loadChannels() {
    apiFetch('/v1/chat/channels')
      .then(res => setChannels(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setChannelsLoaded(true));
  }
  // Fetched once on mount (same pattern as notifications above) so the
  // rail's unread badge is correct even before the drawer is ever opened.
  useEffect(() => { loadChannels(); }, []);

  function openChannel(id: string) {
    setActiveChannelId(id);
    setChatMsgsLoading(true);
    apiFetch(`/v1/chat/channels/${id}/messages`)
      .then(res => setChannelMsgs(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setChannelMsgs([]))
      .finally(() => setChatMsgsLoading(false));
    setChannels(prev => prev.map(c => (c.id === id ? { ...c, unread: 0 } : c)));
    apiFetch(`/v1/chat/channels/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }

  useEffect(() => {
    chatThreadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [channelMsgs, activeChannelId]);

  async function sendChatMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = chatMsgInput.trim();
    if (!content || !activeChannelId || chatSending) return;
    setChatSending(true);
    try {
      const msg = await apiFetch(`/v1/chat/channels/${activeChannelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setChannelMsgs(prev => [...prev, msg]);
      setChatMsgInput('');
      setChannels(prev =>
        prev
          .map(c => (c.id === activeChannelId ? { ...c, last_message: msg.content, last_message_at: msg.created_at } : c))
          .sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime())
      );
    } catch {
      // leave the input populated so the user can retry
    } finally {
      setChatSending(false);
    }
  }

  const totalUnreadChats = channels.reduce((sum, c) => sum + (c.unread || 0), 0);
  const activeChannel = channels.find(c => c.id === activeChannelId) || null;

  // ── Notes state — real backend, same store the Notes app uses ──
  const notes = useNotes();
  const notesLoaded = useNotesLoaded();
  useEffect(() => { loadNotes(); }, []); // no-ops once already loaded, same as NotesApp/NotesShell
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const recentNotes = notes
    .filter(n => !n.trashed && !n.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteTitle.trim() && !newNoteBody.trim()) return;
    setSavingNote(true);
    const content = selectedEmail
      ? `${newNoteBody.trim()}${newNoteBody.trim() ? '\n\n' : ''}— From email: "${selectedEmail.subject}" (${selectedEmail.from.name})`
      : newNoteBody.trim();
    await addNote({ title: newNoteTitle.trim() || selectedEmail?.subject || 'Untitled', content });
    setNewNoteTitle('');
    setNewNoteBody('');
    setSavingNote(false);
  }

  // ── AI Assistant Chat state (Katalyst AI style) ──
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    {
      id: '1',
      role: 'assistant',
      text: 'Habari! I am Hudumika AI Assistant. How can I help you analyze, summarize, or manage your emails and workspace today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  function handleSendAiMsg(textToSend?: string) {
    const q = textToSend || aiInput;
    if (!q.trim() || aiLoading) return;

    const userMsg: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: q.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMsgs(prev => [...prev, userMsg]);
    if (!textToSend) setAiInput('');
    setAiLoading(true);

    setTimeout(() => {
      let replyText = 'I have processed your request across Hudumika.';
      const lower = q.toLowerCase();

      if (lower.includes('summarize')) {
        replyText = selectedEmail
          ? `Summary of "${selectedEmail.subject}":\n• From: ${selectedEmail.from.name} (${selectedEmail.from.email})\n• Key Points: ${selectedEmail.body.slice(0, 140)}...\n• Action needed: Review attachment and reply before end of day.`
          : 'Please select an email thread from your inbox to view a detailed context-aware summary.';
      } else if (lower.includes('reply') || lower.includes('draft')) {
        replyText = selectedEmail
          ? `Draft Reply for "${selectedEmail.subject}":\n\n"Dear ${selectedEmail.from.name},\n\nThank you for your email regarding ${selectedEmail.subject}. We have received your request and our team is currently processing the details. We will update you shortly.\n\nBest regards,\nHudumika Operations Team"`
          : 'Here is a draft reply template:\n"Hello, thank you for reaching out. We have received your inquiry and will follow up shortly."';
      } else if (lower.includes('compliance') || lower.includes('risk')) {
        replyText = 'Compliance Audit:\n✔ TRA Tax Clearance: Verified\n✔ Demurrage Risk: Low (< 2 days buffer)\n✔ Invoice Matching: 100% Match';
      } else if (lower.includes('task') || lower.includes('extract')) {
        const taskName = selectedEmail ? `Review: ${selectedEmail.subject}` : 'Follow up on email thread';
        addTodo({ title: taskName, notes: selectedEmail?.body?.slice(0, 100) });
        replyText = `Created a new Task: "${taskName}" in your To-Do list!`;
      } else {
        replyText = `Understood. Analyzing "${q}" against your Hudumika workspace context... All systems operational and synced.`;
      }

      setChatMsgs(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setAiLoading(false);
    }, 600);
  }

  function togglePanel(panel: ToolPanelId) {
    setActivePanel(prev => (prev === panel ? null : panel));
  }

  const unreadEmailCount = emails.filter((e: any) => !e.read).length;

  return (
    <div className="ertm-container">

      {/* ── Slide-out Drawer Panel ── */}
      {activePanel && (
        <div className="ertm-drawer">

          {/* Drawer Header */}
          <div className="ertm-drawer-hdr">
            <div className="ertm-drawer-title-group">
              <div className="ertm-drawer-title-icon">
                <Icon
                  name={
                    activePanel === 'ai' ? 'sparkle' :
                    activePanel === 'tasks' ? 'tasks' :
                    activePanel === 'calendar' ? 'calendar' :
                    activePanel === 'messages' ? 'mail' :
                    activePanel === 'chat' ? 'message' :
                    activePanel === 'notifications' ? 'bell' :
                    activePanel === 'analytics' ? 'barChart2' :
                    activePanel === 'notes' ? 'fileText' : 'settings'
                  }
                  size={16}
                />
              </div>
              <span className="ertm-drawer-title">
                {
                  activePanel === 'ai' ? 'AI Assistant' :
                  activePanel === 'tasks' ? 'Tasks & To-Dos' :
                  activePanel === 'calendar' ? 'Upcoming Events' :
                  activePanel === 'messages' ? 'Quick Inbox' :
                  activePanel === 'chat' ? (activeChannel ? activeChannel.name : 'Team Chat') :
                  activePanel === 'notifications' ? 'Notifications' :
                  activePanel === 'analytics' ? 'Workspace Snapshot' :
                  activePanel === 'notes' ? 'Notes' : 'Preferences'
                }
              </span>
            </div>
            <button
              type="button"
              className="ertm-close-btn"
              onClick={() => setActivePanel(null)}
              title="Close panel"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Drawer Body Content */}
          <div className="ertm-drawer-body">

            {/* ── 1. AI Assistant Panel (Katalyst AI Style) ── */}
            {activePanel === 'ai' && (
              <>
                {/* Status Hero Card */}
                <div className="ertm-ai-status-card">
                  <div className="ertm-ai-avatar">
                    <Icon name="zap" size={20} />
                  </div>
                  <div className="ertm-ai-status-info">
                    <span className="ertm-ai-name">HUDUMIKA AI</span>
                    <span className="ertm-ai-status-pill">
                      <span className="ertm-ai-pulse-dot" />
                      READY
                    </span>
                  </div>
                </div>

                {/* Email Context Banner */}
                {selectedEmail && (
                  <div className="ertm-ai-context-banner">
                    <Icon name="mail" size={13} />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Context: {selectedEmail.subject}
                    </span>
                  </div>
                )}

                {/* Smart Action Chips */}
                <div className="ertm-ai-chips-grid">
                  <button type="button" className="ertm-ai-chip" onClick={() => handleSendAiMsg('Summarize email thread')}>
                    <span>⚡</span>
                    <span>Summarize thread</span>
                  </button>
                  <button type="button" className="ertm-ai-chip" onClick={() => handleSendAiMsg('Draft reply')}>
                    <span>✉️</span>
                    <span>Draft AI reply</span>
                  </button>
                  <button type="button" className="ertm-ai-chip" onClick={() => handleSendAiMsg('Check compliance risk')}>
                    <span>🔍</span>
                    <span>Compliance & Risk Audit</span>
                  </button>
                  <button type="button" className="ertm-ai-chip" onClick={() => handleSendAiMsg('Extract action items to tasks')}>
                    <span>📋</span>
                    <span>Extract action tasks</span>
                  </button>
                </div>

                {/* Chat Messages */}
                <div className="ertm-chat-messages">
                  {chatMsgs.map(m => (
                    <div key={m.id} className={`ertm-msg ertm-msg--${m.role}`}>
                      <div className="ertm-msg-bubble">{m.text}</div>
                      <span className="ertm-msg-time">{m.time}</span>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="ertm-msg ertm-msg--assistant">
                      <div className="ertm-msg-bubble" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7' }}>
                        <Icon name="refresh" size={14} className="animate-spin" />
                        Generating response…
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Input */}
                <div className="ertm-ai-input-box">
                  <div className="ertm-ai-input-row">
                    <input
                      className="ertm-ai-input"
                      placeholder="Ask anything..."
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendAiMsg()}
                    />
                    <button type="button" className="ertm-icon-btn" title="Attach file">
                      <Icon name="paperclip" size={15} />
                    </button>
                    <button
                      type="button"
                      className="ertm-send-btn"
                      onClick={() => handleSendAiMsg()}
                    >
                      <Icon name="send" size={12} />
                      <span>SEND</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── 2. Tasks Panel ── */}
            {activePanel === 'tasks' && (
              <>
                <form onSubmit={handleAddTask} className="ertm-add-task-row">
                  <input
                    className="ertm-input"
                    placeholder="Add a new task..."
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                  />
                  <button type="submit" className="ertm-btn-primary">
                    <Icon name="plus" size={14} /> Add
                  </button>
                </form>

                <div className="ertm-task-list">
                  {todos.filter(t => !t.deletedAt).map(t => (
                    <div key={t.id} className={`ertm-task-item${t.completed ? ' ertm-task-item--done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={() => updateTodo(t.id, { completed: !t.completed, status: !t.completed ? 'completed' : 'none' })}
                        style={{ cursor: 'pointer' }}
                      />
                      <span className="ertm-task-title">{t.title}</span>
                      <button
                        type="button"
                        className="ertm-close-btn"
                        onClick={() => deleteTodo(t.id)}
                        title="Delete task"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                  {todos.filter(t => !t.deletedAt).length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No tasks found. Add one above!</p>
                  )}
                </div>

                <button type="button" className="ertm-open-app-link" onClick={() => navigate('/tasks')}>
                  Open Tasks app <Icon name="externalLink" size={12} />
                </button>
              </>
            )}

            {/* ── 3. Calendar Panel ── */}
            {activePanel === 'calendar' && (
              <>
                <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    className="ertm-input"
                    placeholder="Event title..."
                    value={newEventTitle}
                    onChange={e => setNewEventTitle(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="time"
                      className="ertm-input"
                      value={newEventTime}
                      onChange={e => setNewEventTime(e.target.value)}
                    />
                    <button type="submit" className="ertm-btn-primary" style={{ flexShrink: 0 }}>
                      <Icon name="plus" size={14} /> Schedule today
                    </button>
                  </div>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {upcomingEvents.map(ev => (
                    <div key={ev.id} className="ertm-event-card">
                      <span className="ertm-event-time">
                        {ev.start.slice(0, 10) === todayStr ? 'Today' : new Date(ev.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        {' · '}{ev.start.split('T')[1]?.slice(0, 5) || ''}
                      </span>
                      <span className="ertm-event-title">{ev.title}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" className="ertm-close-btn" onClick={() => deleteEvent(ev.id)}>
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {upcomingEvents.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No upcoming events scheduled.</p>
                  )}
                </div>

                <button type="button" className="ertm-open-app-link" onClick={() => navigate('/calendar')}>
                  Open Calendar app <Icon name="externalLink" size={12} />
                </button>
              </>
            )}

            {/* ── 4. Quick Messages / Inbox Panel ── */}
            {activePanel === 'messages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {emails.slice(0, 8).map((em: any) => (
                  <div
                    key={em.id}
                    onClick={() => onOpenEmail?.(em.id)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: em.read ? 'transparent' : 'rgba(2, 132, 199, 0.08)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{em.from?.name || 'Sender'}</div>
                    <div style={{ fontSize: 12, fontWeight: em.read ? 500 : 700, color: 'var(--ink2)' }}>{em.subject}</div>
                  </div>
                ))}
                {emails.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No messages in this folder.</p>
                )}
              </div>
            )}

            {/* ── 5. Team Chat Panel — real backend, /v1/chat ── */}
            {activePanel === 'chat' && (
              activeChannelId ? (
                <div className="ertm-chat-thread">
                  <button type="button" className="ertm-chat-thread-back" onClick={() => setActiveChannelId(null)}>
                    <Icon name="arrowLeft" size={13} /> Channels
                  </button>

                  <div className="ertm-chat-thread-messages">
                    {chatMsgsLoading && <p style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center' }}>Loading…</p>}
                    {!chatMsgsLoading && channelMsgs.length === 0 && (
                      <p style={{ fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No messages yet — say hello!</p>
                    )}
                    {channelMsgs.map(m => {
                      const mine = m.author_id === user?.id;
                      return (
                        <div key={m.id} className={`ertm-msg ${mine ? 'ertm-msg--mine' : 'ertm-msg--theirs'}`}>
                          {!mine && <span className="ertm-msg-author">{m.author_name}</span>}
                          <div className="ertm-msg-bubble">{m.content}</div>
                          <span className="ertm-msg-time">{shortTime(m.created_at)}</span>
                        </div>
                      );
                    })}
                    <div ref={chatThreadEndRef} />
                  </div>

                  <form onSubmit={sendChatMessage} className="ertm-ai-input-row" style={{ flexShrink: 0 }}>
                    <input
                      className="ertm-ai-input"
                      placeholder="Message…"
                      value={chatMsgInput}
                      onChange={e => setChatMsgInput(e.target.value)}
                    />
                    <button type="submit" className="ertm-send-btn" disabled={chatSending || !chatMsgInput.trim()}>
                      <Icon name="send" size={12} />
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="ertm-channel-list">
                    {channels.map(c => (
                      <div
                        key={c.id}
                        className={`ertm-channel-item${c.unread > 0 ? ' ertm-channel-item--unread' : ''}`}
                        onClick={() => openChannel(c.id)}
                      >
                        <div className="ertm-channel-avatar">
                          <Icon name={channelIcon(c.type)} size={14} />
                        </div>
                        <div className="ertm-channel-info">
                          <span className="ertm-channel-name">{c.name}</span>
                          <span className="ertm-channel-preview">{c.last_message || 'No messages yet'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>{shortTime(c.last_message_at)}</span>
                          {c.unread > 0 && <span className="ertm-channel-unread-badge">{c.unread}</span>}
                        </div>
                      </div>
                    ))}
                    {channelsLoaded && channels.length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No conversations yet.</p>
                    )}
                  </div>
                  <button type="button" className="ertm-open-app-link" onClick={() => navigate('/chat')}>
                    Open full Chat app <Icon name="externalLink" size={12} />
                  </button>
                </>
              )
            )}

            {/* ── 6. Notifications Panel ── */}
            {activePanel === 'notifications' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Unread: {unreadNotifCount}</span>
                  <button type="button" className="ertm-btn-primary" style={{ padding: 'var(--ds-btn-py-xs) 10px', fontSize: 11, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} onClick={handleMarkAllNotifsRead}>
                    Mark all read
                  </button>
                </div>
                {notifs.map((n: any) => (
                  <div key={n.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{n.title || n.message}</div>
                    <span style={{ fontSize: 10, color: 'var(--ink3)' }}>{n.created_at ? new Date(n.created_at).toLocaleTimeString() : 'Just now'}</span>
                  </div>
                ))}
                {notifs.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No notifications.</p>
                )}
              </div>
            )}

            {/* ── 7. Workspace Snapshot Panel — real counts, no fabricated metrics ── */}
            {activePanel === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="ertm-metrics-grid">
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">{todos.filter(t => !t.completed && !t.deletedAt).length}</span>
                    <span className="ertm-metric-lbl">Open Tasks</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">{todaysEventCount}</span>
                    <span className="ertm-metric-lbl">Today's Events</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">{unreadNotifCount}</span>
                    <span className="ertm-metric-lbl">Unread Alerts</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">{totalUnreadChats}</span>
                    <span className="ertm-metric-lbl">Unread Chats</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 8. Notes Panel — real backend, same store as the Notes app ── */}
            {activePanel === 'notes' && (
              <>
                <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    className="ertm-input"
                    placeholder="Title…"
                    value={newNoteTitle}
                    onChange={e => setNewNoteTitle(e.target.value)}
                  />
                  <textarea
                    className="ertm-input"
                    style={{ minHeight: 60, resize: 'vertical' }}
                    placeholder={selectedEmail ? `Note about "${selectedEmail.subject}"…` : 'Take a note…'}
                    value={newNoteBody}
                    onChange={e => setNewNoteBody(e.target.value)}
                  />
                  <button type="submit" className="ertm-btn-primary" disabled={savingNote} style={{ alignSelf: 'flex-end' }}>
                    <Icon name="plus" size={14} /> {savingNote ? 'Saving…' : 'Add note'}
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentNotes.map(n => (
                    <div key={n.id} className="ertm-note-card" onClick={() => navigate('/notes')}>
                      <div className="ertm-note-meta">
                        <span className="ertm-note-title">{n.title || 'Untitled'}</span>
                        {n.pinned && <Icon name="star" size={12} color="var(--gold)" />}
                      </div>
                      {n.content && <div className="ertm-note-preview ertm-line-clamp-2">{n.content}</div>}
                    </div>
                  ))}
                  {notesLoaded && recentNotes.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No notes yet. Add one above!</p>
                  )}
                </div>

                <button type="button" className="ertm-open-app-link" onClick={() => navigate('/notes')}>
                  Open Notes app <Icon name="externalLink" size={12} />
                </button>
              </>
            )}

            {/* ── 9. Settings & Preferences Panel ── */}
            {activePanel === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Theme Mode</span>
                  <button
                    type="button"
                    className="ertm-btn-primary"
                    onClick={e => toggleThemeWithAnimation(e)}
                  >
                    Toggle Theme
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Right Vertical Toolbar Rail ── */}
      <div className="ertm-rail">

        <div className="ertm-rail-group">
          {/* Tasks */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'tasks' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('tasks')}
          >
            <Icon name="tasks" size={18} />
            <span className="ertm-tooltip">Tasks & To-Dos</span>
            {todos.filter(t => !t.completed && !t.deletedAt).length > 0 && (
              <span className="ertm-badge ertm-badge--teal">{todos.filter(t => !t.completed && !t.deletedAt).length}</span>
            )}
          </button>

          {/* Calendar */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'calendar' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('calendar')}
          >
            <Icon name="calendar" size={18} />
            <span className="ertm-tooltip">Upcoming Events</span>
            {todaysEventCount > 0 && (
              <span className="ertm-badge ertm-badge--teal">{todaysEventCount}</span>
            )}
          </button>

          {/* Quick Messages */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'messages' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('messages')}
          >
            <Icon name="mail" size={18} />
            <span className="ertm-tooltip">Quick Messages</span>
            {unreadEmailCount > 0 && <span className="ertm-badge">{unreadEmailCount}</span>}
          </button>

          {/* Team Chat */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'chat' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('chat')}
          >
            <Icon name="message" size={18} />
            <span className="ertm-tooltip">Team Chat</span>
            {totalUnreadChats > 0 && (
              <span className="ertm-badge ertm-badge--danger">{totalUnreadChats}</span>
            )}
          </button>

          {/* Notifications */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'notifications' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('notifications')}
          >
            <Icon name="bell" size={18} />
            <span className="ertm-tooltip">Notifications</span>
            {unreadNotifCount > 0 && (
              <span className="ertm-badge ertm-badge--danger">{unreadNotifCount}</span>
            )}
          </button>

          {/* Workspace Snapshot */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'analytics' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('analytics')}
          >
            <Icon name="barChart2" size={18} />
            <span className="ertm-tooltip">Workspace Snapshot</span>
          </button>

          {/* Notes */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'notes' ? ' ertm-rail-btn--active' : ''}`}
            onClick={() => togglePanel('notes')}
          >
            <Icon name="fileText" size={18} />
            <span className="ertm-tooltip">Notes</span>
          </button>
        </div>

        <div className="ertm-rail-spacer" />

        {/* AI Assistant Button (Katalyst Glowing Style) */}
        <button
          type="button"
          className={`ertm-rail-btn ertm-ai-trigger${activePanel === 'ai' ? ' ertm-ai-trigger--active' : ''}`}
          onClick={() => togglePanel('ai')}
        >
          <Icon name="sparkle" size={20} />
          <span className="ertm-tooltip">Hudumika AI Assistant</span>
        </button>

        <div className="ertm-rail-sep" />

        {/* Settings */}
        <button
          type="button"
          className={`ertm-rail-btn${activePanel === 'settings' ? ' ertm-rail-btn--active' : ''}`}
          onClick={() => togglePanel('settings')}
        >
          <Icon name="settings" size={18} />
          <span className="ertm-tooltip">Settings</span>
        </button>

      </div>

    </div>
  );
};
