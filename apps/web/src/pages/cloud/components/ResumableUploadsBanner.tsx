import React, { useRef } from 'react';
import { Icon } from '../../../components/Icon.js';
import { Button } from '../../../components/ui/button.js';
import { useCloud, type ResumableUpload } from '../../../shells/cloud-context.js';
import { fmtSize } from '../lib/format.js';

/**
 * Uploads left incomplete by a page reload or crash — confirmed with the server as still open
 * (cloud-context.tsx re-checks each one on mount, so a finished or expired session never shows
 * here). The browser can't hand back the original File after a reload, so resuming still needs the
 * person to pick the same file again; only the chunks that never arrived are re-sent.
 */
export function ResumableUploadsBanner() {
  const { resumableUploads, resumeUpload, discardResumableUpload } = useCloud();
  if (resumableUploads.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {resumableUploads.map(u => <ResumableRow key={u.uploadId} upload={u} onResume={resumeUpload} onDiscard={discardResumableUpload} />)}
    </div>
  );
}

function ResumableRow({ upload, onResume, onDiscard }: {
  upload: ResumableUpload; onResume: (u: ResumableUpload, file: File) => Promise<void>; onDiscard: (id: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--gold-l, #fff8e1)', border: '1px solid var(--gold, #f59e0b)' }}>
      <Icon name="upload" size={18} color="var(--gold, #f59e0b)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Interrupted upload: {upload.name}</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmtSize(upload.size)} — select the same file to continue where it left off.</div>
      </div>
      <input
        ref={inputRef} type="file" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) void onResume(upload, f); e.target.value = ''; }}
      />
      <Button size="sm" onClick={() => inputRef.current?.click()}>Select file to resume</Button>
      <Button size="sm" variant="ghost" onClick={() => void onDiscard(upload.uploadId)}>Discard</Button>
    </div>
  );
}
