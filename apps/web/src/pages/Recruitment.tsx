import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface Opening {
  id: string; title: string; department: string | null; location: string | null;
  employment_type: string; status: string; description: string | null;
  openings_count: number; candidate_count?: number; created_by_name?: string | null;
}
interface Candidate {
  id: string; job_opening_id: string; name: string; email: string | null;
  phone: string | null; stage: string; rating: number | null; source: string | null; notes: string | null;
}

const STAGES: { key: string; label: string; color: string; tint: string }[] = [
  { key: 'APPLIED',   label: 'Applied',   color: 'var(--ink3)',   tint: 'var(--bg)' },
  { key: 'SCREENING', label: 'Screening', color: 'var(--blue)',   tint: 'var(--blue-l)' },
  { key: 'INTERVIEW', label: 'Interview', color: 'var(--purple)', tint: 'var(--purple-l)' },
  { key: 'OFFER',     label: 'Offer',     color: 'var(--gold)',   tint: 'var(--gold-l)' },
  { key: 'HIRED',     label: 'Hired',     color: 'var(--green)',  tint: 'var(--green-l)' },
  { key: 'REJECTED',  label: 'Rejected',  color: 'var(--red)',    tint: 'var(--red-l)' },
];
const EMP_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'];
const prettyType = (t: string) => t.replace('_', ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };

export function RecruitmentPage() {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showJob, setShowJob] = useState(false);
  const [showCand, setShowCand] = useState(false);
  const [job, setJob] = useState({ title: '', department: '', location: '', employment_type: 'FULL_TIME', openings_count: '1' });
  const [cand, setCand] = useState({ name: '', email: '', phone: '', source: '' });
  const [busy, setBusy] = useState(false);

  const loadOpenings = useCallback(async () => {
    try {
      const r = await apiFetch('/v1/hr/recruitment/openings');
      const list: Opening[] = Array.isArray(r) ? r : [];
      setOpenings(list);
      setSelId(prev => (prev && list.some(o => o.id === prev)) ? prev : (list[0]?.id ?? null));
    } catch { setOpenings([]); }
  }, []);
  useEffect(() => { loadOpenings(); }, [loadOpenings]);

  const loadCandidates = useCallback(async (id: string) => {
    try { setCandidates(await apiFetch(`/v1/hr/recruitment/openings/${id}/candidates`) ?? []); } catch { setCandidates([]); }
  }, []);
  useEffect(() => { if (selId) loadCandidates(selId); else setCandidates([]); }, [selId, loadCandidates]);

  const opening = openings.find(o => o.id === selId) || null;

  const createJob = async () => {
    if (!job.title.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch('/v1/hr/recruitment/openings', { method: 'POST', body: JSON.stringify({ ...job, openings_count: Number(job.openings_count) || 1 }) });
      setShowJob(false); setJob({ title: '', department: '', location: '', employment_type: 'FULL_TIME', openings_count: '1' });
      await loadOpenings(); if (r?.id) setSelId(r.id);
    } catch (e: any) { alert(e?.message || 'Could not create the opening'); }
    finally { setBusy(false); }
  };
  const addCandidate = async () => {
    if (!cand.name.trim() || !selId) return;
    setBusy(true);
    try {
      await apiFetch('/v1/hr/recruitment/candidates', { method: 'POST', body: JSON.stringify({ job_opening_id: selId, ...cand }) });
      setShowCand(false); setCand({ name: '', email: '', phone: '', source: '' });
      loadCandidates(selId); loadOpenings();
    } catch (e: any) { alert(e?.message || 'Could not add the candidate'); }
    finally { setBusy(false); }
  };
  const moveCandidate = async (id: string, stage: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, stage } : c)); // optimistic
    try { await apiFetch(`/v1/hr/recruitment/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ stage }) }); }
    catch { if (selId) loadCandidates(selId); }
  };

  const stars = (r: number | null) => r == null ? null : (
    <span style={{ color: 'var(--gold)', fontSize: 11, letterSpacing: '1px' }} title={`Rating ${r}/5`}>{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <PageHeader crumbs={['NexusHR', 'Recruitment']} titlePlain="Recruitment" titleEm="pipeline"
        subtitle="Job openings and the candidates moving through each one."
        actions={<button type="button" className="btn btn-primary" onClick={() => setShowJob(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={14} /> New opening</button>}
      />

      {/* New opening — inline form (single step, not a modal wizard) */}
      {showJob && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Job title</label><input style={inp} value={job.title} onChange={e => setJob({ ...job, title: e.target.value })} placeholder="e.g. Logistics Officer" /></div>
          <div><label style={lbl}>Department</label><input style={inp} value={job.department} onChange={e => setJob({ ...job, department: e.target.value })} /></div>
          <div><label style={lbl}>Location</label><input style={inp} value={job.location} onChange={e => setJob({ ...job, location: e.target.value })} /></div>
          <div><label style={lbl}>Type</label>
            <Select value={job.employment_type} onValueChange={v => setJob({ ...job, employment_type: v })}>
              <SelectTrigger style={{ width: '100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>{EMP_TYPES.map(t => <SelectItem key={t} value={t}>{prettyType(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><label style={lbl}>Openings</label><input style={inp} type="number" min="1" value={job.openings_count} onChange={e => setJob({ ...job, openings_count: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !job.title.trim()} style={{ minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} onClick={createJob}>{busy ? 'Saving…' : 'Create'}</button>
            <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} onClick={() => setShowJob(false)}>Cancel</button>
          </div>
        </div>
      )}

      {openings.length === 0 ? (
        <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>No job openings yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Create an opening to start building its candidate pipeline.</div>
        </div>
      ) : (
        <>
          {/* Opening selector + summary + add candidate */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Select value={selId ?? ''} onValueChange={setSelId}>
                <SelectTrigger style={{ width: 280 }}><SelectValue placeholder="Select an opening" /></SelectTrigger>
                <SelectContent>{openings.map(o => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}</SelectContent>
              </Select>
              {opening && (
                <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                  {[prettyType(opening.employment_type), opening.department, opening.location].filter(Boolean).join(' · ')} · {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCand(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }}><Icon name="userPlus" size={14} /> Add candidate</button>
          </div>

          {showCand && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
              <div><label style={lbl}>Name</label><input style={inp} value={cand.name} onChange={e => setCand({ ...cand, name: e.target.value })} placeholder="Candidate name" /></div>
              <div><label style={lbl}>Email</label><input style={inp} value={cand.email} onChange={e => setCand({ ...cand, email: e.target.value })} /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={cand.phone} onChange={e => setCand({ ...cand, phone: e.target.value })} /></div>
              <div><label style={lbl}>Source</label><input style={inp} value={cand.source} onChange={e => setCand({ ...cand, source: e.target.value })} placeholder="LinkedIn, Referral…" /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !cand.name.trim()} style={{ minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} onClick={addCandidate}>{busy ? 'Adding…' : 'Add'}</button>
                <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25 }} onClick={() => setShowCand(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Pipeline board */}
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, flex: 1 }}>
            {STAGES.map(stage => {
              const inStage = candidates.filter(c => c.stage === stage.key);
              return (
                <div key={stage.key} style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: stage.tint, borderTop: `2px solid ${stage.color}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{stage.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, marginLeft: 'auto' }}>{inStage.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                    {inStage.map(c => (
                      <div key={c.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
                          {stars(c.rating)}
                        </div>
                        {(c.email || c.source) && <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || c.source}</div>}
                        <Select value={c.stage} onValueChange={v => moveCandidate(c.id, v)}>
                          <SelectTrigger style={{ width: '100%', height: 30, fontSize: 12 }}><SelectValue /></SelectTrigger>
                          <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ))}
                    {inStage.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink3)', textAlign: 'center', padding: '12px 0' }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
