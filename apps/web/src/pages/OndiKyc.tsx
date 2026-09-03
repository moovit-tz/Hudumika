import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, apiFetchRaw } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

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

const DOC_LABEL: Record<string, string> = { national_id: 'National ID', passport: 'Passport', drivers_license: "Driver's License" };

export const OndiKyc: React.FC = () => {
  const [queue, setQueue] = useState<KycQueueRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<KycQueueRow | null>(null);
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'KYC Review']}
        titlePlain="Identity"
        titleEm="verification"
        subtitle="Pending personal KYC submissions for this workspace."
      />

      <div style={{ display: 'flex', gap: 24, alignItems: 'start', position: 'relative' }}>
        {/* Left Side: Table List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionCard padded={false} title={`Pending review${queue ? ` (${queue.length})` : ''}`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    {['Person', 'Document', 'MRZ Status', 'Submitted', ''].map(h => (
                      <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queue?.map(row => {
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <tr key={row.id} 
                        style={{ 
                          borderTop: '1px solid var(--border)', 
                          background: isSelected ? 'rgba(0,181,137,0.04)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px 14px', color: 'var(--ink)' }}>
                          <div style={{ fontWeight: 600 }}>{row.user_name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{row.user_email}</div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{DOC_LABEL[row.document_type]}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {row.mrz_valid === null ? <span style={{ color: 'var(--ink3)' }}>n/a</span> : (
                            <span style={{
                              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                              background: row.mrz_valid ? '#ecfdf5' : '#fee2e2',
                              color: row.mrz_valid ? '#047857' : '#b91c1c',
                            }}>{row.mrz_valid ? 'Valid MRZ' : 'Invalid MRZ'}</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{new Date(row.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <button type="button" onClick={() => handleSelectRow(row)}
                            style={{ fontSize: 12, fontWeight: 700, borderRadius: 'var(--r-sm, 6px)', padding: '6px 12px', border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--white)', color: 'var(--teal)' }}>
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {queue === null && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading submissions…</div>}
            {queue?.length === 0 && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No pending submissions.</div>}
          </SectionCard>
        </div>

        {/* Right Side: Split Drawer (Visual Verification Pane) */}
        {selectedRow && (
          <div style={{
            width: 420,
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--elev-lg)',
            padding: 20,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            position: 'sticky',
            top: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Review Identity</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{selectedRow.user_name}</div>
              </div>
              <button onClick={() => { setSelectedRow(null); setPreviewUrl(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Document Image Viewbox */}
            <div style={{
              height: 220,
              background: 'var(--bg)',
              border: '1px solid var(--border-soft)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {previewLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div className="spinner" style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTop: '3px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading scan...</span>
                </div>
              )}
              {previewUrl && (
                <img src={previewUrl} alt="KYC Document" style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
                  onClick={() => window.open(previewUrl, '_blank')} />
              )}
            </div>

            {/* OCR Extracted Data Sheet */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border-soft)', fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Document Type</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{DOC_LABEL[selectedRow.document_type]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Extracted Name</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>{selectedRow.extracted_full_name || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Date of Birth</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedRow.extracted_dob || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Document ID #</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{selectedRow.extracted_document_number || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>MRZ Checksum</span>
                <span>
                  {selectedRow.mrz_valid === null ? <span style={{ color: 'var(--ink3)' }}>n/a</span> : (
                    <span style={{ fontWeight: 700, color: selectedRow.mrz_valid ? '#047857' : '#b91c1c' }}>
                      {selectedRow.mrz_valid ? 'Pass' : 'Fail'}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Decisions footer */}
            <div style={{ display: 'flex', gap: 10, marginTop: 'auto', borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
              <button type="button" onClick={() => reject(selectedRow)} disabled={busyId === selectedRow.id}
                style={{ flex: 1, padding: 'var(--ds-btn-py) 12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 'var(--r)', fontWeight: 700, cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', opacity: busyId === selectedRow.id ? 0.6 : 1 }}>
                Reject
              </button>
              <button type="button" onClick={() => approve(selectedRow)} disabled={busyId === selectedRow.id}
                style={{ flex: 1, padding: 'var(--ds-btn-py) 12px', border: 'none', background: 'var(--teal)', color: '#fff', borderRadius: 'var(--r)', fontWeight: 700, cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', opacity: busyId === selectedRow.id ? 0.6 : 1 }}>
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OndiKyc;
