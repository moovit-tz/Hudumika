import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';

export const CustomerBulkUpload: React.FC = () => {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.name.endsWith('.xlsx'))) setFile(f);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = '';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/customers/overview')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon name="chevronLeft" size={13} /> Back
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Bulk Upload Clients</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Import multiple clients at once using a CSV or Excel file</div>
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
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="download" size={13} /> CSV Template
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="download" size={13} /> Excel Template
            </button>
          </div>

          {/* Drop zone */}
          {!uploaded && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                background: dragOver ? 'var(--teal-l)' : 'var(--white)',
                borderRadius: 9, border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border)'}`,
                padding: '48px 32px', cursor: 'pointer', textAlign: 'center',
                transition: 'background .15s, border-color .15s',
              }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="upload" size={24} color="var(--teal)" />
              </div>
              {file ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Drag &amp; drop your file here</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>or click to browse — CSV or Excel (.xlsx) only</div>
                  <span style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600 }}>
                    Choose File
                  </span>
                </>
              )}
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}

          {/* Upload success */}
          {uploaded && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <Icon name="checkCircle" size={24} color="#16a34a" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>Upload successful!</div>
                <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>50 clients imported. You can view them in the Customer List.</div>
              </div>
              <button onClick={() => navigate('/customers')} style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                View List
              </button>
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
          {file && !uploaded && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setFile(null)}
                style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => setUploaded(true)}
                style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <Icon name="upload" size={14} /> Upload &amp; Import
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
