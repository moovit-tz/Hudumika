import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, type IconName } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import './LegalPages.css';

const CATEGORIES = [
  'Billing & Subscription',
  'Account & Login',
  'Shipment & Clearance',
  'Finance & Invoicing',
  'ComplyOS & Compliance',
  'Tracking & Fleet',
  'CRM & Customers',
  'HR & Payroll',
  'Technical / Bug Report',
  'Feature Request',
  'Data Export / Migration',
  'Other',
];

const PRIORITIES: { key: string; color: string; label: string; sub: string }[] = [
  { key: 'low',    color: '#22c55e', label: 'Low',    sub: '5-7 business days' },
  { key: 'medium', color: '#eab308', label: 'Medium', sub: '2-3 business days' },
  { key: 'high',   color: '#f97316', label: 'High',   sub: '24 hours' },
  { key: 'urgent', color: 'var(--red)', label: 'Urgent', sub: '< 4 hours' },
];

const QUICK_LINKS: { icon: IconName; title: string; desc: string; href: string }[] = [
  { icon: 'helpCircle', title: 'Knowledge Base',  desc: 'Step-by-step guides & how-tos',  href: '#' },
  { icon: 'chatBubble',  title: 'Live Chat',        desc: 'Chat with our team in real-time', href: '#' },
  { icon: 'phone', title: 'Call Support',     desc: '+255 22 000 0000 · Mon–Fri 8–6', href: 'tel:+255220000000' },
];

/** Reads a File into just the base64 payload (no `data:mime;base64,` prefix
 *  — the server already knows the mime type from `file.type`). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const SupportTicket: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name:     user?.name  ?? '',
    email:    user?.email ?? '',
    company:  '',
    subject:  '',
    category: '',
    priority: 'medium',
    message:  '',
  });
  const [files, setFiles]       = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [ticketRef, setTicketRef]   = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(prev => [...prev, ...Array.from(e.target.files!)].slice(0, 5));
  };

  const removeFile = (i: number) =>
    setFiles(f => f.filter((_, idx) => idx !== i));

  const canSubmit = form.name && form.email && form.subject && form.category && form.message.length >= 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const attachments = await Promise.all(files.map(async f => ({
        filename: f.name,
        mimeType: f.type || 'application/octet-stream',
        dataBase64: await fileToBase64(f),
      })));
      const res = await apiFetch('/v1/public-support/ticket', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, email: form.email, company: form.company || undefined,
          subject: form.subject, category: form.category, priority: form.priority,
          message: form.message, attachments,
        }),
      });
      setTicketRef(res.ref);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Could not send your message right now. Please try again, or email support@hudumika.tz directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp-page st-page">
      {/* Top bar */}
      <header className="lp-topbar">
        <div className="lp-topbar-inner">
          <button type="button" className="lp-back-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <span className="lp-topbar-brand">Hudumika · Support</span>
          <nav className="lp-topbar-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="st-hero">
        <div className="st-hero-eyebrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Hudumika Support
        </div>
        <h1 className="st-hero-h1">How can we help you?</h1>
        <p className="st-hero-sub">Fill in the form below and our support team will get back to you. For urgent issues, use Live Chat or call us directly.</p>
      </div>

      <div className="st-body">
        {/* Quick links */}
        <div className="st-quick-grid">
          {QUICK_LINKS.map(q => (
            <a key={q.title} href={q.href} className="st-quick-card">
              <div className="st-quick-card-icon"><Icon name={q.icon} size={22} color="#059669" /></div>
              <div className="st-quick-card-title">{q.title}</div>
              <div className="st-quick-card-desc">{q.desc}</div>
            </a>
          ))}
        </div>

        {submitted ? (
          <div className="st-success">
            <div className="st-success-icon"><Icon name="checkCircle" size={40} color="#059669" /></div>
            <div className="st-success-title">Ticket Submitted Successfully</div>
            <div className="st-success-ref">{ticketRef}</div>
            <p className="st-success-body">
              Your support ticket has been received. You will get a confirmation email at <strong>{form.email}</strong> shortly. Our team will respond based on the priority level you selected.
            </p>
            <div className="st-success-actions">
              <button type="button" className="st-btn-primary" onClick={() => { setSubmitted(false); setForm(f => ({ ...f, subject: '', message: '', category: '' })); setFiles([]); }}>
                Submit Another Ticket
              </button>
              <Link to="/" className="st-btn-secondary">Back to Dashboard</Link>
            </div>
          </div>
        ) : (
          <form className="st-form-card" onSubmit={handleSubmit}>
            <div className="st-form-card-head">
              <div className="st-form-card-icon">
                <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <div>
                <div className="st-form-card-title">Create Support Ticket</div>
                <div className="st-form-card-sub">All fields marked <span style={{ color: 'var(--red)' }}>*</span> are required</div>
              </div>
            </div>

            <div className="st-form-body">
              {/* Contact info */}
              <div className="st-field-row">
                <div className="st-field">
                  <label className="st-label">Full Name <span className="st-required">*</span></label>
                  <input className="st-input" type="text" placeholder="Your full name" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
                </div>
                <div className="st-field">
                  <label className="st-label">Email Address <span className="st-required">*</span></label>
                  <input className="st-input" type="email" placeholder="your@email.com" value={form.email} onChange={e => handleChange('email', e.target.value)} required />
                </div>
              </div>

              <div className="st-field">
                <label className="st-label">Company / Organisation</label>
                <input className="st-input" type="text" placeholder="Your company name (optional)" value={form.company} onChange={e => handleChange('company', e.target.value)} />
              </div>

              {/* Ticket details */}
              <div className="st-field-row">
                <div className="st-field">
                  <label className="st-label">Category <span className="st-required">*</span></label>
                  <select className="st-select" value={form.category} onChange={e => handleChange('category', e.target.value)} required>
                    <option value="">Select a category…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="st-field">
                  <label className="st-label">Subject <span className="st-required">*</span></label>
                  <input className="st-input" type="text" placeholder="Brief description of the issue" value={form.subject} onChange={e => handleChange('subject', e.target.value)} maxLength={120} required />
                </div>
              </div>

              {/* Priority */}
              <div className="st-field">
                <label className="st-label">Priority Level <span className="st-required">*</span></label>
                <div className="st-priority-grid">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      className={`st-priority-btn ${form.priority === p.key ? `selected ${p.key}` : ''}`}
                      onClick={() => handleChange('priority', p.key)}
                    >
                      <span className="st-priority-icon"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.color }} /></span>
                      <span style={{ fontWeight: 700 }}>{p.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div className="st-field">
                <label className="st-label">Message <span className="st-required">*</span></label>
                <textarea
                  className="st-textarea"
                  placeholder="Describe your issue in detail. Include any error messages, steps to reproduce, and what you expected to happen…"
                  value={form.message}
                  onChange={e => handleChange('message', e.target.value)}
                  minLength={20}
                  required
                  rows={6}
                />
                <span className="st-input-hint">{form.message.length} characters · minimum 20</span>
              </div>

              {/* File upload */}
              <div className="st-field">
                <label className="st-label">Attachments <span style={{ fontWeight: 400, color: '#64756B' }}>(optional, max 5 files)</span></label>
                <div className="st-upload-zone" onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.xlsx,.csv,.docx,.zip,.txt" onChange={handleFiles} tabIndex={-1} />
                  <div className="st-upload-icon" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="paperclip" size={22} color="#64756B" /></div>
                  <div className="st-upload-label">Click to attach files or drag & drop</div>
                  <div className="st-upload-hint">PDF, PNG, JPG, XLSX, CSV, DOCX, ZIP — max 10 MB each</div>
                  {files.length > 0 && (
                    <div className="st-upload-files" onClick={e => e.stopPropagation()}>
                      {files.map((f, i) => (
                        <div className="st-upload-file-chip" key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="file" size={13} /> {f.name}
                          <button type="button" className="st-upload-file-remove" onClick={() => removeFile(i)} title="Remove">
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {submitError && (
              <div className="st-error-banner">
                <Icon name="alertCircle" size={15} />
                {submitError}
              </div>
            )}

            <div className="st-form-foot">
              <div className="st-form-note">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                Your information is encrypted and handled per our <Link to="/privacy" style={{ color: '#059669' }}>Privacy Policy</Link>
              </div>
              <button type="submit" className="st-submit-btn" disabled={!canSubmit || submitting}>
                {submitting ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.3"/><path d="M21 12a9 9 0 00-9-9"/></svg>
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit Ticket
                    <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span>Copyrights © {new Date().getFullYear()} by <strong>Hudumika LLC</strong>. All rights reserved.</span>
          <nav className="lp-footer-links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/support-ticket">Support</Link>
          </nav>
        </div>
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
