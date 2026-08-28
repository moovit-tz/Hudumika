import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { PageHeader } from '../components/PageHeader.js';
import { PersonLink } from '../components/PersonLink.js';
import { MetricsRow, type MetricCardProps } from '../components/MetricCard.js';
import { DatePicker } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { showAlert } from '../lib/alert.js';

/** Escapes user-supplied text before it's spliced into an HTML template body
 *  — every `{placeholder}` value here comes from a free-text field an admin
 *  types into, and the rendered result is both shown via
 *  `dangerouslySetInnerHTML` and saved as a real .html file. Unescaped, a
 *  value like `<img src=x onerror=...>` executes in the previewer's browser
 *  and persists in the stored document. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Doc {
  id: string;
  name: string;
  type: string;
  status: string;
  storage_key: string;
  created_at: string;
  user_id: string | null;
  person_name: string | null;
  person_email?: string | null;
  signature_status: string | null;
  expiry_date?: string | null;
  approval_status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
  review_notes?: string | null;
  category?: string;
  is_mandatory?: boolean;
  days_until_expiry?: number | null;
}

interface Template {
  id: string;
  name: string;
  type: string;
  country_code: string | null;
  version: number;
  is_active: boolean;
  template_category?: string;
  placeholders?: string;
  body: string;
}

interface Requirement {
  id: string;
  designation: string;
  document_type: string;
  is_required: boolean;
  expiry_warning_days: number;
}

interface ExpiryRadarData {
  total_tracked: number;
  expired_count: number;
  expiring_30_days: number;
  expiring_60_days: number;
  expiring_90_days: number;
  expired_items: Array<{ id: string; name: string; type: string; expiry_date: string; owner_name: string | null; days_overdue: number }>;
  expiring_items: Array<{ id: string; name: string; type: string; expiry_date: string; owner_name: string | null; days_until_expiry: number }>;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card-bg, var(--white))',
  overflow: 'hidden',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
};

const DOC_STATUS: Record<string, 'success' | 'warning' | 'error' | 'brand' | 'gray'> = {
  FILED: 'success',
  SIGNED: 'success',
  ACTIVE: 'success',
  DRAFT: 'gray',
  PENDING_SIGNATURE: 'warning',
  EXPIRED: 'error',
  VOID: 'gray',
};

export function HrDocuments() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'documents' | 'radar' | 'generator' | 'requirements'>('documents');

  const [docs, setDocs] = useState<Doc[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [radar, setRadar] = useState<ExpiryRadarData | null>(null);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; email: string; designation?: string }>>([]);
  const [tenantName, setTenantName] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('__all__');
  const [approvalFilter, setApprovalFilter] = useState('__all__');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('CONTRACT');
  const [uploadCategory, setUploadCategory] = useState('GENERAL');
  const [uploadUserId, setUploadUserId] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading, setUploading] = useState(false);

  const [reviewDoc, setReviewDoc] = useState<Doc | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [genUserId, setGenUserId] = useState('');
  const [genVariables, setGenVariables] = useState<Record<string, string>>({});
  const [genHtmlPreview, setGenHtmlPreview] = useState('');
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [d, t, reqs, rad, emps, me] = await Promise.all([
        apiFetch('/v1/hr/documents'),
        apiFetch('/v1/hr/documents/templates'),
        apiFetch('/v1/hr/document-requirements').catch(() => []),
        apiFetch('/v1/hr/documents/expiry-radar').catch(() => null),
        apiFetch('/v1/hr/employees').catch(() => []),
        apiFetch('/v1/identity/me').catch(() => null),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setTemplates(Array.isArray(t) ? t : []);
      setRequirements(Array.isArray(reqs) ? reqs : []);
      setRadar(rad);
      setEmployees(Array.isArray(emps) ? emps : []);
      setTenantName(me?.tenant?.name ?? '');
    } catch (err: any) {
      setError(err?.message ?? 'Could not load HR documents data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const types = useMemo(() => [...new Set(docs.map(d => d.type))].sort(), [docs]);

  const shownDocs = useMemo(() => {
    return docs.filter(d => {
      if (type !== '__all__' && d.type !== type) return false;
      if (approvalFilter !== '__all__' && d.approval_status !== approvalFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.person_name ?? '').toLowerCase().includes(q) ||
        (d.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [docs, type, approvalFilter, search]);

  const pendingCount = useMemo(() => docs.filter(d => d.approval_status === 'PENDING_APPROVAL').length, [docs]);
  const expiringCount = useMemo(() => docs.filter(d => typeof d.days_until_expiry === 'number' && d.days_until_expiry <= 30).length, [docs]);

  const metrics: MetricCardProps[] = [
    {
      title: 'Total Filed Documents',
      value: String(docs.length),
      sub1Label: 'Attached to staff',
      sub1Value: String(docs.filter(d => d.user_id).length),
      barColor: 'var(--teal)',
      icon: 'fileText',
    },
    {
      title: 'Pending HR Review',
      value: String(pendingCount),
      sub1Label: 'Action Required',
      sub1Value: pendingCount > 0 ? `${pendingCount} files` : 'All verified',
      barColor: pendingCount > 0 ? 'var(--gold)' : 'var(--green)',
      icon: 'clock',
    },
    {
      title: 'Compliance Expiry Radar',
      value: String(expiringCount),
      sub1Label: 'Expired Records',
      sub1Value: String(radar?.expired_count ?? 0),
      barColor: expiringCount > 0 ? 'var(--red)' : 'var(--green)',
      icon: 'shield',
    },
    {
      title: 'Auto Letter Templates',
      value: String(templates.length),
      sub1Label: 'WorkDo Templates',
      sub1Value: 'Offer/NOC/Warning',
      barColor: 'var(--teal)',
      icon: 'edit',
    },
  ];

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      showAlert('Please select a file to upload.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName || uploadFile.name);
      formData.append('type', uploadType);
      formData.append('category', uploadCategory);
      if (uploadUserId) formData.append('user_id', uploadUserId);
      if (uploadExpiry) formData.append('expiry_date', uploadExpiry);

      await apiFetch('/v1/hr/documents/upload', {
        method: 'POST',
        body: formData,
      });

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName('');
      setUploadExpiry('');
      loadData();
    } catch (err: any) {
      showAlert(err?.message ?? 'Failed to upload document.', { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleReviewSubmit = async (approval_status: 'APPROVED' | 'REJECTED') => {
    if (!reviewDoc) return;
    setReviewing(true);
    try {
      await apiFetch(`/v1/hr/documents/${reviewDoc.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          approval_status,
          review_notes: reviewNotes,
        }),
      });
      setReviewDoc(null);
      setReviewNotes('');
      loadData();
    } catch (err: any) {
      showAlert(err?.message ?? 'Failed to update review status.', { variant: 'error' });
    } finally {
      setReviewing(false);
    }
  };

  const handleSelectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    let defaultVars: Record<string, string> = {};
    try {
      const parsed = typeof t.placeholders === 'string' ? JSON.parse(t.placeholders) : t.placeholders;
      if (Array.isArray(parsed)) {
        parsed.forEach((p: string) => {
          defaultVars[p] = '';
        });
      }
    } catch {}
    setGenVariables(defaultVars);
    updatePreview(t, defaultVars, genUserId);
  };

  const updatePreview = (t: Template, vars: Record<string, string>, targetUserId: string) => {
    let body = t.body;
    const emp = employees.find(e => e.id === targetUserId);
    // Smart defaults, then a real typed value (not just "the key is present" —
    // every placeholder is pre-seeded as '' on template select, so spreading
    // `vars` unconditionally overwrote every one of these defaults back to
    // blank even when a real employee/date/tenant value was already known).
    const defaults: Record<string, string> = {
      '{employee_name}': emp ? emp.name : '',
      '{tenant_name}': tenantName,
      '{joining_date}': new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    };
    const merged = { ...defaults };
    for (const [k, v] of Object.entries(vars)) {
      if (v) merged[k] = v;
    }
    for (const [k, v] of Object.entries(merged)) {
      body = body.split(k).join(v ? escapeHtml(v) : `<span style="color:var(--teal); font-weight:bold;">${k}</span>`);
    }
    setGenHtmlPreview(body);
  };

  const handleGenerateLetter = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const res = await apiFetch('/v1/hr/documents/generate-letter', {
        method: 'POST',
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          user_id: genUserId || null,
          variables: genVariables,
        }),
      });
      showAlert(`Letter "${res.document.name}" generated and saved successfully!`, { variant: 'success' });
      setSelectedTemplate(null);
      loadData();
    } catch (err: any) {
      showAlert(err?.message ?? 'Failed to generate letter.', { variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div style={{ padding: 30, color: 'var(--ink3)' }}>Loading NexusHR documents suite…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
      <PageHeader
        crumbs={['NexusHR', 'Documents']}
        titlePlain="HR"
        titleEm="documents"
        subtitle="Automated letter generators, verification approval queue, compliance expiry radar, and mandatory document rules."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('generator')}
              style={{ height: 38, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="edit" size={14} color="var(--teal)" />
              Generate HR Letter
            </Button>
            <Button
              size="sm"
              onClick={() => setShowUploadModal(true)}
              style={{ height: 38, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={14} />
              Upload Document
            </Button>
          </div>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <MetricsRow cards={metrics} />

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 4 }}>
        {[
          { key: 'documents', label: 'Filed Documents', icon: 'fileText', badge: docs.length },
          { key: 'radar', label: 'Compliance & Expiry Radar', icon: 'shield', badge: expiringCount > 0 ? expiringCount : undefined, badgeColor: 'var(--red)' },
          { key: 'generator', label: 'Automated Letter Generator', icon: 'edit', badge: templates.length },
          { key: 'requirements', label: 'Document Requirements Rules', icon: 'checkCircle' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? 'hsl(var(--primary))' : 'var(--ink2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name={tab.icon as any} size={15} color={activeTab === tab.key ? 'hsl(var(--primary))' : 'var(--ink3)'} />
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: tab.badgeColor ? 'var(--red-l)' : 'var(--teal-l)',
                  color: tab.badgeColor ? 'var(--red)' : 'var(--teal)',
                  padding: '2px 7px',
                  borderRadius: 12,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: FILED DOCUMENTS */}
      {activeTab === 'documents' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 260, flex: '0 1 340px' }}>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by document name, category, or employee…" />
            </div>
            <SingleSelectFilter
              label="Document Type"
              value={type}
              onChange={v => setType(v ?? '__all__')}
              options={[{ value: '__all__', label: 'All types' }, ...types.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))]}
            />
            <SingleSelectFilter
              label="Approval Status"
              value={approvalFilter}
              onChange={v => setApprovalFilter(v ?? '__all__')}
              options={[
                { value: '__all__', label: 'All statuses' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'PENDING_APPROVAL', label: 'Pending Review' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
            />
          </div>

          <div style={cardStyle}>
            {shownDocs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <FeaturedIcon variant="gray" size="lg" shape="circle"><Icon name="fileText" size={22} /></FeaturedIcon>
                <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 12 }}>No documents match the current filter.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      {['Document', 'Employee / Owner', 'Category', 'HR Verification', 'Expiry Date', 'eSign Status', 'Actions'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', ...labelStyle }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownDocs.map(d => (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FeaturedIcon variant="gray" size="sm" shape="square"><Icon name="file" size={13} /></FeaturedIcon>
                            <div>
                              <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{d.type.replace(/_/g, ' ')}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {d.person_name ? (
                            <PersonLink userId={d.user_id} name={d.person_name} size={24} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--gold)', background: 'var(--gold-l)', padding: '2px 8px', borderRadius: 10 }}>
                              Unattached Policy
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6 }}>
                            {d.category || 'GENERAL'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {d.approval_status === 'APPROVED' ? (
                            <Badge variant="success">Verified</Badge>
                          ) : d.approval_status === 'REJECTED' ? (
                            <Badge variant="error">Rejected</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReviewDoc(d)}
                              style={{
                                background: 'var(--gold-l)',
                                color: 'var(--gold)',
                                border: '1px solid var(--gold-m)',
                                padding: '3px 10px',
                                borderRadius: 12,
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Review File
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {d.expiry_date ? (
                            <div>
                              <div style={{ fontWeight: 600, color: typeof d.days_until_expiry === 'number' && d.days_until_expiry <= 30 ? 'var(--red)' : 'var(--ink)' }}>
                                {String(d.expiry_date).slice(0, 10)}
                              </div>
                              {typeof d.days_until_expiry === 'number' && d.days_until_expiry <= 30 && (
                                <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>
                                  {d.days_until_expiry <= 0 ? 'EXPIRED' : `Expires in ${d.days_until_expiry}d`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink3)', fontSize: 12 }}>No expiry</span>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {d.signature_status ? (
                            <Badge variant={d.signature_status === 'COMPLETED' ? 'success' : 'warning'}>
                              {d.signature_status.toLowerCase()}
                            </Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigate('/sign/editor/new')}
                              style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
                            >
                              Send for eSign
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => apiDownload(`/v1/hr/documents/${d.id}/download`, d.name)}
                            style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
                          >
                            <Icon name="download" size={12} /> Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPLIANCE & EXPIRY RADAR */}
      {activeTab === 'radar' && radar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ ...cardStyle, padding: 18, borderLeft: '4px solid var(--red)' }}>
              <div style={labelStyle}>Expired Documents</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--red)', marginTop: 4 }}>{radar.expired_count}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Immediate renewal required</div>
            </div>
            <div style={{ ...cardStyle, padding: 18, borderLeft: '4px solid var(--gold)' }}>
              <div style={labelStyle}>Expiring &lt; 30 Days</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', marginTop: 4 }}>{radar.expiring_30_days}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>High urgency notice sent</div>
            </div>
            <div style={{ ...cardStyle, padding: 18, borderLeft: '4px solid var(--teal)' }}>
              <div style={labelStyle}>Expiring 31-60 Days</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>{radar.expiring_60_days}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Prepare renewal paperwork</div>
            </div>
            <div style={{ ...cardStyle, padding: 18, borderLeft: '4px solid hsl(var(--primary))' }}>
              <div style={labelStyle}>Total Monitored Files</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'hsl(var(--primary))', marginTop: 4 }}>{radar.total_tracked}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Passports, Visas &amp; Licenses</div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              Expiry Radar Watchlist
            </div>
            {radar.expiring_items.length === 0 && radar.expired_items.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                <Icon name="checkCircle" size={24} color="var(--green)" />
                <div style={{ marginTop: 8 }}>All staff identity documents, visas, and licenses are fully compliant and up to date.</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['Employee', 'Document Name', 'Type', 'Expiry Date', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', ...labelStyle }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {radar.expired_items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border)', background: 'var(--red-l)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{item.owner_name ?? 'Unattached'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--red)' }}>{item.name}</td>
                      <td style={{ padding: '10px 14px' }}>{item.type}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--red)' }}>{String(item.expiry_date).slice(0, 10)}</td>
                      <td style={{ padding: '10px 14px' }}><Badge variant="error">EXPIRED ({item.days_overdue}d ago)</Badge></td>
                      <td style={{ padding: '10px 14px' }}>
                        <Button size="sm" style={{ height: 28, fontSize: 11, background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => setShowUploadModal(true)}>
                          Request Renewal
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {radar.expiring_items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{item.owner_name ?? 'Unattached'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{item.name}</td>
                      <td style={{ padding: '10px 14px' }}>{item.type}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{String(item.expiry_date).slice(0, 10)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <Badge variant={item.days_until_expiry <= 30 ? 'warning' : 'brand'}>
                          Expires in {item.days_until_expiry} days
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <Button variant="outline" size="sm" style={{ height: 28, fontSize: 11 }} onClick={() => setShowUploadModal(true)}>
                          Upload Renewal
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATED LETTER GENERATOR */}
      {activeTab === 'generator' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedTemplate ? '380px 1fr' : '1fr', gap: 20 }}>
          {/* Template Selection Cards */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14 }}>
              Select a pre-formatted WorkDo HR letter template to generate official documents with dynamic employee tokens:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: selectedTemplate ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  style={{
                    ...cardStyle,
                    padding: 16,
                    cursor: 'pointer',
                    borderColor: selectedTemplate?.id === t.id ? 'hsl(var(--primary))' : 'var(--border)',
                    boxShadow: selectedTemplate?.id === t.id ? '0 0 0 2px hsl(var(--primary))' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="edit" size={16} /></FeaturedIcon>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t.name}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
                    Category: <strong>{t.template_category ?? t.type}</strong>
                  </div>
                  <Button size="sm" variant={selectedTemplate?.id === t.id ? 'default' : 'outline'} style={{ width: '100%', height: 32, fontSize: 12 }}>
                    {selectedTemplate?.id === t.id ? 'Currently Editing' : 'Use Template'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Generation & Live Preview Workspace */}
          {selectedTemplate && (
            <div style={{ ...cardStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'hsl(var(--primary))' }}>{selectedTemplate.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Fill in variables below for instant live HTML/PDF generation</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>Close Generator</Button>
              </div>

              {/* Form Inputs for Dynamic Tokens */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--ink)' }}>Target Employee</label>
                  <Combobox
                    options={employees.map(emp => ({ value: emp.id, label: emp.name, sublabel: emp.email }))}
                    value={genUserId}
                    onChange={v => {
                      setGenUserId(v);
                      updatePreview(selectedTemplate, genVariables, v);
                    }}
                    placeholder="Select employee…"
                    searchPlaceholder="Search staff…"
                    emptyText="No matching staff."
                  />
                </div>

                {Object.keys(genVariables).map(k => (
                  <div key={k}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--ink)' }}>{k}</label>
                    <Input
                      value={genVariables[k] ?? ''}
                      onChange={e => {
                        const updated = { ...genVariables, [k]: e.target.value };
                        setGenVariables(updated);
                        updatePreview(selectedTemplate, updated, genUserId);
                      }}
                      placeholder={`Enter ${k}`}
                    />
                  </div>
                ))}
              </div>

              {/* Live Render Preview Paper */}
              <div>
                <div style={labelStyle}>Document Live Output Preview</div>
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 24,
                    minHeight: 280,
                    boxShadow: 'var(--elev-md)',
                    marginTop: 8,
                  }}
                  dangerouslySetInnerHTML={{ __html: genHtmlPreview }}
                />
              </div>

              {/* Submit & Dispatch Button */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10 }}>
                <Button
                  onClick={handleGenerateLetter}
                  disabled={generating}
                  style={{ height: 38, fontSize: 13, fontWeight: 700 }}
                >
                  <Icon name="checkCircle" size={15} />
                  {generating ? 'Generating Letter…' : 'Issue & File HR Document'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DOCUMENT REQUIREMENTS */}
      {activeTab === 'requirements' && (
        <div style={cardStyle}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Mandatory Employee Document Requirements</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Designation-based document checklist enforced across onboarding &amp; personnel files</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Designation / Group', 'Document Type', 'Requirement Status', 'Expiry Warning Window'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', ...labelStyle }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requirements.map(req => (
                <tr key={req.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{req.designation}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--teal)' }}>{req.document_type.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge variant={req.is_required ? 'brand' : 'gray'}>
                      {req.is_required ? 'Mandatory Onboarding' : 'Optional File'}
                    </Badge>
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>
                    {req.expiry_warning_days > 0 ? `${req.expiry_warning_days} Days Before Expiry` : 'No Warning Window'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: Upload Document Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-115">
          <DialogHeader><DialogTitle>Upload HR Document</DialogTitle></DialogHeader>
          <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Document File *</label>
              <input type="file" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} required style={{ fontSize: 12.5 }} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Document Title</label>
              <Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. Passport Copy 2026" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Category</label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL_ID">Personal ID / Passport</SelectItem>
                    <SelectItem value="QUALIFICATION">Degree / Certificate</SelectItem>
                    <SelectItem value="CONTRACT">Employment Contract</SelectItem>
                    <SelectItem value="WORK_PERMIT">Work Permit / Visa</SelectItem>
                    <SelectItem value="GENERAL">General Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Type</label>
                <Input value={uploadType} onChange={e => setUploadType(e.target.value)} placeholder="CONTRACT / ID_SCAN" />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Assign Employee Owner</label>
              <Combobox
                options={employees.map(emp => ({ value: emp.id, label: emp.name, sublabel: emp.email }))}
                value={uploadUserId}
                onChange={setUploadUserId}
                placeholder="Unattached (Organization Policy)"
                searchPlaceholder="Search staff…"
                emptyText="No matching staff."
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Expiry Date (Optional)</label>
              <DatePicker
                date={uploadExpiry ? new Date(uploadExpiry) : undefined}
                onChange={d => setUploadExpiry(d ? d.toISOString().slice(0, 10) : '')}
                placeholder="Select expiration date"
                triggerClassName="w-full"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowUploadModal(false)}>Cancel</Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload & Submit for Review'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: HR Review Approval Modal */}
      <Dialog open={!!reviewDoc} onOpenChange={o => !o && setReviewDoc(null)}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader><DialogTitle>HR Document Verification Review</DialogTitle></DialogHeader>
          {reviewDoc && (
            <>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                Reviewing file: <strong>{reviewDoc.name}</strong> uploaded for <strong>{reviewDoc.person_name ?? 'Unattached'}</strong>.
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Review Feedback / Verification Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Document verified against National Identification database."
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none' }}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleReviewSubmit('REJECTED')}
                  disabled={reviewing}
                  style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                >
                  Reject Document
                </Button>
                <Button
                  onClick={() => handleReviewSubmit('APPROVED')}
                  disabled={reviewing}
                >
                  Approve &amp; Verify
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
