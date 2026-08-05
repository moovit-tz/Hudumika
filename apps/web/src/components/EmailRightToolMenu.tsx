import React, { useState, useEffect, useRef } from 'react';
import { Icon, type IconName } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { useEvents, addEvent, deleteEvent, useTodos, addTodo, updateTodo, deleteTodo, inboxListId } from '../data/calendarStore.js';
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

export const EmailRightToolMenu: React.FC<EmailRightToolMenuProps> = ({
  selectedEmail,
  onOpenEmail,
  emails = [],
}) => {
  const [activePanel, setActivePanel] = useState<ToolPanelId>(null);

  // ── Tasks & Calendar Data Hooks ──
  const todos = useTodos();
  const events = useEvents();

  // ── Notifications state ──
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(5);

  useEffect(() => {
    apiFetch('/v1/notifications')
      .then(res => {
        const list = Array.isArray(res) ? res : res?.notifications ?? [];
        setNotifs(list);
        setUnreadNotifCount(list.filter((n: any) => !n.read).length || 5);
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

  // ── Notes drawer state ──
  const [noteText, setNoteText] = useState(() => localStorage.getItem('hudumika_quick_notes') || '• Follow up on pending shipment docs\n• Schedule review with logistics team\n• Verify customs tax codes');
  useEffect(() => {
    localStorage.setItem('hudumika_quick_notes', noteText);
  }, [noteText]);

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

  function togglePanel(panel: ToolPanelId, e?: React.MouseEvent) {
    if (activePanel === panel) {
      setActivePanel(null);
    } else {
      setActivePanel(panel);
    }
  }

  const unreadEmailCount = emails.filter((e: any) => !e.read).length || 12;

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
                  activePanel === 'calendar' ? 'Calendar & Events' :
                  activePanel === 'messages' ? 'Quick Inbox' :
                  activePanel === 'chat' ? 'Team Chat' :
                  activePanel === 'notifications' ? 'Notifications' :
                  activePanel === 'analytics' ? 'Workspace Metrics' :
                  activePanel === 'notes' ? 'Quick Notes' : 'Preferences'
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
                  {todos.map(t => (
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
                  {todos.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No tasks found. Add one above!</p>
                  )}
                </div>
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
                      <Icon name="plus" size={14} /> Schedule
                    </button>
                  </div>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {events.map(ev => (
                    <div key={ev.id} className="ertm-event-card">
                      <span className="ertm-event-time">{ev.start.split('T')[1] || 'Today'}</span>
                      <span className="ertm-event-title">{ev.title}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" className="ertm-close-btn" onClick={() => deleteEvent(ev.id)}>
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', margin: '20px 0' }}>No scheduled events today.</p>
                  )}
                </div>
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
              </div>
            )}

            {/* ── 5. Notifications Panel ── */}
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
              </div>
            )}

            {/* ── 6. Metrics & Analytics Panel ── */}
            {activePanel === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="ertm-metrics-grid">
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">98.4%</span>
                    <span className="ertm-metric-lbl">Inbound Health</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">14m</span>
                    <span className="ertm-metric-lbl">Avg Response</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">{todos.length}</span>
                    <span className="ertm-metric-lbl">Active Tasks</span>
                  </div>
                  <div className="ertm-metric-card">
                    <span className="ertm-metric-val">100%</span>
                    <span className="ertm-metric-lbl">Security Score</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 7. Quick Notes Panel ── */}
            {activePanel === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Auto-saved scratchpad notes:</span>
                <textarea
                  className="ertm-input"
                  style={{ minHeight: 220, resize: 'vertical', lineHeight: 1.6 }}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
              </div>
            )}

            {/* ── 8. Settings & Preferences Panel ── */}
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
            onClick={e => togglePanel('tasks', e)}
          >
            <Icon name="tasks" size={18} />
            <span className="ertm-tooltip">Tasks & To-Dos</span>
            {todos.filter(t => !t.completed).length > 0 && (
              <span className="ertm-badge ertm-badge--teal">{todos.filter(t => !t.completed).length}</span>
            )}
          </button>

          {/* Calendar */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'calendar' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('calendar', e)}
          >
            <Icon name="calendar" size={18} />
            <span className="ertm-tooltip">Calendar & Events</span>
          </button>

          {/* Quick Messages */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'messages' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('messages', e)}
          >
            <Icon name="mail" size={18} />
            <span className="ertm-tooltip">Quick Messages</span>
            <span className="ertm-badge">{unreadEmailCount}</span>
          </button>

          {/* Chat / Comments */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'chat' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('chat', e)}
          >
            <Icon name="message" size={18} />
            <span className="ertm-tooltip">Team Chat</span>
          </button>

          {/* Notifications */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'notifications' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('notifications', e)}
          >
            <Icon name="bell" size={18} />
            <span className="ertm-tooltip">Notifications</span>
            {unreadNotifCount > 0 && (
              <span className="ertm-badge ertm-badge--danger">{unreadNotifCount}</span>
            )}
          </button>

          {/* Metrics */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'analytics' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('analytics', e)}
          >
            <Icon name="barChart2" size={18} />
            <span className="ertm-tooltip">Metrics & Activity</span>
          </button>

          {/* Notes */}
          <button
            type="button"
            className={`ertm-rail-btn${activePanel === 'notes' ? ' ertm-rail-btn--active' : ''}`}
            onClick={e => togglePanel('notes', e)}
          >
            <Icon name="fileText" size={18} />
            <span className="ertm-tooltip">Quick Notes</span>
          </button>
        </div>

        <div className="ertm-rail-spacer" />

        {/* AI Assistant Button (Katalyst Glowing Style) */}
        <button
          type="button"
          className={`ertm-rail-btn ertm-ai-trigger${activePanel === 'ai' ? ' ertm-ai-trigger--active' : ''}`}
          onClick={e => togglePanel('ai', e)}
        >
          <Icon name="sparkle" size={20} />
          <span className="ertm-tooltip">Hudumika AI Assistant</span>
        </button>

        <div className="ertm-rail-sep" />

        {/* Settings */}
        <button
          type="button"
          className={`ertm-rail-btn${activePanel === 'settings' ? ' ertm-rail-btn--active' : ''}`}
          onClick={e => togglePanel('settings', e)}
        >
          <Icon name="settings" size={18} />
          <span className="ertm-tooltip">Settings</span>
        </button>

      </div>

    </div>
  );
};
