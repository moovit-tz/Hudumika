import React from 'react';
import { Icon } from '../../components/Icon.js';

interface SmsPhoneSimulatorProps {
  senderName?: string;
  message: string;
  bubbleColor?: 'teal' | 'yellow';
  timestamp?: string;
  verified?: boolean;
}

export function SmsPhoneSimulator({
  senderName = 'HUDUMIKA',
  message,
  bubbleColor = 'yellow',
  timestamp,
  verified = true,
}: SmsPhoneSimulatorProps) {
  const displayTime = timestamp || `Today · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="sms-phone-mockup">
      {/* Top Phone Notch */}
      <div className="sms-phone-notch">
        <div className="sms-phone-camera" />
        <div className="sms-phone-speaker" />
      </div>

      {/* Phone Header */}
      <div className="sms-phone-header">
        <div className="sms-phone-avatar">
          {senderName.slice(0, 2).toUpperCase() || 'HD'}
        </div>
        <div className="sms-phone-header-info">
          <div className="sms-phone-sender" title={senderName}>
            {senderName}
          </div>
          <div className="sms-phone-subtitle">
            {verified ? '✓ Verified Sender' : 'Mobile Carrier Direct'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, color: '#94a3b8' }}>
          <Icon name="phone" size={14} />
          <Icon name="info" size={14} />
        </div>
      </div>

      {/* Screen Messages */}
      <div className="sms-phone-screen">
        <div className="sms-phone-timestamp">{displayTime}</div>

        <div
          className={`sms-phone-bubble ${
            bubbleColor === 'yellow' ? 'carrier-preview' : 'outbound'
          }`}
        >
          {message && message.trim() ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
          ) : (
            <span style={{ opacity: 0.7, fontStyle: 'italic' }}>
              Type a message to see realistic carrier rendering…
            </span>
          )}
        </div>
      </div>

      {/* Bottom Home Indicator */}
      <div className="sms-phone-footer-bar">
        <div className="sms-phone-home-indicator" />
      </div>
    </div>
  );
}
