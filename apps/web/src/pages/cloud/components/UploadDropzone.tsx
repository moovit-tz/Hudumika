import React from 'react';
import { FileUploader } from '../../../components/ui/file-uploader.js';
import { useCloud } from '../../../shells/cloud-context.js';

/**
 * Wraps the platform's own FileUploader for real drag/drop + click-to-browse
 * mechanics, now fed by cloud-context.tsx's XMLHttpRequest-based uploadFiles/
 * uploadFolder — real per-file byte progress (upload.onprogress), not a
 * fabricated number. FileUploader's uploadingFiles/onRemoveFile props were
 * built for exactly this and previously went unused because no real
 * progress existed yet to feed them honestly.
 */
export function UploadDropzone({ onUpload }: { onUpload: (files: File[]) => Promise<void> }) {
  const { uploadingFiles, removeUploadingFile } = useCloud();

  async function handleUpload(files: File[]) {
    if (!files.length) return;
    await onUpload(files);
  }

  return (
    <FileUploader onUpload={handleUpload} uploadingFiles={uploadingFiles} onRemoveFile={removeUploadingFile} />
  );
}
