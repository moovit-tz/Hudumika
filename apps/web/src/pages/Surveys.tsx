import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

/**
 * Employee surveys — pulse checks, engagement, exit/onboarding feedback.
 *
 * The backend (hr_survey_templates/instances/responses) predates this page
 * by a while: GET /v1/hr/surveys and POST /v1/hr/surveys/:id/submit already
 * worked, but nothing could ever create a survey, so nothing was ever there
 * to answer. This adds the authoring half (create-and-launch in one step)
 * and the answering/results views on top of the same real tables.
 */

type QuestionType = 'rating' | 'text' | 'choice';
interface Question { text: string; type: QuestionType; options?: string[] }
interface SurveyInstance {
  id: string; status: string; ends_at: string | null; created_at: string;
  title: string; description: string | null; questions: Question[]; is_anonymous: boolean;
  response_count: number; already_responded: boolean;
}

const MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export function Surveys() {
  const { user } = useAuth();
  const canManage = !!user && MGMT_ROLES.includes(user.role);
  const [surveys, setSurveys] = useState<SurveyInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [answering, setAnswering] = useState<SurveyInstance | null>(null);
  const [results, setResults] = useState<any | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/hr/surveys')
      .then((r: any) => setSurveys(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function closeSurvey(s: SurveyInstance) {
    const ok = await showConfirm(`Close "${s.title}"? No one will be able to respond after this.`,
      { title: 'Close survey?', confirmLabel: 'Close survey' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/hr/surveys/${s.id}/close`, { method: 'PATCH' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not close that survey.', { variant: 'error' });
    }
  }

  async function viewResults(s: SurveyInstance) {
    try {
      setResults(await apiFetch(`/v1/hr/surveys/${s.id}/results`));
    } catch (err: any) {
      showAlert(err.message || 'Could not load results.', { variant: 'error' });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        crumbs={['NexusHR', 'Surveys']}
        titlePlain="Employee"
        titleEm="surveys"
        subtitle="Pulse checks and feedback — anonymous by default, always aggregate-only in results."
        actions={canManage ? <Button onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> New survey</Button> : undefined}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading surveys…</div>
      ) : surveys.length === 0 ? (
        <SectionCard>
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>
            No surveys yet.{canManage ? ' Create the first one to hear from your team.' : ''}
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {surveys.map(s => (
            <SectionCard key={s.id}>
              <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 240, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{s.title}</span>
                    <Badge variant={s.status === 'OPEN' ? 'success' : 'gray'}>{s.status === 'OPEN' ? 'Open' : 'Closed'}</Badge>
                    {s.is_anonymous && <Badge variant="info">Anonymous</Badge>}
                  </div>
                  {s.description && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{s.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 6 }}>
                    {s.response_count} response{s.response_count === 1 ? '' : 's'}
                    {s.ends_at && ` · ends ${new Date(s.ends_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {s.status === 'OPEN' && !s.already_responded && (
                    <Button size="sm" onClick={() => setAnswering(s)}>Respond</Button>
                  )}
                  {s.already_responded && <Badge variant="success">You responded</Badge>}
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => viewResults(s)}>Results</Button>
                      {s.status === 'OPEN' && <Button size="sm" variant="outline" onClick={() => closeSurvey(s)}>Close</Button>}
                    </>
                  )}
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {showNew && <NewSurveyModal onClose={() => setShowNew(false)} onCreated={load} />}
      {answering && <AnswerModal survey={answering} onClose={() => setAnswering(null)} onSubmitted={() => { setAnswering(null); load(); }} />}
      {results && <ResultsModal results={results} onClose={() => setResults(null)} />}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', borderRadius: 12, padding: 24, width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--elev-lg)' };

function NewSurveyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [endsAt, setEndsAt] = useState('');
  const [questions, setQuestions] = useState<Question[]>([{ text: '', type: 'rating' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateQuestion(i: number, patch: Partial<Question>) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanQuestions = questions
      .map(q => ({ ...q, text: q.text.trim() }))
      .filter(q => q.text);
    if (!title.trim() || cleanQuestions.length === 0) {
      setError('A title and at least one question are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/hr/surveys', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), description: description.trim() || undefined,
          is_anonymous: isAnonymous, ends_at: endsAt || undefined,
          questions: cleanQuestions.map(q => ({
            text: q.text, type: q.type,
            options: q.type === 'choice' ? (q.options ?? []) : undefined,
          })),
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not create that survey.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={cardStyle} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>New survey</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q3 engagement pulse" required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Description (optional)</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Ends (optional)</label>
              <DatePicker date={parseDateOnly(endsAt)} onChange={d => setEndsAt(toDateOnlyString(d))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)', paddingTop: 22 }}>
              <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
              Anonymous responses
            </label>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Questions</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {questions.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Input
                    value={q.text}
                    onChange={e => updateQuestion(i, { text: e.target.value })}
                    placeholder={`Question ${i + 1}`}
                    style={{ flex: 1 }}
                  />
                  <Select value={q.type} onValueChange={(v: QuestionType) => updateQuestion(i, { type: v })}>
                    <SelectTrigger style={{ width: 110 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating">Rating</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="choice">Choice</SelectItem>
                    </SelectContent>
                  </Select>
                  <button type="button" onClick={() => setQuestions(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 6 }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              ))}
              {questions.some(q => q.type === 'choice') && questions.map((q, i) => q.type === 'choice' ? (
                <Input
                  key={`opts-${i}`}
                  value={(q.options ?? []).join(', ')}
                  onChange={e => updateQuestion(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder={`Options for "${q.text || `question ${i + 1}`}", comma-separated`}
                />
              ) : null)}
            </div>
            <button type="button" onClick={() => setQuestions(prev => [...prev, { text: '', type: 'rating' }])}
              style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
              + Add question
            </button>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Launching…' : 'Launch survey'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AnswerModal({ survey, onClose, onSubmitted }: { survey: SurveyInstance; onClose: () => void; onSubmitted: () => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = survey.questions.map((q, i) => ({ question: q.text, answer: answers[i] ?? '' }));
      await apiFetch(`/v1/hr/surveys/${survey.id}/submit`, { method: 'POST', body: JSON.stringify(payload) });
      onSubmitted();
    } catch (err: any) {
      setError(err.message || 'Could not submit your response.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form style={cardStyle} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{survey.title}</div>
        {survey.is_anonymous && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>Your response is anonymous — nothing links it back to your account.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {survey.questions.map((q, i) => (
            <div key={i}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>{q.text}</label>
              {q.type === 'rating' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [i]: String(n) }))}
                      style={{
                        width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
                        background: answers[i] === String(n) ? 'hsl(var(--primary))' : 'var(--bg)',
                        color: answers[i] === String(n) ? 'hsl(var(--primary-foreground))' : 'var(--ink)',
                        fontWeight: 700, fontSize: 13,
                      }}>{n}</button>
                  ))}
                </div>
              ) : q.type === 'choice' ? (
                <Select value={answers[i] ?? ''} onValueChange={v => setAnswers(a => ({ ...a, [i]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>
                    {(q.options ?? []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Textarea value={answers[i] ?? ''} onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))} rows={2} />
              )}
            </div>
          ))}
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit response'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResultsModal({ results, onClose }: { results: any; onClose: () => void }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{results.title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
          {results.response_count} response{results.response_count === 1 ? '' : 's'}
          {results.is_anonymous ? ' · anonymous — no respondent names are recorded' : ''}
        </div>
        {results.answers.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, padding: '16px 0' }}>No responses yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.answers.map((r: any, i: number) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 6 }}>
                  {r.respondent ?? 'Anonymous'} · {new Date(r.created_at).toLocaleString()}
                </div>
                {(Array.isArray(r.answers) ? r.answers : []).map((a: any, j: number) => (
                  <div key={j} style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 3 }}>
                    <strong>{a.question}:</strong> {a.answer || '—'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export default Surveys;
