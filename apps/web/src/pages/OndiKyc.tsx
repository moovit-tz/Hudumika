import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './OndiPages.css';
import { apiFetch, apiFetchRaw } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Spinner } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface KycQueueRow {
  id: string;
  document_type: 'national_id' | 'passport' | 'drivers_license';
  status: string;
  created_at: string;
  extracted_full_name: string | null;
  extracted_dob: string | null;
  extracted_document_number: string | null;
  extracted_nationality: string | null;
  extracted_expiry: string | null;
  mrz_valid: boolean | null;
  user_id: string;
  user_name: string;
  user_email: string;
}

const DOC_LABEL: Record<string, string> = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's License"
};

const DOC_ICON: Record<string, any> = {
  national_id: 'creditCard',
  passport: 'bookOpen',
  drivers_license: 'shield'
};

export const OndiKyc: React.FC = () => {
  const [queue, setQueue] = useState<KycQueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<KycQueueRow | null>(null);
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [docFilter, setDocFilter] = useState('all');
  const [mrzFilter, setMrzFilter] = useState('all');

  const reload = useCallback(() => {
    apiFetch('/v1/ondi/kyc/queue').then(setQueue).catch(() => setQueue([]));
  }, []);
  
  useEffect(() => { reload(); }, [reload]);

  async function loadDocument(id: string) {
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const res = await apiFetchRaw(`/v1/ondi/kyc/${id}/document`);
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      showAlert('Could not load the document image.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleSelectRow(row: KycQueueRow) {
    setSelectedRow(row);
    loadDocument(row.id);
  }

  async function approve(row: KycQueueRow) {
    if (!(await showConfirm(`Approve ${row.user_name}'s ${DOC_LABEL[row.document_type]}? This verifies their identity on Hudumika.`, { confirmLabel: 'Approve' }))) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/ondi/kyc/${row.id}/approve`, { method: 'POST' });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
      if (selectedRow?.id === row.id) {
        setSelectedRow(null);
        setPreviewUrl(null);
      }
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  async function reject(row: KycQueueRow) {
    const reason = window.prompt(`Why is ${row.user_name}'s submission being rejected?`, 'Document image is unclear');
    if (!reason || !reason.trim()) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/v1/ondi/kyc/${row.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      setQueue(prev => prev?.filter(r => r.id !== row.id) ?? null);
      if (selectedRow?.id === row.id) {
        setSelectedRow(null);
        setPreviewUrl(null);
      }
    } catch (err: any) {
      showAlert(err.message);
    } finally { setBusyId(null); }
  }

  const validMrzCount = useMemo(() => queue ? queue.filter(r => r.mrz_valid === true).length : 0, [queue]);
  const invalidMrzCount = useMemo(() => queue ? queue.filter(r => r.mrz_valid === false).length : 0, [queue]);

  const filteredQueue = useMemo(() => {
    if (!queue) return null;
    return queue.filter(r => {
      const matchesSearch = !search.trim() ||
        r.user_name.toLowerCase().includes(search.toLowerCase()) ||
        r.user_email.toLowerCase().includes(search.toLowerCase()) ||
        (r.extracted_full_name && r.extracted_full_name.toLowerCase().includes(search.toLowerCase())) ||
        (r.extracted_document_number && r.extracted_document_number.toLowerCase().includes(search.toLowerCase()));

      const matchesDoc = docFilter === 'all' || r.document_type === docFilter;
      const matchesMrz = mrzFilter === 'all' ||
        (mrzFilter === 'valid' && r.mrz_valid === true) ||
        (mrzFilter === 'invalid' && r.mrz_valid === false);

      return matchesSearch && matchesDoc && matchesMrz;
    });
  }, [queue, search, docFilter, mrzFilter]);

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'KYC Review']}
        titlePlain="Identity"
        titleEm="verification"
        subtitle="Review and process pending personal identity verification submissions across this workspace."
      />

      {/* Executive KPI Bar */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Pending Queue</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fffbeb', color: '#b45309' }}>
              <Icon name="clock" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#b45309' }}>{queue ? queue.length : 0}</span>
            <span className="ondi-kpi-sub">awaiting inspection</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Valid Checksums</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}>
              <Icon name="checkCircle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#047857' }}>{validMrzCount}</span>
            <span className="ondi-kpi-sub">passed MRZ checks</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Flagged / Invalid</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}>
              <Icon name="alertTriangle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#dc2626' }}>{invalidMrzCount}</span>
            <span className="ondi-kpi-sub">mismatch / invalid</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">OCR Inspection Engine</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}>
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--teal)', fontSize: 22 }}>Active</span>
            <span className="ondi-kpi-sub">MRZ 2.0 + Passport OCR</span>
          </div>
        </div>
      </div>

      {/* Main Layout Area */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left Side: Submissions Table */}
        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          <SectionCard padded={false} title={`Submissions Queue${filteredQueue ? ` (${filteredQueue.length})` : ''}`}>
            {/* Filter Toolbar */}
            <div className="ondi-toolbar">
              <div className="ondi-search-input">
                <Icon name="search" size={15} />
                <input
                  type="text"
                  placeholder="Search name, email, doc #..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Select value={docFilter} onValueChange={setDocFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Documents</SelectItem>
                    <SelectItem value="national_id">National ID</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="drivers_license">Driver's License</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={mrzFilter} onValueChange={setMrzFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Checksums</SelectItem>
                    <SelectItem value="valid">Valid MRZ</SelectItem>
                    <SelectItem value="invalid">Invalid / Flagged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table Container */}
            <div style={{ overflowX: 'auto' }}>
              <table className="ondi-table">
                <thead>
                  <tr>
                    <th>Submitted By</th>
                    <th>Document Type</th>
                    <th>MRZ Checksum</th>
                    <th>Date Submitted</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue?.map(row => {
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <tr key={row.id} className={isSelected ? 'selected' : ''}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <PersonAvatar userId={row.user_id} name={row.user_name} size={36} />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{row.user_name}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{row.user_email}</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FeaturedIcon variant="brand" size="sm" shape="square">
                              <Icon name={DOC_ICON[row.document_type] || 'fileText'} size={14} />
                            </FeaturedIcon>
                            <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>
                              {DOC_LABEL[row.document_type]}
                            </span>
                          </div>
                        </td>

                        <td>
                          {row.mrz_valid === null ? (
                            <Badge variant="gray">n/a</Badge>
                          ) : row.mrz_valid ? (
                            <Badge variant="success">
                              <Icon name="checkCircle" size={12} /> Valid MRZ
                            </Badge>
                          ) : (
                            <Badge variant="error">
                              <Icon name="alertTriangle" size={12} /> Invalid MRZ
                            </Badge>
                          )}
                        </td>

                        <td style={{ color: 'var(--ink3)', fontSize: 12 }}>
                          {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleSelectRow(row)}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              borderRadius: 6,
                              padding: '6px 14px',
                              border: isSelected ? '1px solid var(--teal)' : '1px solid var(--border)',
                              cursor: 'pointer',
                              background: isSelected ? 'var(--teal-l)' : 'var(--white)',
                              color: 'var(--teal)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {queue === null && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                <Spinner size={24} thickness={3} style={{ margin: '0 auto 12px' }} />
                <span>Loading queue submissions…</span>
              </div>
            )}

            {filteredQueue?.length === 0 && (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                <Icon name="shield" size={32} style={{ color: 'var(--ink3)', marginBottom: 8, opacity: 0.5 }} />
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No pending identity submissions</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {search || docFilter !== 'all' || mrzFilter !== 'all' ? 'Try adjusting your search or filter criteria.' : 'All user identity verification requests have been reviewed.'}
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right Side: Inspection Pane / Drawer */}
        {selectedRow ? (
          <div className="ondi-drawer" style={{ flex: '0 0 380px', minWidth: 320 }}>
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PersonAvatar userId={selectedRow.user_id} name={selectedRow.user_name} size={40} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{selectedRow.user_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{selectedRow.user_email}</div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedRow(null); setPreviewUrl(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Document Scan Viewbox */}
            <div style={{
              height: 220,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {previewLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Spinner size={28} thickness={3} />
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading scan image...</span>
                </div>
              )}
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="KYC Document"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
                  onClick={() => window.open(previewUrl, '_blank')}
                  title="Click to view full high-res scan in new tab"
                />
              )}
            </div>

            {/* OCR Extracted Data Sheet */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'var(--bg)',
              borderRadius: 10,
              padding: 16,
              border: '1px solid var(--border-soft)',
              fontSize: 12.5
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                OCR Extracted Document Data
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Document Type</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{DOC_LABEL[selectedRow.document_type]}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Extracted Full Name</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>{selectedRow.extracted_full_name || '—'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Date of Birth</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedRow.extracted_dob || '—'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Document Number</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedRow.extracted_document_number || '—'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>MRZ Checksum Result</span>
                <span>
                  {selectedRow.mrz_valid === null ? (
                    <Badge variant="gray">n/a</Badge>
                  ) : selectedRow.mrz_valid ? (
                    <Badge variant="success">Pass</Badge>
                  ) : (
                    <Badge variant="error">Fail</Badge>
                  )}
                </span>
              </div>
            </div>

            {/* Decisions Footer */}
            <div style={{ display: 'flex', gap: 12, marginTop: 'auto', borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => reject(selectedRow)}
                disabled={busyId === selectedRow.id}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: busyId === selectedRow.id ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => approve(selectedRow)}
                disabled={busyId === selectedRow.id}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  background: 'var(--teal)',
                  color: '#fff',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                  opacity: busyId === selectedRow.id ? 0.6 : 1,
                  boxShadow: '0 2px 8px rgba(0, 181, 137, 0.3)',
                  transition: 'all 0.15s ease'
                }}
              >
                Approve Verification
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            flex: '0 0 340px',
            minWidth: 280,
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md, 12px)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 14,
            color: 'var(--ink3)'
          }}>
            <FeaturedIcon variant="brand" size="lg" shape="circle">
              <Icon name="shield" size={24} />
            </FeaturedIcon>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Submission Inspection</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.4 }}>
                Select any submission row from the queue to view high-resolution scan image and extracted OCR metadata.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OndiKyc;

