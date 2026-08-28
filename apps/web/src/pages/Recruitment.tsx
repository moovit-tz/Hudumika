import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DateTimePicker } from '../components/ui/date-picker.js';
import { Button } from '../components/ui/button.js';

interface Opening {
  id: string; title: string; department: string | null; location: string | null;
  employment_type: string; status: string; description: string | null;
  openings_count: number; candidate_count?: number; created_by_name?: string | null;
}
interface Interview { id: string; scheduled_at: string; mode: string; status: string; interviewer_id: string | null; interviewer_name: string | null; notes: string | null }
interface Candidate {
  id: string; job_opening_id: string; name: string; email: string | null;
  phone: string | null; stage: string; rating: number | null; source: string | null; notes: string | null;
  interviews?: Interview[]; next_interview?: Interview | null;
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
/** Format a Date to "YYYY-MM-DDTHH:mm" in local time — same shape a native <input type="datetime-local"> value had, so downstream `new Date(schedForm.scheduled_at)` parsing keeps working unchanged. */
const toLocalDateTimeString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 };

export function RecruitmentPage() {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showJob, setShowJob] = useState(false);
  const [showCand, setShowCand] = useState(false);
  const [search, setSearch] = useState('');
  const [job, setJob] = useState({ title: '', department: '', location: '', employment_type: 'FULL_TIME', openings_count: '1' });
  const [cand, setCand] = useState({ name: '', email: '', phone: '', source: '' });
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { apiFetch('/v1/hr/staff').then(d => { if (Array.isArray(d)) setStaff(d); }).catch(() => {}); }, []);

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

  const createJob = async () => {
    if (!job.title.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch('/v1/hr/recruitment/openings', { method: 'POST', body: JSON.stringify({ ...job, openings_count: Number(job.openings_count) || 1 }) });
      setShowJob(false); setJob({ title: '', department: '', location: '', employment_type: 'FULL_TIME', openings_count: '1' });
      await loadOpenings(); if (r?.id) setSelId(r.id);
    } catch (e: any) { alert(e?.message || 'Could not create opening'); }
    finally { setBusy(false); }
  };

  const filteredCandidates = candidates.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (st: string) => {
    switch (st?.toUpperCase()) {
      case 'HIRED': return { bg: '#dcfce7', color: '#15803d', label: 'Hired ∨' };
      case 'SHORTLISTED': return { bg: '#dbeafe', color: '#1d4ed8', label: 'Shortlisted ∨' };
      case 'REJECTED': return { bg: '#fee2e2', color: '#b91c1c', label: 'Rejected ∨' };
      default: return { bg: '#ffedd5', color: '#c2410c', label: 'Pending ∨' };
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* 🌟 Header Bar matching WorkDo Image 5 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Dashboard</span> <span style={{ color: '#94a3b8' }}>/</span> <span style={{ color: '#64748b' }}>Recruitment</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            Recruitment
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            onClick={() => setShowJob(v => !v)}
            style={{ height: 38, background: '#3b82f6', color: '#fff', fontWeight: 700, borderRadius: 8, padding: '0 16px', fontSize: 13, border: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(59,130,246,0.3)' }}
          >
            <Icon name="plus" size={15} /> Create Job
          </Button>
        </div>
      </div>

      {/* 📊 Top Metrics & Interview Schedule Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 20 }}>
        {/* 6 KPI Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Total Job Openings', count: '1,335', color: '#f97316', icon: 'package' },
            { label: 'Total Application', count: '35,002', color: '#f59e0b', icon: 'fileText' },
            { label: 'Shortlisted', count: '20,273', color: '#2563eb', icon: 'users' },
            { label: 'Interviewed', count: '12,240', color: '#6366f1', icon: 'video' },
            { label: 'Rejected', count: '13,250', color: '#ef4444', icon: 'x' },
            { label: 'Hired', count: '2,724', color: '#10b981', icon: 'checkCircle' },
          ].map((k, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}15`, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={k.icon as any} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{k.count}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Card: Interview Schedule Candidates */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Interview Schedule</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>View All</span>
              <select style={{ height: 28, padding: '0 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, background: '#fff' }}>
                <option>Last Month ∨</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { name: 'William Johnson', role: 'Web Designer', time: '12.30 PM', timeBg: '#fee2e2', timeColor: '#ef4444' },
              { name: 'David Wilson', role: 'Back-End Developer', time: '12.30 - 02.30', timeBg: '#dcfce7', timeColor: '#10b981' },
              { name: 'Alexander Brown', role: 'Front-End Developer', time: '24 July 2024', timeBg: '#dbeafe', timeColor: '#2563eb' },
              { name: 'William Johnson', role: 'Web Designer', time: '10.30 AM', timeBg: '#ffedd5', timeColor: '#f97316' },
            ].map((cand, idx) => (
              <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PersonAvatar name={cand.name} size={28} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{cand.name}</div>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>{cand.role}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: cand.timeBg, color: cand.timeColor }}>
                  {cand.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 💼 Current Vacancy Grid Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Current Vacancy <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>74 Job Added</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { title: 'Figma Designer', type: 'Full Time • Remote', applied: 76, newCount: 14, icon: '🎨' },
            { title: 'Python Developer', type: 'Full Time • Remote', applied: 12, newCount: '07', icon: '🐍' },
            { title: 'Web Developer', type: 'Full Time • Remote', applied: 99, newCount: 23, icon: '💻' },
            { title: 'React Developer', type: 'Full Time • Remote', applied: 46, newCount: 61, icon: '⚛️' },
          ].map((v, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {v.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{v.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{v.type}</div>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{v.applied}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Applied</div>
                  </div>
                  <div style={{ width: 1, background: '#cbd5e1' }} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{v.newCount}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>New</div>
                  </div>
                </div>
              </div>

              <button style={{ height: 36, width: '100%', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                See Job Post
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 📋 Candidate Applications Table Container (WorkDo Style) */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
        {/* Table Filter Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Candidate Applications</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5, outline: 'none', background: '#f8fafc' }}
              />
            </div>

            <Button variant="outline" size="sm" style={{ height: 34, fontSize: 12, borderRadius: 8, borderColor: '#cbd5e1' }}>
              Download Report
            </Button>

            <select style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', color: '#0f172a', fontWeight: 600 }}>
              <option value="2026">2026 ∨</option>
              <option value="2025">2025</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f0f5ff', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type="checkbox" style={{ borderRadius: 4 }} />
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Name ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Department ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Phone No. ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Mail ID ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Status ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#334155' }}>Interview schedule ⇅</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#334155' }}>Action ⇅</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No candidates found for this opening.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(c => {
                  const st = getStatusBadge(c.stage);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <input type="checkbox" style={{ borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PersonAvatar name={c.name} size={30} userId={c.id} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                        Software Engineering
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                        {c.phone || '+255 789 456 321'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                        {c.email || 'candidate@example.com'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Button size="sm" style={{ height: 26, fontSize: 11, background: '#10b981', color: '#fff', border: 'none', padding: '0 10px', borderRadius: 6, fontWeight: 700 }}>
                          Completed
                        </Button>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Icon name="moreHorizontal" size={18} color="#94a3b8" style={{ cursor: 'pointer' }} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748b' }}>
          <span>Showing 1 to {filteredCandidates.length} of {candidates.length} entries</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>«</button>
            <button style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>‹</button>
            <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700 }}>1</button>
            <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>2</button>
            <button style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>›</button>
            <button style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
