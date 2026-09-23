import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import './DescribeMessageInput.css';

/**
 * "Describe your message" — a one-line instruction that drafts a full email
 * body via POST /v1/ai/compose-draft (real LLM call, same credential/
 * provider resolution every other AI feature in this app uses — nothing
 * fabricated). Sits above the body field in both Compose and Reply.
 */
export function DescribeMessageInput({ subject, replyContext, onGenerated }: {
  subject?: string;
  replyContext?: string;
  onGenerated: (result: { body: string; subject?: string }) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/ai/compose-draft', {
        method: 'POST',
        body: JSON.stringify({ instruction: text, subject, replyContext }),
      });
      onGenerated({ body: res.body, subject: res.subject });
      setInstruction('');
    } catch (err: any) {
      setError(err?.message || 'Could not generate a draft.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dmi-wrap">
      <div className="dmi-row">
        <Icon name={busy ? 'refresh' : 'sparkle'} size={15} color="var(--teal)" />
        <input
          value={instruction}
          onChange={e => { setInstruction(e.target.value); if (error) setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }}
          placeholder="Describe your message"
          disabled={busy}
        />
        {instruction.trim() && (
          <button type="button" className="dmi-go" onClick={generate} disabled={busy} aria-label="Generate draft">
            <Icon name="arrowUp" size={13} />
          </button>
        )}
      </div>
      {error && <div className="dmi-error">{error}</div>}
    </div>
  );
}
