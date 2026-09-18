import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { FileUploader } from '../components/ui/file-uploader.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

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
  const isMobile = useIsMobile();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const json = await apiFetch('/v1/customers/bulk-import', { method: 'POST', body: form });
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
      <div style={{ flexShrink: 0 }}>
        <Link
          to="/customers/overview"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', marginBottom: 10 }}
        >
          <Icon name="chevronLeft" size={13} /> Back
        </Link>
        <PageHeader crumbs={['CRM', 'Bulk upload']} titlePlain="Bulk" titleEm="upload" subtitle="Import multiple clients at once using a CSV file." />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 32 }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Template download — row on desktop; the icon+copy and the
              button stack on mobile instead of squeezing into a sliver
              between a fixed-width icon and a fixed-width button, which used
              to wrap the description into an unreadably narrow column. */}
          <SectionCard padded={false}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: isMobile ? '100%' : 'auto' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="file" size={18} color="var(--green)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Download Template</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Use our template to ensure your data is formatted correctly</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate} style={{ width: isMobile ? '100%' : 'auto', flexShrink: 0 }}>
                <Icon name="download" size={13} /> CSV Template
              </Button>
            </div>
          </SectionCard>

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

          {error && <Banner variant="error">{error}</Banner>}

          {/* Upload success */}
          {summary && (
            <div style={{ background: summary.inserted > 0 ? 'var(--green-l)' : 'var(--red-l)', border: `1px solid ${summary.inserted > 0 ? 'var(--green)' : 'var(--red)'}`, borderRadius: 'var(--r)', padding: isMobile ? 16 : '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 14, flexWrap: 'wrap' }}>
                <Icon name={summary.inserted > 0 ? 'checkCircle' : 'alertCircle'} size={24} color={summary.inserted > 0 ? 'var(--green)' : 'var(--red)'} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: summary.inserted > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {summary.inserted} of {summary.total} client{summary.total !== 1 ? 's' : ''} imported
                  </div>
                  {summary.skipped > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>{summary.skipped} row{summary.skipped !== 1 ? 's' : ''} skipped</div>
                  )}
                </div>
                {summary.inserted > 0 && (
                  <Button asChild size="sm" style={{ marginLeft: isMobile ? 0 : 'auto', width: isMobile ? '100%' : 'auto' }}>
                    <Link to="/customers">View List</Link>
                  </Button>
                )}
              </div>
              {summary.errors.length > 0 && (
                <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--red)' }}>
                  {summary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Column mapping guide */}
          <SectionCard title="Required Columns" padded={false}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>
              {(() => {
                const cols: [string, string, boolean][] = [
                  ['company_name', 'Company or client name', true],
                  ['email', 'Primary contact email', true],
                  ['phone', 'Phone number', false],
                  ['country', 'Country code (e.g. TZ)', false],
                  ['address', 'Physical address', false],
                  ['currency', 'Billing currency (e.g. TZS)', false],
                ];
                return cols.map(([col, desc, req], i) => (
                <div key={col} style={{
                  padding: '11px 20px',
                  borderBottom: (isMobile ? i < cols.length - 1 : i < 4) ? '1px solid var(--border)' : 'none',
                  borderRight: (!isMobile && i % 2 === 0) ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <code style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>{col}</code>
                    {req && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>required</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{desc}</div>
                </div>
                ));
              })()}
            </div>
          </SectionCard>

          {/* Action buttons */}
          {file && !summary && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button
                variant="outline"
                size="default"
                onClick={() => setFile(null)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                size="default"
                onClick={handleImport}
                disabled={uploading}
              >
                <Icon name="upload" size={14} /> {uploading ? 'Uploading…' : 'Upload & Import'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
