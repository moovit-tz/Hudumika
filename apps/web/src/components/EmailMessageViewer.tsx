import React, { useState, useMemo } from 'react';
import { Icon } from './Icon.js';
import { Tip } from './ui/tooltip.js';
import { addTodo } from '../data/calendarStore.js';
import { showAlert } from '../lib/alert.js';

interface EmailAttachment {
  storageKey?: string;
  filename: string;
  size?: number | null;
}

interface EmailAddress {
  name: string;
  email: string;
  userId?: string;
}

interface EmailMessageViewerProps {
  body: string;
  subject: string;
  date: Date;
  from: EmailAddress;
  to: EmailAddress[];
  attachments?: EmailAttachment[];
  onNavigate?: (path: string) => void;
  onDownloadAttachment?: (storageKey: string, filename: string) => void;
}

/** Regex to detect quoted reply headers */
const QUOTE_HEADER_REGEX = /(?:^|\n)(?:On\s+[A-Za-z]+,\s+[^,\n]+,\s+[^,\n]+wrote:|On\s+.+?wrote:|-{3,}\s*Original Message\s*-{3,}|From:\s*.+?\nSent:\s*.+?\nTo:\s*.+?\nSubject:\s*.+?)([\s\S]*)$/i;

/** Parses plain text into body vs quoted history */
function splitQuotedText(text: string): { main: string; quoted: string | null } {
  if (!text) return { main: '', quoted: null };

  const match = text.match(QUOTE_HEADER_REGEX);
  if (match && match.index !== undefined && match.index > 0) {
    const main = text.slice(0, match.index).trimEnd();
    const quoted = text.slice(match.index).trim();
    return { main, quoted };
  }

  // Check for lines starting with >
  const lines = text.split('\n');
  const firstQuoteIdx = lines.findIndex(l => l.trimStart().startsWith('>'));
  if (firstQuoteIdx > 0) {
    const main = lines.slice(0, firstQuoteIdx).join('\n').trimEnd();
    const quoted = lines.slice(firstQuoteIdx).join('\n').trim();
    return { main, quoted };
  }

  return { main: text, quoted: null };
}

/** Parses URLs in plain text and converts to clickable safe links */
function formatPlainTextWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="em-body-link"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/** Extracts reference codes (e.g. Container TXCU..., Declaration TZ-..., Invoice IV-...) */
function extractReferences(text: string, subject: string): { type: string; code: string; label: string }[] {
  const full = `${subject} ${text}`;
  const refs: { type: string; code: string; label: string }[] = [];
  const seen = new Set<string>();

  // Container numbers (4 letters + 7 digits)
  const containerMatches = full.match(/\b([A-Z]{4}\d{7})\b/g);
  if (containerMatches) {
    containerMatches.forEach(code => {
      if (!seen.has(code)) {
        seen.add(code);
        refs.push({ type: 'container', code, label: `Container ${code}` });
      }
    });
  }

  // Customs Declarations (TZ-XXXXX)
  const declarationMatches = full.match(/\b(TZ-\d{4,8})\b/gi);
  if (declarationMatches) {
    declarationMatches.forEach(code => {
      const upper = code.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        refs.push({ type: 'customs', code: upper, label: `Customs ${upper}` });
      }
    });
  }

  // Invoices (IV-YYYY-XXXX or INV-XXXX)
  const invoiceMatches = full.match(/\b(I(?:NV|V)-\d{4}-\d{3,6}|INV-\d{4,8})\b/gi);
  if (invoiceMatches) {
    invoiceMatches.forEach(code => {
      const upper = code.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        refs.push({ type: 'invoice', code: upper, label: `Invoice ${upper}` });
      }
    });
  }

  return refs;
}

export const EmailMessageViewer: React.FC<EmailMessageViewerProps> = ({
  body,
  subject,
  from,
  attachments = [],
  onNavigate,
}) => {
  const [showQuoted, setShowQuoted] = useState(false);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [calendarAdded, setCalendarAdded] = useState(false);

  // Check if body is HTML
  const isHtml = useMemo(() => {
    return /<[a-z][\s\S]*>/i.test(body);
  }, [body]);

  // Check for remote images
  const hasRemoteImages = useMemo(() => {
    return isHtml && /<img[^>]+src=["']https?:\/\//i.test(body);
  }, [isHtml, body]);

  // Split quoted text for clean readability
  const { main: mainContent, quoted: quotedContent } = useMemo(() => {
    if (isHtml) return { main: body, quoted: null };
    return splitQuotedText(body);
  }, [body, isHtml]);

  // Extract reference codes for quick cross-app jump
  const references = useMemo(() => {
    return extractReferences(body, subject);
  }, [body, subject]);

  // Check for calendar ICS attachment or meeting invite
  const icsAttachment = useMemo(() => {
    return attachments.find(a => a.filename.toLowerCase().endsWith('.ics'));
  }, [attachments]);

  function handleAddToCalendar() {
    addTodo({
      title: `Meeting: ${subject.replace(/^Re:\s*/i, '')}`,
      due: new Date(Date.now() + 86400000).toISOString(),
      subjectType: 'email',
    });
    setCalendarAdded(true);
    showAlert('Meeting added to Calendar & Tasks', { variant: 'success' });
  }

  return (
    <div className="em-message-viewer">
      {/* Remote images privacy banner */}
      {hasRemoteImages && !showRemoteImages && (
        <div className="em-privacy-banner">
          <div className="em-privacy-banner-text">
            <Icon name="shield" size={14} color="var(--blue)" />
            <span>Images are hidden to prevent senders from tracking your open.</span>
          </div>
          <button
            type="button"
            className="em-privacy-banner-btn"
            onClick={() => setShowRemoteImages(true)}
          >
            Show images
          </button>
        </div>
      )}

      {/* Cross-App Reference Quick-Pills */}
      {references.length > 0 && (
        <div className="em-reference-bar">
          <span className="em-reference-bar-lbl">Detected Records:</span>
          {references.map((ref, i) => (
            <button
              key={i}
              type="button"
              className="em-reference-pill"
              onClick={() => {
                if (ref.type === 'invoice' && onNavigate) {
                  onNavigate(`/invoices?q=${encodeURIComponent(ref.code)}`);
                } else if (onNavigate) {
                  onNavigate(`/clearance?q=${encodeURIComponent(ref.code)}`);
                }
              }}
            >
              <Icon
                name={ref.type === 'invoice' ? 'fileText' : ref.type === 'container' ? 'truck' : 'shield'}
                size={12}
              />
              <span>{ref.label}</span>
              <Icon name="arrowRight" size={10} color="var(--ink3)" />
            </button>
          ))}
        </div>
      )}

      {/* Calendar Invitation Card if ICS is present */}
      {icsAttachment && (
        <div className="em-calendar-invite-card">
          <div className="em-calendar-invite-top">
            <div className="em-calendar-invite-icon">
              <Icon name="calendar" size={20} color="var(--teal)" />
            </div>
            <div className="em-calendar-invite-details">
              <div className="em-calendar-invite-title">{subject}</div>
              <div className="em-calendar-invite-meta">
                <span>Invitation from <strong>{from.name || from.email}</strong></span>
                <span>·</span>
                <span>{icsAttachment.filename}</span>
              </div>
            </div>
            <div className="em-calendar-invite-actions">
              {calendarAdded ? (
                <span className="em-calendar-added-badge">
                  <Icon name="check" size={12} /> On Calendar
                </span>
              ) : (
                <button
                  type="button"
                  className="em-calendar-rsvp-btn em-calendar-rsvp-btn--primary"
                  onClick={handleAddToCalendar}
                >
                  <Icon name="plus" size={13} /> Add to Calendar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Email Body Content */}
      <div className="em-message-content">
        {isHtml ? (
          <div
            className={`em-html-rendered${!showRemoteImages ? ' em-html-hide-remote' : ''}`}
            dangerouslySetInnerHTML={{ __html: mainContent }}
          />
        ) : (
          <div className="em-plain-text-body">
            {formatPlainTextWithLinks(mainContent)}
          </div>
        )}
      </div>

      {/* Quoted conversation history / trimmed content toggle */}
      {quotedContent && (
        <div className="em-quoted-section">
          {!showQuoted ? (
            <Tip label="Show trimmed content">
              <button
                type="button"
                className="em-quoted-toggle-btn"
                onClick={() => setShowQuoted(true)}
                aria-label="Show quoted text"
              >
                <span className="em-quoted-dots">···</span>
              </button>
            </Tip>
          ) : (
            <div className="em-quoted-box">
              <div className="em-quoted-header">
                <span className="em-quoted-header-title">Quoted conversation</span>
                <button
                  type="button"
                  className="em-quoted-hide-btn"
                  onClick={() => setShowQuoted(false)}
                >
                  Hide
                </button>
              </div>
              <div className="em-quoted-body">
                {formatPlainTextWithLinks(quotedContent)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
