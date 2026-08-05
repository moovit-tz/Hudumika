import React, { useState } from 'react';
import { Icon } from './Icon.js';

export const LiveChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string; from: 'agent' | 'user'; text: string; ts: Date }[]>([]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), from: 'user', text: input.trim(), ts: new Date() }]);
    setInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), from: 'agent', text: 'Thank you for your message. An agent will be with you shortly.', ts: new Date() }]);
    }, 1000);
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'var(--teal)',
          border: 'none',
          color: '#fff',
          boxShadow: 'var(--elev)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 0.2s',
          transform: isOpen ? 'scale(0.8)' : 'scale(1)'
        }}
      >
        <Icon name={isOpen ? 'x' : 'chatBubble'} size={28} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: 100,
          right: 24,
          width: 360,
          height: 500,
          background: 'var(--white)',
          borderRadius: 12,
          boxShadow: 'var(--elev-lg)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          overflow: 'hidden',
          fontFamily: 'var(--font)'
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="headphones" size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Live Chat</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>We typically reply in a few minutes</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--ink3)' }}>
                <Icon name="messageSquare" size={32} />
                <div style={{ marginTop: 12, fontSize: 14 }}>Send a message to start chatting</div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} style={{ alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{
                    background: msg.from === 'user' ? 'var(--teal)' : 'var(--white)',
                    color: msg.from === 'user' ? '#fff' : 'var(--ink)',
                    padding: '12px 16px',
                    borderRadius: msg.from === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    boxShadow: 'var(--elev-sm)',
                    fontSize: 14,
                    lineHeight: 1.5
                  }}>
                    {msg.text}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4, textAlign: msg.from === 'user' ? 'right' : 'left' }}>
                    {msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 16, background: 'var(--white)', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 24, padding: '6px 6px 6px 16px' }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, fontFamily: 'var(--font)' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: input.trim() ? 'var(--teal)' : 'var(--border)',
                  border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.2s'
                }}
              >
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
