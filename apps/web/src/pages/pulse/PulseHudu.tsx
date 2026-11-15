import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Label } from '../../components/ui/label.js';
import { apiFetch } from '../../lib/api.js';
import { apiError } from './pulseShared.js';
import type { PulseSource } from './pulseFields.js';

/** Hudu writing help. Every result is a suggestion placed in the editor for
 *  the person to change — nothing is sent from here. */

let statusCache: Promise<boolean> | null = null;
function useAiReady() {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    statusCache ??= apiFetch('/v1/pulse/ai/status').then((r: any) => !!r.data.configured).catch(() => false);
    statusCache.then(setReady);
  }, []);
  return ready;
}

function NotReady() {
  return <p className="pulse-muted">Hudu writing help needs AI switched on for this workspace (Admin ▸ Integrations ▸ AI).</p>;
}

async function ask<T>(body: Record<string, unknown>): Promise<T> {
  const r: any = await apiFetch('/v1/pulse/ai', { method: 'POST', body: JSON.stringify(body) });
  return r.data as T;
}

export function SubjectIdeas({ brief, onPick }: { brief: string; onPick: (s: string) => void }) {
  const ready = useAiReady();
  const [ideas, setIdeas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (ready === false) return null;
  return (
    <div className="pulse-hudu">
      <Button variant="outline" size="sm" disabled={busy || !brief.trim() || !ready} onClick={async () => {
        setBusy(true); setErr('');
        try { setIdeas((await ask<{ subjects: string[] }>({ task: 'subjects', brief: brief.replace(/<[^>]+>/g, ' ').slice(0, 4000) })).subjects); }
        catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
      }}><Icon name="sparkle" size={14} /> {busy ? 'Thinking…' : 'Suggest subject lines'}</Button>
      {err && <p className="pulse-note pulse-note-warn">{err}</p>}
      {ideas.length > 0 && (
        <ul className="pulse-ideas">{ideas.map((s) => (
          <li key={s}><Button variant="ghost" size="sm" className="pulse-idea" onClick={() => onPick(s)}>{s}</Button></li>
        ))}</ul>
      )}
    </div>
  );
}

export function DraftWithHudu({ kind, onDraft }: { kind: 'email' | 'sms'; onDraft: (d: { subject?: string; preheader?: string; body_html?: string; body_text?: string }) => void }) {
  const ready = useAiReady();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (ready === false) return <NotReady />;
  if (!open) return <Button variant="outline" size="sm" disabled={!ready} onClick={() => setOpen(true)}><Icon name="sparkle" size={14} /> Draft with Hudu</Button>;
  return (
    <div className="pulse-hudu pulse-hudu-panel">
      <div className="pulse-field">
        <Label htmlFor={`hudu-brief-${kind}`}>What should it say?</Label>
        <Textarea id={`hudu-brief-${kind}`} rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={kind === 'sms' ? 2000 : 4000}
          placeholder={kind === 'sms' ? 'e.g. Remind customers our Arusha warehouse opens Saturdays from next week' : 'e.g. Tell importers about our new weekly Mombasa–Kampala consolidation, link to the booking page'} />
      </div>
      {err && <p className="pulse-note pulse-note-warn">{err}</p>}
      <div className="pulse-actions">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" disabled={busy || brief.trim().length < 3} onClick={async () => {
          setBusy(true); setErr('');
          try { onDraft(await ask({ task: kind, brief })); setOpen(false); }
          catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
        }}>{busy ? 'Writing…' : 'Write draft'}</Button>
      </div>
      <span className="pulse-muted">Replaces what’s in the editor. Check names, prices and dates before sending.</span>
    </div>
  );
}

export function SegmentFromText({ source, onRules }: { source: PulseSource; onRules: (r: { match_type: 'all' | 'any'; rules: any[] }) => void }) {
  const ready = useAiReady();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (ready === false) return null;
  return (
    <div className="pulse-hudu">
      <div className="pulse-field">
        <Label htmlFor="hudu-seg">Describe who you want (Hudu fills in the rules)</Label>
        <div className="pulse-inline">
          <Input id="hudu-seg" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="e.g. Arusha contacts added this year who haven't opened anything in 60 days" />
          <Button variant="outline" disabled={busy || text.trim().length < 3 || !ready} onClick={async () => {
            setBusy(true); setNote('');
            try {
              const r = await ask<{ match_type: 'all' | 'any'; rules: any[]; dropped: number; unsupported: string }>({ task: 'segment', description: text, source });
              if (r.rules.length) onRules(r);
              setNote([!r.rules.length && 'Hudu couldn’t turn that into rules.', r.dropped && `${r.dropped} suggested rule${r.dropped === 1 ? '' : 's'} didn’t fit and were left out.`, r.unsupported && `Not covered: ${r.unsupported}`].filter(Boolean).join(' '));
            } catch (e) { setNote(apiError(e)); } finally { setBusy(false); }
          }}><Icon name="sparkle" size={14} /> {busy ? 'Thinking…' : 'Fill in'}</Button>
        </div>
      </div>
      {note && <p className="pulse-note">{note}</p>}
    </div>
  );
}

export function SendTimeHint({ segmentId }: { segmentId: string | null }) {
  const [d, setD] = useState<{ note: string; best_hour: number | null; timezone: string } | null>(null);
  useEffect(() => {
    setD(null);
    if (!segmentId) return;
    apiFetch(`/v1/pulse/send-time?segment_id=${segmentId}`).then((r: any) => setD(r.data)).catch(() => {});
  }, [segmentId]);
  if (!d) return null;
  return <p className="pulse-muted"><Icon name="clock" size={13} /> {d.note}{d.best_hour != null && ` (${d.timezone})`}</p>;
}
