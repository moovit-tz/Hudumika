import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Banner } from '../../components/ui/alert.js';
import { apiFetch } from '../../lib/api.js';
import type { StepProps } from './types.js';

export function StepPrecheck({ draft, update, onNext, onBack }: StepProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const procedure = draft.procedure;
  if (!procedure) return null;

  const answer = (question: string, value: string) => update({ answers: { ...draft.answers, [question]: value } });

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const result = await apiFetch('/v1/customs/trade-wizard/run', {
        method: 'POST',
        body: JSON.stringify({ procedure_id: procedure!.id, answers: draft.answers }),
      });
      update({ result });
      onNext();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong running the wizard.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={13} /> Back
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{procedure.name}</div>
        {procedure.summary && <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>{procedure.summary}</div>}
      </div>

      {procedure.prechecks.length === 0 ? (
        <div style={{ padding: '16px 0', color: 'var(--ink3)', fontSize: 13 }}>No qualifying questions for this procedure — go straight to the results.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
          {procedure.prechecks.map(q => (
            <div key={q.id}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{q.question}</div>
              {q.help_text && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 8 }}>{q.help_text}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {q.options.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => answer(q.question, o.value)}
                    style={{
                      padding: 'var(--ds-btn-py) 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${draft.answers[q.question] === o.value ? 'var(--teal)' : 'var(--border)'}`,
                      background: draft.answers[q.question] === o.value ? 'var(--teal-l)' : 'var(--white)',
                      color: draft.answers[q.question] === o.value ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <Banner variant="error" className="mb-3.5">{error}</Banner>}

      <button type="button" className="btn btn-primary btn-lg" onClick={run} disabled={running}>
        {running ? 'Checking…' : 'Show me what I need'} <Icon name="arrowRight" size={15} />
      </button>
    </div>
  );
}
