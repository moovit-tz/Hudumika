import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { BASE_URL } from '../lib/api.js';

const TEMPLATE_COLUMNS = ['company_name', 'email', 'phone', 'country', 'address', 'currency'];

interface ImportSummary {
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

function downloadCsvTemplate() {
  const csv = TEMPLATE_COLUMNS.join(',') + '\n' + 'Acme Freight Ltd,ops@acmefreight.co.tz,+255700000000,TZ,"Dar es Salaam, Tanzania",TZS\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'customer-import-template.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export const CustomerBulkUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const token = localStorage.getItem('hudumika_token');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE_URL}/v1/customers/bulk-import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setSummary(json.data);
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Link
          to="/customers/overview"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}
        >
          <Icon name="chevronLeft" size={13} /> Back
        </Link>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Bulk Upload Clients</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Import multiple clients at once using a CSV file</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Template download */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="file" size={18} color="var(--green)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Download Template</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Use our template to ensure your data is formatted correctly</div>
            </div>
            <button onClick={downloadCsvTemplate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              <Icon name="download" size={13} /> CSV Template
            </button>
          </div>

          {/* Drop zone */}
          {!summary && (
            <FileUploader
              accept=".csv"
              multiple={false}
              onUpload={(files) => { if (files[0]) setFile(files[0]); }}
              uploadingFiles={file ? [{ id: '1', name: file.name, size: file.size, progress: uploading ? 60 : 100, status: uploading ? 'uploading' : 'completed' }] : []}
              onRemoveFile={() => setFile(null)}
            />
          )}

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '14px 18px', fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}

          {/* Upload success */}
          {summary && (
            <div style={{ background: summary.inserted > 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${summary.inserted > 0 ? '#a7f3d0' : '#fecaca'}`, borderRadius: 9, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Icon name={summary.inserted > 0 ? 'checkCircle' : 'alertCircle'} size={24} color={summary.inserted > 0 ? '#059669' : '#dc2626'} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: summary.inserted > 0 ? '#047857' : '#991b1b' }}>
                    {summary.inserted} of {summary.total} client{summary.total !== 1 ? 's' : ''} imported
                  </div>
                  {summary.skipped > 0 && (
                    <div style={{ fontSize: 12, color: '#065f46', marginTop: 2 }}>{summary.skipped} row{summary.skipped !== 1 ? 's' : ''} skipped</div>
                  )}
                </div>
                {summary.inserted > 0 && (
                  <Link to="/customers" style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 9, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
                    View List
                  </Link>
                )}
              </div>
              {summary.errors.length > 0 && (
                <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 12, color: '#7f1d1d' }}>
                  {summary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Column mapping guide */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Required Columns
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {[
                ['company_name', 'Company or client name', true],
                ['email', 'Primary contact email', true],
                ['phone', 'Phone number', false],
                ['country', 'Country code (e.g. TZ)', false],
                ['address', 'Physical address', false],
                ['currency', 'Billing currency (e.g. TZS)', false],
              ].map(([col, desc, req], i) => (
                <div key={col as string} style={{
                  padding: '11px 20px',
                  borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <code style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 4 }}>{col as string}</code>
                    {req && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>required</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{desc as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {file && !summary && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFile(null)}
                disabled={uploading}
                style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={uploading}
                style={{ padding: 'var(--ds-btn-py) 22px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: uploading ? 0.7 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
              >
                <Icon name="upload" size={14} /> {uploading ? 'Uploading…' : 'Upload & Import'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
